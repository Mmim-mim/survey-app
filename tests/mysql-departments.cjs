// Opt-in Local UAT integration: all test rows live in ONE outer transaction and roll back.
// No reset, DDL, fixtures, existing user edits, or Form/Submission writes.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {connect,TARGET} = require('../test-db-safety');
async function main() {
  if (!process.argv.includes('--rollback-only-local')) throw Error('Requires --rollback-only-local');
  const db = await connect({...TARGET,user:'root'});
  let checks = 0;
  try {
    await db.beginTransaction();
    const pool = {execute:db.execute.bind(db), async getConnection(){return {
      execute:db.execute.bind(db), beginTransaction:()=>db.query('SAVEPOINT department_test'),
      commit:()=>db.query('RELEASE SAVEPOINT department_test'), rollback:()=>db.query('ROLLBACK TO SAVEPOINT department_test'), release(){}
    };}};
    const routes = new Map(), app = {use(){},listen(){}};
    for(const method of ['get','post','put','delete'])app[method]=(url,handler)=>routes.set(method.toUpperCase()+' '+url,handler);
    const express = Object.assign(()=>app,{json(){},static(){}});
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server.js'),'utf8'),{
      require(name){if(name==='express')return express;if(name==='cors')return ()=>{};if(name==='dotenv')return {config(){}};if(name==='mysql2/promise')return {createPool:()=>pool};return name.startsWith('./')?require('../'+name.slice(2)):require(name);},
      __dirname:path.join(__dirname,'..'),process:{env:{}},console:{log(){},error(){}}
    });
    async function call(method,url,body={},id){
      const res={code:200,status(n){this.code=n;return this;},json(data){this.data=data;},set(){}};
      await routes.get(method+' '+url)({body,params:{id:String(id)},authUser:{role:'admin'},query:{}},res);return res;
    }
    function check(condition,label){assert.ok(condition,label);checks++;console.log('PASS '+label);}
    const prefix='Department rollback '+Date.now();
    let result=await call('POST','/api/admin/departments',{dept_name:prefix,is_active:true,sort_order:7});
    check(result.code===201,'create department');const key=result.data.id;
    result=await call('GET','/api/departments');check(result.data.some(d=>d.id===key),'active API includes new department');
    result=await call('POST','/api/admin/departments',{dept_name:' '+prefix+' ',is_active:true});check(result.code===409,'duplicate trimmed name rejected');
    result=await call('POST','/api/admin/users',{username:'dept_'+Date.now(),password:'test-only-'+Date.now(),role:'staff',department_id:key});
    check(result.code===200,'create user with active department');const userId=result.data.id;
    result=await call('POST','/api/admin/users',{username:'invalid_'+Date.now(),password:'test',role:'staff',department_id:2147483647});check(result.code===400,'unknown department rejected');
    result=await call('PUT','/api/admin/departments/:id',{dept_name:prefix+' renamed',is_active:false,sort_order:8},key);check(result.code===200,'rename and deactivate');
    const [[user]]=await db.execute('SELECT dept_name,department_id FROM users WHERE id=?',[userId]);check(user.dept_name===prefix && user.department_id===key,'rename preserves user snapshot and ID');
    result=await call('GET','/api/departments');check(!result.data.some(d=>d.id===key),'inactive absent from new assignment options');
    result=await call('PUT','/api/admin/users/:id/dept',{department_id:key},userId);check(result.code===200,'unchanged inactive assignment accepted');
    result=await call('POST','/api/admin/users',{username:'inactive_'+Date.now(),password:'test',role:'staff',department_id:key});check(result.code===400,'new inactive assignment rejected');
    result=await call('GET','/api/admin/users');check(result.data.some(u=>u.id===userId && u.dept_name===prefix),'inactive user remains visible in API');
    result=await call('DELETE','/api/admin/departments/:id',{},key);check(result.code===409,'used department delete rejected');
    result=await call('DELETE','/api/admin/users/:id',{},userId);check(result.code===200,'remove only transaction-created user');
    result=await call('DELETE','/api/admin/departments/:id',{},key);check(result.code===409,'ever-used marker survives user deletion');
    result=await call('POST','/api/admin/departments',{dept_name:prefix,is_active:true});check(result.code===409,'historical alias cannot be reused by another identity');
    result=await call('POST','/api/admin/departments',{dept_name:prefix+' unused',is_active:true});const unused=result.data.id;
    result=await call('DELETE','/api/admin/departments/:id',{},unused);check(result.code===200,'never-used department can be deleted');
    result=await call('GET','/api/admin/departments');check(result.data.find(d=>d.id===key).can_delete===false,'UI delete eligibility reflects usage');
    console.log(checks+' MySQL/API checks passed; rolling back all test data');
  } finally {await db.rollback();await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
