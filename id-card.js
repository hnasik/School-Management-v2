// id-card.js (updated, user + academic year specific, auth-safe)
// Uses global Firebase auth/db (must be defined in page, like other pages)

let studentsByClass = {}; // { "1": [ {id, name, class, roll, idCardCreated, delivered}, ... ], ... }
let currentGenStudent = null;
let currentGenRow = null;
let genPhotoDataUrl = null;

// localStorage keys for ID card defaults
const LS_SCHOOL_NAME = "idCard:schoolName";
const LS_ACADEMIC_YEAR = "idCard:academicYear"; // printed on card as Session
const LS_SIGNATURE = "idCard:signatureDataUrl"; // dataURL

// Shared academic year key used across the app (dashboard, teacher, etc.)
const ACADEMIC_YEAR_STORAGE_KEY = "smsAcademicYear";

// Read currently selected academic year (set from dashboard dropdown)
// Fallback: current year if not found.
function getSelectedAcademicYearForIdCard() {
  let stored = localStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY);
  if (!stored) {
    const currentYear = new Date().getFullYear();
    stored = String(currentYear);
    localStorage.setItem(ACADEMIC_YEAR_STORAGE_KEY, stored);
  }
  return String(stored);
}

// -------- Load students and group by class --------
async function loadStudentsFromFirestore() {
  if (typeof db === "undefined" || typeof auth === "undefined") {
    console.warn("Firebase not initialized (db/auth missing); cannot load students.");
    return;
  }

  try {
    const user = auth.currentUser;
    if (!user) {
      console.warn("No logged-in user; cannot load students.");
      return;
    }

    const academicYear = getSelectedAcademicYearForIdCard();

    const snapshot = await db
      .collection("students")
      .where("ownerId", "==", user.uid)
      .where("academicYear", "==", academicYear)
      .get();

    studentsByClass = {};

    snapshot.forEach((doc) => {
      const data = doc.data();

      const cls = (
        data.studentClass ||
        data.class ||
        data.Class ||
        data.cls ||
        ""
      ).toString();

      if (!cls) {
        console.warn("Student has no class field:", doc.id, data);
        return;
      }

      if (!studentsByClass[cls]) {
        studentsByClass[cls] = [];
      }

      studentsByClass[cls].push({
        id: doc.id,
        name: data.name || "Unnamed",
        class: cls,
        roll: data.roll || data.rollNo || data.rollNumber || "",
        idCardCreated: !!data.idCardCreated,
        delivered: !!data.delivered
      });
    });

    console.log("Students loaded by class:", studentsByClass);
  } catch (err) {
    console.error("Failed to load students from Firestore:", err);
    alert("Failed to load students from cloud. Check console for details.\n" + err.message);
  }
}

// -------- Student list modal --------
function openStudentModalForClass(cls) {
  const modal = document.getElementById("student-modal");
  const tbody = document.getElementById("modal-student-body");
  const titleText = document.getElementById("modal-title-text");

  if (!modal || !tbody || !titleText) return;

  const list = studentsByClass[cls] || [];

  titleText.textContent = `Class ${cls} Students`;
  tbody.innerHTML = "";

  if (list.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" style="text-align:center; padding:0.6rem; color:#6b7280;">
      No students found for this class.
    </td>`;
    tbody.appendChild(tr);
  } else {
    list.forEach((stu, index) => {
      const tr = document.createElement("tr");
      tr.dataset.docId = stu.id;
      tr.dataset.class = stu.class;

      const buttonText = stu.idCardCreated
        ? "Generate ID Card ?"
        : "Generate ID Card";

      const deliveredDisabled = stu.delivered ? "disabled" : "";

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${stu.name}</td>
        <td>${stu.roll}</td>
        <td>
          <div class="status-btn-group">
            <button class="btn-compact btn-id-created${stu.idCardCreated ? " active" : ""}" data-action="generate">
              <i class="fas fa-id-card"></i> ${buttonText}
            </button>
            <button class="btn-compact btn-delivered" data-action="delivered" ${deliveredDisabled}>
              <i class="fas fa-check"></i> Delivered
            </button>
            <button class="btn-compact btn-not-delivered" data-action="notDelivered">
              <i class="fas fa-times"></i> Not Delivered
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  modal.classList.remove("hidden");
}

function closeStudentModal() {
  const modal = document.getElementById("student-modal");
  if (modal) modal.classList.add("hidden");
}

// -------- Firestore status updates --------
async function updateStudentStatus(docId, updates) {
  if (typeof db === "undefined") return;
  try {
    await db.collection("students").doc(docId).update(updates);
  } catch (err) {
    console.error("Failed to update student status:", err);
    alert("Failed to update status in cloud.");
  }
}

// -------- Generate ID Card modal logic --------
function resetGenerateModal() {
  currentGenStudent = null;
  currentGenRow = null;
  genPhotoDataUrl = null;

  const imgL = document.getElementById("gen-photo-landscape");
  const imgP = document.getElementById("gen-photo-portrait");
  const phL = document.getElementById("gen-photo-landscape-placeholder");
  const phP = document.getElementById("gen-photo-portrait-placeholder");
  const fileInput = document.getElementById("gen-photo-input");

  // Keep school name / academic year / signature (these are defaults) — do NOT clear them.
  if (imgL) imgL.style.display = "none";
  if (imgP) imgP.style.display = "none";
  if (phL) phL.style.display = "flex";
  if (phP) phP.style.display = "flex";
  if (fileInput) fileInput.value = "";

  // Reset texts to placeholders / defaults loaded elsewhere
  setText("gen-name-landscape", "Student Name");
  setText("gen-class-roll-landscape", "Class: - | Roll: -");
  setText("gen-footer-note-landscape", "Session: -");

  setText("gen-school-portrait", "Your School Name");
  setText("gen-name-portrait", "Student Name");
  setText("gen-class-roll-portrait", "Class: - | Roll: -");
  setText("gen-footer-note-portrait", "-");

  // hide signature images by default (they will be shown if there is a saved signature)
  const sigL = document.getElementById("gen-signature-landscape");
  const sigP = document.getElementById("gen-signature-portrait");
  const sigPlaceholder = document.getElementById("gen-signature-placeholder");
  if (sigL) { sigL.style.display = "none"; sigL.src = ""; }
  if (sigP) { sigP.style.display = "none"; sigP.src = ""; }
  if (sigPlaceholder) sigPlaceholder.style.display = "inline";

  // Load defaults into preview (school name / academic year / signature) so preview is ready immediately
  applyDefaultsToPreview();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function openGenerateModal(stu, row) {
  currentGenStudent = stu;
  currentGenRow = row;

  const modal = document.getElementById("generate-modal");
  if (!modal) return;

  resetGenerateModal();

  const summary = document.getElementById("gen-student-summary");
  if (summary) {
    summary.textContent = `Student: ${stu.name} | Class: ${stu.class} | Roll: ${stu.roll || "-"}`;
  }

  const classRollText = `Class: ${stu.class} | Roll: ${stu.roll || "-"}`;

  setText("gen-name-landscape", stu.name);
  setText("gen-class-roll-landscape", classRollText);
  setText("gen-name-portrait", stu.name);
  setText("gen-class-roll-portrait", classRollText);

  // Ensure preview reflects current saved defaults (school/year/signature)
  applyDefaultsToPreview();

  modal.classList.remove("hidden");
}

function closeGenerateModal() {
  const modal = document.getElementById("generate-modal");
  if (modal) modal.classList.add("hidden");
  currentGenStudent = null;
  currentGenRow = null;
  genPhotoDataUrl = null;
}

// -------- Defaults: load/save to localStorage and apply to preview --------
function loadDefaultsFromLocalStorage() {
  const school = localStorage.getItem(LS_SCHOOL_NAME) || "";
  const year = localStorage.getItem(LS_ACADEMIC_YEAR) || "";
  const signature = localStorage.getItem(LS_SIGNATURE) || "";

  const schoolInput = document.getElementById("gen-school-name");
  const yearInput = document.getElementById("gen-academic-year");

  if (schoolInput) schoolInput.value = school;
  if (yearInput) yearInput.value = year;

  // apply to preview elements
  if (school) {
    setText("gen-school-landscape", school);
    setText("gen-school-portrait", school);
  } else {
    setText("gen-school-landscape", "Your School Name");
    setText("gen-school-portrait", "Your School Name");
  }

  if (year) {
    setText("gen-footer-note-landscape", `Session: ${year}`);
    setText("gen-footer-note-portrait", year);
  } else {
    setText("gen-footer-note-landscape", "Session: -");
    setText("gen-footer-note-portrait", "-");
  }

  if (signature) {
    // signature is a dataURL
    const sigL = document.getElementById("gen-signature-landscape");
    const sigP = document.getElementById("gen-signature-portrait");
    const sigPlaceholder = document.getElementById("gen-signature-placeholder");
    if (sigL) { sigL.src = signature; sigL.style.display = "block"; }
    if (sigP) { sigP.src = signature; sigP.style.display = "block"; }
    if (sigPlaceholder) sigPlaceholder.style.display = "none";
  }
}

function applyDefaultsToPreview() {
  // Called when preview should reflect saved defaults
  loadDefaultsFromLocalStorage();
}

// Save handlers for defaults
function setupDefaultInputs() {
  const schoolInput = document.getElementById("gen-school-name");
  const yearInput = document.getElementById("gen-academic-year");
  const sigInput = document.getElementById("gen-signature-input");

  if (schoolInput) {
    schoolInput.addEventListener("input", () => {
      const val = schoolInput.value.trim();
      localStorage.setItem(LS_SCHOOL_NAME, val);
      setText("gen-school-landscape", val || "Your School Name");
      setText("gen-school-portrait", val || "Your School Name");
    });
  }

  if (yearInput) {
    yearInput.addEventListener("input", () => {
      const val = yearInput.value.trim();
      localStorage.setItem(LS_ACADEMIC_YEAR, val);
      setText("gen-footer-note-landscape", val ? `Session: ${val}` : "Session: -");
      setText("gen-footer-note-portrait", val || "-");
    });
  }

  if (sigInput) {
    sigInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        // save as default
        try {
          localStorage.setItem(LS_SIGNATURE, dataUrl);
        } catch (err) {
          console.warn("Failed to save signature to localStorage (might be too large).", err);
        }
        // apply to preview
        const sigL = document.getElementById("gen-signature-landscape");
        const sigP = document.getElementById("gen-signature-portrait");
        const sigPlaceholder = document.getElementById("gen-signature-placeholder");
        if (sigL) { sigL.src = dataUrl; sigL.style.display = "block"; }
        if (sigP) { sigP.src = dataUrl; sigP.style.display = "block"; }
        if (sigPlaceholder) sigPlaceholder.style.display = "none";
      };
      reader.readAsDataURL(file);
    });
  }
}

// Handle photo upload (per-student, not saved as default)
function setupPhotoUpload() {
  const fileInput = document.getElementById("gen-photo-input");
  if (!fileInput) return;

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      genPhotoDataUrl = reader.result;

      const imgL = document.getElementById("gen-photo-landscape");
      const imgP = document.getElementById("gen-photo-portrait");
      const phL = document.getElementById("gen-photo-landscape-placeholder");
      const phP = document.getElementById("gen-photo-portrait-placeholder");

      if (imgL) {
        imgL.src = genPhotoDataUrl;
        imgL.style.display = "block";
      }
      if (imgP) {
        imgP.src = genPhotoDataUrl;
        imgP.style.display = "block";
      }
      if (phL) phL.style.display = "none";
      if (phP) phP.style.display = "none";
    };
    reader.readAsDataURL(file);
  });
}

// Handle school name input live update (legacy hookup kept)
function setupSchoolNameInput() {
  const input = document.getElementById("gen-school-name");
  if (!input) return;

  input.addEventListener("input", () => {
    const val = input.value.trim() || "Your School Name";
    setText("gen-school-landscape", val);
    setText("gen-school-portrait", val);
  });
}

// Download selected orientation as JPG
async function handleDownloadClick() {
  const selected = document.querySelector('input[name="gen-orientation"]:checked');
  const orientation = selected ? selected.value : "landscape";

  const targetId = orientation === "portrait" ? "gen-card-portrait" : "gen-card-landscape";
  const card = document.getElementById(targetId);
  if (!card) {
    alert("Card preview not found.");
    return;
  }

  if (typeof html2canvas === "undefined") {
    alert("Image capture library (html2canvas) is not loaded.");
    return;
  }

  const stu = currentGenStudent;
  if (!stu) {
    // Instead of blocking, proceed using whatever is visible in the preview.
    console.warn("No student opened via Generate modal; proceeding to capture current preview.");
  }

  // Ensure preview reflects current defaults (school/year/signature)
  applyDefaultsToPreview();

  try {
    const canvas = await html2canvas(card, {
      backgroundColor: "#ffffff",
      scale: 3
    });

    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const link = document.createElement("a");
      const baseName = (stu && stu.name) ? stu.name : "id-card";
      const fileName = `${(baseName || "id-card").replace(/\s+/g, "_").toLowerCase()}_${orientation}.jpg`;

      link.download = fileName;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);

      // After generating, mark as created only if we had a student opened
      if (stu) {
        await markIdCardGeneratedForCurrent();
      } else {
        console.info("No student to mark as generated (no Firestore update).");
      }
    }, "image/jpeg", 0.95);
  } catch (err) {
    console.error("Failed to generate JPG:", err);
    alert("Failed to generate ID card image.");
  }
}

// Mark current student as idCardCreated: true
async function markIdCardGeneratedForCurrent() {
  if (!currentGenStudent || !currentGenStudent.id) return;

  currentGenStudent.idCardCreated = true;

  // Update Firestore
  await updateStudentStatus(currentGenStudent.id, { idCardCreated: true });

  // Update button text + style in row
  if (currentGenRow) {
    const btn = currentGenRow.querySelector("button.btn-id-created");
    if (btn) {
      btn.classList.add("active");
      btn.innerHTML = `<i class="fas fa-id-card"></i> Generate ID Card ?`;
    }
  }
}

// -------- Handle clicks inside student modal --------
function setupModalButtonHandlers() {
  const tbody = document.getElementById("modal-student-body");
  if (!tbody) return;

  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const tr = btn.closest("tr");
    if (!tr) return;

    const docId = tr.dataset.docId;
    if (!docId) return;

    const cls = tr.dataset.class;
    const list = studentsByClass[cls] || [];
    const stu = list.find((s) => s.id === docId);

    if (!stu) return;

    if (action === "generate") {
      openGenerateModal(stu, tr);
    }

    if (action === "delivered") {
      btn.disabled = true;
      stu.delivered = true;
      await updateStudentStatus(docId, { delivered: true });
    }

    if (action === "notDelivered") {
      const deliveredBtn = tr.querySelector("button.btn-delivered");
      if (deliveredBtn) deliveredBtn.disabled = false;
      stu.delivered = false;
      await updateStudentStatus(docId, { delivered: false });
    }
  });
}

// -------- Init --------
document.addEventListener("DOMContentLoaded", function () {
  // Wait for Firebase auth, then load students
  if (typeof auth !== "undefined") {
    auth.onAuthStateChanged((user) => {
      if (user) {
        loadStudentsFromFirestore();
      } else {
        console.log("Not logged in on ID Card page");
        // Optionally redirect:
        // window.location.href = "login.html";
      }
    });
  } else {
    console.warn("auth not defined; cannot watch login state.");
  }

  // Class card click
  document.querySelectorAll(".class-card").forEach((card) => {
    card.addEventListener("click", () => {
      const cls = card.dataset.class;
      if (!cls) return;
      openStudentModalForClass(cls);
    });
  });

  // Student modal close
  const modalClose = document.getElementById("modal-close");
  if (modalClose) {
    modalClose.addEventListener("click", closeStudentModal);
  }
  const studentModal = document.getElementById("student-modal");
  if (studentModal) {
    studentModal.addEventListener("click", (e) => {
      if (e.target === studentModal) {
        closeStudentModal();
      }
    });
  }

  // Generate modal close
  const genClose = document.getElementById("generate-close");
  if (genClose) {
    genClose.addEventListener("click", closeGenerateModal);
  }
  const genModal = document.getElementById("generate-modal");
  if (genModal) {
    genModal.addEventListener("click", (e) => {
      if (e.target === genModal) {
        closeGenerateModal();
      }
    });
  }

  setupModalButtonHandlers();
  setupPhotoUpload();
  setupSchoolNameInput();

  // Setup defaults handling (school name, academic year (Session), signature)
  setupDefaultInputs();
  // Load defaults into the page (so opening modal shows saved defaults immediately)
  loadDefaultsFromLocalStorage();

  const downloadBtn = document.getElementById("gen-download-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", handleDownloadClick);
  }
});
