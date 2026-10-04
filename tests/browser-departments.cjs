// Browser regression with intercepted API only. Never contacts a database/server.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  let checks=0;
  try {
    const context=await browser.newContext(), requests=[], errors=[];
    const departments=[{id:1,dept_name:'ฝ่ายเดิม',is_active:1,sort_order:0,can_delete:false}], users=[
      {id:1,username:'unknown',display_name:'Legacy',role:'staff',dept_name:'ฝ่ายเก่านอก Master'},
      {id:2,username:'inactive',display_name:'Inactive',role:'staff',dept_name:'ฝ่ายปิดแล้ว',department_id:8}
    ];
    await context.addInitScript(()=>localStorage.setItem('role','admin'));
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!=='http://department.test')return route.abort();
      let data,status=200;const method=req.method(),body=req.postDataJSON();
      if(url.pathname.startsWith('/api/')){
        requests.push({url:url.pathname,method});
        if(!['GET','HEAD'].includes(method))assert.equal(req.headers()['x-survey-csrf'],'a'.repeat(64));
        if(url.pathname==='/api/session')data={user:{role:'admin'},csrfToken:'a'.repeat(64)};
        else if(url.pathname==='/api/departments')data=departments.filter(d=>d.is_active);
        else if(url.pathname==='/api/admin/users')data=users;
        else if(url.pathname==='/api/admin/departments' && method==='GET')data=departments;
        else if(url.pathname==='/api/admin/departments' && method==='POST'){departments.push({id:2,...body,can_delete:true});data={ok:true};}
        else if(url.pathname==='/api/admin/departments/2' && method==='PUT'){Object.assign(departments[1],body);data={ok:true};}
        else if(url.pathname==='/api/admin/departments/2' && method==='DELETE'){departments.splice(1,1);data={ok:true};}
        else if(url.pathname==='/api/admin/departments/1' && method==='DELETE'){status=409;data={error:'ฝ่ายนี้มีประวัติการใช้งานแล้ว ไม่สามารถลบได้ กรุณาเลือกปิดใช้งานแทน'};}
        else throw Error('Unexpected API '+method+' '+url.pathname);
        return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      }
      const file=path.join(__dirname,'../public',url.pathname.slice(1));
      if(!fs.existsSync(file))return route.abort();
      return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(file)});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS '+label);};
    await page.goto('http://department.test/admin-departments.html');
    await page.getByRole('button',{name:'แก้ไข ฝ่ายเดิม',exact:true}).waitFor();
    check(await page.locator('#departmentRows tr').count()===1,'load master from API');
    await page.locator('#addDepartment').click();check(!await page.locator('#deleteDepartment').isVisible(),'add modal hides delete');
    await page.locator('#departmentName').fill('ฝ่ายใหม่');await page.getByRole('button',{name:'บันทึก',exact:true}).click();
    await page.getByRole('button',{name:'แก้ไข ฝ่ายใหม่',exact:true}).waitFor();
    check(departments.length===2,'create via API');
    const adminUsers=await context.newPage();await adminUsers.goto('http://department.test/admin-users.html');
    await adminUsers.locator('#newDeptName option[value="2"]').waitFor({state:'attached'});
    check((await adminUsers.locator('#newDeptName').textContent()).includes('ฝ่ายใหม่'),'new master appears in Users dropdown');
    check((await adminUsers.locator('#userGroups').textContent()).includes('ฝ่ายเก่านอก Master'),'unknown legacy user renders');
    check((await adminUsers.locator('#userGroups').textContent()).includes('ฝ่ายปิดแล้ว'),'inactive user renders');
    await page.getByRole('button',{name:'แก้ไข ฝ่ายใหม่',exact:true}).click();
    check(await page.locator('#deleteDepartment').isVisible(),'edit modal shows delete in heading');
    check(await page.locator('.dialog-heading #deleteDepartment').count()===1,'delete remains in approved heading layout');
    await page.locator('#departmentName').fill('ฝ่ายเปลี่ยนชื่อ');await page.locator('input[value="inactive"]').check();
    await page.getByRole('button',{name:'บันทึก',exact:true}).click();await page.getByRole('button',{name:'แก้ไข ฝ่ายเปลี่ยนชื่อ',exact:true}).waitFor();
    await adminUsers.reload();await adminUsers.locator('#userGroups .user-group').first().waitFor();
    check(!await adminUsers.locator('#newDeptName option[value="2"]').count(),'inactive excluded from new users');
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:820});await page.getByRole('button',{name:'แก้ไข ฝ่ายเปลี่ยนชื่อ',exact:true}).click();
      const box=await page.locator('#departmentDialog').boundingBox();check(box.x>=0 && box.x+box.width<=width,'modal fits viewport '+width);
      await page.locator('#cancelDepartment').click();
    }
    await page.getByRole('button',{name:'แก้ไข ฝ่ายเปลี่ยนชื่อ',exact:true}).click();await page.locator('#deleteDepartment').click();
    await page.waitForFunction(()=>document.querySelectorAll('#departmentRows tr').length===1);check(departments.length===1,'confirmed unused deletion');
    await page.getByRole('button',{name:'แก้ไข ฝ่ายเดิม',exact:true}).click();await page.locator('#deleteDepartment').click();
    await page.waitForTimeout(100);check(await page.locator('#departmentDialog').isVisible() && departments.length===1,'used delete error retains record/modal');
    check(errors.length===0,'no browser exceptions');check(requests.some(r=>r.method==='PUT'),'PUT used for edit');
    console.log(checks+' browser checks passed (mock API only)');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
