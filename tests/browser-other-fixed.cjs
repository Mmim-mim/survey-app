// Browser regression with an in-memory Form only. No API, login or database access.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 try {
  const context=await browser.newContext();await context.route('**/*',r=>r.abort());
  const page=await context.newPage();page.on('dialog',d=>d.accept());
  const admin=await context.newPage();
  await admin.setContent('<select id="usedInInput"><option data-custom="true" data-default-type="checkbox">Group</option></select><select id="typeInput"><option value="checkbox">Checkbox</option></select><div id="mixedQuestionFields"><input id="mixedRequired" type="checkbox"><div id="mixedChoiceEditor"><div id="mixedChoices"></div></div></div>');
  for(const file of ['mixed-questions.js','mixed-admin.js'])await admin.addScriptTag({path:path.join(__dirname,'../public',file)});
  for(const [label,expected]of [['','อื่นๆ'],['  \t','อื่นๆ'],['อื่นๆ โปรดระบุ','อื่นๆ โปรดระบุ'],['ทางเลือกอื่น','ทางเลือกอื่น']]) {
    await admin.evaluate(label=>MixedAdmin.edit({choices_json:[{id:'stable-choice',label,is_other:false}],is_required:1}),label);
    await admin.locator('.mixed-choice input[type=checkbox]').check();
    assert.equal(await admin.locator('.mixed-choice input[type=text]').inputValue(),expected);
    const saved=await admin.evaluate(()=>MixedAdmin.fields());
    assert.equal(saved.choices[0].label,expected);assert.equal(saved.choices[0].id,'stable-choice');assert.equal(saved.choices[0].is_other,true);
    await admin.locator('.mixed-choice input[type=checkbox]').uncheck();
    assert.equal(await admin.locator('.mixed-choice input[type=text]').inputValue(),expected);
  }
  // Save-time fallback also handles clearing a label while Other remains checked.
  await admin.locator('.mixed-choice input[type=checkbox]').check();
  await admin.locator('.mixed-choice input[type=text]').fill('   ');
  assert.equal((await admin.evaluate(()=>MixedAdmin.fields())).choices[0].label,'อื่นๆ');
  console.log('PASS Admin: blank/whitespace auto-fill, preserve typed label, uncheck preserves label, stable ID and save validation');
  await page.setContent('<div id="sec5"></div>');
  await page.addStyleTag({path:path.join(__dirname,'../public/mixed-questions.css')});
  for(const file of ['mixed-questions.js','mixed-ui.js'])await page.addScriptTag({path:path.join(__dirname,'../public',file)});
  await page.evaluate(()=>MixedUI.renderAnswers({custom_sections:[{section_key:'custom_12345678-1234-1234-1234-123456789abc',title:'S',categories:[{category_id:1,title:'C',groups:[{group_id:1,title:'G',questions:[{questionId:'q',questionBankId:1,questionText:'Checkbox',question_type:'checkbox',required:true,choices:[{id:'normal',label:'Normal'},{id:'other',label:'Other',is_other:true}]}]}]}]}]}));
  assert.equal(await page.evaluate(()=>MixedUI.validate()),false);
  assert.equal(await page.locator('#mixedAnswers input[data-other]').isVisible(),false);
  await page.locator('input[value="other"]').check();
  assert.equal(await page.locator('#mixedAnswers input[type=text][data-other="other"]').isVisible(),true);
  assert.equal(await page.locator('#mixedAnswers textarea').count(),0);
  assert.equal(await page.locator('.mixed-other-row input[type=checkbox]').count(),1);
  assert.equal(await page.locator('.mixed-other-row input[type=text]').getAttribute('placeholder'),'โปรดระบุ');
  for(const width of [320,390,768,1024,1200,1440]) {
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
    const row=await page.locator('.mixed-other-row').boundingBox(),label=await page.locator('.mixed-other-row label').boundingBox(),input=await page.locator('.mixed-other-input').boundingBox();
    assert(Math.abs(input.x+input.width-row.x-row.width)<2,'input fills remaining row '+width);
    if(width>=768){assert(input.x>label.x+label.width);assert(Math.abs((label.y+label.height/2)-(input.y+input.height/2))<2);assert(input.width>350);}
    if(input.y>=label.y+label.height){assert(Math.abs(input.width-row.width)<2,'wrapped input fills container '+width);}
  }
  assert.equal(await page.evaluate(()=>MixedUI.validate()),false);
  await page.locator('#mixedAnswers input[data-other]').fill('รายละเอียด');
  assert.equal(await page.evaluate(()=>MixedUI.validate()),true);
  assert.deepEqual(await page.evaluate(()=>MixedUI.collectAnswers()),[{questionId:'q',value:['other'],other:{other:'รายละเอียด'}}]);
  await page.locator('input[value="normal"]').check();
  assert.deepEqual(await page.evaluate(()=>MixedUI.collectAnswers()),[{questionId:'q',value:['normal','other'],other:{other:'รายละเอียด'}}]);
  await page.locator('input[value="other"]').uncheck();
  assert.equal(await page.locator('#mixedAnswers input[data-other]').isVisible(),false);
  assert.equal(await page.evaluate(()=>MixedUI.validate()),true);
  console.log('PASS Respondent: required empty rejected, Other reveals required text, normal choice unchanged; zero network/DB requests');
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
