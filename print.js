// ==================================
// PRINT.JS – FIXED (printPDF DEFINED)
// ==================================

const firebaseConfig = {
  apiKey: "AIzaSyCOzfdIXBeh6drFhml4pOFEvPG8xV_Wjzw",
  authDomain: "school-management-projec-9db7a.firebaseapp.com",
  projectId: "school-management-projec-9db7a"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

function storageKey(uid, k) {
  return `${uid}_${k}`;
}

// ==================================
// SEARCH & PRINT
// ==================================
document.getElementById("searchPrintBtn").addEventListener("click", async () => {
  const mobile = document.getElementById("mobile").value.trim();
  const user = auth.currentUser;

  if (!user) return alert("Not logged in");
  if (!mobile) return alert("Enter mobile number");

  const snap = await db.collection("students")
    .where("ownerId", "==", user.uid)
    .where("mobile", "==", mobile)
    .limit(1)
    .get();

  if (snap.empty) {
    alert("Student not found");
    return;
  }

  const s = snap.docs[0].data();

  // ---------- LOAD SCHOOL NAME ----------
  const schoolSnap = await db
    .collection("school_settings")
    .doc(user.uid)
    .get();

  const schoolName = schoolSnap.exists
    ? schoolSnap.data().schoolName
    : "ABC PUBLIC SCHOOL";

  // ---------- LOAD LOGO & SIGN ----------
  const logo = localStorage.getItem(storageKey(user.uid, "schoolLogo")) || "";
  const sign = localStorage.getItem(storageKey(user.uid, "principalSign")) || "";

  // ---------- QR ----------
  const qrData = `
${schoolName}
Name: ${s.name}
Class: ${s.studentClass}
Roll: ${s.roll}
Mobile: ${s.mobile}
`.trim();

  const qrUrl =
    "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" +
    encodeURIComponent(qrData);

  // ---------- PRINT ----------
  printPDF({
    schoolName,
    schoolLogo: logo,
    principalSign: sign,
    studentPhoto: "",
    qrUrl,

    name: s.name,
    father: s.father,
    className: s.studentClass,
    roll: s.roll,
    dob: s.dob,
    age: s.age,
    admissionFee: s.admissionFee,
    monthlyFee: s.monthlyFee,
    dueFee: s.dueFee
  });
});

// ==================================
// SAME PDF FUNCTION (DEFINED HERE)
// ==================================
function printPDF(d) {
  const w = window.open("", "_blank");

  w.document.write(`
<html>
<head>
  <title>Student Admission Slip</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    h2 { text-align: center; margin-bottom: 5px; }
    .center { text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    td { border: 1px solid #333; padding: 6px; }
    .photo { width: 90px; height: 110px; object-fit: cover; border: 1px solid #333; }
    .footer { margin-top: 30px; display: flex; justify-content: space-between; }
    .sign { height: 40px; }
  </style>
</head>
<body>

  <div class="center">
    ${d.schoolLogo ? `<img src="${d.schoolLogo}" height="60"><br>` : ""}
    <h2>${d.schoolName}</h2>
    <strong>Student Admission Slip</strong>
  </div>

  <table>
    <tr>
      <td><b>Name</b></td><td>${d.name}</td>
      <td rowspan="4" class="center">No Photo</td>
    </tr>
    <tr><td><b>Father Name</b></td><td>${d.father}</td></tr>
    <tr><td><b>Class</b></td><td>${d.className}</td></tr>
    <tr><td><b>Roll No</b></td><td>${d.roll}</td></tr>
    <tr>
      <td><b>Date of Birth</b></td><td>${d.dob}</td>
      <td rowspan="3" class="center"><img src="${d.qrUrl}"></td>
    </tr>
    <tr><td><b>Age</b></td><td>${d.age}</td></tr>
    <tr><td><b>Admission Fee</b></td><td>? ${d.admissionFee}</td></tr>
    <tr><td><b>Monthly Fee</b></td><td>? ${d.monthlyFee}</td><td></td></tr>
    <tr><td><b>Due Fee</b></td><td>? ${d.dueFee}</td><td></td></tr>
  </table>

  <div class="footer">
    <div></div>
    <div class="center">
      ${d.principalSign ? `<img src="${d.principalSign}" class="sign"><br>` : ""}
      <b>Principal</b>
    </div>
  </div>

</body>
</html>
  `);

  w.document.close();
  w.focus();
  w.print();
}
