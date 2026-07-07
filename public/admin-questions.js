const role = (localStorage.getItem("role") || "").trim();

const questionInput = document.getElementById("questionInput");
const usedInInput = document.getElementById("usedInInput");
const typeInput = document.getElementById("typeInput");
const statusInput = document.getElementById("statusInput");
const btnAddQuestion = document.getElementById("btnAddQuestion");
const btnClearDemo = document.getElementById("btnClearDemo");
const questionTableBody = document.getElementById("questionTableBody");
const searchQuestionInput = document.getElementById("searchQuestionInput");

const sortQuestionSelect = document.getElementById("sortQuestionSelect");
const categoryList = document.getElementById("categoryList");
const checkAllQuestions = document.getElementById("checkAllQuestions");
const btnDeleteSelected = document.getElementById("btnDeleteSelected");

let allQuestions = [];
let selectedCategory = "";
let questionOptions = [];

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

async function loadQuestionOptions() {
  questionOptions = await api(
    `/api/admin/question-options?role=${encodeURIComponent(role)}`,
  );

  usedInInput.innerHTML = `
    <option value="">-- เลือกหัวข้อ --</option>
    ${questionOptions
      .map(
        (item) => `
          <option
            value="${esc(item.datalist_id)}"
            data-category="${esc(item.category)}"
            data-used-in-label="${esc(item.used_in_label)}"
          >
            ${esc(item.used_in_label)}
          </option>
        `,
      )
      .join("")}
  `;
}

async function loadQuestions() {
  allQuestions = await api(
    `/api/admin/questions?role=${encodeURIComponent(role)}`,
  );

  renderCategoryList(allQuestions);
  applyQuestionFilters();
}

function getQuestionCategory(q) {
  const label = String(q.used_in_label || "").trim();

  if (label.includes("ฝ่ายที่สังกัด") || label === "ฝ่ายที่สังกัด") {
    return "ฝ่ายที่สังกัด";
  }

  if (label.includes("พันธกิจ")) {
    return "พันธกิจศูนย์บรรณสาร";
  }

  if (label.includes("ยุทธศาสตร์มหาวิทยาลัย")) {
    return "ยุทธศาสตร์มหาวิทยาลัย";
  }

  if (label.includes("ยุทธศาสตร์ศูนย์บรรณสาร")) {
    return "ยุทธศาสตร์ศูนย์บรรณสาร";
  }

  if (label.includes("LibQUAL")) return "LibQUAL+TM";
  if (label.includes("SERVQUAL")) return "SERVQUAL";
  if (label.includes("WEBQUAL")) return "WEBQUAL";
  if (label.includes("SiteQUAL")) return "SiteQUAL";
  if (label.includes("EQUAL")) return "EQUAL";
  if (label.includes("ความไม่พึงพอใจ")) return "ความไม่พึงพอใจ";
  if (label.includes("ความผูกพัน")) return "ความผูกพัน";

  return "อื่น ๆ";
}

function renderCategoryList(rows) {
  if (!categoryList) return;

  const categories = [
    "ทั้งหมด",
    "ฝ่ายที่สังกัด",
    "พันธกิจศูนย์บรรณสาร",
    "ยุทธศาสตร์มหาวิทยาลัย",
    "ยุทธศาสตร์ศูนย์บรรณสาร",
    "LibQUAL+TM",
    "SERVQUAL",
    "WEBQUAL",
    "SiteQUAL",
    "EQUAL",
    "ความไม่พึงพอใจ",
    "ความผูกพัน",
    "อื่น ๆ",
  ];

  const countMap = {};
  rows.forEach((q) => {
    const cat = getQuestionCategory(q);
    countMap[cat] = (countMap[cat] || 0) + 1;
  });

  categoryList.innerHTML = categories
    .map((cat) => {
      const value = cat === "ทั้งหมด" ? "" : cat;
      const count = cat === "ทั้งหมด" ? rows.length : countMap[cat] || 0;
      const active = selectedCategory === value ? "active" : "";

      return `
        <button
          type="button"
          class="category-btn ${active}"
          data-category="${esc(value)}"
        >
          <span>${esc(cat)}</span>
          <span class="category-count">${count}</span>
        </button>
      `;
    })
    .join("");

  categoryList.querySelectorAll(".category-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCategory = btn.dataset.category || "";
      renderCategoryList(allQuestions);
      applyQuestionFilters();
    });
  });
}

function applyQuestionFilters() {
  const keyword = String(searchQuestionInput.value || "")
    .trim()
    .toLowerCase();

  const sortType = String(sortQuestionSelect.value || "newest");

  let filtered = allQuestions.filter((q) => {
    const questionText = String(q.question_text || "").toLowerCase();
    const usedInLabel = String(q.used_in_label || "").trim();
    const category = getQuestionCategory(q);

    const matchKeyword =
      !keyword ||
      questionText.includes(keyword) ||
      usedInLabel.toLowerCase().includes(keyword);

    const matchCategory = !selectedCategory || category === selectedCategory;

    return matchKeyword && matchCategory;
  });

  switch (sortType) {
    case "oldest":
      filtered.sort((a, b) => a.id - b.id);
      break;

    case "az":
      filtered.sort((a, b) =>
        String(a.question_text || "").localeCompare(
          String(b.question_text || ""),
          "th",
        ),
      );
      break;

    case "za":
      filtered.sort((a, b) =>
        String(b.question_text || "").localeCompare(
          String(a.question_text || ""),
          "th",
        ),
      );
      break;

    default:
      filtered.sort((a, b) => b.id - a.id);
      break;
  }

  renderQuestions(filtered);
}
function renderQuestions(rows) {
  if (checkAllQuestions) {
    checkAllQuestions.checked = false;
  }

  if (!rows.length) {
    questionTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty">ไม่พบคำถามที่ตรงกับเงื่อนไข</td>
      </tr>
    `;
    return;
  }

  questionTableBody.innerHTML = rows
    .map((q, index) => {
      return `
        <tr>
          <td>
            <input
              type="checkbox"
              class="question-check"
              value="${q.id}"
              title="เลือกคำถามนี้"
            />
          </td>
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
  async function addQuestion() {
    const selectedOption = usedInInput.options[usedInInput.selectedIndex];

    const question_text = questionInput.value.trim();
    const datalist_id = usedInInput.value.trim();
    const used_in_label = selectedOption?.dataset.usedInLabel || "";
    const category = selectedOption?.dataset.category || "";
    const question_type = typeInput.value;
    const status = statusInput.value;

    if (!question_text || !datalist_id || !used_in_label || !category) {
      alert("กรุณากรอกคำถาม และเลือก Dropdown/หัวข้อ");
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

    questionInput.value = "";
    usedInInput.value = "";
    typeInput.value = "rating";
    statusInput.value = "active";

    await loadQuestions();
  }
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

function getSelectedQuestionIds() {
  return Array.from(document.querySelectorAll(".question-check:checked"))
    .map((el) => Number(el.value))
    .filter(Boolean);
}

async function deleteSelectedQuestions() {
  const ids = getSelectedQuestionIds();

  if (!ids.length) {
    alert("กรุณาเลือกคำถามที่ต้องการลบ");
    return;
  }

  const ok = confirm(
    `ต้องการลบคำถามที่เลือกทั้งหมด ${ids.length} รายการใช่ไหม?`,
  );

  if (!ok) return;

  try {
    if (btnDeleteSelected) {
      btnDeleteSelected.disabled = true;
      btnDeleteSelected.textContent = "กำลังลบ...";
    }

    for (const id of ids) {
      await api(`/api/admin/questions/${id}?role=${encodeURIComponent(role)}`, {
        method: "DELETE",
      });
    }

    alert("ลบคำถามที่เลือกเรียบร้อยแล้ว");
    await loadQuestions();
  } catch (err) {
    alert(err.message || "ลบคำถามไม่สำเร็จ");
  } finally {
    if (btnDeleteSelected) {
      btnDeleteSelected.disabled = false;
      btnDeleteSelected.textContent = "ลบที่เลือก";
    }
  }
}

window.deleteQuestion = deleteQuestion;

btnAddQuestion.addEventListener("click", addQuestion);

if (btnClearDemo) {
  btnClearDemo.style.display = "none";
}

searchQuestionInput.addEventListener("input", applyQuestionFilters);

sortQuestionSelect.addEventListener("change", applyQuestionFilters);

if (checkAllQuestions) {
  checkAllQuestions.addEventListener("change", () => {
    document.querySelectorAll(".question-check").forEach((cb) => {
      cb.checked = checkAllQuestions.checked;
    });
  });
}

if (btnDeleteSelected) {
  btnDeleteSelected.addEventListener("click", deleteSelectedQuestions);
}

guardAdmin();

(async function init() {
  try {
    await loadQuestionOptions();
    await loadQuestions();
  } catch (err) {
    console.error(err);
    alert(err.message || "โหลดข้อมูลไม่สำเร็จ");
  }
})();
