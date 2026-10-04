"use strict";
const M = require('./public/mixed-questions');
const fail = message => { throw Object.assign(new Error(message),{status:400}); };
async function context(db, group) {
  const [cats]=await db.execute('SELECT * FROM survey_question_categories WHERE id = ? AND fiscal_year <=> ?', [group.category_id,group.fiscal_year]);
  const c=cats[0]; if(!c)fail('ไม่พบ Category ในปีเดียวกัน');
  const [secs]=await db.execute('SELECT * FROM survey_sections WHERE id = ?', [c.section_id]);
  return {g:group,c,s:secs[0]};
}
async function questionFields(db, group, body, old) {
  if(!group) {if(body.question_type==='checkbox')fail('Checkbox ต้องอยู่ใน Custom Section');return {};}
  const {s,c,g}=await context(db,group);
  if(!M.custom(s?.section_key)) {if(body.question_type==='checkbox'||body.question_type==='inherit')fail('ประเภทนี้ใช้ได้เฉพาะ Custom Section');return {};}
  const inherited=!body.question_type||body.question_type==='inherit';
  const resolved=inherited?(old?.question_type||g.default_question_type||c.default_question_type||s.default_question_type||'rating'):body.question_type;
  M.type(resolved);
  const cs=M.choices(body.choices??old?.choices_json,resolved);
  return {question_type:resolved,question_type_source:inherited?'inherit':'override',is_required:body.required===undefined?(old?.is_required??1):body.required===true?1:0,choices_json:JSON.stringify(cs)};
}
async function structure(db,set) {
  const [sections]=await db.execute('SELECT * FROM survey_sections ORDER BY sort_order, id');
  return sections.filter(s=>M.custom(s.section_key)&&s.is_active).map(s=>({section_key:s.section_key,title:s.title,description:s.description||'',categories:
    set.categories.filter(c=>c.section_id===s.id&&c.is_active).map(c=>({category_id:c.id,title:c.title,groups:
      set.groups.filter(g=>g.category_id===c.id&&g.is_active).map(g=>({group_id:g.id,title:g.title,questions:
        set.questions.filter(q=>q.group_id===g.id&&q.status==='active').map(q=>({questionBankId:q.id,questionText:q.question_text,question_type:M.type(q.question_type),required:q.is_required!==0,choices:M.choices(q.choices_json,q.question_type)}))}))}))}));
}
const signature=q=>JSON.stringify([q.questionBankId,q.questionText,q.question_type,q.required,q.choices]);
async function validateForm(db,form,oldForm={}) {
  const incoming=M.flatten(form); if(!incoming.length)return;
  const prior=M.flatten(oldForm);
  let copied=[];
  if(form.mixed_copy_source_form_id) {
    const [rows]=await db.execute('SELECT form_json FROM survey_forms WHERE id = ?',[Number(form.mixed_copy_source_form_id)]);
    if(!rows.length)fail('ไม่พบฟอร์มต้นฉบับ');
    copied=M.flatten(JSON.parse(rows[0].form_json));
  }
  const year=form.question_bank_fiscal_year;
  if(year===undefined)fail('Custom Questions ต้องมีปีของคลังคำถาม');
  for(const x of incoming) {
    const {s,c,g,q}=x;
    const saved=[...prior,...copied].find(p=>p.s.section_key===s.section_key&&p.c.category_id===c.category_id&&p.g.group_id===g.group_id&&signature(p.q)===signature(q));
    if(saved)continue;
    const [rows]=await db.execute('SELECT * FROM question_bank WHERE id = ? AND fiscal_year <=> ?',[q.questionBankId,year]);
    const row=rows[0];if(!row||row.deleted_at||row.status!=='active'||Number(row.group_id)!==g.group_id)fail('คำถามไม่อยู่ใน Group/ปีที่เลือก');
    const [gs]=await db.execute('SELECT * FROM survey_question_groups WHERE id = ? AND fiscal_year <=> ?',[g.group_id,year]);
    if(!gs[0])fail('ไม่พบ Group');const ctx=await context(db,gs[0]);
    if(!ctx.g.is_active||!ctx.c.is_active||!ctx.s?.is_active||ctx.c.id!==c.category_id||ctx.s.section_key!==s.section_key||!M.custom(s.section_key))fail('โครงสร้างคำถามไม่ถูกต้อง');
    const canonical={questionBankId:row.id,questionText:row.question_text,question_type:row.question_type,required:row.is_required!==0,choices:M.choices(row.choices_json,row.question_type)};
    if(signature(q)!==signature(canonical))fail('ประเภท/ตัวเลือกต้องตรงกับคลังคำถาม กรุณาโหลดใหม่');
  }
}
module.exports={context,questionFields,structure,validateForm};
