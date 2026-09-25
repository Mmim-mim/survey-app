// Explicit integration command only. No dotenv; fixed loopback endpoint, never Aiven.
const mysql = require('mysql2/promise'), fs = require('fs'), vm = require('vm');
const path = require('path'), cp = require('child_process'), assert = require('assert/strict');
const bank = require('../question-bank-years'), quarantine = require('../test-data-quarantine');
const snapshot = require('../public/section-snapshot');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const config = { host: '127.0.0.1', port: 33308, user: 'root', dateStrings: true };
  const control = await mysql.createConnection(config);
  let pool;
  try {
    const [[identity]] = await control.query('SELECT @@port port, VERSION() version');
    assert.equal(identity.port, 33308); assert.match(identity.version, /^8\.0\./);
    const database = 'survey_quarantine_test_' + Date.now();
    await control.query('CREATE DATABASE ' + database);
    const restored = cp.spawnSync('D:/Project mfu/mysql8-test/mysql-8.0.45-winx64/bin/mysql.exe',
      ['--no-defaults', '--host=127.0.0.1', '--port=33308', '--user=root', database],
      { input: fs.readFileSync('D:/Project mfu/backups/survey-precleanup-20260924/survey_app.sql'), encoding: 'utf8', windowsHide: true });
    assert.equal(restored.status, 0, 'Restore must succeed before any test');
    pool = mysql.createPool({ ...config, database, connectionLimit: 8 });
    const originalForms = (await pool.query('SELECT * FROM survey_forms WHERE id<>114 ORDER BY id'))[0];
    const originalSubmissions = (await pool.query('SELECT * FROM submissions ORDER BY id'))[0];
    const legacy = {};
    for (const table of ['question_bank','survey_question_groups','survey_question_categories'])
      legacy[table] = (await pool.query('SELECT * FROM '+table+' WHERE fiscal_year IS NULL ORDER BY id'))[0];
    const routes = new Map(), middlewares = [];
    const app = { use(prefix, fn) { if (prefix === '/api') middlewares.push(fn); }, listen() {} };
    for (const method of ['get', 'post', 'put', 'delete']) app[method] = (url, fn) => routes.set(method.toUpperCase() + ' ' + url, fn);
    const express = Object.assign(() => app, { json() {}, static() {} });
    vm.runInNewContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), {
      require(name) {
        if (name === 'dotenv') return { config() {} };
        if (name === 'express') return express;
        if (name === 'cors') return () => {};
        if (name === 'mysql2/promise') return { createPool: () => pool };
        return name.startsWith('./') ? require(path.join(root, name)) : require(name);
      }, __dirname: root, process: { env: {} }, console: { log() {}, error() {} },
    });
    async function call(route, { body = {}, query = {}, id = 1, cookie = '', csrf } = {}) {
      const [method, url] = route.split(' ');
      const req = { method, path: url.slice(4).replace(':id', String(id)), params: { id: String(id) }, body, query,
        headers: { host: 'test.local', origin: 'http://test.local', cookie, ...(csrf ? { 'x-survey-csrf': csrf } : {}) } };
      const res = { code: 200, status(n) { this.code = n; return this; }, json(data) { this.data = data; }, set() {},
        cookie(k, v) { this.cookie = k + '=' + v; }, clearCookie() {} };
      async function run(i) { if (i === middlewares.length) return routes.get(route)(req, res);
        let next; await middlewares[i](req, res, () => { next = run(i + 1); }); if (next) await next; }
      await run(0); return res;
    }
    // Use existing test-restored accounts, never production credentials or a real login.
    const [users] = await pool.query('SELECT username,password,role FROM users');
    async function login(role) { const user = users.find(u => u.role === role); assert(user);
      const res = await call('POST /api/login', { body: { username: user.username, password: user.password } });
      assert.equal(res.code, 200); const session = await call('GET /api/session', { cookie: res.cookie });
      assert.equal(session.code, 200); return { cookie: res.cookie, csrf: session.data.csrfToken }; }
    const admin = await login('admin'), staff = await login('staff');
    assert.equal((await call('GET /api/admin/questions', { query: { fiscal_year: 2570 } })).code, 401);
    assert.equal((await call('GET /api/admin/questions', { ...staff, query: { fiscal_year: 2570 } })).code, 403);
    assert.equal((await call('POST /api/admin/question-bank/years', { cookie: admin.cookie, body: { fiscal_year: 2572 } })).code, 403);
    for (const year of [2570, 2571]) {
      for (const route of ['GET /api/question-bank/active', 'GET /api/survey-structure/form', 'GET /api/admin/questions', 'GET /api/admin/question-options'])
        assert.equal((await call(route, { ...admin, query: { fiscal_year: year } })).code, 409, route);
      assert.equal((await call('POST /api/admin/questions', { ...admin, body: { fiscal_year: year, question_text: 'blocked' } })).code, 409);
      assert.equal((await call('PUT /api/admin/questions/:id', { ...admin, id: 175, body: { fiscal_year: year } })).code, 409);
    }
    assert.equal((await call('GET /api/question-bank/years')).data.length, 0);
    assert.equal((await call('POST /api/admin/question-bank/years', { ...admin, body: { fiscal_year: 2572 } })).code, 409);
    assert.equal((await call('POST /api/submissions', { body: { form_id: 114, payload: {} } })).code, 409);
    assert.equal((await call('POST /api/submissions', { body: { form_id: 76, payload: { ratings: [{ questionBankId: 175 }] } } })).code, 409);
    const base = snapshot.attach({ start_date: '2026-10-01', fiscal_year: 2570, section2_models: [] });
    const create = form => call('POST /api/forms', { ...staff, body: { form } });
    assert.equal((await create({ ...base, extra: { questionBankId: 175 } })).code, 409);
    const copied = (await pool.query('SELECT form_json FROM survey_forms WHERE id=114'))[0][0];
    assert.equal((await create(JSON.parse(copied.form_json))).code, 409);
    const created = await create(base); assert.equal(created.code, 200); const formId = created.data.id;
    assert.equal((await call('PUT /api/forms/:id', { ...staff, id: formId, body: { form: { ...base, extra: { datalist_id: 'group_21_suggestions' } } } })).code, 409);
    assert.equal((await call('PUT /api/forms/:id', { ...staff, id: formId, body: { form: base } })).code, 200);
    // Cleanup owns the global lock; legitimate responses must not wait for it.
    const cleanup = await pool.getConnection(); await cleanup.beginTransaction();
    await cleanup.execute('SELECT id FROM question_bank_write_lock WHERE id=1 FOR UPDATE');
    let saved = false; const waiting = create(base).then(r => { saved = true; return r; });
    await delay(100); assert.equal(saved, false);
    for (const id of [76, 77, 86, formId]) {
      const result = await Promise.race([call('POST /api/submissions', { body: { form_id: id, payload: { fiscal_year: 9999, ratings: [] } } }), delay(3000).then(() => { throw Error('Real submission blocked by cleanup lock'); })]);
      assert.equal(result.code, 200, 'Legacy/real submission');
    }
    for (const [table,where] of [['survey_forms','id=114'],['question_bank','fiscal_year IN (2570,2571)'],['survey_question_groups','fiscal_year IN (2570,2571)'],['survey_question_categories','fiscal_year IN (2570,2571)'],['question_bank_years','fiscal_year IN (2570,2571)']])
      await cleanup.query('DELETE FROM '+table+' WHERE '+where);
    await cleanup.commit(); cleanup.release(); assert.equal((await waiting).code, 200);
    // Opposite ordering: a writer holding the lock prevents Cleanup from passing it.
    let unblock, entered; const enteredPromise = new Promise(r => { entered = r; });
    const paused = new Promise(r => { unblock = r; });
    const writer = quarantine.formWriter(pool, async (_, res) => { entered(); await paused; res.json({ ok: true }); });
    const writing = writer({ body: { form: base } }, { status() { return this; }, json() {} }); await enteredPromise;
    const cleaner = await pool.getConnection(); await cleaner.beginTransaction(); let acquired = false;
    const lock = cleaner.execute('SELECT id FROM question_bank_write_lock WHERE id=1 FOR UPDATE').then(() => { acquired = true; });
    await delay(100); assert.equal(acquired, false); unblock(); await writing; await lock; await cleaner.rollback(); cleaner.release();
    const clone = await call('POST /api/admin/question-bank/years', { ...admin, body: { fiscal_year: 2570 } });
    assert.equal(clone.code, 200); assert.equal(clone.data.source_fiscal_year, null);
    assert.deepEqual(clone.data.counts, { categories: 5, groups: 20, questions: 58 });
    const set = await bank.readSet(pool, 2570); assert(set.questions.every(q => q.id > 288));
    assert.equal((await call('GET /api/question-bank/years')).data.length, 1);
    const newForm = { ...base, question_bank_fiscal_year: 2570, section2_models: [{ dimensions: [{ bankGroupId: set.groups[0].id, questions: [{ questionId: 'new-q', questionBankId: set.questions[0].id, text: 'Snapshot' }] }] }] };
    assert.equal((await create(newForm)).code, 200);
    assert.equal((await create({ ...base, extra: { questionBankId: 175 } })).code, 409);
    assert.equal((await call('POST /api/logout', admin)).code, 200);
    assert.equal((await call('GET /api/session', admin)).code, 401);
    for (const row of originalForms) assert.deepEqual((await pool.execute('SELECT * FROM survey_forms WHERE id=?',[row.id]))[0][0], row);
    for (const row of originalSubmissions) assert.deepEqual((await pool.execute('SELECT * FROM submissions WHERE id=?',[row.id]))[0][0], row);
    for (const table of Object.keys(legacy)) assert.deepEqual((await pool.query('SELECT * FROM '+table+' WHERE fiscal_year IS NULL ORDER BY id'))[0], legacy[table]);
    console.log(JSON.stringify({ passed: true, database, version: identity.version,
      coverage: 'Quarantine APIs, stale IDs, Create/Edit/Copy, CSRF/roles/login/logout, both lock orderings, concurrent real/Legacy submissions, fresh Clone IDs' }));
  } finally { if (pool) await pool.end(); await control.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
