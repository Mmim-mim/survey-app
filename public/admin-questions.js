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

const bankYear = document.getElementById("bankYear");
const newBankYear = document.getElementById("newBankYear");
let existingFiscalYears = [];
const yearMessage = document.getElementById("bankYearMessage");
let editingQuestionId = null;
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
  const requestYear = bankYear.value || "legacy";
  if (!path.includes("/question-bank/years")) {
    path += (path.includes("?") ? "&" : "?") + new URLSearchParams({ fiscal_year: bankYear.value || "legacy" });
  }
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

  if (requestYear !== (bankYear.value || "legacy")) throw new Error("ปีงบประมาณเปลี่ยนแล้ว กรุณาลองใหม่");
  return json;
}

function getDisplayLabel(q) {
  return String(q.display_used_in_label || q.used_in_label || "").trim();
}

function getDisplayCategory(q) {
  return String(q.display_category || q.category_title || q.category || "อื่น ๆ").trim();
}

function sortQuestionOptions(options) {
  const types = ["LibQUAL+", "SERVQUAL", "WEBQUAL", "SiteQUAL", "ESQUAL"];
  const category = item => String(item.category_title || item.category || "").trim();
  const rank = item => {
    const index = types.findIndex(type => type.toLowerCase() === category(item).toLowerCase());
    return index < 0 ? types.length : index;
  };
  const order = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? Number.MAX_SAFE_INTEGER : Number(value);
  return [...options].sort((a, b) => rank(a) - rank(b)
    || order(a.category_sort_order) - order(b.category_sort_order)
    || order(a.category_sort_id ?? a.category_id) - order(b.category_sort_id ?? b.category_id)
    || category(a).localeCompare(category(b), "th")
    || order(a.group_sort_order) - order(b.group_sort_order)
    || order(a.group_sort_id ?? a.group_id) - order(b.group_sort_id ?? b.group_id)
    || order(a.question_sort_order) - order(b.question_sort_order)
    || order(a.question_id) - order(b.question_id)
    || String(a.used_in_label || "").localeCompare(String(b.used_in_label || ""), "th"));
}

async function loadQuestionOptions() {
  questionOptions = sortQuestionOptions(await api(
    `/api/admin/question-options?role=${encodeURIComponent(role)}`,
  ));

  usedInInput.innerHTML = `
    <option value="">-- เลือกหัวข้อ --</option>
    ${questionOptions
      .map(
        (item) => `
          <option
            value="${esc(item.option_key || item.group_id || item.datalist_id)}"
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
    <option value="__custom">+ Dropdown แบบกำหนด key เอง</option>
  `;
}

async function loadQuestions() {
  allQuestions = await api(
    `/api/admin/questions?role=${encodeURIComponent(role)}`,
  );

  renderCategoryList();
  applyQuestionFilters();
}

function categoryIdentity(q) {
  return q.category_id ? "category:" + q.category_id : "dropdown:" + q.datalist_id;
}
function renderCategoryList() {
  if (!categoryList) return;

  const countMap = new Map();

  allQuestions.forEach((q) => {
    const category = categoryIdentity(q);
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
            <span>${esc(getDisplayCategory(allQuestions.find(q => categoryIdentity(q) === cat)))}</span>
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
    const category = categoryIdentity(q);

    const matchKeyword =
      !keyword || questionText.includes(keyword) || label.includes(keyword);

    const matchCategory = !selectedCategory || category === selectedCategory;

    return matchKeyword && matchCategory;
  });

  switch (sortType) {
    case "order":
      rows.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id) - Number(b.id));
      break;
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
        <td colspan="7" class="empty"><strong>ไม่พบข้อมูลคำถาม</strong><span>หรือยังไม่มีคำถามในปีงบประมาณนี้</span></td>
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
            <button type="button" class="btn" onclick="editQuestion(${q.id})">แก้ไข</button>
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
  const category = usedInInput.value === "__custom" ? document.getElementById("dropdownCategory").value.trim() : selectedOption?.dataset.category || "";
  const used_in_label = usedInInput.value === "__custom" ? document.getElementById("dropdownLabel").value.trim() : selectedOption?.dataset.usedInLabel || "";
  const datalist_id = usedInInput.value === "__custom" ? document.getElementById("dropdownKey").value.trim() : selectedOption?.dataset.datalistId || "";
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

  await api(`/api/admin/questions${editingQuestionId ? "/" + editingQuestionId : ""}?role=${encodeURIComponent(role)}`, {
    method: editingQuestionId ? "PUT" : "POST",
    body: JSON.stringify({
      group_id: group_id || null,
      category,
      used_in_label,
      datalist_id,
      question_text,
      sort_order: Number(document.getElementById("questionOrder").value),
      question_type,
      status,
    }),
  });

  resetQuestionEditor();
  questionInput.value = "";
  usedInInput.value = "";
  typeInput.value = "rating";
  statusInput.value = "active";

  await loadQuestionOptions();
  await loadQuestions();
  alert("บันทึกคำถามเรียบร้อย");
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
  btnAddQuestion.addEventListener("click", () => addQuestion().catch(err => alert(err.message)));
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


function resetQuestionEditor() {
  editingQuestionId = null; questionInput.value = ""; usedInInput.value = "";
  document.getElementById("questionOrder").value = "0";
  document.getElementById("cancelEditQuestion").hidden = true;
  document.getElementById("customDropdownFields").hidden = true;
  btnAddQuestion.textContent = "เพิ่มคำถาม";
}
window.editQuestion = function(id) {
  const q = allQuestions.find(q => Number(q.id) === Number(id));
  if (!q) return;
  editingQuestionId = q.id; questionInput.value = q.question_text;
  usedInInput.value = q.group_id && ["dept_name", "uni_strategy", "center_strategy", "center_mission"].includes(q.datalist_id)
    ? `project_${q.group_id}_${q.datalist_id}` : q.group_id ? String(q.group_id) : q.datalist_id;
  typeInput.value = q.question_type; statusInput.value = q.status;
  document.getElementById("questionOrder").value = q.sort_order || 0;
  document.getElementById("cancelEditQuestion").hidden = false;
  document.getElementById("customDropdownFields").hidden = true;
  btnAddQuestion.textContent = "บันทึกการแก้ไข";
  questionInput.focus();
};
usedInInput.addEventListener("change", () => {
  document.getElementById("customDropdownFields").hidden = usedInInput.value !== "__custom";
});
document.getElementById("cancelEditQuestion").addEventListener("click", resetQuestionEditor);
document.getElementById("btnClearQuestionForm").addEventListener("click", () => {
  resetQuestionEditor();
  typeInput.value = "rating";
  statusInput.value = "active";
  ["dropdownCategory", "dropdownLabel", "dropdownKey"].forEach(id => {
    document.getElementById(id).value = "";
  });
  questionInput.focus();
});
async function loadSelectedYear() {
  bankYear.disabled = true; btnAddQuestion.disabled = true;
  document.getElementById("createBankYear").disabled = true;
  allQuestions = []; questionOptions = []; selectedCategory = "";
  searchQuestionInput.value = ""; sortQuestionSelect.value = "order"; resetQuestionEditor(); renderCategoryList(); applyQuestionFilters();
  usedInInput.innerHTML = "";
  document.getElementById("yearStructureLink").href = "admin-structure.html?fiscal_year=" + encodeURIComponent(bankYear.value);
  yearMessage.textContent = "กำลังโหลด...";
  try {
    await loadQuestionOptions(); await loadQuestions();
    yearMessage.textContent = bankYear.value === "legacy" ? "ชุดข้อมูลเดิม (Legacy) — ปีแรกจะคัดลอกจากชุดนี้" : "Question Bank ปี " + bankYear.value;
    btnAddQuestion.disabled = false;
  } catch (error) { yearMessage.textContent = error.message; }
  finally { bankYear.disabled = false; document.getElementById("createBankYear").disabled = false; }
}
async function loadYears(selected) {
  const rows = await api("/api/question-bank/years");
  existingFiscalYears = rows.map(row => Number(row.fiscal_year)).filter(Number.isInteger);
  newBankYear.value = String(Math.max(2569, ...existingFiscalYears) + 1);
  bankYear.innerHTML = rows.map(row => '<option value="' + row.fiscal_year + '">' + row.fiscal_year + '</option>').join("") + '<option value="legacy">ข้อมูลเดิม (Legacy)</option>';
  bankYear.value = selected || String(rows[0]?.fiscal_year || "legacy");
  await loadSelectedYear();
}
bankYear.addEventListener("change", loadSelectedYear);
document.getElementById("createBankYear").addEventListener("click", async event => {
  const year = Number(newBankYear.value);
  if (!newBankYear.value.trim() || !Number.isInteger(year) || year < 2570) {
    alert("ปีงบประมาณต้องเป็น พ.ศ. 2570 ขึ้นไป และเป็นจำนวนเต็ม");
    newBankYear.focus();
    return;
  }
  if (year > 2999) {
    alert("ปีงบประมาณต้องไม่เกิน พ.ศ. 2999");
    newBankYear.focus();
    return;
  }
  if (existingFiscalYears.includes(year)) {
    alert("ปีงบประมาณนี้มีอยู่แล้ว กรุณาระบุปีใหม่");
    newBankYear.focus();
    return;
  }
  event.target.disabled = true; bankYear.disabled = true;
  try {
    const result = await api("/api/admin/question-bank/years?role=" + encodeURIComponent(role), {
      method: "POST", body: JSON.stringify({ fiscal_year: document.getElementById("newBankYear").value }),
    });
    await loadYears(String(result.fiscal_year));
  } catch (error) { alert(error.message); }
  finally { event.target.disabled = false; bankYear.disabled = false; }
});
loadYears().catch(error => { yearMessage.textContent = error.message; btnAddQuestion.disabled = true; });
