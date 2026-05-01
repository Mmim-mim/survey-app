const fForm = document.getElementById("fForm");
const fDept = document.getElementById("fDept");


const yearMulti = document.getElementById("yearMulti");
const yearMultiBtn = document.getElementById("yearMultiBtn");
const yearMultiMenu = document.getElementById("yearMultiMenu");
const yearAll = document.getElementById("yearAll");
const yearOptions = document.getElementById("yearOptions");
const fDateFrom = document.getElementById("fDateFrom");
const fDateTo = document.getElementById("fDateTo");
const fRoleView = document.getElementById("fRoleView");
const btnRefresh = document.getElementById("btnRefresh");

const sForm = document.getElementById("sForm");
const sYear = document.getElementById("sYear");
const sDept = document.getElementById("sDept");
const sDate = document.getElementById("sDate");

const kpiRespondents = document.getElementById("kpiRespondents");
const kpiAvg = document.getElementById("kpiAvg");
const kpiComments = document.getElementById("kpiComments");
const kpiRole = document.getElementById("kpiRole");

const summaryTableBody = document.getElementById("summaryTableBody");
const commentList = document.getElementById("commentList");

const username = (localStorage.getItem("user") || "").trim();
const role = (localStorage.getItem("role") || "staff").trim();

fRoleView.value = role;
kpiRole.textContent = role;

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setSelectOptions(selectEl, items, includeAll = true, allText = "ทั้งหมด") {
  const list = [];
  if (includeAll) list.push(`<option value="">${allText}</option>`);
  for (const item of items) {
    list.push(`<option value="${esc(item)}">${esc(item)}</option>`);
  }
  selectEl.innerHTML = list.join("");
}

let selectedYears = [];

function renderYearOptions(years) {
  yearOptions.innerHTML = (years || [])
    .map(
      (year) => `
        <label class="multi-option">
          <input type="checkbox" class="year-check" value="${esc(year)}" />
          <span>${esc(year)}</span>
        </label>
      `
    )
    .join("");

  selectedYears = [];
  yearAll.checked = true;
  updateYearButtonText();
}

function updateYearButtonText() {
  if (!selectedYears.length) {
    yearMultiBtn.textContent = "ทั้งหมด";
  } else if (selectedYears.length === 1) {
    yearMultiBtn.textContent = selectedYears[0];
  } else {
    yearMultiBtn.textContent = selectedYears.join(", ");
  }
}

function getFiscalYearsParam() {
  return selectedYears.join(",");
}

yearMultiBtn.addEventListener("click", () => {
  yearMulti.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (!yearMulti.contains(e.target)) {
    yearMulti.classList.remove("open");
  }
});

yearAll.addEventListener("change", () => {
  const checks = yearOptions.querySelectorAll(".year-check");

  if (yearAll.checked) {
    selectedYears = [];
    checks.forEach((c) => (c.checked = false));
  }

  updateYearButtonText();
  refreshDashboard();
});

yearOptions.addEventListener("change", () => {
  const checks = [...yearOptions.querySelectorAll(".year-check")];

  selectedYears = checks.filter((c) => c.checked).map((c) => c.value);

  yearAll.checked = selectedYears.length === 0;

  updateYearButtonText();
  refreshDashboard();
});

let pieChart;
let barChart;

function buildCharts() {
  pieChart = new Chart(document.getElementById("pieChart"), {
    type: "pie",
    data: {
      labels: ["พึงพอใจ", "ควรปรับปรุง"],
      datasets: [
        {
          data: [0, 0],
          backgroundColor: ["#9b1c1c", "#c9a34e"],
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#2a1a1a",
            font: {
              family: "Noto Sans Thai",
            },
          },
        },
      },
    },
  });

  barChart = new Chart(document.getElementById("barChart"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "พึงพอใจ",
          data: [],
          backgroundColor: "#9b1c1c",
          borderRadius: 6,
        },
        {
          label: "ควรปรับปรุง",
          data: [],
          backgroundColor: "#c9a34e",
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#2a1a1a",
            font: {
              family: "Noto Sans Thai",
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#7a5c5c",
          },
          grid: {
            color: "rgba(234, 216, 200, 0.7)",
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: "#7a5c5c",
          },
          grid: {
            color: "rgba(234, 216, 200, 0.7)",
          },
        },
      },
    },
  });
}

async function loadOptions() {
  const qs = new URLSearchParams({ username, role });
  const res = await fetch("/api/dashboard/options?" + qs.toString());
  const json = await res.json();

  if (!res.ok) throw new Error(json?.error || "โหลด options ไม่สำเร็จ");

  setSelectOptions(fForm, json.forms || [], true, "ทั้งหมด");
renderYearOptions((json.fiscalYears || []).map(String));
setSelectOptions(fDept, json.depts || [], true, "ทั้งหมด");


}

function renderTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    summaryTableBody.innerHTML = `<tr><td colspan="5" class="empty">ยังไม่มีข้อมูล</td></tr>`;
    return;
  }

  summaryTableBody.innerHTML = rows.map((r) => `
    <tr>
      <td>${r.no}</td>
      <td>${esc(r.question)}</td>
      <td>${Number(r.avg || 0).toFixed(2)}</td>
      <td>${Number(r.sd || 0).toFixed(2)}</td>
      <td>${r.count || 0}</td>
    </tr>
  `).join("");
}

function renderComments(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    commentList.innerHTML = `<div class="empty">ยังไม่มีข้อเสนอแนะ</div>`;
    return;
  }

  commentList.innerHTML = rows.map((c) => `
    <div class="comment-item">
      <div class="comment-meta">
        ${esc(c.created_by || "-")} • ${esc(c.form_title || "-")} • ${new Date(c.created_at).toLocaleString("th-TH")}
      </div>
      <div>${esc(c.text)}</div>
    </div>
  `).join("");
}

function updateCharts(charts) {
  pieChart.data.labels = charts?.pie?.labels || [];
  pieChart.data.datasets[0].data = charts?.pie?.values || [];
  pieChart.update();

  barChart.data.labels = charts?.bar?.labels || [];
  barChart.data.datasets[0].data = charts?.bar?.positive || [];
  barChart.data.datasets[1].data = charts?.bar?.negative || [];
  barChart.update();
}

async function loadSummary() {
  const qs = new URLSearchParams({
  username,
  role,
  form_title: fForm.value,
  fiscal_years: getFiscalYearsParam(),
  dept: fDept.value,

  date_from: fDateFrom.value,
  date_to: fDateTo.value
});
  const res = await fetch("/api/dashboard/summary?" + qs.toString());
  const json = await res.json();

  if (!res.ok) throw new Error(json?.error || "โหลด summary ไม่สำเร็จ");

  kpiRespondents.textContent = json.kpi?.respondents || 0;
  kpiAvg.textContent = Number(json.kpi?.avgSatisfaction || 0).toFixed(2);
  kpiComments.textContent = json.kpi?.totalComments || 0;

  sForm.textContent = fForm.value || "ทั้งหมด";
  sYear.textContent = selectedYears.length ? selectedYears.join(", ") : "ทั้งหมด";
  sDept.textContent = fDept.value || "ทั้งหมด";
  sDate.textContent = (fDateFrom.value || fDateTo.value)
    ? `${fDateFrom.value || "-"} ถึง ${fDateTo.value || "-"}`
    : "ทั้งหมด";

  renderTable(json.table || []);
  renderComments(json.comments || []);
  updateCharts(json.charts || {});
}

async function refreshDashboard() {
  try {
    await loadSummary();
  } catch (err) {
    console.error(err);
    summaryTableBody.innerHTML = `
      <tr><td colspan="5" class="empty">เกิดข้อผิดพลาด: ${esc(err.message)}</td></tr>
    `;
    commentList.innerHTML = `<div class="empty">โหลดข้อเสนอแนะไม่สำเร็จ</div>`;
  }
}

(async function boot() {
  try {
    buildCharts();
    await loadOptions();
    await refreshDashboard();

    [fForm, fDept, fUniStrategy, fCenterStrategy, fDateFrom, fDateTo].forEach((el) => {
  el.addEventListener("change", refreshDashboard);
});
    btnRefresh.addEventListener("click", refreshDashboard);
  } catch (err) {
    console.error(err);
    alert("โหลด Dashboard ไม่สำเร็จ: " + err.message);
  }
})();