const role = (localStorage.getItem("role") || "").trim();
const username = (localStorage.getItem("user") || "").trim();

const kpiUsers = document.getElementById("kpiUsers");
const kpiForms = document.getElementById("kpiForms");
const kpiSubmissions = document.getElementById("kpiSubmissions");
const kpiAdmins = document.getElementById("kpiAdmins");

const userTableBody = document.getElementById("userTableBody");
const formTableBody = document.getElementById("formTableBody");

const newUsername = document.getElementById("newUsername");
const newPassword = document.getElementById("newPassword");
const newRole = document.getElementById("newRole");

const btnAddUser = document.getElementById("btnAddUser");
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

async function loadOverview() {
  const json = await api(`/api/admin/overview?role=${encodeURIComponent(role)}`);

  kpiUsers.textContent = json.users || 0;
  kpiForms.textContent = json.forms || 0;
  kpiSubmissions.textContent = json.submissions || 0;
  kpiAdmins.textContent = json.admins || 0;
}

async function loadUsers() {
  const users = await api(`/api/admin/users?role=${encodeURIComponent(role)}`);

  if (!users.length) {
    userTableBody.innerHTML = `<tr><td colspan="4" class="empty">ยังไม่มีผู้ใช้</td></tr>`;
    return;
  }

  userTableBody.innerHTML = users.map((u) => `
    <tr>
      <td>${esc(u.username)}</td>
      <td><span class="badge">${esc(u.role || "staff")}</span></td>
      <td>
        <select onchange="updateUserRole(${u.id}, this.value)">
          <option value="staff" ${u.role === "staff" ? "selected" : ""}>staff</option>
          <option value="manager" ${u.role === "manager" ? "selected" : ""}>manager</option>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
        </select>
      </td>
      <td>
        <button class="btn danger" onclick="deleteUser(${u.id}, '${esc(u.username)}')">
          ลบ
        </button>
      </td>
    </tr>
  `).join("");
}

async function loadForms() {
  const forms = await api(`/api/admin/forms?role=${encodeURIComponent(role)}`);

  if (!forms.length) {
    formTableBody.innerHTML = `<tr><td colspan="4" class="empty">ยังไม่มีฟอร์ม</td></tr>`;
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
      <td>
        <a class="btn" href="preview.html?formId=${f.id}">ดู</a>
        <button class="btn danger" onclick="deleteForm(${f.id}, '${esc(f.form_title || "")}')">
          ลบ
        </button>
      </td>
    </tr>
  `).join("");
}

async function addUser() {
  const body = {
    username: newUsername.value.trim(),
    password: newPassword.value.trim(),
    role: newRole.value,
  };

  if (!body.username || !body.password) {
    alert("กรุณากรอก username และ password");
    return;
  }

  await api(`/api/admin/users?role=${encodeURIComponent(role)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  newUsername.value = "";
  newPassword.value = "";
  newRole.value = "staff";

  await refreshAll();
}

async function updateUserRole(id, nextRole) {
  await api(`/api/admin/users/${id}/role?role=${encodeURIComponent(role)}`, {
    method: "PUT",
    body: JSON.stringify({ role: nextRole }),
  });

  await refreshAll();
}

async function deleteUser(id, name) {
  if (!confirm(`ต้องการลบผู้ใช้ "${name}" ใช่ไหม?`)) return;

  await api(`/api/admin/users/${id}?role=${encodeURIComponent(role)}`, {
    method: "DELETE",
  });

  await refreshAll();
}

async function deleteForm(id, title) {
  if (!confirm(`ต้องการลบฟอร์ม "${title}" ใช่ไหม?`)) return;

  await api(`/api/admin/forms/${id}?role=${encodeURIComponent(role)}`, {
    method: "DELETE",
  });

  await refreshAll();
}

async function refreshAll() {
  try {
    await loadOverview();
    await loadUsers();
    await loadForms();
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

window.updateUserRole = updateUserRole;
window.deleteUser = deleteUser;
window.deleteForm = deleteForm;

btnAddUser.addEventListener("click", addUser);
btnRefresh.addEventListener("click", refreshAll);

guardAdmin();
refreshAll();