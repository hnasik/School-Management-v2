const db = firebase.firestore();
const auth = firebase.auth();

// DOM
const seasonEl = document.getElementById("season");
const classEl = document.getElementById("classSelect");
const studentEl = document.getElementById("studentSelect");
const subjectsDiv = document.getElementById("subjects");

// Academic year comes ONLY from dashboard
const ACADEMIC_YEAR_KEY = "smsAcademicYear";
const academicYear = localStorage.getItem(ACADEMIC_YEAR_KEY);

// Populate fixed academic year
if (!academicYear) {
  alert("Academic year not selected from dashboard");
} else {
  seasonEl.innerHTML = `<option value="${academicYear}">${academicYear}</option>`;
}

// Populate classes 1–12
for (let c = 1; c <= 12; c++) {
  classEl.add(new Option("Class " + c, c));
}

let studentsCache = [];

// ?? CORRECT: USER + ACADEMIC YEAR + CLASS
async function loadStudents() {
  const user = auth.currentUser;
  if (!user) return;

  studentEl.innerHTML = `<option value="">Loading...</option>`;
  studentsCache = [];

  const snap = await db.collection("students")
    .where("ownerId", "==", user.uid)
    .where("academicYear", "==", academicYear)
    .where("studentClass", "==", classEl.value)
    .get();

  studentEl.innerHTML = "";

  if (snap.empty) {
    studentEl.add(new Option("No students found", ""));
    return;
  }

  snap.forEach(doc => {
    const s = { id: doc.id, ...doc.data() };
    studentsCache.push(s);
    studentEl.add(new Option(s.name, doc.id));
  });
}

auth.onAuthStateChanged(user => {
  if (user) loadStudents();
});

classEl.onchange = loadStudents;

// ---------- SUBJECTS ----------
function gradeFromPercent(p){
  if(p>=80) return "A+";
  if(p>=70) return "A";
  if(p>=60) return "B";
  if(p>=50) return "C";
  return "D";
}

function addSubject() {
  const row = document.createElement("div");
  row.className = "subject-row";
  row.innerHTML = `
    <input placeholder="Subject">
    <input type="number" placeholder="Marks" max="100" oninput="autoCalc(this)">
    <input placeholder="Grade">
    <input placeholder="Total Marks">
  `;
  subjectsDiv.appendChild(row);
}

function autoCalc(markInput){
  const marks = Number(markInput.value || 0);
  const grade = gradeFromPercent(marks);
  const row = markInput.parentElement;
  row.children[2].value = grade;
  row.children[3].value = "100";
}

// ---------- PDF ----------
function fileToBase64(file){
  return new Promise(res=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.readAsDataURL(file);
  });
}

async function generatePDF(){
  const student = studentsCache.find(s=>s.id===studentEl.value);
  if(!student) return alert("Select student");

  let total = 0;
  let rows = "";

  [...subjectsDiv.children].forEach((r,i)=>{
    const sub = r.children[0].value;
    const marks = Number(r.children[1].value||0);
    const grade = r.children[2].value;
    const tmark = r.children[3].value;
    total += marks;

    rows += `
      <tr>
        <td>${i+1}</td>
        <td>${sub}</td>
        <td>${marks}</td>
        <td>${tmark}</td>
        <td>${grade}</td>
      </tr>`;
  });

  const percent = total / (subjectsDiv.children.length*100) * 100;
  const finalGrade = gradeFromPercent(percent);

  const docRef = await db.collection("marksheet_history").add({
    ownerId: auth.currentUser.uid,
    studentId: student.id,
    studentName: student.name,
    class: classEl.value,
    academicYear,
    total,
    grade: finalGrade,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${docRef.id}`;

  const html = `
  <html><body style="font-family:Arial;padding:30px">
  <h2 style="text-align:center">${schoolName.value}</h2>
  <h3 style="text-align:center">Marksheet ${academicYear}</h3>

  <p><b>Student:</b> ${student.name} | <b>Class:</b> ${classEl.value}</p>

  <table>
    <tr><th>No</th><th>Subject</th><th>Marks</th><th>Total</th><th>Grade</th></tr>
    ${rows}
  </table>

  <h3>Total Marks: ${total}</h3>
  <h3>Final Grade: ${finalGrade}</h3>

  <img src="${qr}">
  <p><small>Scan QR to verify marksheet</small></p>

  </body></html>`;

  const w = window.open("");
  w.document.write(html);
  w.print();
}
