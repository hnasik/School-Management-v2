// settle-due.js — Settle with entered amount (validated) + settlement history
// Updated to be academic-year based (smsAcademicYear) + user-specific.
// Tracks "Total Paid Admission Amount" per academic year.
// Now also supports student-specific payment history.

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCOzfdIXBeh6drFhml4pOFEvPG8xV_Wjzw",
  authDomain: "school-management-projec-9db7a.firebaseapp.com",
  projectId: "school-management-projec-9db7a",
  storageBucket: "school-management-projec-9db7a.firebasestorage.app",
  messagingSenderId: "975842483778",
  appId: "1:975842483778:web:d1708792ff56014f3317db",
  measurementId: "G-1X2Q7LE6G3"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;

// --- Academic year helper (same key as other pages) ---
const ACADEMIC_YEAR_STORAGE_KEY = "smsAcademicYear";
function getSelectedAcademicYear() {
  let stored = localStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY);
  if (!stored) {
    const currentYear = new Date().getFullYear();
    stored = String(currentYear);
    localStorage.setItem(ACADEMIC_YEAR_STORAGE_KEY, stored);
  }
  return String(stored);
}

// DOM Elements
const classGrid = document.getElementById("classGrid");
const classModal = document.getElementById("classModal");
const closeClassModal = document.getElementById("closeClassModal");
const classModalTitle = document.getElementById("classModalTitle");
const classModalSub = document.getElementById("classModalSub");
const dueListContainer = document.getElementById("dueListContainer");
const modalNoResults = document.getElementById("modalNoResults");

let currentClass = null;
let lastLoadedStudents = []; // cache of displayed students (DocumentSnapshots)

// helper
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderClassCards() {
  if (!classGrid) return;
  classGrid.innerHTML = "";
  for (let i = 1; i <= 12; i++) {
    const card = document.createElement("div");
    card.className = "class-card";
    card.dataset.class = String(i);
    card.innerHTML =
      `<div class="num">Class ${i}</div>` +
      `<div class="label">Students with dueAdmissionFee</div>`;
    card.addEventListener("click", () => openClassModal(String(i)));
    classGrid.appendChild(card);
  }
}

// --- helper for total paid admission amount doc ---
function getAdmissionTotalDocRef(ownerId, academicYear) {
  const docId = `${ownerId}_${academicYear}_admission`;
  return db.collection("admissionTotals").doc(docId);
}

// --- Student-specific settlement history view ---
async function showStudentSettlementHistory(studentId, studentName) {
  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in to see student history.");
    return;
  }

  classModalTitle.textContent = `Settlement History — ${studentName}`;
  classModalSub.textContent = "Loading student settlement history...";
  dueListContainer.innerHTML = "";
  if (modalNoResults) modalNoResults.style.display = "none";

  try {
    // orderBy then filter in JS (avoid composite index requirement)
    const snap = await db
      .collection("settlementHistory")
      .orderBy("settledAt", "desc")
      .limit(300)
      .get();

    const docs = snap.docs.filter((doc) => {
      const d = doc.data();
      return (
        (d.ownerId || null) === user.uid &&
        (d.studentId || null) === studentId
      );
    });

    if (!docs.length) {
      const msg = "No settlement history found for this student.";
      classModalSub.textContent = msg;
      if (modalNoResults) {
        modalNoResults.innerHTML =
          `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(msg)}`;
        modalNoResults.style.display = "block";
      }
      // back button
      const backWrap = document.createElement("div");
      backWrap.style.marginTop = "10px";
      backWrap.innerHTML =
        `<button class="btn btn-primary" id="student-history-back">Back</button>`;
      dueListContainer.appendChild(backWrap);
      document
        .getElementById("student-history-back")
        .addEventListener("click", () => {
          // go back to class list from cache
          if (currentClass) {
            classModalTitle.textContent = `Class ${currentClass} — Due Admission Fee`;
          }
          renderStudentListFromCache();
        });
      return;
    }

    classModalSub.textContent = `Showing ${docs.length} settlements for this student`;
    dueListContainer.innerHTML = "";

    docs.forEach((doc, idx) => {
      const d = doc.data();
      const settledAt = d.settledAt ? d.settledAt.toDate() : null;
      const timeStr = settledAt ? settledAt.toLocaleString() : "—";

      const div = document.createElement("div");
      div.className = "student-card";
      div.style.background = "#fff";
      div.innerHTML = `
        <div>
          <div style="font-weight:700">
            Payment #${idx + 1}
          </div>
          <div class="txt-muted" style="font-size:.9rem">
            Settled: ?${escapeHtml(String(d.amountSettled || "0"))}
            (Prev: ?${escapeHtml(String(d.previousDue || "0"))}
             ? New: ?${escapeHtml(String(d.newDue || "0"))})
          </div>
          <div class="txt-muted" style="font-size:.85rem">
            By: ${escapeHtml(d.settledByEmail || d.settledBy || "")}
            · ${escapeHtml(timeStr)}
          </div>
        </div>
      `;
      dueListContainer.appendChild(div);
    });

    const backBtn = document.createElement("div");
    backBtn.style.marginTop = "10px";
    backBtn.innerHTML =
      `<button class="btn btn-primary" id="student-history-back">Back</button>`;
    dueListContainer.appendChild(backBtn);

    document
      .getElementById("student-history-back")
      .addEventListener("click", () => {
        if (currentClass) {
          classModalTitle.textContent = `Class ${currentClass} — Due Admission Fee`;
        }
        renderStudentListFromCache();
      });
  } catch (err) {
    console.error("Error loading student history", err);
    classModalSub.textContent = "Failed to load student history (see console).";
    if (modalNoResults) {
      modalNoResults.innerHTML =
        `<i class="fas fa-exclamation-circle"></i> Failed to load student history.`;
      modalNoResults.style.display = "block";
    }
  }
}

// --- All settlement history view (inside modal) ---
async function showSettlementHistory() {
  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in to see settlement history.");
    return;
  }

  const academicYear = getSelectedAcademicYear();

  classModalTitle.textContent = "Settlement History";
  classModalSub.textContent = `Loading settlement history...`;
  dueListContainer.innerHTML = "";
  if (modalNoResults) modalNoResults.style.display = "none";

  try {
    // Only orderBy, then filter by ownerId in JS (no composite index needed)
    const snap = await db
      .collection("settlementHistory")
      .orderBy("settledAt", "desc")
      .limit(500)
      .get();

    const ownerDocs = snap.docs.filter(
      (doc) => (doc.data().ownerId || null) === user.uid
    );

    if (!ownerDocs || ownerDocs.length === 0) {
      const msg = "No settlement history found.";
      classModalSub.textContent = msg;
      if (modalNoResults) {
        modalNoResults.innerHTML =
          `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(msg)}`;
        modalNoResults.style.display = "block";
      }
      return;
    }

    classModalSub.textContent = `Showing ${ownerDocs.length} recent settlements`;
    dueListContainer.innerHTML = "";

    // --- Show Total Paid Admission Amount (per academic year) at top ---
    try {
      const totalRef = getAdmissionTotalDocRef(user.uid, academicYear);
      const totalSnap = await totalRef.get();
      if (totalSnap.exists) {
        const td = totalSnap.data();
        const totalAmount = Number(td.totalPaidAdmissionAmount || 0);
        const updatedAt = td.updatedAt ? td.updatedAt.toDate() : null;
        const updatedStr = updatedAt ? updatedAt.toLocaleString() : "—";

        const totalDiv = document.createElement("div");
        totalDiv.className = "notification notification-success";
        totalDiv.style.marginBottom = "1rem";
        totalDiv.innerHTML = `
          <i class="fas fa-coins"></i>
          <div>
            <div style="font-weight:600">
              Total Paid Admission Amount (${escapeHtml(academicYear)})
            </div>
            <div style="font-size:.9rem">
              ?${escapeHtml(totalAmount.toFixed(2))} · Last updated: ${escapeHtml(
          updatedStr
        )}
            </div>
          </div>
        `;
        dueListContainer.appendChild(totalDiv);
      }
    } catch (totalErr) {
      console.error("Error loading admission total", totalErr);
      // Not fatal; just skip the card.
    }

    // --- List individual settlement records ---
    ownerDocs.forEach((doc, idx) => {
      const d = doc.data();
      const settledAt = d.settledAt ? d.settledAt.toDate() : null;
      const timeStr = settledAt ? settledAt.toLocaleString() : "—";

      const div = document.createElement("div");
      div.className = "student-card";
      div.style.background = "#fff";
      div.innerHTML = `
        <div>
          <div style="font-weight:700">
            ${escapeHtml(d.studentName || "Unnamed")}
          </div>
          <div class="txt-muted" style="font-size:.9rem">
            Class: ${escapeHtml(String(d.studentClass || "—"))}
            &nbsp; | &nbsp;
            Settled: ?${escapeHtml(String(d.amountSettled || "0"))}
            (Prev: ?${escapeHtml(String(d.previousDue || "0"))}
             ? New: ?${escapeHtml(String(d.newDue || "0"))})
          </div>
          <div class="txt-muted" style="font-size:.85rem">
            By: ${escapeHtml(d.settledByEmail || d.settledBy || "")}
            · ${escapeHtml(timeStr)}
          </div>
        </div>
        <div style="color:#6b7280">#${idx + 1}</div>
      `;
      dueListContainer.appendChild(div);
    });

    // Back button
    const backBtn = document.createElement("div");
    backBtn.style.marginTop = "10px";
    backBtn.innerHTML =
      `<button class="btn btn-primary" id="settle-history-back">Back</button>`;
    dueListContainer.appendChild(backBtn);

    document
      .getElementById("settle-history-back")
      .addEventListener("click", () => {
        if (currentClass) {
          openClassModal(currentClass);
        } else {
          classModal.classList.remove("show");
          dueListContainer.innerHTML = "";
          if (modalNoResults) modalNoResults.style.display = "none";
        }
      });
  } catch (err) {
    console.error("Error loading settlement history", err);
    classModalSub.textContent = "Failed to load history (see console).";
    if (modalNoResults) {
      modalNoResults.innerHTML =
        `<i class="fas fa-exclamation-circle"></i> Failed to load settlement history.`;
      modalNoResults.style.display = "block";
    }
  }
}

// --- Perform settlement of an entered amount for a student (DocumentSnapshot) ---
async function settleStudentAmount(studentDoc, amount) {
  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in to perform settlement.");
    return;
  }

  const studentId = studentDoc.id;
  const data = studentDoc.data();
  const previousDue = Number(data.dueFee || 0);
  const studentName = data.name || data.studentName || "Unnamed";
  const studentClass =
    data.studentClass || data.class || data.student_class || currentClass || "—";
  const academicYearFromStudent = data.academicYear || getSelectedAcademicYear();

  // validation
  if (isNaN(amount) || amount <= 0) {
    alert("Please enter a valid positive amount.");
    return;
  }
  if (amount > previousDue) {
    alert(
      `Entered amount (?${amount}) is greater than due amount (?${previousDue}). Please enter = ?${previousDue}.`
    );
    return;
  }

  const newDue = Number((previousDue - amount).toFixed(2)); // keep 2 decimal

  if (
    !confirm(
      `Settle ?${amount} for ${studentName} (Class ${studentClass}, ${academicYearFromStudent})?`
    )
  )
    return;

  try {
    const studentRef = db.collection("students").doc(studentId);
    const historyRef = db.collection("settlementHistory").doc();

    const ownerIdForDoc = data.ownerId || user.uid;
    const academicYearStr = String(academicYearFromStudent);
    const totalRef = getAdmissionTotalDocRef(ownerIdForDoc, academicYearStr);

    // use batch
    const batch = db.batch();

    // 1) History doc -> single payment record
    batch.set(historyRef, {
      studentId,
      studentName,
      studentClass: String(studentClass),
      previousDue,
      amountSettled: amount,
      newDue,
      settledBy: user.uid,
      settledByEmail: user.email || null,
      ownerId: ownerIdForDoc,
      academicYear: academicYearStr,
      settledAt: FieldValue.serverTimestamp(),
      note: "Settled via Settle Due page (entered amount)"
    });

    // 2) Update student's due
    batch.update(studentRef, { dueFee: newDue });

    // 3) Update "Total Paid Admission Amount" doc for this academic year
    batch.set(
      totalRef,
      {
        ownerId: ownerIdForDoc,
        academicYear: academicYearStr,
        totalPaidAdmissionAmount: FieldValue.increment(amount),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await batch.commit();

    // update local cache and UI
    lastLoadedStudents = lastLoadedStudents.map((s) => {
      if (s.id === studentId) {
        const oldData = typeof s.data === "function" ? s.data() : s._rawData || {};
        const newData = Object.assign({}, oldData, { dueFee: newDue });
        return { id: s.id, data: () => newData, _rawData: newData };
      }
      return s;
    });

    // Remove student if due becomes 0 (so list only shows students with due > 0)
    if (newDue <= 0) {
      lastLoadedStudents = lastLoadedStudents.filter((s) => s.id !== studentId);
    }

    renderStudentListFromCache();
    alert(`Settled ?${amount} for ${studentName}. New due: ?${newDue}`);
  } catch (err) {
    console.error("Error performing settlement", err);
    alert("Failed to settle due (see console).");
  }
}

// --- Render list of students with due for a class ---
function renderStudentListFromCache() {
  dueListContainer.innerHTML = "";
  if (!lastLoadedStudents || lastLoadedStudents.length === 0) {
    classModalSub.textContent = "No due students found.";
    if (modalNoResults) {
      modalNoResults.innerHTML =
        `<i class="fas fa-exclamation-circle"></i> No due students found for this class.`;
      modalNoResults.style.display = "block";
    }
    return;
  }
  classModalSub.textContent = `${lastLoadedStudents.length} student(s) found`;
  if (modalNoResults) modalNoResults.style.display = "none";

  lastLoadedStudents.forEach((sdoc) => {
    const data =
      typeof sdoc.data === "function" ? sdoc.data() : sdoc._rawData || {};
    const studentName = data.name || data.studentName || "Unnamed";
    const studentClass =
      data.studentClass || data.class || data.student_class || currentClass;
    const due = Number(data.dueFee || 0);

    const div = document.createElement("div");
    div.className = "student-card";
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.alignItems = "center";
    div.innerHTML = `
      <div style="flex:1">
        <div class="student-name">${escapeHtml(studentName)}</div>
        <div class="txt-muted" style="font-size:.9rem">
          Class: ${escapeHtml(String(studentClass))} |
          Due: ?${escapeHtml(String(due))}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;margin-left:12px">
        <input
          type="number"
          min="0"
          step="0.01"
          class="settle-amount-input"
          data-id="${sdoc.id}"
          placeholder="Enter amount"
          style="padding:6px;border-radius:8px;border:1px solid #e6eefc;width:130px;text-align:right"
        />
        <button class="btn btn-primary settle-btn" data-id="${sdoc.id}">Settle</button>
        <button class="btn history-btn" data-id="${sdoc.id}" style="margin-top:4px;">History</button>
      </div>
    `;
    dueListContainer.appendChild(div);
  });

  // Attach handlers to settle buttons
  const settleButtons = dueListContainer.querySelectorAll(".settle-btn");
  settleButtons.forEach((btn) => {
    const id = btn.dataset.id;
    btn.addEventListener("click", async () => {
      const input = dueListContainer.querySelector(
        `.settle-amount-input[data-id="${id}"]`
      );
      if (!input) {
        alert("Amount input not found.");
        return;
      }
      const raw = input.value.trim();
      if (raw === "") {
        alert("Please enter an amount to settle.");
        return;
      }
      const amt = Number(raw);
      if (isNaN(amt) || amt <= 0) {
        alert("Enter a valid amount greater than 0.");
        return;
      }

      const sdoc = lastLoadedStudents.find((s) => s.id === id);
      if (!sdoc) {
        alert("Student not found in current list. Refresh and try again.");
        return;
      }

      const sdata =
        typeof sdoc.data === "function" ? sdoc.data() : sdoc._rawData || {};
      const due = Number(sdata.dueFee || 0);
      if (amt > due) {
        alert(
          `Entered amount (?${amt}) is greater than due amount (?${due}). Please enter = ?${due}.`
        );
        return;
      }

      await settleStudentAmount(sdoc, amt);
    });
  });

  // Attach handlers to student history buttons
  const historyButtons = dueListContainer.querySelectorAll(".history-btn");
  historyButtons.forEach((btn) => {
    const id = btn.dataset.id;
    btn.addEventListener("click", () => {
      const sdoc = lastLoadedStudents.find((s) => s.id === id);
      if (!sdoc) {
        alert("Student not found in current list. Refresh and try again.");
        return;
      }
      const data =
        typeof sdoc.data === "function" ? sdoc.data() : sdoc._rawData || {};
      const studentName = data.name || data.studentName || "Unnamed";
      showStudentSettlementHistory(id, studentName);
    });
  });

  // "See settlement history" button (all students)
  const histWrap = document.createElement("div");
  histWrap.style.marginTop = "12px";
  histWrap.innerHTML =
    `<button class="btn" id="see-settlement-history">See settlement history</button>`;
  dueListContainer.appendChild(histWrap);
  document
    .getElementById("see-settlement-history")
    .addEventListener("click", showSettlementHistory);
}

// --- Load students for selected class with dueFee > 0 (academic-year based) ---
async function openClassModal(cls) {
  currentClass = cls;
  classModalTitle.textContent = `Class ${cls} — dueFee`;
  classModalSub.textContent = "Loading...";
  dueListContainer.innerHTML = "";
  if (modalNoResults) modalNoResults.style.display = "none";
  classModal.classList.add("show");

  const user = auth.currentUser;
  if (!user) {
    classModalSub.textContent = "Please login first.";
    if (modalNoResults) {
      modalNoResults.innerHTML =
        `<i class="fas fa-exclamation-circle"></i> Please login first.`;
      modalNoResults.style.display = "block";
    }
    return;
  }

  const academicYear = getSelectedAcademicYear();

  try {
    const snap = await db
      .collection("students")
      .where("ownerId", "==", user.uid)
      .where("academicYear", "==", academicYear)
      .where("studentClass", "==", String(cls))
      .limit(500)
      .get();

    if (!snap || snap.empty) {
      const msg = `No students found for Class ${cls} in ${academicYear}.`;
      classModalSub.textContent = msg;
      if (modalNoResults) {
        modalNoResults.innerHTML =
          `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(msg)}`;
        modalNoResults.style.display = "block";
      }
      lastLoadedStudents = [];
      return;
    }

    const withDue = [];
    snap.docs.forEach((doc) => {
      const d = doc.data();
      const due = Number(d.dueFee || 0);
      if (due && due > 0) withDue.push(doc);
    });

    if (withDue.length === 0) {
      const msg = `No students with dueAdmissionFee found for Class ${cls} in ${academicYear}.`;
      classModalSub.textContent = msg;
      if (modalNoResults) {
        modalNoResults.innerHTML =
          `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(msg)}`;
        modalNoResults.style.display = "block";
      }
      lastLoadedStudents = [];
      return;
    }

    lastLoadedStudents = withDue;
    renderStudentListFromCache();
  } catch (err) {
    console.error("Error loading students", err);
    classModalSub.textContent = "Failed to load students (see console).";
    if (modalNoResults) {
      modalNoResults.innerHTML =
        `<i class="fas fa-exclamation-circle"></i> Failed to load students.`;
      modalNoResults.style.display = "block";
    }
  }
}

// --- Close modal ---
if (closeClassModal) {
  closeClassModal.addEventListener("click", () => {
    classModal.classList.remove("show");
    dueListContainer.innerHTML = "";
    if (modalNoResults) modalNoResults.style.display = "none";
    currentClass = null;
    lastLoadedStudents = [];
  });
}

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  renderClassCards();
  auth.onAuthStateChanged((user) => {
    if (!user) {
      console.log(
        "Not signed-in: page rendered but login required to fetch data."
      );
    } else {
      console.log("Signed in:", user.email, user.uid);
    }
  });
});
