// Real HTTP + MySQL integration. Every direct connection is fail-closed to the named isolated DB.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const safety=require('../test-db-safety'),M=require('../public/mixed-questions'),snap=require('../public/section-snapshot');
const base='http://127.0.0.1:33009';let cookie='',csrf='',passed=0;
async function api(method,url,body,expected=200,anonymous=false){
 if(url==='/api/submissions'&&body?.payload?.mixed_questions){const form=(await (await fetch(base+'/api/forms/'+body.form_id)).json()).form;body.payload.mixed_questions.snapshot_token=M.snapshotToken(form);}
 const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(anonymous?{}:{Cookie:cookie,'x-survey-csrf':csrf})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,expected,method+' '+url+' '+JSON.stringify(data));return {r,data};}
(async()=>{const db=await safety.connectDisposable({...safety.DISPOSABLE_TARGET,user:'root'},process.argv.includes('--allow-destructive-test'));let testServer;try{
 testServer=await require('./disposable-server.cjs').start();
 // Explicit fixture reset ONLY after exact target + server identity verification.
 for(const table of ['submissions','survey_forms','question_bank','survey_question_groups','survey_question_categories','question_bank_years'])await db.query('DELETE FROM '+table);
 await db.query('DELETE FROM survey_sections WHERE id>5');
 await db.execute("INSERT INTO users(username,password,role,display_name) VALUES ('mixed_test_admin','local-fixture-password','admin','Local Fixture') ON DUPLICATE KEY UPDATE password=VALUES(password)");
 const login=await api('POST','/api/login',{username:'mixed_test_admin',password:'local-fixture-password'});cookie=login.r.headers.get('set-cookie').split(';')[0];csrf=(await api('GET','/api/session')).data.csrfToken;passed++;
 await api('POST','/api/admin/question-bank/years',{fiscal_year:2570});
 const sid=(await api('POST','/api/survey-sections',{title:'Custom integration',sort_order:0,default_question_type:'checkbox'})).data.id;passed++;
 const cid=(await api('POST','/api/survey-question-categories?fiscal_year=2570',{section_id:sid,title:'Category integration',default_question_type:null,is_active:true})).data.id;
 const gid=(await api('POST','/api/survey-question-groups?fiscal_year=2570',{category_id:cid,title:'Group integration',default_question_type:null,is_active:true})).data.id;
 const choices=[{id:'clean',label:'Clean'},{id:'other',label:'Other',is_other:true}];
 const create=async body=>(await api('POST','/api/admin/questions?fiscal_year=2570',{group_id:gid,question_text:'Question '+body.question_type,required:true,...body})).data.id;
 const checkbox=await create({question_type:'inherit',choices});
 const rating=await create({question_type:'rating'}),text=await create({question_type:'textarea',required:false});passed++;
 await api('PUT',`/api/survey-question-groups/${gid}?fiscal_year=2570`,{title:'Group integration',default_question_type:'textarea',is_active:true});
 const fresh=await create({question_type:'inherit'});
 const rows=(await api('GET','/api/admin/questions?fiscal_year=2570')).data;assert.equal(rows.find(q=>q.id===checkbox).question_type,'checkbox');assert.equal(rows.find(q=>q.id===fresh).question_type,'textarea');passed++;
 const structure=(await api('GET','/api/question-bank/custom-structure?fiscal_year=2570')).data;assert.equal(structure[0].categories[0].groups[0].questions.length,4);
 assert.equal((await api('GET','/api/question-bank/custom-structure?fiscal_year=legacy')).data[0].categories.length,0);passed++;
 const custom=M.copy(structure);for(const s of custom)for(const c of s.categories)for(const g of c.groups)g.questions=g.questions.filter(q=>q.questionBankId!==fresh).map(q=>({...q,questionId:'mixed_'+q.questionBankId}));
 const form=snap.attach({start_date:'2026-10-01',end_date:'2026-10-02',fiscal_year:2570,question_bank_fiscal_year:2570,custom_sections:custom,section2_models:[],form_title:'Mixed fixture'});
 const body={form,start_date:form.start_date,end_date:form.end_date,fiscal_year:2570,form_title:'Mixed fixture'};
 const fid=(await api('POST','/api/forms',body)).data.id;passed++;
 // First edit is permitted before responses and preserves existing question IDs.
 await api('PUT',`/api/forms/${fid}`,body);
 const ans=M.flatten(form).map(({q})=>({questionId:q.questionId,value:q.question_type==='rating'?4:q.question_type==='checkbox'?['clean','other']:'5',other:{other:'private-other-text'}}));
 const submit=answers=>api('POST','/api/submissions',{form_id:fid,payload:{fiscal_year:2999,mixed_questions:{answers}}},200,true);
 await api('POST','/api/submissions',{form_id:fid,payload:{mixed_questions:{answers:[]}}},400,true);
 const bad=M.copy(ans);bad.find(a=>a.questionId==='mixed_'+checkbox).value=['forged'];await api('POST','/api/submissions',{form_id:fid,payload:{mixed_questions:{answers:bad}}},400,true);passed++;
 await submit(ans);const [[sub]]=await db.execute('SELECT payload_json FROM submissions WHERE form_id=?',[fid]);const payload=JSON.parse(sub.payload_json);assert.equal(payload.fiscal_year,2570);assert.equal(payload.fiscal_year_source,'form_start_date');assert.deepEqual(payload.mixed_questions.sections,form.custom_sections);passed++;
 const forgedRatings={form_id:fid,payload:{ratings:[{questionId:'mixed_'+rating,value:5}],mixed_questions:{answers:ans}}};
 await api('POST','/api/submissions',forgedRatings,400,true);
 for(const identity of [{question_id:'mixed_'+rating},{questionBankId:rating},{question_bank_id:rating}]) {
  await api('POST','/api/submissions',{...forgedRatings,payload:{...forgedRatings.payload,ratings:[{...identity,value:5}]}},400,true);
 }
 const changed=M.copy(body);M.flatten(changed.form).find(x=>x.q.question_type==='checkbox').q.choices.pop();changed.confirm_existing_responses=true;
 await api('PUT',`/api/forms/${fid}`,changed,409);await api('PUT',`/api/forms/${fid}`,{...body,confirm_existing_responses:true});passed++;
 const oldClient=M.copy(body);delete oldClient.form.custom_sections;oldClient.confirm_existing_responses=true;
 await api('PUT',`/api/forms/${fid}`,oldClient);
 assert.deepEqual((await api('GET',`/api/forms/${fid}`)).data.form.custom_sections,form.custom_sections);passed++;
 // Same row lock used by a form edit must hold a concurrent submission until commit/rollback.
 await db.beginTransaction();await db.execute('SELECT id FROM survey_forms WHERE id=? FOR UPDATE',[fid]);let done=false;const pending=submit(ans).then(()=>{done=true;});await new Promise(r=>setTimeout(r,150));assert.equal(done,false);await db.rollback();await pending;passed++;
 // Bank changes must never reinterpret saved Form or Submission snapshots.
 await api('PUT',`/api/admin/questions/${rating}?fiscal_year=2570`,{group_id:gid,question_text:'Admin changed template',question_type:'textarea',required:false});
 const copied=M.copy(body);copied.form.mixed_copy_source_form_id=fid;for(const {q}of M.flatten(copied.form))q.questionId='copy_'+q.questionId;const copyId=(await api('POST','/api/forms',copied)).data.id;assert.notEqual(copyId,fid);passed++;
 const result=(await api('GET',`/api/forms/${fid}/results`)).data;assert.equal(result.average_score,0);assert.equal(result.custom_questions.find(q=>q.type==='rating').mean,4);assert.equal(result.custom_questions.find(q=>q.type==='checkbox').respondent_count,2);assert(result.custom_questions.some(q=>q.comments?.includes('5')));
 const pub=(await api('GET','/api/dashboard/summary?role=public',null,200,true)).data;assert.equal(pub.kpi.avgSatisfaction,0);assert(!pub.custom_questions.some(q=>q.type==='textarea'));assert(!JSON.stringify(pub.custom_questions).includes('private-other-text'));
 const strategy=(await api('GET','/api/strategy-dashboard/summary?role=public',null,200,true)).data;assert.equal(strategy.kpi.avgSatisfaction,0);assert(strategy.custom_questions.some(q=>q.type==='checkbox'));passed++;
 const publicResult=(await api('GET',`/api/forms/${fid}/results?role=admin`,null,200,true)).data;
 assert(!publicResult.custom_questions.some(q=>q.type==='textarea'));assert(!JSON.stringify(publicResult.custom_questions).includes('private-other-text'));passed++;
 const clone=(await api('POST','/api/admin/question-bank/years',{fiscal_year:2571})).data;assert.equal(clone.counts.questions,4);const cloned=(await api('GET','/api/admin/questions?fiscal_year=2571')).data;const cq=cloned.find(q=>q.question_type==='checkbox');assert.notEqual(cq.id,checkbox);assert.notEqual(cq.group_id,gid);assert.deepEqual(typeof cq.choices_json==='string'?JSON.parse(cq.choices_json):cq.choices_json,payload.mixed_questions.sections[0].categories[0].groups[0].questions.find(q=>q.question_type==='checkbox').choices);passed++;
 fs.writeFileSync(path.join(require('os').tmpdir(),'survey-mixed-disposable-state.json'),JSON.stringify({fid,copyId,sid,cid,gid,checkbox,rating,text}));
 console.log(JSON.stringify({passed,failed:0,database:safety.DISPOSABLE_TARGET.database,scope:'real HTTP, auth/CSRF, inheritance, all types, snapshots, required, copy, locks, reports and clone'}));
 }finally{if(testServer)await testServer.stop();await db.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
