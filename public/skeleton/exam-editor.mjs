import {AccountCustomExams} from '/account-custom-exams.mjs';
import {normalizeCustomExam} from '/custom-exam-model.mjs';

export function createExamEditor({account,onChange,onExpired,getLanguage,getToday,getClasses}){
  const $=id=>document.getElementById(id);
  const dialog=$('exam-editor-dialog'),form=$('exam-editor-form');
  const store=new AccountCustomExams(account,{onChange:()=>{onChange();},onSessionExpired:onExpired});
  let editing=null,ownerEpoch=0;
  const bilingual=(en,zh)=>getLanguage()==='zh'?zh:en;
  const notice=message=>{$('exam-editor-error').hidden=!message;$('exam-editor-error').textContent=message;};
  const writeStatus=()=>{const busy=store.state.saving;$('exam-editor-save').disabled=busy;$('exam-editor-remove').disabled=busy;$('exam-editor-reset').disabled=busy;$('exam-editor-hide').disabled=busy;$('exam-editor-close').disabled=busy;};
  function locale(){
    $('exam-editor-title').textContent=editing?bilingual('Edit exam','編輯考試'):bilingual('Add exam','新增考試');
    const copies={title:['Exam name','考試名稱'],className:['Class (optional)','課程名稱（選填）'],type:['Type','類型'],date:['Exact date (optional)','確切日期（選填）'],week:['Week (optional)','週次（選填）'],notes:['Notes (optional)','備註（選填）'],save:['Save exam','儲存考試'],cancel:['Cancel','取消'],hint:['Enter a date, a week, or both. Week-only exams will not show an invented date.','請填入日期、週次或兩者；只有週次的考試不會顯示推測日期。']};
    for(const [key,[en,zh]] of Object.entries(copies))$(key==='save'?'exam-editor-save':key==='cancel'?'exam-editor-close':'exam-editor-'+key+'-label').textContent=bilingual(en,zh);
    $('exam-editor-remove').textContent=bilingual('Delete exam','刪除考試');
    $('exam-editor-reset').textContent=bilingual('Restore original','還原原始資料');
    $('exam-editor-hide').textContent=editing?.manualRecord?.hidden?bilingual('Show exam','重新顯示考試'):bilingual('Hide exam','隱藏考試');
    for(const opt of $('exam-editor-kind').options){
      const kind={quiz:['Quiz','小考'],midterm:['Midterm','期中考'],final:['Final','期末考'],other:['Other','其他']}[opt.value];opt.textContent=bilingual(...kind);
    }
    writeStatus();
  }
  function bind(current){ownerEpoch++;editing=null;if(dialog.open)dialog.close();store.bind(current);locale();}
  function items(){return store.state.items;}
  function open(item=null){
    if(!account.current)return;
    editing=item;
    const r=item?.manualRecord;
    const name=item?.title||item?.custom&&r?.title||({quiz:bilingual('Quiz','小考'),midterm:bilingual('Midterm','期中考'),final:bilingual('Final exam','期末考'),other:bilingual('Exam','考試')}[item?.exam?.kind]||'');
    form.reset();
    $('exam-editor-name').value=r?.title||name;
    const suggestions=$('exam-editor-classes');suggestions.replaceChildren();
    const classes=[...new Set((getClasses()||[]).map(c=>c?.name).filter(Boolean))];
    for(const c of classes){const option=document.createElement('option');option.value=c;suggestions.append(option);}
    $('exam-editor-class').value=r?r.className:item?.course?.title||'';
    $('exam-editor-kind').value=r?.kind||item?.exam?.kind||'other';
    $('exam-editor-date').value=r?.date||item?.date||(!item?getToday():'');
    $('exam-editor-week').value=r?.week??item?.week??'';
    $('exam-editor-notes').value=r?r.notes:(!item?'':item?.exam?.description||'');
    $('exam-editor-hide').hidden=!item?.sourceKey;
    $('exam-editor-remove').hidden=!r||!!item?.sourceKey;
    $('exam-editor-reset').hidden=!item?.sourceKey||!r;
    notice('');locale();dialog.showModal();$('exam-editor-name').focus();
  }
  function close(){if(store.state.saving)return;dialog.close();editing=null;}
  async function saveExam(hidden=!!editing?.manualRecord?.hidden){
    if(!form.reportValidity()||store.state.saving)return;
    let values;
    try{values=normalizeCustomExam({title:$('exam-editor-name').value,className:$('exam-editor-class').value,
      kind:$('exam-editor-kind').value,date:$('exam-editor-date').value||null,week:$('exam-editor-week').value||null,
      notes:$('exam-editor-notes').value,sourceKey:editing?.sourceKey||null,hidden});}
    catch{notice(bilingual('Enter an exam name and a valid date or week.','請輸入考試名稱，以及有效的日期或週次。'));return;}
    const epoch=ownerEpoch;
    const saved=await store.save(values,editing?.manualRecord||null);
    if(epoch!==ownerEpoch)return;
    if(saved){dialog.close();editing=null;notice('');}
    else notice(bilingual('Could not save. Please check your connection and try again.','儲存失敗。請檢查連線後再試一次。'));
    writeStatus();
  }
  form.addEventListener('submit',e=>{e.preventDefault();void saveExam();});
  $('exam-editor-hide').addEventListener('click',()=>{if(editing?.sourceKey)void saveExam(!editing?.manualRecord?.hidden);});
  async function remove(){if(!editing?.manualRecord||store.state.saving)return;const epoch=ownerEpoch;const ok=await store.remove(editing.manualRecord);if(epoch!==ownerEpoch)return;if(ok){dialog.close();editing=null;}else notice(bilingual('Could not update this exam. Try again.','無法更新考試，請重試。'));writeStatus();}
  $('exam-editor-remove').addEventListener('click',remove);
  $('exam-editor-reset').addEventListener('click',remove);
  $('exam-editor-close').addEventListener('click',close);
  dialog.addEventListener('cancel',e=>{if(store.state.saving)e.preventDefault();});
  locale();
  return{bind,items,open,locale,refresh:()=>store.refresh(),get state(){return store.state;}};
}
