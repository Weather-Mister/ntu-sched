import {createComposer} from './mail-composer.mjs';
const $=id=>document.getElementById(id);
const words={en:{mail:'Campus Mail',inbox:'Inbox',unread:'Unread',starred:'Starred',sent:'Sent',outbox:'Outbox',drafts:'Drafts',trash:'Trash',archived:'Archived',compose:'＋ Compose',search:'Search this folder',refresh:'Refresh',enable:'Enable notifications',disable:'Disable notifications',mobileEnable:'Alerts off',mobileDisable:'Alerts on',officialMail:'Official NTU Mail ↗',mobileOfficialMail:'NTU Mail ↗',loading:'Loading…',empty:'No messages found.',choose:'Select a message to read',login:'Sign in with your real NTU account to use mail.',back:'← Inbox',reply:'Reply',archive:'Archive',remove:'Move to Trash',images:'Load external images',translate:'Translate',english:'English',original:'Original',translationLabel:'ENGLISH TRANSLATION',translationFailed:'Translation failed: ',geminiPrivacy:'Translate this email with Gemini (email content is sent to Google)',to:'To',subject:'Subject',message:'Message',send:'Send',cancel:'Close editor',sending:'Sending…',delivered:'Message sent.',uncertain:'Delivery is unconfirmed. Check Sent before trying again.',check:'Check delivery',older:'Older',newer:'Newer',loadMore:'Load 50 more',loadingMore:'Loading more…',markAllRead:'Mark all read',markRead:'Mark read',markUnread:'Mark unread',star:'Star',unstar:'Remove star',of:'of',setup:'On iPhone, use Share → Add to Home Screen, open the installed app, then enable notifications.',enabled:'Notifications enabled on this device. New-mail checks run about every five minutes.',denied:'Notifications are blocked. Allow them in your browser or phone settings.',failed:'This message was not sent. Your text is still here.',install:'Add Campus Week to your Home Screen to enable alerts.'},zh:{mail:'Campus Mail',inbox:'收件匣',unread:'未讀',starred:'星號',sent:'寄件備份',outbox:'寄件匣',drafts:'草稿',trash:'垃圾桶',archived:'封存',compose:'＋ 撰寫',search:'搜尋此資料夾',refresh:'重新整理',enable:'啟用通知',disable:'關閉通知',mobileEnable:'通知關閉',mobileDisable:'通知開啟',officialMail:'臺大官方信箱 ↗',mobileOfficialMail:'臺大信箱 ↗',loading:'載入中…',empty:'沒有郵件。',choose:'選擇郵件以閱讀',login:'請使用真實臺大帳號登入以使用信箱。',back:'← 收件匣',reply:'回覆',archive:'封存',remove:'移至垃圾桶',images:'載入外部圖片',translate:'翻譯',english:'英文',original:'原文',translationLabel:'英文翻譯',translationFailed:'翻譯失敗：',geminiPrivacy:'使用 Gemini 翻譯郵件（郵件內容會傳送給 Google）',to:'收件人',subject:'主旨',message:'內文',send:'寄出',cancel:'關閉編輯器',sending:'寄送中…',delivered:'已寄出郵件。',uncertain:'尚未確認寄送結果。再次寄送前請檢查寄件備份。',check:'確認寄送結果',older:'較舊',newer:'較新',loadMore:'再載入 50 封',loadingMore:'正在載入…',markAllRead:'全部標記為已讀',markRead:'標記已讀',markUnread:'標記未讀',star:'加上星號',unstar:'取消星號',of:'／',setup:'iPhone 請點選分享 → 加入主畫面，開啟安裝後的 App，再啟用通知。',enabled:'此裝置已啟用通知。約每五分鐘檢查新郵件。',denied:'通知已被封鎖。請至瀏覽器或手機設定允許通知。',failed:'郵件未寄出，編輯器保留了您的內文。',install:'將 Campus Week 加入主畫面以啟用通知。'}};
function node(tag,attrs={},text){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')e.className=v;else e.setAttribute(k,v);}if(text!==undefined)e.textContent=text;return e;}
export function createMailUI({account,isLive,language}){
 const dialog=$('mail-dialog'),list=dialog.querySelector('.mailx-list'),reader=dialog.querySelector('.mailx-reader'),
  count=dialog.querySelector('.mailx-count'),composeButton=dialog.querySelector('.mailx-compose-main'),
  refreshButton=dialog.querySelector('.mailx-refresh-button'),listTools=dialog.querySelector('.mailx-list-tools');
 let owner=null,epoch=0,folder='inbox',query='',busy=false,queuedLoad=null,sequence=0,reading=0,
  current=null,pushId=null,registration=null,lastLoad=0,messages=[],nextCursor=null,totalCount=0,mutating=false,
   translationCache=new Map(),translationShown=new Set(),translationRequests=new Map();
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
 // Keep full accessible labels while using compact visible labels on phones.
 const officialLink=dialog.querySelector('.mailx-official-link'),
   officialLong=node('span',{class:'mailx-label-desktop'}),
   officialShort=node('span',{class:'mailx-label-mobile','aria-hidden':'true'}),
   pushLong=node('span',{class:'mailx-label-desktop'}),
   pushShort=node('span',{class:'mailx-label-mobile','aria-hidden':'true'});
 officialLink.replaceChildren(officialLong,officialShort);
 pushButton.replaceChildren(pushLong,pushShort);
 refreshButton.before(pushButton);pushButton.className='mailx-top-action campus-mail-push';
 pager.append(loadMoreButton);list.after(pager);
 composeButton.disabled=false;
 if(refreshButton){refreshButton.disabled=false;refreshButton.title=w().refresh;refreshButton.setAttribute('aria-label',w().refresh);refreshButton.addEventListener('click',()=>void load(false));}
 loadMoreButton.addEventListener('click',()=>void load(true));
 const composer=createComposer({host:dialog,request,getOwner:()=>owner,tell,onChange:()=>{if(['drafts','outbox'].includes(folder))void load(false);}});
 const keyOf=ref=>String(ref.mailbox)+':'+String(ref.uid);
 function cleanSender(from){
  const raw=String(from||'').trim();
  const name=raw.replace(/<[^>]*>/g,'').replace(/^["']|["']$/g,'').trim();
  return name||raw||'Unknown sender';
 }
 function displaySubject(value){
  const original=String(value||'').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
  // Defensive display cleanup for older server responses cached by the browser.
  const cleaned=original.replace(/\s*(?:open\s+in\s+(?:a\s+)?new\s+window|open\s+in\s+new\s+tab|在新視窗開啟)\s*$/i,'').trim();
  return cleaned||original||'(No subject)';
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
  if(['drafts','outbox'].includes(folder))return;
  list.replaceChildren();
  if(!messages.length)list.append(node('p',{class:'mailx-list-placeholder'},w().empty));
  for(const message of messages){
   const selected=!!current&&keyOf(current)===keyOf(message);
   const wrap=node('article',{class:'campus-mail-item'+(message.unread?' is-unread':'')+(selected?' is-active':'')});
   wrap.dataset.mailKey=keyOf(message);
   const openButton=button('',()=>void read(message));openButton.className='campus-mail-open';
   openButton.setAttribute('aria-label',cleanSender(message.from)+': '+displaySubject(message.subject));
   openButton.setAttribute('aria-pressed',String(selected));
   const sender=cleanSender(message.from),hash=Array.from(sender).reduce((n,c)=>n+c.charCodeAt(0),0)%5;
   const avatar=node('span',{class:'campus-mail-avatar campus-mail-tone-'+hash,'aria-hidden':'true'},initials(sender));
   const body=node('span',{class:'campus-mail-info'}),head=node('span',{class:'campus-mail-head'}),
    name=node('strong',{class:'campus-mail-sender'},sender),date=node('small',{class:'campus-mail-date'},message.date||'');
   head.append(name,date);body.append(head,node('span',{class:'campus-mail-subject'},displaySubject(message.subject)));
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
  search.placeholder=w().search;
  const pushLabel=pushId?w().disable:w().enable;
  pushLong.textContent=pushLabel;pushShort.textContent=pushId?w().mobileDisable:w().mobileEnable;
  pushButton.setAttribute('aria-label',pushLabel);
  officialLong.textContent=w().officialMail;officialShort.textContent=w().mobileOfficialMail;
  officialLink.setAttribute('aria-label',w().officialMail);
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
  messages=[];nextCursor=null;totalCount=0;search.value='';composer.bind(next);pushId=null;
   translationCache.clear();translationShown.clear();translationRequests.clear();
  list.replaceChildren();emptyReader();tell('');locale();renderList();
  if(!next){dialog.close();void navigator.serviceWorker?.getRegistration('/').then(async r=>{await(await r?.pushManager.getSubscription())?.unsubscribe();}).catch(()=>{});}
  else if(dialog.open)void load(false);
 }
 async function load(append=false){
  if(!owner||!isLive()){tell(w().login);return;}
  if(['drafts','outbox'].includes(folder)){sequence++;messages=[];nextCursor=null;totalCount=0;pager.hidden=true;markAllButton.hidden=true;count.textContent='';tell('');lastLoad=Date.now();await composer.panel(folder,list,query);return;}
  const seq=++sequence;
  if(busy){queuedLoad=append&&queuedLoad!=='reset'?'append':'reset';return;}
  if(append&&!nextCursor)return;
  busy=true;
  const startEpoch=epoch,location=folder+'\u0000'+query,cursor=append?nextCursor:null;
  tell(w().loading);loadMoreButton.disabled=true;markAllButton.disabled=true;
  try{
   const params=new URLSearchParams({folder,q:query,limit:String(append?50:25)});
   if(cursor)params.set('cursor',cursor);
   let result;
   // A background NTU notification check can momentarily own the mailbox.
   // Retry just this read without making the user reload the whole website.
   for(let attempt=0;;attempt++){
    try{result=await request('list?'+params);break;}
    catch(error){
     if(error.code!=='mail_busy'||attempt>=2)throw error;
     await new Promise(resolve=>setTimeout(resolve,900+attempt*900));
     if(seq!==sequence||startEpoch!==epoch||location!==folder+'\u0000'+query)return;
    }
   }
   if(seq!==sequence||startEpoch!==epoch||location!==folder+'\u0000'+query)return;
   const previous=append?messages:[],known=new Set(previous.map(keyOf));
   messages=previous.concat(result.messages.filter(m=>!known.has(keyOf(m))));
   totalCount=result.count;nextCursor=result.nextCursor||null;
   renderList();tell('');lastLoad=Date.now();
  }catch(error){if(seq===sequence&&startEpoch===epoch)tell(error.message);}
  finally{
   busy=false;if(!['drafts','outbox'].includes(folder))renderList();
   if(queuedLoad){const mode=queuedLoad;queuedLoad=null;void load(mode==='append');}
  }
 }
 async function read(ref,images=false){
   if(composer.active)return;
   const generation=++reading,identity=epoch;tell(w().loading);
   try{
    const message=await request('message?'+new URLSearchParams({mailbox:ref.mailbox,uid:ref.uid,...(images?{images:'1'}:{})}));
    if(generation!==reading||identity!==epoch)return;
    current=message;showSelection();
    reader.replaceChildren();dialog.classList.add('mail-reading');
    const toolbar=node('div',{class:'mailx-reader-toolbar'}),tools=node('div',{class:'mailx-reader-toolbar-buttons'});
    toolbar.append(button(w().back,()=>{dialog.classList.remove('mail-reading');}),tools);
    tools.append(button(w().reply,()=>edit(message)),button(w().archive,()=>void mutate('archive',message)),button(w().remove,()=>void mutate('trash',message)));
    const head=node('div',{class:'mail-message-head'}),heading=node('h3',{},displaySubject(message.subject));
    head.append(heading,node('p',{},message.headers));
    if(!images){
     const imagesControl=button(w().images,()=>void read(message,true));
     imagesControl.className='campus-mail-images';
     imagesControl.title=w().images;
     imagesControl.setAttribute('aria-label',w().images);
     tools.prepend(imagesControl);
    }
    for(const a of message.attachments){
     head.append(node('a',{href:'/api/mail/attachment?'+new URLSearchParams({mailbox:message.mailbox,uid:message.uid,part:a.part}),target:'_blank',rel:'noopener',class:'mail-attachment'},'↓ '+a.name));
    }
    const label=node('div',{class:'campus-mail-translation-label'},w().translationLabel);label.hidden=true;
    const frame=node('iframe',{title:displaySubject(message.subject),sandbox:'allow-popups allow-popups-to-escape-sandbox',referrerpolicy:'no-referrer',class:'mail-frame'});
    frame.srcdoc=message.html;reader.append(toolbar,head,label,frame);tell('');
    const readableText=new DOMParser().parseFromString(String(message.html||''),'text/html').body?.textContent||'';
    if(/[\u3400-\u9fff]/.test(String(message.subject||'')+' '+readableText)){
     const key=keyOf(message),control=button(w().translate,()=>void toggleTranslation());
     control.className='campus-mail-translate';
     tools.prepend(control);
     function showEnglish(active){
      const translation=translationCache.get(key);
      const enabled=active&&!!translation;
      if(enabled)translationShown.add(key);else translationShown.delete(key);
      heading.textContent=displaySubject(enabled?translation.subject:message.subject);
      frame.title=heading.textContent;
      frame.srcdoc=enabled?translation.html:message.html;
      label.hidden=!enabled;label.textContent=w().translationLabel;
      control.textContent=enabled?w().original:translation?w().english:w().translate;
      control.setAttribute('aria-pressed',String(enabled));
      control.title=enabled?w().original:w().geminiPrivacy;
      control.setAttribute('aria-label',control.title);
     }
     showEnglish(translationShown.has(key));
     async function toggleTranslation(){
      if(translationCache.has(key)){showEnglish(!translationShown.has(key));return;}
      control.disabled=true;control.textContent=w().loading;
      try{
       // Reopening a message during a slow Gemini request must not trigger a
       // second call. Cache the result even if this particular reader closed.
       let pending=translationRequests.get(key);
       if(!pending){
        pending=request('translate',{method:'POST',body:JSON.stringify({mailbox:message.mailbox,uid:message.uid})}).then(result=>{
         if(identity!==epoch)return null;
         if(!result.html||!result.body)throw new Error('Gemini returned no readable text.');
         if(translationCache.size>=30){
          const oldest=translationCache.keys().next().value;
          translationCache.delete(oldest);translationShown.delete(oldest);
         }
         translationCache.set(key,result);
         return result;
        }).finally(()=>{if(translationRequests.get(key)===pending)translationRequests.delete(key);});
        translationRequests.set(key,pending);
       }
       const result=await pending;
       if(!result||identity!==epoch||generation!==reading||current!==message)return;
       showEnglish(true);tell('');
      }catch(error){
       if(identity===epoch&&generation===reading&&current===message){
        showEnglish(false);tell(w().translationFailed+error.message);
       }
      }finally{control.disabled=false;}
     }
    }
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
  reading++;composer.cancelPanel();
  folder=next;query='';search.value='';sequence++;messages=[];nextCursor=null;totalCount=0;
  emptyReader();renderList();locale();void load(false);
 }
 function edit(reply){void composer.open(reply);}
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
 $('mail-close').addEventListener('click',async()=>{if(composer.active){await composer.close();return;}dialog.close();});
 document.querySelectorAll('[data-open-mail]').forEach(b=>b.addEventListener('click',open));
 for(const b of dialog.querySelectorAll('[data-mail-folder]'))b.addEventListener('click',()=>switchFolder(b.dataset.mailFolder));
 searchForm.addEventListener('submit',e=>{e.preventDefault();query=search.value.trim();messages=[];nextCursor=null;totalCount=0;void load(false);});
 search.addEventListener('search',()=>{if(!search.value){query='';messages=[];nextCursor=null;totalCount=0;void load(false);}});
 for(const id of ['language-en','language-zh','settings-language'])$(id).addEventListener(id==='settings-language'?'change':'click',()=>{locale();renderList();});
 setInterval(()=>{if(dialog.open&&owner&&!document.hidden&&navigator.onLine&&Date.now()-lastLoad>=60000&&!composer.active&&!busy&&messages.length<=25&&!current)void load(false);},60000);
 navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='open-mail')open();});
 return {bind,open,locale};
}
