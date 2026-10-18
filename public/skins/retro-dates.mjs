// Presentation only: decorate the shared calendar rows, retaining links and checklist handlers.
export function decorateRetroDates(list){
 const decorated=new Map();
 function update(){
  const zh=document.documentElement.lang.startsWith('zh'),now=Date.now();
  for(const card of list.querySelectorAll('.cool-item[data-due-at]')){
   if(decorated.has(card))continue;
   const main=card.querySelector('.cool-main'),date=card.querySelector('.cool-date'),copy=card.querySelector('.cool-copy');
   const due=Date.parse(card.dataset.dueAt);if(!main||!date||!copy||!Number.isFinite(due))continue;
   const hours=Math.max(0,(due-now)/3600000),progress=Math.round(Math.max(12,Math.min(92,92-hours/168*70)));
   card.classList.add('retro-deadline-row');
   if(hours<=12)card.classList.add('retro-urgent');else if(hours<=72)card.classList.add('retro-soon');
   const stamp=document.createElement('span');stamp.className='retro-date-time';
   stamp.textContent=card.dataset.allDay==='true'?(zh?'全天':'ALL DAY'):new Intl.DateTimeFormat(zh?'zh-TW':'en-US',{timeZone:'Asia/Taipei',hour:'numeric',minute:'2-digit',hour12:false}).format(new Date(due));
   const status=document.createElement('span');status.className='retro-date-status';
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
   const sameDay=today.format(new Date(due))===today.format(new Date(now));
   status.textContent=card.classList.contains('done')?(zh?'已完成':'FINISHED'):sameDay?(zh?'今天到期':'DUE TODAY'):(card.querySelector('.cool-due')?.textContent||'');
   const bar=document.createElement('span');bar.className='retro-entry-bar';bar.setAttribute('aria-hidden','true');
   const fill=document.createElement('i');fill.style.width=progress+'%';bar.append(fill);
   date.append(stamp);copy.append(status,bar);decorated.set(card,[stamp,status,bar]);
  }
  // Do not retain replaced feeds or a previous student's detached rows.
  for(const [card] of decorated)if(!list.contains(card))decorated.delete(card);
 }
 update();const observer=new window.MutationObserver(update);observer.observe(list,{childList:true,subtree:true});
 return()=>{observer.disconnect();for(const [card,nodes] of decorated){card.classList.remove('retro-deadline-row','retro-urgent','retro-soon');for(const node of nodes)node.remove();}decorated.clear();};
}
