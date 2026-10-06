// Auth UI integration with intercepted responses only. No server/DB access.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  let checks=0;
  try {
    for (const scenario of ['valid','expired','403','public','lazy','logout-error','logout-ok']) {
      const context=await browser.newContext();
      await context.addInitScript(() => {
        if(sessionStorage.getItem('fixtureInitialized')) return;
        sessionStorage.setItem('fixtureInitialized','yes');
        for(const key of ['role','user','isLoggedIn','displayName','dept_name','surveyDraft','copyForm','other']) localStorage.setItem(key,'keep');
      });
      let popupLoads=0;
      await context.route('**/*',async route => {
        const url=new URL(route.request().url());
        if(url.origin!=='http://auth.test')return route.abort();
        if(url.pathname.startsWith('/api/')) {
          const status=scenario==='expired'||scenario==='lazy'||scenario==='public'?401:scenario==='403'?403:scenario==='logout-error'&&url.pathname==='/api/logout'?500:200;
          return route.fulfill({status,json:{user:{role:'admin'},csrfToken:'a'.repeat(64)}});
        }
        if(['/admin-popup.js','/admin-popup.css','/auth-client.js'].includes(url.pathname)) {
          if(url.pathname==='/admin-popup.js')popupLoads++;
          return route.fulfill({contentType:url.pathname.endsWith('.js')?'application/javascript':'text/css',body:fs.readFileSync('public'+url.pathname)});
        }
        if(url.pathname==='/login.html')return route.fulfill({contentType:'text/html',body:'Login'});
        return route.fulfill({contentType:'text/html; charset=utf-8',body:`<html><head><meta charset="UTF-8">${scenario==='lazy'?'':'<link rel="stylesheet" href="/admin-popup.css"><script src="/admin-popup.js"></script>'}<script src="/auth-client.js"></script></head><body><button id="btnLogout">ออกจากระบบ</button></body></html>`});
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('dialog',()=>{throw Error('Unexpected native popup');});
      await page.goto('http://auth.test/'+(scenario==='public'?'preview.html':scenario==='lazy'?'index.html':'admin.html'));
      if(['expired','lazy'].includes(scenario)) {
        await page.locator('.admin-popup[open]').waitFor();
        await page.evaluate(()=>{fetch('/api/admin/users');fetch('/api/admin/forms');});
        assert.equal(await page.locator('.admin-popup').count(),1);checks++;
        assert.equal(await page.locator('#admin-popup-title').textContent(),'เซสชันหมดอายุ');checks++;
        await page.keyboard.press('Escape');
        assert(await page.locator('.admin-popup').isVisible());checks++;
        assert(!page.url().endsWith('/login.html'));checks++;
        await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
        await page.waitForURL('**/login.html');
        assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage).sort()),['copyForm','other','surveyDraft']);checks++;
        assert.equal(popupLoads,1);checks++;
      } else if(scenario.startsWith('logout')) {
        await page.locator('#btnLogout').click();
        if(scenario==='logout-ok') {await page.waitForURL('**/login.html');assert.equal(await page.evaluate(()=>localStorage.getItem('copyForm')),'keep');checks++;}
        else {
          await page.locator('.admin-popup[open]').waitFor();
          assert.equal(await page.locator('#admin-popup-title').textContent(),'ออกจากระบบไม่สำเร็จ');checks++;
          await page.getByRole('button',{name:'ตกลง',exact:true}).click();
          assert(page.url().endsWith('/admin.html'));checks++;
          assert.equal(await page.evaluate(()=>localStorage.getItem('role')),'keep');checks++;
        }
      } else {
        await page.evaluate(async()=>{await fetch('/api/session');await fetch('/api/admin/users');});
        assert.equal(await page.locator('.admin-popup').count(),0);checks++;
        assert(!page.url().endsWith('/login.html'));checks++;
      }
      assert.deepEqual(errors,[]);checks++;
      await context.close();
    }
    console.log('PASS '+checks+' auth popup browser checks');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
