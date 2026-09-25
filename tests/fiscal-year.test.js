const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fiscal = require('../public/fiscal-year');
const snapshot = require('../public/section-snapshot');

function server(execute) {
  const routes = new Map(), app = { use() {}, listen() {} };
  for (const method of ['get', 'post', 'put', 'delete']) app[method] = (url, fn) => routes.set(method + ' ' + url, fn);
  const express = Object.assign(() => app, { json() {}, static() {} });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), {
    require(name) {
      if (name === 'dotenv') return { config() {} };
      if (name === 'express') return express;
      if (name === 'cors') return () => {};
      if (name === 'mysql2/promise') return { createPool: () => ({ execute, async getConnection() {
        return { execute: async (sql, args) => sql.includes('question_bank_write_lock') ? [[{ id: 1 }]] : execute(sql, args),
          async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
      } }) };
      if (name.startsWith('./')) return require('../' + name.slice(2));
      return require(name);
    }, __dirname: path.join(__dirname, '..'), process: { env: {} }, console: { log() {}, error() {} },
  });
  return async (route, body = {}, query = {}) => {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    await routes.get(route)({ body, params: { id: 1 }, query }, res);
    return res;
  };
}

test('Thai fiscal year boundary is date-only; malformed dates rejected', () => {
  assert.equal(fiscal.fromStartDate('2026-09-30'), 2569);
  assert.equal(fiscal.fromStartDate('2026-10-01'), 2570);
  assert.equal(fiscal.fromStartDate('2027-09-30'), 2570);
  for (const date of ['', '2026-02-30', '2026-13-01', '2026-10-01T00:00:00Z']) assert.throws(() => fiscal.fromStartDate(date));
});
test('selected year must match start date; Legacy missing year derives from explicit date only', () => {
  assert.throws(() => fiscal.resolve({ start_date: '2026-10-01', fiscal_year: 2571 }), /ไม่ตรง/);
  assert.equal(fiscal.resolve({ start_date: '2026-10-01' }).fiscal_year, 2570);
  assert.throws(() => fiscal.resolve({ fiscal_year: 2570 }), /ไม่มีวันที่/);
  assert.throws(() => fiscal.resolve({ start_date: '2026-10-01', fiscal_year: 2570 }, { fiscal_year: 2569 }), /ไม่ตรง/);
  assert.throws(() => fiscal.resolve({ start_date: '2026-10-01' }, {}, true), /กรุณาระบุปี/);
});
test('Submission ignores client year 2571 and snapshots verified Form year 2570; no old rows updated', async () => {
  const form = { start_date: '2026-10-01', fiscal_year: 2570 };
  const old = { fiscal_year: 2569, ratings: [{ questionId: 'q1', value: 4 }] };
  const before = JSON.stringify(old), writes = [];
  const call = server(async (sql, params) => {
    if (sql.includes('FROM survey_forms')) return [[{ ...form, form_json: JSON.stringify(form) }]];
    assert.match(sql, /^INSERT INTO submissions/);
    writes.push(JSON.parse(params[3])); return [{ insertId: 2 }];
  });
  const payload = { ...old, fiscal_year: 2571, fiscal_year_source: 'browser' };
  const response = await call('post /api/submissions', { form_id: 1, payload });
  assert.equal(response.code, 200);
  assert.equal(writes[0].fiscal_year, 2570);
  assert.equal(writes[0].fiscal_year_source, 'form_start_date');
  assert.deepEqual(writes[0].ratings, old.ratings);
  assert.equal(payload.fiscal_year, 2571);
  assert.equal(JSON.stringify(old), before);
});
test('Submission blocks missing/conflicting Form metadata without writes', async () => {
  for (const form of [{ question_bank_fiscal_year: 2570 }, { start_date: '2026-10-01', fiscal_year: 2569 }]) {
    const call = server(async sql => {
      assert.ok(sql.includes('FROM survey_forms'));
      return [[{ form_json: JSON.stringify(form) }]];
    });
    assert.equal((await call('post /api/submissions', { form_id: 1, payload: { fiscal_year: 2570 } })).code, 409);
  }
});
test('Create/Copy and Edit API reject inconsistent year without persisting Form', async () => {
  const original = snapshot.attach({ start_date: '2026-10-01', fiscal_year: 2570 });
  const call = server(async sql => {
    if (sql.includes('FROM survey_forms')) return [[{ id: 1, created_by_username: 'staff', form_json: JSON.stringify(original) }]];
    if (sql.includes('COUNT(*)')) return [[{ total: 0 }]];
    throw Error('Unexpected write: ' + sql);
  });
  for (const route of ['post /api/forms', 'put /api/forms/:id']) {
    const form = { ...original, fiscal_year: 2571 };
    const result = await call(route, { username: 'staff', form });
    assert.equal(result.code, 409);
    assert.match(result.data.error, /ไม่ตรง/);
  }
});

test('Legacy missing-date submissions use server Thai calendar year, including October and New Year', () => {
  const legacy = { start_date: '', fiscal_year: 2560 };
  assert.equal(fiscal.resolveSubmission(legacy, {}, new Date('2026-10-01T00:00:00Z')).fiscal_year, 2569);
  assert.equal(fiscal.resolveSubmission(legacy, {}, new Date('2026-12-31T17:00:00Z')).fiscal_year, 2570);
  assert.equal(fiscal.resolveSubmission(legacy).fiscal_year_source, 'legacy_calendar_year');
  for (const marker of [null, 2570]) {
    assert.throws(() => fiscal.resolveSubmission({ ...legacy, question_bank_fiscal_year: marker }), /ไม่มีวันที่/);
  }
  assert.throws(() => fiscal.resolveSubmission({ start_date: 'bad' }), /วันที่/);
  assert.throws(() => fiscal.resolve(legacy, {}, true), /ไม่มีวันที่/);
});

for (const id of [76, 77, 86]) test(`Legacy Form ${id} displays without fiscal error and accepts anonymous answers without modifying history`, async () => {
  const form = { form_title: `Legacy ${id}`, start_date: '', fiscal_year: 2560,
    section2_models: [{ dimensions: [{ questions: [{ questionId: 'old-q', questionBankId: 113, text: 'Original' }] }] }] };
  const stored = { id, start_date: null, fiscal_year: 2560, form_json: JSON.stringify(form) };
  const before = JSON.stringify(stored), writes = [];
  const call = server(async (sql, params) => {
    if (sql.includes('FROM survey_forms')) return [[stored]];
    assert.match(sql.trim(), /^INSERT INTO submissions/);
    writes.push(params); return [{ insertId: 142 }];
  });
  const displayed = await call('get /api/forms/:id');
  assert.equal(displayed.code, 200);
  assert.equal(displayed.data.fiscal_year_error, null);
  assert.equal(JSON.stringify(displayed.data.form), JSON.stringify(form));
  const payload = { fiscal_year: 9999, fiscal_year_source: 'form_start_date', start_date: '2099-01-01',
    ratings: [{ questionId: 'old-q', questionBankId: 113, value: 4 }] };
  const sent = await call('post /api/submissions', { form_id: id, payload });
  assert.equal(sent.code, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], id);
  const saved = JSON.parse(writes[0][3]);
  assert.equal(saved.fiscal_year, fiscal.resolveSubmission(form).fiscal_year);
  assert.equal(saved.fiscal_year_source, 'legacy_calendar_year');
  assert.deepEqual(saved.ratings, payload.ratings);
  assert.equal(JSON.stringify(stored), before);
});

test('Browser cannot request Legacy fallback for a stored modern form without dates', async () => {
  const call = server(async sql => {
    assert.match(sql, /FROM survey_forms/);
    return [[{ form_json: JSON.stringify({ question_bank_fiscal_year: 2570 }) }]];
  });
  const res = await call('post /api/submissions', { form_id: 1,
    payload: { fiscal_year: 2569, fiscal_year_source: 'legacy_calendar_year' } });
  assert.equal(res.code, 409);
});

test('Form year 2570 and bank source 2569 are separate identities', async () => {
  const bank = require('../question-bank-years');
  const form = { start_date: '2026-10-01', fiscal_year: 2570, question_bank_fiscal_year: 2569, section2_models: [] };
  assert.equal(fiscal.resolve(form).fiscal_year, 2570);
  await bank.validateForm({ async execute(sql, params) {
    assert.deepEqual(params, [2569]);
    return [[{ fiscal_year: 2569 }]];
  } }, form);
});

test('Numeric Submission years filter Dashboard/Public/Strategy consistently; Result keeps mixed years', async () => {
  const rows = [2, 4, 5].map((value, i) => ({
    id: i + 1, form_id: 1, form_title: 'Form', created_at: '2028-05-01',
    uni_strategy: 'A', center_strategy: 'B', payload_json: JSON.stringify({
      fiscal_year: i === 2 ? 2569 : 2570,
      ...(i === 2 ? {} : { fiscal_year_source: 'form_start_date' }),
      ratings: [{ questionId: 'q1', questionBankId: 10, questionText: 'Question', modelTitle: 'Model', groupTitle: 'Group', value }],
    }),
  }));
  const before = JSON.stringify(rows);
  const call = server(async sql => {
    if (sql.includes('FROM submissions')) return [rows];
    if (sql.includes('FROM survey_forms')) return [[{ id: 1, form_title: 'Form' }]];
    if (sql.includes('FROM question_bank')) return [[]];
    throw Error(sql);
  });
  for (const role of ['admin', 'public']) {
    const dashboard = await call('get /api/dashboard/summary', {}, { role, fiscal_years: '2570' });
    assert.equal(dashboard.code, 200);
    assert.equal(dashboard.data.kpi.respondents, 2);
    assert.equal(dashboard.data.table.length, 1);
    assert.equal(dashboard.data.table[0].question_id, 'q1');
    assert.equal(dashboard.data.table[0].count, 2);
    assert.equal(dashboard.data.table[0].avg, 3);
    assert.equal(dashboard.data.table[0].sd, 1.41); // Existing sample S.D. (n - 1).
    const strategy = await call('get /api/strategy-dashboard/summary', {}, { role, fiscal_years: '2570' });
    assert.equal(strategy.code, 200);
    assert.equal(strategy.data.kpi.respondents, 2);
    assert.equal(strategy.data.kpi.avgSatisfaction, 3);
    const old = await call('get /api/dashboard/summary', {}, { role, fiscal_years: '2569' });
    assert.equal(old.data.kpi.respondents, 1);
    assert.equal(old.data.kpi.avgSatisfaction, 5);
  }
  const result = await call('get /api/forms/:id/results');
  assert.equal(result.data.question_scores[0].question_id, 'q1');
  assert.equal(result.data.question_scores[0].count, 3);
  assert.equal(result.data.question_scores[0].average, 3.67);
  assert.equal(JSON.stringify(rows), before);
});

for (const scenario of [
  { name: 'Legacy valid year', payload: { fiscal_year: 2569 }, dashboard: [2569], options: [2569], strategy: 2569 },
  { name: 'Legacy missing year', payload: {}, dashboard: [], options: [2571], strategy: 2571 },
  { name: 'Legacy malformed year', payload: { fiscal_year: 'invalid' }, dashboard: [], options: [2571], strategy: 2571 },
  { name: 'Legacy descriptive year', payload: { fiscal_year: 'ปีงบประมาณ 2569' }, dashboard: [], options: [2571], strategy: 2569 },
  { name: 'New snapshot year', payload: { fiscal_year: 2570, fiscal_year_source: 'form_start_date' }, dashboard: [2570], options: [2570], strategy: 2570 },
  { name: 'New corrupt snapshot never uses Legacy date fallback', payload: { fiscal_year: 'invalid', fiscal_year_source: 'form_start_date' }, dashboard: [], options: [], strategy: null },
]) test(scenario.name + ': preserves approved options/filter policy in each report', async () => {
  const rows = [2, 4].map((value, i) => ({
    id: i + 1, form_id: 1, form_title: 'Form', created_at: '2028-05-01',
    uni_strategy: 'A', center_strategy: 'B',
    payload_json: JSON.stringify({ ...scenario.payload,
      ratings: [{ questionId: 'q1', questionBankId: 10, questionText: 'Question', modelTitle: 'Model', groupTitle: 'Group', value }],
    }),
  }));
  const before = JSON.stringify(rows);
  const call = server(async sql => {
    assert.match(sql.trim(), /^SELECT/); // All report requests must be read-only.
    if (sql.includes('FROM submissions')) return [rows];
    if (sql.includes('SELECT DISTINCT fiscal_year')) return [[]];
    if (sql.includes('FROM survey_forms')) return [[{ id: 1, form_title: 'Form', uni_strategy: 'A', center_strategy: 'B' }]];
    if (sql.includes('FROM question_bank')) return [[]];
    throw Error(sql);
  });
  for (const role of ['admin', 'public']) {
    const dashboardOptions = await call('get /api/dashboard/options', {}, { role });
    assert.equal(dashboardOptions.code, 200);
    assert.deepEqual(Array.from(dashboardOptions.data.fiscalYears), scenario.dashboard);
    const strategyOptions = await call('get /api/strategy-dashboard/options', {}, { role });
    assert.equal(strategyOptions.code, 200);
    assert.deepEqual(Array.from(strategyOptions.data.fiscalYears), scenario.options);
    for (const year of [2569, 2570, 2571]) {
      const dashboard = await call('get /api/dashboard/summary', {}, { role, fiscal_years: String(year) });
      assert.equal(dashboard.code, 200);
      assert.equal(dashboard.data.kpi.respondents, scenario.dashboard.includes(year) ? 2 : 0);
      const strategy = await call('get /api/strategy-dashboard/summary', {}, { role, fiscal_years: String(year) });
      assert.equal(strategy.code, 200);
      assert.equal(strategy.data.kpi.respondents, scenario.strategy === year ? 2 : 0);
    }
    // Same answers, no year filter: scores/identity must stay exactly as before.
    const all = await call('get /api/dashboard/summary', {}, { role });
    assert.equal(all.data.kpi.respondents, 2);
    assert.equal(all.data.table.length, 1);
    assert.equal(all.data.table[0].question_id, 'q1');
    assert.equal(all.data.table[0].count, 2);
    assert.equal(all.data.table[0].avg, 3);
    assert.equal(all.data.table[0].sd, 1.41);
    const allStrategy = await call('get /api/strategy-dashboard/summary', {}, { role });
    assert.equal(allStrategy.data.kpi.respondents, 2);
    assert.equal(allStrategy.data.kpi.avgSatisfaction, 3);
  }
  const result = await call('get /api/forms/:id/results');
  assert.equal(result.data.question_scores[0].count, 2);
  assert.equal(result.data.question_scores[0].average, 3);
  assert.equal(JSON.stringify(rows), before);
});
