// Read-only local API/Browser regression. All browser writes are intercepted.
const assert=require('node:assert/strict');
const safety=require('../test-db-safety');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const db=await safety.connect({...safety.TARGET,user:'root',dateStrings:true});let browser;
 try {
  const read=async()=>({forms:(await db.query('SELECT * FROM survey_forms ORDER BY id'))[0],submissions:(await db.query('SELECT * FROM submissions ORDER BY id'))[0]});
  const before=await read();
  browser=await chromium.launch({channel:'chrome',headless:true});const c=await browser.newContext(),base='http://127.0.0.1:33008';let blocked=0;
  assert.equal((await c.request.post(base+'/api/login',{data:{username:'mixed_test_admin',password:'local-fixture-password'}})).status(),200);
  await c.addInitScript(()=>{localStorage.setItem('role','admin');localStorage.setItem('user','mixed_test_admin')});
  await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base)return r.abort();if(r.request().method()!=='GET'){blocked++;return r.fulfill({status:409,json:{code:'FORM_HAS_RESPONSES',response_count:1}})}return r.continue()});
  const page=await c.newPage();
  for(const id of [125,122,124]){
   const row=before.forms.find(f=>f.id===id);assert(row);
   const response=await c.request.get(base+'/api/forms/'+id);assert.equal(response.status(),200);const api=await response.json();
   assert.equal(api.start_date,row.start_date);assert.equal(api.end_date,row.end_date);
   await page.goto(base+'/from.html?mode=edit&id='+id);await page.waitForLoadState('networkidle');
   assert.equal(await page.inputValue('#start_date'),row.start_date);assert.equal(await page.inputValue('#end_date'),row.end_date);
   if(id===125){await page.locator('#formSurvey button[type=submit]').click();await page.locator('#editWarningConfirmBtn').waitFor();assert.equal(await page.locator('.field-error-message').count(),0);await page.click('#editWarningCancelBtn');}
   console.log('PASS API/Edit '+id+': '+row.start_date+' / '+row.end_date);
  }
  await page.goto(base+'/index.html');await page.evaluate(()=>copyForm(125));await page.waitForURL('**/from.html?mode=copy');await page.waitForLoadState('networkidle');
  assert.equal(await page.inputValue('#start_date'),'2027-10-02');assert.equal(await page.inputValue('#end_date'),'2027-10-02');
  await page.goto(base+'/from.html');await page.fill('#start_date','2027-10-02');await page.fill('#end_date','2027-10-02');await page.locator('#formSurvey button[type=submit]').click();assert(!(await page.locator('.field-error-message').allTextContents()).some(t=>t.includes('วันที่สิ้นสุด')));
  assert.equal(blocked,1);assert.deepEqual(await read(),before);
  console.log('PASS Copy/Create same-day dates; all Forms/Submissions unchanged; PUT intercepted, no DB writes');
 }finally{if(browser)await browser.close();await db.end()}
})().catch(e=>{console.error(e);process.exitCode=1});
