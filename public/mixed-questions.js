(function(root) {
  'use strict';
  const types = ['rating', 'checkbox', 'textarea'];
  const custom = key => /^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key || '');
  function fail(message) { throw Object.assign(new Error(message), {status:400}); }
  const copy = v => JSON.parse(JSON.stringify(v));
  function type(value, nullable = false) {
    if (nullable && (value == null || value === '' || value === 'inherit')) return null;
    if (!types.includes(value)) fail('ประเภทคำถามไม่ถูกต้อง');
    return value;
  }
  function choices(value, questionType) {
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { fail('ตัวเลือกไม่ถูกต้อง'); } }
    if (questionType !== 'checkbox') return [];
    if (!Array.isArray(value) || !value.length || value.length > 100) fail('Checkbox ต้องมีตัวเลือกอย่างน้อย 1 รายการ (สูงสุด 100)');
    const seen = new Set();
    return value.map((c, i) => {
      if (!c || typeof c.id !== 'string' || !/^[\w-]{1,100}$/.test(c.id) || seen.has(c.id)) fail('Choice ID ต้องไม่ซ้ำและต้องคงที่');
      seen.add(c.id);
      if (typeof c.label !== 'string' || !c.label.trim() || c.label.length > 1000) fail('กรุณากรอกข้อความตัวเลือก');
      return {id:c.id, label:c.label.trim(), is_other:c.is_other === true, sort_order:i};
    });
  }
  function sections(form) {
    const rows = form.custom_sections ?? [];
    if (!Array.isArray(rows) || rows.length > 100) fail('Custom Sections ไม่ถูกต้อง');
    const ids = new Set(), keys = new Set(); let total = 0;
    for (const c of form.section2_models || []) for (const g of c.dimensions || []) for (const q of g.questions || []) if (q?.questionId) ids.add(q.questionId);
    for (const s of rows) {
      if (!custom(s.section_key) || keys.has(s.section_key) || typeof s.title !== 'string' || !Array.isArray(s.categories)) fail('Custom Section identity ไม่ถูกต้อง');
      keys.add(s.section_key);
      for (const c of s.categories) {
        if (!Number.isSafeInteger(c.category_id) || !Array.isArray(c.groups)) fail('Category ไม่ถูกต้อง');
        for (const g of c.groups) {
          if (!Number.isSafeInteger(g.group_id) || !Array.isArray(g.questions)) fail('Group ไม่ถูกต้อง');
          for (const q of g.questions) {
            if (++total > 1000 || typeof q.questionId !== 'string' || !/^[\w-]{1,100}$/.test(q.questionId) || ids.has(q.questionId)) fail('questionId ต้องไม่ซ้ำ');
            ids.add(q.questionId); type(q.question_type);
            if (!Number.isSafeInteger(q.questionBankId) || q.questionBankId <= 0 || typeof q.questionText !== 'string' || !q.questionText.trim() || typeof q.required !== 'boolean') fail('Question Snapshot ไม่ถูกต้อง');
            q.choices = choices(q.choices, q.question_type);
          }
        }
      }
    }
    return rows;
  }
  function flatten(form) {
    const out=[];
    for(const s of sections(form)) for(const c of s.categories) for(const g of c.groups) for(const q of g.questions) out.push({s,c,g,q});
    return out;
  }
  function validateAnswers(form, input) {
    const list = flatten(form), answers = input ?? [];
    if (!Array.isArray(answers) || answers.length > list.length) fail('คำตอบ Custom ไม่ถูกต้อง');
    const map = new Map();
    for(const a of answers) {
      if (!a || map.has(a.questionId) || !list.some(x=>x.q.questionId===a.questionId)) fail('คำตอบอ้างอิงคำถามที่ไม่มีหรือซ้ำ');
      map.set(a.questionId,a);
    }
    return list.map(({q})=>{
      const a=map.get(q.questionId), v=a?.value;
      const empty=v==null || v==='' || (Array.isArray(v)&&!v.length);
      if(empty) { if(q.required) fail('กรุณาตอบ: '+q.questionText); return {questionId:q.questionId,value:q.question_type==='checkbox'?[]:q.question_type==='textarea'?'':null}; }
      if(q.question_type==='rating') {
        if(typeof v!=='number'||!Number.isInteger(v)||v<1||v>5) fail('คะแนนต้องเป็นจำนวนเต็ม 1–5');
        return {questionId:q.questionId,value:v};
      }
      if(q.question_type==='textarea') {
        if(typeof v!=='string'||v.length>10000) fail('ข้อความต้องไม่เกิน 10000 ตัวอักษร');
        if(q.required&&!v.trim()) fail('กรุณาตอบ: '+q.questionText);
        return {questionId:q.questionId,value:v.trim()};
      }
      if(!Array.isArray(v)||new Set(v).size!==v.length||v.some(id=>!q.choices.some(c=>c.id===id))) fail('ตัวเลือก Checkbox ไม่ตรงกับฟอร์ม');
      const other={};
      for(const c of q.choices.filter(c=>c.is_other&&v.includes(c.id))) {
        const text=a.other?.[c.id];
        if(typeof text!=='string'||!text.trim()||text.length>10000) fail('กรุณาระบุข้อความสำหรับตัวเลือกอื่น ๆ');
        Object.defineProperty(other,c.id,{value:text.trim(),enumerable:true});
      }
      return {questionId:q.questionId,value:[...v],other};
    });
  }
  function snapshotToken(form) { return JSON.stringify(sections(copy(form))); }
  function assertPreview(form, token, hasAnswers=false) {
    if ((flatten(form).length || hasAnswers || token !== undefined) && token !== snapshotToken(form)) {
      throw Object.assign(new Error('แบบประเมินมีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่ก่อนส่งคำตอบ'),{status:409,code:'FORM_SNAPSHOT_CHANGED'});
    }
  }
  function assertUnchanged(oldForm, form, hasResponses, history=[]) {
    const old=flatten(oldForm), next=flatten(form);
    if(!hasResponses)return;
    const signature=x=>JSON.stringify([x.s.section_key,x.c.category_id,x.g.group_id,x.q.questionBankId,x.q.questionText,x.q.question_type,x.q.choices]);
    const past=[...old,...history.flatMap(f=>flatten(f))];
    for(const x of next) {
      const retained=old.find(p=>p.q.questionId===x.q.questionId);
      const used=past.filter(p=>p.q.questionId===x.q.questionId);
      if((used.length&&!retained)||used.some(p=>signature(p)!==signature(x))) {
        throw Object.assign(new Error('ห้ามใช้ questionId เดิมกับคำถามที่เปลี่ยนความหมาย กรุณาเอาคำถามเดิมออกและเลือกคำถามใหม่'),{status:409});
      }
      if(old.some(p=>signature(p)===signature(x)&&p.q.questionId!==x.q.questionId)) {
        throw Object.assign(new Error('คำถามเดิมที่ยังอยู่ต้องรักษา questionId เดิม'),{status:409});
      }
    }
  }
  function aggregate(payloads, includeText=false) {
    const rows=new Map();
    for(const p of payloads) {
      if(!p?.mixed_questions || p.mixed_questions.version!==1) continue;
      let list, answers; try { list=flatten({custom_sections:p.mixed_questions.sections}); answers=validateAnswers({custom_sections:p.mixed_questions.sections},p.mixed_questions.answers); } catch { continue; }
      const map=new Map(answers.map(a=>[a.questionId,a]));
      for(const {s,c,g,q} of list) {
        if(q.question_type==='textarea'&&!includeText) continue;
        const key=JSON.stringify([s.section_key,c.category_id,g.group_id,q.questionId,q.question_type,q.choices]);
        if(!rows.has(key)) rows.set(key,{section:s.title,section_key:s.section_key,category:c.title,group:g.title,questionId:q.questionId,question:q.questionText,type:q.question_type,respondent_count:0,choices:q.choices.map(c=>({...c,count:0,percent:0})),scores:[],comments:[]});
        const r=rows.get(key),a=map.get(q.questionId),v=a?.value;
        if(v==null||v===''||(Array.isArray(v)&&!v.length)) continue;
        r.respondent_count++;
        if(q.question_type==='rating')r.scores.push(v);
        else if(q.question_type==='checkbox') { for(const ch of r.choices)if(v.includes(ch.id))ch.count++; if(includeText)r.comments.push(...Object.values(a.other||{})); }
        else r.comments.push(v);
      }
    }
    return [...rows.values()].map(r=>{
      if(r.type==='rating'){r.mean=r.scores.length?r.scores.reduce((a,b)=>a+b,0)/r.scores.length:0;r.sd=r.scores.length>1?Math.sqrt(r.scores.reduce((a,b)=>a+(b-r.mean)**2,0)/(r.scores.length-1)):0;}
      for(const c of r.choices)c.percent=r.respondent_count?100*c.count/r.respondent_count:0;
      delete r.scores;if(!includeText)delete r.comments;return r;
    });
  }
  const api={custom,type,choices,sections,flatten,validateAnswers,assertUnchanged,assertPreview,snapshotToken,aggregate,copy};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MixedQuestions=api;
})(typeof globalThis!=='undefined'?globalThis:this);
