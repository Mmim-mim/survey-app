const params = new URLSearchParams(window.location.search);
const formId = params.get("id");

let groupChartInstance = null;
let levelChartInstance = null;
let statusChartInstance = null;
let educationChartInstance = null;
let facultyChartInstance = null;

function getEvaluationLevel(score) {
  const s = Number(score) || 0;

  if (s <= 1.5) {
    return {
      text: "ต้องปรับปรุงเร่งด่วน",
      color: "#dc2626",
    };
  }

  if (s <= 2.5) {
    return {
      text: "ต้องปรับปรุง",
      color: "#ea580c",
    };
  }

  if (s <= 3.5) {
    return {
      text: "พอใช้",
      color: "#ca8a04",
    };
  }

  if (s <= 4.5) {
    return {
      text: "ดี",
      color: "#16a34a",
    };
  }

  return {
    text: "ดีมาก",
    color: "#15803d",
  };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatThaiDateShort(value) {
  if (!value) return "-";

  const text = String(value).trim();

  let dateText = text;

  // รองรับรูปแบบ 2026-06-18T00:00:00.000Z
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    dateText = text.slice(0, 10);
  }

  // รองรับรูปแบบ 2026-06-18
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    const [yyyy, mm, dd] = dateText.split("-");
    const yy = String(Number(yyyy) + 543).slice(-2);
    return `${dd}.${mm}.${yy}`;
  }

  const d = new Date(value);
  if (isNaN(d)) return "-";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear() + 543).slice(-2);

  return `${dd}.${mm}.${yy}`;
}

function formatProjectPeriod(startDate, endDate) {
  const start = formatThaiDateShort(startDate);
  const end = formatThaiDateShort(endDate);

  if (start === "-" && end === "-") return "-";
  if (end === "-" || start === end) return start;

  return `${start} - ${end}`;
}

function renderProjectInfo(project = {}) {
  const panel = document.getElementById("projectInfoPanel");
  if (!panel) return;

  const hasData =
    project.start_date ||
    project.end_date ||
    project.goal_text ||
    project.kpi_quantity ||
    project.kpi_quality;

  if (!hasData) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "";

  setText(
    "projectPeriod",
    formatProjectPeriod(project.start_date, project.end_date),
  );

  setText("projectGoal", project.goal_text || "-");
  setText("projectKpiQuantity", project.kpi_quantity || "-");
  setText("projectKpiQuality", project.kpi_quality || "-");
}

function formatMoney(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "-";

  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function renderBudgetInfo(project = {}) {
  const panel = document.getElementById("budgetPanel");
  if (!panel) return;

  const received = Number(project.budget_received);
  const spent = Number(project.budget_spent);

  const hasReceived = Number.isFinite(received) && received > 0;
  const hasSpent = Number.isFinite(spent) && spent >= 0;

  if (!hasReceived && !hasSpent) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "";

  setText("budgetReceived", hasReceived ? formatMoney(received) : "-");
  const spentInput = document.getElementById("budgetSpentInput");

  if (spentInput) {
    spentInput.value = hasSpent ? spent : "";
  }

  const spentHint = document.getElementById("budgetSpentHint");
  const statusEl = document.getElementById("budgetStatus");

  if (!hasReceived || !hasSpent) {
    setText("budgetDiff", "-");
    setText("budgetPercent", "-");

    if (spentHint) {
      spentHint.textContent = "กรอกภายหลัง";
      spentHint.className = "budget-status neutral";
    }

    if (statusEl) {
      statusEl.textContent = "รอข้อมูล";
      statusEl.className = "budget-status neutral";
    }

    return;
  }

  if (spentHint) {
    spentHint.textContent = "บันทึกแล้ว";
    spentHint.className = "budget-status good";
  }

  const diff = spent - received;
  const absDiff = Math.abs(diff);
  const percent = received > 0 ? (absDiff / received) * 100 : 0;

  setText("budgetDiff", formatMoney(absDiff));
  setText("budgetPercent", `${percent.toFixed(2)}%`);

  if (diff > 0) {
    if (statusEl) {
      statusEl.textContent = "เกินงบ";
      statusEl.className = "budget-status bad";
    }
    document
      .getElementById("budgetDiff")
      ?.style.setProperty("color", "#b91c1c");
    document
      .getElementById("budgetPercent")
      ?.style.setProperty("color", "#b91c1c");
  } else if (diff < 0) {
    if (statusEl) {
      statusEl.textContent = "ต่ำกว่างบ";
      statusEl.className = "budget-status good";
    }
    document
      .getElementById("budgetDiff")
      ?.style.setProperty("color", "#166534");
    document
      .getElementById("budgetPercent")
      ?.style.setProperty("color", "#166534");
  } else {
    if (statusEl) {
      statusEl.textContent = "พอดีงบ";
      statusEl.className = "budget-status neutral";
    }
    document
      .getElementById("budgetDiff")
      ?.style.setProperty("color", "#92400e");
    document
      .getElementById("budgetPercent")
      ?.style.setProperty("color", "#92400e");
  }
}

function renderProjectMeta(meta = {}) {
  const panel = document.getElementById("projectMetaPanel");
  if (!panel) return;

  const hasData =
    meta.dept_name ||
    meta.uni_strategy ||
    meta.center_strategy ||
    meta.center_mission;

  if (!hasData) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "";

  setText("projectDept", meta.dept_name || "-");
  setText("projectUniStrategy", meta.uni_strategy || "-");
  setText("projectCenterStrategy", meta.center_strategy || "-");
  setText("projectCenterMission", meta.center_mission || "-");
}

function renderQuestionTable(rows = []) {
  const tbody = document.getElementById("questionTable");

  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">ยังไม่มีคะแนนรายข้อ</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((r) => {
      const level = getEvaluationLevel(r.average);

      return `
        <tr>
          <td>${r.group || "-"}</td>
          <td>${r.question || "-"}</td>
          <td>${Number(r.average || 0).toFixed(2)}</td>
          <td style="color:${level.color};font-weight:900">${level.text}</td>
        </tr>
      `;
    })
    .join("");
}

function renderWeakTable(rows = []) {
  const tbody = document.getElementById("weakTable");

  if (!tbody) return;

  const weak = [...rows]
    .sort((a, b) => Number(a.average || 0) - Number(b.average || 0))
    .slice(0, 5);

  if (!weak.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty">ยังไม่มีข้อมูล</td></tr>`;
    return;
  }

  tbody.innerHTML = weak
    .map((r) => {
      const level = getEvaluationLevel(r.average);

      return `
        <tr>
          <td>${r.question || "-"}</td>
          <td>${Number(r.average || 0).toFixed(2)}</td>
          <td style="color:${level.color};font-weight:900">${level.text}</td>
        </tr>
      `;
    })
    .join("");
}

function toggleRespondentBox() {
  const box = document.getElementById("respondentBox");
  const arrow = document.getElementById("respondentArrow");

  if (!box || !arrow) return;

  box.classList.toggle("show");

  arrow.textContent = box.classList.contains("show")
    ? "ซ่อน ▲"
    : "ดูเพิ่มเติม ▼";
}

function renderSummaryList(id, data = {}) {
  const box = document.getElementById(id);
  if (!box) return;

  const entries = Object.entries(data).filter(([label, count]) => {
    return label && Number(count) > 0;
  });

  if (!entries.length) {
    box.innerHTML = `<div class="empty">ไม่มีข้อมูล</div>`;
    return;
  }

  box.innerHTML = entries
    .map(([label, count]) => {
      return `
        <div class="summary-item">
          <span>${label}</span>
          <span>${count} คน</span>
        </div>
      `;
    })
    .join("");
}

function renderSuggestions(items = []) {
  const box = document.getElementById("suggestions");

  if (!box) return;

  if (!items.length) {
    box.innerHTML = `<div class="empty">ยังไม่มีข้อเสนอแนะ</div>`;
    return;
  }

  box.innerHTML = items
    .map((txt) => `<div class="comment">${txt}</div>`)
    .join("");
}

function renderGroupChart(groups = []) {
  const ctx = document.getElementById("groupChart");

  if (!ctx) return;

  if (groupChartInstance) groupChartInstance.destroy();

  groupChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: groups.map((g) => g.group),
      datasets: [
        {
          label: "คะแนนเฉลี่ย",
          data: groups.map((g) => Number(g.average || 0).toFixed(2)),
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          min: 0,
          max: 5,
        },
      },
    },
  });
}

function renderLevelChart(levelCounts = {}) {
  const ctx = document.getElementById("levelChart");

  if (!ctx) return;

  if (levelChartInstance) levelChartInstance.destroy();

  const labels = Object.keys(levelCounts);
  const values = Object.values(levelCounts);

  levelChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
        },
      ],
    },
    options: {
      responsive: true,
    },
  });
}

function renderCountChart(canvasId, chartRefName, summary = {}, type = "bar") {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = Object.keys(summary);
  const values = Object.values(summary);

  if (!labels.length) {
    return;
  }

  if (chartRefName === "status" && statusChartInstance) {
    statusChartInstance.destroy();
  }

  if (chartRefName === "levelProfile" && levelProfileChartInstance) {
    levelProfileChartInstance.destroy();
  }

  if (chartRefName === "faculty" && facultyChartInstance) {
    facultyChartInstance.destroy();
  }

  const chart = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [
        {
          label: "จำนวนผู้ตอบ",
          data: values,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      indexAxis: chartRefName === "faculty" ? "y" : "x",
      scales:
        type === "bar"
          ? {
              y: {
                beginAtZero: true,
                ticks: {
                  precision: 0,
                },
              },
              x: {
                ticks: {
                  autoSkip: false,
                },
              },
            }
          : {},
    },
  });

  if (chartRefName === "status") statusChartInstance = chart;
  if (chartRefName === "levelProfile") levelProfileChartInstance = chart;
  if (chartRefName === "faculty") facultyChartInstance = chart;
}

function renderRespondentChart(canvasId, summary = {}, type = "bar") {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = Object.keys(summary || {});
  const values = Object.values(summary || {});

  if (!labels.length) return;

  let oldChart = null;

  if (canvasId === "statusChart") oldChart = statusChartInstance;
  if (canvasId === "levelProfileChart") oldChart = educationChartInstance;
  if (canvasId === "facultyChart") oldChart = facultyChartInstance;

  if (oldChart) oldChart.destroy();

  const chart = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [
        {
          label: "จำนวนผู้ตอบ",
          data: values,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      indexAxis: canvasId === "facultyChart" ? "y" : "x",
      scales:
        type === "bar"
          ? {
              y: {
                beginAtZero: true,
                ticks: { precision: 0 },
              },
            }
          : {},
    },
  });

  if (canvasId === "statusChart") statusChartInstance = chart;
  if (canvasId === "levelProfileChart") educationChartInstance = chart;
  if (canvasId === "facultyChart") facultyChartInstance = chart;
}

async function loadResult() {
  if (!formId) {
    alert("ไม่พบรหัสฟอร์ม");
    window.location.href = "index.html";
    return;
  }

  try {
    const res = await fetch(`/api/forms/${encodeURIComponent(formId)}/results`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "โหลดผลการดำเนินงานไม่สำเร็จ");
    }

    const level = getEvaluationLevel(data.average_score);

    setText("formTitle", data.form_title || "-");
    setText("avgScore", Number(data.average_score || 0).toFixed(2));
    setText("scoreBig", Number(data.average_score || 0).toFixed(2));
    setText("levelText", level.text);
    setText("levelBig", `⭐⭐⭐⭐⭐ ${level.text}`);
    setText("totalResponses", data.total_responses || 0);
    setText("totalQuestions", data.total_questions || 0);

    renderProjectInfo(data.project_info || {});
    renderBudgetInfo(data.project_info || {});
    renderProjectMeta(data.project_meta || {});

    document.getElementById("levelText").style.background = "#fff";
    document.getElementById("levelText").style.color = level.color;
    document.getElementById("levelBig").style.color = level.color;

    renderQuestionTable(data.question_scores || []);
    renderWeakTable(data.question_scores || []);
    renderSuggestions(data.suggestions || []);
    renderGroupChart(data.group_scores || []);
    renderLevelChart(data.level_counts || {});

    renderRespondentChart(
      "statusChart",
      data.respondent_summary?.status || {},
      "doughnut",
    );

    renderRespondentChart(
      "levelProfileChart",
      data.respondent_summary?.education_level || {},
      "bar",
    );

    renderRespondentChart(
      "facultyChart",
      data.respondent_summary?.faculty || {},
      "bar",
    );

    renderSummaryList("statusSummary", data.respondent_summary?.status || {});
    renderSummaryList(
      "educationSummary",
      data.respondent_summary?.education_level || {},
    );
    renderSummaryList("facultySummary", data.respondent_summary?.faculty || {});
  } catch (err) {
    console.error(err);
    alert(err.message || "เกิดข้อผิดพลาด");
  }
}

async function downloadPDF() {
  const btn = document.querySelector(".pdf-btn");
  const container = document.querySelector(".container");

  if (!container) {
    alert("ไม่พบเนื้อหาสำหรับสร้าง PDF");
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "กำลังสร้าง PDF...";
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#fff8f2",
    });

    const imgData = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;

    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);

    heightLeft -= pageHeight - margin * 2;

    while (heightLeft > 0) {
      pdf.addPage();
      position = heightLeft - imgHeight + margin;
      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
    }

    const title =
      document.getElementById("formTitle")?.textContent?.trim() ||
      "result-report";

    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "").slice(0, 80);

    pdf.save(`รายงานผลการประเมิน-${safeTitle}.pdf`);
  } catch (err) {
    console.error(err);
    alert("สร้าง PDF ไม่สำเร็จ: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "📄 ดาวน์โหลด PDF";
    }
  }
}

async function saveBudgetSpent() {
  const input = document.getElementById("budgetSpentInput");
  const value = Number(input?.value);

  if (!Number.isFinite(value) || value < 0) {
    alert("กรุณากรอกงบประมาณที่ใช้จริงให้ถูกต้อง");
    return;
  }

  try {
    const res = await fetch(`/api/forms/${formId}/budget`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        budget_spent: value,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "บันทึกงบประมาณไม่สำเร็จ");
    }

    alert("บันทึกงบประมาณเรียบร้อย");
    loadResult();
  } catch (err) {
    console.error(err);
    alert(err.message || "เกิดข้อผิดพลาด");
  }
}

document.addEventListener("click", (e) => {
  if (e.target.id === "saveBudgetBtn") {
    saveBudgetSpent();
  }
});

loadResult();
