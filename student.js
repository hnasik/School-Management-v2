// ==================================
// FINAL STUDENT.JS (WITH SCHOOL NAME FIRESTORE SAVE)
// ==================================

// ---------- HELPERS ----------
const el = (id) => document.getElementById(id);
const val = (id, d = "") => el(id)?.value || d;
const num = (id, d = 0) => Number(val(id, d)) || d;

function fileToBase64(input) {
  return new Promise((resolve) => {
    if (!input?.files?.[0]) return resolve("");
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(input.files[0]);
  });
}

// ---------- FIREBASE ----------
const firebaseConfig = {
  apiKey: "AIzaSyCOzfdIXBeh6drFhml4pOFEvPG8xV_Wjzw",
  authDomain: "school-management-projec-9db7a.firebaseapp.com",
  projectId: "school-management-projec-9db7a"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ---------- USER STORAGE KEYS ----------
function storageKey(userId, name) {
  return `${userId}_${name}`;
}

// ---------- DEFAULT SCHOOL ----------
const DEFAULT_SCHOOL = "ABC PUBLIC SCHOOL";

// =================================================
// AUTH STATE
// =================================================
auth.onAuthStateChanged(async (user) => {
  if (!user) return;

  const logoKey = storageKey(user.uid, "schoolLogo");
  const signKey = storageKey(user.uid, "principalSign");

  // ---------- LOAD SCHOOL NAME FROM FIRESTORE ----------
  try {
    const doc = await db.collection("school_settings").doc(user.uid).get();
    if (doc.exists && doc.data().schoolName) {
      el("school-name").value = doc.data().schoolName;
    } else {
      el("school-name").value = DEFAULT_SCHOOL;
    }
  } catch (e) {
    el("school-name").value = DEFAULT_SCHOOL;
  }

  // ---------- SAVE SCHOOL NAME TO FIRESTORE ----------
  el("school-name")?.addEventListener("input", async () => {
    const name = val("school-name", DEFAULT_SCHOOL);
    try {
      await db.collection("school_settings").doc(user.uid).set(
        {
          schoolName: name,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } catch (e) {
      console.error("Failed to save school name", e);
    }
  });

  // ---------- SAVE LOGO ----------
  el("school-logo")?.addEventListener("change", async () => {
    const b64 = await fileToBase64(el("school-logo"));
    if (b64) {
      localStorage.setItem(logoKey, b64);
      alert("School logo saved");
    }
  });

  // ---------- SAVE SIGNATURE ----------
  el("principal-signature")?.addEventListener("change", async () => {
    const b64 = await fileToBase64(el("principal-signature"));
    if (b64) {
      localStorage.setItem(signKey, b64);
      alert("Principal signature saved");
    }
  });
});

// ---------- AUTO AGE ----------
el("student-dob")?.addEventListener("change", () => {
  const dob = new Date(val("student-dob"));
  if (!dob || !el("student-age")) return;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  if (
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
  ) age--;

  el("student-age").value = age >= 0 ? age : "";
});

// =================================================
// SAVE STUDENT TO FIRESTORE
// =================================================
el("student-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) return alert("Not logged in");

  const academicYear = new Date().getFullYear().toString();

  const studentData = {
    ownerId: user.uid,
    academicYear,
    name: val("student-name"),
    father: val("student-father"),
    studentClass: val("student-class"),
    roll: val("student-roll"),
    mobile: val("student-mobile"),
    dob: val("student-dob"),
    age: num("student-age"),

    admissionFee: num("student-fee"),
    monthlyFee: num("student-monthly-fee"),
    dueFee: num("student-due-fee"),

    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!studentData.name || !studentData.studentClass) {
    return alert("Student name and class are required");
  }

  try {
    await db.collection("students").add(studentData);
    alert("Student saved successfully");
    e.target.reset();
  } catch (err) {
    console.error(err);
    alert("Failed to save student");
  }
});

// =================================================
// PRINT / ID SLIP
// =================================================
el("student-print-btn")?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return alert("Not logged in");

  const logoKey = storageKey(user.uid, "schoolLogo");
  const signKey = storageKey(user.uid, "principalSign");

  const studentPhoto = await fileToBase64(el("student-photo"));

  const qrData = `
${val("school-name")}
Name: ${val("student-name")}
Class: ${val("student-class")}
Roll: ${val("student-roll")}
Mobile: ${val("student-mobile")}
  `.trim();

  const qrUrl =
    "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" +
    encodeURIComponent(qrData);

  printPDF({
    schoolName: val("school-name", DEFAULT_SCHOOL),
    schoolLogo: localStorage.getItem(logoKey) || "",
    principalSign: localStorage.getItem(signKey) || "",
    studentPhoto,
    qrUrl,

    name: val("student-name"),
    father: val("student-father"),
    className: val("student-class"),
    roll: val("student-roll"),
    dob: val("student-dob"),
    age: val("student-age"),

    admissionFee: num("student-fee"),
    monthlyFee: num("student-monthly-fee"),
    dueFee: num("student-due-fee")
  });
});

// ---------- PDF FUNCTION (UNCHANGED) ----------
function printPDF(d) {
  const w = window.open("", "_blank");
  w.document.write(`
  <html>
  <head>
    <title>Student Admission Slip</title>
    <style>
      body { font-family: Arial; padding: 20px; }
      h2 { text-align: center; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      td { border: 1px solid #333; padding: 6px; }
      .photo { width: 90px; height: 110px; object-fit: cover; }
      .footer { margin-top: 30px; display: flex; justify-content: flex-end; }
      .sign { height: 40px; }
    </style>
  </head>
  <body>
    <h2>${d.schoolName}</h2>
    <table>
      <tr><td>Name</td><td>${d.name}</td></tr>
      <tr><td>Father</td><td>${d.father}</td></tr>
      <tr><td>Class</td><td>${d.className}</td></tr>
      <tr><td>Roll</td><td>${d.roll}</td></tr>
    </table>
  </body>
  </html>
  `);
  w.document.close();
  w.print();
}
