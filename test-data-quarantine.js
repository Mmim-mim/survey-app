"use strict";

// Permanent tombstones for this approved test dataset, NOT for activity fiscal years.
// Freshly cloned rows have new IDs and become usable once the old rows are removed.
const ranges = { question_bank: [173, 288], survey_question_groups: [21, 60], survey_question_categories: [7, 16] };
function blockedId(table, value) {
  const n = Number(value), range = ranges[table];
  return Number.isSafeInteger(n) && n >= range[0] && n <= range[1];
}
function reject() {
  const error = new Error("ข้อมูลทดสอบชุดนี้ถูกกักกัน กรุณาใช้ข้อมูลที่ผู้ดูแลจัดเตรียมใหม่");
  error.status = 409; error.code = "TEST_DATA_QUARANTINED";
  throw error;
}
function assertRows(table, rows) { if (rows.some(row => blockedId(table, row.id))) reject(); }
function assertFormId(id) { if (Number(id) === 114) reject(); }
function assertReferences(value, path = "") {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (item && typeof item === "object") { assertReferences(item, `${path}.${key}`); continue; }
    const normalized = key.replace(/_/g, "").toLowerCase();
    if ((normalized === "questionbankid" && blockedId("question_bank", item)) ||
        (["bankgroupid", "groupid"].includes(normalized) && blockedId("survey_question_groups", item)) ||
        (["bankcategoryid", "categoryid"].includes(normalized) && blockedId("survey_question_categories", item)) ||
        (key === "id" && /\.section2_models\.\d+$/.test(path) && blockedId("survey_question_categories", item)) ||
        (key === "id" && /\.dimensions\.\d+$/.test(path) && blockedId("survey_question_groups", item))) reject();
    if (normalized === "datalistid" && typeof item === "string") {
      const match = /^group_(\d+)_suggestions$/.exec(item);
      if (match && blockedId("survey_question_groups", match[1])) reject();
    }
  }
}

// All Form JSON writes take the SAME lock as Bank mutations/Cleanup, on one connection.
// Buffer the JSON response until COMMIT succeeds; early validation failures roll back.
function formWriter(pool, handler) {
  return async (req, res) => {
    let conn;
    try {
      assertFormId(req.params?.id);
      assertReferences(req.body?.form);
      conn = await pool.getConnection();
      await conn.beginTransaction();
      const [locks] = await conn.execute("SELECT id FROM question_bank_write_lock WHERE id = 1 FOR UPDATE");
      if (locks.length !== 1) throw Object.assign(new Error("Question Bank lock missing"), { status: 503 });
      const buffered = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
      await handler(req, buffered, conn);
      if (buffered.code >= 400) await conn.rollback(); else await conn.commit();
      res.status(buffered.code).json(buffered.data);
    } catch (error) {
      if (conn) await conn.rollback().catch(() => {});
      res.status(error.status || 500).json({ error: error.message, code: error.code });
    } finally { conn?.release(); }
  };
}
module.exports = { blockedId, assertRows, assertFormId, assertReferences, formWriter };
