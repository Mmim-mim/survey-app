// Real confirm component + actual seven handler bodies; all APIs are in-memory mocks.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), assert = require('node:assert/strict');
const read = file => fs.readFileSync('public/' + file, 'utf8');
const cases = [
  ['users', 'admin-users.js', 'deleteUser', '10,"original"', ['/api/admin/users/10?role=admin']],
  ['forms', 'admin-forms.js', 'deleteForm', '10,"original"', ['/api/admin/forms/10?role=admin']],
  ['bulk forms', 'admin-forms.js', null, '', ['/api/admin/forms/10?role=admin', '/api/admin/forms/11?role=admin']],
  ['questions', 'admin-questions.js', 'deleteQuestion', '10', ['/api/admin/questions/10?role=admin']],
  ['bulk questions', 'admin-questions.js', 'deleteSelectedQuestions', '', ['/api/admin/questions/10?role=admin', '/api/admin/questions/11?role=admin']],
  ['structure', 'admin-structure.js', 'deleteData', '', ['/api/survey-question-groups/10']],
  ['department', 'admin-departments.js', null, '', ['/api/admin/departments/10']],
];
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  let checks = 0;
  try {
    for (const [name, file, fn, args, expected] of cases) {
      const page = await browser.newPage();
      await page.route('**/*', r => r.abort());
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.setContent('<button id="btnDeleteSelected">Delete bulk</button><dialog id="editor"><button id="deleteDepartment">Delete department</button></dialog><input class="form-check" type="checkbox" value="10" checked><input class="form-check" type="checkbox" value="11" checked>');
      await page.addStyleTag({content: read('admin-popup.css')});
      await page.addScriptTag({content: read('admin-popup.js')});
      await page.addScriptTag({content: `
        let deletePending=false, busy=false, role='admin', selectedId=10, selectedType='group', structureReady=true;
        let categoryMap={},groupMap={},editing={id:10,dept_name:'original'},ids=[10,11];
        const bankYear={value:'2571'},structureYear={value:'2571'},openSectionIds=new Set(),openCategoryIds=new Set();
        const btnDeleteSelected=document.querySelector('#btnDeleteSelected');
        window.calls=[];
        async function api(url,options){if(options.method!=='DELETE')throw Error('unexpected method');window.calls.push(url);}
        async function loadUsers(){} async function loadForms(){} async function loadQuestions(){} async function refreshTree(){} function resetForm(){}
        function getSelectedQuestionIds(){return [...ids];} async function saveAction(action){await action();document.querySelector('#editor').close();}
        window.mutate=()=>{selectedId=99;selectedType='section';editing={id:99,dept_name:'changed'};ids=[99];document.querySelectorAll('.form-check').forEach(e=>e.value='99');};
      `});
      const source = read(file); let handler;
      if (fn) handler = source.match(new RegExp('async function ' + fn + '\\([^]*?\\n\\}'))[0] + `\nwindow.run=()=>${fn}(${args});`;
      else if (name === 'bulk forms') handler = source.slice(source.indexOf('document.getElementById("btnDeleteSelected")'), source.indexOf('const adminReady')) + '\nwindow.run=()=>document.querySelector("#btnDeleteSelected").click();';
      else handler = source.slice(source.indexOf("document.getElementById('deleteDepartment').onclick"), source.indexOf("dialog.addEventListener('close'")) + '\nwindow.run=()=>document.querySelector("#deleteDepartment").click();';
      await page.addScriptTag({content: handler});
      for (const response of ['cancel', 'escape', 'yes']) {
        await page.evaluate(name => {
          if(name==='department') {document.querySelector('#editor').showModal();document.querySelector('#deleteDepartment').focus();}
          window.run();window.run();
        }, name);
        await page.locator('.admin-popup[open]').waitFor();
        assert.equal(await page.locator('.admin-popup').count(), 1); checks++;
        assert.deepEqual(await page.evaluate(() => window.calls), []); checks++;
        if(response==='yes') {await page.evaluate(() => window.mutate());await page.getByRole('button',{name:'ยืนยัน',exact:true}).click();}
        else if(response==='escape') await page.keyboard.press('Escape');
        else await page.getByRole('button',{name:'ยกเลิก',exact:true}).click();
        // Bulk/Structure retain Phase 1 success acknowledgement before completing.
        if(response==='yes' && ['bulk forms','bulk questions','structure'].includes(name)) await page.getByRole('button',{name:'ตกลง',exact:true}).click();
        await page.waitForFunction(() => !deletePending);
        assert.deepEqual(await page.evaluate(() => window.calls), response==='yes' ? expected : []); checks++;
        if(name==='department' && response!=='yes') {
          assert(await page.evaluate(() => document.querySelector('#editor').open && document.activeElement.id==='deleteDepartment')); checks++;
          await page.evaluate(() => document.querySelector('#editor').close());
        }
      }
      assert.deepEqual(errors, []); checks++;
      await page.close();
    }
    for (const name of ['admin', 'admin-users', 'admin-forms', 'admin-questions', 'admin-structure', 'admin-departments']) {
      const page = await browser.newPage();
      await page.route('**/*', r => r.abort());
      // Render actual page/navigation markup without API/bootstrap scripts.
      await page.setContent(read(name+'.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
      await page.addStyleTag({content: read('admin-navigation.css')});
      await page.addStyleTag({content: read('admin-popup.css')});
      await page.addScriptTag({content: read('admin-navigation.js')});
      await page.addScriptTag({content: read('admin-popup.js')});
      await page.locator('#hamburgerBtn').click();
      assert.equal(await page.locator('#hamburgerBtn').getAttribute('aria-expanded'), 'true'); checks++;
      await page.evaluate(() => {AdminPopup.confirm({destructive:true,message:'test'});});
      await page.locator('.admin-popup[open]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.admin-popup').waitFor({state:'detached'});
      assert.equal(await page.locator('#hamburgerBtn').getAttribute('aria-expanded'), 'true'); checks++;
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#hamburgerBtn').getAttribute('aria-expanded'), 'false'); checks++;
      await page.close();
    }
    console.log('PASS '+checks+' confirm/navigation browser checks across all seven callsites and six Admin pages');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
