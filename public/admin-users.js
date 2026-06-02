const role = (localStorage.getItem("role") || "").trim();

const userTableBody = document.getElementById("userTableBody");
const newUsername = document.getElementById("newUsername");
const newDisplayName = document.getElementById("newDisplayName");
const newPassword = document.getElementById("newPassword");
const newDeptName = document.getElementById("newDeptName");
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

async function loadUsers() {
  const users = await api(`/api/admin/users?role=${encodeURIComponent(role)}`);

  if (!users.length) {
    userTableBody.innerHTML = `<tr><td colspan="4" class="empty">ยังไม่มีผู้ใช้</td></tr>`;
    return;
  }

  userTableBody.innerHTML = users.map((u) => `
    <tr>
      <td>${esc(u.username)}</td>
      <td>${esc(u.display_name || u.username)}</td>
      <td>${esc(u.dept_name || "-")}</td>
      <td>
        <span class="badge ${esc(u.role || "staff")}">${esc(u.role || "staff")}</span>
      </td>
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

async function addUser() {
  const body = {
  username: newUsername.value.trim(),
  display_name: newDisplayName.value.trim(),
  password: newPassword.value.trim(),
  dept_name: newDeptName.value.trim(),
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
  newDisplayName.value = "";
  newPassword.value = "";
  newDeptName.value = "";
  newRole.value = "staff";

  await loadUsers();
}

async function updateUserRole(id, nextRole) {
  await api(`/api/admin/users/${id}/role?role=${encodeURIComponent(role)}`, {
    method: "PUT",
    body: JSON.stringify({ role: nextRole }),
  });

  await loadUsers();
}

async function deleteUser(id, name) {
  if (!confirm(`ต้องการลบผู้ใช้ "${name}" ใช่ไหม?`)) return;

  await api(`/api/admin/users/${id}?role=${encodeURIComponent(role)}`, {
    method: "DELETE",
  });

  await loadUsers();
}

window.updateUserRole = updateUserRole;
window.deleteUser = deleteUser;

btnAddUser.addEventListener("click", addUser);
btnRefresh.addEventListener("click", loadUsers);

guardAdmin();
loadUsers();