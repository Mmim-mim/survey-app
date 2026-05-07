const role = (localStorage.getItem("role") || "").trim();

const formTableBody = document.getElementById("formTableBody");
const btnRefresh = document.getElementById("btnRefresh");

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

async function loadForms() {
  const forms = await api(`/api/admin/forms?role=${encodeURIComponent(role)}`);

  if (!forms.length) {
    formTableBody.innerHTML = `<tr><td colspan="5" class="empty">ยังไม่มีฟอร์ม</td></tr>`;
    return;
  }

  formTableBody.innerHTML = forms.map((f) => `
    <tr>
      <td>${esc(f.form_title || "-")}</td>
      <td>${esc(f.created_by_username || f.created_by || "-")}</td>
      <td>
        <div>${esc(f.uni_strategy || "-")}</div>
        <div class="sub">${esc(f.center_strategy || "-")}</div>
      </td>
      <td>${esc(f.created_at || "-")}</td>
      <td>
        <a class="btn" href="preview.html?formId=${f.id}" target="_blank">ดู</a>
        <button class="btn danger" onclick="deleteForm(${f.id}, '${esc(f.form_title || "")}')">
          ลบ
        </button>
      </td>
    </tr>
  `).join("");
}

async function deleteForm(id, title) {
  if (!confirm(`ต้องการลบฟอร์ม "${title}" ใช่ไหม?`)) return;

  await api(`/api/admin/forms/${id}?role=${encodeURIComponent(role)}`, {
    method: "DELETE",
  });

  await loadForms();
}

window.deleteForm = deleteForm;

btnRefresh.addEventListener("click", loadForms);

guardAdmin();
loadForms();