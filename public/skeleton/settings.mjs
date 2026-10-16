import {THEMES,lessonStatistics,preferenceDefaults,normalizePreferences} from './settings-model.mjs';
import {applyGardenSkin} from '../skins/garden.mjs';
import {createNotificationSettings} from './notification-settings.mjs';
const $=id=>document.getElementById(id);
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const copy={
 en:{settings:'Settings',yourSpace:'',studentAccount:'STUDENT NUMBER',appearance:'Appearance',yourWeek:'Your week',onYourPhone:'Install',extras:'Hanzi Steps',makeItYours:'MAKE IT YOURS',chooseLook:'Appearance',themeHelp:'',garden:'Garden',light:'Daylight',lightDesc:'',dark:'Dark',darkDesc:'',atAGlance:'AT A GLANCE',weekNumbers:'Your week',courses:'courses',sessions:'sessions / week',hours:'hours / week',weeklyRhythm:'Weekly hours',statsNote:'Includes breaks between consecutive periods. Personal events excluded.',connections:'Sync & refresh',takeItWithYou:'TAKE IT WITH YOU',homeScreen:'Install Campus Week',installIntro:'Add Campus Week to your Home Screen.',installed:'Already installed',appleStep1:'Open Campus Week in Safari.',appleStep2:'Tap Share, then Add to Home Screen.',appleStep3:'Keep Open as Web App on if shown, then tap Add.',appleGuide:'Apple’s guide ↗',androidStep1:'Open Campus Week in Chrome.',androidStep2:'Tap the three-dot menu, then Add to Home screen.',androidStep3:'Choose Install, then confirm. Some versions show Install app directly.',androidGuide:'Google’s guide ↗',alwaysClose:'',installNow:'Install Campus Week',littleExtras:'A LITTLE EXTRA',keepLearning:'Hanzi Steps widget',hanziIntro:'',hanziHelp:'Show your streak, practice progress and next character beside your schedule. Enter your Hanzi Steps username to connect.',hanziUsername:'Hanzi Steps username',connectWidget:'Connect widget',hanziOptional:'Optional. Switch it off any time.',widgetPreview:'Sample progress',independent:'Independent NTU project',preview:'Sample data',connected:'',previewAccount:'',liveAccount:'',sampleSchedule:'Sample timetable · fictional data',noTimetable:'No saved timetable yet. Connect below to see your week.',autoCheck:'Checks every 5 days',lastChecked:'Updated',busiest:'Busiest day: ',free:'No classes scheduled',daysOnCampus:'class days',saved:'Saved to your account',previewSaved:'Sample mode · account unchanged',saving:'Saving…',saveFailed:'Could not save. Your choice is kept on this device; try again.',settingsChanged:'Settings changed on another device. Latest settings loaded.',loadingWidget:'Loading your Hanzi Steps progress…',widgetConnected:'Connected.',sampleWidget:'Sample progress',widgetOff:'Widget hidden.',enterUsername:'Enter your Hanzi Steps username to connect.',refreshWidget:'Refresh Hanzi Steps',dayStreak:'day streak',upNext:'UP NEXT',practices:'practices today',widgetUnavailable:'Live progress unavailable. Refresh to try again.',previewWidget:'Try sample widget',days:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],fullDays:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']},
 zh:{settings:'設定',yourSpace:'',studentAccount:'學號',appearance:'外觀',yourWeek:'每週課表',onYourPhone:'安裝',extras:'Hanzi Steps',makeItYours:'個人風格',chooseLook:'外觀',themeHelp:'',garden:'花園',light:'淺色',lightDesc:'',dark:'深色',darkDesc:'',atAGlance:'一目了然',weekNumbers:'每週課表',courses:'門課程',sessions:'堂課／週',hours:'小時／週',weeklyRhythm:'每週時數',statsNote:'包含連續節次間的休息時間，不含個人行程。',connections:'同步與更新',takeItWithYou:'隨身帶著走',homeScreen:'安裝 Campus Week',installIntro:'將 Campus Week 加到主畫面。',installed:'已安裝',appleStep1:'使用 Safari 開啟 Campus Week。',appleStep2:'點選「分享」，再選「加入主畫面」。',appleStep3:'如有「以網頁 App 開啟」，請保持開啟，再點「加入」。',appleGuide:'Apple 安裝說明 ↗',androidStep1:'使用 Chrome 開啟 Campus Week。',androidStep2:'點選右上角選單，再選「加到主畫面」。',androidStep3:'選擇「安裝」並確認。部分版本直接顯示「安裝應用程式」。',androidGuide:'Google 安裝說明 ↗',alwaysClose:'',installNow:'安裝 Campus Week',littleExtras:'一點小巧思',keepLearning:'Hanzi Steps 小工具',hanziIntro:'',hanziHelp:'在課表旁顯示連續學習天數、練習進度和下一個漢字。輸入 Hanzi Steps 使用者名稱即可連結。',hanziUsername:'Hanzi Steps 使用者名稱',connectWidget:'連結小工具',hanziOptional:'選用功能，隨時可以關閉。',widgetPreview:'範例進度',independent:'臺大獨立專案',preview:'範例資料',connected:'',previewAccount:'',liveAccount:'',sampleSchedule:'範例課表 · 虛構資料',noTimetable:'尚無已儲存課表，請在下方連線。',autoCheck:'每 5 天檢查一次',lastChecked:'更新時間',busiest:'最多課的日子：',free:'本週沒有課程',daysOnCampus:'天有課',saved:'已儲存至帳號',previewSaved:'範例模式 · 帳號設定不變',saving:'儲存中…',saveFailed:'無法儲存，已保留此裝置的選擇，請再試一次。',settingsChanged:'其他裝置已變更設定，已載入最新設定。',loadingWidget:'正在載入 Hanzi Steps 進度…',widgetConnected:'已連結。',sampleWidget:'範例進度',widgetOff:'已隱藏小工具。',enterUsername:'請輸入 Hanzi Steps 使用者名稱。',refreshWidget:'重新整理 Hanzi Steps',dayStreak:'天連續學習',upNext:'下一個字',practices:'次今日練習',widgetUnavailable:'無法載入最新進度，請重新整理再試一次。',previewWidget:'試用範例小工具',days:['一','二','三','四','五','六','日'],fullDays:['星期一','星期二','星期三','星期四','星期五','星期六','星期日']}
};
// Temporarily hidden throughout Campus Week; keep stored account preferences for restoration.
const HANZI_WIDGET_AVAILABLE=false;
const SAMPLE_WIDGET={streak:12,todayProgress:4,todayGoal:10,unit:8,book:1,unitColor:'#7f8f65',nextCharacter:{character:'學',pinyin:'xué',meaning:'to learn'}};
export function createSettings({account,onSessionExpired=()=>{}}){
 let context={student:null,liveMode:false,language:'en',timetable:null},owner=null,epoch=0,revision=0,version=0,preferences=preferenceDefaults(),ready=Promise.resolve(),saveChain=Promise.resolve(),widget=null,widgetError='',widgetBusy=false,widgetEpoch=0,lastWidgetLoad=0,installPrompt=null;
 const notificationSettings=createNotificationSettings({account,getContext:()=>context});
 const w=()=>copy[context.language==='zh'?'zh':'en'];
 try{const theme=localStorage.getItem('campus-week:appearance');if(THEMES.includes(theme))preferences.theme=theme;}catch{}
 function applyTheme(){
  document.body.dataset.theme=preferences.theme;
  document.body.dataset.themePreference=preferences.theme;
  $('theme-select').value=preferences.theme;
  applyGardenSkin(preferences.theme==='garden');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',document.body.dataset.theme==='dark'?'#111318':preferences.theme==='garden'?'#e9efdb':'#f6f3ed');
  for(const card of document.querySelectorAll('[data-theme-choice]'))card.setAttribute('aria-pressed',String(card.dataset.themeChoice===preferences.theme));
 }
 function rememberTheme(){try{localStorage.setItem('campus-week:appearance',preferences.theme);}catch{}}
 function stateMessage(message,error=false){$('settings-save-state').textContent=message;$('settings-save-state').classList.toggle('is-error',error);}
 async function request(path,options){const generation=epoch,current=owner;try{const result=await account.request(path,options);if(generation!==epoch||current!==owner)throw new Error('Account changed.');if(result.studentNumber!==current){onSessionExpired();throw new Error('Account changed.');}return result;}catch(e){if(generation===epoch&&e.status===401)onSessionExpired();throw e;}}
 function save(){
  revision++;rememberTheme();applyTheme();renderWidget();if(!context.liveMode){stateMessage(w().previewSaved);return Promise.resolve();}
  const generation=epoch,snapshot={...preferences};stateMessage(w().saving);
  const task=saveChain.catch(()=>{}).then(async()=>{await ready;if(generation!==epoch)return;try{const result=await request('preferences',{method:'PATCH',body:JSON.stringify({...snapshot,version})});if(generation!==epoch)return;version=result.version;stateMessage(w().saved);}catch(e){if(generation!==epoch)return;if(e.code==='preferences_changed'){const latest=await request('preferences');if(generation!==epoch)return;version=latest.version;preferences=normalizePreferences(latest.preferences);applyTheme();renderControls();stateMessage(w().settingsChanged,true);}else stateMessage(e.message||w().saveFailed,true);throw e;}});saveChain=task;return task;
 }
 function renderStats(){
  const stats=lessonStatistics(context.student?.courses||[]),locale=context.language==='zh'?'zh-TW':'en-US';
  $('stat-courses').textContent=stats.courses;$('stat-sessions').textContent=stats.sessions;$('stat-hours').textContent=new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(stats.hours);
  $('settings-busiest-day').textContent=stats.busiestDay===null?w().free:w().busiest+w().fullDays[stats.busiestDay];
  const timetable=context.timetable;let metadata=context.liveMode?w().noTimetable:w().sampleSchedule;
  if(context.liveMode&&timetable){const timestamp=Date.parse(timetable.syncedAt);const numeric=Number(timetable.syncedAt);const date=new Date(Number.isFinite(numeric)&&numeric>0?numeric:timestamp);metadata=(Number.isFinite(date.getTime())?w().lastChecked+' '+new Intl.DateTimeFormat(locale,{timeZone:'Asia/Taipei',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)+' · Taipei · ':'')+w().autoCheck;}
  $('settings-timetable-meta').textContent=metadata;$('settings-semester').textContent=timetable?.term?String(timetable.term):context.liveMode?'':w().preview;
  const chart=$('settings-week-chart');chart.replaceChildren();const max=Math.max(60,...stats.dailyMinutes);
  for(let day=0;day<7;day++){const minutes=stats.dailyMinutes[day],hours=Math.round(minutes/6)/10,item=node('li',day===stats.busiestDay?'is-busiest':'');item.setAttribute('aria-label',w().fullDays[day]+': '+hours+(context.language==='zh'?' 小時':' hours'));const track=node('span','week-bar-track'),fill=node('span','week-bar-fill');fill.style.setProperty('--bar-height',Math.max(0,minutes/max*100)+'%');track.append(fill);item.append(node('span','week-bar-value',minutes?new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(hours)+'h':'—'),track,node('span','week-bar-day',w().days[day]));chart.append(item);}
 }
 function companion(data,link=false){
  const root=node(link?'a':'div','hanzi-companion');if(link){root.href='https://weather-mister.github.io/hanzi-steps/';root.target='_blank';root.rel='noopener noreferrer';root.setAttribute('aria-label','Hanzi Steps · '+data.streak+' '+w().dayStreak);}
  root.style.setProperty('--hanzi-accent',/^#[0-9a-f]{6}$/i.test(data.unitColor||'')?data.unitColor:'#7f8f65');root.style.setProperty('--practice-progress',Math.min(100,Math.max(0,data.todayProgress/(data.todayGoal||10)*100))+'%');
  const streak=node('span','hanzi-companion-streak');streak.append(node('small','','HANZI STEPS'),node('strong','',String(data.streak)),node('span','',w().dayStreak));
  const next=node('span','hanzi-companion-next'),character=node('span','hanzi-companion-character'),info=node('span');info.append(node('span','',data.nextCharacter?.pinyin||''),node('small','',data.nextCharacter?.meaning||''));character.append(node('b','',data.nextCharacter?.character||'字'),info);
  const progress=node('span','hanzi-companion-progress'),track=node('i');track.append(node('span'));progress.append(track,node('span','',data.todayProgress+'/'+data.todayGoal));next.append(node('small','',w().upNext+' / '+(context.language==='zh'?'第 '+data.unit+' 單元':'UNIT '+data.unit)),character,progress);root.append(streak,next);return root;
 }
 function renderWidget(){
  if(!HANZI_WIDGET_AVAILABLE){const dashboard=$('dashboard-hanzi');dashboard.hidden=true;dashboard.replaceChildren();return;}
  const data=widget||SAMPLE_WIDGET,preview=$('settings-hanzi-preview');preview.replaceChildren(companion(data));
  document.querySelector('.settings-preview-tag').textContent=widget&&context.liveMode?(context.language==='zh'?'目前進度':'Live progress'):w().widgetPreview;
  const dashboard=$('dashboard-hanzi');dashboard.hidden=!context.student||!preferences.hanziEnabled;dashboard.replaceChildren();if(dashboard.hidden)return;
  const label=node('div','dashboard-hanzi-label'),refresh=node('button');refresh.type='button';refresh.setAttribute('aria-label',w().refreshWidget);refresh.title=w().refreshWidget;refresh.disabled=widgetBusy;
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');
  icon.setAttribute('aria-hidden','true');use.setAttribute('href','#i-refresh');icon.append(use);refresh.append(icon);
  refresh.addEventListener('click',()=>void loadWidget());label.append(node('span','','HANZI STEPS'),refresh);dashboard.append(label);
  if(widget||!context.liveMode)dashboard.append(companion(data,true));
  else dashboard.append(node('p','dashboard-hanzi-status',widgetBusy?w().loadingWidget:w().widgetUnavailable));
  if(widgetError&&widget)dashboard.append(node('p','dashboard-hanzi-status',w().widgetUnavailable));
  if(!context.liveMode)dashboard.append(node('p','dashboard-hanzi-status',w().sampleWidget));
 }
 function renderControls(){
  $('settings-hanzi-enabled').checked=preferences.hanziEnabled;
  if(document.activeElement!==$('settings-hanzi-username'))$('settings-hanzi-username').value=preferences.hanziUsername;
  $('settings-hanzi-connect').textContent=widgetBusy?w().loadingWidget:context.liveMode?w().connectWidget:w().previewWidget;$('settings-hanzi-connect').disabled=widgetBusy;
  renderWidget();
 }
 async function loadWidget(username=preferences.hanziUsername,{connect=false}={}){
  if(!HANZI_WIDGET_AVAILABLE||widgetBusy||!owner)return;username=String(username||'').trim().toLowerCase();
  if(!/^[a-z0-9_]{2,32}$/.test(username)){setWidgetMessage(w().enterUsername,true);return;}
  const generation=epoch,run=++widgetEpoch;widgetBusy=true;setWidgetMessage(w().loadingWidget);renderControls();
  try{
   const result=context.liveMode?await request('widgets/hanzi?username='+encodeURIComponent(username)):{widget:SAMPLE_WIDGET};if(generation!==epoch||run!==widgetEpoch)return;
   widget=result.widget;widgetError='';lastWidgetLoad=Date.now();
   if(connect){preferences.hanziUsername=username;preferences.hanziEnabled=true;await save();if(generation!==epoch)return;}
   setWidgetMessage(context.liveMode?w().widgetConnected:w().sampleWidget);
  }catch(e){if(generation===epoch&&run===widgetEpoch){widgetError=e.message;setWidgetMessage(e.message,true);}}
  finally{if(generation===epoch&&run===widgetEpoch){widgetBusy=false;renderControls();}}
 }
 function setWidgetMessage(text,error=false){$('settings-hanzi-status').textContent=text;$('settings-hanzi-status').classList.toggle('is-error',error);}
 function bind(next){
  const identity=next.student?(next.liveMode?next.student.id:'preview:'+next.student.id):null;context=next;if(identity===owner)return;
  notificationSettings.reset();epoch++;widgetEpoch++;revision=0;version=0;owner=identity;widget=null;widgetError='';widgetBusy=false;lastWidgetLoad=0;saveChain=Promise.resolve();preferences={...preferenceDefaults(),theme:document.body.dataset.themePreference||'light'};$('settings-hanzi-username').value='';setWidgetMessage('');stateMessage('');
  if(!owner){renderWidget();return;}
  const generation=epoch,initialRevision=revision;
  ready=next.liveMode?(async()=>{try{const result=await request('preferences');if(generation!==epoch)return;version=result.version;if(revision===initialRevision){preferences=normalizePreferences(result.preferences);applyTheme();rememberTheme();renderControls();if(HANZI_WIDGET_AVAILABLE&&preferences.hanziEnabled)void loadWidget();}}catch(e){if(generation===epoch)stateMessage(e.message||w().saveFailed,true);}})():Promise.resolve();
 }
 function update(next){bind(next);for(const element of document.querySelectorAll('[data-settings-copy]'))element.textContent=w()[element.dataset.settingsCopy]||element.textContent;
  $('account-id').textContent=next.student?.id||'—';$('account-name').textContent=next.liveMode?w().liveAccount:w().previewAccount;$('settings-account-status').textContent=next.liveMode?w().connected:w().preview;
  $('settings-installed').hidden=!(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true);renderStats();renderControls();applyTheme();notificationSettings.render();
  if(!next.liveMode){$('live-timetable-settings-status').textContent=w().sampleSchedule;$('live-cool-settings-status').textContent=w().preview;}
 }
 for(const button of document.querySelectorAll('[data-theme-choice]'))button.addEventListener('click',()=>{preferences.theme=button.dataset.themeChoice;void save().catch(()=>{});});
 $('theme-select').addEventListener('change',event=>{if(THEMES.includes(event.target.value)){preferences.theme=event.target.value;void save().catch(()=>{});}});
 for(const button of document.querySelectorAll('[data-settings-tab]'))button.addEventListener('click',()=>{document.querySelector('[data-settings-panel="'+button.dataset.settingsTab+'"]')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});
 $('settings-hanzi-form').addEventListener('submit',event=>{event.preventDefault();if($('settings-hanzi-username').reportValidity())void loadWidget($('settings-hanzi-username').value,{connect:true});});
 $('settings-hanzi-enabled').addEventListener('change',async event=>{
  if(event.target.checked&&!preferences.hanziUsername){event.target.checked=false;$('settings-hanzi-username').focus();setWidgetMessage(w().enterUsername);return;}
  const enabled=event.target.checked;preferences.hanziEnabled=enabled;if(!enabled){widgetEpoch++;widgetBusy=false;setWidgetMessage(w().widgetOff);}try{await save();if(enabled)void loadWidget();}catch{}
 });
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('settings-install-button').hidden=false;});
 window.addEventListener('appinstalled',()=>{installPrompt=null;$('settings-install-button').hidden=true;$('settings-installed').hidden=false;});
 // Register the existing no-cache worker for installation without requesting
 // notification permission. Notifications remain a separate explicit action.
 if('serviceWorker' in navigator)void navigator.serviceWorker.register('/mail-sw.js',{scope:'/'}).catch(()=>{});
 $('settings-install-button').addEventListener('click',async()=>{if(!installPrompt)return;const prompt=installPrompt;installPrompt=null;$('settings-install-button').hidden=true;await prompt.prompt();await prompt.userChoice;});
 if(HANZI_WIDGET_AVAILABLE)window.addEventListener('focus',()=>{if(preferences.hanziEnabled&&context.student&&!document.hidden&&Date.now()-lastWidgetLoad>120000)void loadWidget();});
 if(HANZI_WIDGET_AVAILABLE)setInterval(()=>{if(preferences.hanziEnabled&&context.student&&!document.hidden&&document.hasFocus()&&navigator.onLine!==false&&Date.now()-lastWidgetLoad>120000)void loadWidget();},120000);
 applyTheme();return {update,reset(){update({student:null,liveMode:false,language:context.language,timetable:null});},open(){update(context);document.querySelector('.settings-main').scrollTop=0;void notificationSettings.inspect();}};
}
