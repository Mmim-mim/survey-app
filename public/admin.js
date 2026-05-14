const role = (localStorage.getItem("role") || "").trim();

const kpiUsers = document.getElementById("kpiUsers");
const kpiForms = document.getElementById("kpiForms");
const kpiSubmissions = document.getElementById("kpiSubmissions");
const kpiAdmins = document.getElementById("kpiAdmins");

const btnRefresh = document.getElementById("btnRefresh");

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
  try {
    const json = await api(`/api/admin/overview?role=${encodeURIComponent(role)}`);

    kpiUsers.textContent = json.users || 0;
    kpiForms.textContent = json.forms || 0;
    kpiSubmissions.textContent = json.submissions || 0;
    kpiAdmins.textContent = json.admins || 0;

  } catch (err) {
    console.error(err);
  }
}

btnRefresh.addEventListener("click", loadOverview);

guardAdmin();
loadOverview();