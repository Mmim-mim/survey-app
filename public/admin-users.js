const role = (localStorage.getItem("role") || "").trim();

const userGroups = document.getElementById("userGroups");
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
    userGroups.innerHTML = `<div class="empty">ยังไม่มีผู้ใช้</div>`;
    return;
  }

  const deptOptions = [
    "ฝ่ายเลขานุการ",
    "ฝ่ายพัฒนาและจัดระบบทรัพยากรสารนิเทศ",
    "ฝ่ายบริการทรัพยากรสารนิเทศ",
    "ฝ่ายเทคโนโลยีสารสนเทศ",
  ];

  const groups = [
    {
      title: "👑 ผู้ดูแลระบบ",
      users: users.filter((u) => u.role === "admin"),
      isAdminGroup: true,
    },
    {
      title: "🏛️ ฝ่ายเลขานุการ",
      users: users.filter(
        (u) => u.role !== "admin" && u.dept_name === "ฝ่ายเลขานุการ"
      ),
    },
    {
      title: "📚 ฝ่ายพัฒนาและจัดระบบทรัพยากรสารนิเทศ",
      users: users.filter(
        (u) =>
          u.role !== "admin" &&
          u.dept_name === "ฝ่ายพัฒนาและจัดระบบทรัพยากรสารนิเทศ"
      ),
    },
    {
      title: "🤝 ฝ่ายบริการทรัพยากรสารนิเทศ",
      users: users.filter(
        (u) =>
          u.role !== "admin" &&
          u.dept_name === "ฝ่ายบริการทรัพยากรสารนิเทศ"
      ),
    },
    {
      title: "💻 ฝ่ายเทคโนโลยีสารสนเทศ",
      users: users.filter(
        (u) => u.role !== "admin" && u.dept_name === "ฝ่ายเทคโนโลยีสารสนเทศ"
      ),
    },
  ];

  function deptSelect(u) {
    if (u.role === "admin") return "-";

    return `
      <select onchange="updateUserDept(${u.id}, this.value)">
        <option value="">-- เลือกฝ่าย --</option>
        ${deptOptions
          .map(
            (dept) => `
              <option value="${esc(dept)}" ${u.dept_name === dept ? "selected" : ""}>
                ${esc(dept)}
              </option>
            `
          )
          .join("")}
      </select>
    `;
  }

  function roleSelect(u) {
    return `
      <select onchange="updateUserRole(${u.id}, this.value)">
        <option value="staff" ${u.role === "staff" ? "selected" : ""}>staff</option>
        <option value="manager" ${u.role === "manager" ? "selected" : ""}>manager</option>
        <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
      </select>
    `;
  }

  function renderRows(group) {
    if (!group.users.length) {
      return `
        <tr>
          <td colspan="6" class="empty">ยังไม่มีผู้ใช้ในกลุ่มนี้</td>
        </tr>
      `;
    }

    return group.users
      .map(
        (u) => `
          <tr>
            <td>${esc(u.username)}</td>
            <td>${esc(u.display_name || u.username)}</td>
            <td>${group.isAdminGroup ? "-" : deptSelect(u)}</td>
            <td>
              <span class="badge ${esc(u.role || "staff")}">
                ${esc(u.role || "staff")}
              </span>
            </td>
            <td>${roleSelect(u)}</td>
            <td>
              <button class="btn danger" onclick="deleteUser(${u.id}, '${esc(u.username)}')">
                ลบ
              </button>
            </td>
          </tr>
        `
      )
      .join("");
  }

  userGroups.innerHTML = `
    <div class="user-groups">
      ${groups
        .map(
          (group) => `
            <div class="user-group">
              <div class="group-title">
                <span>${group.title}</span>
                <span class="group-count">${group.users.length} คน</span>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>ชื่อที่แสดง</th>
                      <th>เปลี่ยนฝ่าย</th>
                      <th>Role</th>
                      <th>เปลี่ยน Role</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${renderRows(group)}
                  </tbody>
                </table>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

async function updateUserDept(id, nextDept) {
  await api(`/api/admin/users/${id}/dept?role=${encodeURIComponent(role)}`, {
    method: "PUT",
    body: JSON.stringify({ dept_name: nextDept }),
  });

  await loadUsers();
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
window.updateUserDept = updateUserDept;
window.deleteUser = deleteUser;

btnAddUser.addEventListener("click", addUser);
btnRefresh.addEventListener("click", loadUsers);

guardAdmin();
loadUsers();