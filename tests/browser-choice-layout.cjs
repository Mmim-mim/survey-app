// Presentation regression against local UAT. Never saves or resets fixtures.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const base='http://127.0.0.1:33008', context=await browser.newContext();
    await context.route('**/*',r=>new URL(r.request().url()).origin===base && r.request().method()==='GET'?r.continue():r.abort());
    assert.equal((await context.request.post(base+'/api/login',{data:{username:'mixed_test_admin',password:'local-fixture-password'}})).status(),200);
    await context.addInitScript(()=>localStorage.setItem('role','admin'));
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/admin-questions.html');
    await page.locator('#bankYear option[value="2571"]').waitFor({state:'attached'});
    await page.selectOption('#bankYear','2571');
    const option=page.locator('#usedInInput option[data-custom="true"][data-default-type="checkbox"]').first();
    await option.waitFor({state:'attached'});await page.selectOption('#usedInInput',await option.getAttribute('value'));
    assert.equal(await page.inputValue('#typeInput'),'inherit');assert(await page.locator('#mixedChoiceEditor').isVisible());
    await page.selectOption('#typeInput','checkbox');
    for(let i=0;i<4;i++){await page.click('#mixedAddChoice');await page.locator('.mixed-choice input[type=text]').nth(i).fill('ตัวเลือกคำตอบ '+(i+1));}
    await page.locator('.mixed-choice input[type=checkbox]').last().check();await page.uncheck('#mixedRequired');
    const original=await page.evaluate(()=>MixedAdmin.fields());assert.equal(original.choices.length,4);assert.equal(original.required,false);assert(original.choices[3].is_other);
    await page.locator('.mixed-choice').last().getByRole('button',{name:'↑',exact:true}).click();
    assert.equal((await page.evaluate(()=>MixedAdmin.fields())).choices[2].id,original.choices[3].id);
    await page.locator('.mixed-choice').nth(2).getByRole('button',{name:'↓',exact:true}).click();
    await page.locator('.mixed-choice').first().getByRole('button',{name:'ลบ',exact:true}).click();
    assert.deepEqual((await page.evaluate(()=>MixedAdmin.fields())).choices.map(c=>c.id),original.choices.slice(1).map(c=>c.id));
    // Load the existing edit renderer without making any database write.
    await page.evaluate(q=>MixedAdmin.edit(q),{choices_json:JSON.stringify(original.choices),is_required:0});
    assert.deepEqual(await page.evaluate(()=>MixedAdmin.fields()),original);
    for(const width of [320,390,768,1024,1200,1440]){
      await page.setViewportSize({width,height:1000});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow '+width);
      assert(await page.locator('#mixedChoiceEditor').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'editor overflow '+width);
      const main=await page.locator('.question-editor-grid').boundingBox(),box=await page.locator('#mixedChoiceEditor').boundingBox();assert(box.y>=main.y+main.height);
      assert((await page.locator('#mixedRequired').boundingBox()).width<=20);
    }
    for(const type of ['rating','textarea']){await page.selectOption('#typeInput',type);assert.equal(await page.locator('#mixedChoiceEditor').isVisible(),false);assert.deepEqual((await page.evaluate(()=>MixedAdmin.fields())).choices,[]);}
    await page.selectOption('#typeInput','inherit');assert(await page.locator('#mixedChoiceEditor').isVisible());assert.deepEqual((await page.evaluate(()=>MixedAdmin.fields())).choices,original.choices);
    assert.deepEqual(errors,[]);console.log('PASS Choice layout: direct/inherit, 4 choices, Other/Required, reorder/delete, edit stable IDs, rating/textarea, 6 widths; no data writes');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
