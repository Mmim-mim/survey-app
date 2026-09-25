const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const snapshot = require("../public/section-snapshot");
const base = path.resolve(__dirname, "..");
const admin = snapshot.definitions.map(([section_key], index) => ({
  id: index + 1, section_key, title: `Renamed ${index}`, description: `Description ${index}`, is_active: 1,
}));
function server(database) {
  const routes = new Map();
  const app = { use() {}, listen() {} };
  for (const method of ["get", "post", "put", "delete"]) {
    app[method] = (url, handler) => routes.set(`${method} ${url}`, handler);
  }
  const express = Object.assign(() => app, { json() {}, static() {} });
  vm.runInNewContext(fs.readFileSync(path.join(base, "server.js"), "utf8"), {
    require(name) {
      if (name === "express") return express;
      if (name === "cors") return () => {};
      if (name === "dotenv") return { config() {} };
      if (name === "mysql2/promise") return { createPool: () => ({ execute: database, async getConnection() {
        return { execute: async (sql, args) => sql.includes('question_bank_write_lock') ? [[{ id: 1 }]] : database(sql, args),
          async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
      } }) };
      if (name === "./test-data-quarantine") return require("../test-data-quarantine");
      if (name === "./public/section-snapshot") return snapshot;
      if (name === "./public/fiscal-year") return require("../public/fiscal-year");
      if (name === "./question-bank-years") return require("../question-bank-years");
      if (name === "./auth-session") return require("../auth-session");
      return require(name);
    }, __dirname: base, process: { env: {} }, console: { log() {}, error() {} },
  });
  return async (route, body = {}, params = { id: "1" }, query = {}) => {
    const response = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
    await routes.get(route)({ body, params, query }, response);
    return response;
  };
}
test("syntax: server, external scripts and inline scripts (compile only)", () => {
  new vm.Script(fs.readFileSync(path.join(base, "server.js"), "utf8"));
  for (const file of fs.readdirSync(path.join(base, "public"))) {
    if (!/\.(js|html)$/.test(file)) continue;
    const text = fs.readFileSync(path.join(base, "public", file), "utf8");
    if (file.endsWith(".js")) new vm.Script(text, { filename: file });
    else for (const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      new vm.Script(match[1], { filename: file });
    }
  }
});
test("legacy fallback preserves false and original prompts, without Admin lookup", () => {
  const result = snapshot.attach({ section1_enabled: false, suggestion_prompt: "Old prompt" });
  assert.equal(result.sections.respondent_info.enabled, false);
  assert.equal(result.sections.suggestions.title, "Old prompt");
  assert.equal(result.sections.rating_questions.description, "");
  assert.equal(result.section2_enabled, true);
});
test("snapshot survives rename and serializing Copy; identity mismatch is rejected", () => {
  const form = snapshot.attach({}, snapshot.fromAdmin(admin));
  const copied = JSON.parse(JSON.stringify(form));
  assert.deepEqual(snapshot.attach(copied), form);
  assert.equal(form.sections.rating_questions.title, "Renamed 1");
  copied.sections.rating_questions.section_key = "suggestions";
  assert.throws(() => snapshot.normalize(copied), /identity/);
});
test("Create API snapshots current Admin for legacy request; Copy preserves explicit snapshot", async () => {
  let written;
  const call = server(async (sql, values) => {
    if (sql.includes("FROM survey_sections")) return [admin];
    if (sql.includes("INSERT INTO survey_forms")) { written = JSON.parse(values.at(-1)); return [{ insertId: 10 }]; }
    throw Error(sql);
  });
  assert.equal((await call("post /api/forms", { form: { section1_enabled: false, start_date: "2026-10-01", fiscal_year: 2570 } })).code, 200);
  assert.equal(written.sections.respondent_info.title, "Renamed 0");
  assert.equal(written.sections.respondent_info.enabled, false);
  const copy = snapshot.attach({ start_date: "2026-10-01", fiscal_year: 2570 }, snapshot.fromAdmin(admin));
  copy.sections.rating_questions.title = "Original snapshot";
  await call("post /api/forms", { form: copy });
  assert.equal(written.sections.rating_questions.title, "Original snapshot");
});
test("Edit API preserves stored metadata and question IDs, including old client", async () => {
  const original = snapshot.attach({}, snapshot.fromAdmin(admin));
  let written;
  const call = server(async (sql, values) => {
    if (sql.includes("FROM survey_forms")) return [[{ id: 1, created_by_username: "staff", form_json: JSON.stringify(original) }]];
    if (sql.includes("COUNT(*)")) return [[{ total: 2 }]];
    if (sql.includes("UPDATE survey_forms")) { written = JSON.parse(values.at(-2)); return [{}]; }
    throw Error(sql);
  });
  const form = { start_date: "2026-10-01", fiscal_year: 2570, section2_enabled: false, section2_models: [{ questions: [{ questionId: "q_original", questionBankId: 42 }] }] };
  const body = { username: "staff", form };
  assert.equal((await call("put /api/forms/:id", body)).code, 409);
  assert.equal((await call("put /api/forms/:id", { ...body, confirm_existing_responses: true })).code, 200);
  assert.equal(written.sections.rating_questions.title, "Renamed 1");
  assert.equal(written.sections.rating_questions.enabled, false);
  assert.deepEqual(written.section2_models, form.section2_models);
});
test("Admin rename leaves identity untouched; immutable key requests and system deletion blocked", async () => {
  let update;
  const call = server(async (sql, values) => {
    if (sql.includes("SELECT section_key")) return [[admin[0]]];
    update = { sql, values }; return [{}];
  });
  assert.equal((await call("put /api/survey-sections/:id", { title: "Anything", description: "Changed", is_active: true })).code, 200);
  assert.ok(!update.sql.includes("section_key"));
  assert.equal((await call("put /api/survey-sections/:id", { section_key: "other" })).code, 400);
  assert.equal((await call("delete /api/survey-sections/:id")).code, 400);
});
test("structure API finds rating by key even after complete rename", async () => {
  const call = server(async (sql, values) => {
    if (sql.includes("FROM survey_sections")) return [admin];
    if (sql.includes("FROM survey_question_categories")) { return [[]]; }
    if (sql.includes("FROM survey_question_groups")) return [[]];
    if (sql.includes("FROM question_bank")) return [[]];
    throw Error(sql);
  });
  const result = await call("get /api/survey-structure/form");
  assert.equal(result.value.section.id, 2);
  assert.equal(result.value.sections.length, 5);
});

test("Builder addQuestion preserves Edit identity and regenerates Copy identity", () => {
  const html = fs.readFileSync(path.join(base, "public/from.html"), "utf8");
  const code = html.slice(html.indexOf("function addQuestion("), html.indexOf("function bindSubgroup("));
  for (const pageMode of ["edit", "copy"]) {
    const input = { setAttribute() {} };
    const row = { dataset: {}, querySelector: selector => selector === ".dim-question" ? input : { style: {} } };
    const context = {
      pageMode, normalizeQuestionItem: value => value, createQuestionId: () => "q_new",
      document: { getElementById: () => ({ content: { cloneNode: () => ({ querySelector: () => row }) } }) },
      bindQuestionRow() {}, renumberStack() {}, refreshQuestionSuggestions() {},
    };
    vm.createContext(context);
    vm.runInContext(code, context);
    context.addQuestion({ appendChild() {} }, { questionId: "q_old", questionBankId: 42, text: "Question" });
    assert.equal(row.dataset.questionId, pageMode === "copy" ? "q_new" : "q_old");
    assert.equal(row.dataset.questionBankId, "42");
  }
});

test("Preview/Builder renderer uses keys and treats title/description as plain text", () => {
  const rendered = {};
  const document = {
    querySelector(selector) { return rendered[selector.match(/data-section-key="([^"]+)"/)?.[1]] || null; },
    createElement() { return { style: {}, setAttribute() {} }; },
  };
  for (const [key] of snapshot.definitions) {
    const section = { dataset: {}, title: {}, description: null };
    section.title.after = node => { section.description = node; };
    section.querySelector = selector => selector === "[data-section-description]" ? section.description : section.title;
    rendered[key] = section;
  }
  const sections = snapshot.fromAdmin(admin);
  sections.rating_questions.title = "<img src=x>";
  sections.rating_questions.description = "Line 1\nLine 2";
  snapshot.render(document, sections);
  assert.equal(rendered.rating_questions.title.textContent, "<img src=x>");
  assert.equal(rendered.rating_questions.description.textContent, "Line 1\nLine 2");
  assert.equal(rendered.rating_questions.title.innerHTML, undefined);
});

test("Submission preserves answers with verified year metadata; Result and dashboards aggregate legacy/new answers", async () => {
  const payload = { fiscal_year: 2569, profile: { fullname: "Tester" }, ratings: [
    { questionId: "q_same", questionBankId: 42, questionText: "Question", modelTitle: "Model", groupTitle: "Group", value: 4 },
  ], suggestion: "Feedback" };
  const submissions = [4, 2].map((score, index) => ({
    id: index + 1, form_id: 1, form_title: "Form", created_at: "2026-09-01", uni_strategy: "A", center_strategy: "B",
    payload_json: JSON.stringify({ ...payload, ratings: [{ ...payload.ratings[0], value: score }] }),
  }));
  let inserted;
  const call = server(async (sql, values) => {
    if (sql.includes("INSERT INTO submissions")) { inserted = JSON.parse(values[3]); return [{ insertId: 1 }]; }
    if (sql.includes("FROM submissions")) return [submissions];
    if (sql.includes("FROM survey_forms")) return [[{ id: 1, form_title: "Form", start_date: "2026-09-01", fiscal_year: 2569, form_json: JSON.stringify({ start_date: "2026-09-01", fiscal_year: 2569 }) }]];
    if (sql.includes("FROM question_bank")) return [[]];
    throw Error(sql);
  });
  assert.equal((await call("post /api/submissions", { form_id: 1, payload })).code, 200);
  assert.deepEqual(inserted, { ...payload, fiscal_year_source: "form_start_date" });
  const result = await call("get /api/forms/:id/results");
  assert.equal(result.code, 200);
  assert.equal(result.value.question_scores[0].question_id, "q_same");
  assert.equal(result.value.average_score, 3);
  const dashboard = await call("get /api/dashboard/summary", {}, {}, { role: "public" });
  assert.equal(dashboard.code, 200);
  assert.equal(dashboard.value.table[0].count, 2);
  assert.equal(dashboard.value.table[0].avg, 3);
  const strategy = await call("get /api/strategy-dashboard/summary", {}, {}, { role: "public" });
  assert.equal(strategy.code, 200);
  assert.equal(strategy.value.kpi.avgSatisfaction, 3);
  // The same old data without question IDs must still aggregate via legacy text.
  for (const row of submissions) {
    const legacy = JSON.parse(row.payload_json);
    delete legacy.ratings[0].questionId;
    row.payload_json = JSON.stringify(legacy);
  }
  const legacyResult = await call("get /api/forms/:id/results");
  assert.equal(legacyResult.value.average_score, 3);
  assert.equal(legacyResult.value.question_scores.length, 1);
});
