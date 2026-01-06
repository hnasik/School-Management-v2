// ================= FIREBASE =================
const firebaseConfig = {
  apiKey: "AIzaSyCOzfdIXBeh6drFhml4pOFEvPG8xV_Wjzw",
  authDomain: "school-management-projec-9db7a.firebaseapp.com",
  projectId: "school-management-projec-9db7a",
  storageBucket: "school-management-projec-9db7a.firebasestorage.app",
  messagingSenderId: "975842483778",
  appId: "1:975842483778:web:d1708792ff56014f3317db"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ================= GLOBALS =================
let currentUserUid = null;
let openedStudentId = null;

// DOM
const yearSelect = document.getElementById("academicYearSelect");
const classSelect = document.getElementById("classSelect");
const studentTableBody = document.getElementById("studentTableBody");
const paymentHistoryBox = document.getElementById("paymentHistory");
const studentTitle = document.getElementById("studentTitle");
const monthList = document.getElementById("monthList");

// ================= INIT =================
for (let y = 2025; y <= 2040; y++) {
  yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
}
yearSelect.value = new Date().getFullYear();

for (let c = 1; c <= 12; c++) {
  classSelect.innerHTML += `<option value="${c}">Class ${c}</option>`;
}

// ================= AUTH =================
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUserUid = user.uid;
});

// ================= EVENTS =================
classSelect.addEventListener("change", loadStudents);
yearSelect.addEventListener("change", loadStudents);

// ================= LOAD STUDENTS =================
async function loadStudents() {
  if (!classSelect.value) return;

  studentTableBody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;

  const snap = await db.collection("students")
    .where("ownerId", "==", currentUserUid)
    .where("academicYear", "==", yearSelect.value)
    .where("studentClass", "==", classSelect.value)
    .get();

  if (snap.empty) {
    studentTableBody.innerHTML = `<tr><td colspan="4">No students</td></tr>`;
    return;
  }

  studentTableBody.innerHTML = "";
  let i = 1;

  snap.forEach(doc => {
    const s = doc.data();
    studentTableBody.innerHTML += `
      <tr>
        <td>${i++}</td>
        <td>${s.name}</td>
        <td>${s.studentClass}</td>
        <td>
          <button onclick="toggleHistory('${doc.id}','${s.name}','${s.studentClass}')">
            See Payment History
          </button>
        </td>
      </tr>
    `;
  });
}

// ================= TOGGLE HISTORY (FIXED) =================
function toggleHistory(studentId, name, cls) {
  if (openedStudentId === studentId) {
    paymentHistoryBox.style.display =
      paymentHistoryBox.style.display === "none" ? "block" : "none";
    return;
  }

  openedStudentId = studentId;
  paymentHistoryBox.style.display = "block";
  paymentHistoryBox.scrollIntoView({ behavior: "smooth", block: "start" });

  viewHistory(studentId, name, cls);
}

// ================= VIEW HISTORY =================
async function viewHistory(studentId, studentName, studentClass) {
  studentTitle.textContent = `Payment History : ${studentName}`;
  monthList.innerHTML = "Loading...";

  const snap = await db.collection("payments")
    .where("ownerId", "==", currentUserUid)
    .where("studentId", "==", studentId)
    .where("academicYear", "==", yearSelect.value)
    .get();

  const payments = {};
  snap.forEach(d => payments[d.data().monthKey] = { id: d.id, ...d.data() });

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  let defaultAmount = localStorage.getItem("defaultFee") || "";
  monthList.innerHTML = "";

  months.forEach((m, i) => {
    const monthKey = `${yearSelect.value}-${String(i+1).padStart(2,"0")}`;
    const payment = payments[monthKey];

    const div = document.createElement("div");
    div.className = "month";

    div.innerHTML = `
      <strong style="width:100px">${m}</strong>

      <input type="number"
        value="${payment ? payment.amount : defaultAmount}"
        style="width:100px;padding:6px;border-radius:6px;border:1px solid #ccc">

      <button class="${payment ? 'btn-paid-green btn-disabled' : 'btn-paid-red'}">
        Paid
      </button>

      <button class="btn-unpaid ${payment ? '' : 'btn-disabled'}">
        Unpaid
      </button>

      <button class="btn-print">
        <i class="fas fa-print"></i>
      </button>
    `;

    const amountInput = div.querySelector("input");
    const paidBtn = div.children[2];
    const unpaidBtn = div.children[3];
    const printBtn = div.children[4];

    // PAID
    paidBtn.onclick = async () => {
      if (payment) return;
      if (!amountInput.value) return alert("Enter amount");

      localStorage.setItem("defaultFee", amountInput.value);

      await db.collection("payments").add({
        ownerId: currentUserUid,
        academicYear: yearSelect.value,
        studentId,
        studentName,
        studentClass,
        monthKey,
        amount: Number(amountInput.value),
        status: "paid",
        paidOn: new Date().toISOString().split("T")[0],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      viewHistory(studentId, studentName, studentClass);
    };

    // UNPAID
    unpaidBtn.onclick = async () => {
      if (!payment) return;
      await db.collection("payments").doc(payment.id).delete();
      viewHistory(studentId, studentName, studentClass);
    };

    // PRINT
    printBtn.onclick = () => {
      const w = window.open("", "_blank");
      w.document.write(`
        <h2>Fee Receipt</h2>
        <hr>
        <p><b>Student:</b> ${studentName}</p>
        <p><b>Class:</b> ${studentClass}</p>
        <p><b>Month:</b> ${m}</p>
        <p><b>Academic Year:</b> ${yearSelect.value}</p>
        <p><b>Amount:</b> ?${amountInput.value}</p>
        <small>${new Date().toLocaleString()}</small>
      `);
      w.print();
    };

    monthList.appendChild(div);
  });
}
