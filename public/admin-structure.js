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

  formTitle.textContent = "เพิ่ม Section";
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

  formTitle.textContent = "เพิ่ม Category";
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

  formTitle.textContent = "เพิ่ม Group";
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

  formTitle.textContent = "แก้ไข Section";
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

  formTitle.textContent = "แก้ไข Category";
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

  formTitle.textContent = "แก้ไข Group";
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
    return `<div class="group-list"><div class="muted">ยังไม่มี Group</div></div>`;
  }

  return `
    <div class="group-list">
      ${groups
        .map(
          (g) => `
            <div class="group-item" data-group-id="${g.id}">
              <div>
                <div class="group-title">↳ ${esc(g.title)}</div>
                <div class="child-muted">
                  ${g.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                  · ลำดับ ${g.sort_order || 0}
                </div>
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
                                ${isCatOpen ? "▾" : "▸"}
                              </button>
                              📑 ${esc(cat.title)}
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
  const title = titleInput.value.trim();

  if (!title) {
    alert("กรุณากรอกชื่อ");
    return;
  }

  const payload = {
    title,
    description: descInput.value.trim(),
    sort_order: Number(sortInput.value || 0),
    is_active: activeInput.value === "1",
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

  alert("บันทึกข้อมูลเรียบร้อย");

  categoryMap = {};
  groupMap = {};
  await refreshTree();
  resetForm();
}

async function deleteData() {
  if (!selectedId) {
    alert("กรุณาเลือกรายการที่ต้องการลบก่อน");
    return;
  }

  const typeText =
    selectedType === "section"
      ? "Section"
      : selectedType === "category"
        ? "Category"
        : "Group";

  const ok = confirm(`ยืนยันลบ ${typeText} นี้หรือไม่?`);
  if (!ok) return;

  const url =
    selectedType === "section"
      ? `/api/survey-sections/${encodeURIComponent(selectedId)}`
      : selectedType === "category"
        ? `/api/survey-question-categories/${encodeURIComponent(selectedId)}`
        : `/api/survey-question-groups/${encodeURIComponent(selectedId)}`;

  try {
    await api(url, { method: "DELETE" });

    alert("ลบข้อมูลเรียบร้อย");

    if (selectedType === "section") {
      openSectionIds.delete(selectedId);
    }

    if (selectedType === "category") {
      openCategoryIds.delete(selectedId);
    }

    categoryMap = {};
    groupMap = {};
    await refreshTree();
    resetForm();
  } catch (err) {
    alert(err.message || "ลบข้อมูลไม่สำเร็จ");
  }
}

btnNew.addEventListener("click", resetForm);

btnNewCategory.addEventListener("click", async () => {
  if (selectedType !== "section" || !selectedId) {
    alert("กรุณาเลือก Section ก่อน เช่น ส่วนของคำถาม");
    return;
  }

  openSectionIds.add(selectedId);
  await loadCategoriesForSection(selectedId);
  resetCategoryForm(selectedId);
  renderStructure();
});

btnNewGroup.addEventListener("click", async () => {
  if (selectedType !== "category" || !selectedId) {
    alert("กรุณาเลือก Category ก่อน เช่น LibQUAL+");
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
  try {
    await loadSections();


    const questionSection = sections.find((s) => s.title.includes("คำถาม"));

    if (questionSection) {
      openSectionIds.add(questionSection.id);
      await loadCategoriesForSection(questionSection.id);

    }

    renderStructure();
    resetForm();
  } catch (err) {
    console.error(err);
    alert(err.message || "โหลดข้อมูลไม่สำเร็จ");
  }
  
})();