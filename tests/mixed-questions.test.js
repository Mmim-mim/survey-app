const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../public/mixed-questions'),B=require('../mixed-bank');
function form(){return {custom_sections:[{section_key:'custom_12345678-1234-1234-1234-123456789abc',title:'Custom',categories:[{category_id:1000,title:'Category',groups:[{group_id:2000,title:'Group',questions:[
 {questionId:'r',questionBankId:3000,questionText:'Rating',question_type:'rating',required:true,choices:[]},
 {questionId:'c',questionBankId:3001,questionText:'Checkbox',question_type:'checkbox',required:true,choices:[{id:'a',label:'A',is_other:false,sort_order:0},{id:'other',label:'Other',is_other:true,sort_order:1}]},
 {questionId:'t',questionBankId:3002,questionText:'Text',question_type:'textarea',required:false,choices:[]}
]}]}]}]};}
const answers=()=>[{questionId:'r',value:5},{questionId:'c',value:['a','other'],other:{other:'Detail'}},{questionId:'t',value:'5'}];
test('Mixed types coexist; checkbox uses stable IDs and text remains a string',()=>{
 const out=M.validateAnswers(form(),answers());assert.equal(out[0].value,5);assert.deepEqual(out[1].value,['a','other']);assert.equal(out[2].value,'5');
});
test('Required, type, range, unknown/duplicate choices are rejected',()=>{
 for(const value of [0,6,2.5,'5',null]){const a=answers();a[0].value=value;assert.throws(()=>M.validateAnswers(form(),a));}
 for(const value of [[],['unknown'],['a','a'],'a']){const a=answers();a[1].value=value;assert.throws(()=>M.validateAnswers(form(),a));}
 assert.throws(()=>M.validateAnswers(form(),[...answers(),{questionId:'unknown',value:1}]));
});
test('Optional blanks and required whitespace have distinct semantics',()=>{
 const f=form(),a=answers();a[2].value='  ';assert.equal(M.validateAnswers(f,a)[2].value,'');M.flatten(f)[2].q.required=true;assert.throws(()=>M.validateAnswers(f,a));
});
test('Snapshots lock retained type, labels and choices after first response; copies can change',()=>{
 for(const mutate of [f=>M.flatten(f)[0].q.question_type='textarea',f=>M.flatten(f)[1].q.choices.pop(),f=>M.flatten(f)[1].q.choices[0].label='New']){
 const old=form(),next=form();mutate(next);assert.throws(()=>M.assertUnchanged(old,next,true));M.assertUnchanged(old,next,false);
 }
 M.assertUnchanged({}, {},true);
});
test('Custom Section identity is independent of sort order and excludes system Sections',()=>{
 const f=form();f.custom_sections[0].sort_order=1;assert.equal(M.flatten(f).length,3);f.custom_sections[0].section_key='rating_questions';assert.throws(()=>M.sections(f));
});
test('Checkbox denominator is respondents to that question, public summaries exclude text/Other',()=>{
 const f=form();M.flatten(f)[1].q.required=false;
 const a=answers(),b=answers();b[1].value=[];b[0].value=1;
 const ps=[a,b].map(answers=>({mixed_questions:{version:1,sections:f.custom_sections,answers}}));
 const report=M.aggregate(ps,true),c=report.find(r=>r.type==='checkbox'),r=report.find(r=>r.type==='rating');
 assert.equal(c.respondent_count,1);assert.deepEqual(c.choices.map(c=>c.percent),[100,100]);assert.equal(r.mean,3);assert.equal(r.sd,Math.sqrt(8));
 assert.equal(report.find(r=>r.type==='textarea').respondent_count,2);
 const pub=M.aggregate(ps,false);assert(!pub.some(r=>r.type==='textarea'));assert(!JSON.stringify(pub).includes('Detail'));assert(pub.every(r=>!r.comments));
});
test('Default inheritance resolves only on creation; existing resolved question stays unchanged',async()=>{
 const s={section_key:form().custom_sections[0].section_key,default_question_type:'textarea'},c={section_id:6,default_question_type:null};
 const db={execute:async sql=>[sql.includes('survey_sections')?[s]:[c]]};const g={category_id:1000,fiscal_year:2570,default_question_type:null};
 assert.equal((await B.questionFields(db,g,{question_type:'inherit'},null)).question_type,'textarea');
 c.default_question_type='checkbox';g.default_question_type='rating';assert.equal((await B.questionFields(db,g,{question_type:'inherit'},null)).question_type,'rating');
 g.default_question_type='textarea';assert.equal((await B.questionFields(db,g,{question_type:'inherit'},{question_type:'rating'})).question_type,'rating');
 assert.equal((await B.questionFields(db,g,{question_type:'checkbox',choices:[{id:'a',label:'A'}]},null)).question_type,'checkbox');
});
test('Checkbox choices reject empty sets and unstable duplicate identity',()=>{
 assert.throws(()=>M.choices([],'checkbox'));assert.throws(()=>M.choices([{id:'a',label:'A'},{id:'a',label:'B'}],'checkbox'));
});
module.exports={form,answers};
test('Selected Other requires text, alone or with ordinary choices',()=>{
 for(const value of [['other'],['a','other']]) {
  const a=answers();a[1]={questionId:'c',value};
  assert.throws(()=>M.validateAnswers(form(),a));
  a[1].other={other:'  '};assert.throws(()=>M.validateAnswers(form(),a));
  a[1].other={other:'Detail'};
  assert.deepEqual(M.validateAnswers(form(),a)[1],{questionId:'c',value,other:{other:'Detail'}});
 }
 const a=answers();a[1]={questionId:'c',value:['a']};
 assert.deepEqual(M.validateAnswers(form(),a)[1].value,['a']);
});
test('Historical and new Other text aggregate together without rewriting snapshots',()=>{
 const f=form(),old={mixed_questions:{version:1,sections:f.custom_sections,answers:answers()}};
 const before=JSON.stringify(old),a=answers();a[1]={questionId:'c',value:['other'],other:{other:'New detail'}};
 const fresh={mixed_questions:{version:1,sections:f.custom_sections,answers:M.validateAnswers(f,a)}};
 const result=M.aggregate([old,fresh],true).find(r=>r.type==='checkbox');
 assert.equal(result.respondent_count,2);
 assert.deepEqual(result.choices.map(c=>[c.id,c.count,c.percent]),[['a',1,50],['other',2,100]]);
 assert.deepEqual(result.comments,['Detail','New detail']);assert.equal(JSON.stringify(old),before);
 assert(!JSON.stringify(M.aggregate([old,fresh],false)).includes('Detail'));
});
