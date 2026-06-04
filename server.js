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

  const comments = Array.isArray(p.comments)
    ? p.comments
    : Array.isArray(p.suggestions)
      ? p.suggestions
      : typeof p.suggestion === "string" && p.suggestion.trim()
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
      return res.status(400).json({
        error: "username and password are required",
      });
    }

    const [rows] = await pool.execute(
      `SELECT id, username, password, display_name, role, dept_name
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [String(username).trim()]
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
    const { created_by, form_title, payload } = req.body;
    if (!payload) return res.status(400).json({ error: "payload is required" });

    const payload_json = JSON.stringify(payload);

    const [result] = await pool.execute(
      "INSERT INTO submissions (created_by, form_title, payload_json) VALUES (?, ?, ?)",
      [created_by || null, form_title || null, payload_json],
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
      SELECT id, created_at, created_by, form_title, payload_json
      FROM submissions
      WHERE 1=1
    `;
    const params = [];

    if (role !== "manager") {
      const [forms] = await pool.execute(
        "SELECT form_title FROM survey_forms WHERE created_by_username = ?",
        [username],
      );

      const formTitles = forms
        .map((f) => String(f.form_title || "").trim())
        .filter(Boolean);
      if (formTitles.length > 0) {
        sql += ` AND form_title IN (${formTitles.map(() => "?").join(",")}) `;
        params.push(...formTitles);
      } else {
        sql += ` AND 1 = 0 `;
      }
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
    const fiscalYear = req.query.fiscal_year
      ? Number(req.query.fiscal_year)
      : null;
    const deptQ = String(req.query.dept || "").trim();

    let sql = `
      SELECT id, created_at, created_by, form_title, payload_json
      FROM submissions
      WHERE 1=1
    `;
    const params = [];

    if (role !== "manager") {
      const [forms] = await pool.execute(
        "SELECT form_title FROM survey_forms WHERE created_by_username = ?",
        [username],
      );

      const formTitles = forms
        .map((f) => String(f.form_title || "").trim())
        .filter(Boolean);

      if (formTitles.length > 0) {
        sql += ` AND form_title IN (${formTitles.map(() => "?").join(",")}) `;
        params.push(...formTitles);
      } else {
        sql += ` AND 1 = 0 `;
      }
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

    const items = Array.from(itemMap.entries()).map(
      ([question, values], index) => ({
        no: index + 1,
        question,
        avg: Number(avg(values).toFixed(2)),
        sd: Number(stddev(values).toFixed(2)),
        count: values.length,
      }),
    );

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
  kpi_quantity, kpi_quality, start_date, end_date, attachment_url, form_json)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        f.end_date
      FROM survey_forms f
      LEFT JOIN users u
        ON f.created_by_username = u.username
      WHERE 1=1
    `;

    const params = [];

    if (role === "staff") {
      sql += ` AND f.created_by_username = ? `;
      params.push(username);
    }

    if (role === "manager") {
      sql += ` AND u.dept_name = ? `;
      params.push(dept_name);
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
              start_date, end_date, attachment_url, form_json
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
      [id]
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

    await pool.execute(`DELETE FROM survey_forms WHERE id = ?`, [id]);

    res.json({ ok: true });
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
    const [rows] = await pool.execute(`
      SELECT uni_strategy, center_strategy
      FROM survey_forms
    `);

    const uniSet = new Set();
    const centerSet = new Set();

    for (const r of rows) {
      if (r.uni_strategy) uniSet.add(String(r.uni_strategy).trim());
      if (r.center_strategy) centerSet.add(String(r.center_strategy).trim());
    }

    const [submissionRows] = await pool.execute(`
  SELECT payload_json, created_at
  FROM submissions
  ORDER BY created_at DESC
`);

    const yearSet = new Set();

    for (const s of submissionRows) {
      const p = safeJsonParse(s.payload_json) || {};
      let year = Number(p.fiscal_year);

      if (!Number.isFinite(year) || !year) {
        const d = new Date(s.created_at);
        if (!isNaN(d)) year = d.getFullYear() + 543;
      }

      if (year) yearSet.add(year);
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
        ON LOWER(TRIM(s.form_title)) = LOWER(TRIM(f.form_title))
      WHERE 1=1
    `;

    const params = [];

    // staff เห็นเฉพาะฟอร์มตัวเอง / manager เห็นทั้งหมด
    if (role !== "manager") {
      sql += ` AND f.created_by_username = ? `;
      params.push(username);
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
      const formTitle = r.form_title || "-";
      const year = r.fiscal_year || "-";
      const uni = r.uni_strategy || "-";
      const center = r.center_strategy || "-";

      const tableKey = `${formTitle}__${uni}__${center}__${year}`;

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
        forms: new Set(filtered.map((r) => r.form_title)).size,
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
  [username, password, display_name || username, role, dept_name || null]
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

    await pool.execute(
      `UPDATE users SET dept_name = ? WHERE id = ?`,
      [dept_name || null, id]
    );

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
app.delete("/api/admin/forms/:id", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    }

    await pool.execute(`DELETE FROM survey_forms WHERE id = ?`, [id]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** -----------------------------
 *  QUESTION BANK API
 * ----------------------------- */

// ดึงคำถามทั้งหมด สำหรับหน้า admin
app.get("/api/admin/questions", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const [rows] = await pool.execute(`
      SELECT id, category, question_text, used_in_label, datalist_id, question_type, status, created_at
      FROM question_bank
      ORDER BY id DESC
    `);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// เพิ่มคำถาม
app.post("/api/admin/questions", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const category = String(req.body.category || "").trim();
    const question_text = String(req.body.question_text || "").trim();
    const used_in_label = String(req.body.used_in_label || "").trim();
    const datalist_id = String(req.body.datalist_id || "").trim();
    const question_type = String(req.body.question_type || "rating").trim();
    const status = String(req.body.status || "active").trim();

    if (!category || !question_text || !used_in_label || !datalist_id) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const [result] = await pool.execute(
      `INSERT INTO question_bank
       (category, question_text, used_in_label, datalist_id, question_type, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        category,
        question_text,
        used_in_label,
        datalist_id,
        question_type,
        status,
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
app.get("/api/question-bank/active", async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT datalist_id, question_text
      FROM question_bank
      WHERE status = 'active'
      ORDER BY id ASC
    `);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
