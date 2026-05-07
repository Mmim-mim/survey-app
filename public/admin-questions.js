const role = (localStorage.getItem("role") || "").trim();

const categoryInput = document.getElementById("categoryInput");
const questionInput = document.getElementById("questionInput");
const typeInput = document.getElementById("typeInput");
const statusInput = document.getElementById("statusInput");
const btnAddQuestion = document.getElementById("btnAddQuestion");
const btnClearDemo = document.getElementById("btnClearDemo");
const questionTableBody = document.getElementById("questionTableBody");

let questions = JSON.parse(localStorage.getItem("questionBankDemo") || "[]");

function guardAdmin() {
  if (role !== "admin") {
    alert("หน้านี้สำหรับ admin เท่านั้น");
    window.location.href = "dashboard.html";
  }
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function saveQuestions() {
  localStorage.setItem("questionBankDemo", JSON.stringify(questions));
}

function renderQuestions() {
  if (!questions.length) {
    questionTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">ยังไม่มีคำถามกลาง</td>
      </tr>
    `;
    return;
  }

  questionTableBody.innerHTML = questions
    .map((q, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(q.category)}</td>
          <td>${esc(q.question)}</td>
          <td>
            <span class="badge ${esc(q.type)}">${esc(q.type)}</span>
          </td>
          <td>${q.status === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"}</td>
          <td>
            <button class="btn danger" onclick="deleteQuestion(${index})">ลบ</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function addQuestion() {
  const category = categoryInput.value.trim();
  const question = questionInput.value.trim();
  const type = typeInput.value;
  const status = statusInput.value;

  if (!category || !question) {
    alert("กรุณากรอกหมวดคำถามและคำถาม");
    return;
  }

  questions.push({
    category,
    question,
    type,
    status,
  });

  saveQuestions();

  categoryInput.value = "";
  questionInput.value = "";
  typeInput.value = "rating";
  statusInput.value = "active";

  renderQuestions();
}

function deleteQuestion(index) {
  if (!confirm("ต้องการลบคำถามนี้ใช่ไหม?")) return;

  questions.splice(index, 1);
  saveQuestions();
  renderQuestions();
}

function clearDemo() {
  if (!confirm("ต้องการล้างข้อมูลคำถามตัวอย่างทั้งหมดใช่ไหม?")) return;

  questions = [];
  saveQuestions();
  renderQuestions();
}

window.deleteQuestion = deleteQuestion;

btnAddQuestion.addEventListener("click", addQuestion);
btnClearDemo.addEventListener("click", clearDemo);

guardAdmin();
renderQuestions();