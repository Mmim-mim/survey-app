const test = require("node:test");
const assert = require("node:assert/strict");
const bank = require("../question-bank-years");
const snapshot = require("../public/section-snapshot");
const loader = require("../public/bank-year-loader");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

// SQL contract fake: no network, no dotenv and no real MySQL imports.
// It models committed/rolled-back data and serialized writers, not MySQL DDL semantics.
function database() {
  const state = {
    question_bank_years: [],
    survey_sections: snapshot.definitions.map(([section_key, title], i) => ({ id: i + 1, section_key, title, is_active: 1 })),
    survey_question_categories: [{ id: 1000, section_id: 2, title: "Model", description: "cat description", sort_order: 3, is_active: 1, fiscal_year: null }],
    survey_question_groups: [{ id: 2000, category_id: 1000, title: "Group", description: "group description", sort_order: 7, is_active: 1, fiscal_year: null }],
    question_bank: [
      { id: 30, group_id: 2000, category: "Model", question_text: "Question A", used_in_label: "Model > Group", datalist_id: "group_2000_suggestions", question_type: "rating", status: "active", sort_order: 2, fiscal_year: null },
      { id: 31, group_id: 2000, category: "Model", question_text: "Question B", used_in_label: "Model > Group", datalist_id: "group_2000_suggestions", question_type: "rating", status: "inactive", sort_order: 1, fiscal_year: null },
      { id: 32, group_id: null, category: "Project", question_text: "Department", used_in_label: "Department options", datalist_id: "dept_name", question_type: "text", status: "active", sort_order: 4, fiscal_year: null },
    ],
  };
  let queue = Promise.resolve();
  let failInsert = false;
  async function execute(raw, args = []) {
    const sql = raw.replace(/\s+/g, " ").trim();
    if (failInsert && sql.startsWith("INSERT INTO question_bank (")) throw Error("injected insert failure");
    if (sql.startsWith("SELECT")) {
      const table = sql.match(/FROM (\w+)/)[1];
      if (!state[table]) throw Error("Unknown table: " + table);
      let rows = state[table];
      if (/WHERE id = \? AND fiscal_year/.test(sql)) rows = rows.filter(r => r.id === Number(args[0]) && r.fiscal_year === args[1]);
      else if (/WHERE fiscal_year <=>/.test(sql)) rows = rows.filter(r => r.fiscal_year === args[0]);
      else if (/WHERE fiscal_year =/.test(sql)) rows = rows.filter(r => r.fiscal_year === args[0]);
      else if (/WHERE id =/.test(sql)) rows = rows.filter(r => r.id === Number(args[0]));
      if (table === "question_bank_years") rows = [...rows].sort((a,b) => b.fiscal_year-a.fiscal_year);
      return [structuredClone(rows)];
    }
    if (sql.startsWith("INSERT")) {
      const [, table, columnText] = sql.match(/INSERT INTO (\w+) \(([^)]+)\)/);
      const row = Object.fromEntries(columnText.split(",").map((c,i) => [c.trim(), args[i]]));
      if (table !== "question_bank_years") row.id = Math.max(0, ...state[table].map(r => r.id)) + 1;
      else if (state[table].some(r => r.fiscal_year === row.fiscal_year)) throw Error("duplicate year");
      state[table].push(row); return [{ insertId: row.id }];
    }
    if (sql.startsWith("UPDATE")) {
      const [, table, set] = sql.match(/UPDATE (\w+) SET (.+) WHERE/);
      const row = state[table].find(r => r.id === Number(args.at(-2)) && r.fiscal_year === args.at(-1));
      if (row) {
        let index = 0;
        for (const part of set.split(",")) {
          const [key, value] = part.trim().split(" = ");
          row[key] = value === "?" ? args[index++] : value === "CURRENT_TIMESTAMP" ? "deleted" : value.replaceAll("'", "");
        }
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }
    throw Error("Unexpected SQL: " + sql);
  }
  const pool = { execute, async getConnection() {
    let unlock, backup;
    return {
      async beginTransaction() {},
      async execute(sql, args) {
        if (sql.includes("FOR UPDATE")) {
          const before = queue; queue = new Promise(resolve => { unlock = resolve; });
          await before; backup = structuredClone(state); return [[{ id: 1 }]];
        }
        return execute(sql, args);
      },
      async commit() { unlock?.(); unlock = null; },
      async rollback() { if (backup) for (const key of Object.keys(state)) state[key] = backup[key]; unlock?.(); unlock = null; },
      release() { unlock?.(); },
    };
  } };
  return { pool, state, breakInsert() { failInsert = true; } };
}
function api(pool) {
  const routes = new Map(), app = {};
  for (const method of ["get", "post", "put", "delete"]) app[method] = (url, handler) => routes.set(`${method} ${url}`, handler);
  bank.install(app, pool, () => true);
  return async (route, year, body = {}, params = {}) => {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    await routes.get(route)({ query: { fiscal_year: year }, body, params }, res);
    return res;
  };
}

test("Legacy null-group aliases resolve on reads across cloned years without changing stored rows", async () => {
  const db = database();
  db.state.survey_question_categories[0].title = "LibQUAL+";
  db.state.survey_question_groups[0].title = "ความรู้สึกที่มีต่อบริการ (Affect of Service)";
  db.state.question_bank[0].group_id = null;
  db.state.question_bank[0].datalist_id = "affectOfServiceSuggestions";
  const call = api(db.pool);
  for (const year of [null, 2570, 2571]) {
    if (year) await bank.cloneYear(db.pool, year);
    const before = structuredClone(db.state);
    const raw = await bank.readSet(db.pool, year);
    const active = await call("get /api/question-bank/active", year);
    const q = active.data.find(q => q.question_text === "Question A");
    assert.equal(q.group_id, raw.groups[0].id);
    assert.equal(q.datalist_id, "affectOfServiceSuggestions");
    assert.equal(q.legacy_group_mapping, true);
    assert.equal(q.id, raw.questions[0].id);
    const structure = await call("get /api/survey-structure/form", year);
    assert.equal(structure.data.models.length, 1);
    assert.equal(structure.data.models[0].dimensions[0].questions[0].questionBankId, q.id);
    assert.equal(raw.questions[0].group_id, null);
    assert.deepEqual(db.state, before);
  }
});

test("Legacy compatibility refuses ambiguous, renamed, cross-year and explicitly assigned groups", () => {
  const set = { categories: [{ id: 7, title: "LibQUAL+", fiscal_year: 2570 }],
    groups: [{ id: 21, category_id: 7, title: "ความรู้สึกที่มีต่อบริการ (Affect of Service)", fiscal_year: 2570 }],
    questions: [{ id: 173, group_id: null, datalist_id: "affectOfServiceSuggestions", question_type: "rating", fiscal_year: 2570 }] };
  assert.equal(bank.withLegacyGroups(set).questions[0].group_id, 21);
  for (const change of [s => s.groups.push({ ...s.groups[0], id: 22 }),
    s => s.groups[0].title = "Renamed", s => s.groups[0].fiscal_year = 2571,
    s => s.categories.push({ ...s.categories[0], id: 8 }),
    s => s.questions[0].datalist_id = "center_strategy"]) {
    const copy = structuredClone(set); change(copy);
    assert.equal(bank.withLegacyGroups(copy).questions[0].group_id, null);
  }
  set.questions[0].group_id = 99;
  assert.equal(bank.withLegacyGroups(set).questions[0].group_id, 99);
});

test("Admin new questions keep explicit current-year group; mapped inactive groups are not offered", async () => {
  const db = database();
  db.state.survey_question_categories[0].title = "LibQUAL+";
  db.state.survey_question_groups[0].title = "ความรู้สึกที่มีต่อบริการ (Affect of Service)";
  db.state.question_bank[0].group_id = null;
  db.state.question_bank[0].datalist_id = "affectOfServiceSuggestions";
  await bank.cloneYear(db.pool, 2570);
  const set = await bank.readSet(db.pool, 2570), call = api(db.pool);
  const saved = await call("post /api/admin/questions", 2570, { question_text: "New", group_id: set.groups[0].id });
  assert.equal(saved.code, 200);
  assert.equal(db.state.question_bank.find(q => q.id === saved.data.id).group_id, set.groups[0].id);
  db.state.survey_question_groups.find(g => g.id === set.groups[0].id).is_active = 0;
  assert.equal((await call("get /api/question-bank/active", 2570)).data.some(q => q.legacy_group_mapping), false);
});
test("first fiscal year clones legacy rows without touching historical IDs", async () => {
  const db = database(), before = structuredClone(db.state);
  const result = await bank.cloneYear(db.pool, 2570);
  assert.equal(result.source_fiscal_year, null);
  assert.deepEqual(result.counts, { categories: 1, groups: 1, questions: 3 });
  assert.deepEqual(db.state.question_bank.filter(q => q.fiscal_year === null), before.question_bank);
});
test("automatic source is greatest earlier nonempty year, not latest insertion or future year", async () => {
  const db = database();
  await bank.cloneYear(db.pool, 2570); await bank.cloneYear(db.pool, 2572);
  const result = await bank.cloneYear(db.pool, 2571);
  assert.equal(result.source_fiscal_year, 2570);
  assert.equal((await bank.cloneYear(db.pool, 2573)).source_fiscal_year, 2572);
});
test("clone remaps all relationships, dropdown IDs, order/status/descriptions", async () => {
  const db = database(); await bank.cloneYear(db.pool, 2570);
  const set = await bank.readSet(db.pool, 2570);
  assert.notEqual(set.categories[0].id, 1000); assert.notEqual(set.groups[0].id, 2000);
  assert.equal(set.groups[0].category_id, set.categories[0].id);
  for (const q of set.questions.filter(q => q.group_id)) {
    assert.equal(q.group_id, set.groups[0].id);
    assert.equal(q.datalist_id, `group_${set.groups[0].id}_suggestions`);
  }
  assert.equal(set.questions.find(q => q.question_text === "Question B").status, "inactive");
  assert.equal(set.questions.find(q => !q.group_id).datalist_id, "dept_name");
  assert.equal(set.groups[0].description, "group description");
  assert.equal(set.categories[0].sort_order, 3);
});
test("year edits, status and soft delete cannot affect earlier year", async () => {
  const db = database(); await bank.cloneYear(db.pool, 2570); await bank.cloneYear(db.pool, 2571);
  const before = await bank.readSet(db.pool, 2570), newer = await bank.readSet(db.pool, 2571);
  const call = api(db.pool), q = newer.questions[0];
  const changed = await call("put /api/admin/questions/:id", 2571, { ...q, question_text: "Changed", status: "inactive", sort_order: 99 }, { id: q.id });
  assert.equal(changed.code, 200);
  await call("delete /api/admin/questions/:id", 2571, {}, { id: q.id });
  assert.deepEqual(await bank.readSet(db.pool, 2570), before);
  assert.equal(db.state.question_bank.find(row => row.id === q.id).question_text, "Changed");
});
test("wrong-year question/group mutation is rejected", async () => {
  const db = database(); await bank.cloneYear(db.pool, 2570); await bank.cloneYear(db.pool, 2571);
  const old = (await bank.readSet(db.pool, 2570)).questions[0];
  const call = api(db.pool);
  assert.equal((await call("put /api/admin/questions/:id", 2571, old, { id: old.id })).code, 404);
  assert.equal((await call("post /api/admin/questions", 2571, old)).code, 404);
});
test("clone rollback removes all partial inserts on error", async () => {
  const db = database(), before = structuredClone(db.state); db.breakInsert();
  await assert.rejects(bank.cloneYear(db.pool, 2570), /injected/);
  assert.deepEqual(db.state, before);
});
test("orphan relationships reject clone without guessing from title", async () => {
  const db = database(); db.state.question_bank[0].group_id = 999;
  await assert.rejects(bank.cloneYear(db.pool, 2570), /Group/);
  assert.equal(db.state.question_bank_years.length, 0);
});
test("concurrent duplicate-year requests serialize and only one commits", async () => {
  const db = database();
  const results = await Promise.allSettled([bank.cloneYear(db.pool, 2570), bank.cloneYear(db.pool, 2570)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(db.state.question_bank_years.length, 1);
});
test("APIs filter active templates, category/group/options by fiscal year", async () => {
  const db = database(); await bank.cloneYear(db.pool, 2570); await bank.cloneYear(db.pool, 2571);
  const call = api(db.pool), set = await bank.readSet(db.pool, 2571);
  const active = await call("get /api/question-bank/active", 2571);
  assert.equal(active.code, 200); assert.equal(active.data.length, 2);
  assert.ok(active.data.every(q => q.fiscal_year === 2571));
  const options = await call("get /api/admin/question-options", 2571);
  assert.equal(options.data.find(o => o.group_id).group_id, set.groups[0].id);
  const structure = await call("get /api/survey-structure/form", 2571);
  assert.equal(structure.data.models[0].id, set.categories[0].id);
  assert.equal(structure.data.models[0].dimensions[0].questions[0].questionBankId, set.questions[0].id);
  assert.equal(structure.data.sections[1].section_key, "rating_questions");
});
test("Create validation prevents cross-year IDs and leaves custom questions null", async () => {
  const db = database(); await bank.cloneYear(db.pool, 2570); await bank.cloneYear(db.pool, 2571);
  const q = (await bank.readSet(db.pool, 2570)).questions[0];
  const form = { fiscal_year: 2571, question_bank_fiscal_year: 2571, section2_models: [{ dimensions: [{ questions: [{ questionId: "custom", questionBankId: null, text: "Custom" }] }] }] };
  await bank.validateForm(db.pool, form);
  assert.equal(form.section2_models[0].dimensions[0].questions[0].questionBankId, null);
  form.section2_models[0].dimensions[0].questions.push({ questionId: "q", questionBankId: q.id });
  await assert.rejects(bank.validateForm(db.pool, form), /คนละปี/);
});
test("saved question snapshot is never refreshed by same-year template edits", async () => {
  const db = database(); await bank.cloneYear(db.pool, 2570);
  const q = (await bank.readSet(db.pool, 2570)).questions[0];
  const form = { fiscal_year: 2570, question_bank_fiscal_year: 2570, section2_models: [{ dimensions: [{ questions: [{ questionId: "q_saved", questionBankId: q.id, text: q.question_text }] }] }] };
  const before = structuredClone(form);
  await bank.saveQuestion(db.pool, 2570, { ...q, question_text: "New template" }, q.id);
  await bank.validateForm(db.pool, form);
  assert.deepEqual(form, before);
});
test("legacy snapshots with missing historical bank records are still accepted", async () => {
  const db = database();
  await bank.validateForm(db.pool, { fiscal_year: 2568, section2_models: [] });
  await bank.validateForm(db.pool, { fiscal_year: 2568, question_bank_fiscal_year: null, section2_models: [{ dimensions: [{ questions: [{ questionBankId: 999 }] }] }] });
});
test("year loader fetches exactly selected year; late older responses cannot win", async () => {
  const pending = [], urls = [];
  const client = loader.create(url => { urls.push(url); return new Promise(resolve => pending.push(() => resolve({ ok: true, json: async () => url.includes("/active") ? [] : { models: [] } }))); });
  const old = client.load(2570), next = client.load(2571);
  pending[2](); pending[3](); assert.equal((await next).year, 2571);
  pending[0](); pending[1](); assert.equal(await old, null);
  assert.deepEqual(urls.map(u => new URL(u, "http://local").searchParams.get("fiscal_year")), ["2570", "2570", "2571", "2571"]);
});
test("year loader never falls back to another year when API fails", async () => {
  const urls = [];
  const client = loader.create(async url => { urls.push(url); return { ok: false, json: async () => ({ error: "No year" }) }; });
  await assert.rejects(client.load(2579), /No year/);
  assert.ok(urls.every(url => url.includes("2579")));
});
test("Builder payload uses selected year and preserves Edit/Copy snapshot fiscal year", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/from.html"), "utf8");
  const fn = html.slice(html.indexOf("function buildFormPayload()"), html.indexOf("function applyFormToPage("));
  for (const pageMode of ["create", "edit", "copy"]) {
    const context = {
      SectionSnapshot: snapshot, sectionSnapshot: snapshot.fromAdmin(snapshot.definitions.map(([section_key,title]) => ({ section_key,title }))),
      pageMode, fiscalYearSelect: { value: "2571" }, bankFiscalYear: pageMode === "create" ? 2571 : 2570, savedFiscalYear: 2570,
      getSectionEnabled: () => true, collectGoalText: () => "", collectSection2Models: () => [], getCheckedValues: () => [], collectExtraSections: () => [], engagementQuestion: "Referral",
      document: { querySelector: () => ({ value: "" }), getElementById: () => ({ value: "2026-10-01" }) },
    };
    vm.createContext(context); vm.runInContext(fn, context);
    const result = context.buildFormPayload();
    assert.equal(result.fiscal_year, pageMode === "create" ? 2571 : 2570);
    assert.equal(result.sections.rating_questions.section_key, "rating_questions");
  }
});

test("Category/Group edits and parent assignments are scoped; other year stays unchanged", async () => {
  const db = database(); await bank.cloneYear(db.pool, 2570); await bank.cloneYear(db.pool, 2571);
  const original = await bank.readSet(db.pool, 2570), newer = await bank.readSet(db.pool, 2571), call = api(db.pool);
  assert.equal((await call("put /api/survey-question-categories/:id", 2571, { title: "New model", description: "New desc", sort_order: 8, is_active: true }, { id: newer.categories[0].id })).code, 200);
  assert.equal((await call("put /api/survey-question-groups/:id", 2571, { title: "New group", sort_order: 9, is_active: false }, { id: newer.groups[0].id })).code, 200);
  assert.equal((await call("post /api/survey-question-groups", 2571, { title: "Wrong parent", category_id: original.categories[0].id })).code, 404);
  assert.deepEqual(await bank.readSet(db.pool, 2570), original);
  const active = await call("get /api/question-bank/active", 2571);
  assert.ok(active.data.every(q => q.group_id === null));
});

test("missing/invalid fiscal year never returns another year's bank", async () => {
  const db = database(); await bank.cloneYear(db.pool, 2570);
  const call = api(db.pool);
  assert.equal((await call("get /api/question-bank/active", 2579)).code, 404);
  assert.equal((await call("get /api/question-bank/active", "2570 OR 1=1")).code, 400);
  assert.ok((await call("get /api/question-bank/active", "legacy")).data.every(q => q.fiscal_year === null));
});

test("deleted template remains a valid saved snapshot reference; it is not cloned", async () => {
  const db = database(); await bank.cloneYear(db.pool, 2570);
  const q = (await bank.readSet(db.pool, 2570)).questions[0];
  await api(db.pool)("delete /api/admin/questions/:id", 2570, {}, { id: q.id });
  await bank.validateForm(db.pool, { fiscal_year: 2570, question_bank_fiscal_year: 2570,
    section2_models: [{ dimensions: [{ questions: [{ questionId: "saved", questionBankId: q.id, text: "Original" }] }] }] });
  assert.equal((await bank.cloneYear(db.pool, 2571)).counts.questions, 2);
});

test("ungrouped legacy ratings are visible after clone without title identity matching", async () => {
  const db = database();
  db.state.question_bank.push({ ...db.state.question_bank[0], id: 40, group_id: null, datalist_id: "legacy_custom", question_text: "Ungrouped" });
  await bank.cloneYear(db.pool, 2570);
  const result = await api(db.pool)("get /api/survey-structure/form", 2570);
  const dimension = result.data.models.flatMap(m => m.dimensions).find(d => d.datalist_id === "legacy_custom");
  assert.equal(dimension.questions[0].text, "Ungrouped");
});

test("Create year switch clears stale bank choices before rendering the selected year", async () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/from.html"), "utf8");
  const fn = html.slice(html.indexOf("async function reloadBankForCreate()"), html.indexOf("function clearBankOptions()"));
  const events = [], elements = { bankLoadStatus: {}, mainModels: { innerHTML: "old questions" } };
  const context = {
    fiscalYearSelect: { value: "2571" }, bankReady: true, bankFiscalYear: 2570, bankRows: [{ fiscal_year: 2570 }],
    defaultMainModels: [], sectionSnapshot: {}, document: { getElementById: id => elements[id] },
    clearBankOptions() { events.push("clear"); context.bankRows = []; },
    bankLoader: { async load(year) { assert.equal(year, "2571"); assert.equal(context.bankReady, false); assert.deepEqual(context.bankRows, []); return { year, questions: [{ fiscal_year: 2571 }], form: {} }; } },
    loadSurveyStructureForForm() { events.push("structure"); },
    SectionSnapshot: { render() {} }, addMainModel() {},
    async loadQuestionBankIntoDatalists() { events.push("questions"); },
    async loadProjectDropdowns() { events.push("dropdowns"); },
  };
  vm.createContext(context); vm.runInContext(fn, context);
  await context.reloadBankForCreate();
  assert.deepEqual(events, ["clear", "structure", "questions", "dropdowns"]);
  assert.equal(context.bankReady, true); assert.equal(context.bankFiscalYear, 2571);
  assert.equal(elements.mainModels.innerHTML, "");
  context.bankLoader.load = async () => { throw Error("network unavailable"); };
  await context.reloadBankForCreate();
  assert.equal(context.bankReady, false);
  assert.equal(elements.bankLoadStatus.textContent, "network unavailable");
});
