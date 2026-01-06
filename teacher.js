// teacher.js - Teacher page logic
// Updated: Academic Year support + Class field + Date of Joining + Amount + Monthly Payment History

const appContainer = document.getElementById("app");
const logoutBtn = document.getElementById("logout-btn");
const pageWelcome = document.getElementById("page-welcome");

const teacherForm = document.getElementById("teacher-form");
const teachersTableBody = document.getElementById("teachers-table-body");
const teacherSearchInput = document.getElementById("teacher-search");
const teacherSearchBtn = document.getElementById("teacher-search-btn");

// Payment history section
const teacherPaymentSection = document.getElementById("teacher-payment-section");
const teacherPaymentInfo = document.getElementById("teacher-payment-info");
const teacherPaymentHistory = document.getElementById("teacher-payment-history");

// Academic year helpers
const ACADEMIC_YEAR_MIN = 2025;
const ACADEMIC_YEAR_MAX = 2040;
const ACADEMIC_YEAR_STORAGE_KEY = "smsAcademicYear";

function getDefaultAcademicYear() {
  const nowYear = new Date().getFullYear();
  if (nowYear < ACADEMIC_YEAR_MIN) return ACADEMIC_YEAR_MIN;
  if (nowYear > ACADEMIC_YEAR_MAX) return ACADEMIC_YEAR_MAX;
  return nowYear;
}

function getSelectedAcademicYear() {
  let year = parseInt(localStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY), 10);
  if (!year || year < ACADEMIC_YEAR_MIN || year > ACADEMIC_YEAR_MAX) {
    year = getDefaultAcademicYear();
    localStorage.setItem(ACADEMIC_YEAR_STORAGE_KEY, String(year));
  }
  return String(year);
}

const firebaseConfig = {
  apiKey: "AIzaSyCOzfdIXBeh6drFhml4pOFEvPG8xV_Wjzw",
  authDomain: "school-management-projec-9db7a.firebaseapp.com",
  projectId: "school-management-projec-9db7a",
  storageBucket: "school-management-projec-9db7a.firebasestorage.app",
  messagingSenderId: "975842483778",
  appId: "1:975842483778:web:d1708792ff56014f3317db",
  measurementId: "G-1X2Q7LE6G3"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged((user) => {
  if (user) {
    appContainer.classList.remove("hidden");
    if (pageWelcome) pageWelcome.textContent = "Welcome, " + (user.email || "Admin");
    loadTeachers(user); // pass user
  } else {
    window.location.href = "login.html";
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    auth.signOut().then(() => {
      window.location.href = "login.html";
    });
  });
}

/* --------- Small helpers for months ---------- */
function formatMonthYear(year, month) {
  const m = parseInt(month, 10);
  const names = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  if (isNaN(m) || m < 1 || m > 12) return `${year}-${month}`;
  return `${names[m]} ${year}`;
}

/**
 * Compute due months for a teacher:
 *   - Uses dateOfJoining (YYYY-MM-DD) if available, else falls back to createdMonthKey or current month.
 *   - Due months are: NEXT MONTH after that base month up to December (12).
 *   - So current month is NOT due, only next month ? Dec.
 */
function computeTeacherDueMonths(teacherData) {
  let base = teacherData.dateOfJoining || teacherData.createdMonthKey || null;

  if (!base || base.length < 7) {
    const now = new Date();
    base = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const y = parseInt(base.substring(0, 4), 10);
  const m = parseInt(base.substring(5, 7), 10);
  if (isNaN(y) || isNaN(m)) return [];

  const result = [];
  for (let mm = m + 1; mm <= 12; mm++) {
    const mmStr = String(mm).padStart(2, "0");
    result.push({ ym: `${y}-${mmStr}`, label: formatMonthYear(y, mmStr) });
  }
  return result;
}

/* --------- Load & render teachers ---------- */
async function loadTeachers(user) {
  try {
    const uid = (user && user.uid) || (auth.currentUser && auth.currentUser.uid);
    if (!uid) return;

    const academicYear = getSelectedAcademicYear();

    teachersTableBody.innerHTML = "";
    const snapshot = await db.collection("teachers")
      .where("ownerId", "==", uid)
      .where("academicYear", "==", academicYear)
      .get();

    let index = 0;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      index++;
      const teacherClass = data.teacherClass || "";
      const dateOfJoining = data.dateOfJoining || null;
      const salaryAmount = data.salaryAmount ?? null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index}</td>
        <td>${data.name || ""}</td>
        <td>${data.subject || ""}</td>
        <td>${teacherClass}</td>
        <td>
          <button class="btn-sm btn-danger btn-delete">Delete</button>
          <button class="btn-sm btn-neutral btn-history" style="margin-left:4px;">Payment History</button>
        </td>
      `;

      const deleteBtn = tr.querySelector(".btn-delete");
      const historyBtn = tr.querySelector(".btn-history");

      deleteBtn.addEventListener("click", async () => {
        if (!confirm("Delete this teacher?")) return;
        try {
          await db.collection("teachers").doc(docSnap.id).delete();
          loadTeachers(auth.currentUser);
          // Optionally: clear payment section if this teacher was selected
        } catch (err) {
          console.error("Delete teacher error:", err);
          alert("Failed to delete teacher: " + err.message);
        }
      });

      historyBtn.addEventListener("click", () => {
        openTeacherPaymentHistory(docSnap.id, {
          name: data.name || "",
          subject: data.subject || "",
          teacherClass: teacherClass,
          dateOfJoining,
          salaryAmount
        });
      });

      teachersTableBody.appendChild(tr);
    });

    applyTeacherFilter();
  } catch (err) {
    console.error("Load teachers error:", err);
  }
}

/* --------- Add teacher ---------- */
teacherForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("teacher-name").value.trim();
  const subject = document.getElementById("teacher-subject").value.trim();
  const teacherClass = document.getElementById("teacher-class").value.trim();
  const salaryAmountStr = document.getElementById("teacher-amount").value.trim();
  const dateOfJoining = document.getElementById("teacher-doj").value;

  if (!name || !subject || !teacherClass || !salaryAmountStr || !dateOfJoining) {
    alert("Please fill all fields.");
    return;
  }

  const salaryAmount = parseFloat(salaryAmountStr);
  if (isNaN(salaryAmount) || salaryAmount < 0) {
    alert("Please enter a valid salary amount.");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    alert("Not logged in.");
    return;
  }

  try {
    // Keep createdMonthKey only for compatibility; main logic uses dateOfJoining
    const now = new Date();
    const createdMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    await db.collection("teachers").add({
      ownerId: user.uid,   // link teacher to this admin
      academicYear: getSelectedAcademicYear(),
      name,
      subject,
      teacherClass,
      salaryAmount,
      dateOfJoining,
      createdMonthKey,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    teacherForm.reset();
    loadTeachers(user);
  } catch (err) {
    console.error("Add teacher error:", err);
    alert("Failed to add teacher: " + err.message);
  }
});

/* --------- Search / Filter ---------- */
function applyTeacherFilter() {
  const term = (teacherSearchInput.value || "").toLowerCase().trim();
  const rows = teachersTableBody.querySelectorAll("tr");
  rows.forEach((row) => {
    const nameCell = row.children[1];
    const name = (nameCell.textContent || "").toLowerCase();
    row.style.display = name.includes(term) ? "" : "none";
  });
}

if (teacherSearchInput) {
  teacherSearchInput.addEventListener("input", applyTeacherFilter);
}
if (teacherSearchBtn) {
  teacherSearchBtn.addEventListener("click", applyTeacherFilter);
}

/* --------- Teacher Payment History (per month) ---------- */
/**
 * Uses a separate collection "teacherPayments" so it never collides
 * with student payments. Scoped by ownerId + academicYear + teacherId.
 */
async function openTeacherPaymentHistory(teacherId, teacherData) {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;
    const academicYear = getSelectedAcademicYear();

    // Show section
    teacherPaymentSection.classList.remove("hidden");
    teacherPaymentInfo.textContent =
      `${teacherData.name} | Subject: ${teacherData.subject || "-"} | Class: ${teacherData.teacherClass || "-"} | DOJ: ${teacherData.dateOfJoining || "-"} | Amount: ${teacherData.salaryAmount != null ? "?" + teacherData.salaryAmount : "-"}`;

    teacherPaymentHistory.innerHTML = "<p style='color:#6b7280;font-size:0.9rem;'>Loading payment history...</p>";

    // Load existing payments for this teacher
    const snap = await db.collection("teacherPayments")
      .where("ownerId", "==", uid)
      .where("academicYear", "==", academicYear)
      .where("teacherId", "==", teacherId)
      .get();

    const paymentsByMonth = {};
    snap.forEach((doc) => {
      const data = doc.data();
      const mk = data.monthKey || (data.date ? data.date.substring(0, 7) : "");
      if (!mk) return;
      if (!paymentsByMonth[mk]) {
        paymentsByMonth[mk] = { total: 0, docs: [] };
      }
      paymentsByMonth[mk].total += data.amount || 0;
      paymentsByMonth[mk].docs.push({ id: doc.id, ...data });
    });

    const rangeMonths = computeTeacherDueMonths(teacherData);
    teacherPaymentHistory.innerHTML = "";

    if (rangeMonths.length === 0) {
      teacherPaymentHistory.innerHTML =
        "<p style='color:#6b7280;font-size:0.9rem;'>No due months for this teacher (maybe joined in December).</p>";
      return;
    }

    const fallbackDefaultSalary = localStorage.getItem("defaultTeacherSalary") || "";
    const baseSalary = (teacherData.salaryAmount != null && !isNaN(teacherData.salaryAmount))
      ? String(teacherData.salaryAmount)
      : fallbackDefaultSalary;

    rangeMonths.forEach(({ ym, label }) => {
      const info = paymentsByMonth[ym];
      const hasPayments = !!info;
      const total = hasPayments ? info.total : 0;
      const amountValue = hasPayments ? total : baseSalary;

      const div = document.createElement("div");
      div.className = "month-block";

      const statusText = hasPayments
        ? `<span class="status-paid">(PAID)</span>`
        : `<span class="status-due">(DUE)</span>`;

      div.innerHTML = `
        <div class="month-header">
          <span>${label}</span>
          <span>${hasPayments ? "Total: ?" + total.toFixed(2) : "No payment yet"} ${statusText}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>Month</th>
              <th>Paid On</th>
              <th>Mode</th>
              <th style="width:180px;">Action / Amount</th>
            </tr>
          </thead>
          <tbody>
            ${
              hasPayments
                ? info.docs
                    .map(
                      (p, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${p.date || (ym + "-01")}</td>
                <td>${p.paidOn || "-"}</td>
                <td>${p.mode || "-"}</td>
                <td>?${p.amount || 0}</td>
              </tr>
            `
                    )
                    .join("")
                : ""
            }
            <tr class="teacher-due-row" data-month="${ym}" data-has-payments="${hasPayments}">
              <td>${hasPayments ? (info.docs.length + 1) : 1}</td>
              <td>${ym}-01</td>
              <td>-</td>
              <td>
                <button type="button" class="btn-sm btn-secondary btn-pay" ${hasPayments ? "disabled" : ""}>
                  Paid
                </button>
                <button type="button" class="btn-sm btn-danger btn-unpay" style="margin-left:4px;" ${
                  hasPayments ? "" : "disabled"
                }>
                  Unpaid
                </button>
              </td>
              <td>
                ?<input
                  type="number"
                  min="0"
                  step="1"
                  class="due-amount-input"
                  placeholder="Amount"
                  value="${amountValue}"
                  ${hasPayments ? "readonly" : ""}
                />
              </td>
            </tr>
          </tbody>
        </table>
      `;

      teacherPaymentHistory.appendChild(div);

      const row = div.querySelector(".teacher-due-row");
      const payBtn = row.querySelector(".btn-pay");
      const unpayBtn = row.querySelector(".btn-unpay");
      const amountInput = row.querySelector(".due-amount-input");

      // Mark month as PAID
      payBtn.addEventListener("click", async () => {
        if (payBtn.disabled) return;

        const val = (amountInput.value || "").trim();
        if (!val || isNaN(parseFloat(val))) {
          alert("Please enter a valid amount.");
          return;
        }
        const amountNum = parseFloat(val);
        localStorage.setItem("defaultTeacherSalary", val);

        const paymentDate = `${ym}-01`; // salary for this month
        const paidOnDate = new Date().toISOString().split("T")[0];

        try {
          await db.collection("teacherPayments").add({
            ownerId: uid,
            academicYear,
            teacherId,
            teacherName: teacherData.name || "",
            teacherClass: teacherData.teacherClass || "",
            subject: teacherData.subject || "",
            amount: amountNum,
            date: paymentDate,
            paidOn: paidOnDate,
            monthKey: ym,
            mode: "Salary",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          // Reload history for fresh view
          openTeacherPaymentHistory(teacherId, teacherData);
        } catch (err) {
          console.error("Teacher Pay error:", err);
          alert("Failed to save payment: " + err.message);
        }
      });

      // Mark month as UNPAID
      unpayBtn.addEventListener("click", async () => {
        if (unpayBtn.disabled) return;
        if (!confirm(`Mark ${label} as unpaid for ${teacherData.name}?`)) return;

        try {
          const snapDel = await db.collection("teacherPayments")
            .where("ownerId", "==", uid)
            .where("academicYear", "==", academicYear)
            .where("teacherId", "==", teacherId)
            .where("monthKey", "==", ym)
            .get();

          const batch = db.batch();
          snapDel.forEach((d) => batch.delete(d.ref));
          await batch.commit();

          openTeacherPaymentHistory(teacherId, teacherData);
        } catch (err) {
          console.error("Teacher unpaid error:", err);
          alert("Failed to mark unpaid: " + err.message);
        }
      });
    });
  } catch (err) {
    console.error("Open teacher payment history error:", err);
    teacherPaymentHistory.innerHTML =
      "<p style='color:#dc2626;'>Failed to load payment history.</p>";
  }
}
