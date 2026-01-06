/*************************
 * Firebase Configuration
 *************************/
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

/*************************
 * DOM Elements (SAFE)
 *************************/
const fileInput = document.getElementById("fileInput");
const previewBtn = document.getElementById("previewBtn");
const uploadBtn = document.getElementById("uploadBtn");
const previewTable = document.getElementById("previewTable");
const progressBar = document.getElementById("progressBar");
const statusText = document.getElementById("status");
const yearSelect = document.getElementById("yearSelect");
const classSelect = document.getElementById("classSelect");

// optional (may not exist)
const dateFormatSelect =
  document.getElementById("dateFormat") || { value: "yyyy-mm-dd" };

let parsedRows = [];

/*************************
 * Auth Guard
 *************************/
auth.onAuthStateChanged(user => {
  if (!user) {
    alert("Please login first");
    window.location.href = "login.html";
  }
});

/*************************
 * CORE FIELD MAP
 * (matches your students collection)
 *************************/
const FIELD_MAP = {
  "name": "name",
  "roll": "roll",
  "father": "father",
  "father name": "father",
  "dob": "dob",
  "mobile": "mobile",
  "monthly fee": "monthlyFee",
  "monthlyfee": "monthlyFee",
  "admission fee": "admissionFee",
  "admissionfee": "admissionFee",
  "age": "age",
  "due fee": "dueFee",
  "duefee": "dueFee"
};

/*************************
 * Excel Date Converter
 *************************/
function excelDateToJSDate(serial, format) {
  if (typeof serial !== "number") return serial || "";

  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  return format === "dd-mm-yyyy"
    ? `${dd}-${mm}-${yyyy}`
    : `${yyyy}-${mm}-${dd}`;
}

/*************************
 * Row ? Firestore Mapper
 * OPTION-1 (extra object)
 *************************/
function mapRowToStudent(row) {
  const student = {};
  const extra = {};

  Object.keys(row).forEach(key => {
    const cleanKey = key.toLowerCase().replace(/\s+/g, " ").trim();
    let value = row[key];

    if (FIELD_MAP[cleanKey]) {
      const fsKey = FIELD_MAP[cleanKey];

      if (fsKey === "dob") {
        student[fsKey] = excelDateToJSDate(value, dateFormatSelect.value);
      } else {
        student[fsKey] = value !== undefined ? String(value) : "";
      }
    } else {
      // unknown column ? extra
      extra[cleanKey.replace(/\s+/g, "_")] =
        value !== undefined ? String(value) : "";
    }
  });

  return { student, extra };
}

/*************************
 * Preview
 *************************/
previewBtn.onclick = () => {
  const file = fileInput.files[0];
  if (!file) return alert("Please select a file");

  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    parsedRows = XLSX.utils.sheet_to_json(sheet);
    renderPreview(parsedRows);
  };
  reader.readAsArrayBuffer(file);
};

function renderPreview(rows) {
  previewTable.innerHTML = `
    <tr>
      <th>Name</th>
      <th>Roll</th>
      <th>Father</th>
      <th>DOB</th>
      <th>Admission Fee</th>
      <th>Monthly Fee</th>
    </tr>
  `;

  rows.forEach(r => {
    const { student } = mapRowToStudent(r);
    const error = !student.name || !student.roll;

    previewTable.innerHTML += `
      <tr style="background:${error ? "#ffd6d6" : ""}">
        <td>${student.name || "?"}</td>
        <td>${student.roll || "?"}</td>
        <td>${student.father || ""}</td>
        <td>${student.dob || ""}</td>
        <td>${student.admissionFee || ""}</td>
        <td>${student.monthlyFee || ""}</td>
      </tr>
    `;
  });
}

/*************************
 * Upload ? students collection
 *************************/
uploadBtn.onclick = async () => {
  if (!parsedRows.length) {
    alert("Please preview first");
    return;
  }

  const user = auth.currentUser;
  const academicYear = yearSelect.value;
  const studentClass = classSelect.value.replace("class_", "");

  let uploaded = 0;

  for (let i = 0; i < parsedRows.length; i++) {
    const { student, extra } = mapRowToStudent(parsedRows[i]);

    if (!student.name || !student.roll) continue;

    await db.collection("students").add({
      ...student,

      // REQUIRED CORE FIELDS
      ownerId: user.uid,
      academicYear: academicYear,
      studentClass: studentClass,

      // DEFAULT SYSTEM FIELDS
      delivered: "false",
      bookDelivered: false,
      admitCardCreated: "false",
      dueFee: student.dueFee || "0",

      // EXTRA (OPTION-1)
      extra: extra,

      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    uploaded++;
    progressBar.style.width =
      Math.round(((i + 1) / parsedRows.length) * 100) + "%";
  }

  statusText.innerText = `Upload completed ? (${uploaded} students added)`;
};
