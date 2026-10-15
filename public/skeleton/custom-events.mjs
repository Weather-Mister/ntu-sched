import { AccountEvents } from '/account-events.mjs';
import { normalizeEvent,eventDay } from '/event-model.mjs';
const copy={
  en:{personal:'PERSONAL EVENT',add:'＋ Add event',create:'Add event',edit:'Edit event',name:'Event name',location:'Location (optional)',date:'Date',from:'Starts on',repeat:'Repeat',once:'One time',weekly:'Every week',start:'Start time',end:'End time',days:'Repeat on',until:'Repeat until (optional)',series:'Changes apply to the whole weekly event.',notes:'Notes (optional)',cancel:'Cancel',save:'Save event',remove:'Remove event',removeSeries:'Remove weekly event',undo:'Undo remove',retry:'Refresh events',saving:'Saving…',loading:'Loading personal events…',loadFailed:'Could not load personal events. Refresh events to try again.',saveFailed:'Could not confirm the save. Your changes are still here; please try again.',conflict:'This event changed elsewhere. Close and reopen it to edit the latest version.',full:'You can save up to 500 personal events.',timeError:'End time must be after start time on the same day.',daysError:'Choose at least one repeat day.',untilError:'The repeat end date must be on or after the start date.',savedHelp:'Saved to your student account · times are in Taipei.',previewHelp:'Preview only · events disappear when you leave or reload.',daysShort:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],daysLong:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']},
  zh:{personal:'個人行程',add:'＋ 新增行程',create:'新增行程',edit:'編輯行程',name:'行程名稱',location:'地點（選填）',date:'日期',from:'開始日期',repeat:'重複',once:'單次',weekly:'每週',start:'開始時間',end:'結束時間',days:'重複星期',until:'重複結束日期（選填）',series:'變更會套用至整個每週行程。',notes:'備註（選填）',cancel:'取消',save:'儲存行程',remove:'移除行程',removeSeries:'移除每週行程',undo:'復原移除',retry:'重新整理行程',saving:'儲存中…',loading:'正在載入個人行程…',loadFailed:'無法載入個人行程，請重新整理再試一次。',saveFailed:'無法確認是否已儲存，變更仍保留，請再試一次。',conflict:'此行程已在其他地方變更，請關閉並重新開啟以編輯最新版本。',full:'最多可儲存 500 個個人行程。',timeError:'結束時間須晚於當天的開始時間。',daysError:'請至少選擇一個重複星期。',untilError:'重複結束日期不能早於開始日期。',savedHelp:'儲存至你的學生帳號，時間以臺北時間為準。',previewHelp:'僅供預覽，離開或重新整理後行程會消失。',daysShort:['一','二','三','四','五','六','日'],daysLong:['星期一','星期二','星期三','星期四','星期五','星期六','星期日']}
};
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const minutes=s=>{const m=/^(\d{2}):(\d{2})$/.exec(s);return m?+m[1]*60 + +m[2]:NaN;};
export function createEventUI({account,isLive,getLanguage,getDate,onChange,onSessionExpired}){
  const $=id=>document.getElementById(id),dialog=$('event-dialog'),form=$('event-form');
  let preview=[],editing=null,epoch=0;
  const text=key=>copy[getLanguage()==='zh'?'zh':'en'][key];
  const store=new AccountEvents(account,{onChange(){render();onChange();},onSessionExpired});
  for(let day=0;day<7;day++){const label=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');input.type='checkbox';input.value=String(day);label.append(input,span);$('event-days').append(label);}
  function error(message){$('event-error').hidden=!message;$('event-error').textContent=message||'';}
  function errorText(){return text(store.state.error?.code==='events_full'?'full':store.state.error?.code==='task_changed'||store.state.error?.code==='task_not_found'?'conflict':store.state.error?.phase==='load'?'loadFailed':'saveFailed');}
  function locale(){
    form.querySelectorAll('[data-event-copy]').forEach(n=>n.textContent=text(n.dataset.eventCopy));
    $('add-event').textContent=text('add');$('event-heading').textContent=text(editing?'edit':'create');
    $('event-date-label').textContent=text($('event-frequency').value==='weekly'?'from':'date');
    $('event-remove').textContent=text($('event-frequency').value==='weekly'?'removeSeries':'remove');
    $('event-title').placeholder=getLanguage()==='zh'?'例如：讀書會':'e.g. Study group';$('event-location').placeholder=getLanguage()==='zh'?'例如：總圖書館':'e.g. Main Library';
    [...$('event-days').children].forEach((label,index)=>{label.querySelector('span').textContent=text('daysShort')[index];label.querySelector('input').setAttribute('aria-label',text('daysLong')[index]);});
    $('event-help').textContent=text(isLive()?'savedHelp':'previewHelp');$('events-retry').textContent=text('retry');$('events-undo').textContent=text('undo');
  }
  function render(){
    const state=store.state,busy=isLive()&&state.saving;
    $('add-event').disabled=isLive()&&(!state.ready||busy);
    for(const n of form.querySelectorAll('input,select,textarea,button'))n.disabled=busy;
    $('event-save').textContent=text(busy?'saving':'save');
    $('events-status').textContent=isLive()?(state.error?errorText():busy?text('saving'):state.loading?text('loading'):''):'';
    $('events-retry').hidden=!isLive()||!state.error;$('events-retry').disabled=busy||state.loading;
    $('events-undo').hidden=!isLive()||!state.undo;$('events-undo').disabled=busy;
    if(dialog.open&&state.error)error(errorText());
  }
  function frequency(){const weekly=$('event-frequency').value==='weekly';$('event-weekly').hidden=!weekly;$('event-until').min=$('event-date').value||'2000-01-01';locale();}
  function open(event=null,key=getDate()){
    editing=event;form.reset();error('');$('event-start').setCustomValidity('');$('event-end').setCustomValidity('');
    $('event-title').value=event?.title||'';$('event-location').value=event?.location||'';$('event-notes').value=event?.notes||'';
    $('event-frequency').value=event?.frequency||'once';$('event-date').value=event?.date||key;$('event-until').value=event?.until||'';
    $('event-start').value=clock(event?.start??(9*60));$('event-end').value=clock(event?.end??(10*60));
    for(const input of $('event-days').querySelectorAll('input'))input.checked=(event?.days?.length?event.days:[eventDay(key)]).includes(+input.value);
    $('event-remove').hidden=!event;frequency();render();dialog.showModal();$('event-title').focus();
  }
  function close(){if(isLive()&&store.state.saving)return;dialog.close();editing=null;}
  function reset(current=null){epoch++;preview=[];editing=null;dialog.close();form.reset();error('');store.bind(current);locale();render();}
  form.addEventListener('submit',async e=>{
    e.preventDefault();error('');if(!form.reportValidity())return;
    const weekly=$('event-frequency').value==='weekly',start=minutes($('event-start').value),end=minutes($('event-end').value),days=weekly?[...$('event-days').querySelectorAll('input:checked')].map(n=>+n.value):[];
    if(end<=start){error(text('timeError'));return;}if(weekly&&!days.length){error(text('daysError'));return;}if(weekly&&$('event-until').value&&$('event-until').value<$('event-date').value){error(text('untilError'));return;}
    let values;try{values=normalizeEvent({title:$('event-title').value,location:$('event-location').value,notes:$('event-notes').value,frequency:weekly?'weekly':'once',date:$('event-date').value,until:weekly?$('event-until').value||null:null,days,start,end});}catch{error(text('saveFailed'));return;}
    const generation=epoch;
    if(isLive()){if(await store.save(values,editing)&&generation===epoch){dialog.close();editing=null;}}
    else{const saved={...values,id:editing?.id||crypto.randomUUID(),createdAt:editing?.createdAt||Date.now(),version:(editing?.version||0)+1};preview=[saved,...preview.filter(e=>e.id!==saved.id)];dialog.close();editing=null;onChange();}
  });
  $('event-remove').addEventListener('click',async()=>{if(!editing)return;const generation=epoch;if(isLive()){if(await store.remove(editing)&&generation===epoch){dialog.close();editing=null;}}else{preview=preview.filter(e=>e.id!==editing.id);dialog.close();editing=null;onChange();}});
  $('add-event').addEventListener('click',()=>open());$('event-close').addEventListener('click',close);$('event-cancel').addEventListener('click',close);
  $('event-frequency').addEventListener('change',frequency);$('event-date').addEventListener('change',()=>{if(!editing&&$('event-frequency').value==='once'){for(const input of $('event-days').querySelectorAll('input'))input.checked=+input.value===eventDay($('event-date').value);}frequency();});
  $('events-retry').addEventListener('click',()=>store.refresh());$('events-undo').addEventListener('click',()=>store.undo());
  dialog.addEventListener('cancel',e=>{if(isLive()&&store.state.saving)e.preventDefault();});
  locale();render();
  return{open,reset,locale(){locale();render();},refresh(){if(isLive())void store.refresh();},events(){return isLive()?store.state.items:preview;}};
}
