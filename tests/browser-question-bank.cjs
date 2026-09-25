// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
// All localhost and external requests are intercepted: no server or database is used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const snapshots = require('../public/section-snapshot');
const bank = require('../question-bank-years');
const root = path.join(__dirname, '../public');

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: process.env.HEADED !== '1' });
  try {
    const context = await browser.newContext();
    const requests = [], errors = [];
    const form = snapshots.attach({
      start_date: '2026-10-01', fiscal_year: 2570, question_bank_fiscal_year: 2570,
      form_title: 'Fixture', section2_models: [{ title: 'LibQUAL+', enabled: true,
        dimensions: [{ title: 'Service', bankGroupId: 20, datalist_id: 'group_20_suggestions', enabled: true,
          questions: [{ questionId: 'saved-question', questionBankId: 21, text: 'Service quality' }] }] }],
    });
    await context.addInitScript(form => {
      localStorage.setItem('role', 'staff'); localStorage.setItem('user', 'tester');
      localStorage.setItem('copyForm', JSON.stringify(form));
    }, form);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== 'http://localhost:3000') return route.abort();
      if (url.pathname.startsWith('/api/')) {
        assert.equal(request.method(), 'GET', 'Browser test must never submit writes');
        requests.push(url.pathname + url.search);
        const group = url.searchParams.get('fiscal_year') === '2571' ? 40 : 20;
        let json;
        if (url.pathname === '/api/question-bank/active') json = [
          { id: group + 1, group_id: null, datalist_id: 'affectOfServiceSuggestions', question_type: 'rating', fiscal_year: Number(url.searchParams.get('fiscal_year')), question_text: 'Service quality' },
          { id: group + 2, group_id: group, datalist_id: `group_${group}_suggestions`, question_text: 'Library facilities' },
          ...[3, 4].map(i => ({ id: group + i, group_id: group, datalist_id: `group_${group}_suggestions`, question_text: 'Duplicate text' })),
        ];
        else if (url.pathname === '/api/survey-structure/form') json = {
          sections: snapshots.definitions.map(([section_key, title]) => ({ section_key, title })),
          models: [{ title: 'LibQUAL+', dimensions: [{ id: group, title: 'Service', datalist_id: `group_${group}_suggestions` }] }],
        };
        else if (url.pathname === '/api/forms/1') json = { created_by_username: 'tester', form };
        else throw Error('Unexpected API: ' + url.pathname);
        if (url.pathname === '/api/question-bank/active') {
          const year = Number(url.searchParams.get('fiscal_year'));
          json = bank.withLegacyGroups({
            categories: [{ id: 7, title: 'LibQUAL+', fiscal_year: year }],
            groups: [{ id: group, category_id: 7, title: 'ความรู้สึกที่มีต่อบริการ (Affect of Service)', fiscal_year: year }],
            questions: json,
          }).questions;
          assert.equal(json[0].legacy_group_mapping, true);
        }
        return route.fulfill({ json });
      }
      const name = url.pathname.slice(1);
      if (!/^[\w.-]+$/.test(name) || !fs.existsSync(path.join(root, name))) return route.abort();
      return route.fulfill({ body: fs.readFileSync(path.join(root, name)),
        contentType: name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto('http://localhost:3000/from.html');
    await page.locator('#formSurvey button[type="submit"]').click();
    await page.waitForTimeout(350);
    assert(await page.locator('[name="form_title"]').evaluate(el => el.classList.contains('input-error')));
    assert(await page.locator('#start_date').evaluate(el => el.classList.contains('input-error')));
    assert.equal(await page.locator('#validationSummary').textContent(), 'กรุณาตรวจสอบข้อมูลที่ยังไม่ครบถ้วน');
    assert(await page.locator('#validationSummary').evaluate(el => el.classList.contains('show')));
    assert.equal(await page.evaluate(() => document.activeElement.name), 'form_title');
    await page.waitForFunction(() => {
      const box = document.querySelector('[name="form_title"]').getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    });
    console.log('PASS empty form validation, highlights and focus; no write requests');
    await page.locator('#start_date').fill('2026-10-01');
    await page.locator('#start_date').press('Tab');
    await page.waitForFunction(() => document.getElementById(document.querySelector('#mainModels .dim-question')?.dataset.filteredListId)?.options.length === 4);
    assert.equal(await page.locator('#formFiscalYear').getAttribute('type'), 'hidden');
    assert.equal(await page.locator('#formFiscalYear').inputValue(), '2570');
    await page.locator('#formFiscalYear').evaluate(el => { el.value = '2571'; });
    await page.locator('#formSurvey button[type="submit"]').click();
    assert(await page.locator('#start_date').evaluate(el => el.classList.contains('input-error')));
    assert(await page.locator('#validationSummary').evaluate(el => el.classList.contains('show')));
    await page.locator('#formFiscalYear').evaluate(el => { el.value = '2570'; });
    console.log('PASS fiscal mismatch uses original validation summary and blocks writes');
    async function enableQuestions() {
      for (const selector of ['[data-sec="s2"] .toggle', '.main-model-toggle', '#mainModels .subtoggle']) {
        for (const toggle of await page.locator(selector).all()) await toggle.check();
      }
    }
    await enableQuestions();
    let input = page.locator('#mainModels .dim-question').first();
    const originalId = await input.evaluate(el => el.closest('.item').dataset.questionId);
    const picker = page.locator('#mainModels .question-picker').first();
    assert.equal(await picker.locator('input').count(), 1);
    assert(await picker.locator('.question-picker-arrow').isVisible());
    await picker.locator('.question-picker-arrow').click();
    assert.equal(await picker.getByRole('option').count(), 4);
    if (process.env.DROPDOWN_SCREENSHOT) await page.screenshot({ path: process.env.DROPDOWN_SCREENSHOT });
    await picker.getByRole('option', { name: 'Service quality', exact: true }).click();
    assert.equal(await input.inputValue(), 'Service quality');
    assert.equal(await input.evaluate(el => el.closest('.item').dataset.questionBankId), '21');
    console.log('PASS visible arrow and actual click selection');
    await input.fill('');
    await input.pressSequentially('facil');
    assert.equal(await picker.getByRole('option').count(), 1);
    await picker.getByRole('option', { name: 'Library facilities', exact: true }).click();
    assert.equal(await input.inputValue(), 'Library facilities');
    assert.equal(await input.evaluate(el => el.closest('.item').dataset.questionBankId), '22');
    console.log('PASS partial-text search and click selection');
    await input.fill('Custom text');
    assert(await picker.locator('.question-picker-empty').isVisible());
    assert.equal(await input.evaluate(el => el.closest('.item').dataset.questionBankId || null), null);
    assert.equal(await input.evaluate(el => el.closest('.item').dataset.questionId), originalId);
    await input.fill('');
    await input.pressSequentially('#24');
    await picker.getByRole('option').click();
    await input.dispatchEvent('change');
    assert.equal(await input.inputValue(), 'Duplicate text');
    assert.equal(await input.evaluate(el => el.closest('.item').dataset.questionBankId), '24');
    console.log('PASS explicit duplicate ID and custom null');
    await input.fill('facil');
    await input.press('ArrowDown'); await input.press('Enter');
    assert.equal(await input.inputValue(), 'Library facilities');
    for (const width of [320, 390, 768, 1024, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await picker.locator('.question-picker-arrow').click();
      const box = await picker.locator('.question-picker-menu').boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width + 1, 'Menu within viewport ' + width);
      await input.press('Escape');
      assert.equal(await input.getAttribute('aria-expanded'), 'false');
    }
    console.log('PASS keyboard selection, Escape and six viewport widths');
    await page.locator('#start_date').fill('2027-10-01');
    await page.locator('#start_date').press('Tab');
    await page.waitForFunction(() => document.getElementById(document.querySelector('#mainModels .dim-question')?.dataset.filteredListId)?.options[0]?.dataset.questionBankId === '41');
    assert.equal(await page.locator('#group_20_suggestions option').count(), 0);
    console.log('PASS automatic start-date year switch');
    for (const mode of ['edit', 'copy']) {
      await page.goto(`http://localhost:3000/from.html?mode=${mode}&id=1`);
      await page.waitForFunction(() => document.getElementById(document.querySelector('#mainModels .dim-question')?.dataset.filteredListId)?.options.length === 4);
      input = page.locator('#mainModels .dim-question').first();
      const identity = await input.evaluate(el => el.closest('.item').dataset);
      if (mode === 'edit') assert.equal(identity.questionId, 'saved-question');
      else assert.notEqual(identity.questionId, 'saved-question');
      assert.equal(identity.questionBankId, '21');
      await page.locator('#formSurvey button[type="submit"]').click();
      await page.waitForFunction(() => document.activeElement?.classList.contains('input-error'), null, { timeout: 10000 });
      assert(await page.locator('#end_date').evaluate(el => el.classList.contains('input-error')));
      assert(await page.locator('#validationSummary').evaluate(el => el.classList.contains('show')));
      await page.waitForFunction(() => {
        const box = document.querySelector('.input-error').getBoundingClientRect();
        return box.top >= 0 && box.bottom <= innerHeight;
      });
    }
    assert.deepEqual(errors, []);
    assert(requests.some(url => url.includes('fiscal_year=2571')));
    console.log('PASS Edit/Copy identities, required-field validation and scroll; zero real network/DB requests');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
