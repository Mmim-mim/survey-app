const formMulti = document.getElementById("formMulti");
const formMultiBtn = document.getElementById("formMultiBtn");
const formMultiMenu = document.getElementById("formMultiMenu");
const formAll = document.getElementById("formAll");
const formOptions = document.getElementById("formOptions");

const fDept = document.getElementById("fDept");

const yearMulti = document.getElementById("yearMulti");
const yearMultiBtn = document.getElementById("yearMultiBtn");
const yearMultiMenu = document.getElementById("yearMultiMenu");
const yearAll = document.getElementById("yearAll");
const yearOptions = document.getElementById("yearOptions");
const fDateFrom = document.getElementById("fDateFrom");
const fDateTo = document.getElementById("fDateTo");
const btnRefresh = document.getElementById("btnRefresh");

const sForm = document.getElementById("sForm");
const sYear = document.getElementById("sYear");
const sDept = document.getElementById("sDept");
const sDate = document.getElementById("sDate");

const kpiRespondents = document.getElementById("kpiRespondents");
const kpiAvg = document.getElementById("kpiAvg");
const kpiComments = document.getElementById("kpiComments");
const kpiRole = document.getElementById("kpiRole");
const kpiSatisfactionPercent = document.getElementById(
  "kpiSatisfactionPercent",
);
const lastUpdated = document.getElementById("lastUpdated");
const overviewYear = document.getElementById("overviewYear");
const tableOverallAvg = document.getElementById("tableOverallAvg");
const tableFooterAvg = document.getElementById("tableFooterAvg");
const tableFooterSd = document.getElementById("tableFooterSd");
const tableFooterCount = document.getElementById("tableFooterCount");
const chartSatisfactionPercent = document.getElementById(
  "chartSatisfactionPercent",
);

const summaryTableBody = document.getElementById("summaryTableBody");
const commentList = document.getElementById("commentList");

const username = "";
const role = "manager";

if (kpiRole) kpiRole.textContent = "public";

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

let selectedYears = [];
let selectedForms = [];

function renderYearOptions(years) {
  yearOptions.innerHTML = (years || [])
    .map(
      (year) => `
        <label class="multi-option">
          <input type="checkbox" class="year-check" value="${esc(year)}" />
          <span>${esc(year)}</span>
        </label>
      `,
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

function renderFormOptions(forms) {
  formOptions.innerHTML = (forms || [])
    .map(
      (name) => `
        <label class="multi-option">
          <input type="checkbox" class="form-check" value="${esc(name)}" />
          <span>${esc(name)}</span>
        </label>
      `,
    )
    .join("");

  selectedForms = [];
  formAll.checked = true;
  updateFormButtonText();
}

function updateFormButtonText() {
  if (!selectedForms.length) {
    formMultiBtn.textContent = "ทั้งหมด";
  } else if (selectedForms.length === 1) {
    formMultiBtn.textContent = selectedForms[0];
  } else {
    formMultiBtn.textContent = `เลือก ${selectedForms.length} ฟอร์ม`;
  }
}

function getFormsParam() {
  return selectedForms.join(",");
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

formMultiBtn.addEventListener("click", () => {
  formMulti.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (!formMulti.contains(e.target)) {
    formMulti.classList.remove("open");
  }
});

formAll.addEventListener("change", () => {
  const checks = formOptions.querySelectorAll(".form-check");

  if (formAll.checked) {
    selectedForms = [];
    checks.forEach((c) => (c.checked = false));
  }

  updateFormButtonText();
  refreshDashboard();
});

formOptions.addEventListener("change", () => {
  const checks = [...formOptions.querySelectorAll(".form-check")];

  selectedForms = checks.filter((c) => c.checked).map((c) => c.value);

  formAll.checked = selectedForms.length === 0;

  updateFormButtonText();
  refreshDashboard();
});

let pieChart;
let barChart;

function buildCharts() {
  pieChart = new Chart(document.getElementById("pieChart"), {
    type: "doughnut",
    data: {
      labels: ["พึงพอใจ", "ควรปรับปรุง"],
      datasets: [
        {
          data: [0, 0],
          backgroundColor: ["#9b1c1c", "#c9a34e"],
          borderColor: "#ffffff",
          borderWidth: 4,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#2a1a1a",
            font: {
              family: "Noto Sans Thai",
              weight: "700",
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
          borderRadius: 7,
        },
        {
          label: "ควรปรับปรุง",
          data: [],
          backgroundColor: "#c9a34e",
          borderRadius: 7,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#2a1a1a",
            font: {
              family: "Noto Sans Thai",
              weight: "700",
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#7a5c5c" },
          grid: { color: "rgba(234, 216, 200, 0.7)" },
        },
        y: {
          afterFit: function (scale) {
            scale.width = 210;
          },
          ticks: {
            color: "#7a5c5c",
            font: {
              size: 11,
              family: "Noto Sans Thai",
            },
            callback: function (value) {
              const label = this.getLabelForValue(value);
              return label.length > 28 ? label.substring(0, 28) + "..." : label;
            },
          },
          grid: { display: false },
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

  renderFormOptions(json.forms || []);
  renderYearOptions((json.fiscalYears || []).map(String));
  setSelectOptions(fDept, json.depts || [], true, "ทั้งหมด");
}

function normalizeDashboardTitle(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const STANDARD_MODEL_ORDER = [
  "LibQUAL+TM",
  "SERVQUAL",
  "WEBQUAL",
  "SITEQUAL",
  "ESQUAL",
];

const STANDARD_GROUPS = {
  "LibQUAL+TM": [
    {
      keys: ["affect of service", "ความรู้สึกที่มีต่อบริการ"],
      title: "ความรู้สึกที่มีต่อบริการ (Affect of Service)",
    },
    {
      keys: ["information control", "การควบคุมสารสนเทศ"],
      title: "การควบคุมสารสนเทศ (Information Control)",
    },
    {
      keys: ["library as place", "ลักษณะกายภาพของห้องสมุด"],
      title: "ลักษณะกายภาพของห้องสมุด (Library as Place)",
    },
  ],

  SERVQUAL: [
    {
      keys: ["tangibles", "สิ่งที่สัมผัสได้", "ลักษณะทางกายภาพ"],
      title: "สิ่งที่สัมผัสได้ (Tangibles)",
    },
    {
      keys: ["reliability", "ความน่าเชื่อถือ"],
      title: "ความน่าเชื่อถือ (Reliability)",
    },
    {
      keys: ["responsiveness", "การตอบสนองของพนักงาน"],
      title: "การตอบสนองของพนักงาน (Responsiveness)",
    },
    {
      keys: ["assurance", "ความไว้วางใจ"],
      title: "ความไว้วางใจ (Assurance)",
    },
    {
      keys: ["empathy", "การเอาใจใส่"],
      title: "การเอาใจใส่ (Empathy)",
    },
  ],

  WEBQUAL: [
    {
      keys: ["usability", "การใช้งาน"],
      title: "การใช้งาน (Usability)",
    },
    {
      keys: [
        "information quality",
        "infomation quality",
        "คุณภาพของข้อมูล",
      ],
      title: "คุณภาพของข้อมูล (Information Quality)",
    },
    {
      keys: [
        "service interaction",
        "การตอบสนองต่อการบริการ",
        "ปฏิสัมพันธ์ด้านบริการ",
      ],
      title: "การตอบสนองต่อการบริการ (Service Interaction)",
    },
  ],

  SITEQUAL: [
    {
      keys: ["ease of use", "การใช้งานง่าย"],
      title: "การใช้งานง่าย (Ease of Use)",
    },
    {
      keys: ["aesthetic design", "การออกแบบที่สวยงาม"],
      title: "การออกแบบที่สวยงาม (Aesthetic Design)",
    },
    {
      keys: ["processing speed", "ความเร็วในการประมวลผล"],
      title: "ความเร็วในการประมวลผล (Processing Speed)",
    },
    {
      keys: [
        "interactive responsiveness",
        "การตอบสนองแบบโต้ตอบ",
      ],
      title: "การตอบสนอง (Interactive Responsiveness)",
    },
  ],

  ESQUAL: [
    {
      keys: ["efficiency", "ประสิทธิภาพ"],
      title: "ประสิทธิภาพ (Efficiency)",
    },
    {
      keys: ["system availability", "ความพร้อมของระบบ"],
      title: "ความพร้อมของระบบ (System Availability)",
    },
    {
      keys: ["fulfillment", "การปฏิบัติตามสัญญา"],
      title: "การปฏิบัติตามสัญญา (Fulfillment)",
    },
    {
      keys: ["privacy", "ความเป็นส่วนตัว"],
      title: "ความเป็นส่วนตัว (Privacy)",
    },
  ],
};

function normalizeModelName(modelTitle) {
  const value = normalizeDashboardTitle(modelTitle);

  if (value.includes("libqual")) return "LibQUAL+TM";
  if (value.includes("servqual")) return "SERVQUAL";
  if (value.includes("webqual")) return "WEBQUAL";
  if (value.includes("sitequal")) return "SITEQUAL";
  if (value.includes("esqual")) return "ESQUAL";

  return "";
}

function resolveStandardGroup(modelTitle, groupTitle) {
  const normalizedModel = normalizeModelName(modelTitle);
  const normalizedGroup = normalizeDashboardTitle(groupTitle);

  /*
   * ถ้า Backend ส่ง Model ถูกแล้ว
   */
  if (normalizedModel && STANDARD_GROUPS[normalizedModel]) {
    const matched = STANDARD_GROUPS[normalizedModel].find((group) =>
      group.keys.some((key) =>
        normalizedGroup.includes(normalizeDashboardTitle(key)),
      ),
    );

    if (matched) {
      return {
        modelTitle: normalizedModel,
        groupTitle: matched.title,
      };
    }

    return null;
  }

  /*
   * รองรับข้อมูลเก่าที่ model_title เป็น "แบบประเมินทั่วไป"
   * โดยตรวจจากชื่อหัวข้อย่อย
   */
  for (const modelName of STANDARD_MODEL_ORDER) {
    const matched = STANDARD_GROUPS[modelName].find((group) =>
      group.keys.some((key) =>
        normalizedGroup.includes(normalizeDashboardTitle(key)),
      ),
    );

    if (matched) {
      return {
        modelTitle: modelName,
        groupTitle: matched.title,
      };
    }
  }

  /*
   * ข้อมูลทดสอบ เช่น 111, ด้านอะไรก็ได้, มิม, หมา, แมว
   * จะไม่ถูกนำมาแสดง
   */
  return null;
}

function formatQuestionText(text) {
  const safeText = esc(text || "-");

  /*
   * ให้ข้อความในวงเล็บภาษาอังกฤษขึ้นบรรทัดใหม่
   * เช่น คำถามภาษาไทย (English text)
   */
  return safeText.replace(
    /\s*(\([^()]*[A-Za-z][^()]*\))\s*$/u,
    '<br><span class="question-english">$1</span>',
  );
}

function renderTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    summaryTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty">ยังไม่มีข้อมูล</td>
      </tr>
    `;

    if (tableOverallAvg) tableOverallAvg.textContent = "0.00";
    if (tableFooterAvg) tableFooterAvg.textContent = "0.00";
    if (tableFooterSd) tableFooterSd.textContent = "0.00";
    if (tableFooterCount) tableFooterCount.textContent = "0";

    return;
  }

  const modelMap = new Map();
  const visibleRows = [];

  for (const row of rows) {
    const resolved = resolveStandardGroup(
      row.model_title,
      row.group_title,
    );

    if (!resolved) continue;

    visibleRows.push(row);

    if (!modelMap.has(resolved.modelTitle)) {
      modelMap.set(resolved.modelTitle, new Map());
    }

    const groupMap = modelMap.get(resolved.modelTitle);

    if (!groupMap.has(resolved.groupTitle)) {
      groupMap.set(resolved.groupTitle, []);
    }

    groupMap.get(resolved.groupTitle).push(row);
  }

  const html = [];
  let modelNumber = 0;

  for (const modelTitle of STANDARD_MODEL_ORDER) {
    const groupMap = modelMap.get(modelTitle);

    if (!groupMap || groupMap.size === 0) continue;

    modelNumber += 1;

    html.push(`
      <tr class="model-header-row">
        <td colspan="5">
          <span class="model-number">${modelNumber}</span>
          <span class="model-title">${esc(modelTitle)}</span>
        </td>
      </tr>
    `);

    let groupNumber = 0;

    for (const standardGroup of STANDARD_GROUPS[modelTitle]) {
      const groupRows = groupMap.get(standardGroup.title);

      if (!groupRows || groupRows.length === 0) continue;

      groupNumber += 1;

      const totalCount = groupRows.reduce(
        (sum, row) => sum + Number(row.count || 0),
        0,
      );

      const groupAverage = totalCount
        ? groupRows.reduce(
            (sum, row) =>
              sum +
              Number(row.avg || 0) *
                Number(row.count || 0),
            0,
          ) / totalCount
        : 0;

      const groupSd = totalCount
        ? groupRows.reduce(
            (sum, row) =>
              sum +
              Number(row.sd || 0) *
                Number(row.count || 0),
            0,
          ) / totalCount
        : 0;

      html.push(`
        <tr class="model-group-row">
          <td class="model-group-number">
            ${modelNumber}.${groupNumber}
          </td>

          <td class="model-group-title">
            ${esc(standardGroup.title)}
          </td>

          <td class="model-group-score">
            ${groupAverage.toFixed(2)}
          </td>

          <td class="model-group-sd">
            ${groupSd.toFixed(2)}
          </td>

          <td class="model-group-count">
            ${totalCount.toLocaleString("th-TH")}
          </td>
        </tr>
      `);
    }
  }

  summaryTableBody.innerHTML = html.length
    ? html.join("")
    : `
      <tr>
        <td colspan="5" class="empty">
          ยังไม่มีข้อมูลรูปแบบมาตรฐาน
        </td>
      </tr>
    `;

  const totalCount = visibleRows.reduce(
    (sum, row) => sum + Number(row.count || 0),
    0,
  );

  const weightedAvg = totalCount
    ? visibleRows.reduce(
        (sum, row) =>
          sum +
          Number(row.avg || 0) *
            Number(row.count || 0),
        0,
      ) / totalCount
    : 0;

  const weightedSd = totalCount
    ? visibleRows.reduce(
        (sum, row) =>
          sum +
          Number(row.sd || 0) *
            Number(row.count || 0),
        0,
      ) / totalCount
    : 0;

  if (tableOverallAvg) {
    tableOverallAvg.textContent = weightedAvg.toFixed(2);
  }

  if (tableFooterAvg) {
    tableFooterAvg.textContent = weightedAvg.toFixed(2);
  }

  if (tableFooterSd) {
    tableFooterSd.textContent = weightedSd.toFixed(2);
  }

  if (tableFooterCount) {
    tableFooterCount.textContent =
      totalCount.toLocaleString("th-TH");
  }
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
      <div>${esc(c.text)}</div>
    </div>
  `,
    )
    .join("");
}

function updateCharts(charts) {
  const pieLabels = charts?.pie?.labels || [];
  const pieValues = charts?.pie?.values || [];

  pieChart.data.labels = pieLabels;
  pieChart.data.datasets[0].data = pieValues;
  pieChart.update();

  const totalPie = pieValues.reduce((sum, n) => sum + Number(n || 0), 0);
  const positiveValue = Number(pieValues[0] || 0);
  const percent = totalPie ? (positiveValue / totalPie) * 100 : 0;

  if (kpiSatisfactionPercent) {
    kpiSatisfactionPercent.textContent = percent.toFixed(1);
  }

  if (chartSatisfactionPercent) {
    chartSatisfactionPercent.textContent = percent.toFixed(1);
  }

  barChart.data.labels = charts?.bar?.labels || [];
  barChart.data.datasets[0].data = charts?.bar?.positive || [];
  barChart.data.datasets[1].data = charts?.bar?.negative || [];
  barChart.update();
}

async function loadSummary() {
  const qs = new URLSearchParams({
    username,
    role,
    form_titles: getFormsParam(),
    fiscal_years: getFiscalYearsParam(),
    dept: fDept.value,

    date_from: fDateFrom.value,
    date_to: fDateTo?.value || "",
  });
  const res = await fetch("/api/dashboard/summary?" + qs.toString());
  const json = await res.json();

  if (!res.ok) throw new Error(json?.error || "โหลด summary ไม่สำเร็จ");

  kpiRespondents.textContent = json.kpi?.respondents || 0;
  kpiAvg.textContent = Number(json.kpi?.avgSatisfaction || 0).toFixed(2);
  kpiComments.textContent = json.kpi?.totalComments || 0;

  sForm.textContent = selectedForms.length
    ? selectedForms.join(", ")
    : "ทั้งหมด";
  sYear.textContent = selectedYears.length
    ? selectedYears.join(", ")
    : "ทั้งหมด";
  if (overviewYear) {
    overviewYear.textContent = selectedYears.length
      ? selectedYears.join(", ")
      : "ทั้งหมด";
  }
  sDept.textContent = fDept.value || "ทั้งหมด";
  sDate.textContent =
    fDateFrom.value || fDateTo?.value
      ? `${fDateFrom.value || "-"} ถึง ${fDateTo?.value || "-"}`
      : "ทั้งหมด";

  if (lastUpdated) {
    lastUpdated.textContent = new Date().toLocaleString("th-TH");
  }

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

    [fDept, fDateFrom, fDateTo].filter(Boolean).forEach((el) => {
      el.addEventListener("change", refreshDashboard);
    });
    btnRefresh.addEventListener("click", refreshDashboard);
  } catch (err) {
    console.error(err);
    alert("โหลด Dashboard ไม่สำเร็จ: " + err.message);
  }
})();
