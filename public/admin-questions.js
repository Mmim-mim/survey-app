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
let questionOptions = [];
let selectedCategory = "";

function guardAdmin() {
  if (role !== "admin") {
    alert("หน้านี้สำหรับ admin เท่านั้น");
    window.location.href = "dashboard.html";
  }
}

function esc(value) {
  return String(value ?? "")
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

function getDisplayLabel(q) {
  return String(q.display_used_in_label || q.used_in_label || "").trim();
}

function getDisplayCategory(q) {
  return String(q.display_category || q.category_title || q.category || "อื่น ๆ").trim();
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
            value="${esc(item.group_id || item.datalist_id)}"
            data-group-id="${esc(item.group_id || "")}"
            data-category="${esc(item.category_title || item.category || "")}"
            data-used-in-label="${esc(item.used_in_label || "")}"
            data-datalist-id="${esc(item.datalist_id || "")}"
          >
            ${esc(item.used_in_label || "")}
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

  renderCategoryList();
  applyQuestionFilters();
}

function renderCategoryList() {
  if (!categoryList) return;

  const countMap = new Map();

  allQuestions.forEach((q) => {
    const category = getDisplayCategory(q);
    countMap.set(category, (countMap.get(category) || 0) + 1);
  });

  const categories = Array.from(countMap.keys()).sort((a, b) =>
    a.localeCompare(b, "th"),
  );

  categoryList.innerHTML = `
    <button
      type="button"
      class="category-btn ${selectedCategory === "" ? "active" : ""}"
      data-category=""
    >
      <span>ทั้งหมด</span>
      <span class="category-count">${allQuestions.length}</span>
    </button>

    ${categories
      .map((cat) => {
        const active = selectedCategory === cat ? "active" : "";

        return `
          <button
            type="button"
            class="category-btn ${active}"
            data-category="${esc(cat)}"
          >
            <span>${esc(cat)}</span>
            <span class="category-count">${countMap.get(cat) || 0}</span>
          </button>
        `;
      })
      .join("")}
  `;

  categoryList.querySelectorAll(".category-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCategory = btn.dataset.category || "";
      renderCategoryList();
      applyQuestionFilters();
    });
  });
}

function applyQuestionFilters() {
  const keyword = String(searchQuestionInput?.value || "")
    .trim()
    .toLowerCase();

  const sortType = String(sortQuestionSelect?.value || "newest");

  let rows = allQuestions.filter((q) => {
    const questionText = String(q.question_text || "").toLowerCase();
    const label = getDisplayLabel(q).toLowerCase();
    const category = getDisplayCategory(q);

    const matchKeyword =
      !keyword || questionText.includes(keyword) || label.includes(keyword);

    const matchCategory = !selectedCategory || category === selectedCategory;

    return matchKeyword && matchCategory;
  });

  switch (sortType) {
    case "oldest":
      rows.sort((a, b) => Number(a.id) - Number(b.id));
      break;
    case "az":
      rows.sort((a, b) =>
        String(a.question_text || "").localeCompare(
          String(b.question_text || ""),
          "th",
        ),
      );
      break;
    case "za":
      rows.sort((a, b) =>
        String(b.question_text || "").localeCompare(
          String(a.question_text || ""),
          "th",
        ),
      );
      break;
    default:
      rows.sort((a, b) => Number(b.id) - Number(a.id));
      break;
  }

  renderQuestions(rows);
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
          <td>${esc(getDisplayLabel(q))}</td>
          <td>
            <span class="badge ${esc(q.question_type)}">
              ${esc(q.question_type)}
            </span>
          </td>
          <td>${q.status === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"}</td>
          <td>
            <button
              type="button"
              class="btn danger"
              onclick="deleteQuestion(${q.id})"
            >
              ลบ
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function addQuestion() {
  const selectedOption = usedInInput.options[usedInInput.selectedIndex];

  const question_text = questionInput.value.trim();
  const group_id = Number(selectedOption?.dataset.groupId || 0);
  const category = selectedOption?.dataset.category || "";
  const used_in_label = selectedOption?.dataset.usedInLabel || "";
  const datalist_id = selectedOption?.dataset.datalistId || "";
  const question_type = typeInput.value;
  const status = statusInput.value;

  if (!question_text) {
    alert("กรุณากรอกคำถาม");
    return;
  }

  if (!group_id && (!category || !used_in_label || !datalist_id)) {
    alert("กรุณาเลือก Dropdown/หัวข้อ");
    return;
  }

  await api(`/api/admin/questions?role=${encodeURIComponent(role)}`, {
    method: "POST",
    body: JSON.stringify({
      group_id: group_id || null,
      category,
      used_in_label,
      datalist_id,
      question_text,
      question_type,
      status,
    }),
  });

  questionInput.value = "";
  usedInInput.value = "";
  typeInput.value = "rating";
  statusInput.value = "active";

  await loadQuestions();
  alert("เพิ่มคำถามเรียบร้อย");
}

async function deleteQuestion(id) {
  const ok = confirm("ต้องการลบคำถามนี้ใช่หรือไม่?");
  if (!ok) return;

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

  const ok = confirm(`ต้องการลบคำถามที่เลือกทั้งหมด ${ids.length} รายการใช่ไหม?`);
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

    await loadQuestions();
    alert("ลบคำถามที่เลือกเรียบร้อยแล้ว");
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

if (btnAddQuestion) {
  btnAddQuestion.addEventListener("click", addQuestion);
}

if (btnClearDemo) {
  btnClearDemo.style.display = "none";
}

if (searchQuestionInput) {
  searchQuestionInput.addEventListener("input", applyQuestionFilters);
}

if (sortQuestionSelect) {
  sortQuestionSelect.addEventListener("change", applyQuestionFilters);
}

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
  } catch (err) {
    console.error("โหลด Dropdown ไม่สำเร็จ:", err);
    alert("โหลดหัวข้อ Dropdown ไม่สำเร็จ แต่จะโหลดรายการคำถามเดิมให้ก่อน");
  }

  try {
    await loadQuestions();
  } catch (err) {
    console.error("โหลดคำถามไม่สำเร็จ:", err);
    alert(err.message || "โหลดรายการคำถามไม่สำเร็จ");
  }
})();