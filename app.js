// app.js – Dashboard (ADD CLASS-WISE STUDENTS ONLY)

const logoutBtn = document.getElementById("logout-btn");
const pageWelcome = document.getElementById("page-welcome");
const totalStudentsEl = document.getElementById("total-students");
const totalTeachersEl = document.getElementById("total-teachers");
const dashTotalPaidMonthEl = document.getElementById("dash-total-paid-month");
const dashTotalPaidMonthLabelEl = document.getElementById("dash-total-paid-month-label");
const monthlyBarChartEl = document.getElementById("monthly-bar-chart");
const monthlyBarYearLabelEl = document.getElementById("monthly-bar-year-label");
const academicYearSelect = document.getElementById("academic-year-select");
const classWiseSummaryEl = document.getElementById("class-wise-summary");

const AY_KEY = "smsAcademicYear";

/* Firebase */
firebase.initializeApp({
  apiKey: "AIzaSyCOzfdIXBeh6drFhml4pOFEvPG8xV_Wjzw",
  authDomain: "school-management-projec-9db7a.firebaseapp.com",
  projectId: "school-management-projec-9db7a"
});

const auth = firebase.auth();
const db = firebase.firestore();

/* Academic Year */
function getYear() {
  let y = localStorage.getItem(AY_KEY) || new Date().getFullYear();
  localStorage.setItem(AY_KEY, y);
  return y;
}

function initYearUI() {
  academicYearSelect.innerHTML = "";
  for (let y = 2025; y <= 2040; y++) {
    academicYearSelect.innerHTML += `<option value="${y}">${y}</option>`;
  }
  academicYearSelect.value = getYear();
  academicYearSelect.onchange = () => {
    localStorage.setItem(AY_KEY, academicYearSelect.value);
    loadDashboard(auth.currentUser);
  };
}

/* Chart */
function renderChart(totals, year) {
  monthlyBarChartEl.innerHTML = "";
  const max = Math.max(...totals, 1);
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  totals.forEach((v,i)=>{
    monthlyBarChartEl.innerHTML += `
      <div class="bar-item">
        <div class="bar" style="height:${(v/max)*100}%"></div>
        <div class="bar-amount">?${v}</div>
        <div class="bar-month">${m[i]}</div>
      </div>`;
  });

  monthlyBarYearLabelEl.textContent = `Academic Year ${year}`;
}

/* Dashboard */
async function loadDashboard(user) {
  const uid = user.uid;
  const year = getYear();

  const [students, teachers, payments] = await Promise.all([
    db.collection("students").where("ownerId","==",uid).where("academicYear","==",year).get(),
    db.collection("teachers").where("ownerId","==",uid).where("academicYear","==",year).get(),
    db.collection("payments").where("ownerId","==",uid).where("academicYear","==",year).get()
  ]);

  totalStudentsEl.textContent = students.size;
  totalTeachersEl.textContent = teachers.size;

  /* Class-wise count */
  const classCount = {};
  for (let i=1;i<=12;i++) classCount[i]=0;

  students.forEach(doc=>{
    const c = doc.data().studentClass;
    if (classCount[c] !== undefined) classCount[c]++;
  });

  classWiseSummaryEl.innerHTML = "";
  Object.keys(classCount).forEach(c=>{
    classWiseSummaryEl.innerHTML += `<div class="class-item">Class ${c}: ${classCount[c]}</div>`;
  });

  /* Payments */
  let totalPaid = 0;
  const monthlyTotals = Array(12).fill(0);

  payments.forEach(doc=>{
    const d = doc.data();
    totalPaid += d.amount || 0;
    if (d.monthKey) {
      const i = parseInt(d.monthKey.slice(5,7))-1;
      if (i>=0) monthlyTotals[i]+=d.amount;
    }
  });

  dashTotalPaidMonthEl.textContent = `?${totalPaid}`;
  dashTotalPaidMonthLabelEl.textContent = `Total Paid for Academic Year ${year}`;

  renderChart(monthlyTotals, year);
}

/* Auth */
auth.onAuthStateChanged(user=>{
  if (!user) location.href="login.html";
  pageWelcome.textContent = user.email;
  initYearUI();
  loadDashboard(user);
});

logoutBtn.onclick = ()=>auth.signOut();
