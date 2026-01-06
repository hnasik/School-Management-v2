// --- Firebase init (same config as other pages) ---
const firebaseConfig = {
  apiKey: "AIzaSyCOzfdIXBeh6drFhml4pOFEvPG8xV_Wjzw",
  authDomain: "school-management-projec-9db7a.firebaseapp.com",
  projectId: "school-management-projec-9db7a",
  storageBucket: "school-management-projec-9db7a.firebasestorage.app",
  messagingSenderId: "975842483778",
  appId: "1:975842483778:web:d1708792ff56014f3317db",
  measurementId: "G-1X2Q7LE6G3",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// --- Academic year (same key as other pages) ---
const ACADEMIC_YEAR_STORAGE_KEY = "smsAcademicYear";

function getSelectedAcademicYear() {
  let stored = localStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY);
  if (!stored) {
    stored = String(new Date().getFullYear());
    localStorage.setItem(ACADEMIC_YEAR_STORAGE_KEY, stored);
  }
  return String(stored);
}

// Academic Year dropdown helper (2026–2040)
function populateAcademicYearDropdown(selectEl, selectedYear) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  for (let y = 2026; y <= 2040; y++) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = y;
    if (String(y) === String(selectedYear)) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

// --- Auth state global ---
let currentUser = null;

// --- UI references ---
let classCards;
let studentModal, studentModalTitle, studentModalSub, studentTableBody;
let editModal, editModalTitle, editFormFields, editSaveBtn, editCancelBtn, editModalCloseBtn;
let logoutBtn;

let currentClass = null;
let currentStudents = [];
let editingStudentId = null;
let editingStudentData = null;
let editFieldsRendered = [];

// --- Helpers ---
function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function beautifyKey(key) {
  let label = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return label
    .replace(/\s+/g, " ")
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isSystemField(key) {
  return [
    "ownerId","academicYear","createdAt","updatedAt",
    "_createdAt","_updatedAt","idCardCreated",
    "idCardDelivered","bookDelivered",
    "lastBookName","lastBookEntryId"
  ].includes(key);
}

// --- Load students for class ---
async function loadStudentsForClass(cls) {
  if (!studentModal || !studentTableBody) return;

  currentClass = cls;
  currentStudents = [];
  studentTableBody.innerHTML = "";

  studentModalTitle.textContent = `Class ${cls} Students`;
  studentModalSub.textContent = "Loading students...";
  studentModal.classList.remove("hidden");

  const user = currentUser || auth.currentUser;
  if (!user) return;

  const academicYear = getSelectedAcademicYear();
  const fields = ["studentClass", "class"];
  let docs = [];

  for (const field of fields) {
    const snap = await db.collection("students")
      .where("ownerId", "==", user.uid)
      .where("academicYear", "==", academicYear)
      .where(field, "==", String(cls))
      .get();

    if (!snap.empty) {
      snap.forEach(d => docs.push(d));
      break;
    }
  }

  if (!docs.length) {
    studentModalSub.textContent = "No students found.";
    return;
  }

  let i = 0;
  docs.forEach(doc => {
    i++;
    currentStudents.push({ id: doc.id, data: doc.data() });
    appendStudentRow(i, doc.id, doc.data());
  });

  studentModalSub.textContent = `Found ${currentStudents.length} student(s).`;
}

// --- Append row ---
function appendStudentRow(index, docId, data) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${index}</td>
    <td>${escapeHtml(data.name || "-")}</td>
    <td>${escapeHtml(data.roll || "")}</td>
    <td>
      <button class="btn-small btn-edit" data-id="${docId}">Edit</button>
      <button class="btn-small btn-delete" data-id="${docId}">Delete</button>
    </td>
  `;

  tr.onclick = (e) => {
    if (e.target.closest(".btn-edit")) openEditForm(docId);
    if (e.target.closest(".btn-delete")) handleDeleteStudent(docId);
  };

  studentTableBody.appendChild(tr);
}

// --- Delete student ---
async function handleDeleteStudent(id) {
  if (!confirm("Delete this student?")) return;
  await db.collection("students").doc(id).delete();
  loadStudentsForClass(currentClass);
}

// --- Open edit modal ---
function openEditForm(studentId) {
  const stu = currentStudents.find(s => s.id === studentId);
  if (!stu) return;

  editingStudentId = studentId;
  editingStudentData = stu.data;
  editFieldsRendered = [];
  editFormFields.innerHTML = "";

  for (const [key, value] of Object.entries(editingStudentData)) {
    if (isSystemField(key)) continue;

    editFieldsRendered.push(key);

    const group = document.createElement("div");
    group.className = "form-group";
    group.innerHTML = `
      <label>${escapeHtml(beautifyKey(key))}</label>
      <input type="text" data-field="${escapeHtml(key)}"
             value="${escapeHtml(value ?? "")}">
    `;
    editFormFields.appendChild(group);

    // Academic Year AFTER Monthly Fee
    if (key.toLowerCase().includes("monthly") && key.toLowerCase().includes("fee")) {
      const yearGroup = document.createElement("div");
      yearGroup.className = "form-group";
      yearGroup.innerHTML = `
        <label>Academic Year</label>
        <select id="edit-academic-year"></select>
      `;
      editFormFields.appendChild(yearGroup);

      populateAcademicYearDropdown(
        yearGroup.querySelector("#edit-academic-year"),
        editingStudentData.academicYear || getSelectedAcademicYear()
      );
    }
  }

  editModalTitle.textContent = "Edit Student";
  editModal.classList.remove("hidden");
}

// --- Save changes ---
async function saveEditChanges() {
  const updateData = {};

  for (const key of editFieldsRendered) {
    const input = editFormFields.querySelector(
      `input[data-field="${CSS.escape(key)}"]`
    );
    if (input) updateData[key] = input.value;
  }

  const yearSelect = document.getElementById("edit-academic-year");
  if (yearSelect) updateData.academicYear = yearSelect.value;

  await db.collection("students").doc(editingStudentId).update(updateData);
  closeEditModal();
  loadStudentsForClass(currentClass);
}

// --- Close student list modal ---
function closeStudentModal() {
  if (!studentModal) return;
  studentModal.classList.add("hidden");
  studentTableBody.innerHTML = "";
  currentClass = null;
  currentStudents = [];
}

// --- Close edit modal ---
function closeEditModal() {
  editModal.classList.add("hidden");
  editFormFields.innerHTML = "";
}

// --- DOM ready ---
document.addEventListener("DOMContentLoaded", () => {
  classCards = document.querySelectorAll(".class-card");

  studentModal = document.getElementById("student-modal");
  studentModalTitle = document.getElementById("student-modal-title");
  studentModalSub = document.getElementById("student-modal-sub");
  studentTableBody = document.getElementById("student-table-body");
  const studentModalCloseBtn = document.getElementById("student-modal-close");

  editModal = document.getElementById("edit-modal");
  editModalTitle = document.getElementById("edit-modal-title");
  editFormFields = document.getElementById("edit-form-fields");
  editSaveBtn = document.getElementById("edit-save-btn");
  editCancelBtn = document.getElementById("edit-cancel-btn");
  editModalCloseBtn = document.getElementById("edit-modal-close");

  auth.onAuthStateChanged(user => {
    if (!user) window.location.href = "login.html";
    currentUser = user;
  });

  classCards.forEach(card => {
    card.onclick = () => loadStudentsForClass(card.dataset.class);
  });

  if (studentModalCloseBtn) {
    studentModalCloseBtn.onclick = closeStudentModal;
  }

  // close student modal on overlay click
  if (studentModal) {
    studentModal.addEventListener("click", (e) => {
      if (e.target === studentModal) closeStudentModal();
    });
  }

  editSaveBtn.onclick = saveEditChanges;
  editCancelBtn.onclick = closeEditModal;
  editModalCloseBtn.onclick = closeEditModal;
});
