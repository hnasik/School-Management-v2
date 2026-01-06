/**
 * admit_card.js — Complete updated file
 *
 * Fixes:
 *  - "Generate" button opens Generate modal (previously "Preview")
 *  - "Upload Photo" clickable and works (file picker -> preview)
 *  - School Name & Exam Name auto-save to localStorage when both entered
 *  - Download PDF and Print now work using html2canvas + jspdf
 *
 * Keep rest of your logic/structure unchanged.
 */

/* Firebase config */
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

/* Local storage keys */
const LS_SCHOOL_NAME = "admit_school_name";
const LS_EXAM_NAME = "admit_exam_name";
const ACADEMIC_YEAR_STORAGE_KEY = "smsAcademicYear";

/* Helpers */
function getSelectedAcademicYear() {
  let stored = localStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY);
  if (!stored) {
    stored = String(new Date().getFullYear());
    localStorage.setItem(ACADEMIC_YEAR_STORAGE_KEY, stored);
  }
  return String(stored);
}
function escapeHtml(s) {
  if (s === undefined || s === null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
function show(el) { if (el && el.classList) el.classList.add("show"); }
function hide(el) { if (el && el.classList) el.classList.remove("show"); }

/* DOM refs */
const classGrid = document.getElementById("class-card-grid");
const academicDisplay = document.getElementById("academic-year-display");

const studentModal = document.getElementById("studentModal");
const closeStudentModal = document.getElementById("closeStudentModal");
const studentModalTitle = document.getElementById("studentModalTitle");
const studentModalSub = document.getElementById("studentModalSub");
const studentModalBody = document.getElementById("studentModalBody");
const studentSearch = document.getElementById("studentSearch");
const studentPagination = document.getElementById("studentPagination");

const generateModal = document.getElementById("generateModal");
const closeGenerateModal = document.getElementById("closeGenerateModal");
const genStudentSummary = document.getElementById("gen-student-summary");
const genPhoto = document.getElementById("gen-photo");
const genName = document.getElementById("gen-name");
const genRoll = document.getElementById("gen-roll");
const genClass = document.getElementById("gen-class");
const genSchoolName = document.getElementById("gen-school-name");
const genExamName = document.getElementById("gen-exam-name");

const downloadGen = document.getElementById("downloadGen");
const printGen = document.getElementById("printGen");
const markGenerated = document.getElementById("markGenerated");

const pdfRenderArea = document.getElementById("pdf-render-area");
const logoutBtn = document.getElementById("logout-btn");

/* State */
let currentClass = null;
let allStudentsForClass = [];
let filteredStudents = [];
let currentPage = 1;
const PAGE_SIZE = 10;

let currentGenStudent = null;
let ownerProfile = null;

/* Hidden file input for photo upload */
const uploadPhotoInput = document.createElement("input");
uploadPhotoInput.type = "file";
uploadPhotoInput.accept = "image/*";
uploadPhotoInput.style.display = "none";
document.body.appendChild(uploadPhotoInput);

/* Render class cards */
function renderClassCards(){
  if(!classGrid) return;
  classGrid.innerHTML = "";
  for(let i=1;i<=12;i++){
    const card = document.createElement("div");
    card.className = "class-card";
    card.dataset.cls = String(i);
    card.innerHTML = `<div class="num">Class ${i}</div><div class="sub">Tap to view students</div>`;
    card.addEventListener("click", ()=> openStudentModal(String(i)));
    classGrid.appendChild(card);
  }
  if(academicDisplay) academicDisplay.textContent = getSelectedAcademicYear();
}

/* Load owner profile from DB */
async function loadOwnerProfile(uid){
  try {
    let ref = db.collection('owners').doc(uid);
    let snap = await ref.get();
    if(!snap.exists){
      ref = db.collection('schools').doc(uid);
      snap = await ref.get();
    }
    if(snap.exists) ownerProfile = snap.data();
  } catch(err){
    console.warn("loadOwnerProfile failed:", err);
  }
}

/* Open student modal and fetch students */
async function openStudentModal(cls){
  if(!studentModal) return;
  currentClass = cls;
  studentModalTitle.textContent = `Class ${cls} Students`;
  studentModalSub.textContent = "Loading students...";
  studentModalBody.innerHTML = "";
  show(studentModal);

  allStudentsForClass = [];
  filteredStudents = [];
  currentPage = 1;
  studentSearch.value = "";

  try {
    const user = auth.currentUser;
    if(!user){
      studentModalSub.textContent = "Sign-in required to load students.";
      return;
    }
    if(!ownerProfile) await loadOwnerProfile(user.uid);

    const academicYear = getSelectedAcademicYear();
    let docs = [];
    const attempts = ["studentClass","class"];
    for(const field of attempts){
      try {
        let q = db.collection("students")
                  .where("ownerId","==", user.uid)
                  .where("academicYear","==", academicYear)
                  .where(field,"==", String(cls))
                  .orderBy("roll");
        const snap = await q.get();
        if(!snap.empty){ docs = snap.docs; break; }
      } catch(e){
        try {
          const snap = await db.collection("students")
                        .where("ownerId","==", user.uid)
                        .where("academicYear","==", academicYear)
                        .where(field,"==", String(cls)).get();
          if(!snap.empty){ docs = snap.docs; break; }
        } catch(e2){}
      }
    }

    if(!docs.length){
      studentModalSub.textContent = `No students found for class ${cls}.`;
      return;
    }

    allStudentsForClass = docs.map(d=>({ id: d.id, data: d.data() }));
    filteredStudents = [...allStudentsForClass];
    studentModalSub.textContent = `Found ${allStudentsForClass.length} student(s) for class ${cls}.`;
    renderStudentPage();
  } catch(err){
    console.error("openStudentModal error:", err);
    studentModalSub.textContent = "Error loading students — check console.";
  }
}

/* Render student page */
function renderStudentPage(){
  if(!studentModalBody) return;
  studentModalBody.innerHTML = "";
  const total = filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if(currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage-1)*PAGE_SIZE;
  const end = Math.min(total, start + PAGE_SIZE);

  for(let i=start;i<end;i++){
    const s = filteredStudents[i];
    const tr = document.createElement("tr");
    const idx = i+1;
    const name = escapeHtml(s.data.name || "-");
    const roll = escapeHtml(s.data.roll || "-");
    const generated = !!s.data.admitCardCreated;
    const badge = generated ? `<span class="badge generated">Generated</span>` : `<span class="badge not-generated">Not Generated</span>`;

    tr.innerHTML = `
      <td>${idx}</td>
      <td>${name}</td>
      <td>${roll}</td>
      <td>${badge}</td>
      <td style="display:flex;gap:8px;align-items:center">
        <button class="action-btn btn-primary" data-action="generate" data-id="${s.id}">Generate</button>
        <button class="action-btn" data-action="mark" data-id="${s.id}" ${generated? 'disabled':''}>${generated? 'Generated':'Mark Generated'}</button>
      </td>
    `;

    tr.addEventListener("click", (e)=> {
      const btn = e.target.closest("button[data-action]");
      if(!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const stud = filteredStudents.find(x=> x.id === id);
      if(!stud) return;
      if(action === "generate") openGenerateModalWithStudent(id, stud.data);
      if(action === "mark") markAdmitCardGenerated(id, btn);
    });

    studentModalBody.appendChild(tr);
  }

  renderPaginationControls(total, PAGE_SIZE);
}

/* Pagination controls */
function renderPaginationControls(total, pageSize){
  if(!studentPagination) return;
  studentPagination.innerHTML = "";
  const totalPages = Math.max(1, Math.ceil(total/pageSize));
  const prev = document.createElement("button");
  prev.className = "page-btn";
  prev.textContent = "Prev";
  prev.disabled = currentPage <= 1;
  prev.addEventListener("click", ()=> { if(currentPage>1){ currentPage--; renderStudentPage(); } });
  studentPagination.appendChild(prev);

  const from = Math.max(1, currentPage - 2);
  const to = Math.min(totalPages, currentPage + 2);
  for(let p=from;p<=to;p++){
    const pbtn = document.createElement("button");
    pbtn.className = "page-btn";
    pbtn.textContent = p;
    if(p === currentPage) pbtn.style.fontWeight = "700";
    pbtn.addEventListener("click", ()=> { currentPage = p; renderStudentPage(); });
    studentPagination.appendChild(pbtn);
  }

  const next = document.createElement("button");
  next.className = "page-btn";
  next.textContent = "Next";
  next.disabled = currentPage >= totalPages;
  next.addEventListener("click", ()=> { if(currentPage<totalPages){ currentPage++; renderStudentPage(); } });
  studentPagination.appendChild(next);

  const info = document.createElement("span");
  info.style.marginLeft = "10px";
  info.style.color = "#666";
  info.textContent = ` ${Math.max(0, total)} student(s) — page ${currentPage}/${totalPages}`;
  studentPagination.appendChild(info);
}

/* Search */
if(studentSearch){
  studentSearch.addEventListener("input", ()=> {
    const q = (studentSearch.value||"").trim().toLowerCase();
    if(!q){ filteredStudents = [...allStudentsForClass]; currentPage = 1; renderStudentPage(); return; }
    filteredStudents = allStudentsForClass.filter(s=>{
      const name = (s.data.name||"").toLowerCase();
      const roll = String(s.data.roll||"").toLowerCase();
      return name.includes(q) || roll.includes(q);
    });
    currentPage = 1;
    renderStudentPage();
  });
}

/* Open generate modal with student */
function openGenerateModalWithStudent(docId, data){
  currentGenStudent = { id: docId, data };
  genStudentSummary.textContent = `${data.name || '-'} — Roll: ${data.roll || '-'} — Class: ${data.studentClass || data.class || '-'}`;
  genName.textContent = data.name || "Student Name";
  genRoll.textContent = `Roll: ${data.roll || '-'}`;
  genClass.textContent = `Class: ${data.studentClass || data.class || '-'}`;

  genPhoto.innerHTML = "";
  genPhoto.style.cursor = "default";
  genPhoto.onclick = null;

  if(data.photoUrl){
    const img = document.createElement("img"); img.src = data.photoUrl; genPhoto.appendChild(img);
  } else {
    genPhoto.textContent = "Upload Photo";
    genPhoto.style.cursor = "pointer";
    genPhoto.onclick = () => uploadPhotoInput.click();
  }

  const savedSchool = localStorage.getItem(LS_SCHOOL_NAME) || (ownerProfile && ownerProfile.schoolName) || "";
  const savedExam = localStorage.getItem(LS_EXAM_NAME) || "";
  genSchoolName.value = savedSchool;
  genExamName.value = savedExam;

  show(generateModal);
}

/* Mark admit card generated */
async function markAdmitCardGenerated(docId, btnElement){
  if(!confirm("Mark this student's admit card as GENERATED?")) return;
  try {
    await db.collection("students").doc(docId).update({ admitCardCreated: true, admitCardCreatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    if(btnElement){
      btnElement.textContent = "Generated";
      btnElement.disabled = true;
      const fsIdx = filteredStudents.findIndex(x=> x.id === docId);
      if(fsIdx>=0){ filteredStudents[fsIdx].data.admitCardCreated = true; }
      const allIdx = allStudentsForClass.findIndex(x=> x.id === docId);
      if(allIdx>=0) allStudentsForClass[allIdx].data.admitCardCreated = true;
      renderStudentPage();
    }
    alert("Marked as generated.");
  } catch(err){
    console.error("markAdmitCardGenerated error:", err);
    alert("Failed to update student (see console).");
  }
}

/* ========== PDF & Print Helpers ========== */

/* Build PDF HTML inside hidden render area */
function buildPdfTemplate(student, opts){
  const schoolName = escapeHtml(opts.schoolName||"Your School");
  const exam = escapeHtml(opts.examName||"Exam");
  const logoUrl = opts.logoUrl || null;
  const studentName = escapeHtml(student.name || "");
  const roll = escapeHtml(student.roll || "");
  const cls = escapeHtml(student.studentClass || student.class || "");
  const father = escapeHtml(student.fatherName || "-");
  const dob = escapeHtml(student.dob || "-");
  const photo = student.photoUrl || null;

  const headerLogo = logoUrl ? `<img src="${logoUrl}" style="height:60px;object-fit:contain;margin-right:12px" />` : "";
  const photoHtml = photo ? `<img src="${photo}" style="width:140px;height:160px;object-fit:cover;border:1px solid #eaeaea" />` : `<div style="width:140px;height:160px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#9aa0a6">Upload Photo</div>`;

  const html = `
    <div style="width:100%;padding:18px;font-family:Inter,Arial,Helvetica;background:#fff;color:#222">
      <div style="display:flex;align-items:center;gap:16px;border-bottom:2px solid #eee;padding-bottom:12px;margin-bottom:12px">
        ${headerLogo}
        <div>
          <div style="font-weight:800;font-size:20px;color:#2b0f6b">${schoolName}</div>
          <div style="margin-top:4px;color:#6b7280">${exam} — Admit Card</div>
        </div>
        <div style="margin-left:auto;text-align:right;color:#6b7280;font-size:12px">Academic Year: ${escapeHtml(getSelectedAcademicYear())}</div>
      </div>

      <div style="display:flex;gap:18px">
        <div style="width:60%;padding-right:12px">
          <div style="font-weight:700;font-size:18px">${studentName}</div>
          <div style="margin-top:6px;color:#6b7280">Father: ${father}</div>
          <div style="margin-top:6px;color:#6b7280">Roll: ${roll} | Class: ${cls}</div>
          <div style="margin-top:6px;color:#6b7280">DOB: ${dob}</div>

          <div style="margin-top:12px;border-top:1px dashed #e6e6e6;padding-top:10px;color:#374151">
            <strong>Instructions:</strong>
            <ol style="margin:8px 0 0 18px">
              <li>Reach exam center 30 minutes early.</li>
              <li>Carry this admit card & valid ID.</li>
              <li>No electronic devices allowed.</li>
            </ol>
          </div>
        </div>

        <div style="width:40%;display:flex;flex-direction:column;align-items:center;gap:12px">
          ${photoHtml}
          <div style="font-size:12px;color:#6b7280">Authorized Signature</div>
          <div style="width:100%;height:1px;background:#eaeaea;margin-top:12px"></div>
        </div>
      </div>

      <div style="margin-top:14px;font-size:11px;color:#9aa0a6">Generated: ${new Date().toLocaleString()}</div>
    </div>
  `;
  pdfRenderArea.innerHTML = html;
}

/* Ensure html2canvas & jspdf loaded */
function ensurePdfLibs(){
  return new Promise((resolve) => {
    const libs = [];
    if(!window.html2canvas) libs.push('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    if(!window.jspdf && !window.jsPDF) libs.push('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    if(libs.length===0) return resolve();
    let loaded=0;
    libs.forEach(src=>{
      const s = document.createElement('script'); s.src = src;
      s.onload = ()=>{ loaded++; if(loaded===libs.length) resolve(); };
      s.onerror = ()=>{ console.warn("Failed to load", src); loaded++; if(loaded===libs.length) resolve(); };
      document.head.appendChild(s);
    });
  });
}

/* Download PDF from generate modal */
async function downloadGenerateModalAsPDF(){
  if(!currentGenStudent) return alert("No student selected.");
  // Save defaults
  if(genSchoolName && genSchoolName.value) localStorage.setItem(LS_SCHOOL_NAME, genSchoolName.value);
  if(genExamName && genExamName.value) localStorage.setItem(LS_EXAM_NAME, genExamName.value);

  // Prepare template
  buildPdfTemplate(currentGenStudent.data, {
    schoolName: genSchoolName.value || (ownerProfile && ownerProfile.schoolName) || "Your School",
    examName: genExamName.value || "Exam",
    logoUrl: ownerProfile && ownerProfile.logoUrl ? ownerProfile.logoUrl : null
  });

  await ensurePdfLibs();
  try {
    // wait a tick for images to load (especially dataURL)
    await new Promise(r => setTimeout(r, 180));

    const el = pdfRenderArea;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging:false });
    const imgData = canvas.toDataURL("image/png");

    // jspdf (umd) exposes window.jspdf.jsPDF or window.jspdf
    let jsPDFConstructor = null;
    if(window.jspdf && window.jspdf.jsPDF) jsPDFConstructor = window.jspdf.jsPDF;
    else if(window.jsPDF) jsPDFConstructor = window.jsPDF;
    else if(window.jspdf) jsPDFConstructor = window.jspdf;
    if(!jsPDFConstructor && window.jspdf && window.jspdf.default) jsPDFConstructor = window.jspdf.default.jsPDF;

    if(!jsPDFConstructor) {
      // fallback: open image in new tab for user to save
      const w = window.open("");
      if(!w) return alert("Please allow popups to download the PDF.");
      w.document.write(`<img src="${imgData}" style="max-width:100%"/>`);
      w.document.close();
      return;
    }

    const widthPx = canvas.width;
    const heightPx = canvas.height;
    // convert pixels to points (approx 72 DPI). We'll use pdf internal units in pt and preserve pixel dims.
    const pdf = new jsPDFConstructor({
      unit: 'px',
      format: [widthPx, heightPx]
    });
    pdf.addImage(imgData, 'PNG', 0, 0, widthPx, heightPx);
    const fname = `${(currentGenStudent.data.name||'student').replace(/\s+/g,'_')}_admit_card.pdf`;
    pdf.save(fname);
  } catch(err){
    console.error("downloadGenerateModalAsPDF error:", err);
    alert("Failed to create PDF (see console).");
  } finally {
    pdfRenderArea.innerHTML = "";
  }
}

/* Print using same template */
async function printGenerateModal(){
  if(!currentGenStudent) return alert("No student selected.");
  // Save defaults
  if(genSchoolName && genSchoolName.value) localStorage.setItem(LS_SCHOOL_NAME, genSchoolName.value);
  if(genExamName && genExamName.value) localStorage.setItem(LS_EXAM_NAME, genExamName.value);

  buildPdfTemplate(currentGenStudent.data, {
    schoolName: genSchoolName.value || (ownerProfile && ownerProfile.schoolName) || "Your School",
    examName: genExamName.value || "Exam",
    logoUrl: ownerProfile && ownerProfile.logoUrl ? ownerProfile.logoUrl : null
  });

  await ensurePdfLibs();
  try {
    // wait for images to load
    await new Promise(r => setTimeout(r, 180));
    const el = pdfRenderArea;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging:false });
    const imgData = canvas.toDataURL("image/png");

    const w = window.open("");
    if(!w) return alert("Please allow popups to print");
    w.document.write(`<html><head><title>Print Admit Card</title></head><body style="margin:0"><img src="${imgData}" style="max-width:100%;height:auto"/></body></html>`);
    w.document.close();
    // give the new window a moment to render
    setTimeout(()=> { w.focus(); w.print(); }, 350);
  } catch(err){
    console.error("printGenerateModal error:", err);
    alert("Failed to print (see console).");
  } finally {
    pdfRenderArea.innerHTML = "";
  }
}

/* Save defaults when both fields entered */
function attemptSaveDefaults(){
  try {
    const s = (genSchoolName && genSchoolName.value || "").trim();
    const e = (genExamName && genExamName.value || "").trim();
    if(s && e){
      localStorage.setItem(LS_SCHOOL_NAME, s);
      localStorage.setItem(LS_EXAM_NAME, e);
    }
  } catch(err){
    console.warn("attemptSaveDefaults error", err);
  }
}
if(genSchoolName) genSchoolName.addEventListener('input', attemptSaveDefaults);
if(genExamName) genExamName.addEventListener('input', attemptSaveDefaults);

/* Upload photo input handler */
uploadPhotoInput.addEventListener("change", function() {
  const file = this.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = function(e){
    genPhoto.innerHTML = "";
    const img = document.createElement("img");
    img.src = e.target.result;
    genPhoto.appendChild(img);

    // Save temp preview in current student object so PDF uses it
    if(currentGenStudent){
      currentGenStudent.data.photoUrl = e.target.result;
    }
  };
  reader.readAsDataURL(file);
});

/* Close modals handlers */
if(closeStudentModal) closeStudentModal.addEventListener('click', ()=> {
  hide(studentModal);
  studentModalBody.innerHTML = "";
  allStudentsForClass = [];
  filteredStudents = [];
  currentPage = 1;
});
if(closeGenerateModal) closeGenerateModal.addEventListener('click', ()=> {
  hide(generateModal);
  currentGenStudent = null;
});

/* Wire download/print/mark buttons */
if(downloadGen) downloadGen.addEventListener('click', downloadGenerateModalAsPDF);
if(printGen) printGen.addEventListener('click', printGenerateModal);
if(markGenerated) markGenerated.addEventListener('click', async ()=> {
  if(!currentGenStudent) return alert("No student selected");
  await markAdmitCardGenerated(currentGenStudent.id, null);
});

/* Mark generated helper used above too */
async function markAdmitCardGenerated(docId, btnElement){
  if(!confirm("Mark this student's admit card as GENERATED?")) return;
  try {
    await db.collection("students").doc(docId).update({ admitCardCreated: true, admitCardCreatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    if(btnElement){
      btnElement.textContent = "Generated";
      btnElement.disabled = true;
      const fsIdx = filteredStudents.findIndex(x=> x.id === docId);
      if(fsIdx>=0){ filteredStudents[fsIdx].data.admitCardCreated = true; }
      const allIdx = allStudentsForClass.findIndex(x=> x.id === docId);
      if(allIdx>=0) allStudentsForClass[allIdx].data.admitCardCreated = true;
      renderStudentPage();
    } else {
      // if no button provided, refresh list
      renderStudentPage();
    }
    alert("Marked as generated.");
  } catch(err){
    console.error("markAdmitCardGenerated error:", err);
    alert("Failed to update student (see console).");
  }
}

/* Logout */
if(logoutBtn) logoutBtn.addEventListener('click', async ()=> {
  try { await auth.signOut(); alert('Signed out'); location.reload(); } catch(e){ console.error(e); alert('Sign out failed'); }
});

/* Auth listener: load owner profile and render class grid */
auth.onAuthStateChanged(async (user)=>{
  if(!user) {
    console.log("Not signed in — waiting for sign in");
    return;
  }
  await loadOwnerProfile(user.uid);
  // If local defaults missing, try to set from ownerProfile
  const savedSchool = localStorage.getItem(LS_SCHOOL_NAME);
  if(!savedSchool && ownerProfile && ownerProfile.schoolName) localStorage.setItem(LS_SCHOOL_NAME, ownerProfile.schoolName);
  renderClassCards();
});
