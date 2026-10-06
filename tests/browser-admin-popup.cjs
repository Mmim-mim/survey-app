// Browser-only checks. All network access is blocked; no database writes.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  let checks = 0;
  const check = value => { assert.ok(value); checks++; };
  try {
    const page = await browser.newPage();
    await page.route('**/*', r => r.abort());
    await page.setContent('<button id="opener">Open</button><dialog id="editor"><input id="name"></dialog>');
    await page.addStyleTag({content: fs.readFileSync('public/admin-popup.css', 'utf8')});
    await page.addScriptTag({content: fs.readFileSync('public/admin-popup.js', 'utf8')});
    for (const type of ['success', 'warning', 'error', 'info']) {
      await page.focus('#opener');
      await page.evaluate(type => { window.done = false; AdminPopup.alert({type, message: '<img src=x onerror=alert(1)>'}).then(() => window.done = true); }, type);
      await page.locator('.admin-popup[open]').waitFor();
      check(await page.locator('.admin-popup').getAttribute('data-type') === type);
      check(await page.locator('.admin-popup img').count() === 0);
      check(!await page.evaluate(() => window.done));
      for (const key of ['Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        check(await page.evaluate(() => document.activeElement.matches('.admin-popup button')));
      }
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.done);
      check(await page.evaluate(() => document.activeElement.id === 'opener'));
    }
    await page.evaluate(() => { document.querySelector('#editor').showModal(); document.querySelector('#name').focus(); window.done = false; AdminPopup.alert({message: 'nested'}).then(() => window.done = true); });
    await page.locator('.admin-popup[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.done);
    check(await page.evaluate(() => document.querySelector('#editor').open && document.activeElement.id === 'name'));
    await page.evaluate(() => { document.querySelector('#editor').close(); AdminPopup.alert({message: 'first'}); AdminPopup.alert({message: 'second'}); });
    await page.locator('.admin-popup[open]').waitFor();
    check(await page.locator('.admin-popup').count() === 1);
    await page.locator('.admin-popup button').click();
    await page.waitForFunction(() => document.querySelector('#admin-popup-message')?.textContent === 'second');
    check(await page.locator('.admin-popup').count() === 1);
    await page.keyboard.press('Escape');
    for (const width of [375, 1280]) {
      await page.setViewportSize({width, height: 720});
      await page.evaluate(() => { AdminPopup.alert({message: 'x'.repeat(1000)}); });
      await page.locator('.admin-popup[open]').waitFor();
      check(await page.evaluate(() => { const d = document.querySelector('.admin-popup'), r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && d.scrollWidth <= d.clientWidth; }));
      await page.keyboard.press('Escape');
    }
    for (const response of ['yes', 'cancel', 'escape']) {
      await page.setViewportSize({width: response === 'yes' ? 375 : 1280, height: 720});
      await page.focus('#opener');
      await page.evaluate(() => { window.result = null; AdminPopup.confirm({title: 'ยืนยันการลบ', message: '<b>text only</b>', destructive: true}).then(result => window.result = result); });
      await page.locator('.admin-popup[open]').waitFor();
      check(await page.evaluate(() => {const r=document.querySelector('.admin-popup').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth;}));
      check(await page.evaluate(() => document.activeElement.textContent === 'ยกเลิก'));
      check(await page.locator('.admin-popup b').count() === 0);
      await page.keyboard.press('Shift+Tab');
      check(await page.evaluate(() => document.activeElement.textContent === 'ยืนยัน'));
      await page.keyboard.press('Tab');
      check(await page.evaluate(() => document.activeElement.textContent === 'ยกเลิก'));
      if (response === 'escape') await page.keyboard.press('Escape');
      else if (response === 'cancel') await page.keyboard.press('Enter');
      else await page.getByRole('button', {name: 'ยืนยัน', exact: true}).click();
      await page.waitForFunction(() => window.result !== null);
      check(await page.evaluate(() => window.result) === (response === 'yes'));
      check(await page.evaluate(() => document.activeElement.id === 'opener'));
    }
    console.log('PASS ' + checks + ' popup browser assertions');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
