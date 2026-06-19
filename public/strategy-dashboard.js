const uniStrategyOptions = document.getElementById("uniStrategyOptions");
const centerStrategyOptions = document.getElementById("centerStrategyOptions");

const uniStrategyBtn = document.getElementById("uniStrategyBtn");
const centerStrategyBtn = document.getElementById("centerStrategyBtn");

const uniStrategyAll = document.getElementById("uniStrategyAll");
const centerStrategyAll = document.getElementById("centerStrategyAll");

const uniStrategyMulti = document.getElementById("uniStrategyMulti");
const centerStrategyMulti = document.getElementById("centerStrategyMulti");

const fDateFrom = document.getElementById("fDateFrom");
const fDateTo = document.getElementById("fDateTo");
const btnRefresh = document.getElementById("btnRefresh");

const kpiForms = document.getElementById("kpiForms");
const kpiRespondents = document.getElementById("kpiRespondents");
const kpiAvg = document.getElementById("kpiAvg");
const kpiComments = document.getElementById("kpiComments");

const strategyTableBody = document.getElementById("strategyTableBody");
const commentList = document.getElementById("commentList");

const uniStrategyCards = document.getElementById("uniStrategyCards");
const centerStrategyCards = document.getElementById("centerStrategyCards");
const uniGroupCount = document.getElementById("uniGroupCount");
const centerGroupCount = document.getElementById("centerGroupCount");

const username = (localStorage.getItem("user") || "").trim();
const role = (localStorage.getItem("role") || "manager").trim();

const yearOptions = document.getElementById("yearOptions");
const yearBtn = document.getElementById("yearBtn");
const yearAll = document.getElementById("yearAll");
const yearMulti = document.getElementById("yearMulti");

let selectedYears = [];

let selectedUniStrategies = [];
let selectedCenterStrategies = [];

let yearTrendChart;
let uniStrategyChart;
let centerStrategyChart;
let formsByYearChart;

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setSelectOptions(
  selectEl,
  items,
  includeAll = true,
  allText = "ทั้งหมด",
) {
  const list = [];
  if (includeAll) list.push(`<option value="">${allText}</option>`);
  for (const item of items) {
    list.push(`<option value="${esc(item)}">${esc(item)}</option>`);
  }
  selectEl.innerHTML = list.join("");
}

function updateMultiButtonText(btnEl, selectedArr) {
  if (!selectedArr.length) {
    btnEl.textContent = "ทั้งหมด";
  } else if (selectedArr.length === 1) {
    btnEl.textContent = selectedArr[0];
  } else {
    btnEl.textContent = `เลือกแล้ว ${selectedArr.length} รายการ`;
  }
}

function setupMultiDropdown(multiEl, btnEl, allEl, optionsEl, selectedArr) {
  btnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    multiEl.classList.toggle("open");
  });

  multiEl.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.addEventListener("click", () => {
    multiEl.classList.remove("open");
  });

  allEl.addEventListener("change", () => {
    if (allEl.checked) {
      selectedArr.length = 0;
      optionsEl.querySelectorAll("input").forEach((cb) => {
        cb.checked = false;
      });
      updateMultiButtonText(btnEl, selectedArr);
      refreshDashboard();
    }
  });
}

function renderMultiOptions(container, items, selectedArr, btnEl, allEl) {
  container.innerHTML = (items || [])
    .map(
      (item) => `
      <label class="multi-option">
        <input type="checkbox" value="${esc(item)}" />
        <span>${esc(item)}</span>
      </label>
    `,
    )
    .join("");

  container.querySelectorAll("input").forEach((cb) => {
    cb.addEventListener("change", () => {
      selectedArr.length = 0;

      container.querySelectorAll("input:checked").forEach((c) => {
        selectedArr.push(c.value);
      });

      allEl.checked = selectedArr.length === 0;
      updateMultiButtonText(btnEl, selectedArr);
      refreshDashboard();
    });
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

  centerStrategyChart = new Chart(
    document.getElementById("centerStrategyChart"),
    {
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
    },
  );

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
    options: {
      ...chartOptions(),
      plugins: {
        legend: {
          display: false,
        },
      },
    },
    // plugins: [ChartDataLabels], // 👈 สำคัญมาก
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
    selectedUniStrategies,
    uniStrategyBtn,
    uniStrategyAll,
  );

  renderMultiOptions(
    centerStrategyOptions,
    json.centerStrategies || [],
    selectedCenterStrategies,
    centerStrategyBtn,
    centerStrategyAll,
  );

  renderMultiOptions(
    yearOptions,
    (json.fiscalYears || []).map(String),
    selectedYears,
    yearBtn,
    yearAll,
  );
}
function avgRows(rows) {
  const nums = (rows || []).map((r) => Number(r.avg)).filter(Number.isFinite);

  if (!nums.length) return 0;

  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function sumRows(rows, field) {
  return (rows || []).reduce((sum, r) => sum + Number(r[field] || 0), 0);
}

function groupRowsBy(rows, key) {
  const map = new Map();

  (rows || []).forEach((row) => {
    const name = String(row[key] || "-").trim() || "-";

    if (!map.has(name)) {
      map.set(name, []);
    }

    map.get(name).push(row);
  });

  return map;
}

function shortText(text, max = 46) {
  const s = String(text || "-").trim();
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function renderStrategySplit(rows) {
  renderStrategyGroup({
    rows,
    key: "uni_strategy",
    wrapper: uniStrategyCards,
    badge: uniGroupCount,
    type: "uni",
    title: "ยุทธศาสตร์มหาวิทยาลัย",
  });

  renderStrategyGroup({
    rows,
    key: "center_strategy",
    wrapper: centerStrategyCards,
    badge: centerGroupCount,
    type: "center",
    title: "ยุทธศาสตร์ศูนย์บรรณสาร",
  });
}

function renderStrategyGroup({ rows, key, wrapper, badge, type, title }) {
  if (!wrapper) return;

  const cleanRows = (rows || []).filter((r) => {
    const value = String(r[key] || "").trim();
    return value && value !== "-";
  });

  const groups = Array.from(groupRowsBy(cleanRows, key).entries());

  if (badge) {
    badge.textContent = `${cleanRows.length} ฟอร์ม`;
  }

  if (!groups.length) {
    wrapper.innerHTML = `<div class="empty">ยังไม่มีข้อมูล${esc(title)}</div>`;
    return;
  }

  wrapper.innerHTML = groups
    .map(([strategyName, groupRows], index) => {
      const formCount = groupRows.length;
      const respondentCount = sumRows(groupRows, "respondents");
      const avgScore = avgRows(groupRows);
      const barWidth = Math.max(3, Math.min(100, (avgScore / 5) * 100));

      const tableRows = groupRows
        .map(
          (r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(r.form_title || "-")}</td>
              <td>${esc(r.fiscal_year || "-")}</td>
              <td>${Number(r.avg || 0).toFixed(2)}</td>
              <td>${r.respondents || 0}</td>
            </tr>
          `,
        )
        .join("");

      return `
        <div class="strategy-topic-card ${type}">
          <div class="strategy-topic-head">
            <div>
              <h3 class="strategy-topic-title">
                ${type === "uni" ? "🏫" : "📚"} ${index + 1}. ${esc(strategyName)}
              </h3>
              <div class="strategy-topic-sub">${esc(title)}</div>
            </div>
            <div class="strategy-main-badge">${formCount} ฟอร์ม</div>
          </div>

          <div class="strategy-kpi-grid">
            <div class="strategy-mini-kpi">
              <div class="strategy-mini-label">จำนวนฟอร์ม</div>
              <div class="strategy-mini-value">${formCount}</div>
              <div>ฟอร์ม</div>
            </div>

            <div class="strategy-mini-kpi">
              <div class="strategy-mini-label">ผู้ตอบทั้งหมด</div>
              <div class="strategy-mini-value">${respondentCount}</div>
              <div>คน</div>
            </div>

            <div class="strategy-mini-kpi">
              <div class="strategy-mini-label">ค่าเฉลี่ยความพึงพอใจ</div>
              <div class="strategy-mini-value">${avgScore.toFixed(2)}</div>
              <div>คะแนน</div>
            </div>

            <div class="strategy-mini-kpi">
              <div class="strategy-mini-label">จำนวนหัวข้อ</div>
              <div class="strategy-mini-value">${groupRows.length}</div>
              <div>รายการ</div>
            </div>
          </div>

          <div class="strategy-content-grid">
            <div class="strategy-chart-box">
              <div class="strategy-box-title">แนวโน้มคะแนนความพึงพอใจรายปี</div>
              <div class="fake-chart">
                <div class="fake-dot" title="${avgScore.toFixed(2)}"></div>
              </div>
              <div style="text-align:center; color:var(--muted); margin-top:6px;">
                ${esc(groupRows[0]?.fiscal_year || "-")}
              </div>
            </div>

            <div class="strategy-chart-box">
              <div class="strategy-box-title">เปรียบเทียบค่าเฉลี่ย</div>
              <div class="fake-bar-wrap">
                <div class="fake-bar-label">${esc(shortText(strategyName, 34))}</div>
                <div class="fake-bar-track">
                  <div class="fake-bar" style="width:${barWidth}%"></div>
                </div>
              </div>
              <div style="text-align:center; font-weight:800; color:var(--red);">
                ${avgScore.toFixed(2)}
              </div>
            </div>

            <div class="strategy-table-box">
              <div class="strategy-box-title">รายการฟอร์มใน${esc(title)}</div>
              <table>
                <thead>
                  <tr>
                    <th style="width:60px;">ลำดับ</th>
                    <th>ชื่อฟอร์ม</th>
                    <th style="width:90px;">ปี</th>
                    <th style="width:95px;">ค่าเฉลี่ย</th>
                    <th style="width:80px;">ผู้ตอบ</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
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
  `,
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
  `,
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
  centerStrategyChart.data.datasets[0].data =
    charts?.centerStrategy?.values || [];
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
    fiscal_years: selectedYears.join(","),
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

  renderStrategySplit(json.table || []);
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

    setupMultiDropdown(
      uniStrategyMulti,
      uniStrategyBtn,
      uniStrategyAll,
      uniStrategyOptions,
      selectedUniStrategies,
    );

    setupMultiDropdown(
      centerStrategyMulti,
      centerStrategyBtn,
      centerStrategyAll,
      centerStrategyOptions,
      selectedCenterStrategies,
    );

    setupMultiDropdown(yearMulti, yearBtn, yearAll, yearOptions, selectedYears);

    await loadOptions();
    await refreshDashboard();

    [fDateFrom, fDateTo].forEach((el) => {
      el.addEventListener("change", refreshDashboard);
    });

    btnRefresh.addEventListener("click", refreshDashboard);
  } catch (err) {
    console.error(err);
    alert("โหลด Dashboard ยุทธศาสตร์ไม่สำเร็จ: " + err.message);
  }
})();
