const $=id=>document.getElementById(id);
const words={en:{mail:'Campus Mail',inbox:'Inbox',unread:'Unread',starred:'Starred',sent:'Sent',drafts:'Drafts',trash:'Trash',archived:'Archived',compose:'＋ Compose',search:'Search this folder',refresh:'Refresh',enable:'Enable notifications',disable:'Disable notifications',loading:'Loading…',empty:'No messages found.',choose:'Select a message to read',login:'Sign in with your real NTU account to use mail.',back:'← Inbox',reply:'Reply',archive:'Archive',remove:'Move to Trash',images:'Load external images',to:'To',subject:'Subject',message:'Message',send:'Send',cancel:'Close editor',sending:'Sending…',delivered:'Message sent.',uncertain:'Delivery is unconfirmed. Check Sent before trying again.',check:'Check delivery',older:'Older',newer:'Newer',loadMore:'Load 50 more',loadingMore:'Loading more…',markAllRead:'Mark all read',markRead:'Mark read',markUnread:'Mark unread',star:'Star',unstar:'Remove star',of:'of',setup:'On iPhone, use Share → Add to Home Screen, open the installed app, then enable notifications.',enabled:'Notifications enabled on this device. New-mail checks run about every five minutes.',denied:'Notifications are blocked. Allow them in your browser or phone settings.',failed:'This message was not sent. Your text is still here.',install:'Add Campus Week to your Home Screen to enable alerts.'},zh:{mail:'Campus Mail',inbox:'收件匣',unread:'未讀',starred:'星號',sent:'寄件備份',drafts:'草稿',trash:'垃圾桶',archived:'封存',compose:'＋ 撰寫',search:'搜尋此資料夾',refresh:'重新整理',enable:'啟用通知',disable:'關閉通知',loading:'載入中…',empty:'沒有郵件。',choose:'選擇郵件以閱讀',login:'請使用真實臺大帳號登入以使用信箱。',back:'← 收件匣',reply:'回覆',archive:'封存',remove:'移至垃圾桶',images:'載入外部圖片',to:'收件人',subject:'主旨',message:'內文',send:'寄出',cancel:'關閉編輯器',sending:'寄送中…',delivered:'已寄出郵件。',uncertain:'尚未確認寄送結果。再次寄送前請檢查寄件備份。',check:'確認寄送結果',older:'較舊',newer:'較新',loadMore:'再載入 50 封',loadingMore:'正在載入…',markAllRead:'全部標記為已讀',markRead:'標記已讀',markUnread:'標記未讀',star:'加上星號',unstar:'取消星號',of:'／',setup:'iPhone 請點選分享 → 加入主畫面，開啟安裝後的 App，再啟用通知。',enabled:'此裝置已啟用通知。約每五分鐘檢查新郵件。',denied:'通知已被封鎖。請至瀏覽器或手機設定允許通知。',failed:'郵件未寄出，編輯器保留了您的內文。',install:'將 Campus Week 加入主畫面以啟用通知。'}};
function node(tag,attrs={},text){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')e.className=v;else e.setAttribute(k,v);}if(text!==undefined)e.textContent=text;return e;}
export function createMailUI({account,isLive,language}){
 const dialog=$('mail-dialog'),list=dialog.querySelector('.mailx-list'),reader=dialog.querySelector('.mailx-reader'),
  count=dialog.querySelector('.mailx-count'),composeButton=dialog.querySelector('.mailx-compose-main'),
  refreshButton=dialog.querySelector('.mailx-refresh-button'),listTools=dialog.querySelector('.mailx-list-tools');
 let owner=null,epoch=0,folder='inbox',query='',busy=false,queuedLoad=null,sequence=0,reading=0,
  current=null,draft=null,pushId=null,registration=null,lastLoad=0,messages=[],nextCursor=null,totalCount=0,mutating=false;
 const w=()=>words[language()==='zh'?'zh':'en'];
 const status=node('p',{class:'mail-status',role:'status','aria-live':'polite'}),
  search=node('input',{type:'search',placeholder:w().search,'aria-label':w().search}),
  searchForm=node('form',{class:'mail-search'}),pushButton=node('button',{type:'button'},w().enable),
  pager=node('div',{class:'mail-pager'}),loadMoreButton=node('button',{type:'button'},w().loadMore);
 const tell=message=>{status.textContent=message;};
 const button=(text,callback)=>{const b=node('button',{type:'button'},text);b.addEventListener('click',callback);return b;};
 const markAllButton=button(w().markAllRead,()=>void markAllRead());
 markAllButton.className='campus-mail-mark-all';
 listTools.append(markAllButton);
 searchForm.append(search);dialog.querySelector('.mailx-list-tools').after(searchForm);
 dialog.querySelector('.mailx-topbar')?.after(status);
 if(!status.isConnected)dialog.querySelector('.mailx-main').before(status);
 const top=dialog.querySelector('.mailx-official-link');top.before(pushButton);pushButton.className='mailx-top-action';
 pager.append(loadMoreButton);list.after(pager);
 composeButton.disabled=false;
 if(refreshButton){refreshButton.disabled=false;refreshButton.title=w().refresh;refreshButton.setAttribute('aria-label',w().refresh);refreshButton.addEventListener('click',()=>void load(false));}
 loadMoreButton.addEventListener('click',()=>void load(true));
 const keyOf=ref=>String(ref.mailbox)+':'+String(ref.uid);
 function cleanSender(from){
  const raw=String(from||'').trim();
  const name=raw.replace(/<[^>]*>/g,'').replace(/^["']|["']$/g,'').trim();
  return name||raw||'Unknown sender';
 }
 function initials(sender){
  const display=cleanSender(sender);
  if(display.includes('@')&&!display.includes(' '))return Array.from(display.split('@')[0])[0]?.toUpperCase()||'?';
  return Array.from(display)[0]?.toUpperCase()||'?';
 }
 function iconButton(kind,label,iconRef,ref){
  const control=button('',()=>void mutate(kind,ref));
  control.className='campus-mail-icon';control.title=label;control.setAttribute('aria-label',label);
  if((kind==='star'&&ref.starred)||(kind==='unread'&&ref.unread))control.classList.add('is-on');
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg'),use=document.createElementNS(ns,'use');
  svg.setAttribute('aria-hidden','true');svg.setAttribute('viewBox','0 0 24 24');
  use.setAttribute('href','#'+iconRef);svg.append(use);control.append(svg);return control;
 }
 function showSelection(){
  for(const item of list.querySelectorAll('[data-mail-key]')){
   const selected=!!current&&item.dataset.mailKey===keyOf(current);
   item.classList.toggle('is-active',selected);
   item.querySelector('.campus-mail-open')?.setAttribute('aria-pressed',String(selected));
  }
 }
 function renderList(){
  list.replaceChildren();
  if(!messages.length)list.append(node('p',{class:'mailx-list-placeholder'},w().empty));
  for(const message of messages){
   const selected=!!current&&keyOf(current)===keyOf(message);
   const wrap=node('article',{class:'campus-mail-item'+(message.unread?' is-unread':'')+(selected?' is-active':'')});
   wrap.dataset.mailKey=keyOf(message);
   const openButton=button('',()=>void read(message));openButton.className='campus-mail-open';
   openButton.setAttribute('aria-label',cleanSender(message.from)+': '+message.subject);
   openButton.setAttribute('aria-pressed',String(selected));
   const sender=cleanSender(message.from),hash=Array.from(sender).reduce((n,c)=>n+c.charCodeAt(0),0)%5;
   const avatar=node('span',{class:'campus-mail-avatar campus-mail-tone-'+hash,'aria-hidden':'true'},initials(sender));
   const body=node('span',{class:'campus-mail-info'}),head=node('span',{class:'campus-mail-head'}),
    name=node('strong',{class:'campus-mail-sender'},sender),date=node('small',{class:'campus-mail-date'},message.date||'');
   head.append(name,date);body.append(head,node('span',{class:'campus-mail-subject'},message.subject||'(No subject)'));
   if(message.snippet)body.append(node('span',{class:'campus-mail-snippet'},message.snippet));
   body.append(node('span',{class:'campus-mail-provider'},'NTU Mail'));
   openButton.append(avatar,body);
   const actions=node('div',{class:'campus-mail-actions',role:'group','aria-label':'Mail actions'});
   actions.append(
    iconButton(message.starred?'unstar':'star',message.starred?w().unstar:w().star,'i-star',message),
    iconButton('archive',w().archive,'i-archive',message),
    iconButton('trash',w().remove,'i-trash',message),
    iconButton(message.unread?'read':'unread',message.unread?w().markRead:w().markUnread,'i-mail',message)
   );
   wrap.append(openButton,actions);list.append(wrap);
  }
  count.textContent=messages.length+' '+w().of+' '+totalCount;
  loadMoreButton.textContent=busy?w().loadingMore:w().loadMore;
  loadMoreButton.disabled=busy||!nextCursor;
  pager.hidden=!nextCursor;
  markAllButton.textContent=w().markAllRead;
  markAllButton.hidden=!['inbox','unread'].includes(folder)||!messages.length;
  markAllButton.disabled=mutating||busy;
 }
 function emptyReader(){
  current=null;reader.replaceChildren(node('div',{class:'mailx-reader-empty'},w().choose));
  dialog.classList.remove('mail-reading');showSelection();
 }
 function locale(){
  for(const b of dialog.querySelectorAll('[data-mail-folder]')){
   const label=w()[b.dataset.mailFolder];b.setAttribute('aria-label',label);b.title=label;
   if(b.closest('.mailx-mobile-tabs'))b.textContent=label;
   b.setAttribute('aria-pressed',String(b.dataset.mailFolder===folder));
  }
  $('mail-folder-heading').textContent=w()[folder];composeButton.textContent=w().compose;
  search.placeholder=w().search;pushButton.textContent=pushId?w().disable:w().enable;
  loadMoreButton.textContent=w().loadMore;markAllButton.textContent=w().markAllRead;
  const badge=dialog.querySelector('.mailx-demo-badge');if(badge)badge.textContent=owner?'NTU':'PREVIEW';
  dialog.querySelector('.mailx-account-switch').textContent=owner||'NTU';
 }
 async function request(path,options){
  const generation=epoch,result=await account.request('mail/'+path,options);
  if(generation!==epoch||!owner||result.studentNumber!==owner){
   if(generation===epoch&&result.studentNumber!==owner)bind(null);
   throw new Error('Account changed. Reopen Mail.');
  }
  return result;
 }
 function bind(value){
  const next=value?.studentNumber||null;if(next===owner)return;
  epoch++;sequence++;reading++;owner=next;busy=false;queuedLoad=null;folder='inbox';query='';
  messages=[];nextCursor=null;totalCount=0;search.value='';draft=null;pushId=null;
  list.replaceChildren();emptyReader();tell('');locale();renderList();
  if(!next){dialog.close();void navigator.serviceWorker?.getRegistration('/').then(async r=>{await(await r?.pushManager.getSubscription())?.unsubscribe();}).catch(()=>{});}
  else if(dialog.open)void load(false);
 }
 async function load(append=false){
  if(!owner||!isLive()){tell(w().login);return;}
  const seq=++sequence;
  if(busy){queuedLoad=append&&queuedLoad!=='reset'?'append':'reset';return;}
  if(append&&!nextCursor)return;
  busy=true;
  const startEpoch=epoch,location=folder+'\u0000'+query,cursor=append?nextCursor:null;
  tell(w().loading);loadMoreButton.disabled=true;markAllButton.disabled=true;
  try{
   const params=new URLSearchParams({folder,q:query,limit:String(append?50:25)});
   if(cursor)params.set('cursor',cursor);
   const result=await request('list?'+params);
   if(seq!==sequence||startEpoch!==epoch||location!==folder+'\u0000'+query)return;
   const previous=append?messages:[],known=new Set(previous.map(keyOf));
   messages=previous.concat(result.messages.filter(m=>!known.has(keyOf(m))));
   totalCount=result.count;nextCursor=result.nextCursor||null;
   renderList();tell('');lastLoad=Date.now();
  }catch(error){if(seq===sequence&&startEpoch===epoch)tell(error.message);}
  finally{
   busy=false;renderList();
   if(queuedLoad){const mode=queuedLoad;queuedLoad=null;void load(mode==='append');}
  }
 }
 async function read(ref,images=false){
  if(draft)return;
  const generation=++reading,identity=epoch;tell(w().loading);
  try{
   const message=await request('message?'+new URLSearchParams({mailbox:ref.mailbox,uid:ref.uid,...(images?{images:'1'}:{})}));
   if(generation!==reading||identity!==epoch)return;
   current=message;draft=null;showSelection();
   reader.replaceChildren();dialog.classList.add('mail-reading');
   const toolbar=node('div',{class:'mailx-reader-toolbar'}),tools=node('div',{class:'mailx-reader-toolbar-buttons'});
   toolbar.append(button(w().back,()=>{dialog.classList.remove('mail-reading');}),tools);
   tools.append(button(w().reply,()=>edit(message)),button(w().archive,()=>void mutate('archive',message)),button(w().remove,()=>void mutate('trash',message)));
   const head=node('div',{class:'mail-message-head'});head.append(node('h3',{},message.subject),node('p',{},message.headers));
   if(!images)head.append(button(w().images,()=>void read(message,true)));
   for(const a of message.attachments){
    head.append(node('a',{href:'/api/mail/attachment?'+new URLSearchParams({mailbox:message.mailbox,uid:message.uid,part:a.part}),target:'_blank',rel:'noopener',class:'mail-attachment'},'↓ '+a.name));
   }
   const frame=node('iframe',{title:message.subject,sandbox:'allow-popups allow-popups-to-escape-sandbox',referrerpolicy:'no-referrer',class:'mail-frame'});
   frame.srcdoc=message.html;reader.append(toolbar,head,frame);tell('');
  }catch(error){if(generation===reading&&identity===epoch)tell(error.message);}
 }
 async function mutate(kind,ref){
  if(!ref||mutating)return;
  mutating=true;markAllButton.disabled=true;
  try{
   await request('action',{method:'POST',body:JSON.stringify({mailbox:ref.mailbox,uid:ref.uid,action:kind})});
   if(kind==='archive'||kind==='trash'){
    if(current&&keyOf(current)===keyOf(ref))emptyReader();
    void load(false);return;
   }
   const selected=messages.find(m=>keyOf(m)===keyOf(ref));
   if(selected){if(kind==='star'||kind==='unstar')selected.starred=kind==='star';if(kind==='read'||kind==='unread')selected.unread=kind==='unread';}
   if((folder==='unread'&&(kind==='read'||kind==='unread'))||(folder==='starred'&&(kind==='star'||kind==='unstar')))void load(false);
   else{renderList();tell('');}
  }catch(error){tell(error.message);}
  finally{mutating=false;markAllButton.disabled=false;}
 }
 async function markAllRead(){
  if(mutating||busy)return;mutating=true;markAllButton.disabled=true;
  try{
   await request('action',{method:'POST',body:JSON.stringify({action:'read-all'})});
   for(const item of messages)item.unread=false;
   if(folder==='unread')void load(false);else{renderList();tell('');}
  }catch(error){tell(error.message);}
  finally{mutating=false;markAllButton.disabled=false;}
 }
 function switchFolder(next){
  if(folder===next)return;
  folder=next;query='';search.value='';sequence++;messages=[];nextCursor=null;totalCount=0;
  emptyReader();renderList();locale();void load(false);
 }
 function edit(reply){if(draft){dialog.classList.add('mail-reading');return;}reading++;current=null;showSelection();draft={id:crypto.randomUUID(),sending:false,locked:false,reply:reply?{mailbox:reply.mailbox,uid:reply.uid}:null};reader.replaceChildren();dialog.classList.add('mail-reading');
  const form=node('form',{class:'mail-composer'}),to=node('input',{type:'text',required:'',maxlength:'2000',autocomplete:'email'}),subject=node('input',{type:'text',maxlength:'500'}),body=node('textarea',{required:'',maxlength:'50000',rows:'12'}),send=node('button',{type:'submit'},w().send),close=button(w().cancel,()=>{if(!draft.sending&&!draft.locked){draft=null;emptyReader();}}),check=button(w().check,()=>void checkDelivery());check.hidden=true;
  if(reply){to.value=reply.replyTo?.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)?.[0]||'';subject.value=/^re:/i.test(reply.subject)?reply.subject:'Re: '+reply.subject;}
  for(const[label,input]of[[w().to,to],[w().subject,subject],[w().message,body]]){const wrap=node('label',{},label);wrap.append(input);form.append(wrap);}const controls=node('div',{class:'mail-compose-actions'});controls.append(send,close,check);form.append(controls);reader.append(form);to.focus();
  const inputs=[to,subject,body];
  async function checkDelivery(){const generation=epoch,active=draft;try{const result=await request('send/check',{method:'POST',body:JSON.stringify({id:active.id})});if(generation!==epoch||active!==draft)return;settle(result.status);}catch(error){tell(error.message);}}
  function settle(state){if(state==='sent'){draft=null;emptyReader();const generation=epoch;void load().then(()=>{if(generation===epoch)tell(w().delivered);});}else if(state==='failed'){draft.locked=false;draft.id=crypto.randomUUID();inputs.forEach(e=>e.disabled=false);send.disabled=false;close.disabled=false;check.hidden=true;tell(w().failed);}else{draft.locked=true;check.hidden=false;close.disabled=true;tell(w().uncertain);}}
  form.addEventListener('submit',async event=>{event.preventDefault();if(draft.sending||draft.locked)return;const active=draft,generation=epoch;draft.sending=true;inputs.forEach(e=>e.disabled=true);send.disabled=true;close.disabled=true;tell(w().sending);
   try{const result=await request('send',{method:'POST',body:JSON.stringify({id:active.id,to:to.value,subject:subject.value,text:body.value,...(active.reply?{reply:active.reply}:{})})});if(generation!==epoch||draft!==active)return;active.sending=false;settle(result.status);}
   catch(error){if(generation!==epoch||draft!==active)return;active.sending=false;
    if(error.status&&error.status<500){inputs.forEach(e=>e.disabled=false);send.disabled=false;close.disabled=false;tell(error.message);}else{active.locked=true;check.hidden=false;tell(w().uncertain);}}
  });
 }
 async function initPush(){if(!owner||!('serviceWorker'in navigator)||!('PushManager'in window))return;const generation=epoch;try{registration=await navigator.serviceWorker.register('/mail-sw.js',{scope:'/'});const data=await request('push');const sub=await registration.pushManager.getSubscription();if(generation!==epoch)return;if(sub){const existing=data.devices.find(d=>d.id);pushId=existing&&await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sub.endpoint)).then(v=>btoa(String.fromCharCode(...new Uint8Array(v))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''));if(!data.devices.some(d=>d.id===pushId))pushId=null;}locale();}catch{/* Mail reading remains available when push is unavailable. */}}
 async function togglePush(){if(!owner)return tell(w().login);if(!('serviceWorker'in navigator)||!('PushManager'in window))return tell(w().setup);if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&!navigator.standalone&&!matchMedia('(display-mode: standalone)').matches)return tell(w().setup);
  const generation=epoch;pushButton.disabled=true;try{
   // Request permission directly from the click, before waiting on network work.
   if(!pushId&&await Notification.requestPermission()!=='granted'){tell(w().denied);return;}
   if(!registration)registration=await navigator.serviceWorker.register('/mail-sw.js',{scope:'/'});await navigator.serviceWorker.ready;
   if(pushId){await request('push',{method:'DELETE',body:JSON.stringify({id:pushId})});await(await registration.pushManager.getSubscription())?.unsubscribe();pushId=null;tell('');}
   else{const data=await request('push'),key=Uint8Array.from(atob(data.publicKey.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));const sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});const result=await request('push',{method:'POST',body:JSON.stringify(sub.toJSON())});if(generation!==epoch){await sub.unsubscribe();return;}pushId=result.id;tell(w().enabled);}locale();
  }catch(error){if(generation===epoch)tell(error.message);}finally{pushButton.disabled=false;}}
 function open(){
  if(!dialog.open)dialog.showModal();locale();
  if(!owner){tell(w().login);return;}
  void load(false);void initPush();
 }
 composeButton.addEventListener('click',()=>owner?edit():tell(w().login));
 pushButton.addEventListener('click',()=>void togglePush());
 $('mail-close').addEventListener('click',()=>dialog.close());
 document.querySelectorAll('[data-open-mail]').forEach(b=>b.addEventListener('click',open));
 for(const b of dialog.querySelectorAll('[data-mail-folder]'))b.addEventListener('click',()=>switchFolder(b.dataset.mailFolder));
 searchForm.addEventListener('submit',e=>{e.preventDefault();query=search.value.trim();messages=[];nextCursor=null;totalCount=0;void load(false);});
 search.addEventListener('search',()=>{if(!search.value){query='';messages=[];nextCursor=null;totalCount=0;void load(false);}});
 for(const id of ['language-en','language-zh','settings-language'])$(id).addEventListener(id==='settings-language'?'change':'click',()=>{locale();renderList();});
 setInterval(()=>{if(dialog.open&&owner&&!document.hidden&&navigator.onLine&&Date.now()-lastLoad>=60000&&!draft&&!busy&&messages.length<=25&&!current)void load(false);},60000);
 navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='open-mail')open();});
 return {bind,open,locale};
}
