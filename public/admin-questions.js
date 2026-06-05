const role = (localStorage.getItem("role") || "").trim();

const questionInput = document.getElementById("questionInput");
const usedInInput = document.getElementById("usedInInput");
const typeInput = document.getElementById("typeInput");
const statusInput = document.getElementById("statusInput");
const btnAddQuestion = document.getElementById("btnAddQuestion");
const btnClearDemo = document.getElementById("btnClearDemo");
const questionTableBody = document.getElementById("questionTableBody");
const searchQuestionInput = document.getElementById("searchQuestionInput");
const filterDropdownSelect = document.getElementById("filterDropdownSelect");
const sortQuestionSelect = document.getElementById("sortQuestionSelect");

let allQuestions = [];

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
  allQuestions = await api(
    `/api/admin/questions?role=${encodeURIComponent(role)}`,
  );

  renderFilterDropdown(allQuestions);
  applyQuestionFilters();
}

function renderFilterDropdown(rows) {
  const currentValue = filterDropdownSelect.value;

  const labels = [
    ...new Set(
      rows.map((q) => String(q.used_in_label || "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "th"));

  filterDropdownSelect.innerHTML = `
    <option value="">ทั้งหมด</option>
    ${labels
      .map(
        (label) => `
          <option value="${esc(label)}">
            ${esc(label)}
          </option>
        `,
      )
      .join("")}
  `;

  filterDropdownSelect.value = currentValue;
}

function applyQuestionFilters() {
  const keyword = String(searchQuestionInput.value || "")
    .trim()
    .toLowerCase();

  const selectedDropdown = String(filterDropdownSelect.value || "").trim();

  const sortType = String(sortQuestionSelect.value || "newest");

  let filtered = allQuestions.filter((q) => {
    const questionText = String(q.question_text || "").toLowerCase();

    const usedInLabel = String(q.used_in_label || "").trim();

    const matchKeyword = !keyword || questionText.includes(keyword);

    const matchDropdown = !selectedDropdown || usedInLabel === selectedDropdown;

    return matchKeyword && matchDropdown;
  });

  switch (sortType) {
    case "oldest":
      filtered.sort((a, b) => a.id - b.id);
      break;

    case "az":
      filtered.sort((a, b) =>
        String(a.question_text).localeCompare(String(b.question_text), "th"),
      );
      break;

    case "za":
      filtered.sort((a, b) =>
        String(b.question_text).localeCompare(String(a.question_text), "th"),
      );
      break;

    default:
      filtered.sort((a, b) => b.id - a.id);
      break;
  }

  renderQuestions(filtered);
}

function renderQuestions(rows) {
  if (!rows.length) {
    questionTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">ไม่พบคำถามที่ตรงกับเงื่อนไข</td>
      </tr>
    `;
    return;
  }

  questionTableBody.innerHTML = rows
    .map((q, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
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
  const question_text = questionInput.value.trim();
  const datalist_id = usedInInput.value.trim();
  const used_in_label =
    usedInInput.options[usedInInput.selectedIndex]?.textContent.trim() || "";
  const question_type = typeInput.value;
  const status = statusInput.value;

  if (!question_text || !datalist_id) {
    alert("กรุณากรอกคำถาม และเลือก Dropdown/หัวข้อ");
    return;
  }
  await api(`/api/admin/questions?role=${encodeURIComponent(role)}`, {
    method: "POST",
    body: JSON.stringify({
      category: used_in_label,
      question_text,
      used_in_label,
      datalist_id,
      question_type,
      status,
    }),
  });

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

searchQuestionInput.addEventListener("input", applyQuestionFilters);
filterDropdownSelect.addEventListener("change", applyQuestionFilters);
sortQuestionSelect.addEventListener("change", applyQuestionFilters);

guardAdmin();
loadQuestions();
