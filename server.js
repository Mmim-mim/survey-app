require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// เสิร์ฟไฟล์ HTML ของคุณจากโฟลเดอร์ public
app.use(express.static(path.join(__dirname, "public")));

// ตั้งค่าเชื่อม MySQL (XAMPP ปกติ root / รหัสว่าง)

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT || 25248,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "survey_app",
  waitForConnections: true,
  connectionLimit: 10,
  ssl: {
    rejectUnauthorized: false,
  },
});

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function parseSubmissionPayload(payloadJson) {
  const p = safeJsonParse(payloadJson) || {};

  const profile = p.profile || {};
  const ratings = Array.isArray(p.ratings) ? p.ratings : [];

  const comments = [];

  if (Array.isArray(p.comments)) {
    comments.push(...p.comments);
  }

  if (Array.isArray(p.suggestions)) {
    comments.push(...p.suggestions);
  }

  if (
    typeof p.dissatisfaction_text === "string" &&
    p.dissatisfaction_text.trim()
  ) {
    comments.push({
      text: p.dissatisfaction_text.trim(),
      type: "dissatisfaction",
      label: "ความไม่พึงพอใจ",
    });
  }

  if (typeof p.suggestion === "string" && p.suggestion.trim()) {
    comments.push({
      text: p.suggestion.trim(),
      type: "suggestion",
      label: "ข้อเสนอแนะ",
    });
  }

  return {
    fiscal_year: Number(p.fiscal_year) || null,
    dept: String(profile.dept || "").trim(),
    fullname: String(profile.fullname || "").trim(),
    ratings,
    comments,
    raw: p,
  };
}
function avg(arr) {
  const nums = arr.map(Number).filter(Number.isFinite);
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function stddev(arr) {
  const nums = arr.map(Number).filter(Number.isFinite);
  if (nums.length <= 1) return 0;
  const m = avg(nums);
  const variance =
    nums.reduce((s, n) => s + Math.pow(n - m, 2), 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

function mean(arr) {
  const xs = arr.filter((x) => Number.isFinite(x));
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(arr) {
  const xs = arr.filter((x) => Number.isFinite(x));
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** -----------------------------
 *  0) LOGIN (อ่าน user/password จากตาราง users)
 *  POST /api/login
 *  ⚠️ เก็บรหัสแบบแสดงได้ (plain text)
 *  ตาราง users ต้องมีคอลัมน์: username, password, display_name
 * ----------------------------- */
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: "username and password are required",
      });
    }

    const [rows] = await pool.execute(
      `SELECT id, username, password, display_name, role, dept_name
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [String(username).trim()],
    );

    if (!rows.length) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    const user = rows[0];

    if (String(user.password) !== String(password)) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name || user.username,
        role: user.role || "staff",
        dept_name: user.dept_name || "",
      },
    });
  } catch (e) {
    return res.status(500).json({
      error: e.message,
    });
  }
});

/** -----------------------------
 *  1) บันทึก submission
 * ----------------------------- */
app.post("/api/submissions", async (req, res) => {
  try {
    const { form_id, created_by, form_title, payload } = req.body;

    if (!form_id) {
      return res.status(400).json({ error: "form_id is required" });
    }

    if (!payload) {
      return res.status(400).json({ error: "payload is required" });
    }

    const payload_json = JSON.stringify(payload);

    const [result] = await pool.execute(
      `INSERT INTO submissions
        (form_id, created_by, form_title, payload_json)
       VALUES (?, ?, ?, ?)`,
      [form_id, created_by || null, form_title || null, payload_json],
    );

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** -----------------------------
 *  2) ดึงรายการ submissions (ล่าสุดก่อน)
 * ----------------------------- */
app.get("/api/submissions", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, created_at, created_by, form_title FROM submissions ORDER BY id DESC LIMIT 200",
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** -----------------------------
 *  3) Dashboard: options สำหรับ filter
 *  GET /api/dashboard/options
 * ----------------------------- */
app.get("/api/dashboard/options", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    const role = String(req.query.role || "staff").trim();

    let sql = `
      SELECT
        s.id,
        s.form_id,
        s.created_at,
        s.created_by,
        s.form_title,
        s.payload_json
      FROM submissions s
      WHERE 1 = 1
    `;

    const params = [];

    if (role === "staff") {
      const [forms] = await pool.execute(
        `SELECT id
     FROM survey_forms
     WHERE created_by_username = ?`,
        [username],
      );

      const formIds = forms
        .map((form) => Number(form.id))
        .filter(Number.isFinite);

      if (formIds.length > 0) {
        sql += `
      AND s.form_id IN (
        ${formIds.map(() => "?").join(",")}
      )
    `;

        params.push(...formIds);
      } else {
        sql += ` AND 1 = 0 `;
      }
    } else if (role === "manager") {
      const [userRows] = await pool.execute(
        `SELECT dept_name
     FROM users
     WHERE username = ?
     LIMIT 1`,
        [username],
      );

      const managerDept = String(userRows[0]?.dept_name || "").trim();

      if (!managerDept) {
        sql += ` AND 1 = 0 `;
      } else {
        const [forms] = await pool.execute(
          `SELECT id
       FROM survey_forms
       WHERE dept_name = ?`,
          [managerDept],
        );

        const formIds = forms
          .map((form) => Number(form.id))
          .filter(Number.isFinite);

        if (formIds.length > 0) {
          sql += `
        AND s.form_id IN (
          ${formIds.map(() => "?").join(",")}
        )
      `;

          params.push(...formIds);
        } else {
          sql += ` AND 1 = 0 `;
        }
      }
    } else if (role === "admin" || role === "public") {
      // เห็นข้อมูลภาพรวมทั้งหมด
    } else {
      sql += ` AND 1 = 0 `;
    }
    sql += ` ORDER BY s.created_at DESC LIMIT 5000`;

    const [rows] = await pool.execute(sql, params);

    const forms = new Map();
    const years = new Set();
    const depts = new Set();

    for (const row of rows) {
      const formId = Number(row.form_id);
      const formTitle = String(row.form_title || "").trim();

      if (Number.isFinite(formId) && formTitle) {
        forms.set(formId, {
          id: formId,
          title: formTitle,
        });
      }

      const parsed = parseSubmissionPayload(row.payload_json);

      if (parsed.fiscal_year) years.add(parsed.fiscal_year);
      if (parsed.dept) depts.add(parsed.dept);
    }

    const [formYearRows] = await pool.execute(`
  SELECT DISTINCT fiscal_year
  FROM survey_forms
  WHERE fiscal_year IS NOT NULL
    AND fiscal_year <> ''
`);

    for (const row of formYearRows) {
      years.add(Number(row.fiscal_year));
    }

    res.json({
      forms: Array.from(forms.values()).sort((a, b) =>
        a.title.localeCompare(b.title, "th"),
      ),
      fiscalYears: Array.from(years).sort((a, b) => b - a),
      depts: Array.from(depts).sort((a, b) => a.localeCompare(b, "th")),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function normalizeQuestionText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function splitLegacyQuestionPath(value) {
  const parts = String(value || "")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    model_title: parts[0] || "",
    group_title: parts.slice(1).join(" > ") || "",
  };
}

function getRatingQuestionText(rating) {
  return String(
    rating?.questionText ||
      rating?.question_text ||
      rating?.question ||
      rating?.label ||
      rating?.title ||
      "",
  ).trim();
}

function getRatingValue(rating) {
  const value = Number(
    rating?.value ?? rating?.score ?? rating?.rating ?? rating?.answer_score,
  );

  return Number.isFinite(value) ? value : null;
}

function formatDashboardGroupTitle(groupTitle) {
  const raw = String(groupTitle || "").trim();
  const key = raw.toLowerCase();

  const titleMap = {
    "affect of service": "ความรู้สึกที่มีต่อบริการ (Affect of Service)",

    "information control": "การควบคุมสารสนเทศ (Information Control)",

    "library as place": "ลักษณะกายภาพของห้องสมุด (Library as Place)",

    tangibles: "ลักษณะทางกายภาพ (Tangibles)",

    reliability: "ความน่าเชื่อถือ (Reliability)",

    responsiveness: "การตอบสนองของพนักงาน (Responsiveness)",

    assurance: "ความไว้วางใจ (Assurance)",

    empathy: "การเอาใจใส่ (Empathy)",

    usability: "การใช้งาน (Usability)",

    "information quality": "คุณภาพของข้อมูล (Information Quality)",

    "service interaction": "ปฏิสัมพันธ์ด้านบริการ (Service Interaction)",

    "ease of use": "การใช้งานง่าย (Ease of Use)",

    "aesthetic design": "การออกแบบที่สวยงาม (Aesthetic Design)",

    "processing speed": "ความเร็วในการประมวลผล (Processing Speed)",

    efficiency: "ประสิทธิภาพ (Efficiency)",

    "system availability": "ความพร้อมของระบบ (System Availability)",

    fulfillment: "การปฏิบัติตามสัญญา (Fulfillment)",

    privacy: "ความเป็นส่วนตัว (Privacy)",
  };

  return titleMap[key] || raw || "หัวข้อทั่วไป";
}
app.get("/api/dashboard/summary", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    const role = String(req.query.role || "staff").trim();

    const selectedFormIds = String(
      req.query.form_ids || req.query.form_id || "",
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);
    const selectedFiscalYears = String(
      req.query.fiscal_years || req.query.fiscal_year || "",
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);
    const dateFrom = String(req.query.date_from || "").trim();

    const dateTo = String(req.query.date_to || "").trim();

    const deptFilter = String(req.query.dept || "").trim();

    /*
     * โหลด Submission ตามสิทธิ์และตัวกรอง
     */
    let submissionSql = `
  SELECT
    form_id,
    id,
    created_at,
    created_by,
    form_title,
    payload_json
  FROM submissions
  WHERE 1 = 1
`;
    const submissionParams = [];
    /*
     * จำกัดข้อมูล Dashboard ตามสิทธิ์ผู้ใช้
     */
    if (role === "staff") {
      const [forms] = await pool.execute(
        `SELECT id
     FROM survey_forms
     WHERE created_by_username = ?`,
        [username],
      );

      const formIds = forms
        .map((form) => Number(form.id))
        .filter(Number.isFinite);

      if (formIds.length > 0) {
        submissionSql += `
      AND form_id IN (
        ${formIds.map(() => "?").join(",")}
      )
    `;

        submissionParams.push(...formIds);
      } else {
        submissionSql += ` AND 1 = 0 `;
      }
    } else if (role === "manager") {
      const [userRows] = await pool.execute(
        `SELECT dept_name
     FROM users
     WHERE username = ?
     LIMIT 1`,
        [username],
      );

      const managerDept = String(userRows[0]?.dept_name || "").trim();

      if (!managerDept) {
        submissionSql += ` AND 1 = 0 `;
      } else {
        const [forms] = await pool.execute(
          `SELECT id
       FROM survey_forms
       WHERE dept_name = ?`,
          [managerDept],
        );

        const formIds = forms
          .map((form) => Number(form.id))
          .filter(Number.isFinite);

        if (formIds.length > 0) {
          submissionSql += `
        AND form_id IN (
          ${formIds.map(() => "?").join(",")}
        )
      `;

          submissionParams.push(...formIds);
        } else {
          submissionSql += ` AND 1 = 0 `;
        }
      }
    } else if (role === "admin" || role === "public") {
      // เห็นข้อมูลภาพรวมทั้งหมด
    } else {
      submissionSql += ` AND 1 = 0 `;
    }

    if (selectedFormIds.length > 0) {
      submissionSql += `
    AND form_id IN (
      ${selectedFormIds.map(() => "?").join(",")}
    )
  `;

      submissionParams.push(...selectedFormIds);
    }

    if (dateFrom) {
      submissionSql += ` AND DATE(created_at) >= ? `;
      submissionParams.push(dateFrom);
    }

    if (dateTo) {
      submissionSql += ` AND DATE(created_at) <= ? `;
      submissionParams.push(dateTo);
    }

    submissionSql += `
      ORDER BY created_at DESC
      LIMIT 5000
    `;

    const [submissionRows] = await pool.execute(
      submissionSql,
      submissionParams,
    );

    /*
     * แปลง Payload และกรองปี/หน่วยงาน
     */
    const filteredSubmissions = [];

    for (const row of submissionRows) {
      const parsed = parseSubmissionPayload(row.payload_json);

      if (
        selectedFiscalYears.length > 0 &&
        !selectedFiscalYears.includes(Number(parsed.fiscal_year))
      ) {
        continue;
      }

      if (deptFilter && String(parsed.dept || "").trim() !== deptFilter) {
        continue;
      }

      filteredSubmissions.push({
        id: row.id,
        form_id: row.form_id,
        created_at: row.created_at,
        created_by: row.created_by,
        form_title: row.form_title,
        ...parsed,
      });
    }

    /*
     * สร้าง Lookup:
     * ข้อความคำถาม → Model → Group
     */
    const [questionRows] = await pool.execute(`
      SELECT
        q.question_text,
        q.category,
        q.used_in_label,

        g.title AS group_title,
        c.title AS category_title

      FROM question_bank q

      LEFT JOIN survey_question_groups g
        ON q.group_id = g.id

      LEFT JOIN survey_question_categories c
        ON g.category_id = c.id

      WHERE q.status = 'active'
    `);

    const questionStructureMap = new Map();

    for (const row of questionRows) {
      const questionKey = normalizeQuestionText(row.question_text);

      if (!questionKey) continue;

      let modelTitle = String(row.category_title || "").trim();

      let groupTitle = String(row.group_title || "").trim();

      /*
       * รองรับข้อมูลเก่า:
       * LibQUAL+TM > Affect of Service
       */
      if (!modelTitle || !groupTitle) {
        const legacyPath =
          String(row.used_in_label || "").trim() ||
          String(row.category || "").trim();

        const parsedPath = splitLegacyQuestionPath(legacyPath);

        if (!modelTitle) {
          modelTitle = parsedPath.model_title;
        }

        if (!groupTitle) {
          groupTitle = parsedPath.group_title;
        }
      }

      if (!modelTitle) {
        modelTitle = "แบบประเมินทั่วไป";
      }

      groupTitle = formatDashboardGroupTitle(groupTitle);

      if (!questionStructureMap.has(questionKey)) {
        questionStructureMap.set(questionKey, {
          model_title: modelTitle,
          group_title: groupTitle,
        });
      }
    }

    function resolveRatingStructure(rating) {
      const questionText = getRatingQuestionText(rating);
      const questionKey = normalizeQuestionText(questionText);

      const matched = questionStructureMap.get(questionKey);

      let modelTitle = String(
        rating?.modelTitle ||
          rating?.model_title ||
          rating?.model ||
          rating?.categoryTitle ||
          rating?.category_title ||
          "",
      ).trim();

      let groupTitle = String(
        rating?.groupTitle ||
          rating?.group_title ||
          rating?.group ||
          rating?.dimensionTitle ||
          rating?.dimension_title ||
          "",
      ).trim();

      if (rating?.category && String(rating.category).includes(">")) {
        const parsed = splitLegacyQuestionPath(rating.category);

        if (!modelTitle) modelTitle = parsed.model_title;
        if (!groupTitle) groupTitle = parsed.group_title;
      }

      if (!modelTitle && matched) {
        modelTitle = matched.model_title;
      }

      if (!groupTitle && matched) {
        groupTitle = matched.group_title;
      }

      modelTitle = String(modelTitle || "").trim();

      if (modelTitle === "แบบประเมินทั่วไป" && matched && matched.model_title) {
        modelTitle = matched.model_title;
      }

      if (!modelTitle) {
        modelTitle = "แบบประเมินทั่วไป";
      }

      return {
        questionText,
        modelTitle,
        groupTitle: formatDashboardGroupTitle(groupTitle),
      };
    }

    const respondentCount = filteredSubmissions.length;

    const allRatingValues = [];
    const itemMap = new Map();
    const barMap = new Map();
    const comments = [];

    let satisfiedCount = 0;
    let unsatisfiedCount = 0;

    /*
     * อ่านคะแนนทั้งหมด
     */
    for (const submission of filteredSubmissions) {
      for (const rating of submission.ratings) {
        const structure = resolveRatingStructure(rating);

        const questionText = structure.questionText;

        const modelTitle = structure.modelTitle;

        const groupTitle = structure.groupTitle;

        const value = getRatingValue(rating);

        if (!questionText || value === null || value <= 0) {
          continue;
        }

        allRatingValues.push(value);

        /*
         * ใช้ Model + Group + Question เป็น Key
         */
        const itemKey = [modelTitle, groupTitle, questionText].join("__");

        if (!itemMap.has(itemKey)) {
          itemMap.set(itemKey, {
            model_title: modelTitle,
            group_title: groupTitle,
            question: questionText,
            values: [],
          });
        }

        itemMap.get(itemKey).values.push(value);

        if (!barMap.has(itemKey)) {
          barMap.set(itemKey, {
            model_title: modelTitle,
            group_title: groupTitle,
            question: questionText,
            positive: 0,
            negative: 0,
          });
        }

        if (value >= 4) {
          satisfiedCount += 1;
          barMap.get(itemKey).positive += 1;
        } else {
          unsatisfiedCount += 1;
          barMap.get(itemKey).negative += 1;
        }
      }

      /*
       * อ่านความคิดเห็น
       */
      for (const comment of submission.comments) {
        const text =
          typeof comment === "string"
            ? comment.trim()
            : String(
                comment?.comment || comment?.text || comment?.message || "",
              ).trim();

        if (!text) continue;

        comments.push({
          text,
          created_at: submission.created_at,
          created_by: submission.created_by,
          form_title: submission.form_title,
        });
      }
    }

    /*
     * สร้างตารางคำถามรายข้อ
     * Frontend จะนำไปสรุปเป็น:
     * Model → Group
     */
    const tableItems = Array.from(itemMap.values()).map((item, index) => ({
      no: index + 1,
      model_title: item.model_title,
      group_title: item.group_title,
      question: item.question,
      avg: Number(avg(item.values).toFixed(2)),
      sd: Number(stddev(item.values).toFixed(2)),
      count: item.values.length,
    }));

    const overallAverage = Number(avg(allRatingValues).toFixed(2));

    /*
     * สร้างกราฟรายคำถาม
     */
    const barLabels = [];
    const barPositive = [];
    const barNegative = [];

    for (const item of barMap.values()) {
      barLabels.push(item.question);
      barPositive.push(item.positive);
      barNegative.push(item.negative);
    }

    comments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.json({
      kpi: {
        respondents: respondentCount,
        avgSatisfaction: overallAverage,
        totalComments: comments.length,
      },

      filters: {
        form_ids: selectedFormIds,
        date_from: dateFrom,
        date_to: dateTo,
        fiscal_years: selectedFiscalYears,
        dept: deptFilter,
      },

      table: tableItems,

      charts: {
        pie: {
          labels: ["พึงพอใจ", "ควรปรับปรุง"],
          values: [satisfiedCount, unsatisfiedCount],
        },

        bar: {
          labels: barLabels,
          positive: barPositive,
          negative: barNegative,
        },
      },

      comments: comments.slice(0, 50),
    });
  } catch (error) {
    console.error("GET /api/dashboard/summary error:", error);

    return res.status(500).json({
      error: error.message || "โหลดข้อมูล Dashboard ไม่สำเร็จ",
    });
  }
});
/** -----------------------------
 *  4) Dashboard: summary ตาม filter
 *  GET /api/dashboard/summary?year=2569&status=...&dept=...&major=...
 * ----------------------------- */

const PORT = process.env.PORT || 3000;

/** -----------------------------
 *  FORMS (ตาราง survey_forms)
 *  1) POST /api/forms     -> บันทึกฟอร์ม
 *  2) GET  /api/forms     -> รายการฟอร์ม (ล่าสุดก่อน)
 *  3) GET  /api/forms/:id -> ดึงฟอร์มตาม id
 * ----------------------------- */

// 1) บันทึกฟอร์ม
app.post("/api/forms", async (req, res) => {
  try {
    const {
      created_by,
      created_by_username,
      form_title,
      dept_name,
      uni_strategy,
      center_strategy,
      center_mission,
      goal_text,
      kpi_quantity,
      kpi_quality,
      start_date,
      end_date,
      fiscal_year,
      budget_received,
      attachment_url,
      form,
    } = req.body || {};

    if (!form) {
      return res.status(400).json({ error: "form is required" });
    }

    const form_json = JSON.stringify(form);

    const [result] = await pool.execute(
      `INSERT INTO survey_forms
(created_by, created_by_username, form_title, dept_name, uni_strategy, center_strategy, center_mission, goal_text, 
kpi_quantity, kpi_quality, start_date, end_date, fiscal_year, budget_received, attachment_url, form_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        created_by || null,
        created_by_username || null,
        form_title || null,
        dept_name || null,
        uni_strategy || null,
        center_strategy || null,
        center_mission || null,
        goal_text || null,
        kpi_quantity || null,
        kpi_quality || null,
        start_date || null,
        end_date || null,
        fiscal_year || null,
        budget_received || null,

        attachment_url || null,
        form_json,
      ],
    );

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2) รายการฟอร์ม (ล่าสุดก่อน)
app.get("/api/forms", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    const role = String(req.query.role || "staff").trim();
    const dept_name = String(req.query.dept_name || "").trim();

    let sql = `
  SELECT 
    f.id,
    f.created_at,
    f.created_by,
    f.created_by_username,
    f.form_title,
    f.dept_name,
    f.uni_strategy,
    f.center_strategy,
    f.center_mission,
    f.goal_text,
    f.kpi_quantity,
    f.kpi_quality,
    f.start_date,
    f.end_date,
    f.fiscal_year
  FROM survey_forms f
  LEFT JOIN users u
    ON f.created_by_username = u.username
  WHERE 1=1
`;

    const params = [];
    const fiscal_year = String(req.query.fiscal_year || "").trim();

    if (role === "staff") {
      sql += ` AND f.created_by_username = ? `;
      params.push(username);
    }

    if (role === "manager") {
      sql += ` AND u.dept_name = ? `;
      params.push(dept_name);
    }

    if (fiscal_year) {
      sql += ` AND f.fiscal_year = ? `;
      params.push(fiscal_year);
    }

    sql += ` ORDER BY f.id DESC LIMIT 500`;

    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3) ดึงฟอร์มตาม id
app.get("/api/forms/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }

    const [rows] = await pool.execute(
      `SELECT id, created_at, created_by, created_by_username, form_title,
              dept_name, uni_strategy, center_strategy, center_mission,
              goal_text, kpi_quantity, kpi_quality,
              start_date, end_date, fiscal_year, budget_received, budget_spent, attachment_url, form_json
       FROM survey_forms
       WHERE id = ?
       LIMIT 1`,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({ error: "not found" });
    }

    const r = rows[0];
    let form = null;

    try {
      form = JSON.parse(r.form_json);
    } catch {
      form = null;
    }

    res.json({
      id: r.id,
      created_at: r.created_at,
      created_by: r.created_by,
      attachment_url: r.attachment_url,
      created_by_username: r.created_by_username,
      form_title: r.form_title,
      dept_name: r.dept_name,
      uni_strategy: r.uni_strategy,
      center_strategy: r.center_strategy,
      center_mission: r.center_mission,
      goal_text: r.goal_text,
      kpi_quantity: r.kpi_quantity,
      kpi_quality: r.kpi_quality,
      start_date: r.start_date,
      end_date: r.end_date,
      budget_received: r.budget_received,
      budget_spent: r.budget_spent,
      form,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const ALLOW_MANAGER_EDIT = false;

app.put("/api/forms/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }

    const {
      username,
      role,
      form_title,
      dept_name,
      uni_strategy,
      center_strategy,
      center_mission,
      goal_text,
      kpi_quantity,
      kpi_quality,
      start_date,
      end_date,
      fiscal_year,
      budget_received,
      attachment_url,

      form,
    } = req.body || {};

    if (!form) {
      return res.status(400).json({ error: "form is required" });
    }

    const reqUsername = String(username || "").trim();
    const reqRole = String(role || "staff").trim();

    if (!reqUsername) {
      return res.status(400).json({ error: "username is required" });
    }

    const [foundRows] = await pool.execute(
      `SELECT id, created_by_username
       FROM survey_forms
       WHERE id = ?
       LIMIT 1`,
      [id],
    );

    if (!foundRows.length) {
      return res.status(404).json({ error: "form not found" });
    }

    const existing = foundRows[0];
    const ownerUsername = String(existing.created_by_username || "").trim();

    const isOwner = ownerUsername === reqUsername;

    if (!isOwner) {
      return res.status(403).json({
        error: "สามารถแก้ไขได้เฉพาะฟอร์มที่ตัวเองสร้างเท่านั้น",
      });
    }
    const form_json = JSON.stringify(form);

    await pool.execute(
      `UPDATE survey_forms
       SET form_title = ?,
           dept_name = ?,
           uni_strategy = ?,
           center_strategy = ?,
           center_mission = ?,
           goal_text = ?,
           kpi_quantity = ?,
           kpi_quality = ?,
           start_date = ?,
           end_date = ?,
                      fiscal_year = ?,
           budget_received = ?,
           attachment_url = ?,
           form_json = ?
       WHERE id = ?`,
      [
        form_title || null,
        dept_name || null,
        uni_strategy || null,
        center_strategy || null,
        center_mission || null,
        goal_text || null,
        kpi_quantity || null,
        kpi_quality || null,
        start_date || null,
        end_date || null,
        fiscal_year || null,
        budget_received || null,
        attachment_url || null,
        form_json,
        id,
      ],
    );

    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4) ลบฟอร์ม
// staff / manager ลบได้เฉพาะฟอร์มตัวเอง
// admin ลบได้ทุกฟอร์ม
app.delete("/api/forms/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const username = String(req.query.username || "").trim();
    const role = String(req.query.role || "staff").trim();

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    if (!username && role !== "admin") {
      return res.status(400).json({ error: "username is required" });
    }

    const [rows] = await pool.execute(
      `SELECT id, created_by_username
       FROM survey_forms
       WHERE id = ?
       LIMIT 1`,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({ error: "ไม่พบฟอร์ม" });
    }

    const form = rows[0];
    const ownerUsername = String(form.created_by_username || "").trim();

    if (role !== "admin" && ownerUsername !== username) {
      return res.status(403).json({
        error: "คุณไม่มีสิทธิ์ลบฟอร์มนี้",
      });
    }

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      await conn.execute(`DELETE FROM submissions WHERE form_id = ?`, [id]);

      await conn.execute(`DELETE FROM survey_forms WHERE id = ?`, [id]);

      await conn.commit();

      res.json({ ok: true });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** -----------------------------
 *  STRATEGY DASHBOARD
 * ----------------------------- */

// 1) OPTIONS
app.get("/api/strategy-dashboard/options", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    const role = String(req.query.role || "staff").trim();

    let formSql = `
      SELECT
        id,
        uni_strategy,
        center_strategy
      FROM survey_forms
      WHERE 1 = 1
    `;

    const formParams = [];

    if (role === "staff") {
      formSql += ` AND created_by_username = ? `;
      formParams.push(username);
    } else if (role === "manager") {
      const [userRows] = await pool.execute(
        `SELECT dept_name
         FROM users
         WHERE username = ?
         LIMIT 1`,
        [username],
      );

      const managerDept = String(userRows[0]?.dept_name || "").trim();

      if (!managerDept) {
        formSql += ` AND 1 = 0 `;
      } else {
        formSql += ` AND dept_name = ? `;
        formParams.push(managerDept);
      }
    } else if (role === "admin" || role === "public") {
      // เห็นข้อมูลภาพรวมทั้งหมด
    } else {
      formSql += ` AND 1 = 0 `;
    }

    const [rows] = await pool.execute(formSql, formParams);

    const formIds = rows.map((row) => Number(row.id)).filter(Number.isFinite);

    const uniSet = new Set();
    const centerSet = new Set();

    for (const row of rows) {
      if (row.uni_strategy) {
        uniSet.add(String(row.uni_strategy).trim());
      }

      if (row.center_strategy) {
        centerSet.add(String(row.center_strategy).trim());
      }
    }

    let submissionSql = `
      SELECT
        form_id,
        payload_json,
        created_at
      FROM submissions
      WHERE 1 = 1
    `;

    const submissionParams = [];

    if (formIds.length > 0) {
      submissionSql += `
        AND form_id IN (
          ${formIds.map(() => "?").join(",")}
        )
      `;

      submissionParams.push(...formIds);
    } else {
      submissionSql += ` AND 1 = 0 `;
    }

    submissionSql += ` ORDER BY created_at DESC `;

    const [submissionRows] = await pool.execute(
      submissionSql,
      submissionParams,
    );

    const yearSet = new Set();

    for (const submission of submissionRows) {
      const payload = safeJsonParse(submission.payload_json) || {};

      let year = Number(payload.fiscal_year);

      if (!Number.isFinite(year) || !year) {
        const date = new Date(submission.created_at);

        if (!isNaN(date)) {
          year = date.getFullYear() + 543;
        }
      }

      if (year) {
        yearSet.add(year);
      }
    }

    res.json({
      uniStrategies: Array.from(uniSet),
      centerStrategies: Array.from(centerSet),
      fiscalYears: Array.from(yearSet).sort((a, b) => b - a),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2) SUMMARY
app.get("/api/strategy-dashboard/summary", async (req, res) => {
  try {
    const {
      username,
      role,
      uni_strategies,
      center_strategies,
      fiscal_years,
      date_from,
      date_to,
    } = req.query;

    const toList = (value) =>
      String(value || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

    const normalizeText = (value) =>
      String(value || "")
        .trim()
        .replace(/\s+/g, " ");

    const getFiscalYear = (payloadJson, createdAt) => {
      const p = safeJsonParse(payloadJson) || {};

      let rawYear = p.fiscal_year;

      // รองรับกรณีเป็นข้อความ เช่น "2569" หรือ "ปีงบประมาณ 2569"
      let year = Number(String(rawYear || "").match(/\d{4}/)?.[0]);

      // ถ้าไม่มีปีใน payload ให้ใช้ created_at
      if (!Number.isFinite(year) || !year) {
        const d = new Date(createdAt);
        if (!isNaN(d)) year = d.getFullYear();
      }

      // ถ้าเป็น ค.ศ. เช่น 2026 ให้แปลงเป็น พ.ศ. 2569
      if (Number.isFinite(year) && year < 2400) {
        year += 543;
      }

      return Number.isFinite(year) ? year : null;
    };

    const uniList = toList(uni_strategies).map(normalizeText);
    const centerList = toList(center_strategies).map(normalizeText);

    const yearList = toList(fiscal_years)
      .map((x) => {
        let y = Number(String(x).match(/\d{4}/)?.[0]);
        if (Number.isFinite(y) && y < 2400) y += 543;
        return y;
      })
      .filter(Number.isFinite);

    let sql = `
      SELECT 
        s.id,
        s.created_at,
        s.created_by,
        s.form_title,
        s.payload_json,
        f.id AS form_id,
        f.created_by_username,
        f.uni_strategy,
        f.center_strategy
      FROM submissions s
LEFT JOIN survey_forms f
  ON s.form_id = f.id
WHERE 1=1
    `;

    const params = [];

    // จำกัดข้อมูล Strategy Dashboard ตามสิทธิ์ผู้ใช้
    if (role === "staff") {
      sql += ` AND f.created_by_username = ? `;
      params.push(username);
    } else if (role === "manager") {
      const [userRows] = await pool.execute(
        `SELECT dept_name
     FROM users
     WHERE username = ?
     LIMIT 1`,
        [username],
      );

      const managerDept = String(userRows[0]?.dept_name || "").trim();

      if (!managerDept) {
        sql += ` AND 1 = 0 `;
      } else {
        sql += ` AND f.dept_name = ? `;
        params.push(managerDept);
      }
    } else if (role === "admin" || role === "public") {
      // เห็นข้อมูลภาพรวมทั้งหมด
    } else {
      sql += ` AND 1 = 0 `;
    }

    // filter strategy แบบ multi-select
    if (uniList.length > 0) {
      sql += ` AND TRIM(f.uni_strategy) IN (${uniList.map(() => "?").join(",")}) `;
      params.push(...uniList);
    }

    if (centerList.length > 0) {
      sql += ` AND TRIM(f.center_strategy) IN (${centerList.map(() => "?").join(",")}) `;
      params.push(...centerList);
    }

    if (date_from) {
      sql += ` AND DATE(s.created_at) >= ? `;
      params.push(date_from);
    }

    if (date_to) {
      sql += ` AND DATE(s.created_at) <= ? `;
      params.push(date_to);
    }

    sql += ` ORDER BY s.created_at DESC LIMIT 5000`;

    const [rows] = await pool.execute(sql, params);

    const parsed = rows.map((r) => {
      const p = safeJsonParse(r.payload_json) || {};

      const comments = Array.isArray(p.comments)
        ? p.comments
        : Array.isArray(p.suggestions)
          ? p.suggestions
          : typeof p.suggestion === "string" && p.suggestion.trim()
            ? [p.suggestion.trim()]
            : [];

      return {
        ...r,
        fiscal_year: getFiscalYear(r.payload_json, r.created_at),
        uni_strategy: normalizeText(r.uni_strategy),
        center_strategy: normalizeText(r.center_strategy),
        ratings: Array.isArray(p.ratings) ? p.ratings : [],
        comments,
      };
    });

    const filtered = yearList.length
      ? parsed.filter((r) => yearList.includes(Number(r.fiscal_year)))
      : parsed;

    // ===== DEBUG สำคัญ =====
    console.log("===== STRATEGY DASHBOARD DEBUG =====");
    console.log("query:", req.query);
    console.log("uniList:", uniList);
    console.log("centerList:", centerList);
    console.log("yearList:", yearList);
    console.log("rows from DB:", rows.length);
    console.log("years in rows:", [
      ...new Set(parsed.map((r) => r.fiscal_year)),
    ]);
    console.log("sample parsed:", parsed[0]);
    console.log("after filter:", filtered.length);
    console.log("====================================");

    const allScores = [];
    const comments = [];

    const yearScoreMap = new Map();
    const uniMap = new Map();
    const centerMap = new Map();
    const tableMap = new Map();
    const formsByYearMap = new Map();

    for (const r of filtered) {
      const formId = Number(r.form_id);
      const formTitle = r.form_title || "-";
      const year = r.fiscal_year || "-";
      const uni = r.uni_strategy || "-";
      const center = r.center_strategy || "-";

      const tableKey = `${formId}__${uni}__${center}__${year}`;

      if (!tableMap.has(tableKey)) {
        tableMap.set(tableKey, {
          form_title: formTitle,
          uni_strategy: uni,
          center_strategy: center,
          fiscal_year: year,
          scores: [],
          respondents: 0,
        });
      }

      tableMap.get(tableKey).respondents += 1;

      formsByYearMap.set(year, (formsByYearMap.get(year) || 0) + 1);

      for (const rating of r.ratings) {
        const value = Number(rating.value);
        if (!Number.isFinite(value)) continue;

        allScores.push(value);
        tableMap.get(tableKey).scores.push(value);

        if (!yearScoreMap.has(year)) yearScoreMap.set(year, []);
        yearScoreMap.get(year).push(value);

        if (uni && uni !== "-") {
          if (!uniMap.has(uni)) uniMap.set(uni, []);
          uniMap.get(uni).push(value);
        }

        if (center && center !== "-") {
          if (!centerMap.has(center)) centerMap.set(center, []);
          centerMap.get(center).push(value);
        }
      }

      for (const c of r.comments || []) {
        const text =
          typeof c === "string"
            ? c.trim()
            : String(c.text || c.comment || c.message || "").trim();

        if (!text) continue;

        comments.push({
          text,
          created_at: r.created_at,
          created_by: r.created_by,
          form_title: r.form_title,
        });
      }
    }

    const avgNum = (arr) => {
      const nums = arr.map(Number).filter(Number.isFinite);
      if (!nums.length) return 0;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    };

    const table = Array.from(tableMap.values()).map((row) => ({
      form_title: row.form_title,
      uni_strategy: row.uni_strategy,
      center_strategy: row.center_strategy,
      fiscal_year: row.fiscal_year,
      avg: Number(avgNum(row.scores).toFixed(2)),
      respondents: row.respondents,
    }));

    const yearLabels = Array.from(yearScoreMap.keys()).sort(
      (a, b) => Number(a) - Number(b),
    );

    comments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      kpi: {
        forms: new Set(
          filtered.map((r) => Number(r.form_id)).filter(Number.isFinite),
        ).size,
        respondents: filtered.length,
        avgSatisfaction: Number(avgNum(allScores).toFixed(2)),
        totalComments: comments.length,
      },
      table,
      comments: comments.slice(0, 50),
      charts: {
        yearTrend: {
          labels: yearLabels,
          values: yearLabels.map((y) =>
            Number(avgNum(yearScoreMap.get(y)).toFixed(2)),
          ),
        },
        uniStrategy: {
          labels: Array.from(uniMap.keys()),
          values: Array.from(uniMap.values()).map((v) =>
            Number(avgNum(v).toFixed(2)),
          ),
        },
        centerStrategy: {
          labels: Array.from(centerMap.keys()),
          values: Array.from(centerMap.values()).map((v) =>
            Number(avgNum(v).toFixed(2)),
          ),
        },
        formsByYear: {
          labels: Array.from(formsByYearMap.keys()).sort(
            (a, b) => Number(a) - Number(b),
          ),
          values: Array.from(formsByYearMap.keys())
            .sort((a, b) => Number(a) - Number(b))
            .map((y) => formsByYearMap.get(y)),
        },
      },
    });
  } catch (e) {
    console.error("strategy-dashboard summary error:", e);
    res.status(500).json({ error: e.message });
  }
});

/** -----------------------------
 *  ADMIN API
 * ----------------------------- */

function requireAdmin(req, res) {
  const role = String(req.query.role || req.body?.role || "").trim();

  if (role !== "admin") {
    res.status(403).json({ error: "สำหรับ admin เท่านั้น" });
    return false;
  }

  return true;
}

// ภาพรวม Admin
app.get("/api/admin/overview", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const [[userCount]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM users`,
    );
    const [[adminCount]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM users WHERE role = 'admin'`,
    );
    const [[formCount]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM survey_forms`,
    );
    const [[submissionCount]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM submissions`,
    );

    res.json({
      users: userCount.total || 0,
      admins: adminCount.total || 0,
      forms: formCount.total || 0,
      submissions: submissionCount.total || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// รายการผู้ใช้
app.get("/api/admin/users", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const [rows] = await pool.execute(`
      SELECT id, username, display_name, role, dept_name
      FROM users
      ORDER BY id DESC
    `);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// เพิ่มผู้ใช้
app.post("/api/admin/users", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const username = String(req.body.username || "").trim();
    const display_name = String(req.body.display_name || "").trim();
    const password = String(req.body.password || "").trim();
    const dept_name = String(req.body.dept_name || "").trim();
    const role = String(req.body.role || "staff").trim();

    if (!username || !password) {
      return res.status(400).json({ error: "กรุณากรอก username และ password" });
    }

    const allowedRoles = ["staff", "manager", "admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: "role ไม่ถูกต้อง" });
    }

    const [exists] = await pool.execute(
      `SELECT id FROM users WHERE username = ? LIMIT 1`,
      [username],
    );

    if (exists.length) {
      return res.status(409).json({ error: "username นี้มีอยู่แล้ว" });
    }

    const [result] = await pool.execute(
      `INSERT INTO users (username, password, display_name, role, dept_name)
   VALUES (?, ?, ?, ?, ?)`,
      [username, password, display_name || username, role, dept_name || null],
    );

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// เปลี่ยน role
app.put("/api/admin/users/:id/role", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const id = Number(req.params.id);
    const role = String(req.body.role || "staff").trim();

    const allowedRoles = ["staff", "manager", "admin"];
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: "role ไม่ถูกต้อง" });
    }

    await pool.execute(`UPDATE users SET role = ? WHERE id = ?`, [role, id]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// เปลี่ยนฝ่าย
app.put("/api/admin/users/:id/dept", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const id = Number(req.params.id);
    const dept_name = String(req.body.dept_name || "").trim();

    const allowedDepts = [
      "ฝ่ายเลขานุการ",
      "ฝ่ายพัฒนาและจัดระบบทรัพยากรสารนิเทศ",
      "ฝ่ายบริการทรัพยากรสารนิเทศ",
      "ฝ่ายเทคโนโลยีสารสนเทศ",
    ];

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    if (dept_name && !allowedDepts.includes(dept_name)) {
      return res.status(400).json({ error: "ฝ่ายไม่ถูกต้อง" });
    }

    await pool.execute(`UPDATE users SET dept_name = ? WHERE id = ?`, [
      dept_name || null,
      id,
    ]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ลบผู้ใช้
app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    await pool.execute(`DELETE FROM users WHERE id = ?`, [id]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// รายการฟอร์มทั้งหมด
app.get("/api/admin/forms", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const [rows] = await pool.execute(`
      SELECT id, created_at, created_by, created_by_username, form_title,
             dept_name, uni_strategy, center_strategy, start_date, end_date
      FROM survey_forms
      ORDER BY id DESC
      LIMIT 1000
    `);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ลบฟอร์ม
// ลบฟอร์ม
app.delete("/api/admin/forms/:id", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      await conn.execute(`DELETE FROM submissions WHERE form_id = ?`, [id]);

      await conn.execute(`DELETE FROM survey_forms WHERE id = ?`, [id]);

      await conn.commit();

      res.json({ ok: true });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
/** -----------------------------
 *  QUESTION BANK API
 *  Hybrid Mode:
 *  - ข้อมูลเก่าใช้ category / used_in_label / datalist_id
 *  - ข้อมูลใหม่รองรับ group_id
 * ----------------------------- */

function makeLegacyDatalistId(text = "") {
  const t = String(text || "").toLowerCase();

  if (t.includes("affect of service")) return "affectOfServiceSuggestions";
  if (t.includes("information control")) return "informationControlSuggestions";
  if (t.includes("library as place")) return "libraryAsPlaceSuggestions";

  if (t.includes("tangibles")) return "tangiblesSuggestions";
  if (t.includes("reliability")) return "reliabilitySuggestions";
  if (t.includes("responsiveness")) return "responsivenessSuggestions";
  if (t.includes("empathy")) return "empathySuggestions";
  if (t.includes("assurance")) return "assuranceSuggestions";

  if (t.includes("usability")) return "usabilitySuggestions";
  if (t.includes("information quality")) return "informationQualitySuggestions";
  if (t.includes("service interaction")) return "serviceInteractionSuggestions";

  if (t.includes("ease of use")) return "easeOfUseSuggestions";
  if (t.includes("aesthetic design")) return "aestheticDesignSuggestions";
  if (t.includes("processing speed")) return "processingSpeedSuggestions";

  return "";
}

// ดึงหัวข้อจาก Admin Structure ไปใช้ใน Dropdown ของหน้าจัดการคำถาม
app.get("/api/admin/question-options", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const [rows] = await pool.execute(`
      SELECT
        s.id AS section_id,
        s.title AS section_title,

        c.id AS category_id,
        c.title AS category_title,

        g.id AS group_id,
        g.title AS group_title,
        g.sort_order AS group_sort_order
      FROM survey_question_groups g
      JOIN survey_question_categories c
        ON g.category_id = c.id
      JOIN survey_sections s
        ON c.section_id = s.id
      WHERE s.is_active = 1
        AND c.is_active = 1
        AND g.is_active = 1
      ORDER BY
        s.sort_order ASC,
        c.sort_order ASC,
        g.sort_order ASC,
        g.id ASC
    `);

    res.json(
      rows.map((r) => {
        const legacyId = makeLegacyDatalistId(r.group_title);
        const fallbackId = `group_${r.group_id}_suggestions`;

        return {
          section_id: r.section_id,
          section_title: r.section_title,
          category_id: r.category_id,
          category: r.category_title,
          category_title: r.category_title,
          group_id: r.group_id,
          group_title: r.group_title,
          used_in_label: `${r.category_title} > ${r.group_title}`,
          datalist_id: legacyId || fallbackId,
        };
      }),
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ดึงคำถามทั้งหมด สำหรับหน้า Admin Questions
app.get("/api/admin/questions", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const [rows] = await pool.execute(`
      SELECT
        q.id,
        q.group_id,
        q.category,
        q.question_text,
        q.used_in_label,
        q.datalist_id,
        q.question_type,
        q.status,
        q.sort_order,
        q.created_at,

        g.title AS group_title,
        c.title AS category_title,
        s.title AS section_title
      FROM question_bank q
      LEFT JOIN survey_question_groups g
        ON q.group_id = g.id
      LEFT JOIN survey_question_categories c
        ON g.category_id = c.id
      LEFT JOIN survey_sections s
        ON c.section_id = s.id
      ORDER BY q.id DESC
    `);

    const mapped = rows.map((q) => ({
      ...q,
      display_category: q.category_title || q.category || "",
      display_used_in_label:
        q.category_title && q.group_title
          ? `${q.category_title} > ${q.group_title}`
          : q.used_in_label || "",
    }));

    res.json(mapped);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// เพิ่มคำถาม
app.post("/api/admin/questions", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const group_id = req.body.group_id ? Number(req.body.group_id) : null;

    const oldCategory = String(req.body.category || "").trim();
    const oldUsedInLabel = String(req.body.used_in_label || "").trim();
    const oldDatalistId = String(req.body.datalist_id || "").trim();

    const question_text = String(req.body.question_text || "").trim();
    const question_type = String(req.body.question_type || "rating").trim();
    const status = String(req.body.status || "active").trim();
    const sort_order = Number(req.body.sort_order || 0);

    if (!question_text) {
      return res.status(400).json({ error: "กรุณากรอกคำถาม" });
    }

    let finalGroupId = null;
    let finalCategory = oldCategory;
    let finalUsedInLabel = oldUsedInLabel;
    let finalDatalistId = oldDatalistId;

    // กรณีใหม่: ส่ง group_id มา
    if (Number.isFinite(group_id)) {
      const [groupRows] = await pool.execute(
        `
        SELECT
          g.id AS group_id,
          g.title AS group_title,
          c.title AS category_title
        FROM survey_question_groups g
        JOIN survey_question_categories c
          ON g.category_id = c.id
        WHERE g.id = ?
        LIMIT 1
        `,
        [group_id],
      );

      if (!groupRows.length) {
        return res.status(404).json({ error: "ไม่พบ Group นี้" });
      }

      const group = groupRows[0];

      finalGroupId = group.group_id;
      finalCategory = group.category_title || "";
      finalUsedInLabel = `${group.category_title} > ${group.group_title}`;
      finalDatalistId =
        makeLegacyDatalistId(group.group_title) ||
        `group_${group.group_id}_suggestions`;
    }

    // กรณีเก่า: ยังใช้ category / used_in_label / datalist_id
    if (!finalCategory || !finalUsedInLabel || !finalDatalistId) {
      return res.status(400).json({
        error: "กรุณาเลือกหัวข้อคำถามให้ครบ",
      });
    }

    const [result] = await pool.execute(
      `
      INSERT INTO question_bank
      (group_id, category, question_text, used_in_label, datalist_id, question_type, status, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        finalGroupId,
        finalCategory,
        question_text,
        finalUsedInLabel,
        finalDatalistId,
        question_type,
        status,
        sort_order,
      ],
    );

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ลบคำถาม
app.delete("/api/admin/questions/:id", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    await pool.execute(`DELETE FROM question_bank WHERE id = ?`, [id]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ดึงคำถาม active ไปใช้ใน from.html
// รองรับทั้งข้อมูลเก่าและข้อมูลใหม่
app.get("/api/question-bank/active", async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        q.id,
        q.group_id,
        q.category,
        q.used_in_label,
        q.datalist_id,
        q.question_text,
        q.question_type,
        q.sort_order,

        g.title AS group_title,
        c.title AS category_title,
        s.title AS section_title
      FROM question_bank q
      LEFT JOIN survey_question_groups g
        ON q.group_id = g.id
      LEFT JOIN survey_question_categories c
        ON g.category_id = c.id
      LEFT JOIN survey_sections s
        ON c.section_id = s.id
      WHERE q.status = 'active'
      ORDER BY q.sort_order ASC, q.id ASC
    `);

    res.json(
      rows.map((q) => ({
        ...q,

        // ใช้ตอนระบบใหม่
        effective_group_id: q.group_id || null,
        effective_group_title: q.group_title || "",
        effective_category_title: q.category_title || q.category || "",

        // ใช้รองรับระบบเก่า
        effective_used_in_label:
          q.category_title && q.group_title
            ? `${q.category_title} > ${q.group_title}`
            : q.used_in_label || "",

        effective_datalist_id: q.datalist_id || "",
      })),
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/forms/:id/budget", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const budget_spent = Number(req.body.budget_spent);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        error: "invalid id",
      });
    }

    await pool.execute(
      `
      UPDATE survey_forms
      SET budget_spent = ?
      WHERE id = ?
      `,
      [budget_spent, id],
    );

    res.json({
      ok: true,
    });
  } catch (e) {
    res.status(500).json({
      error: e.message,
    });
  }
});

app.get("/api/forms/:id/results", async (req, res) => {
  try {
    const formId = req.params.id;

    const [forms] = await pool.execute(
      `SELECT
  id,
  form_title,
  goal_text,
  kpi_quantity,
  kpi_quality,
  start_date,
  end_date,
  budget_received,
  budget_spent,
  dept_name,
  uni_strategy,
  center_strategy,
  center_mission
FROM survey_forms
   WHERE id = ?
   LIMIT 1`,
      [formId],
    );

    if (!forms.length) {
      return res.status(404).json({
        error: "ไม่พบฟอร์มนี้",
      });
    }

    const form = forms[0];
    const formTitle = form.form_title || "";

    const [subs] = await pool.execute(
      `SELECT id, form_id, created_at, created_by, form_title, payload_json
   FROM submissions
   WHERE form_id = ?
   ORDER BY created_at DESC`,
      [formId],
    );

    const allScores = [];
    const questionMap = new Map();
    const groupMap = new Map();
    const suggestions = [];
    const respondentSummary = {
      status: {},
      education_level: {},
      faculty: {},
      major: {},
    };

    function addCount(map, value) {
      const key = String(value || "").trim() || "ไม่ระบุ";
      map[key] = (map[key] || 0) + 1;
    }

    function collectRespondentProfile(payload) {
      const profile =
        payload.profile || payload.respondent || payload.user || {};

      const status =
        profile.status ||
        profile.respondent_status ||
        profile.user_status ||
        profile.type ||
        payload.status ||
        payload.respondent_status;

      const educationLevel =
        profile.level ||
        profile.education_level ||
        profile.degree ||
        payload.level ||
        payload.education_level;

      const faculty =
        profile.faculty ||
        profile.dept ||
        profile.department ||
        profile.organization ||
        profile.school ||
        payload.faculty ||
        payload.dept ||
        payload.department;

      const major =
        profile.major ||
        profile.program ||
        profile.branch ||
        payload.major ||
        payload.program;

      addCount(respondentSummary.status, status);
      addCount(respondentSummary.education_level, educationLevel);
      addCount(respondentSummary.faculty, faculty);
      addCount(respondentSummary.major, major);
    }
    const levelCounts = {
      ต้องปรับปรุงเร่งด่วน: 0,
      ต้องปรับปรุง: 0,
      พอใช้: 0,
      ดี: 0,
      ดีมาก: 0,
    };

    function getLevel(score) {
      const s = Number(score) || 0;

      if (s <= 1.5) return "ต้องปรับปรุงเร่งด่วน";
      if (s <= 2.5) return "ต้องปรับปรุง";
      if (s <= 3.5) return "พอใช้";
      if (s <= 4.5) return "ดี";
      return "ดีมาก";
    }

    function addScore(group, question, score) {
      const n = Number(score);

      if (!Number.isFinite(n) || n <= 0) return;

      const groupName = String(group || "ไม่ระบุหมวด").trim();
      const questionText = String(question || "ไม่ระบุคำถาม").trim();

      allScores.push(n);

      const qKey = `${groupName}__${questionText}`;

      if (!questionMap.has(qKey)) {
        questionMap.set(qKey, {
          group: groupName,
          question: questionText,
          scores: [],
        });
      }

      questionMap.get(qKey).scores.push(n);

      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, []);
      }

      groupMap.get(groupName).push(n);
    }

    function walkForScores(value, parentGroup = "") {
      if (Array.isArray(value)) {
        value.forEach((item) => walkForScores(item, parentGroup));
        return;
      }

      if (!value || typeof value !== "object") return;

      const group =
        value.groupTitle ||
        value.group ||
        value.category ||
        value.sectionTitle ||
        value.modelTitle ||
        parentGroup ||
        "ไม่ระบุหมวด";

      const question =
        value.questionText ||
        value.question ||
        value.label ||
        value.title ||
        "";

      const score =
        value.score ||
        value.rating ||
        value.value ||
        value.answer_score ||
        null;

      if (question && score) {
        addScore(group, question, score);
      }

      Object.entries(value).forEach(([key, child]) => {
        if (
          key === "score" ||
          key === "rating" ||
          key === "value" ||
          key === "answer_score"
        ) {
          return;
        }

        walkForScores(child, group);
      });
    }

    function collectSuggestions(payload) {
      const found = [];

      function pushText(label, text) {
        const clean = String(text || "").trim();
        if (!clean) return;

        const displayText = label ? `${label}: ${clean}` : clean;
        found.push(displayText);
      }

      // อ่าน key ใหม่โดยตรง
      if (payload.dissatisfaction_text) {
        pushText("ความไม่พึงพอใจ", payload.dissatisfaction_text);
      }

      if (payload.suggestion) {
        pushText("ข้อเสนอแนะ", payload.suggestion);
      }

      // รองรับโครงสร้างเดิมด้วย
      function walk(value, keyName = "") {
        if (Array.isArray(value)) {
          value.forEach((v) => walk(v, keyName));
          return;
        }

        if (!value || typeof value !== "object") {
          if (
            typeof value === "string" &&
            value.trim() &&
            (keyName.toLowerCase().includes("suggest") ||
              keyName.toLowerCase().includes("dissatisfaction") ||
              keyName.includes("ข้อเสนอแนะ") ||
              keyName.includes("ความไม่พึงพอใจ"))
          ) {
            pushText("", value);
          }

          return;
        }

        Object.entries(value).forEach(([k, v]) => {
          if (k === "dissatisfaction_text" || k === "suggestion") return;
          walk(v, k);
        });
      }

      walk(payload);

      return [...new Set(found)];
    }

    subs.forEach((row) => {
      let payload = {};

      try {
        payload =
          typeof row.payload_json === "string"
            ? JSON.parse(row.payload_json)
            : row.payload_json || {};
      } catch (_) {
        payload = {};
      }

      collectRespondentProfile(payload);
      walkForScores(payload);

      collectSuggestions(payload).forEach((s) => {
        if (s && !suggestions.includes(s)) suggestions.push(s);
      });
    });
    const average =
      allScores.length > 0
        ? allScores.reduce((sum, n) => sum + n, 0) / allScores.length
        : 0;

    const question_scores = Array.from(questionMap.values()).map((item) => {
      const avg =
        item.scores.reduce((sum, n) => sum + n, 0) / item.scores.length;

      return {
        group: item.group,
        question: item.question,
        average: Number(avg.toFixed(2)),
      };
    });

    const group_scores = Array.from(groupMap.entries()).map(
      ([group, scores]) => {
        const avg = scores.reduce((sum, n) => sum + n, 0) / scores.length;

        return {
          group,
          average: Number(avg.toFixed(2)),
        };
      },
    );

    question_scores.forEach((q) => {
      const level = getLevel(q.average);
      if (levelCounts[level] !== undefined) {
        levelCounts[level] += 1;
      }
    });

    res.json({
      form_id: form.id,
      form_title: formTitle,

      project_info: {
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        goal_text: form.goal_text || "",
        kpi_quantity: form.kpi_quantity || "",
        kpi_quality: form.kpi_quality || "",
        budget_received: form.budget_received || null,
        budget_spent: form.budget_spent || null,
      },

      project_meta: {
        dept_name: form.dept_name || "",
        uni_strategy: form.uni_strategy || "",
        center_strategy: form.center_strategy || "",
        center_mission: form.center_mission || "",
      },

      total_responses: subs.length,
      total_questions: question_scores.length,
      average_score: Number(average.toFixed(2)),
      evaluation_level: getLevel(average),
      group_scores,
      question_scores,
      suggestions,

      level_counts: levelCounts,
      respondent_summary: respondentSummary,
    });
  } catch (err) {
    console.error("GET /api/forms/:id/results error:", err);
    res.status(500).json({
      error: err.message || "โหลดผลการดำเนินงานไม่สำเร็จ",
    });
  }
});

/* =====================================================
   SURVEY STRUCTURE API
   Section > Category > Group
===================================================== */

// =========================
// SECTION
// =========================

app.get("/api/survey-sections", async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT id, title, description, sort_order, is_active, created_at
      FROM survey_sections
      ORDER BY sort_order ASC, id ASC
    `);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/survey-sections", async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const sort_order = Number(req.body.sort_order || 0);
    const is_active = req.body.is_active === false ? 0 : 1;

    if (!title) {
      return res.status(400).json({ error: "กรุณากรอกชื่อส่วนหลัก" });
    }

    const [result] = await pool.execute(
      `
      INSERT INTO survey_sections
      (title, description, sort_order, is_active)
      VALUES (?, ?, ?, ?)
      `,
      [title, description || null, sort_order, is_active],
    );

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/survey-sections/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const sort_order = Number(req.body.sort_order || 0);
    const is_active = req.body.is_active ? 1 : 0;

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    if (!title) {
      return res.status(400).json({ error: "กรุณากรอกชื่อส่วนหลัก" });
    }

    await pool.execute(
      `
      UPDATE survey_sections
      SET title = ?, description = ?, sort_order = ?, is_active = ?
      WHERE id = ?
      `,
      [title, description || null, sort_order, is_active, id],
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/survey-sections/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    const [[childCount]] = await pool.execute(
      `
      SELECT COUNT(*) AS total
      FROM survey_question_categories
      WHERE section_id = ?
      `,
      [id],
    );

    if (childCount.total > 0) {
      return res.status(400).json({
        error:
          "ไม่สามารถลบ Section นี้ได้ เพราะยังมี Category อยู่ กรุณาลบ Category ก่อน",
      });
    }

    await pool.execute(`DELETE FROM survey_sections WHERE id = ?`, [id]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// CATEGORY
// =========================

app.get("/api/survey-question-categories/:sectionId", async (req, res) => {
  try {
    const sectionId = Number(req.params.sectionId);

    if (!Number.isFinite(sectionId)) {
      return res.status(400).json({ error: "sectionId ไม่ถูกต้อง" });
    }

    const [rows] = await pool.execute(
      `
      SELECT id, section_id, title, description, sort_order, is_active, created_at
      FROM survey_question_categories
      WHERE section_id = ?
      ORDER BY sort_order ASC, id ASC
      `,
      [sectionId],
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/survey-question-categories", async (req, res) => {
  try {
    const section_id = Number(req.body.section_id);
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const sort_order = Number(req.body.sort_order || 0);
    const is_active = req.body.is_active === false ? 0 : 1;

    if (!Number.isFinite(section_id)) {
      return res.status(400).json({ error: "section_id ไม่ถูกต้อง" });
    }

    if (!title) {
      return res.status(400).json({ error: "กรุณากรอกชื่อ Category" });
    }

    const [result] = await pool.execute(
      `
      INSERT INTO survey_question_categories
      (section_id, title, description, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?)
      `,
      [section_id, title, description || null, sort_order, is_active],
    );

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/survey-question-categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const sort_order = Number(req.body.sort_order || 0);
    const is_active = req.body.is_active ? 1 : 0;

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    if (!title) {
      return res.status(400).json({ error: "กรุณากรอกชื่อ Category" });
    }

    await pool.execute(
      `
      UPDATE survey_question_categories
      SET title = ?, description = ?, sort_order = ?, is_active = ?
      WHERE id = ?
      `,
      [title, description || null, sort_order, is_active, id],
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/survey-question-categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    const [[childCount]] = await pool.execute(
      `
      SELECT COUNT(*) AS total
      FROM survey_question_groups
      WHERE category_id = ?
      `,
      [id],
    );

    if (childCount.total > 0) {
      return res.status(400).json({
        error:
          "ไม่สามารถลบ Category นี้ได้ เพราะยังมี Group อยู่ กรุณาลบ Group ก่อน",
      });
    }

    await pool.execute(`DELETE FROM survey_question_categories WHERE id = ?`, [
      id,
    ]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/survey-question-categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    const [[childCount]] = await pool.execute(
      `
      SELECT COUNT(*) AS total
      FROM survey_question_groups
      WHERE category_id = ?
      `,
      [id],
    );

    if (childCount.total > 0) {
      return res.status(400).json({
        error:
          "ไม่สามารถลบ Category นี้ได้ เพราะยังมี Group อยู่ กรุณาลบ Group ก่อน",
      });
    }

    await pool.execute(
      `
      DELETE FROM survey_question_categories
      WHERE id = ?
      `,
      [id],
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// GROUP
// =========================

app.get("/api/survey-question-groups/:categoryId", async (req, res) => {
  try {
    const categoryId = Number(req.params.categoryId);

    if (!Number.isFinite(categoryId)) {
      return res.status(400).json({ error: "categoryId ไม่ถูกต้อง" });
    }

    const [rows] = await pool.execute(
      `
      SELECT id, category_id, title, description, sort_order, is_active, created_at
      FROM survey_question_groups
      WHERE category_id = ?
      ORDER BY sort_order ASC, id ASC
      `,
      [categoryId],
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/survey-question-groups", async (req, res) => {
  try {
    const category_id = Number(req.body.category_id);
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const sort_order = Number(req.body.sort_order || 0);
    const is_active = req.body.is_active === false ? 0 : 1;

    if (!Number.isFinite(category_id)) {
      return res.status(400).json({ error: "category_id ไม่ถูกต้อง" });
    }

    if (!title) {
      return res.status(400).json({ error: "กรุณากรอกชื่อ Group" });
    }

    const [result] = await pool.execute(
      `
      INSERT INTO survey_question_groups
      (category_id, title, description, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?)
      `,
      [category_id, title, description || null, sort_order, is_active],
    );

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/survey-question-groups/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const sort_order = Number(req.body.sort_order || 0);
    const is_active = req.body.is_active ? 1 : 0;

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    if (!title) {
      return res.status(400).json({ error: "กรุณากรอกชื่อ Group" });
    }

    await pool.execute(
      `
      UPDATE survey_question_groups
      SET title = ?, description = ?, sort_order = ?, is_active = ?
      WHERE id = ?
      `,
      [title, description || null, sort_order, is_active, id],
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/survey-question-groups/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    await pool.execute(`DELETE FROM survey_question_groups WHERE id = ?`, [id]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/survey-structure/form", async (req, res) => {
  try {
    const [sections] = await pool.execute(`
      SELECT id, title, description, sort_order, is_active
      FROM survey_sections
      WHERE is_active = 1
      ORDER BY sort_order ASC, id ASC
    `);

    const questionSection = sections.find((s) =>
      String(s.title || "").includes("คำถาม"),
    );

    if (!questionSection) {
      return res.json({ section: null, models: [] });
    }

    const [categories] = await pool.execute(
      `
      SELECT id, section_id, title, description, sort_order, is_active
      FROM survey_question_categories
      WHERE section_id = ?
        AND is_active = 1
      ORDER BY sort_order ASC, id ASC
      `,
      [questionSection.id],
    );

    const categoryIds = categories.map((c) => c.id);

    let groups = [];
    if (categoryIds.length > 0) {
      const [groupRows] = await pool.execute(
        `
        SELECT id, category_id, title, description, sort_order, is_active
        FROM survey_question_groups
        WHERE category_id IN (${categoryIds.map(() => "?").join(",")})
          AND is_active = 1
        ORDER BY sort_order ASC, id ASC
        `,
        categoryIds,
      );

      groups = groupRows;
    }

    const [questionRows] = await pool.execute(`
      SELECT
        id,
        group_id,
        datalist_id,
        question_text,
        question_type,
        sort_order
      FROM question_bank
      WHERE status = 'active'
      ORDER BY sort_order ASC, id ASC
    `);

    const questionsByGroupId = {};
    const questionsByDatalistId = {};

    questionRows.forEach((q) => {
      const text = String(q.question_text || "").trim();
      if (!text) return;

      if (q.group_id) {
        if (!questionsByGroupId[q.group_id])
          questionsByGroupId[q.group_id] = [];
        questionsByGroupId[q.group_id].push(text);
      }

      const datalistId = String(q.datalist_id || "").trim();
      if (datalistId) {
        if (!questionsByDatalistId[datalistId]) {
          questionsByDatalistId[datalistId] = [];
        }
        questionsByDatalistId[datalistId].push(text);
      }
    });

    const groupMap = {};
    groups.forEach((g) => {
      if (!groupMap[g.category_id]) groupMap[g.category_id] = [];
      groupMap[g.category_id].push(g);
    });

    const models = categories.map((cat) => ({
      id: cat.id,
      title: cat.title,
      enabled: false,
      dimensions: (groupMap[cat.id] || []).map((g) => {
        const legacyDatalistId =
          typeof makeLegacyDatalistId === "function"
            ? makeLegacyDatalistId(g.title)
            : "";

        const questions =
          questionsByGroupId[g.id] ||
          questionsByDatalistId[legacyDatalistId] ||
          [];

        return {
          id: g.id,
          title: g.title,
          enabled: true,
          questions,
        };
      }),
    }));

    res.json({
      section: questionSection,
      models,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
