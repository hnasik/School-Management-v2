// book-delivery-report.js (updated, user + academic year specific)
// - qty prompt removed (qty = 1 by default)
// - bookName saved and shown next to Not Delivered button as editable/removable label
// - student doc receives lastBookName and lastBookEntryId so UI persists
// - All student queries are scoped by ownerId + academicYear (smsAcademicYear)
// - Class cards rendered only after sign-in is ready

// --- Firebase init (same config as other pages) ---
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

// Shared academic year key (same as other pages: dashboard, teacher, etc.)
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

// UI refs
const classGrid = document.getElementById("classGrid");
const classModal = document.getElementById("classModal");
const closeClassModal = document.getElementById("closeClassModal");
const classModalTitle = document.getElementById("classModalTitle");
const classModalSub = document.getElementById("classModalSub");
const classModalTableBody = document.getElementById("classModalTableBody");

let currentClass = null;
let currentStudents = []; // array of {id, data}

// --- Build class cards 1..12 ---
function renderClassCards() {
  if (!classGrid) return;
  classGrid.innerHTML = "";
  for (let i = 1; i <= 12; i++) {
    const card = document.createElement("div");
    card.className = "class-card";
    card.dataset.class = String(i);
    card.innerHTML = `<div class="num">Class ${i}</div><div class="label">View students & manage delivery</div>`;
    card.addEventListener("click", () => openClassModal(String(i)));
    classGrid.appendChild(card);
  }
}

// Helper: check if a student document matches the requested class
// (kept from old version, even though new openClassModal does not depend on it)
function matchesClass(data, cls) {
  if (!data) return false;
  const clsStr = String(cls);
  const clsNum = Number(cls);

  const candidates = ["studentClass", "student_class", "class", "Class", "cls"];

  for (const f of candidates) {
    if (Object.prototype.hasOwnProperty.call(data, f)) {
      const v = data[f];
      if (v === undefined || v === null) continue;
      if (String(v) === clsStr) return true;
      if (!isNaN(Number(v)) && Number(v) === clsNum) return true;
    }
  }

  if (
    data.student &&
    (String(data.student) === clsStr || Number(data.student) === clsNum)
  )
    return true;

  return false;
}

// --- Simple & fast openClassModal: only studentClass / class fields, owner + academicYear ---
async function openClassModal(cls) {
  if (!classModalTitle || !classModalSub || !classModalTableBody) return;

  currentClass = cls;
  classModalTitle.textContent = `Class ${cls} Students`;
  classModalSub.textContent = `Loading students for class ${cls}...`;
  classModalTableBody.innerHTML = "";
  classModal.classList.add("show");

  try {
    const user = auth.currentUser;
    if (!user) {
      classModalSub.textContent = "Sign-in required to load students.";
      console.warn("openClassModal: no signed-in user.");
      return;
    }

    const academicYear = getSelectedAcademicYear();

    // Try at most these two fields: studentClass then class
    const attempts = [
      { field: "studentClass", label: "studentClass" },
      { field: "class", label: "class" }
    ];

    let foundDocs = [];
    let usedField = "";

    for (const attempt of attempts) {
      const fieldName = attempt.field;

      let query = db
        .collection("students")
        .where("ownerId", "==", user.uid)
        .where("academicYear", "==", academicYear)
        .where(fieldName, "==", String(cls));

      let snap;
      try {
        // Try pretty sorting by roll
        snap = await query.orderBy("roll").get();
      } catch (err) {
        console.warn(
          `book-delivery-report: orderBy(roll) failed for field ${fieldName}, trying without orderBy.`
        );
        snap = await query.get();
      }

      if (!snap.empty) {
        foundDocs = snap.docs;
        usedField = fieldName;
        break; // stop after first success
      }
    }

    if (foundDocs.length === 0) {
      classModalSub.textContent = `No students found for class ${cls} for this owner & academic year.`;
      console.log(
        "openClassModal: no students found for class",
        cls,
        "with fields studentClass / class."
      );
      return;
    }

    currentStudents = [];
    let idx = 0;
    foundDocs.forEach((doc) => {
      idx++;
      const data = doc.data();
      currentStudents.push({ id: doc.id, data });
      appendStudentRow(idx, doc.id, data);
    });

    classModalSub.textContent = `Found ${currentStudents.length} student(s) for class ${cls}.`;
    console.log(
      `openClassModal: loaded ${currentStudents.length} students for class ${cls} using field "${usedField}".`
    );
  } catch (err) {
    console.error("openClassModal unexpected error:", err);
    classModalSub.textContent = "Error loading students. See console.";
  }
}

// Append one student row to modal table
function appendStudentRow(index, docId, data) {
  const tr = document.createElement("tr");

  // delivered state from student's doc (bookDelivered boolean)
  const delivered = !!data.bookDelivered;
  const lastBook = data.lastBookName || data.lastBook || ""; // prefer lastBookName
  const hasLastBook = Boolean(lastBook && String(lastBook).trim().length > 0);

  // buttons: Add Book, Delivered, Not Delivered
  const addBtn = `<button class="action-btn btn-add" data-id="${docId}" data-action="add">Add Book</button>`;
  const deliveredBtn = `<button class="action-btn btn-delivered" ${
    delivered ? "disabled" : ""
  } data-id="${docId}" data-action="delivered">Delivered</button>`;
  const notdelBtn = `<button class="action-btn btn-notdel" data-id="${docId}" data-action="notdel">Not Delivered</button>`;

  // book label area (shown after notdel button). includes remove button if present.
  const bookLabelHtml = hasLastBook
    ? `<span class="book-label" style="margin-left:8px; display:inline-flex; align-items:center; gap:6px;">
         <span style="background:#eef2ff;padding:6px 8px;border-radius:8px;font-weight:600;">${escapeHtml(
           lastBook
         )}</span>
         <button class="action-btn" data-id="${docId}" data-action="remove-book" title="Remove book label" style="background:#fde68a;color:#92400e;padding:4px 6px;border-radius:6px;">Remove</button>
       </span>`
    : "";

  tr.innerHTML = `
    <td>${index}</td>
    <td>${escapeHtml(data.name || "-")}</td>
    <td>${escapeHtml(data.roll || "")}</td>
    <td style="display:flex; gap:6px; align-items:center;">${addBtn} ${deliveredBtn} ${notdelBtn} ${bookLabelHtml}</td>
  `;

  // attach listener for actions (handles add, delivered, notdel, remove-book)
  tr.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === "add") handleAddBook(id);
    if (action === "delivered") handleMarkDelivered(id, btn);
    if (action === "notdel") handleMarkNotDelivered(id);
    if (action === "remove-book") handleRemoveBook(id);
  });

  classModalTableBody.appendChild(tr);
}

// Add Book handler — prompt for book name and save to Firestore collection 'bookDeliveryReports'
// qty is fixed to 1 (no prompt)
async function handleAddBook(studentId) {
  const stu = currentStudents.find((s) => s.id === studentId);
  const studentName = stu ? stu.data.name : "";

  // prompt only for book name
  const bookName = prompt(`Enter book name for ${studentName || "student"}:`);
  if (!bookName || !String(bookName).trim()) return;

  const qty = 1; // fixed

  // Default to Delivered? Ask user via confirmation
  const status = confirm(
    "Set status to Delivered? (OK = Delivered, Cancel = Pending)"
  )
    ? "Delivered"
    : "Pending";

  const rowData = {
    date: new Date().toISOString().split("T")[0],
    class: currentClass,
    studentId,
    name: studentName,
    book: bookName,
    qty,
    status,
    remarks: ""
  };

  try {
    // save report first
    const docRef = await db.collection("bookDeliveryReports").add({
      ...rowData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // update student document with lastBookName & lastBookEntryId so it shows in UI
    await db
      .collection("students")
      .doc(studentId)
      .update({
        lastBookName: String(bookName),
        lastBookEntryId: docRef.id
      });

    alert("Book entry saved.");

    if (status === "Delivered") {
      await db
        .collection("students")
        .doc(studentId)
        .update({ bookDelivered: true });
    }

    // refresh to show label in UI and delivered state change
    refreshClassModal();
  } catch (err) {
    console.error("Failed to save book entry", err);
    alert("Failed to save book entry (see console).");
  }
}

// Remove book label (clears lastBookName & lastBookEntryId on student doc)
// Does not delete the bookDeliveryReports entry (keeps history)
async function handleRemoveBook(studentId) {
  if (!confirm("Remove the last book label for this student?")) return;
  try {
    await db
      .collection("students")
      .doc(studentId)
      .update({
        lastBookName: firebase.firestore.FieldValue.delete(),
        lastBookEntryId: firebase.firestore.FieldValue.delete()
      });
    refreshClassModal();
  } catch (err) {
    console.error("Failed to remove lastBookName from student doc", err);
    alert("Failed to remove book label (see console).");
  }
}

// Mark Delivered — sets bookDelivered true on student doc and disables the delivered button
async function handleMarkDelivered(studentId, btnElement) {
  try {
    await db
      .collection("students")
      .doc(studentId)
      .update({ bookDelivered: true });
    if (btnElement) btnElement.disabled = true;
  } catch (err) {
    console.error("Failed to mark delivered:", err);
    alert("Failed to mark delivered (see console).");
  }
}

// Mark Not Delivered — sets bookDelivered false and refreshes the modal
async function handleMarkNotDelivered(studentId) {
  try {
    await db
      .collection("students")
      .doc(studentId)
      .update({ bookDelivered: false });
    refreshClassModal();
  } catch (err) {
    console.error("Failed to mark not delivered:", err);
    alert("Failed to mark not delivered (see console).");
  }
}

// Re-open or refresh the modal listing for current class (clears and reloads)
function refreshClassModal() {
  if (!currentClass) return;
  classModalTableBody.innerHTML = "";
  openClassModal(currentClass);
}

// Close modal
if (closeClassModal) {
  closeClassModal.addEventListener("click", () => {
    classModal.classList.remove("show");
    classModalTableBody.innerHTML = "";
    currentClass = null;
  });
}

// Escape helper
function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// --- On startup: wait for auth, then render class cards ---
document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      console.log("Not signed in — sign in to enable class student loading.");
      // Optional: redirect to login page:
      // window.location.href = "login.html";
    } else {
      console.log("Signed in:", user.email || user.uid);
      // Only build class cards after we know the user is signed in
      renderClassCards();
    }
  });
});
