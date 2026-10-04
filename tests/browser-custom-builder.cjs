// No server/database: all API/network requests intercepted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext();await context.route('**/*',r=>r.request().url()==='http://localhost/'?r.fulfill({contentType:'text/html',body:'<html></html>'}):r.abort());const page=await context.newPage();await page.goto('http://localhost/');
  const styles=[...fs.readFileSync(path.join(__dirname,'../public/from.html'),'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  await page.setContent('<div class="page"><div data-sec="s5"></div><div id="sec5"></div></div>');await page.addStyleTag({content:styles});
  await page.addStyleTag({path:path.join(__dirname,'../public/mixed-questions.css')});
  for(const file of ['mixed-questions.js','mixed-ui.js'])await page.addScriptTag({path:path.join(__dirname,'../public',file)});
  const form={custom_sections:[{section_key:'custom_12345678-1234-1234-1234-123456789abc',title:'Dynamic Section',categories:[{category_id:1,title:'Category',groups:[{group_id:2,title:'Group',questions:[
   {questionId:'saved-c',questionBankId:1,questionText:'Choose',question_type:'checkbox',required:true,choices:[{id:'a',label:'A'}]},
   {questionId:'saved-t',questionBankId:2,questionText:'Comment',question_type:'textarea',required:false,choices:[]}
  ]}]}]}]};
  await page.evaluate(f=>MixedUI.apply(f),form);
  assert.equal(await page.locator('#mixedBuilder .section').count(),1);
  const toggle=page.getByRole('switch');assert.equal(await toggle.isChecked(),true);
  assert.equal(await page.locator('.mixed-question-selection input:checked').count(),2);
  assert.match(await page.locator('#mixedBuilder').textContent(),/Type: Checkbox/);assert.match(await page.locator('#mixedBuilder').textContent(),/Type: Textarea/);
  await toggle.uncheck();let saved=await page.evaluate(()=>MixedUI.collect());assert.equal(saved[0].enabled,false);assert.equal(saved[0].categories[0].groups[0].questions[0].questionId,'saved-c');
  await page.evaluate(s=>{MixedUI.apply({custom_sections:s});MixedUI.renderAnswers({custom_sections:s});},saved);
  assert.equal(await page.getByRole('switch').isChecked(),false);assert.equal(await page.locator('#mixedAnswers').isVisible(),false);
  await page.getByRole('switch').check();
  await page.locator('#mixedBuilder > .section > .head button').click();assert.equal(await page.locator('.mixed-question-selection').first().isVisible(),false);
  await page.locator('#mixedBuilder > .section > .head button').click();assert.equal(await page.locator('.mixed-question-selection').first().isVisible(),true);
  await page.evaluate(()=>MixedUI.renderAnswers({custom_sections:MixedUI.collect()}));
  assert.equal(await page.locator('#mixedAnswers input[type=checkbox]').count(),1);assert.equal(await page.locator('#mixedAnswers textarea').count(),1);
  for(const width of [1280,390]){await page.setViewportSize({width,height:900});const box=await page.locator('#mixedBuilder').boundingBox();assert.ok(box.x+box.width<=width+1);}
  await page.evaluate(f=>MixedUI.apply(f,true),form);saved=await page.evaluate(()=>MixedUI.collect());assert.notEqual(saved[0].categories[0].groups[0].questions[0].questionId,'saved-c');
  await page.locator('[data-bank-id="2"]').uncheck();await page.locator('[data-bank-id="2"]').check();
  assert.notEqual((await page.evaluate(()=>MixedUI.collect()))[0].categories[0].groups[0].questions[1].questionId,'saved-t');
  console.log('PASS Cards/switch/collapse, Edit/off restore, Copy/new identity, type separation, desktop/mobile; no DB/network');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
