// Browser/client integration using intercepted HTTP only; no real server or database.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext(), calls = [], errors = [];
    // Charts are unrelated to auth; external CDN requests remain blocked.
    await context.addInitScript(() => { window.Chart = class { constructor(_ctx, config) { this.data = config.data; } update() {} destroy() {} }; });
    let loggedIn = false;
    const csrfToken = 'a'.repeat(64);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== 'http://localhost:3000') return route.abort();
      if (url.pathname.startsWith('/api/')) {
        calls.push({ path: url.pathname, method: request.method(), csrf: request.headers()['x-survey-csrf'] });
        if (url.pathname === '/api/login') {
          loggedIn = true;
          return route.fulfill({ json: { ok: true, user: { id: 1, username: 'admin', role: 'admin', display_name: 'Fixture' } },
            headers: { 'Set-Cookie': 'survey_session=fixture; HttpOnly; SameSite=Lax; Path=/' } });
        }
        if (url.pathname === '/api/session') return route.fulfill({ status: loggedIn ? 200 : 401,
          json: loggedIn ? { csrfToken, user: { username: 'admin', role: 'admin' } } : { error: 'Login required' } });
        if (request.method() !== 'GET') {
          assert(loggedIn); assert.equal(request.headers()['x-survey-csrf'], csrfToken);
          if (url.pathname === '/api/logout') {
            loggedIn = false;
            return route.fulfill({ json: { ok: true }, headers: { 'Set-Cookie': 'survey_session=; Max-Age=0; Path=/' } });
          }
          assert.equal(url.pathname, '/api/admin/questions');
        }
        if (url.pathname === '/api/admin/forms') return route.fulfill({ json: [] });
        return route.fulfill({ json: { ok: true } });
      }
      const file = url.pathname.slice(1);
      if (!/^[\w.-]+$/.test(file)) return route.abort();
      const full = path.join(__dirname, '../public', file);
      if (!fs.existsSync(full)) return route.abort();
      return route.fulfill({ body: fs.readFileSync(full), contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.dismiss());
    await page.goto('http://localhost:3000/login.html');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('fixture-password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/admin.html');
    assert.equal(await page.evaluate(() => localStorage.getItem('role')), 'admin');
    assert.equal(await page.evaluate(() => document.cookie.includes('survey_session')), false);
    assert((await context.cookies()).some(c => c.name === 'survey_session' && c.httpOnly));
    const status = await page.evaluate(async () => (await fetch('/api/admin/questions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question_text: 'Fixture' }),
    })).status);
    assert.equal(status, 200);
    await page.locator('#hamburgerBtn').click();
    await page.getByRole('link', { name: /ออกจากระบบ/ }).click();
    await page.waitForURL('**/login.html');
    assert.equal(await page.evaluate(() => localStorage.getItem('role')), null);
    assert(!(await context.cookies()).some(c => c.name === 'survey_session'));
    assert(calls.some(c => c.path === '/api/logout' && c.method === 'POST' && c.csrf === csrfToken));
    assert.deepEqual(errors, []);
    console.log('PASS original Login UI/JSON, HttpOnly cookie, CSRF fetch and server Logout (mock API only)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
