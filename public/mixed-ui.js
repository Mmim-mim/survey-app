(function(root){
  'use strict';
  const M=root.MixedQuestions;
  const labels={rating:'Rating 1–5',checkbox:'Checkbox (เลือกได้หลายข้อ)',textarea:'ข้อความ'};
  function el(tag,text,parent){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(parent)parent.appendChild(n);return n;}
  function host(id,anchor){let n=document.getElementById(id);if(!n){n=el('div');n.id=id;n.className='mixed-panel';(anchor||document.body).after(n);}return n;}
  let selected=[],available=[],request=0;
  function renderBuilder(){
    const box=host('mixedBuilder',document.querySelector('[data-sec="s5"]')||document.querySelector('#mainModels'));box.replaceChildren();
    el('h3','ส่วนเพิ่มเติมจากคลังคำถาม',box);
    const tree=M.copy(available);
    for(const s of selected){let ts=tree.find(x=>x.section_key===s.section_key);if(!ts){tree.push(M.copy(s));continue;}ts.title=s.title;ts.description=s.description;for(const c of s.categories){let tc=ts.categories.find(x=>x.category_id===c.category_id);if(!tc){ts.categories.push(M.copy(c));continue;}tc.title=c.title;for(const g of c.groups){let tg=tc.groups.find(x=>x.group_id===g.group_id);if(!tg){tc.groups.push(M.copy(g));continue;}tg.title=g.title;for(const q of g.questions){const i=tg.questions.findIndex(x=>x.questionBankId===q.questionBankId);if(i<0)tg.questions.push(M.copy(q));else tg.questions[i]=M.copy(q);}}}}
    box.hidden=!tree.length;
    for(const s of tree){const sd=el('details',null,box);sd.open=true;el('summary',s.title,sd);
      for(const c of s.categories){const cd=el('details',null,sd);el('summary',c.title,cd);
        for(const g of c.groups){const gd=el('details',null,cd);el('summary',g.title,gd);
          for(const q of g.questions){const line=el('label',null,gd),check=el('input',null,line);check.type='checkbox';check.checked=M.flatten({custom_sections:selected}).some(x=>x.q.questionBankId===q.questionBankId&&x.g.group_id===g.group_id);el('span',`${q.questionText} — ${labels[q.question_type]}${q.required?' *':''}`,line);
            check.onchange=()=>{let ss=selected.find(x=>x.section_key===s.section_key);if(!ss){ss={section_key:s.section_key,title:s.title,description:s.description||'',categories:[]};selected.push(ss);}let cc=ss.categories.find(x=>x.category_id===c.category_id);if(!cc){cc={category_id:c.category_id,title:c.title,groups:[]};ss.categories.push(cc);}let gg=cc.groups.find(x=>x.group_id===g.group_id);if(!gg){gg={group_id:g.group_id,title:g.title,questions:[]};cc.groups.push(gg);}if(check.checked)gg.questions.push({...M.copy(q),questionId:crypto.randomUUID()});else gg.questions=gg.questions.filter(x=>x.questionBankId!==q.questionBankId);prune();};
          }
        }
      }
    }
  }
  function prune(){for(const s of selected){for(const c of s.categories)c.groups=c.groups.filter(g=>g.questions.length);s.categories=s.categories.filter(c=>c.groups.length);}selected=selected.filter(s=>s.categories.length);}
  async function load(year,clear=false){const token=++request;if(clear){selected=[];available=[];renderBuilder();}if(!year)return;const r=await fetch('/api/question-bank/custom-structure?'+new URLSearchParams({fiscal_year:year}));const data=await r.json();if(token!==request)return;if(!r.ok)throw Error(data.error||'โหลดส่วนเพิ่มเติมไม่สำเร็จ');available=data;renderBuilder();}
  function apply(form,copy=false){selected=M.copy(form.custom_sections||[]);if(copy)for(const {q}of M.flatten({custom_sections:selected}))q.questionId=crypto.randomUUID();available=[];renderBuilder();}
  let answerForm={};
  function renderAnswers(form){answerForm=form;const box=host('mixedAnswers',document.getElementById('sec5'));box.replaceChildren();box.hidden=!M.flatten(form).length;
    for(const s of M.sections(form)){const card=el('section',null,box);el('h2',s.title,card);el('p',s.description||'',card);for(const c of s.categories){el('h3',c.title,card);for(const g of c.groups){el('h4',g.title,card);for(const q of g.questions){const field=el('fieldset',null,card);field.dataset.questionId=q.questionId;el('legend',q.questionText+(q.required?' *':''),field);
      if(q.question_type==='textarea'){const t=el('textarea',null,field);t.maxLength=10000;t.setAttribute('aria-label',q.questionText);}
      else for(const choice of q.question_type==='rating'?[1,2,3,4,5].map(n=>({id:String(n),label:String(n)})):q.choices){const label=el('label',null,field),input=el('input',null,label);input.type=q.question_type==='rating'?'radio':'checkbox';input.name='mixed_'+q.questionId;input.value=choice.id;el('span',choice.label,label);if(choice.is_other){const row=el('div',null,field);row.className='mixed-other-row';row.appendChild(label);const other=el('input',null,row);other.type='text';other.className='mixed-other-input';other.placeholder='โปรดระบุ';other.dataset.other=choice.id;other.maxLength=10000;other.setAttribute('aria-label','อื่น ๆ (โปรดระบุ)');other.hidden=true;input.onchange=()=>{other.hidden=!input.checked;};}}
    }}}}
  }
  function collectAnswers(){return M.flatten(answerForm).map(({q})=>{const f=[...document.querySelectorAll('#mixedAnswers fieldset')].find(n=>n.dataset.questionId===q.questionId),other={};for(const t of f.querySelectorAll('[data-other]'))Object.defineProperty(other,t.dataset.other,{value:t.value,enumerable:true});return {questionId:q.questionId,value:q.question_type==='textarea'?f.querySelector('textarea').value:q.question_type==='rating'?(f.querySelector('input:checked')?Number(f.querySelector('input:checked').value):null):[...f.querySelectorAll('input:checked')].map(n=>n.value),other};});}
  function validate(){const answers=collectAnswers();for(const f of document.querySelectorAll('#mixedAnswers fieldset'))f.classList.remove('mixed-invalid');try{M.validateAnswers(answerForm,answers);return true;}catch(e){for(const x of M.flatten(answerForm)){const tiny={custom_sections:[{...x.s,categories:[{...x.c,groups:[{...x.g,questions:[x.q]}]}]}]};try{M.validateAnswers(tiny,answers.filter(a=>a.questionId===x.q.questionId));}catch{const f=[...document.querySelectorAll('#mixedAnswers fieldset')].find(n=>n.dataset.questionId===x.q.questionId);f.classList.add('mixed-invalid');f.scrollIntoView({block:'center'});f.querySelector('input,textarea')?.focus();break;}}alert(e.message);return false;}}
  function report(rows){let box=document.getElementById('mixedReport');if(!box){box=el('section');box.id='mixedReport';box.className='mixed-panel';(document.getElementById('reportContent')||document.querySelector('.container')||document.querySelector('.page')||document.querySelector('main')||document.body).appendChild(box);}box.replaceChildren();if(!rows?.length)return;el('h2','ผลคำถามส่วนเพิ่มเติม (แยกจาก KPI เดิม)',box);for(const r of rows){el('h3',`${r.section} / ${r.category} / ${r.group}`,box);el('h4',r.question,box);el('p',`ผู้ตอบข้อนี้ ${r.respondent_count} คน`,box);if(r.type==='rating')el('p',`เฉลี่ย ${r.mean.toFixed(2)} · S.D. ${r.sd.toFixed(2)}`,box);else if(r.type==='checkbox'){const list=el('ul',null,box);for(const c of r.choices)el('li',`${c.label}: ${c.count} คน (${c.percent.toFixed(2)}%)`,list);el('p','เลือกได้หลายข้อ ผลรวมเปอร์เซ็นต์อาจมากกว่า 100%',box);}for(const text of r.comments||[])el('p',text,box);}}
  root.MixedUI={load,apply,collect:()=>M.copy(selected),renderAnswers,collectAnswers,validate,report};
})(globalThis);
