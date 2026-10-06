const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/auth-client.js'), 'utf8');
function setup(page = '/admin.html', status = 401) {
  const events = {}, alerts = [], redirects = [], calls = [];
  let acknowledge;
  const storage = new Map(['role','user','isLoggedIn','displayName','dept_name','surveyDraft','copyForm','other'].map(k => [k, 'keep']));
  const location = {origin: 'http://localhost', pathname: page, href: 'http://localhost' + page, replace: x => redirects.push(x)};
  const context = {URL, Headers, Promise, location, alert: x => alerts.push(x),
    localStorage: {removeItem: k => storage.delete(k)}, document: {addEventListener: (k,f) => events[k] = f},
    window: {AdminPopup: {alert: options => {alerts.push(options); return new Promise(resolve => acknowledge = resolve);}}, fetch: async (input, options = {}) => {
      calls.push({path: new URL(input, location.href).pathname, options});
      return new Response(JSON.stringify({csrfToken: 'test', user: {role:'admin'}}), {status});
    }}};
  vm.runInNewContext(source, context);
  return {context, events, alerts, redirects, calls, storage, acknowledge: async () => {acknowledge(); await tick();}};
}
const tick = () => new Promise(r => setImmediate(r));
test('valid session retains CSRF flow', async () => {
  const s = setup('/admin.html', 200);
  await s.context.window.fetch('/api/admin/questions', {method:'POST'});
  assert.equal(s.calls[1].options.headers.get('X-Survey-CSRF'), 'test');
  assert.equal(s.redirects.length, 0);
});
test('concurrent protected 401: one alert/redirect, only auth keys cleared', async () => {
  const s = setup();
  s.context.window.fetch('/api/admin/users'); s.context.window.fetch('/api/admin/forms');
  await tick();
  assert.equal(s.alerts.length, 1);
  assert.equal(s.alerts[0].title, 'เซสชันหมดอายุ');
  assert.equal(s.alerts[0].confirmText, 'เข้าสู่ระบบ');
  assert.equal(s.alerts[0].dismissible, false);
  assert.equal(s.redirects.length, 0);
  assert.equal(s.storage.get('role'), 'keep');
  await s.acknowledge();
  assert.deepEqual(s.redirects, ['/login.html']);
  assert.deepEqual([...s.storage.keys()], ['surveyDraft','copyForm','other']);
});
test('403 and 503 do not redirect', async () => {
  for (const status of [403,503]) {
    const s = setup('/admin.html', status);
    assert.equal((await s.context.window.fetch('/api/admin/users')).status, status);
    s.events.DOMContentLoaded(); await tick();
    assert.equal(s.redirects.length, 0);
  }
});
test('anonymous pages and login retain optional auth 401', async () => {
  for (const p of ['/preview.html','/result.html','/dashboard-view.html','/login.html']) {
    const s = setup(p);
    assert.equal((await s.context.window.fetch('/api/session')).status, 401);
    assert.equal(s.events.DOMContentLoaded, undefined);
    assert.equal(s.redirects.length, 0);
  }
});
test('public endpoints and failed login are excluded', async () => {
  const s = setup();
  for (const path of ['/api/question-bank/active','/api/forms/76/results','/api/dashboard/options?role=public','/api/login']) {
    assert.equal((await s.context.window.fetch(path)).status, 401);
  }
  assert.equal(s.redirects.length, 0);
});
test('refresh verifies all protected pages including structure', async () => {
  for (const p of ['/','/index.html','/admin.html','/admin-users.html','/admin-forms.html','/admin-questions.html','/admin-structure.html','/admin-departments.html','/dashboard.html','/strategy-dashboard.html','/from.html']) {
    const s = setup(p); s.events.DOMContentLoaded(); await tick();
    assert.equal(s.redirects.length, 0, p);
    await s.acknowledge();
    assert.equal(s.redirects.length, 1, p);
  }
});
test('builder 401 preflight: no automatic write, existing draft preserved', async () => {
  const s = setup('/from.html');
  s.context.window.fetch('/api/forms/125', {method:'PUT'}); await tick();
  assert.deepEqual(s.calls.map(c => c.path), ['/api/session']);
  assert.equal(s.storage.get('surveyDraft'), 'keep');
  await s.acknowledge();
  assert.equal(s.redirects.length, 1);
});
test('logout failure uses custom error without clearing storage or redirecting', async () => {
  const s = setup('/admin.html', 503);
  const pending = s.events.click({target:{closest:()=>({id:'btnLogout'})},preventDefault(){},stopImmediatePropagation(){}});
  await tick();
  assert.equal(s.alerts.length, 1);
  assert.equal(s.alerts[0].type, 'error');
  assert.equal(s.alerts[0].title, 'ออกจากระบบไม่สำเร็จ');
  assert.equal(s.storage.get('role'), 'keep');
  assert.equal(s.redirects.length, 0);
  await s.acknowledge(); await pending;
  assert.equal(s.context.location.href, 'http://localhost/admin.html');
});
test('normal and expired logout have no expiry alert and preserve drafts', async () => {
  for (const status of [200,401]) {
    const s = setup('/admin.html', status);
    await s.events.click({target:{closest:()=>({id:'btnLogout'})},preventDefault(){},stopImmediatePropagation(){}});
    assert.equal(s.alerts.length, 0);
    assert.equal(s.context.location.href, 'login.html');
    assert.equal(s.storage.get('surveyDraft'), 'keep');
  }
});
