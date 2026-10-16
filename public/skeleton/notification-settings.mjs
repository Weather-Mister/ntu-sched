// On-device diagnostics are separate from inbox polling and never send email.
const $=id=>document.getElementById(id);
const texts={
 en:{
  tab:'Alerts',title:'Mail notifications',intro:'Check your device and send a real test push. No email is sent.',
  permissionLabel:'Permission',deviceLabel:'This device',checkerLabel:'Mail checker',
  check:'Check setup',local:'Show local test',send:'Send push test',
  help:'Enable alerts in Campus Mail first. A local test checks display permission; a push test checks the server and provider. Provider acceptance does not guarantee the phone displayed an alert.',
  signIn:'Sign in to test notifications.',unsupported:'Not supported',allowed:'Allowed',blocked:'Blocked',unasked:'Not requested',
  registered:'Registered',missing:'Not registered',missingHelp:'This device is not registered. Open Campus Mail, enable alerts, then check again.',
  checking:'Checking browser, subscription and server…',first:'Waiting for first mail check',last:'Last checked ',error:'Mail checker: ',
  localDone:'Local notification requested. Did it appear?',localError:'Local test failed: ',
  sending:'Sending a test push through the server…',accepted:'Push provider accepted (HTTP ',acceptedEnd:'). Check your notifications; delivery to your phone is not yet confirmed.',
  failed:'Push test failed: ',install:'Install Campus Week from Safari on your Home Screen to use iPhone push alerts.'
 },
 zh:{
  tab:'通知',title:'郵件通知',intro:'檢查裝置設定並傳送真正的推播測試，不會寄出郵件。',
  permissionLabel:'通知權限',deviceLabel:'此裝置',checkerLabel:'郵件檢查',
  check:'檢查設定',local:'本機通知測試',send:'發送推播測試',
  help:'請先在 Campus Mail 開啟通知。本機測試檢查裝置顯示權限；推播測試檢查伺服器及推播服務。服務接受不表示已顯示通知。',
  signIn:'請先登入才能測試通知。',unsupported:'不支援',allowed:'已允許',blocked:'已封鎖',unasked:'尚未要求',
  registered:'已註冊',missing:'未註冊',missingHelp:'此裝置未註冊。請開啟 Campus Mail 啟用通知，再重新檢查。',
  checking:'正在檢查瀏覽器、訂閱與伺服器…',first:'等待首次郵件檢查',last:'上次檢查 ',error:'郵件檢查：',
  localDone:'已要求顯示本機通知。有收到嗎？',localError:'本機測試失敗：',
  sending:'正在經由伺服器傳送測試推播…',accepted:'推播服務已接受（HTTP ',acceptedEnd:'）。請查看通知；尚未確認送達手機。',
  failed:'推播測試失敗：',install:'iPhone 請先透過 Safari 將 Campus Week 加入主畫面。'
 }
};
const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window);
const installed=()=>!!navigator.standalone||matchMedia('(display-mode: standalone)').matches;
export function createNotificationSettings({account,getContext}){
 let epoch=0,deviceId=null,busy=false;
 const w=()=>texts[getContext().language==='zh'?'zh':'en'];
 const owner=()=>getContext().liveMode?account.current?.studentNumber:null;
 const current=(g,student)=>g===epoch&&!!student&&owner()===student;
 const show=(message,error=false)=>{
  $('settings-notify-status').textContent=message;
  $('settings-notify-status').classList.toggle('is-error',error);
 };
 function buttons(){
  const active=!!owner();
  $('settings-notify-check').disabled=busy||!active;
  $('settings-notify-local').disabled=busy||!active||!supported();
  $('settings-notify-push').disabled=busy||!active||!deviceId||!supported()||Notification.permission!=='granted';
 }
 function reset(){
  epoch++;deviceId=null;busy=false;
  for(const id of ['settings-notify-permission','settings-notify-device','settings-notify-checker'])$(id).textContent='—';
  show('');buttons();
 }
 function render(){
  for(const el of document.querySelectorAll('[data-notify-copy]'))el.textContent=w()[el.dataset.notifyCopy]||el.textContent;
  if(!owner()){show(w().signIn);deviceId=null;}
  if(supported()){
   const permission=Notification.permission;
   $('settings-notify-permission').textContent=permission==='granted'?w().allowed:permission==='denied'?w().blocked:w().unasked;
  }else $('settings-notify-permission').textContent=w().unsupported;
  buttons();
 }
 async function inspect(){
  const g=++epoch,student=owner();
  deviceId=null;buttons();
  if(!student){show(w().signIn);return;}
  if(!supported()){show(w().unsupported,true);$('settings-notify-device').textContent=w().unsupported;return;}
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&!installed()){
   show(w().install,true);$('settings-notify-device').textContent=w().missing;return;
  }
  show(w().checking);
  try{
   const registration=await navigator.serviceWorker.getRegistration('/')||await navigator.serviceWorker.register('/mail-sw.js',{scope:'/'});
   const [sub,server]=await Promise.all([registration.pushManager.getSubscription(),account.request('mail/push')]);
   if(!current(g,student))return;
   let id=null;
   if(sub){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sub.endpoint));
    id=btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
   }
   if(!current(g,student))return;
   deviceId=id&&server.devices?.some(d=>d.id===id)?id:null;
   $('settings-notify-device').textContent=deviceId?w().registered:w().missing;
   const state=server.state;
   const last=Number(state?.checked_at);
   $('settings-notify-checker').textContent=state?.last_error?w().error+state.last_error:last>0?w().last+new Intl.DateTimeFormat(getContext().language==='zh'?'zh-TW':'en-US',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Taipei'}).format(new Date(last)):w().first;
   show(deviceId?'':w().missingHelp,!deviceId);
  }catch(e){
   if(current(g,student)){
    $('settings-notify-device').textContent='—';
    $('settings-notify-checker').textContent='—';
    show(e.message||w().unsupported,true);
   }
  }finally{if(current(g,student))buttons();}
 }
 async function localTest(){
  const student=owner(),g=epoch;
  if(!student||!supported())return;
  busy=true;buttons();
  try{
   // Ask permission synchronously from a direct user gesture.
   if(Notification.permission!=='granted'&&await Notification.requestPermission()!=='granted')throw Error(w().blocked);
   const registration=await navigator.serviceWorker.getRegistration('/')||await navigator.serviceWorker.register('/mail-sw.js',{scope:'/'});
   await registration.showNotification('Campus Week · Local test',{body:'This device can display Campus Week notifications.',tag:'campus-week-local-test',icon:'/mail-icon-512.png'});
   if(current(g,student)){
    $('settings-notify-permission').textContent=w().allowed;
    show(w().localDone);
   }
  }catch(e){if(current(g,student))show(w().localError+(e.message||String(e)),true);}
  finally{if(current(g,student)){busy=false;buttons();}}
 }
 async function pushTest(){
  const student=owner(),g=epoch,id=deviceId;
  if(!student||!id){show(w().missingHelp,true);return;}
  busy=true;buttons();show(w().sending);
  try{
   const result=await account.request('mail/push/test',{method:'POST',body:JSON.stringify({id})});
   if(current(g,student))show(w().accepted+result.providerStatus+w().acceptedEnd);
  }catch(e){
   if(current(g,student)){
    show(w().failed+(e.message||String(e)),true);
    if(e.status===404||e.status===410){deviceId=null;$('settings-notify-device').textContent=w().missing;}
   }
  }finally{if(current(g,student)){busy=false;buttons();}}
 }
 $('settings-notify-check').addEventListener('click',()=>void inspect());
 $('settings-notify-local').addEventListener('click',()=>void localTest());
 $('settings-notify-push').addEventListener('click',()=>void pushTest());
 return {reset,render,inspect};
}
