const role = (localStorage.getItem("role") || "").trim();

const categoryInput = document.getElementById("categoryInput");
const questionInput = document.getElementById("questionInput");
const usedInInput = document.getElementById("usedInInput");
const typeInput = document.getElementById("typeInput");
const statusInput = document.getElementById("statusInput");
const btnAddQuestion = document.getElementById("btnAddQuestion");
const btnClearDemo = document.getElementById("btnClearDemo");
const questionTableBody = document.getElementById("questionTableBody");

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

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json.error || "เกิดข้อผิดพลาด");
  }

  return json;
}

async function loadQuestions() {
  const rows = await api(`/api/admin/questions?role=${encodeURIComponent(role)}`);

  if (!rows.length) {
    questionTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty">ยังไม่มีคำถามกลาง</td>
      </tr>
    `;
    return;
  }

  questionTableBody.innerHTML = rows
    .map((q, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(q.category)}</td>
          <td>${esc(q.question_text)}</td>
          <td>${esc(q.used_in_label)}</td>
          <td><span class="badge ${esc(q.question_type)}">${esc(q.question_type)}</span></td>
          <td>${q.status === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"}</td>
          <td>
            <button class="btn danger" onclick="deleteQuestion(${q.id})">ลบ</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function addQuestion() {
  const category = categoryInput.value.trim();
  const question_text = questionInput.value.trim();
  const datalist_id = usedInInput.value.trim();
  const used_in_label =
    usedInInput.options[usedInInput.selectedIndex]?.textContent.trim() || "";
  const question_type = typeInput.value;
  const status = statusInput.value;

  if (!category || !question_text || !datalist_id) {
    alert("กรุณากรอกหมวดคำถาม คำถาม และเลือก Dropdown/หัวข้อ");
    return;
  }

  await api(`/api/admin/questions?role=${encodeURIComponent(role)}`, {
    method: "POST",
    body: JSON.stringify({
      category,
      question_text,
      used_in_label,
      datalist_id,
      question_type,
      status,
    }),
  });

  categoryInput.value = "";
  questionInput.value = "";
  usedInInput.value = "";
  typeInput.value = "rating";
  statusInput.value = "active";

  await loadQuestions();
}

async function deleteQuestion(id) {
  if (!confirm("ต้องการลบคำถามนี้ใช่ไหม?")) return;

  await api(`/api/admin/questions/${id}?role=${encodeURIComponent(role)}`, {
    method: "DELETE",
  });

  await loadQuestions();
}

window.deleteQuestion = deleteQuestion;

btnAddQuestion.addEventListener("click", addQuestion);

if (btnClearDemo) {
  btnClearDemo.style.display = "none";
}

guardAdmin();
loadQuestions();