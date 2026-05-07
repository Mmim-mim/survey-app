const role = (localStorage.getItem("role") || "").trim();

const formTableBody = document.getElementById("formTableBody");
const btnRefresh = document.getElementById("btnRefresh");

const searchInput = document.getElementById("searchInput");
const ownerFilter = document.getElementById("ownerFilter");
const strategyFilter = document.getElementById("strategyFilter");
const sortFilter = document.getElementById("sortFilter");

const statTotal = document.getElementById("statTotal");
const statActive = document.getElementById("statActive");
const statDraft = document.getElementById("statDraft");
const statOwners = document.getElementById("statOwners");
const resultCount = document.getElementById("resultCount");

let allForms = [];

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function guardAdmin() {
  if (role !== "admin") {
    alert("หน้านี้สำหรับ admin เท่านั้น");
    window.location.href = "dashboard.html";
  }
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

function formatThaiDate(dateValue) {
  if (!dateValue) return "-";

  const d = new Date(dateValue);
  if (isNaN(d)) return "-";

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear() + 543;
  const time = d.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${day}/${month}/${year}<br>${time}`;
}

function getOwnerBadge(owner) {
  const name = String(owner || "-").trim();
  const cls = name === "manager" ? "manager" : "";
  return `
    <span class="owner-badge ${cls}">
      👤 ${esc(name)}
    </span>
    <div class="muted">${esc(name)}</div>
  `;
}

function getStatusBadge(form) {
  const title = String(form.form_title || "").trim();

  if (!title || title === "-") {
    return `<span class="status-badge draft">● ร่าง</span>`;
  }

  return `<span class="status-badge">● ที่ใช้งาน</span>`;
}

function updateStats(forms) {
  const owners = new Set(
    forms.map((f) => String(f.created_by_username || f.created_by || "").trim()).filter(Boolean)
  );

  const draftCount = forms.filter((f) => {
    const title = String(f.form_title || "").trim();
    return !title || title === "-";
  }).length;

  statTotal.textContent = forms.length;
  statDraft.textContent = draftCount;
  statActive.textContent = forms.length - draftCount;
  statOwners.textContent = owners.size;
}

function fillFilters(forms) {
  const owners = Array.from(
    new Set(forms.map((f) => String(f.created_by_username || f.created_by || "").trim()).filter(Boolean))
  ).sort();

  const strategies = Array.from(
    new Set(
      forms
        .flatMap((f) => [f.uni_strategy, f.center_strategy])
        .map((x) => String(x || "").trim())
        .filter((x) => x && x !== "-")
    )
  ).sort();

  ownerFilter.innerHTML =
    `<option value="">ทั้งหมด</option>` +
    owners.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("");

  strategyFilter.innerHTML =
    `<option value="">ทั้งหมด</option>` +
    strategies.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
}

function getFilteredForms() {
  const q = searchInput.value.trim().toLowerCase();
  const owner = ownerFilter.value;
  const strategy = strategyFilter.value;
  const sort = sortFilter.value;

  let rows = [...allForms];

  if (q) {
    rows = rows.filter((f) =>
      String(f.form_title || "").toLowerCase().includes(q)
    );
  }

  if (owner) {
    rows = rows.filter(
      (f) => String(f.created_by_username || f.created_by || "").trim() === owner
    );
  }

  if (strategy) {
    rows = rows.filter((f) => {
      const uni = String(f.uni_strategy || "").trim();
      const center = String(f.center_strategy || "").trim();
      return uni === strategy || center === strategy;
    });
  }

  if (sort === "latest") {
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  if (sort === "oldest") {
    rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  if (sort === "name") {
    rows.sort((a, b) =>
      String(a.form_title || "").localeCompare(String(b.form_title || ""), "th")
    );
  }

  return rows;
}

function renderForms() {
  const forms = getFilteredForms();

  resultCount.textContent = `แสดง ${forms.length} รายการ`;

  if (!forms.length) {
    formTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">ไม่พบข้อมูลฟอร์ม</td>
      </tr>
    `;
    return;
  }

  formTableBody.innerHTML = forms
    .map((f) => {
      const owner = f.created_by_username || f.created_by || "-";

      return `
        <tr>
          <td>
            <div class="form-title">${esc(f.form_title || "-")}</div>
            <div class="muted">ID: ${esc(f.id || "-")}</div>
          </td>

          <td>${getOwnerBadge(owner)}</td>

          <td>
            <div>${esc(f.uni_strategy || "-")}</div>
            <div class="muted">${esc(f.center_strategy || "-")}</div>
          </td>

          <td>${formatThaiDate(f.created_at)}</td>

          <td>${getStatusBadge(f)}</td>

          <td>
            <div class="action-group">
              <a class="icon-btn" href="preview.html?formId=${f.id}" target="_blank" title="ดูฟอร์ม">
                👁
              </a>

              <button class="icon-btn danger" onclick="deleteForm(${f.id}, '${esc(f.form_title || "")}')" title="ลบฟอร์ม">
                🗑 ลบ
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadForms() {
  try {
    const forms = await api(`/api/admin/forms?role=${encodeURIComponent(role)}`);

    allForms = Array.isArray(forms) ? forms : [];

    updateStats(allForms);
    fillFilters(allForms);
    renderForms();
  } catch (err) {
    console.error(err);
    formTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">เกิดข้อผิดพลาด: ${esc(err.message)}</td>
      </tr>
    `;
  }
}

async function deleteForm(id, title) {
  if (!confirm(`ต้องการลบฟอร์ม "${title || id}" ใช่ไหม?`)) return;

  await api(`/api/admin/forms/${id}?role=${encodeURIComponent(role)}`, {
    method: "DELETE",
  });

  await loadForms();
}

window.deleteForm = deleteForm;

btnRefresh.addEventListener("click", loadForms);
searchInput.addEventListener("input", renderForms);
ownerFilter.addEventListener("change", renderForms);
strategyFilter.addEventListener("change", renderForms);
sortFilter.addEventListener("change", renderForms);

guardAdmin();
loadForms();