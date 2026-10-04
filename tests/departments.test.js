const test = require('node:test'), assert = require('node:assert/strict');
const D = require('../departments'), {createAuth} = require('../auth-session');
test('department name/status/order validation',()=>{
  assert.deepEqual(D.fields({dept_name:'  ฝ่ายใหม่  ',is_active:true}),{dept_name:'ฝ่ายใหม่',is_active:1,sort_order:0});
  for(const body of [{dept_name:' ',is_active:true},{dept_name:'x'.repeat(256),is_active:true},{dept_name:'a',is_active:'true'},{dept_name:'a',is_active:true,sort_order:-1}]) assert.throws(()=>D.fields(body));
});
test('unchanged legacy/inactive department is preserved without reassignment',()=>{
  assert.equal(D.unchanged({dept_name:'old',department_id:2},{department_id:2}),true);
  assert.equal(D.unchanged({dept_name:'old',department_id:null},{dept_name:'old'}),true);
  assert.equal(D.unchanged({dept_name:'old',department_id:2},{department_id:3}),false);
});
test('assignment locks active master and permanently marks use',async()=>{
  const calls=[];const db={execute:async(sql,args)=>{calls.push(sql);return sql.startsWith('SELECT')?[[{id:7,dept_name:'D',is_active:1}]]:[{}];}};
  assert.equal((await D.assign(db,{department_id:7})).id,7);
  assert.match(calls[0],/FOR UPDATE/);assert.match(calls[1],/COALESCE\(first_used_at/);
});
test('invalid/inactive assignment rejects before usage write',async()=>{
  for(const rows of [[],[{id:2,is_active:0}]]){let writes=0;const db={execute:async sql=>{if(sql.startsWith('UPDATE'))writes++;return [rows];}};await assert.rejects(D.assign(db,{department_id:2}),{status:400});assert.equal(writes,0);}
});
test('failed transaction rolls back and releases connection',async()=>{
  const calls=[];const db=Object.fromEntries(['beginTransaction','commit','rollback','release'].map(k=>[k,()=>calls.push(k)]));
  await assert.rejects(D.transaction({getConnection:async()=>db},()=>{throw Error('failure');}));assert.deepEqual(calls,['beginTransaction','rollback','release']);
});
for(const role of ['anonymous','staff','manager','admin'])test('departments auth/CSRF '+role,async()=>{
  const auth=createAuth({execute:async()=>[[{id:1,role,username:role}]]});let cookie='';
  if(role!=='anonymous')auth.start({headers:{}},{cookie:(k,v)=>cookie=k+'='+v},{id:1});
  async function request(path,method,csrf){let next=false;const req={path,method,headers:{cookie,host:'local',...(csrf?{'x-survey-csrf':csrf}:{})},query:{},body:{}};const res={status(n){this.code=n;return this;},json(v){this.data=v;}};await auth.middleware(req,res,()=>next=true);return {req,res,next};}
  const read=await request('/departments','GET');assert.equal(read.next,role!=='anonymous');
  const denied=await request('/admin/departments','POST');assert.equal(denied.next,false);assert.equal(denied.res.code,role==='anonymous'?401:403);
  if(role==='admin'){const valid=await request('/admin/departments','POST',read.req.authSession.csrf);assert.equal(valid.next,true);}
});
