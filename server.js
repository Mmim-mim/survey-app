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
    rejectUnauthorized: false
  }
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

  const comments = Array.isArray(p.comments)
    ? p.comments
    : Array.isArray(p.suggestions)
      ? p.suggestions
      : (typeof p.suggestion === "string" && p.suggestion.trim())
        ? [p.suggestion.trim()]
        : [];

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
      return res
        .status(400)
        .json({ error: "username and password are required" });
    }

    const [rows] = await pool.execute(
      "SELECT id, username, password, display_name, role FROM users WHERE username = ? LIMIT 1",
      [String(username).trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = rows[0];

    // เทียบรหัสแบบตรง ๆ (plain text)
    if (String(user.password) !== String(password)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    res.json({
      ok: true,
      user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name || user.username,
      role: user.role || "staff",
    },
  });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** -----------------------------
 *  1) บันทึก submission
 * ----------------------------- */
app.post("/api/submissions", async (req, res) => {
  try {
    const { created_by, form_title, payload } = req.body;
    if (!payload) return res.status(400).json({ error: "payload is required" });

    const payload_json = JSON.stringify(payload);

    const [result] = await pool.execute(
      "INSERT INTO submissions (created_by, form_title, payload_json) VALUES (?, ?, ?)",
      [created_by || null, form_title || null, payload_json]
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
      "SELECT id, created_at, created_by, form_title FROM submissions ORDER BY id DESC LIMIT 200"
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
      SELECT id, created_at, created_by, form_title, payload_json
      FROM submissions
    `;
    const params = [];

    if (role !== "manager") {
      sql += ` WHERE created_by = ? `;
      params.push(username);
    }

    sql += ` ORDER BY created_at DESC LIMIT 5000`;

    const [rows] = await pool.execute(sql, params);

    const forms = new Set();
    const years = new Set();
    const depts = new Set();

    for (const row of rows) {
      if (row.form_title) forms.add(String(row.form_title).trim());

      const parsed = parseSubmissionPayload(row.payload_json);
      if (parsed.fiscal_year) years.add(parsed.fiscal_year);
      if (parsed.dept) depts.add(parsed.dept);
    }

    res.json({
      forms: Array.from(forms).sort((a, b) => a.localeCompare(b, "th")),
      fiscalYears: Array.from(years).sort((a, b) => b - a),
      depts: Array.from(depts).sort((a, b) => a.localeCompare(b, "th")),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/dashboard/summary", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    const role = String(req.query.role || "staff").trim();

    const formTitle = String(req.query.form_title || "").trim();
    const dateFrom = String(req.query.date_from || "").trim();
    const dateTo = String(req.query.date_to || "").trim();
    const fiscalYear = req.query.fiscal_year ? Number(req.query.fiscal_year) : null;
    const deptQ = String(req.query.dept || "").trim();

    let sql = `
      SELECT id, created_at, created_by, form_title, payload_json
      FROM submissions
      WHERE 1=1
    `;
    const params = [];

    if (role !== "manager") {
      sql += ` AND created_by = ? `;
      params.push(username);
    }

    if (formTitle) {
      sql += ` AND form_title = ? `;
      params.push(formTitle);
    }

    if (dateFrom) {
      sql += ` AND DATE(created_at) >= ? `;
      params.push(dateFrom);
    }

    if (dateTo) {
      sql += ` AND DATE(created_at) <= ? `;
      params.push(dateTo);
    }

    sql += ` ORDER BY created_at DESC LIMIT 5000`;

    const [rows] = await pool.execute(sql, params);

    const filtered = [];
    for (const row of rows) {
      const parsed = parseSubmissionPayload(row.payload_json);

      if (fiscalYear && parsed.fiscal_year !== fiscalYear) continue;
      if (deptQ && parsed.dept !== deptQ) continue;

      filtered.push({
        id: row.id,
        created_at: row.created_at,
        created_by: row.created_by,
        form_title: row.form_title,
        ...parsed,
      });
    }

    const respondentCount = filtered.length;

    const allRatingValues = [];
    const itemMap = new Map();
    const comments = [];

    let satisfiedCount = 0;
    let unsatisfiedCount = 0;

    const barMap = new Map();

    for (const row of filtered) {
      for (const r of row.ratings) {
        const label = String(r.questionText || r.label || "").trim();
        const value = Number(r.value);

        if (!label || !Number.isFinite(value)) continue;

        allRatingValues.push(value);

        if (!itemMap.has(label)) itemMap.set(label, []);
        itemMap.get(label).push(value);

        if (!barMap.has(label)) {
          barMap.set(label, { positive: 0, negative: 0 });
        }

        if (value >= 4) {
          satisfiedCount++;
          barMap.get(label).positive++;
        } else {
          unsatisfiedCount++;
          barMap.get(label).negative++;
        }
      }

      for (const c of row.comments) {
        const text =
          typeof c === "string"
            ? c.trim()
            : String(c.comment || c.text || c.message || "").trim();

        if (!text) continue;

        comments.push({
          text,
          created_at: row.created_at,
          created_by: row.created_by,
          form_title: row.form_title,
        });
      }
    }

    const items = Array.from(itemMap.entries()).map(([question, values], index) => ({
      no: index + 1,
      question,
      avg: Number(avg(values).toFixed(2)),
      sd: Number(stddev(values).toFixed(2)),
      count: values.length,
    }));

    const overallAvg = Number(avg(allRatingValues).toFixed(2));

    const barLabels = [];
    const barPositive = [];
    const barNegative = [];

    for (const [label, counts] of barMap.entries()) {
      barLabels.push(label);
      barPositive.push(counts.positive);
      barNegative.push(counts.negative);
    }

    comments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      kpi: {
        respondents: respondentCount,
        avgSatisfaction: overallAvg,
        totalComments: comments.length,
      },
      filters: {
        form_title: formTitle,
        date_from: dateFrom,
        date_to: dateTo,
        fiscal_year: fiscalYear,
        dept: deptQ,
      },
      table: items,
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** -----------------------------
 *  4) Dashboard: summary ตาม filter
 *  GET /api/dashboard/summary?year=2569&status=...&dept=...&major=...
 * ----------------------------- */
app.get("/api/dashboard/summary", async (req, res) => {
  try {
    const yearQ = req.query.year ? Number(req.query.year) : null;
    const statusQ = (req.query.status || "ทั้งหมด").trim();
    const deptQ = (req.query.dept || "ทั้งหมด").trim();
    const majorQ = (req.query.major || "").trim(); // "" = รวมทุกสาขา

    const [rows] = await pool.query(
      "SELECT payload_json FROM submissions ORDER BY id DESC LIMIT 5000"
    );

    // เลือก submissions ตาม filter
    const picked = [];
    for (const r of rows) {
      const p = safeJsonParse(r.payload_json);
      if (!p) continue;

      const yr = Number(p.fiscal_year);
      if (yearQ && yr !== yearQ) continue;

      const prof = p.profile || {};
      const status = (prof.status || "").trim();
      const dept = (prof.dept || "").trim();
      const major = (prof.major || "").trim();

      if (statusQ !== "ทั้งหมด" && status !== statusQ) continue;
      if (deptQ !== "ทั้งหมด" && dept !== deptQ) continue;
      if (majorQ && major !== majorQ) continue;

      picked.push(p);
    }

    // n = จำนวน submissions
    const n = picked.length;

    // ===== TABLE: รวมคะแนนจาก ratings โดยใช้ questionText เป็น key =====
    // itemsMap[text] = { values: [..] }
    const itemsMap = new Map();

    for (const p of picked) {
      const ratings = Array.isArray(p.ratings) ? p.ratings : [];
      for (const r of ratings) {
        const text = (r.questionText || "").trim();
        const v = Number(r.value);
        if (!text) continue;
        if (!itemsMap.has(text)) itemsMap.set(text, []);
        if (Number.isFinite(v)) itemsMap.get(text).push(v);
      }
    }

    // แปลงเป็น items[] ตามที่ dashboard ใช้
    // NOTE: ตอนนี้ใช้คะแนนเดียวใส่ทั้ง “ความคาดหวัง” และ “ความพึงพอใจ” ไปก่อน
    const items = Array.from(itemsMap.entries()).map(([text, arr]) => {
      const m = mean(arr);
      const s = sd(arr);
      return {
        text,
        expMean: m,
        expSd: s,
        satMean: m,
        satSd: s,
      };
    });

    // ===== PIE: พึงพอใจ vs ไม่พึงพอใจ จาก diss (no=พึงพอใจ, yes=ไม่พึงพอใจ) =====
    let ok = 0,
      bad = 0;
    for (const p of picked) {
      const diss = Array.isArray(p.diss) ? p.diss : [];
      for (const d of diss) {
        if (d.yn === "no") ok++;
        else if (d.yn === "yes") bad++;
      }
    }

    // ===== BAR: ความผูกพัน จาก engagement (yes=มี, no=ไม่มี) แยกตามคำถาม =====
    const engLabels = [];
    const engOk = [];
    const engBad = [];

    // รวมเป็น map: label -> {yesCount, noCount}
    const engMap = new Map();
    for (const p of picked) {
      const eng = Array.isArray(p.engagement) ? p.engagement : [];
      for (const e of eng) {
        const label = (e.questionText || "").trim();
        if (!label) continue;
        engMap.set(label, engMap.get(label) || { yes: 0, no: 0 });
        if (e.yn === "yes") engMap.get(label).yes++;
        if (e.yn === "no") engMap.get(label).no++;
      }
    }

    for (const [label, c] of engMap.entries()) {
      engLabels.push(label);
      engOk.push(c.yes);
      engBad.push(c.no);
    }

    res.json({
      year: yearQ,
      status: statusQ,
      dept: deptQ,
      major: majorQ,
      n,
      items,
      satisfactionSplit: { ok, bad },
      engagement: {
        labels: engLabels,
        ok: engOk,
        bad: engBad,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


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
  form,
} = req.body || {};

    if (!form) {
      return res.status(400).json({ error: "form is required" });
    }

    const form_json = JSON.stringify(form);

    const [result] = await pool.execute(
      `INSERT INTO survey_forms
      (created_by, created_by_username, form_title, dept_name, uni_strategy, center_strategy, center_mission, goal_text, 
      kpi_quantity, kpi_quality, start_date, end_date, form_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      form_json,
    ]
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

    let sql = `
      SELECT id, created_at, created_by, created_by_username, form_title,
             dept_name, uni_strategy, center_strategy, center_mission,
             goal_text, kpi_quantity, kpi_quality,
             start_date, end_date
      FROM survey_forms
    `;

    const params = [];

    if (role !== "manager") {
      sql += ` WHERE created_by_username = ? `;
      params.push(username);
    }

    sql += ` ORDER BY id DESC LIMIT 500`;

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
      `SELECT id, created_at, created_by, form_title,
              dept_name, uni_strategy, center_strategy, center_mission,
              goal_text, kpi_quantity, kpi_quality, form_json
       FROM survey_forms
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: "not found" });

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
      form_title: r.form_title,
      dept_name: r.dept_name,
      uni_strategy: r.uni_strategy,
      center_strategy: r.center_strategy,
      center_mission: r.center_mission,
      goal_text: r.goal_text,
      kpi_quantity: r.kpi_quantity,
      kpi_quality: r.kpi_quality,
      form,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});