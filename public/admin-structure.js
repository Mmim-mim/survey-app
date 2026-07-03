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
const btnNewGroup = document.getElementById("btnNewGroup");
const parentCategoryId = document.getElementById("parentCategoryId");

let sections = [];
let categoryMap = {};
let groupMap = {};
let openCategoryIds = new Set();
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

function fillGroupForm(group) {
  selectedType = "group";
  selectedId = group.id;

  categoryId.value = group.id;
  parentCategoryId.value = group.category_id;
  titleInput.value = group.title || "";
  descInput.value = group.description || "";
  sortInput.value = group.sort_order || 0;
  activeInput.value = group.is_active ? "1" : "0";
  formTitle.textContent = "แก้ไขกลุ่มคำถาม";

  document
    .querySelectorAll(".structure-head, .child-item, .group-item")
    .forEach((el) => {
      el.classList.remove("active");
    });

  document
    .querySelector(`.group-item[data-group-id="${group.id}"]`)
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

async function loadGroupsForCategory(categoryIdValue) {
  if (groupMap[categoryIdValue]) return groupMap[categoryIdValue];

  const rows = await api(`/api/survey-question-groups/${categoryIdValue}`);
  groupMap[categoryIdValue] = rows;

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
      const getGroupsHtml = (categoryIdValue) => {
        const groups = groupMap[categoryIdValue] || [];

        if (!groups.length) return "";

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
      };

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
                  ? `<button class="icon-btn expand-btn" data-section-id="${section.id}">▸</button>`
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
                        <div class="child-item ${openCategoryIds.has(cat.id) ? "open" : ""}" data-category-id="${cat.id}">
  <div>
    <div class="child-title">
      <button class="cat-toggle" data-category-id="${cat.id}">
        ${openCategoryIds.has(cat.id) ? "▾" : "▸"}
      </button>
      📑 ${esc(cat.title)}
    </div>

    <div class="child-muted">
      ${cat.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
      · ลำดับ ${cat.sort_order || 0}
    </div>

    ${getGroupsHtml(cat.id)}
  </div>
                          <span class="child-edit-icon">
    ✏️
</span>
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
  document.querySelectorAll(".group-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();

      const groupId = Number(item.dataset.groupId);
      const allGroups = Object.values(groupMap).flat();
      const group = allGroups.find((x) => x.id === groupId);

      if (group) fillGroupForm(group);
    });
  });
}

async function toggleQuestionSection(sectionId) {
  await loadCategoriesForSection(sectionId);

  const box = document.querySelector(`[data-section-box="${sectionId}"]`);

  const isOpen = box?.classList.contains("open");

  renderStructure();

  const newBox = document.querySelector(`[data-section-box="${sectionId}"]`);

  const btn = document.querySelector(
    `.expand-btn[data-section-id="${sectionId}"]`,
  );

  if (!isOpen) {
    newBox?.classList.add("open");
    if (btn) btn.textContent = "▾";
  } else {
    newBox?.classList.remove("open");
    if (btn) btn.textContent = "▸";
  }
}

function bindStructureEvents() {
  document.querySelectorAll(".structure-head").forEach((head) => {
    head.addEventListener("click", async () => {
      const sectionId = Number(head.dataset.sectionId);
      const section = sections.find((x) => x.id === sectionId);
      if (!section) return;

      fillSectionForm(section);

      if (section.title.includes("คำถาม")) {
        await toggleQuestionSection(sectionId);
      }
    });
  });

  document.querySelectorAll(".expand-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const sectionId = Number(btn.dataset.sectionId);
      await toggleQuestionSection(sectionId);
    });
  });

  document.querySelectorAll(".cat-toggle").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const catId = Number(btn.dataset.categoryId);

      if (openCategoryIds.has(catId)) {
        openCategoryIds.delete(catId);
      } else {
        openCategoryIds.add(catId);
        await loadGroupsForCategory(catId);
      }

      renderStructure();

      const questionSection = sections.find((s) => s.title.includes("คำถาม"));
      if (questionSection) {
        document
          .querySelector(`[data-section-box="${questionSection.id}"]`)
          ?.classList.add("open");
      }
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
    item.addEventListener("click", async () => {
      const categoryId = Number(item.dataset.categoryId);

      const allCategories = Object.values(categoryMap).flat();
      const category = allCategories.find((x) => x.id === categoryId);

      if (category) {
        fillCategoryForm(category);
        openCategoryIds.add(category.id);
        await loadGroupsForCategory(category.id);
        renderStructure();

        document
          .querySelector(`[data-section-box="${category.section_id}"]`)
          ?.classList.add("open");

        document
          .querySelector(`.child-item[data-category-id="${category.id}"]`)
          ?.classList.add("active");
      }
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
    selectedType === "group"
      ? `/api/survey-question-groups/${encodeURIComponent(id)}`
      : selectedType === "category"
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
  groupMap = {};
  await loadSections();
  renderStructure();
}

btnNewGroup.addEventListener("click", async () => {
  if (selectedType !== "category" || !selectedId) {
    alert("กรุณาเลือกหัวข้อย่อยก่อน เช่น LibQUAL+");
    return;
  }

  const payload = {
    category_id: selectedId,
    title: "กลุ่มคำถามใหม่",
    description: "",
    sort_order: 0,
    is_active: true,
  };

  const res = await fetch("/api/survey-question-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert(json.error || "เพิ่มกลุ่มคำถามไม่สำเร็จ");
    return;
  }

  groupMap = {};
  await loadGroupsForCategory(selectedId);
  renderStructure();

  alert("เพิ่มกลุ่มคำถามเรียบร้อย");
});

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
