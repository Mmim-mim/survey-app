"use strict";
const quarantine = require("./test-data-quarantine");

const TABLES = {
  categories: "survey_question_categories",
  groups: "survey_question_groups",
  questions: "question_bank",
};
function fail(message, status = 400) {
  const error = new Error(message); error.status = status; throw error;
}
function parseYear(value) {
  if (value === undefined || value === null || value === "" || value === "legacy") return null;
  if (!/^\d{4}$/.test(String(value)) || Number(value) < 2400 || Number(value) > 2999) fail("ปีงบประมาณต้องเป็น พ.ศ. 2400–2999");
  return Number(value);
}
async function transaction(pool, work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // All template mutations and cloning serialize on the same row.
    const [locks] = await conn.execute("SELECT id FROM question_bank_write_lock WHERE id = 1 FOR UPDATE");
    if (locks.length !== 1) fail("Question Bank migration/lock row is missing", 503);
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback(); throw error;
  } finally { conn.release(); }
}
async function ensureYear(db, year) {
  if (year === null) return;
  const [rows] = await db.execute("SELECT fiscal_year FROM question_bank_years WHERE fiscal_year = ?", [year]);
  if (!rows.length) fail("ยังไม่มี Question Bank ของปีนี้ กรุณาให้ Admin สร้างปีก่อน", 404);
  for (const table of Object.values(TABLES)) quarantine.assertRows(table, await records(db, table, year));
}
async function records(db, table, year) {
  const [rows] = await db.execute(`SELECT * FROM ${table} WHERE fiscal_year <=> ? ORDER BY sort_order, id`, [year]);
  return rows;
}
async function readSet(db, year) {
  await ensureYear(db, year);
  const categories = await records(db, TABLES.categories, year);
  const groups = await records(db, TABLES.groups, year);
  const questions = (await records(db, TABLES.questions, year)).filter(q => !q.deleted_at);
  quarantine.assertRows(TABLES.categories, categories);
  quarantine.assertRows(TABLES.groups, groups);
  quarantine.assertRows(TABLES.questions, questions);
  return { categories, groups, questions };
}
async function insert(db, table, row) {
  const columns = Object.keys(row);
  const [result] = await db.execute(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, Object.values(row));
  return result.insertId;
}
function fields(row, names) {
  return Object.fromEntries(names.split(" ").map(name => [name, row[name] ?? null]));
}
async function cloneYear(pool, rawYear) {
  const year = parseYear(rawYear);
  if (year === null) fail("กรุณาระบุปีใหม่");
  return transaction(pool, async db => {
    const [years] = await db.execute("SELECT fiscal_year FROM question_bank_years ORDER BY fiscal_year DESC");
    if (years.some(row => Number(row.fiscal_year) === year)) fail("ปีงบประมาณนี้มีอยู่แล้ว", 409);
    let source = null, set;
    for (const row of years) {
      if (Number(row.fiscal_year) >= year) continue;
      const candidate = await readSet(db, Number(row.fiscal_year));
      if (candidate.categories.length || candidate.groups.length || candidate.questions.length) {
        source = Number(row.fiscal_year); set = candidate; break;
      }
    }
    if (!set) {
      if (years.length) fail("ไม่พบปีงบประมาณก่อนหน้าที่มีข้อมูล", 409);
      set = await readSet(db, null);
    }
    await insert(db, "question_bank_years", { fiscal_year: year, source_fiscal_year: source });
    const categoryIds = new Map(), groupIds = new Map();
    for (const row of set.categories) {
      categoryIds.set(Number(row.id), await insert(db, TABLES.categories, {
        ...fields(row, "section_id title description sort_order is_active"), fiscal_year: year,
      }));
    }
    for (const row of set.groups) {
      const category_id = categoryIds.get(Number(row.category_id));
      if (!category_id) fail("Group อ้าง Category นอกชุดต้นฉบับ ต้องตรวจข้อมูลก่อน Clone", 409);
      groupIds.set(Number(row.id), await insert(db, TABLES.groups, {
        ...fields(row, "title description sort_order is_active"), category_id, fiscal_year: year,
      }));
    }
    for (const row of set.questions) {
      const group_id = row.group_id == null ? null : groupIds.get(Number(row.group_id));
      if (row.group_id != null && !group_id) fail("Question อ้าง Group นอกชุดต้นฉบับ ต้องตรวจข้อมูลก่อน Clone", 409);
      let datalist_id = row.datalist_id;
      if (group_id && datalist_id === `group_${row.group_id}_suggestions`) datalist_id = `group_${group_id}_suggestions`;
      await insert(db, TABLES.questions, {
        ...fields(row, "category question_text used_in_label question_type status sort_order"),
        group_id, datalist_id, fiscal_year: year,
      });
    }
    return { ok: true, fiscal_year: year, source_fiscal_year: source,
      counts: { categories: categoryIds.size, groups: groupIds.size, questions: set.questions.length } };
  });
}

const PROJECT_LISTS = new Set(["dept_name", "uni_strategy", "center_strategy", "center_mission"]);
// Legacy aliases verified against the pre-year builder and existing Legacy bank.
// Exact, unique Category/Group matches only; never infer from ordering or new IDs.
const LEGACY_GROUPS = {
  affectOfServiceSuggestions: ["LibQUAL+", "ความรู้สึกที่มีต่อบริการ (Affect of Service)"],
  informationControlSuggestions: ["LibQUAL+", "การควบคุมสารสนเทศ (Information Control)"],
  libraryAsPlaceSuggestions: ["LibQUAL+", "ลักษณะกายภาพของห้องสมุด (Library as Place)"],
  usabilitySuggestions: ["WEBQUAL", "การใช้งาน (Usability)"],
  informationQualitySuggestions: ["WEBQUAL", "คุณภาพของข้อมูล (Infomation Quality)"],
  easeOfUseSuggestions: ["SiteQUAL", "การใช้งานง่าย (Ease of Use)"],
};
function withLegacyGroups(set) {
  return { ...set, questions: set.questions.map(q => {
    if (q.group_id != null || q.question_type !== "rating") return q;
    const mapping = Object.hasOwn(LEGACY_GROUPS, q.datalist_id) && LEGACY_GROUPS[q.datalist_id];
    if (!mapping) return q;
    const categories = set.categories.filter(c => c.title === mapping[0] && c.fiscal_year === q.fiscal_year);
    if (categories.length !== 1) return q;
    const groups = set.groups.filter(g => Number(g.category_id) === Number(categories[0].id) &&
      g.title === mapping[1] && g.fiscal_year === q.fiscal_year);
    if (groups.length !== 1) return q;
    return { ...q, group_id: groups[0].id, legacy_group_mapping: true };
  }) };
}
function listId(question) {
  return question.group_id && !PROJECT_LISTS.has(question.datalist_id)
    ? `group_${question.group_id}_suggestions` : question.datalist_id;
}
function decorate(set) {
  const categories = new Map(set.categories.map(c => [Number(c.id), c]));
  const groups = new Map(set.groups.map(g => [Number(g.id), g]));
  return set.questions.map(q => {
    const g = groups.get(Number(q.group_id));
    const c = g && categories.get(Number(g.category_id));
    return { ...q, category_id: c?.id ?? null, group_title: g?.title || "", category_title: c?.title || "",
      datalist_id: q.fiscal_year == null || q.legacy_group_mapping ? q.datalist_id : listId(q), display_category: c?.title || q.category,
      display_used_in_label: c && g ? `${c.title} > ${g.title}` : q.used_in_label };
  });
}
async function scopedRecord(db, table, id, year) {
  const [rows] = await db.execute(`SELECT * FROM ${table} WHERE id = ? AND fiscal_year <=> ?`, [Number(id), year]);
  if (!rows.length) fail("ไม่พบรายการในปีที่เลือก", 404);
  quarantine.assertRows(table, rows);
  return rows[0];
}
async function saveQuestion(db, year, body, id = null) {
  quarantine.assertReferences(body);
  await ensureYear(db, year);
  if (id !== null) await scopedRecord(db, TABLES.questions, id, year);
  const question_text = String(body.question_text || "").trim();
  if (!question_text) fail("กรุณากรอกคำถาม");
  const group_id = body.group_id ? Number(body.group_id) : null;
  let category = String(body.category || "").trim();
  let used_in_label = String(body.used_in_label || "").trim();
  let datalist_id = String(body.datalist_id || "").trim();
  if (group_id) {
    const g = await scopedRecord(db, TABLES.groups, group_id, year);
    const c = await scopedRecord(db, TABLES.categories, g.category_id, year);
    category = c.title; used_in_label = `${c.title} > ${g.title}`;
    if (!PROJECT_LISTS.has(datalist_id)) datalist_id = `group_${g.id}_suggestions`;
  }
  if (!category || !used_in_label || !datalist_id) fail("กรุณาเลือกหัวข้อหรือ Dropdown");
  const status = body.status || "active", question_type = body.question_type || "rating";
  if (!["active", "inactive"].includes(status) || !["rating", "text", "textarea"].includes(question_type)) fail("ประเภทหรือสถานะไม่ถูกต้อง");
  const sort_order = Number(body.sort_order || 0);
  if (!Number.isSafeInteger(sort_order)) fail("ลำดับไม่ถูกต้อง");
  const row = { group_id, category, question_text, used_in_label, datalist_id, question_type, status, sort_order };
  if (id === null) return insert(db, TABLES.questions, { ...row, fiscal_year: year });
  await db.execute(`UPDATE question_bank SET ${Object.keys(row).map(k => `${k} = ?`).join(", ")} WHERE id = ? AND fiscal_year <=> ?`, [...Object.values(row), Number(id), year]);
  return Number(id);
}

async function validateForm(db, form) {
  quarantine.assertReferences(form);
  // Forms predating annual sets have no marker. Never reinterpret their historical references.
  if (!Object.prototype.hasOwnProperty.call(form, "question_bank_fiscal_year")) return;
  const year = parseYear(form.question_bank_fiscal_year);
  if (year === null) return; // Legacy references may have been deleted before this feature existed.
  // The bank source year identifies templates, independently of the activity year.
  await ensureYear(db, year);
  const ids = new Set();
  for (const model of form.section2_models || []) {
    for (const group of model.dimensions || []) {
      for (const question of group.questions || []) {
        if (question && typeof question === "object" && question.questionBankId != null) {
          const id = Number(question.questionBankId);
          if (!Number.isSafeInteger(id) || id <= 0) fail("questionBankId ไม่ถูกต้อง");
          ids.add(id);
        }
      }
    }
  }
  // Deleted templates remain valid historical references; their snapshots are not refreshed.
  if (ids.size) {
    const existing = new Set((await records(db, TABLES.questions, year)).map(q => Number(q.id)));
    if ([...ids].some(id => !existing.has(id))) fail("มีคำถามจาก Question Bank คนละปี", 409);
  }
}

function install(app, pool, requireAdmin) {
  const route = (method, url, admin, work) => app[method](url, async (req, res) => {
    try {
      if (admin && !requireAdmin(req, res)) return;
      const year = parseYear(req.query.fiscal_year ?? req.body?.fiscal_year);
      res.json(await work(req, year));
    } catch (error) { res.status(error.status || 500).json({ error: error.message, code: error.code }); }
  });
  route("get", "/api/question-bank/years", false, async () => {
    const [rows] = await pool.execute("SELECT fiscal_year, source_fiscal_year, created_at FROM question_bank_years ORDER BY fiscal_year DESC");
    const visible = [];
    for (const row of rows) {
      try { await ensureYear(pool, row.fiscal_year); visible.push(row); }
      catch (error) { if (error.code !== "TEST_DATA_QUARANTINED") throw error; }
    }
    return visible;
  });
  route("post", "/api/admin/question-bank/years", true, req => cloneYear(pool, req.body.fiscal_year));
  route("get", "/api/admin/questions", true, async (_, year) => decorate(await readSet(pool, year)));
  route("get", "/api/question-bank/active", false, async (_, year) => {
    const set = withLegacyGroups(await readSet(pool, year));
    return decorate(set).filter(q => q.status === "active" && (!q.group_id ||
      set.groups.some(g => Number(g.id) === Number(q.group_id) && g.is_active &&
        set.categories.some(c => Number(c.id) === Number(g.category_id) && c.is_active))));
  });
  route("get", "/api/admin/question-options", true, async (_, year) => {
    const set = await readSet(pool, year);
    const options = set.groups.map(g => {
      const c = set.categories.find(c => Number(c.id) === Number(g.category_id));
      return c && { section_id: c.section_id, category_id: c.id, category_title: c.title,
        group_id: g.id, group_title: g.title, used_in_label: `${c.title} > ${g.title}`, datalist_id: `group_${g.id}_suggestions` };
    }).filter(Boolean);
    // Preserve legacy project dropdowns without inventing Category/Group identities.
    const seen = new Set();
    for (const q of set.questions.filter(q => !q.group_id)) {
      const key = `legacy:${q.datalist_id}`;
      if (seen.has(key)) continue; seen.add(key);
      options.push({ category: q.category, used_in_label: q.used_in_label, datalist_id: q.datalist_id });
    }
    for (const q of set.questions.filter(q => q.group_id && PROJECT_LISTS.has(q.datalist_id))) {
      const option_key = `project_${q.group_id}_${q.datalist_id}`;
      if (seen.has(option_key)) continue; seen.add(option_key);
      options.push({ option_key, group_id: q.group_id, category: q.category,
        used_in_label: q.used_in_label, datalist_id: q.datalist_id });
    }
    return options;
  });
  route("post", "/api/admin/questions", true, (req, year) => transaction(pool, async db => ({ ok: true, id: await saveQuestion(db, year, req.body) })));
  route("put", "/api/admin/questions/:id", true, (req, year) => transaction(pool, async db => ({ ok: true, id: await saveQuestion(db, year, req.body, req.params.id) })));
  route("delete", "/api/admin/questions/:id", true, (req, year) => transaction(pool, async db => {
    await scopedRecord(db, TABLES.questions, req.params.id, year);
    await db.execute("UPDATE question_bank SET deleted_at = CURRENT_TIMESTAMP, status = 'inactive' WHERE id = ? AND fiscal_year <=> ?", [Number(req.params.id), year]);
    return { ok: true };
  }));
  for (const [kind, parent, parentTable, parentParam] of [
    ["categories", "section_id", "survey_sections", "sectionId"],
    ["groups", "category_id", TABLES.categories, "categoryId"],
  ]) {
    const table = TABLES[kind], url = `/api/survey-question-${kind}`;
    route("get", `${url}/:${parentParam}`, false, async (req, year) => {
      await ensureYear(pool, year);
      return (await records(pool, table, year)).filter(r => Number(r[parent]) === Number(req.params[parentParam]));
    });
    for (const method of ["post", "put"]) route(method, method === "post" ? url : `${url}/:id`, true, (req, year) => transaction(pool, async db => {
      await ensureYear(db, year);
      const old = method === "put" ? await scopedRecord(db, table, req.params.id, year) : null;
      const parentId = Number(old?.[parent] ?? req.body[parent]);
      if (kind === "groups") await scopedRecord(db, parentTable, parentId, year);
      else {
        const [rows] = await db.execute("SELECT id FROM survey_sections WHERE id = ?", [parentId]);
        if (!rows.length) fail("ไม่พบ Section", 404);
      }
      const title = String(req.body.title || "").trim();
      const sort_order = Number(req.body.sort_order || 0);
      if (!title || !Number.isSafeInteger(sort_order)) fail("ชื่อหรือลำดับไม่ถูกต้อง");
      const row = { title, description: String(req.body.description || ""), sort_order, is_active: req.body.is_active === false ? 0 : 1 };
      if (!old) return { ok: true, id: await insert(db, table, { ...row, [parent]: parentId, fiscal_year: year }) };
      await db.execute(`UPDATE ${table} SET title = ?, description = ?, sort_order = ?, is_active = ? WHERE id = ? AND fiscal_year <=> ?`, [...Object.values(row), old.id, year]);
      return { ok: true, id: old.id };
    }));
    route("delete", `${url}/:id`, true, (req, year) => transaction(pool, async db => {
      await scopedRecord(db, table, req.params.id, year);
      // Keep records/relationships: disabling is reversible and never destroys old templates.
      await db.execute(`UPDATE ${table} SET is_active = 0 WHERE id = ? AND fiscal_year <=> ?`, [Number(req.params.id), year]);
      return { ok: true };
    }));
  }
  route("get", "/api/survey-structure/form", false, async (_, year) => {
    const set = withLegacyGroups(await readSet(pool, year));
    const [sections] = await pool.execute("SELECT id, section_key, title, description, sort_order, is_active FROM survey_sections ORDER BY sort_order, id");
    const section = sections.find(s => s.section_key === "rating_questions");
    if (!section) fail("Missing rating_questions Section", 409);
    const models = !section.is_active ? [] : set.categories.filter(c => c.is_active && Number(c.section_id) === Number(section.id)).map(c => ({
      id: c.id, title: c.title, enabled: false,
      dimensions: set.groups.filter(g => g.is_active && Number(g.category_id) === Number(c.id)).map(g => ({
        id: g.id, bankGroupId: g.id, datalist_id: `group_${g.id}_suggestions`, title: g.title, enabled: true,
        questions: set.questions.filter(q => Number(q.group_id) === Number(g.id) && q.status === "active")
          .map(q => ({ questionBankId: q.id, text: q.question_text })),
      })),
    }));
    // Older banks can contain rating templates with only a datalist identity, no FK.
    // Expose them explicitly rather than guessing a Group from its display title.
    const ungrouped = new Map();
    for (const q of set.questions) {
      if (q.group_id || q.status !== "active" || q.question_type !== "rating" || PROJECT_LISTS.has(q.datalist_id)) continue;
      const key = q.datalist_id;
      if (!ungrouped.has(key)) ungrouped.set(key, { datalist_id: key,
        title: q.used_in_label || q.category || "คำถามเดิม", enabled: true, questions: [] });
      ungrouped.get(key).questions.push({ questionBankId: q.id, text: q.question_text });
    }
    if (section.is_active && ungrouped.size) models.push({ title: "คำถามที่ยังไม่ผูก Group", enabled: false, dimensions: [...ungrouped.values()] });
    return { fiscal_year: year, section, sections, models };
  });
}
module.exports = { parseYear, transaction, cloneYear, readSet, saveQuestion, decorate, validateForm, install, withLegacyGroups };
