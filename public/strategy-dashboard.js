const uniStrategyOptions = document.getElementById("uniStrategyOptions");
const centerStrategyOptions = document.getElementById("centerStrategyOptions");

const uniStrategyBtn = document.getElementById("uniStrategyBtn");
const centerStrategyBtn = document.getElementById("centerStrategyBtn");

const uniStrategyAll = document.getElementById("uniStrategyAll");
const centerStrategyAll = document.getElementById("centerStrategyAll");

const uniStrategyMulti = document.getElementById("uniStrategyMulti");
const centerStrategyMulti = document.getElementById("centerStrategyMulti");

let selectedUniStrategies = [];
let selectedCenterStrategies = [];
const fFiscalYear = document.getElementById("fFiscalYear");
const fDateFrom = document.getElementById("fDateFrom");
const fDateTo = document.getElementById("fDateTo");
const btnRefresh = document.getElementById("btnRefresh");

const kpiForms = document.getElementById("kpiForms");
const kpiRespondents = document.getElementById("kpiRespondents");
const kpiAvg = document.getElementById("kpiAvg");
const kpiComments = document.getElementById("kpiComments");

const strategyTableBody = document.getElementById("strategyTableBody");
const commentList = document.getElementById("commentList");

const username = (localStorage.getItem("user") || "").trim();
const role = (localStorage.getItem("role") || "staff").trim();

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

let yearTrendChart;
let uniStrategyChart;
let centerStrategyChart;
let formsByYearChart;

function buildCharts() {
  yearTrendChart = new Chart(document.getElementById("yearTrendChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "ค่าเฉลี่ยความพึงพอใจ",
          data: [],
          borderColor: "#9b1c1c",
          backgroundColor: "rgba(155, 28, 28, 0.12)",
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: "#9b1c1c",
        },
      ],
    },
    options: chartOptions(),
  });

  uniStrategyChart = new Chart(document.getElementById("uniStrategyChart"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "ค่าเฉลี่ย",
          data: [],
          backgroundColor: "#9b1c1c",
          borderRadius: 10,
          borderSkipped: false,
        },
      ],
    },
    options: chartOptions(true),
  });

  centerStrategyChart = new Chart(document.getElementById("centerStrategyChart"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "ค่าเฉลี่ย",
          data: [],
          backgroundColor: "#c9a34e",
          borderRadius: 10,
          borderSkipped: false,
        },
      ],
    },
    options: chartOptions(true),
  });

  formsByYearChart = new Chart(document.getElementById("formsByYearChart"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "จำนวนฟอร์ม",
          data: [],
          backgroundColor: "#9b1c1c",
          borderRadius: 10,
          borderSkipped: false,
        },
      ],
    },
    options: chartOptions(),
  });
}

function chartOptions(indexAxisY = false) {
  return {
    indexAxis: indexAxisY ? "y" : "x",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: "#2a1a1a",
          font: { family: "Noto Sans Thai" },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { color: "#7a5c5c" },
        grid: { color: "rgba(234, 216, 200, 0.7)" },
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#7a5c5c" },
        grid: { color: "rgba(234, 216, 200, 0.7)" },
      },
    },
  };
}

async function loadOptions() {
  const qs = new URLSearchParams({ username, role });
  const res = await fetch("/api/strategy-dashboard/options?" + qs.toString());
  const json = await res.json();

  if (!res.ok) throw new Error(json?.error || "โหลด options ไม่สำเร็จ");

 function renderMultiOptions(container, items, selectedArr) {
  container.innerHTML = items
    .map(
      (item) => `
      <label class="multi-option">
        <input type="checkbox" value="${esc(item)}" />
        <span>${esc(item)}</span>
      </label>
    `
    )
    .join("");

  container.querySelectorAll("input").forEach((cb) => {
    cb.addEventListener("change", () => {
      selectedArr.length = 0;
      container.querySelectorAll("input:checked").forEach((c) => {
        selectedArr.push(c.value);
      });
      refreshDashboard();
    });
  });
}

async function loadOptions() {
  const qs = new URLSearchParams({ username, role });
  const res = await fetch("/api/strategy-dashboard/options?" + qs.toString());
  const json = await res.json();

  if (!res.ok) throw new Error(json?.error || "โหลด options ไม่สำเร็จ");

  renderMultiOptions(
    uniStrategyOptions,
    json.uniStrategies || [],
    selectedUniStrategies
  );

  renderMultiOptions(
    centerStrategyOptions,
    json.centerStrategies || [],
    selectedCenterStrategies
  );

  setSelectOptions(fFiscalYear, (json.fiscalYears || []).map(String), true, "ทั้งหมด");
}

  setSelectOptions(fFiscalYear, (json.fiscalYears || []).map(String), true, "ทั้งหมด");
}

function renderTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    strategyTableBody.innerHTML = `<tr><td colspan="7" class="empty">ยังไม่มีข้อมูล</td></tr>`;
    return;
  }

  strategyTableBody.innerHTML = rows
    .map(
      (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(r.form_title || "-")}</td>
        <td>${esc(r.uni_strategy || "-")}</td>
        <td>${esc(r.center_strategy || "-")}</td>
        <td>${esc(r.fiscal_year || "-")}</td>
        <td>${Number(r.avg || 0).toFixed(2)}</td>
        <td>${r.respondents || 0}</td>
      </tr>
    `
    )
    .join("");
}

function renderComments(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    commentList.innerHTML = `<div class="empty">ยังไม่มีข้อเสนอแนะ</div>`;
    return;
  }

  commentList.innerHTML = rows
    .map(
      (c) => `
      <div class="comment-item">
        <div class="comment-meta">
          ${esc(c.created_by || "-")} • ${esc(c.form_title || "-")} • ${new Date(c.created_at).toLocaleString("th-TH")}
        </div>
        <div>${esc(c.text || "-")}</div>
      </div>
    `
    )
    .join("");
}

function updateCharts(charts) {
  yearTrendChart.data.labels = charts?.yearTrend?.labels || [];
  yearTrendChart.data.datasets[0].data = charts?.yearTrend?.values || [];
  yearTrendChart.update();

  uniStrategyChart.data.labels = charts?.uniStrategy?.labels || [];
  uniStrategyChart.data.datasets[0].data = charts?.uniStrategy?.values || [];
  uniStrategyChart.update();

  centerStrategyChart.data.labels = charts?.centerStrategy?.labels || [];
  centerStrategyChart.data.datasets[0].data = charts?.centerStrategy?.values || [];
  centerStrategyChart.update();

  formsByYearChart.data.labels = charts?.formsByYear?.labels || [];
  formsByYearChart.data.datasets[0].data = charts?.formsByYear?.values || [];
  formsByYearChart.update();
}

async function loadSummary() {
  const qs = new URLSearchParams({
    username,
    role,
    uni_strategies: selectedUniStrategies.join(","),
    center_strategies: selectedCenterStrategies.join(","),
    fiscal_year: fFiscalYear.value,
    date_from: fDateFrom.value,
    date_to: fDateTo.value,
  });

  const res = await fetch("/api/strategy-dashboard/summary?" + qs.toString());
  const json = await res.json();

  if (!res.ok) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");

  kpiForms.textContent = json.kpi?.forms || 0;
  kpiRespondents.textContent = json.kpi?.respondents || 0;
  kpiAvg.textContent = Number(json.kpi?.avgSatisfaction || 0).toFixed(2);
  kpiComments.textContent = json.kpi?.totalComments || 0;

  renderTable(json.table || []);
  renderComments(json.comments || []);
  updateCharts(json.charts || {});
}

async function refreshDashboard() {
  try {
    await loadSummary();
  } catch (err) {
    console.error(err);
    strategyTableBody.innerHTML = `<tr><td colspan="7" class="empty">เกิดข้อผิดพลาด: ${esc(err.message)}</td></tr>`;
    commentList.innerHTML = `<div class="empty">โหลดข้อเสนอแนะไม่สำเร็จ</div>`;
  }
}

(async function boot() {
  try {
    buildCharts();
    await loadOptions();
    await refreshDashboard();

    [fFiscalYear, fDateFrom, fDateTo].forEach((el) => {
      el.addEventListener("change", refreshDashboard);
    });

    btnRefresh.addEventListener("click", refreshDashboard);
  } catch (err) {
    console.error(err);
    alert("โหลด Dashboard ยุทธศาสตร์ไม่สำเร็จ: " + err.message);
  }
})();