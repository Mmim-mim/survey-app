// MANUAL UAT HELPER: mutates Form 125 and creates submissions. Never run in automated suites.
// Requires fresh user approval. No fixture reset or history rewrite.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const safety=require('../test-db-safety'),M=require('../public/mixed-questions');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 if(!process.argv.includes('--approved-form-125'))throw Error('Explicit UAT approval flag required');
 const db=await safety.connect({...safety.TARGET,user:'root'});let browser;
 try{
  const [before]=await db.query('SELECT * FROM submissions ORDER BY id');
  const old=before.find(s=>s.id===168);assert(old&&old.form_id===125);
  const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
  console.log('Submission168 before SHA256 '+hash(old.payload_json));
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();
  const base='http://127.0.0.1:33008';
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  assert.equal((await context.request.post(base+'/api/login',{data:{username:'mixed_test_admin',password:'local-fixture-password'}})).status(),200);
  await context.addInitScript(()=>{localStorage.setItem('role','admin');localStorage.setItem('user','mixed_test_admin');localStorage.setItem('username','mixed_test_admin')});
  const initial=(await (await context.request.get(base+'/api/forms/125')).json()).form;
  assert.deepEqual(M.flatten(initial).map(x=>x.q.questionBankId).sort(),[325,326]);
  const oldText=M.flatten(initial).find(x=>x.q.questionBankId===326).q.questionId;
  const stale=await context.newPage();stale.on('dialog',d=>d.accept());await stale.goto(base+'/preview.html?formId=125');await stale.locator('#mixedAnswers textarea').last().waitFor();
  await stale.locator('#mixedAnswers input[type=checkbox]').first().check();await stale.locator('#mixedAnswers textarea').last().fill('stale must not save');
  const edit=await context.newPage();edit.on('dialog',d=>d.accept());
  async function openEdit(){await edit.goto(base+'/from.html?mode=edit&id=125');await edit.waitForFunction(()=>globalThis.MixedUI?.collect().length>0);await edit.waitForLoadState('networkidle');await edit.fill('#end_date',initial.end_date);for(const d of await edit.locator('#mixedBuilder details').all())await d.evaluate(n=>n.open=true);}
  async function save(){const warning=edit.waitForResponse(r=>r.url().endsWith('/api/forms/125')&&r.request().method()==='PUT'&&r.status()===409);await edit.locator('#formSurvey button[type=submit]').click();const w=await warning;assert.equal((await w.json()).code,'FORM_HAS_RESPONSES');const done=edit.waitForResponse(r=>r.url().endsWith('/api/forms/125')&&r.request().method()==='PUT'&&r.status()!==409);await edit.click('#editWarningConfirmBtn');assert.equal((await done).status(),200);}
  await openEdit();await edit.locator('#mixedBuilder label').filter({hasText:'กรุณาเสนอแนวทางในการประหยัดพลังงานเพิ่มเติม'}).locator('input').uncheck();await save();
  const current=(await (await context.request.get(base+'/api/forms/125')).json()).form;assert.deepEqual(M.flatten(current).map(x=>x.q.questionBankId),[325]);
  const rejected=stale.waitForResponse(r=>r.url().endsWith('/api/submissions'));await stale.click('#confirmBtn');const staleResponse=await rejected;assert.equal(staleResponse.status(),409);assert.equal((await staleResponse.json()).code,'FORM_SNAPSHOT_CHANGED');
  const preview=await context.newPage();preview.on('dialog',d=>d.accept());await preview.goto(base+'/preview.html?formId=125');await preview.locator('#mixedAnswers fieldset').waitFor();assert.equal(await preview.locator('#mixedAnswers fieldset').count(),1);
  await preview.locator('#mixedAnswers input[type=checkbox]').first().check();const posted=preview.waitForResponse(r=>r.url().endsWith('/api/submissions'));await preview.click('#confirmBtn');const response=await posted;assert.equal(response.status(),200);const newId=(await response.json()).id;
  const report=await (await context.request.get(base+'/api/forms/125/results')).json();assert(report.custom_questions.some(q=>q.questionId===oldText&&q.comments.includes('ทดสอบการบันทึกคำตอบแบบข้อความ')));
  const resultPage=await context.newPage();await resultPage.goto(base+'/result.html?id=125');await resultPage.locator('#mixedReport').getByText('ทดสอบการบันทึกคำตอบแบบข้อความ',{exact:true}).waitFor();
  await openEdit();await edit.locator('#mixedBuilder label').filter({hasText:'กรุณาเสนอแนวทางในการประหยัดพลังงานเพิ่มเติม'}).locator('input').check();await save();
  const restored=(await (await context.request.get(base+'/api/forms/125')).json()).form;const newText=M.flatten(restored).find(x=>x.q.questionBankId===326).q.questionId;assert.notEqual(newText,oldText);
  await preview.goto(base+'/preview.html?formId=125');await preview.locator('#mixedAnswers fieldset').nth(1).waitFor();
  const [after]=await db.query('SELECT * FROM submissions ORDER BY id');for(const row of before)assert.deepEqual(after.find(s=>s.id===row.id),row);
  const fresh=JSON.parse(after.find(s=>s.id===newId).payload_json);assert.equal(M.flatten({custom_sections:fresh.mixed_questions.sections}).length,1);
  console.log(JSON.stringify({passed:true,form:125,newSubmission:newId,oldText,newText,submission168Hash:hash(after.find(s=>s.id===168).payload_json),allOldSubmissionsUnchanged:true,coverage:'A-L: Browser Edit confirmation, removal, stale reject, fresh Preview/Submit, Result history, re-add fresh ID'}));
 }finally{if(browser)await browser.close();await db.end()}
})().catch(e=>{console.error(e);process.exitCode=1});
