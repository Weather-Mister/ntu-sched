// Campus Week standalone preview. Fictional, in-memory data only; no API requests or credentials.
const $ = id => document.getElementById(id);
const DAY = 86400000;
const profiles = {
  engineering: {
    name:['Engineering student','工程學院學生'],id:'PREVIEW-A',tasks:['Read chapter 3','Review lab notes'],
    courses:[
      [0,'09:10','10:00','Introduction to Mechanics','機械學導論','Room 201','DEMO101'],
      [0,'14:20','16:10','Communication in Engineering','工程溝通','Room B205','DEMO102'],
      [1,'10:20','12:10','Calculus I','微積分（一）','Room 112','DEMO103'],
      [2,'09:10','12:10','Computer-Aided Design Studio','電腦輔助設計','Design Lab 3','DEMO104'],
      [3,'10:20','12:10','Materials and Structures','材料與結構','Engineering 204','DEMO105'],
      [4,'13:20','15:10','Physics Laboratory','物理實驗','Lab 1','DEMO106']
    ],
    deadlines:[[2,'Problem set 2','習題二','Calculus I','微積分（一）'],[5,'Project discussion','專題討論','Design Studio','設計工作室'],[8,'Lab reflection','實驗心得','Physics Laboratory','物理實驗']]
  },
  social:{
    name:['Social sciences student','社會科學院學生'],id:'PREVIEW-B',tasks:['Outline policy presentation'],
    courses:[
      [0,'10:20','12:10','Introduction to Public Policy','公共政策導論','Social Sciences 507','MOCK201'],
      [1,'09:10','12:10','Microeconomics','個體經濟學','Social Sciences 202','MOCK202'],
      [1,'13:20','15:10','Social Research Methods','社會研究方法','Room 305','MOCK203'],
      [2,'14:20','17:20','Contemporary Society and Culture in East Asia','東亞當代社會與文化','Room 401','MOCK204'],
      [3,'10:20','12:10','Statistics','統計學','Social Sciences 502','MOCK205'],
      [3,'11:20','13:10','Research Seminar (overlap demo)','研究專題（衝堂範例）','Seminar Room 2','MOCK206'],
      [5,'09:10','10:00','Community Fieldwork','社區田野調查','Outside campus','MOCK207']
    ],
    deadlines:[[1,'Reading reflection','閱讀心得','Public Policy','公共政策'],[4,'Seminar meeting','專題研討會','Research Methods','研究方法']]
  }
};
const dict={
  en:{
    loginEyebrow:'NTU · CAMPUS WEEK',loginTitle:'Your week, organized.',loginIntro:'Your courses, deadlines and tasks, in one place. Explore the design using fictional student profiles.',previewLabel:'Choose a fictional preview profile',engineeringProfile:'Engineering student (sample)',socialProfile:'Social sciences student (sample)',enterPreview:'Enter interface preview',loginSafety:'Preview only. No NTU passwords, actual accounts, or live integrations are used here.',disclaimer:'Independent student project · Not an official NTU service',headerEyebrow:'NTU · CAMPUS WEEK PREVIEW',mySchedule:'My Schedule',
    chooseDate:'Choose date',today:'Today',week:'Week',coursesLabel:'NTU + COURSES',upcomingDates:'Upcoming dates',refresh:'Refresh',sampleDeadlines:'Illustrative events and deadlines; not connected to COOL.',toDo:'TO DO',manualTasks:'Manual tasks',newTask:'New task',add:'Add',tasksOnly:'Preview tasks stay in memory and disappear on reload.',
    classDetails:'CLASS DETAILS',time:'Time',location:'Location',courseCode:'Course code',status:'Status',repeatsWeekly:'Preview follows a repeating weekly schedule.',preferences:'PREFERENCES',settings:'Settings',account:'Account',appearance:'Appearance',language:'Language',timetable:'Timetable',widgets:'Widgets',privacy:'Privacy & security',about:'About',
    accountDesc:'Your Campus Week identity and sessions.',demoAccount:'Fictional account · design preview only',accountActions:'Account actions',switchHelp:"Switching accounts clears the current student's preview before returning to sign-in.",switchAccount:'Switch account',logOut:'Log out',appearanceDesc:'Preview theme setting; changes are not saved.',theme:'Theme',light:'Light',dark:'Dark',langDesc:'Select interface language. Course names reflect the sample data.',interfaceLanguage:'Interface language',
    timetableDesc:'Timetable connections will be wired to the existing backend later.',previewStatus:'Preview data',syncNotConnected:'Not connected to your NTU account in this preview.',reconnectLater:'Reconnect (later)',coolDesc:'Calendar deadlines will be connected after the UI is finalized.',widgetsDesc:'Optional extras can be added without affecting the core schedule.',hanziLater:'Future optional widget. Disabled by default. Username input and loading will be implemented later.',comingLater:'Coming later',
    securityDesc:'Production account access remains exclusively with our existing Cloudflare backend.',noCredentials:'No credentials in preview',securityPreview:'This demo does not request NTU credentials, contact APIs or persist student data.',signOutAllLater:'Sign out all devices (later)',aboutDesc:'Campus Week UI skeleton v1. Independent student project; not affiliated with National Taiwan University.',designPreview:'Design preview',aboutDetails:'Lightweight static HTML, CSS and JavaScript. Separate from the existing working site.',
    next:'UP NEXT',live:'HAPPENING NOW',startsIn:'Starts in',endsIn:'Ends in',classes:'classes',singleClass:'class',noClasses:'No classes today',noClassesDesc:'Your sample timetable is clear on this date.',tasks:'tasks',singleTask:'task',addPlaceholder:'Add a task…',noTasks:'No tasks yet. Add one above.',completed:'Finished',upcoming:'Upcoming',scheduled:'Scheduled',previewRefresh:'This is sample data; no live refresh was made.',overlap:'Time clash',
    assignments:'Assignments',announcements:'Announcements',sampleAnnouncements:'Fictional announcements for layout preview; not connected to COOL.',
    days:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],shortDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  },
  zh:{
    loginEyebrow:'臺大 · CAMPUS WEEK',loginTitle:'讓每週行程更有條理。',loginIntro:'在同一個地方查看課表、期限與待辦事項。請使用虛構學生資料預覽設計。',previewLabel:'選擇虛構學生資料',engineeringProfile:'工程學院學生（範例）',socialProfile:'社會科學院學生（範例）',enterPreview:'進入介面預覽',loginSafety:'僅供預覽，不會使用臺大密碼、真實帳號或線上整合功能。',disclaimer:'獨立學生專案 · 非臺灣大學官方服務',headerEyebrow:'臺大 · CAMPUS WEEK 預覽',mySchedule:'我的課表',
    chooseDate:'選擇日期',today:'今天',week:'本週',coursesLabel:'臺大 + 課程',upcomingDates:'近期日期',refresh:'重新整理',sampleDeadlines:'以上為虛構事件與期限，尚未連結 NTU COOL。',toDo:'待辦事項',manualTasks:'手動任務',newTask:'新增任務',add:'新增',tasksOnly:'預覽任務僅暫存於記憶體，重新整理後會消失。',
    classDetails:'課程詳情',time:'時間',location:'地點',courseCode:'課號',status:'狀態',repeatsWeekly:'此預覽使用每週重複課表。',preferences:'偏好設定',settings:'設定',account:'帳號',appearance:'外觀',language:'語言',timetable:'課表',widgets:'小工具',privacy:'隱私與安全',about:'關於',
    accountDesc:'Campus Week 身分與登入狀態。',demoAccount:'虛構帳號 · 僅供設計預覽',accountActions:'帳號操作',switchHelp:'切換帳號前會清除畫面上的上一位虛構學生資料。',switchAccount:'切換帳號',logOut:'登出',appearanceDesc:'預覽主題設定；不會儲存變更。',theme:'主題',light:'淺色',dark:'深色',langDesc:'選擇介面語言。課程名稱來自範例資料。',interfaceLanguage:'介面語言',
    timetableDesc:'課表連線將於介面定稿後接入現有後端。',previewStatus:'預覽資料',syncNotConnected:'本預覽未連線至臺大帳號。',reconnectLater:'稍後重新連線',coolDesc:'介面定稿後才會連結日曆與作業期限。',widgetsDesc:'選用小工具不會影響主要課表。',hanziLater:'未來可選擇啟用，預設關閉；使用者名稱輸入及資料載入會稍後實作。',comingLater:'稍後推出',
    securityDesc:'正式帳號存取仍由現有 Cloudflare 後端處理。',noCredentials:'預覽不需帳密',securityPreview:'此預覽不會要求臺大帳密、呼叫 API 或持久儲存學生資料。',signOutAllLater:'登出所有裝置（稍後）',aboutDesc:'Campus Week 介面骨架 v1。獨立學生專案，與國立臺灣大學無隸屬關係。',designPreview:'設計預覽',aboutDetails:'使用輕量 HTML、CSS 與 JavaScript；與現有網站完全分離。',
    next:'下一堂課',live:'正在上課',startsIn:'距離開始',endsIn:'距離結束',classes:'堂課',singleClass:'堂課',noClasses:'今天沒有課',noClassesDesc:'這天的範例課表沒有課程。',tasks:'項任務',singleTask:'項任務',addPlaceholder:'新增任務…',noTasks:'目前沒有任務。',completed:'已結束',upcoming:'即將開始',scheduled:'已排定',previewRefresh:'這是範例資料，未執行線上同步。',overlap:'時間衝突',
    assignments:'作業',announcements:'公告',sampleAnnouncements:'以上為虛構公告，尚未連接 NTU COOL。',
    days:['星期一','星期二','星期三','星期四','星期五','星期六','星期日'],shortDays:['週一','週二','週三','週四','週五','週六','週日']
  }
};
let language='en',student=null,tasks=[],selectedDate=taipeiToday(),activePanel='account',opened=null,counter=0,coolView='assignments';
const t = key => dict[language][key]===undefined?key:dict[language][key];
function node(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;}
function iso(date){return date.toISOString().slice(0,10);}
function dateFor(key){if(!/^\d{4}-\d{2}-\d{2}$/.test(key))throw Error('Invalid date');const d=new Date(key+'T00:00:00Z');if(!Number.isFinite(+d)||iso(d)!==key)throw Error('Invalid date');return d;}
function offset(key,days){return iso(new Date(dateFor(key).getTime()+days*DAY));}
function weekday(key){return (dateFor(key).getUTCDay()+6)%7;}
function monday(key){return offset(key,-weekday(key));}
function taipeiToday(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}
function pretty(key,short=false){return new Intl.DateTimeFormat(language==='zh'?'zh-TW':'en-US',{timeZone:'UTC',month:short?'short':'long',day:'numeric',year:short?undefined:'numeric'}).format(dateFor(key));}
function longDate(key){return t('days')[weekday(key)]+', '+pretty(key);}
function lessonTime(key,time){return Date.parse(key+'T'+time+':00+08:00');}
function howLong(ms){const n=Math.max(0,Math.ceil(ms/60000));const h=Math.floor(n/60);return (h?h+'h ':'')+(n%60?n%60+'m':h?'':'0m');}
function lessonState(c,key){const now=Date.now();return now>=lessonTime(key,c[2])?t('completed'):now>=lessonTime(key,c[1])?t('live'):t('upcoming');}
function renderBanner(){
  if(!student)return;const today=taipeiToday(),now=Date.now(),events=[];
  for(let d=0;d<=7;d++){const key=offset(today,d),wd=weekday(key);
    for(const c of student.courses.filter(x=>x[0]===wd)){const start=lessonTime(key,c[1]),end=lessonTime(key,c[2]);if(end>now)events.push({c,key,start,end,live:start<=now});}
  }
  events.sort((a,b)=>Number(b.live)-Number(a.live)||a.start-b.start);
  const next=events[0];
  $('next-label').textContent=next?(next.live?t('live'):t('next')):'—';
  $('next-title').textContent=next?next.c[language==='zh'?4:3]:'—';
  $('next-meta').textContent=next?longDate(next.key)+' · '+next.c[1]+'–'+next.c[2]+' · '+next.c[5]:'';
  $('next-countdown').textContent=next?(next.live?t('endsIn'):t('startsIn'))+' '+howLong((next.live?next.end:next.start)-now):'';
  const badgeDay = $('next-badge-day'), badgeTime = $('next-badge-time');
  if(!next){badgeDay.textContent='—';badgeTime.textContent='';}
  else {
    badgeDay.textContent=next.live||next.key===today?(language==='zh'?'今天':'Today'):
      next.key===offset(today,1)?(language==='zh'?'明天':'Tomorrow'):
      t('days')[weekday(next.key)];
    const time=next.live?next.c[2]:next.c[1];
    const [hour,minute]=time.split(':').map(Number);
    badgeTime.textContent=language==='zh'?time:((hour%12)||12)+':'+String(minute).padStart(2,'0')+(hour>=12?' PM':' AM');
  }
}
function renderCalendar(){
  if(!student)return;const base=monday(selectedDate),today=taipeiToday(),strip=$('day-strip');
  const end=offset(base,6);
  const monthfmt=new Intl.DateTimeFormat(language==='zh'?'zh-TW':'en-US',{timeZone:'UTC',month:'short',day:'numeric'});
  $('week-range').textContent=language==='zh'?
    monthfmt.format(dateFor(base))+' – '+monthfmt.format(dateFor(end)):
    (base.slice(0,7)===end.slice(0,7)?monthfmt.format(dateFor(base))+'–'+dateFor(end).getUTCDate():monthfmt.format(dateFor(base))+' – '+monthfmt.format(dateFor(end)));
  $('choose-date').value=selectedDate;strip.replaceChildren();
  for(let d=0;d<7;d++){
    const key=offset(base,d),btn=node('button','day-button');btn.type='button';btn.classList.toggle('active',key===selectedDate);btn.classList.toggle('today',key===today);
    btn.setAttribute('aria-pressed',String(key===selectedDate));btn.setAttribute('aria-label',longDate(key));
    btn.append(node('span','day-name',t('shortDays')[d]),node('span','day-date',String(dateFor(key).getUTCDate())));
    btn.addEventListener('click',()=>{selectedDate=key;renderCalendar();});strip.append(btn);
  }
  const items=student.courses.filter(c=>c[0]===weekday(selectedDate)).sort((a,b)=>a[1].localeCompare(b[1]));
  $('selected-day').textContent=t('days')[weekday(selectedDate)];$('selected-date').textContent=pretty(selectedDate);
  $('class-count').textContent=items.length+' '+(items.length===1?t('singleClass'):t('classes'));
  const list=$('schedule-list');list.replaceChildren();
  if(!items.length){const empty=node('div','empty-card');empty.append(node('strong','',t('noClasses')),node('span','',t('noClassesDesc')));list.append(empty);}
  for(const c of items){
    const btn=node('button','lesson');btn.type='button';
    if(selectedDate===today){btn.classList.toggle('live',lessonState(c,selectedDate)===t('live'));btn.classList.toggle('completed',lessonState(c,selectedDate)===t('completed'));}
    const clock=node('span','lesson-time');clock.append(node('strong','',c[1]),node('span','',c[2]));
    const card=node('span','lesson-card');card.dataset.color=String(student.courses.indexOf(c)%7);
    card.append(node('span','lesson-name',c[language==='zh'?4:3]),node('span','lesson-room',c[5]));
    if(items.some(other=>other!==c&&other[1]<c[2]&&c[1]<other[2]))card.append(node('span','state-pill',t('overlap')));
    btn.append(clock,card);btn.addEventListener('click',()=>showLesson(c,selectedDate));list.append(btn);
  }
}
const announcements={
  engineering:[
    ['New course materials available','已新增課程教材','Engineering Mathematics','工程數學',0],
    ['Tutorial room information','助教課教室資訊','Statics','靜力學',2],
    ['Laboratory update','實驗課公告','Engineering Materials','工程材料',4]
  ],
  social:[
    ['Seminar reading posted','研討會閱讀資料已發布','Research Methods','研究方法',0],
    ['Class discussion reminder','課堂討論提醒','Exploring Taiwan','探索臺灣',2],
    ['Updated tutorial information','助教課資訊更新','Statistics','統計學',5]
  ]
};
function renderDeadlines(){
  const list=$('cool-list');list.replaceChildren();if(!student)return;
  document.querySelectorAll('[data-cool-view]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.coolView===coolView)));
  $('cool-list').setAttribute('aria-labelledby',coolView==='assignments'?'cool-assignments-tab':'cool-announcements-tab');
  $('cool-heading').textContent=coolView==='assignments'?t('upcomingDates'):t('announcements');
  $('cool-preview-note').textContent=coolView==='assignments'?t('sampleDeadlines'):t('sampleAnnouncements');
  if(coolView==='announcements'){
    const profile=student===profiles.engineering?'engineering':'social';
    for(const entry of announcements[profile]){
      const card=node('article','cool-item announcement-card card'),date=node('span','cool-date'),copy=node('span','cool-copy');
      const key=offset(taipeiToday(),-entry[4]);date.append(node('strong','',String(dateFor(key).getUTCDate())),node('small','',pretty(key,true).replace(/[0-9]/g,'').trim()));
      copy.append(node('strong','',entry[language==='zh'?1:0]),node('small','',entry[language==='zh'?3:2]));
      card.append(date,copy);list.append(card);
    }
    return;
  }
  for(const item of student.deadlines){
    const key=offset(taipeiToday(),item[0]),card=node('article','cool-item card'),date=node('span','cool-date'),copy=node('span','cool-copy');
    date.append(node('strong','',String(dateFor(key).getUTCDate())),node('small','',pretty(key,true).replace(/[0-9]/g,'').trim()));
    copy.append(node('strong','',item[language==='zh'?2:1]),node('small','',item[language==='zh'?4:3]));
    card.append(date,copy,node('span','cool-due',language==='zh'?item[0]+' 天後':'In '+item[0]+' days'));list.append(card);
  }
}
function renderTasks(){
  const list=$('todo-list');list.replaceChildren();$('task-count').textContent=tasks.length+' '+(tasks.length===1?t('singleTask'):t('tasks'));
  if(!tasks.length){list.append(node('div','empty-card',t('noTasks')));return;}
  for(const task of tasks){
    const row=node('div','todo-row card'),check=node('button','todo-check',task.done?'✓':''),label=node('span','todo-label',task.text),remove=node('button','todo-remove','×');
    row.classList.toggle('done',task.done);check.type='button';remove.type='button';
    check.setAttribute('aria-label',task.done?'Mark not done':'Mark done');remove.setAttribute('aria-label','Remove task');
    check.addEventListener('click',()=>{task.done=!task.done;renderTasks();});
    remove.addEventListener('click',()=>{tasks=tasks.filter(x=>x.id!==task.id);renderTasks();});
    row.append(check,label,remove);list.append(row);
  }
}
function renderTranslations(){
  document.documentElement.lang=language==='zh'?'zh-Hant':'en';
  document.querySelectorAll('[data-i18n]').forEach(el=>{const translated=t(el.dataset.i18n);if(typeof translated==='string')el.textContent=translated;});
  $('language-en').setAttribute('aria-pressed',String(language==='en'));$('language-zh').setAttribute('aria-pressed',String(language==='zh'));$('login-language-en').setAttribute('aria-pressed',String(language==='en'));$('login-language-zh').setAttribute('aria-pressed',String(language==='zh'));
  $('settings-language').value=language;$('task-input').placeholder=t('addPlaceholder');
  const choices=$('settings-mobile-choices');choices.replaceChildren();
  document.querySelectorAll('.settings-nav [data-settings-tab]').forEach(original=>{
    const btn=node('button','',original.textContent);btn.type='button';btn.dataset.settingsTab=original.dataset.settingsTab;btn.setAttribute('aria-selected',String(activePanel===btn.dataset.settingsTab));
    btn.addEventListener('click',()=>showPanel(btn.dataset.settingsTab));choices.append(btn);
  });
  choices.hidden=false;
  // Keep the chosen NTU panel tab when the interface language changes.
  document.querySelectorAll('[data-cool-view]').forEach(button=>button.textContent=t(button.dataset.i18n));
}
function showPanel(which){
  activePanel=which;
  document.querySelectorAll('[data-settings-tab]').forEach(btn=>btn.setAttribute('aria-selected',String(btn.dataset.settingsTab===which)));
  document.querySelectorAll('[data-settings-panel]').forEach(panel=>{panel.hidden=panel.dataset.settingsPanel!==which;});
  $('account-name').textContent=student?student.name[language==='zh'?1:0]:'';
  $('account-id').textContent=student?student.id:'';
  document.querySelector('.settings-main').scrollTop=0;
}
function renderAll(){
  renderTranslations();if(!student)return;renderBanner();renderCalendar();renderDeadlines();renderTasks();showPanel(activePanel);
  if(opened&&$('lesson-dialog').open)populateLesson(opened.c,opened.key);
}
function populateLesson(c,key){
  $('lesson-dialog-name').textContent=c[language==='zh'?4:3];
  $('lesson-dialog-time').textContent=longDate(key)+' · '+c[1]+'–'+c[2];
  $('lesson-dialog-room').textContent=c[5];$('lesson-dialog-code').textContent=c[6];$('lesson-dialog-status').textContent=lessonState(c,key);
}
function showLesson(c,key){opened={c,key};populateLesson(c,key);$('lesson-dialog').showModal();}
function leavePreview(){
  if($('lesson-dialog').open)$('lesson-dialog').close();
  if($('settings-dialog').open)$('settings-dialog').close();
  student=null;tasks=[];opened=null;counter=0;selectedDate=taipeiToday();activePanel='account';coolView='assignments';
  for(const id of ['schedule-list','cool-list','todo-list','day-strip'])$(id).replaceChildren();
  $('next-title').textContent='—';$('next-meta').textContent='';$('next-countdown').textContent='';$('next-badge-day').textContent='—';$('next-badge-time').textContent='';
  $('account-name').textContent='';$('account-id').textContent='';
  $('app-screen').hidden=true;$('login-screen').hidden=false;$('preview-profile').focus();
}
function enterPreview(){
  const key=$('preview-profile').value;if(!Object.hasOwn(profiles,key))return;
  student=profiles[key];tasks=student.tasks.map(text=>({id:++counter,text,done:false}));
  selectedDate=taipeiToday();activePanel='account';opened=null;coolView='assignments';
  $('login-screen').hidden=true;$('app-screen').hidden=false;renderAll();$('open-settings').focus();
}
function chooseLanguage(value){language=value;renderAll();}
$('enter-preview').addEventListener('click',enterPreview);
$('login-language-en').addEventListener('click',()=>chooseLanguage('en'));
$('login-language-zh').addEventListener('click',()=>chooseLanguage('zh'));
$('language-en').addEventListener('click',()=>chooseLanguage('en'));
$('language-zh').addEventListener('click',()=>chooseLanguage('zh'));
$('settings-language').addEventListener('change',e=>chooseLanguage(e.target.value));
$('theme-select').addEventListener('change',e=>{document.body.dataset.theme=e.target.value;});
$('page-refresh').addEventListener('click',()=>{renderAll();$('toast').textContent=t('previewRefresh');});
$('previous-week').addEventListener('click',()=>{selectedDate=offset(selectedDate,-7);renderCalendar();});
$('next-week').addEventListener('click',()=>{selectedDate=offset(selectedDate,7);renderCalendar();});
$('jump-today').addEventListener('click',()=>{selectedDate=taipeiToday();renderCalendar();});
$('choose-date').addEventListener('change',e=>{try{dateFor(e.target.value);selectedDate=e.target.value;renderCalendar();}catch{$('choose-date').value=selectedDate;}});
$('cool-refresh').addEventListener('click',()=>{renderDeadlines();$('toast').textContent=t('previewRefresh');});
document.querySelectorAll('[data-cool-view]').forEach(button=>button.addEventListener('click',()=>{
  coolView=button.dataset.coolView;renderDeadlines();
}));
$('task-form').addEventListener('submit',e=>{
  e.preventDefault();if(!student)return;const content=$('task-input').value.trim();if(!content)return;
  tasks.unshift({id:++counter,text:content,done:false});$('task-input').value='';renderTasks();
});
$('open-settings').addEventListener('click',()=>{showPanel('account');$('settings-dialog').showModal();});
document.querySelectorAll('.settings-nav [data-settings-tab]').forEach(btn=>btn.addEventListener('click',()=>showPanel(btn.dataset.settingsTab)));
$('settings-close-desktop').addEventListener('click',()=>$('settings-dialog').close());
$('settings-close-mobile').addEventListener('click',()=>$('settings-dialog').close());
$('close-lesson').addEventListener('click',()=>$('lesson-dialog').close());
$('switch-account').addEventListener('click',leavePreview);
$('log-out').addEventListener('click',leavePreview);
$('settings-dialog').addEventListener('close',()=>{if(student)$('open-settings').focus();});
$('lesson-dialog').addEventListener('close',()=>{opened=null;});
setInterval(()=>{if(student&&!document.hidden){renderBanner();if(selectedDate===taipeiToday())renderCalendar();}},30000);
renderTranslations();


// Future Campus Mail entry point: an inert mail window with an official-site link.
// Deliberately no mail requests, cookies, inbox storage, or extra dependencies.
const mailWords={
  en:{mail:'Campus Mail',mailPreview:'MAIL PREVIEW',officialMail:'Open official NTU Mail ↗',
    previewStatus:'PREVIEW',mailEmpty:'Your mail will appear here after we connect the service.',
    mailDesc:'The Campus Week mail client will be integrated after the UI is finalized.',
    mailPreviewOnly:'No messages or credentials are loaded in this preview.',
    inbox:'Inbox',unread:'Unread',starred:'Starred',sent:'Sent',drafts:'Drafts',trash:'Trash',archived:'Archived',
    noMessages:'0 messages',compose:'＋ Compose',readerTitle:'Message',readerEmpty:'Select a message to read'},
  zh:{mail:'Campus Mail',mailPreview:'信箱預覽',officialMail:'開啟臺大官方信箱 ↗',
    previewStatus:'預覽',mailEmpty:'連線後，您的郵件將顯示在此。',
    mailDesc:'Campus Week 郵件介面將在整體介面確認後再整合。',
    mailPreviewOnly:'此預覽不會載入任何郵件或帳號資料。',
    inbox:'收件匣',unread:'未讀',starred:'已加星號',sent:'寄件備份',drafts:'草稿',trash:'垃圾桶',archived:'封存',
    noMessages:'0 封郵件',compose:'＋ 撰寫',readerTitle:'郵件',readerEmpty:'選擇一封郵件來閱讀'}
};
let mailFolder='inbox';
function renderMailLocale(){
  const words=mailWords[language];
  document.querySelectorAll('[data-mail-i18n]').forEach(el=>{el.textContent=words[el.dataset.mailI18n]||el.dataset.mailI18n;});
  document.querySelectorAll('[data-mail-folder]').forEach(button=>{
    button.textContent=words[button.dataset.mailFolder];
    button.setAttribute('aria-pressed',String(button.dataset.mailFolder===mailFolder));
  });
  $('mail-folder-heading').textContent=words[mailFolder];
}
document.querySelectorAll('[data-open-mail]').forEach(button=>button.addEventListener('click',()=>{
  if(!student)return;
  mailFolder='inbox';renderMailLocale();$('mail-dialog').showModal();
}));
document.querySelectorAll('[data-mail-folder]').forEach(button=>button.addEventListener('click',()=>{
  mailFolder=button.dataset.mailFolder;renderMailLocale();
}));
$('mail-close').addEventListener('click',()=>$('mail-dialog').close());
for(const id of ['language-en','language-zh','settings-language']){
  $(id).addEventListener(id==='settings-language'?'change':'click',renderMailLocale);
}
renderMailLocale();
