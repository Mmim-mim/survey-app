const categoryList = document.getElementById("categoryList");
const categoryId = document.getElementById("categoryId");
const titleInput = document.getElementById("titleInput");
const descInput = document.getElementById("descInput");
const sortInput = document.getElementById("sortInput");
const activeInput = document.getElementById("activeInput");
const formTitle = document.getElementById("formTitle");

const btnNew = document.getElementById("btnNew");
const btnCancel = document.getElementById("btnCancel");
const btnSave = document.getElementById("btnSave");

let categories = [];

function esc(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resetForm() {
  categoryId.value = "";
  titleInput.value = "";
  descInput.value = "";
  sortInput.value = "0";
  activeInput.value = "1";
  formTitle.textContent = "เพิ่มหัวข้อใหญ่";

  document.querySelectorAll(".category-item").forEach((el) => {
    el.classList.remove("active");
  });
}

function renderCategories() {
  if (!categories.length) {
    categoryList.innerHTML = `<div class="muted">ยังไม่มีหัวข้อใหญ่</div>`;
    return;
  }

  categoryList.innerHTML = categories
    .map(
      (item, index) => `
        <div class="category-item" data-id="${item.id}">
          <div class="badge">${index + 1}</div>

          <div>
            <div class="title">${esc(item.title)}</div>
            <div class="muted">
              ${item.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
              · ลำดับ ${item.sort_order || 0}
            </div>
          </div>

          <div class="actions">
            <button class="icon-btn edit-btn" data-id="${item.id}">✏️</button>
            <button class="icon-btn delete-btn" data-id="${item.id}">🗑️</button>
          </div>
        </div>
      `,
    )
    .join("");

  document.querySelectorAll(".category-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.id);
      const item = categories.find((x) => x.id === id);
      if (item) fillForm(item);
    });
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const item = categories.find((x) => x.id === id);
      if (item) fillForm(item);
    });
  });

  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const id = Number(btn.dataset.id);
      const item = categories.find((x) => x.id === id);

      if (!confirm(`ต้องการลบ "${item?.title || ""}" ใช่ไหม?`)) return;

      const res = await fetch(`/api/survey-categories/${id}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json.error || "ลบไม่สำเร็จ");
        return;
      }

      resetForm();
      await loadCategories();
    });
  });
}

function fillForm(item) {
  categoryId.value = item.id;
  titleInput.value = item.title || "";
  descInput.value = item.description || "";
  sortInput.value = item.sort_order || 0;
  activeInput.value = item.is_active ? "1" : "0";
  formTitle.textContent = "แก้ไขหัวข้อใหญ่";

  document.querySelectorAll(".category-item").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.id) === Number(item.id));
  });
}

async function loadCategories() {
  const res = await fetch("/api/survey-categories");
  const json = await res.json();

  if (!res.ok) {
    alert(json.error || "โหลดข้อมูลไม่สำเร็จ");
    return;
  }

  categories = json;
  renderCategories();
}

async function saveCategory() {
  const id = categoryId.value;

  const payload = {
    title: titleInput.value.trim(),
    description: descInput.value.trim(),
    sort_order: Number(sortInput.value || 0),
    is_active: activeInput.value === "1",
  };

  if (!payload.title) {
    alert("กรุณากรอกชื่อหัวข้อใหญ่");
    return;
  }

  const url = id
    ? `/api/survey-categories/${encodeURIComponent(id)}`
    : "/api/survey-categories";

  const method = id ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (!res.ok) {
    alert(json.error || "บันทึกไม่สำเร็จ");
    return;
  }

  alert("บันทึกข้อมูลเรียบร้อย");
  resetForm();
  await loadCategories();
}

btnNew.addEventListener("click", resetForm);
btnCancel.addEventListener("click", resetForm);
btnSave.addEventListener("click", saveCategory);

loadCategories();