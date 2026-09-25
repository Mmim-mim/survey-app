const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createAuth } = require('../auth-session');

// Execute real server routes AND auth middleware with a SQL fake. No sockets or database.
function setup() {
  const users = ['staff', 'manager', 'admin'].map((role, i) => ({ id: i + 1, username: role,
    password: 'fixture-password', display_name: role, role, dept_name: 'Fixture' }));
  let clock = 1000, writes = 0;
  let form = { id: 1, created_by_username: 'staff', form_json: '{}' };
  const sqlCalls = [], routes = new Map(), middleware = [];
  const pool = { async execute(sql, args = []) {
    sqlCalls.push(sql);
    if (sql.includes('FROM users')) {
      const user = users.find(u => sql.includes('WHERE username') ? u.username === args[0] : u.id === args[0]);
      return [user ? [{ ...user }] : []];
    }
    if (sql.includes('FOR UPDATE')) return [[{ id: 1 }]];
    if (sql.includes('FROM survey_forms')) return [form ? [{ ...form }] : []];
    if (/^\s*(INSERT|UPDATE|DELETE)/.test(sql)) { writes++; return [{ insertId: 99, affectedRows: 1 }]; }
    return [[]];
  }, async getConnection() { return { execute: pool.execute, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} }; } };
  const app = { use(prefix, fn) { if (prefix === '/api') middleware.push(fn); }, listen() {} };
  for (const method of ['get', 'post', 'put', 'delete']) app[method] = (url, handler) => routes.set(method.toUpperCase() + ' ' + url, handler);
  const express = Object.assign(() => app, { json() {}, static() {} });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), {
    require(name) {
      if (name === 'express') return express;
      if (name === 'cors') return () => {};
      if (name === 'dotenv') return { config() {} };
      if (name === 'mysql2/promise') return { createPool: () => pool };
      if (name === './auth-session') return { createAuth: (db, options) => createAuth(db, { ...options, now: () => clock, ttl: 1000 }) };
      return name.startsWith('./') ? require('../' + name.slice(2)) : require(name);
    }, __dirname: path.join(__dirname, '..'), process: { env: { NODE_ENV: 'production' } }, console: { log() {}, error() {} },
  });
  async function call(route, { cookie = '', csrf, body = {}, query = {}, origin = 'https://test.local', requestPath } = {}) {
    const [method, fullPath] = route.split(' ');
    const req = { method, path: requestPath || fullPath.slice(4).replace(':id', '1'), params: { id: '1' },
      headers: { host: 'test.local', origin, cookie, ...(csrf ? { 'x-survey-csrf': csrf } : {}) }, body: { ...body }, query: { ...query } };
    const res = { code: 200, headers: {}, status(n) { this.code = n; return this; },
      json(data) { this.data = data; }, set(k, v) { this.headers[k] = v; },
      cookie(k, v, options) { this.cookieValue = k + '=' + v; this.cookieOptions = options; },
      clearCookie(k, options) { this.cleared = k; this.cookieOptions = options; } };
    async function run(index) {
      if (index === middleware.length) return routes.get(route)(req, res);
      let next;
      await middleware[index](req, res, () => { next = run(index + 1); });
      if (next) await next;
    }
    await run(0);
    return res;
  }
  async function login(role) {
    const result = await call('POST /api/login', { body: { username: role, password: 'fixture-password' } });
    assert.equal(result.code, 200);
    const current = await call('GET /api/session', { cookie: result.cookieValue });
    return { cookie: result.cookieValue, csrf: current.data.csrfToken, result };
  }
  return { call, login, users, sqlCalls, writes: () => writes, expire: () => { clock += 1001; },
    setForm(value) { form = value; } };
}

test('Login keeps JSON contract, rejects bad password, issues secure HttpOnly cookie and rotates session', async () => {
  const env = setup();
  const bad = await env.call('POST /api/login', { body: { username: 'admin', password: 'wrong' } });
  assert.equal(bad.code, 401); assert.equal(bad.cookieValue, undefined);
  const a = await env.login('admin');
  assert.deepEqual(Object.keys(a.result.data).sort(), ['ok', 'user']);
  assert.equal(a.result.data.user.password, undefined);
  assert.equal(a.result.cookieOptions.httpOnly, true);
  assert.equal(a.result.cookieOptions.secure, true);
  assert.equal(a.result.cookieOptions.sameSite, 'lax');
  const b = await env.call('POST /api/login', { cookie: a.cookie, body: { username: 'admin', password: 'fixture-password' } });
  assert.notEqual(b.cookieValue, a.cookie);
  assert.equal((await env.call('GET /api/session', a)).code, 401);
  assert.equal(env.writes(), 0);
});

const adminWrites = ['POST /api/admin/questions', 'PUT /api/admin/questions/:id', 'DELETE /api/admin/questions/:id',
  'POST /api/admin/question-bank/years', 'POST /api/survey-sections', 'PUT /api/survey-sections/:id', 'DELETE /api/survey-sections/:id',
  'POST /api/survey-question-categories', 'PUT /api/survey-question-categories/:id', 'DELETE /api/survey-question-categories/:id',
  'POST /api/survey-question-groups', 'PUT /api/survey-question-groups/:id', 'DELETE /api/survey-question-groups/:id',
  'POST /api/admin/users', 'PUT /api/admin/users/:id/role', 'PUT /api/admin/users/:id/dept', 'DELETE /api/admin/users/:id', 'DELETE /api/admin/forms/:id'];
for (const role of ['anonymous', 'staff', 'manager']) test(role + ' cannot forge Admin for any admin mutation or read', async () => {
  const env = setup(), credentials = role === 'anonymous' ? {} : await env.login(role);
  for (const route of [...adminWrites, 'GET /api/admin/questions', 'GET /api/admin/users', 'GET /api/admin/forms']) {
    const res = await env.call(route, { ...credentials, query: { role: 'admin', username: 'admin' }, body: { role: 'admin', username: 'admin' } });
    assert.equal(res.code, role === 'anonymous' ? 401 : 403, route);
  }
  assert.equal(env.writes(), 0);
});

test('Authenticated Admin can save Question Bank; CSRF and cross-origin requests fail before writes', async () => {
  const env = setup(), credentials = await env.login('admin');
  const body = { question_text: 'Fixture', category: 'Fixture', used_in_label: 'Fixture', datalist_id: 'fixture' };
  for (const extra of [{ csrf: '' }, { csrf: 'a'.repeat(64) }, { origin: 'https://other.local' }]) {
    assert.equal((await env.call('POST /api/admin/questions', { ...credentials, body, ...extra })).code, 403);
  }
  assert.equal(env.writes(), 0);
  assert.equal((await env.call('POST /api/admin/questions', { ...credentials, body })).code, 200);
  assert.equal(env.writes(), 1);
});

test('Logout, expiration, account removal and role withdrawal revoke access', async () => {
  const env = setup(); let a = await env.login('admin');
  assert.equal((await env.call('POST /api/logout', a)).code, 200);
  assert.equal((await env.call('GET /api/admin/questions', a)).code, 401);
  a = await env.login('admin'); env.expire();
  assert.equal((await env.call('GET /api/admin/questions', a)).code, 401);
  a = await env.login('admin'); env.users[2].role = 'staff';
  assert.equal((await env.call('GET /api/admin/questions', a)).code, 403);
  env.users.pop();
  assert.equal((await env.call('GET /api/session', a)).code, 401);
  assert.equal(env.writes(), 0);
});

test('Form mutations ignore forged owner and budget requires a session and CSRF', async () => {
  const env = setup(), manager = await env.login('manager');
  const res = await env.call('PUT /api/forms/:id', { ...manager, body: { username: 'staff', role: 'admin', form: {} } });
  assert.equal(res.code, 403);
  assert.equal((await env.call('DELETE /api/forms/:id', { ...manager, query: { username: 'staff', role: 'admin' } })).code, 403);
  assert.equal((await env.call('PUT /api/forms/:id/budget', { body: { role: 'admin', budget_spent: 1 } })).code, 401);
  assert.equal((await env.call('PUT /api/forms/:id/budget', { ...manager, csrf: '', body: { budget_spent: 1 } })).code, 403);
  assert.equal(env.writes(), 0);
});

test('Cross-origin login cannot create a session; public reads remain available', async () => {
  const env = setup();
  const result = await env.call('POST /api/login', { origin: 'https://other.local', body: { username: 'admin', password: 'fixture-password' } });
  assert.equal(result.code, 403); assert.equal(result.cookieValue, undefined);
  assert.equal((await env.call('GET /api/question-bank/years')).code, 200);
});

test('Case and trailing slash variants cannot bypass section or scoped-read authorization', async () => {
  const env = setup(), staff = await env.login('staff');
  assert.equal((await env.call('POST /api/survey-sections', { ...staff, requestPath: '/SURVEY-SECTIONS/' })).code, 403);
  assert.equal((await env.call('GET /api/forms', { requestPath: '/FORMS/', query: { role: 'admin' } })).code, 401);
  assert.equal(env.writes(), 0);
});

test('Verified Admin reaches yearly clone; restart invalidates old session', async () => {
  const env = setup(), admin = await env.login('admin');
  assert.equal((await env.call('GET /api/session', admin)).data.user.password, undefined);
  const cloned = await env.call('POST /api/admin/question-bank/years', { ...admin, body: { fiscal_year: 2570 } });
  assert.equal(cloned.code, 200);
  assert.equal(cloned.data.fiscal_year, 2570);
  assert(env.writes() > 0); // Fake SQL only.
  assert.equal((await setup().call('GET /api/admin/questions', admin)).code, 401);
});

test('Local cookie permits HTTP and default expiration is eight hours', () => {
  const auth = createAuth({}, { now: () => 0 });
  let options;
  auth.start({ headers: {} }, { cookie(_name, _value, opts) { options = opts; } }, { id: 1 });
  assert.equal(options.secure, false);
  assert.equal(options.httpOnly, true);
  assert.equal(options.maxAge, 8 * 60 * 60 * 1000);
});

test('Budget allows verified owner and Admin, rejects forged owner/role before UPDATE', async () => {
  const env = setup();
  const staff = await env.login('staff'), manager = await env.login('manager'), admin = await env.login('admin');
  const request = { budget_spent: 100, username: 'staff', role: 'admin' };
  assert.equal((await env.call('PUT /api/forms/:id/budget', { ...manager, body: request })).code, 403);
  assert.equal(env.writes(), 0);
  assert.equal((await env.call('PUT /api/forms/:id/budget', { ...staff, body: request })).code, 200);
  assert.equal((await env.call('PUT /api/forms/:id/budget', { ...admin, body: request })).code, 200);
  assert.equal(env.writes(), 2);
  env.setForm({ id: 1, created_by_username: 'manager' });
  assert.equal((await env.call('PUT /api/forms/:id/budget', { ...staff, body: { ...request, username: 'manager' } })).code, 403);
  assert.equal(env.writes(), 2);
  assert.equal((await env.call('PUT /api/forms/:id/budget', { ...manager, body: request })).code, 200);
  env.setForm(null);
  assert.equal((await env.call('PUT /api/forms/:id/budget', { ...admin, body: request })).code, 404);
  assert.equal(env.writes(), 3);
});
