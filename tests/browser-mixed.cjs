const safety=require('../test-db-safety');
safety.assertDestructiveTarget(safety.DISPOSABLE_TARGET,process.argv.includes('--allow-destructive-test'));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
(async()=>{
 const db=await safety.connectDisposable({...safety.DISPOSABLE_TARGET,user:'root'},process.argv.includes('--allow-destructive-test'));await db.end();
 const state=JSON.parse(fs.readFileSync(path.join(require('os').tmpdir(),'survey-mixed-disposable-state.json'),'utf8'));
 const testServer=await require('./disposable-server.cjs').start();
 let browser;try {browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});let passed=0;
 try {
  const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:33009'?r.continue():r.abort());
  const response=await context.request.post('http://127.0.0.1:33009/api/login',{data:{username:'mixed_test_admin',password:'local-fixture-password'}});assert.equal(response.status(),200);
  await context.addInitScript(()=>{localStorage.setItem('role','admin');localStorage.setItem('user','mixed_test_admin');localStorage.setItem('username','mixed_test_admin');});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:33009/admin-structure.html');
  await page.locator('#structureYear option[value="2570"]').waitFor({state:'attached'});
  await page.selectOption('#structureYear','2570');
  await page.waitForFunction(()=>!document.getElementById('btnNew').disabled);
  await page.click('#btnNew');await page.fill('#titleInput','Browser Custom Section');
  await page.selectOption('#defaultQuestionType','checkbox');
  const createdSection=page.waitForResponse(r=>r.url().includes('/api/survey-sections')&&r.request().method()==='POST');
  await page.click('#btnSave');assert.equal((await createdSection).status(),200);passed++;
  await page.goto('http://127.0.0.1:33009/admin-questions.html');await page.locator('#bankYear option[value="2570"]').waitFor({state:'attached'});await page.selectOption('#bankYear','2570');
  await page.locator(`#usedInInput option[value="${state.gid}"]`).waitFor({state:'attached'});await page.selectOption('#usedInInput',String(state.gid));assert.equal(await page.inputValue('#typeInput'),'inherit');
  await page.selectOption('#typeInput','checkbox');await page.fill('#questionInput','Browser checkbox fixture');await page.click('#mixedAddChoice');await page.locator('#mixedChoices input[type=text]').fill('Browser choice');
  const saved=page.waitForResponse(r=>r.url().includes('/api/admin/questions')&&r.request().method()==='POST');await page.click('#btnAddQuestion');assert.equal((await saved).status(),200);passed++;
  await page.goto('http://127.0.0.1:33009/from.html');await page.fill('#start_date','2026-10-01');await page.press('#start_date','Tab');await page.locator('#mixedBuilder summary').first().waitFor();
  for(const detail of await page.locator('#mixedBuilder details').all())await detail.evaluate(n=>n.open=true);
  for(const checkbox of await page.locator('#mixedBuilder input[type=checkbox]').all())await checkbox.check();
  const built=await page.evaluate(()=>MixedUI.collect());assert(built[0].categories[0].groups[0].questions.some(q=>q.question_type==='checkbox'));assert(built[0].categories[0].groups[0].questions.every(q=>q.questionId));passed++;
  const original=(await (await context.request.get(`http://127.0.0.1:33009/api/forms/${state.fid}`)).json()).form;
  await page.evaluate(f=>MixedUI.apply(f,false),original);const edit=await page.evaluate(()=>MixedUI.collect());assert.equal(edit[0].categories[0].groups[0].questions[0].questionId,original.custom_sections[0].categories[0].groups[0].questions[0].questionId);
  await page.evaluate(f=>MixedUI.apply(f,true),original);const copied=await page.evaluate(()=>MixedUI.collect());assert.notEqual(copied[0].categories[0].groups[0].questions[0].questionId,original.custom_sections[0].categories[0].groups[0].questions[0].questionId);passed++;
  await page.goto(`http://127.0.0.1:33009/preview.html?formId=${state.fid}`);await page.locator('#mixedAnswers fieldset').first().waitFor();
  assert.equal(await page.evaluate(()=>MixedUI.validate()),false);
  await page.locator('#mixedAnswers input[type=radio][value="4"]').check();await page.locator('#mixedAnswers input[type=checkbox][value="other"]').check();assert.equal(await page.evaluate(()=>MixedUI.validate()),false);
  await page.locator('#mixedAnswers input[type=text][data-other="other"]').fill('Browser other');
  await page.locator('#mixedAnswers fieldset').filter({has:page.locator('legend', {hasText:'Question textarea'})}).locator('textarea').fill('Browser text');assert.equal(await page.evaluate(()=>MixedUI.validate()),true);passed++;
  for(const width of [320,390,768,1024,1200,1440]){await page.setViewportSize({width,height:900});assert(await page.locator('#mixedAnswers').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Mixed panel overflow '+width);}passed++;
  const submit=page.waitForResponse(r=>r.url().endsWith('/api/submissions')&&r.request().method()==='POST');await page.click('#confirmBtn');assert.equal((await submit).status(),200);passed++;
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed,failed:0,scope:'Chrome + isolated HTTP/MySQL; Admin choices, builder, Edit/Copy identity, Preview required/Other, six widths, submit'}));
 } finally {await browser.close();}
 } finally {await testServer.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
