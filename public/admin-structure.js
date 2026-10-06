const structureList = document.getElementById("structureList");

const categoryId = document.getElementById("categoryId");
const parentCategoryId = document.getElementById("parentCategoryId");

const titleInput = document.getElementById("titleInput");
const descInput = document.getElementById("descInput");
const sortInput = document.getElementById("sortInput");
const activeInput = document.getElementById("activeInput");
const formTitle = document.getElementById("formTitle");

const btnNew = document.getElementById("btnNew");
const btnNewCategory = document.getElementById("btnNewCategory");
const btnNewGroup = document.getElementById("btnNewGroup");
const btnCancel = document.getElementById("btnCancel");
const btnDelete = document.getElementById("btnDelete");
const btnSave = document.getElementById("btnSave");

const structureYear = document.getElementById("structureYear");
const structureYearError = document.getElementById("structureYearError");
let availableYears = new Set();
let structureReady = false;

function setStructureReady(ready) {
  structureReady = ready;
  [btnNew, btnNewCategory, btnNewGroup, btnSave, btnDelete,
    titleInput, descInput, sortInput, activeInput].forEach(el => { el.disabled = !ready; });
}

function requireStructureYear() {
  if (!availableYears.has(structureYear.value)) {
    throw new Error(structureYearError.textContent || "กรุณาเลือกปีงบประมาณที่มีอยู่");
  }
  return structureYear.value;
}
let sections = [];
let categoryMap = {};
let groupMap = {};
let openSectionIds = new Set();
let openCategoryIds = new Set();

let selectedType = "section"; // section | category | group
let selectedId = null;
let selectedParentId = null;

function esc(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function api(path, options = {}) {
  const listingYears = path === "/api/question-bank/years" && (!options.method || options.method === "GET");
  const requestYear = listingYears ? null : requireStructureYear();
  if (!listingYears && options.method && options.method !== "GET" && !structureReady) {
    throw new Error("กรุณารอโหลดโครงสร้างปีงบประมาณให้สำเร็จก่อน");
  }
  path += (path.includes("?") ? "&" : "?") + new URLSearchParams({
    role: localStorage.getItem("role") || "", ...(listingYears ? {} : { fiscal_year: requestYear }),
  });
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

  if (!listingYears && requestYear !== structureYear.value) throw new Error("ปีงบประมาณเปลี่ยนแล้ว กรุณาลองใหม่");
  return json;
}

async function loadSections() {
  sections = await api("/api/survey-sections");
}

async function loadCategoriesForSection(sectionId) {
  const rows = await api(`/api/survey-question-categories/${sectionId}`);
  categoryMap[sectionId] = rows;
  return rows;
}

async function loadGroupsForCategory(categoryIdValue) {
  const rows = await api(`/api/survey-question-groups/${categoryIdValue}`);
  groupMap[categoryIdValue] = rows;
  return rows;
}

function clearActive() {
  document
    .querySelectorAll(".structure-head, .child-item, .group-item")
    .forEach((el) => el.classList.remove("active"));
}

function syncDefaultControl() {
  const field = document.getElementById("defaultQuestionType");
  if (!field) return;
  let sectionId = selectedType === "section" ? selectedId : selectedParentId;
  if (selectedType === "group") sectionId = findCategoryById(selectedParentId)?.section_id;
  const section = sections.find(s => Number(s.id) === Number(sectionId));
  const allowed = (selectedType === "section" && !selectedId) || /^custom_/.test(section?.section_key || "");
  field.hidden = !allowed;
  field.disabled = !allowed || !structureReady;
  const label = document.querySelector('label[for="defaultQuestionType"]');
  if (label) label.hidden = !allowed;
}

function resetForm() {
  selectedType = "section";
  selectedId = null;
  selectedParentId = null;

  categoryId.value = "";
  parentCategoryId.value = "";
  titleInput.value = "";
  descInput.value = "";
  sortInput.value = "0";
  activeInput.value = "1";
  document.getElementById("defaultQuestionType").value = "";

  formTitle.textContent = "เพิ่ม Section";
  syncDefaultControl();
  clearActive();
}

function resetCategoryForm(sectionId) {
  selectedType = "category";
  selectedId = null;
  selectedParentId = sectionId;

  categoryId.value = "";
  parentCategoryId.value = sectionId;
  titleInput.value = "";
  descInput.value = "";
  sortInput.value = "0";
  activeInput.value = "1";
  document.getElementById("defaultQuestionType").value = "";

  formTitle.textContent = "เพิ่ม Category";
  syncDefaultControl();
  clearActive();
}

function resetGroupForm(categoryIdValue) {
  selectedType = "group";
  selectedId = null;
  selectedParentId = categoryIdValue;

  categoryId.value = "";
  parentCategoryId.value = categoryIdValue;
  titleInput.value = "";
  descInput.value = "";
  sortInput.value = "0";
  activeInput.value = "1";
  document.getElementById("defaultQuestionType").value = "";

  formTitle.textContent = "เพิ่ม Group";
  syncDefaultControl();
  clearActive();
}

function fillSectionForm(section) {
  selectedType = "section";
  selectedId = section.id;
  selectedParentId = null;

  categoryId.value = section.id;
  parentCategoryId.value = "";
  titleInput.value = section.title || "";
  descInput.value = section.description || "";
  sortInput.value = section.sort_order || 0;
  activeInput.value = section.is_active ? "1" : "0";
  document.getElementById("defaultQuestionType").value = section.default_question_type || "";

  formTitle.textContent = "แก้ไข Section";
  syncDefaultControl();
  clearActive();

  document
    .querySelector(`.structure-head[data-section-id="${section.id}"]`)
    ?.classList.add("active");
}

function fillCategoryForm(category) {
  selectedType = "category";
  selectedId = category.id;
  selectedParentId = category.section_id;

  categoryId.value = category.id;
  parentCategoryId.value = category.section_id;
  titleInput.value = category.title || "";
  descInput.value = category.description || "";
  sortInput.value = category.sort_order || 0;
  activeInput.value = category.is_active ? "1" : "0";
  document.getElementById("defaultQuestionType").value = category.default_question_type || "";

  formTitle.textContent = "แก้ไข Category";
  syncDefaultControl();
  clearActive();

  document
    .querySelector(`.child-item[data-category-id="${category.id}"]`)
    ?.classList.add("active");
}

function fillGroupForm(group) {
  selectedType = "group";
  selectedId = group.id;
  selectedParentId = group.category_id;

  categoryId.value = group.id;
  parentCategoryId.value = group.category_id;
  titleInput.value = group.title || "";
  descInput.value = group.description || "";
  sortInput.value = group.sort_order || 0;
  activeInput.value = group.is_active ? "1" : "0";
  document.getElementById("defaultQuestionType").value = group.default_question_type || "";

  formTitle.textContent = "แก้ไข Group";
  syncDefaultControl();
  clearActive();

  document
    .querySelector(`.group-item[data-group-id="${group.id}"]`)
    ?.classList.add("active");
}

function findCategoryById(id) {
  return Object.values(categoryMap)
    .flat()
    .find((x) => Number(x.id) === Number(id));
}

function findGroupById(id) {
  return Object.values(groupMap)
    .flat()
    .find((x) => Number(x.id) === Number(id));
}

function getGroupsHtml(categoryIdValue) {
  const groups = groupMap[categoryIdValue] || [];

  if (!groups.length) {
    return `
      <div class="group-list">
        <div class="muted">ยังไม่มี Group</div>
      </div>
    `;
  }

  return `
    <div class="group-list">
      ${groups
        .map(
          (g) => `
            <div class="group-item" data-group-id="${g.id}">
              <div class="group-title">📂 ${esc(g.title)}</div>
              <div class="child-muted">
                ${g.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                · ลำดับ ${g.sort_order || 0}
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderStructure() {
  if (!sections.length) {
    structureList.innerHTML = `<div class="muted">ยังไม่มี Section</div>`;
    return;
  }

  structureList.innerHTML = sections
    .map((section, index) => {
      const categories = categoryMap[section.id] || [];
      const isSectionOpen = openSectionIds.has(section.id);

      return `
        <div class="structure-item ${isSectionOpen ? "open" : ""}" data-section-box="${section.id}">
          <div class="structure-head" data-section-id="${section.id}">
            <div class="badge">${index + 1}</div>

            <div>
              <div class="title">${esc(section.title)}</div>
              <div class="muted">
                ${section.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                · ลำดับ ${section.sort_order || 0}
              </div>
            </div>

            <div class="actions">
              <button class="icon-btn expand-btn" data-section-id="${section.id}">
                ${isSectionOpen ? "▾" : "▸"}
              </button>
            </div>
          </div>

          <div class="structure-child-list" id="children-${section.id}">
            ${
              categories.length
                ? categories
                    .map((cat) => {
                      const isCatOpen = openCategoryIds.has(cat.id);

                      return `
                        <div class="child-item ${isCatOpen ? "open" : ""}" data-category-id="${cat.id}">
                          <div>
                            <div class="child-title">
  <button class="cat-toggle" data-category-id="${cat.id}">
    ${openCategoryIds.has(cat.id) ? "▾" : "▸"}
  </button>
  <span>📑 ${esc(cat.title)}</span>
</div>

                            <div class="child-muted">
                              ${cat.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                              · ลำดับ ${cat.sort_order || 0}
                            </div>

                            ${getGroupsHtml(cat.id)}
                          </div>
                        </div>
                      `;
                    })
                    .join("")
                : `<div class="muted">ยังไม่มี Category</div>`
            }
          </div>
        </div>
      `;
    })
    .join("");

  bindStructureEvents();
}

async function refreshTree() {
  await loadSections();

  for (const sectionId of openSectionIds) {
    await loadCategoriesForSection(sectionId);
  }

  for (const categoryIdValue of openCategoryIds) {
    await loadGroupsForCategory(categoryIdValue);
  }

  renderStructure();
}

function bindStructureEvents() {
  document.querySelectorAll(".structure-head").forEach((head) => {
    head.addEventListener("click", async () => {
      const sectionId = Number(head.dataset.sectionId);
      const section = sections.find((x) => x.id === sectionId);
      if (!section) return;

      fillSectionForm(section);
    });
  });

  document.querySelectorAll(".expand-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const sectionId = Number(btn.dataset.sectionId);

      if (openSectionIds.has(sectionId)) {
        openSectionIds.delete(sectionId);
      } else {
        openSectionIds.add(sectionId);
        await loadCategoriesForSection(sectionId);
      }

      renderStructure();
    });
  });

  document.querySelectorAll(".child-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const categoryIdValue = Number(item.dataset.categoryId);
      const category = findCategoryById(categoryIdValue);
      if (!category) return;

      fillCategoryForm(category);
    });
  });

  document.querySelectorAll(".cat-toggle").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const categoryIdValue = Number(btn.dataset.categoryId);
      const category = findCategoryById(categoryIdValue);
      if (!category) return;

      openSectionIds.add(category.section_id);

      if (openCategoryIds.has(categoryIdValue)) {
        openCategoryIds.delete(categoryIdValue);
      } else {
        openCategoryIds.add(categoryIdValue);
        await loadGroupsForCategory(categoryIdValue);
      }

      renderStructure();
    });
  });

  document.querySelectorAll(".group-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();

      const groupId = Number(item.dataset.groupId);
      const group = findGroupById(groupId);

      if (group) fillGroupForm(group);
    });
  });
}

async function saveData() {
  if (!structureReady) return;
  const title = titleInput.value.trim();

  if (!title) {
    await AdminPopup.alert({type: "warning", message: "กรุณากรอกชื่อ"});
    return;
  }

  const payload = {
    title,
    description: descInput.value.trim(),
    sort_order: Number(sortInput.value || 0),
    is_active: activeInput.value === "1",
    ...(document.getElementById("defaultQuestionType").disabled ? {} : {default_question_type: document.getElementById("defaultQuestionType").value || null}),
  };

  let url = "";
  let method = selectedId ? "PUT" : "POST";

  if (selectedType === "section") {
    url = selectedId
      ? `/api/survey-sections/${encodeURIComponent(selectedId)}`
      : "/api/survey-sections";
  }

  if (selectedType === "category") {
    if (!selectedId) {
      payload.section_id = selectedParentId;
    }

    url = selectedId
      ? `/api/survey-question-categories/${encodeURIComponent(selectedId)}`
      : "/api/survey-question-categories";
  }

  if (selectedType === "group") {
    if (!selectedId) {
      payload.category_id = selectedParentId;
    }

    url = selectedId
      ? `/api/survey-question-groups/${encodeURIComponent(selectedId)}`
      : "/api/survey-question-groups";
  }

  await api(url, {
    method,
    body: JSON.stringify(payload),
  });

  await AdminPopup.alert({type: "success", message: "บันทึกข้อมูลเรียบร้อย"});

  categoryMap = {};
  groupMap = {};
  await refreshTree();
  resetForm();
}

let deletePending = false;
async function deleteData() {
  if (!structureReady || deletePending) return;
  deletePending = true;
  try {
    if (!selectedId) {
      await AdminPopup.alert({type: "warning", message: "กรุณาเลือกรายการที่ต้องการลบก่อน"});
      return;
    }

    const target = {id: selectedId, type: selectedType, year: structureYear.value};
    const typeText =
      target.type === "section"
        ? "Section"
        : target.type === "category"
          ? "Category"
          : "Group";

    const ok = await AdminPopup.confirm({
      title: target.type === "section" ? "ยืนยันการลบ" : "ยืนยันปิดใช้งาน",
      message: target.type === "section" ? `ยืนยันลบ ${typeText} นี้หรือไม่?` : `ปิดใช้งาน ${typeText} ในปีนี้หรือไม่? ข้อมูลเดิมจะยังคงอยู่`,
      destructive: true,
    });
    if (!ok) return;
    if (structureYear.value !== target.year) return;

    const url =
      target.type === "section"
        ? `/api/survey-sections/${encodeURIComponent(target.id)}`
        : target.type === "category"
          ? `/api/survey-question-categories/${encodeURIComponent(target.id)}`
          : `/api/survey-question-groups/${encodeURIComponent(target.id)}`;

    try {
      await api(url, { method: "DELETE" });

      await AdminPopup.alert({type: "success", message: target.type === "section" ? "ลบข้อมูลเรียบร้อย" : "ปิดใช้งานในปีนี้เรียบร้อย ข้อมูลเดิมยังคงอยู่"});

      if (target.type === "section") {
        openSectionIds.delete(target.id);
      }

      if (target.type === "category") {
        openCategoryIds.delete(target.id);
      }

      categoryMap = {};
      groupMap = {};
      await refreshTree();
      resetForm();
    } catch (err) {
      await AdminPopup.alert({type: "error", message: err.message || "ลบข้อมูลไม่สำเร็จ"});
    }
  } finally { deletePending = false; }
}

btnNew.addEventListener("click", resetForm);

btnNewCategory.addEventListener("click", async () => {
  if (selectedType !== "section" || !selectedId) {
    await AdminPopup.alert({type: "warning", message: "กรุณาเลือก Section ก่อน เช่น ส่วนของคำถาม"});
    return;
  }

  openSectionIds.add(selectedId);
  await loadCategoriesForSection(selectedId);
  resetCategoryForm(selectedId);
  renderStructure();
});

btnNewGroup.addEventListener("click", async () => {
  if (selectedType !== "category" || !selectedId) {
    await AdminPopup.alert({type: "warning", message: "กรุณาเลือก Category ก่อน เช่น LibQUAL+"});
    return;
  }

  openCategoryIds.add(selectedId);
  await loadGroupsForCategory(selectedId);
  resetGroupForm(selectedId);
  renderStructure();
});

btnCancel.addEventListener("click", resetForm);
btnDelete.addEventListener("click", deleteData);
btnSave.addEventListener("click", saveData);

(async function init() {
  setStructureReady(false);
  structureYear.disabled = true;
  try {
    const years = await api("/api/question-bank/years");
    availableYears = new Set([...years.map(row => String(row.fiscal_year)), "legacy"]);
    structureYear.innerHTML = `<option value="" disabled>-- เลือกปีงบประมาณ --</option>` + years.map(row => `<option value="${row.fiscal_year}">${row.fiscal_year}</option>`).join("") + `<option value="legacy">Legacy</option>`;
    const requestedYear = new URLSearchParams(location.search).get("fiscal_year");
    const initialYear = requestedYear ?? String(years[0]?.fiscal_year ?? "");
    if (!availableYears.has(initialYear)) {
      structureYear.value = "";
      structureYearError.textContent = requestedYear !== null
        ? `ไม่พบปีงบประมาณ ${requestedYear} กรุณาเลือกปีงบประมาณที่มีอยู่`
        : "กรุณาเลือกปีงบประมาณที่มีอยู่ หรือเลือก Legacy";
      return;
    }
    structureYear.value = initialYear;
    await loadSections();

    const questionSection = sections.find((s) => s.section_key === "rating_questions");

    if (questionSection) {
      openSectionIds.add(questionSection.id);
      await loadCategoriesForSection(questionSection.id);
    }

    renderStructure();
    resetForm();
    setStructureReady(true);
  } catch (err) {
    structureYearError.textContent = err.message || "โหลดข้อมูลไม่สำเร็จ";
    console.error(err);
    await AdminPopup.alert({type: "error", message: err.message || "โหลดข้อมูลไม่สำเร็จ"});
  } finally { structureYear.disabled = false; }
})();

structureYear.addEventListener("change", async () => {
  structureYear.disabled = true;
  setStructureReady(false);
  structureYearError.textContent = "";
  sections = []; structureList.innerHTML = "";
  categoryMap = {}; groupMap = {}; openCategoryIds.clear(); resetForm();
  try { requireStructureYear(); await refreshTree(); setStructureReady(true); }
  catch (error) { document.getElementById("structureYearError").textContent = error.message; }
  finally { structureYear.disabled = false; }
});
