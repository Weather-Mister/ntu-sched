// Counts belong to the active account and are never persisted in browser storage.
export function createMailBadges({account,isLive,language}){
 let owner=null,epoch=0,revision=0,unread=null,pending=null,checkedAt=0;
 const targets=[...document.querySelectorAll('[data-open-mail],[data-mail-folder="inbox"],[data-mail-folder="unread"]')];
 function render(){
  const zh=language()==='zh',visible=unread!==null&&unread>0;
  for(const control of targets){
   let badge=control.querySelector('.campus-mail-badge');
   if(!badge){badge=document.createElement('span');badge.className='campus-mail-badge';badge.setAttribute('aria-hidden','true');control.append(badge);}
   const changed=badge.textContent!==String(unread>99?'99+':unread??'');
   badge.textContent=unread>99?'99+':String(unread??'');badge.hidden=!visible;
   control.classList.toggle('has-unread-mail',visible);
   if(changed&&visible){badge.classList.remove('mail-badge-arrive');void badge.offsetWidth;badge.classList.add('mail-badge-arrive');}
   const label=control.hasAttribute('data-open-mail')?(zh?'開啟 Campus Mail':'Open Campus Mail'):
    control.dataset.mailFolder==='inbox'?(zh?'收件匣':'Inbox'):(zh?'未讀':'Unread');
   const full=label+(visible?(zh?`，${unread} 封未讀郵件`:`, ${unread} unread ${unread===1?'message':'messages'}`):'');
   control.setAttribute('aria-label',full);control.title=full;
  }
 }
 function setCount(value){
  if(!Number.isSafeInteger(value)||value<0)return;
  revision++;unread=value;checkedAt=Date.now();render();
 }
 async function refresh(force=false){
  if(!owner||!isLive()||document.hidden||navigator.onLine===false)return;
  if(pending)return pending.promise;
  if(!force&&checkedAt&&Date.now()-checkedAt<120000)return;
  const identity=owner,generation=epoch,version=revision,operation={};pending=operation;
  operation.promise=(async()=>{
   try{
    const result=await account.request('mail/unread');
    if(generation!==epoch||identity!==owner||version!==revision)return;
    if(result.studentNumber!==owner){bind(null);return;}
    if(Number.isSafeInteger(result.unreadCount)&&result.unreadCount>=0){unread=result.unreadCount;checkedAt=Date.now();render();}
   }catch{/* Keep the last confirmed count through offline/temporary mailbox failures. */}
   finally{if(pending===operation)pending=null;}
  })();
  return operation.promise;
 }
 function bind(value){
  const next=value?.studentNumber||null;if(next===owner)return;
  owner=next;epoch++;revision++;pending=null;unread=null;checkedAt=0;render();
  if(owner)void refresh(true);
 }
 function changed(action,ref,wasUnread){
  if(action==='read-all'){setCount(0);return;}
  if(ref?.mailbox!=='INBOX')return;
  // Fence any count request started before the successful mutation.
  revision++;
  if(unread===null||typeof wasUnread!=='boolean'){checkedAt=0;return;}
  const delta=action==='unread'&&!wasUnread?1:['read','archive','trash'].includes(action)&&wasUnread?-1:0;
  if(delta){unread=Math.max(0,unread+delta);render();}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 window.addEventListener('focus',()=>void refresh());
 window.addEventListener('online',()=>void refresh());
 setInterval(()=>void refresh(),120000);
 render();
 return {bind,refresh,changed,setCount,locale:render};
}
