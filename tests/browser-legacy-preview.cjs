// All requests intercepted; this test never contacts a server or database.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    for (const id of [76, 77, 86]) {
      const context = await browser.newContext();
      const sent = [], errors = [];
      const form = { form_title: `Legacy ${id}`, start_date: '', fiscal_year: 2560,
        section1_enabled: false, section2_enabled: true, section3_enabled: false,
        section4_enabled: false, section5_enabled: false,
        section2_models: [{ title: 'Original model', enabled: true, dimensions: [
          { title: 'Original group', enabled: true, questions: [{ text: 'Original question', questionId: 'old-q', questionBankId: 113 }] },
        ] }] };
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== 'http://localhost:3000') return route.abort();
        if (url.pathname === `/api/forms/${id}`) return route.fulfill({ json: {
          id, form, start_date: null, fiscal_year: 2560, fiscal_year_error: null,
        } });
        if (url.pathname === '/api/submissions') {
          assert.equal(req.method(), 'POST');
          sent.push(req.postDataJSON());
          return route.fulfill({ json: { ok: true, id: 1 } });
        }
        if (url.pathname.startsWith('/api/')) throw Error('Unexpected API: ' + url.pathname);
        const file = path.join(__dirname, '../public', url.pathname.slice(1));
        if (!fs.existsSync(file)) return route.abort();
        return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'application/javascript' : 'text/html' });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
      await page.goto(`http://localhost:3000/preview.html?formId=${id}`);
      await page.getByText('Original question', { exact: true }).waitFor();
      assert.equal(await page.locator('#heroTitle').textContent(), `Legacy ${id}`);
      await page.locator('#ratingTables input[type=radio]').first().check();
      await page.locator('#confirmBtn').click();
      await page.getByRole('heading', { name: 'ส่งแบบประเมินเรียบร้อยแล้ว' }).waitFor();
      assert.equal(sent.length, 1);
      assert.equal(Number(sent[0].form_id), id);
      assert.equal(sent[0].payload.fiscal_year_source, 'legacy_calendar_year');
      assert.equal(sent[0].payload.ratings[0].questionId, 'old-q');
      assert.equal(sent[0].payload.ratings[0].questionBankId, 113);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS Legacy 76/77/86 render original question and submit anonymous answers (mock API only)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
