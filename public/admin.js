const role = (localStorage.getItem("role") || "").trim();

const kpiUsers = document.getElementById("kpiUsers");
const kpiForms = document.getElementById("kpiForms");
const kpiSubmissions = document.getElementById("kpiSubmissions");
const kpiAdmins = document.getElementById("kpiAdmins");
const recentFormsBody = document.getElementById("recentFormsBody");

const btnRefresh = document.getElementById("btnRefresh");

function guardAdmin() {
  if (role !== "admin") {
    alert("หน้านี้สำหรับ admin เท่านั้น");
    window.location.href = "dashboard.html";
  }
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

async function loadRecentForms() {
  try {
    const forms = await api(`/api/admin/forms?role=${encodeURIComponent(role)}`);
    const latestForms = Array.isArray(forms) ? forms.slice(0, 5) : [];

    if (!latestForms.length) {
      recentFormsBody.innerHTML = `
        <tr>
          <td colspan="3" class="empty">ยังไม่มีฟอร์มล่าสุด</td>
        </tr>
      `;
      return;
    }

    recentFormsBody.innerHTML = latestForms
      .map((f) => {
        return `
          <tr>
            <td>${esc(f.form_title || "-")}</td>
            <td>${esc(f.created_by_username || f.created_by || "-")}</td>
            <td>
              <span class="status-pill">เปิดใช้งาน</span>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (err) {
    console.error(err);
    recentFormsBody.innerHTML = `
      <tr>
        <td colspan="3" class="empty">โหลดข้อมูลฟอร์มล่าสุดไม่สำเร็จ</td>
      </tr>
    `;
  }
}

function refreshDashboard() {
  loadOverview();
  loadRecentForms();
}

btnRefresh.addEventListener("click", refreshDashboard);

guardAdmin();
refreshDashboard();