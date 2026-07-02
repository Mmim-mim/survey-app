const structureList = document.getElementById("structureList");

const categoryId = document.getElementById("categoryId");
const titleInput = document.getElementById("titleInput");
const descInput = document.getElementById("descInput");
const sortInput = document.getElementById("sortInput");
const activeInput = document.getElementById("activeInput");
const formTitle = document.getElementById("formTitle");

const btnNew = document.getElementById("btnNew");
const btnCancel = document.getElementById("btnCancel");
const btnSave = document.getElementById("btnSave");

let sections = [];
let categoryMap = {};
let selectedType = "section"; // section | category
let selectedId = null;

function esc(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resetForm() {
  selectedType = "section";
  selectedId = null;

  categoryId.value = "";
  titleInput.value = "";
  descInput.value = "";
  sortInput.value = "0";
  activeInput.value = "1";
  formTitle.textContent = "รายละเอียดส่วนหลัก";

  document.querySelectorAll(".structure-head, .child-item").forEach((el) => {
    el.classList.remove("active");
  });
}

function fillSectionForm(section) {
  selectedType = "section";
  selectedId = section.id;

  categoryId.value = section.id;
  titleInput.value = section.title || "";
  descInput.value = section.description || "";
  sortInput.value = section.sort_order || 0;
  activeInput.value = section.is_active ? "1" : "0";
  formTitle.textContent = "แก้ไขส่วนหลัก";

  document.querySelectorAll(".structure-head, .child-item").forEach((el) => {
    el.classList.remove("active");
  });

  document
    .querySelector(`.structure-head[data-section-id="${section.id}"]`)
    ?.classList.add("active");
}

function fillCategoryForm(category) {
  selectedType = "category";
  selectedId = category.id;

  categoryId.value = category.id;
  titleInput.value = category.title || "";
  descInput.value = category.description || "";
  sortInput.value = category.sort_order || 0;
  activeInput.value = category.is_active ? "1" : "0";
  formTitle.textContent = "แก้ไขหัวข้อย่อยในส่วนของคำถาม";

  document.querySelectorAll(".structure-head, .child-item").forEach((el) => {
    el.classList.remove("active");
  });

  document
    .querySelector(`.child-item[data-category-id="${category.id}"]`)
    ?.classList.add("active");
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
  if (categoryMap[sectionId]) return categoryMap[sectionId];

  const rows = await api(`/api/survey-question-categories/${sectionId}`);
  categoryMap[sectionId] = rows;

  return rows;
}

function renderStructure() {
  if (!sections.length) {
    structureList.innerHTML = `<div class="muted">ยังไม่มีส่วนหลัก</div>`;
    return;
  }

  structureList.innerHTML = sections
    .map((section, index) => {
      const children = categoryMap[section.id] || [];

      return `
        <div class="structure-item" data-section-box="${section.id}">
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
              ${
                section.title.includes("คำถาม")
                  ? `<button class="icon-btn expand-btn" data-section-id="${section.id}">⌄</button>`
                  : ""
              }
              <button class="icon-btn edit-section-btn" data-section-id="${section.id}">✏️</button>
            </div>
          </div>

          <div class="structure-child-list" id="children-${section.id}">
            ${
              children.length
                ? children
                    .map(
                      (cat) => `
                        <div class="child-item" data-category-id="${cat.id}">
                          <div>
                            <div class="child-title">${esc(cat.title)}</div>
                            <div class="child-muted">
                              ${cat.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                              · ลำดับ ${cat.sort_order || 0}
                            </div>
                          </div>
                          <span>✏️</span>
                        </div>
                      `,
                    )
                    .join("")
                : `<div class="muted">ยังไม่มีหัวข้อย่อย</div>`
            }
          </div>
        </div>
      `;
    })
    .join("");

  bindStructureEvents();
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
      const box = document.querySelector(`[data-section-box="${sectionId}"]`);

      await loadCategoriesForSection(sectionId);
      renderStructure();

      document
        .querySelector(`[data-section-box="${sectionId}"]`)
        ?.classList.toggle("open");
    });
  });

  document.querySelectorAll(".edit-section-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const sectionId = Number(btn.dataset.sectionId);
      const section = sections.find((x) => x.id === sectionId);
      if (section) fillSectionForm(section);
    });
  });

  document.querySelectorAll(".child-item").forEach((item) => {
    item.addEventListener("click", () => {
      const categoryId = Number(item.dataset.categoryId);

      const allCategories = Object.values(categoryMap).flat();
      const category = allCategories.find((x) => x.id === categoryId);

      if (category) fillCategoryForm(category);
    });
  });
}

async function saveSection() {
  const id = categoryId.value;

  const payload = {
    title: titleInput.value.trim(),
    description: descInput.value.trim(),
    sort_order: Number(sortInput.value || 0),
    is_active: activeInput.value === "1",
  };

  if (!payload.title) {
    alert("กรุณากรอกชื่อ");
    return;
  }

  const url =
    selectedType === "category"
      ? `/api/survey-question-categories/${encodeURIComponent(id)}`
      : `/api/survey-sections/${encodeURIComponent(id)}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert(json.error || "บันทึกไม่สำเร็จ");
    return;
  }

  alert("บันทึกข้อมูลเรียบร้อย");

  categoryMap = {};
  await loadSections();
  renderStructure();
}

btnNew.addEventListener("click", resetForm);
btnCancel.addEventListener("click", resetForm);
btnSave.addEventListener("click", saveSection);

(async function init() {
  try {
    await loadSections();
    renderStructure();

    const questionSection = sections.find((s) => s.title.includes("คำถาม"));
    if (questionSection) {
      await loadCategoriesForSection(questionSection.id);
      renderStructure();
      document
        .querySelector(`[data-section-box="${questionSection.id}"]`)
        ?.classList.add("open");
    }
  } catch (err) {
    console.error(err);
    alert(err.message || "โหลดข้อมูลไม่สำเร็จ");
  }
})();
