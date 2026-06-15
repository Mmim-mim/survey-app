const params = new URLSearchParams(window.location.search);
const formId = params.get("id");

let groupChartInstance = null;
let levelChartInstance = null;
let statusChartInstance = null;
let levelProfileChartInstance = null;
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

    document.getElementById("levelText").style.background = "#fff";
    document.getElementById("levelText").style.color = level.color;
    document.getElementById("levelBig").style.color = level.color;

    renderQuestionTable(data.question_scores || []);
renderWeakTable(data.question_scores || []);
renderSuggestions(data.suggestions || []);
renderGroupChart(data.group_scores || []);
renderLevelChart(data.level_counts || {});

renderSummaryList("statusSummary", data.respondent_summary?.status || {});
renderSummaryList(
  "educationSummary",
  data.respondent_summary?.education_level || {}
);
renderSummaryList("facultySummary", data.respondent_summary?.faculty || {});

  } catch (err) {
    console.error(err);
    alert(err.message || "เกิดข้อผิดพลาด");
  }
}

loadResult();