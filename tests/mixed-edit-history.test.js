const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../public/mixed-questions');
const form=()=>({custom_sections:[{section_key:'custom_12345678-1234-1234-1234-123456789abc',title:'S',categories:[{category_id:1,title:'C',groups:[{group_id:1,title:'G',questions:[{questionId:'old',questionBankId:1,questionText:'Text',question_type:'textarea',required:false,choices:[]}]}]}]}]});
test('Removal/re-add protects historical IDs and Result snapshots',()=>{
 const old=form(),empty={custom_sections:[]},copy=JSON.stringify(old);
 M.assertUnchanged(old,empty,true,[old]);assert.throws(()=>M.assertUnchanged(empty,old,true,[old]));
 const added=form();M.flatten(added)[0].q.questionId='new';M.assertUnchanged(empty,added,true,[old]);
 const result=M.aggregate([old,added].map((f,i)=>({mixed_questions:{version:1,sections:f.custom_sections,answers:[{questionId:i?'new':'old',value:i?'after':'before'}]}})),true);
 assert.equal(result.length,2);assert.deepEqual(result.map(r=>r.comments),[['before'],['after']]);assert.equal(JSON.stringify(old),copy);
});
test('Stale Preview rejects removed/changed/added snapshot and missing token; legacy remains accepted',()=>{
 const old=form(),token=M.snapshotToken(old);M.assertPreview(old,token,true);
 assert.throws(()=>M.assertPreview({},token,true),{code:'FORM_SNAPSHOT_CHANGED'});
 assert.throws(()=>M.assertPreview(old,undefined,true),{code:'FORM_SNAPSHOT_CHANGED'});
 const next=form();M.flatten(next)[0].q.required=true;assert.throws(()=>M.assertPreview(next,token,true));M.assertPreview({},undefined,false);
});
