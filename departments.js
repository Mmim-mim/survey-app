"use strict";
const error = (status, message) => Object.assign(new Error(message), { status });
function id(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw error(400, "รหัสฝ่ายไม่ถูกต้อง");
  return n;
}
function fields(body) {
  if (typeof body.dept_name !== "string") throw error(400, "กรุณากรอกชื่อฝ่าย");
  const dept_name = body.dept_name.trim();
  if (!dept_name || [...dept_name].length > 255) throw error(400, "ชื่อฝ่ายต้องมี 1–255 ตัวอักษร");
  if (![true, false, 0, 1].includes(body.is_active)) throw error(400, "สถานะฝ่ายไม่ถูกต้อง");
  const sort_order = body.sort_order ?? 0;
  if (!Number.isInteger(sort_order) || sort_order < 0 || sort_order > 2147483647) throw error(400, "ลำดับฝ่ายไม่ถูกต้อง");
  return { dept_name, is_active: Number(body.is_active), sort_order };
}
async function transaction(pool, action) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const value = await action(db); await db.commit(); return value; }
  catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}
function respondError(res, e) {
  if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "ชื่อฝ่ายนี้มีอยู่แล้ว หรือเป็นชื่อเดิมของฝ่ายอื่น" });
  if (e.code === "ER_ROW_IS_REFERENCED_2") return res.status(409).json({ error: usedMessage });
  return res.status(e.status || 503).json({ error: e.status ? e.message : "ดำเนินการฝ่ายไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ" });
}
const usedMessage = "ฝ่ายนี้มีประวัติการใช้งานแล้ว ไม่สามารถลบได้ กรุณาเลือกปิดใช้งานแทน";
function unchanged(user, body) {
  if (body.department_id != null && body.department_id !== "") return Number(body.department_id) === user.department_id;
  return body.department_id === undefined && typeof body.dept_name === "string" && body.dept_name.trim() === (user.dept_name || "");
}
async function assign(db, body) {
  let department;
  if (body.department_id != null && body.department_id !== "") {
    [[department]] = await db.execute("SELECT * FROM departments WHERE id = ? FOR UPDATE", [id(body.department_id)]);
  } else if (String(body.dept_name || "").trim()) {
    // Backward-compatible clients may submit a current active name, never a stale alias.
    [[department]] = await db.execute("SELECT * FROM departments WHERE dept_name = ? FOR UPDATE", [String(body.dept_name).trim()]);
  } else return null; // Preserve optional/no-department behavior.
  if (!department || !department.is_active) throw error(400, "กรุณาเลือกฝ่ายที่เปิดใช้งานจากรายการ");
  await db.execute("UPDATE departments SET first_used_at = COALESCE(first_used_at, NOW()) WHERE id = ?", [department.id]);
  return department;
}
async function references(db, departmentId) {
  // Also protect legacy string references; this does not migrate or rewrite them.
  const [[row]] = await db.execute(`SELECT
    EXISTS(SELECT 1 FROM users u WHERE u.department_id = ? OR u.dept_name IN
      (SELECT dept_name FROM department_name_aliases WHERE department_id = ?)) AS user_used,
    EXISTS(SELECT 1 FROM survey_forms f WHERE f.dept_name IN
      (SELECT dept_name FROM department_name_aliases WHERE department_id = ?)) AS form_used`, [departmentId, departmentId, departmentId]);
  return Boolean(row.user_used || row.form_used);
}
function install(app, pool, requireAdmin) {
  const route = fn => async (req, res) => { try { await fn(req, res); } catch (e) { respondError(res, e); } };
  app.get("/api/departments", route(async (req, res) => {
    if (!req.authUser) throw error(401, "กรุณาเข้าสู่ระบบใหม่");
    const [rows] = await pool.execute("SELECT id, dept_name, sort_order FROM departments WHERE is_active = 1 ORDER BY sort_order, dept_name, id");
    res.set("Cache-Control", "no-store"); res.json(rows);
  }));
  app.get("/api/admin/departments", route(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const [rows] = await pool.execute("SELECT * FROM departments ORDER BY sort_order, dept_name, id");
    for (const row of rows) row.can_delete = !row.first_used_at && !await references(pool, row.id);
    res.set("Cache-Control", "no-store"); res.json(rows);
  }));
  app.post("/api/admin/departments", route(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const value = fields(req.body);
    const inserted = await transaction(pool, async db => {
      const [r] = await db.execute("INSERT INTO departments (dept_name, is_active, sort_order) VALUES (?, ?, ?)", [value.dept_name, value.is_active, value.sort_order]);
      await db.execute("INSERT INTO department_name_aliases (dept_name, department_id) VALUES (?, ?)", [value.dept_name, r.insertId]);
      if (await references(db, r.insertId)) await db.execute("UPDATE departments SET first_used_at = NOW() WHERE id = ?", [r.insertId]);
      return r.insertId;
    });
    res.status(201).json({ ok: true, id: inserted });
  }));
  app.put("/api/admin/departments/:id", route(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const key = id(req.params.id), value = fields(req.body);
    await transaction(pool, async db => {
      const [[old]] = await db.execute("SELECT * FROM departments WHERE id = ? FOR UPDATE", [key]);
      if (!old) throw error(404, "ไม่พบฝ่าย");
      const [[alias]] = await db.execute("SELECT department_id FROM department_name_aliases WHERE dept_name = ?", [value.dept_name]);
      if (alias && alias.department_id !== key) throw error(409, "ชื่อฝ่ายนี้เป็นชื่อเดิมของฝ่ายอื่น");
      if (!alias) await db.execute("INSERT INTO department_name_aliases (dept_name, department_id) VALUES (?, ?)", [value.dept_name, key]);
      await db.execute("UPDATE departments SET dept_name = ?, is_active = ?, sort_order = ? WHERE id = ?", [value.dept_name, value.is_active, value.sort_order, key]);
      // A newly adopted name may already occur in legacy users/forms.
      if (await references(db, key)) await db.execute("UPDATE departments SET first_used_at = COALESCE(first_used_at, NOW()) WHERE id = ?", [key]);
      // Users retain their name snapshot: manager scoping remains unchanged in Phase 1.
    });
    res.json({ ok: true });
  }));
  app.delete("/api/admin/departments/:id", route(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const key = id(req.params.id);
    await transaction(pool, async db => {
      const [[row]] = await db.execute("SELECT * FROM departments WHERE id = ? FOR UPDATE", [key]);
      if (!row) throw error(404, "ไม่พบฝ่าย");
      if (row.first_used_at || await references(db, key)) throw error(409, usedMessage);
      await db.execute("DELETE FROM department_name_aliases WHERE department_id = ?", [key]);
      await db.execute("DELETE FROM departments WHERE id = ?", [key]);
    });
    res.json({ ok: true });
  }));
}
module.exports = { install, assign, unchanged, transaction, respondError, fields, id, error };
