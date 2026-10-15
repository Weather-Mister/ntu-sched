// Campus Week theme-ready interface: fictional preview and opt-in live NTU data.
import { account, mapTimetable, mapCalendar, studentFromAccount, englishNameMissing } from './live-source.mjs';
import { AccountAnnouncements } from '/account-announcements.mjs';
import { applyCourseOverrides, scheduleAccent } from '/course-model.mjs';
import { formatPeriods } from '/ntu-periods.mjs';
import { AccountTasks } from '/account-tasks.mjs';
import { eventsOn, nextEventDates } from '/event-model.mjs';
import { createEventUI } from './custom-events.mjs';
import { createMailUI } from './mail.mjs';
import { createSettings } from './settings.mjs';
import { createCoolMobileOverflow } from './cool-mobile-overflow.mjs';
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
    loginEyebrow:'NTU · CAMPUS WEEK',loginTitle:'Sign in',loginIntro:'Use your NTU student number and Mail password.',checkingSession:'Checking your session…',tryPreview:'Try a sample timetable',previewLabel:'Sample student',engineeringProfile:'Engineering student',socialProfile:'Social sciences student',enterPreview:'Open sample timetable',loginSafety:'Sample data only. No NTU account is required.',disclaimer:'Independent student project · Not an official NTU service',headerEyebrow:'NTU · CAMPUS WEEK PREVIEW',mySchedule:'My Schedule',
    chooseDate:'Choose date',today:'Today',week:'Week',coursesLabel:'NTU + COURSES',upcomingDates:'Upcoming dates',refresh:'Refresh',sampleDeadlines:'Illustrative events and deadlines; not connected to COOL.',toDo:'TO DO',manualTasks:'Manual tasks',newTask:'New task',add:'Add',tasksOnly:'Preview tasks stay in memory and disappear on reload.',
    lessonDescription:'Description',lessonReset:'Restore original details',lessonCancel:'Cancel',lessonSave:'Save changes',lessonSaving:'Saving…',lessonSaved:'Changes saved.',lessonSaveFailed:'Could not save these details. Your edits are still here; please try again.',lessonChanged:'These details changed on another device. Reopen this lesson to load the latest details.',lessonNameEn:'Name (English)',lessonNameZh:'Name (Chinese)',lessonHelpEn:'Applies to every meeting of this class. The name changes only in English.',lessonHelpZh:'Applies to every meeting of this class. The name changes only in Chinese.',lessonPreview:'Preview edits last until you leave this preview.',
    classDetails:'CLASS DETAILS',time:'Time',location:'Location',courseCode:'Course code',status:'Status',repeatsWeekly:'Preview follows a repeating weekly schedule.',preferences:'PREFERENCES',settings:'Settings',account:'Account',appearance:'Appearance',language:'Language',timetable:'Timetable',widgets:'Widgets',privacy:'Privacy & security',about:'About',
    accountDesc:'Your Campus Week identity and sessions.',demoAccount:'Fictional account · design preview only',accountActions:'Account actions',switchHelp:"Switching accounts clears the current student's preview before returning to sign-in.",switchAccount:'Switch account',logOut:'Log out',appearanceDesc:'Preview theme setting; changes are not saved.',theme:'Theme',light:'Light',dark:'Dark',langDesc:'Select interface language. Course names reflect the sample data.',interfaceLanguage:'Interface language',
    timetableDesc:'Live account mode uses the existing NTU ePortfolio timetable connection.',previewStatus:'Preview data',syncNotConnected:'Not connected to your NTU account in this preview.',reconnectLater:'Reconnect (later)',coolDesc:'Live COOL calendar deadlines use your existing NTU connection. Announcements refresh every two minutes while this page is focused.',widgetsDesc:'Optional extras can be added without affecting the core schedule.',hanziLater:'Future optional widget. Disabled by default. Username input and loading will be implemented later.',comingLater:'Coming later',
    securityDesc:'Production account access remains exclusively with our existing Cloudflare backend.',noCredentials:'No credentials in preview',securityPreview:'Sample mode is entirely fictional. Live mode uses the existing secure Campus Week API; this interface never stores passwords.',signOutAllLater:'Sign out all devices (later)',aboutDesc:'Campus Week UI skeleton v1. Independent student project; not affiliated with National Taiwan University.',designPreview:'Design preview',aboutDetails:'Theme-ready Classic interface sharing the production account, timetable and COOL APIs.',
    next:'UP NEXT',live:'HAPPENING NOW',startsIn:'Starts in',endsIn:'Ends in',classes:'classes',singleClass:'class',noClasses:'No classes today',noClassesDesc:'Your sample timetable is clear on this date.',tasks:'tasks',singleTask:'task',addPlaceholder:'Add a task…',noTasks:'No tasks yet. Add one above.',completed:'Finished',upcoming:'Upcoming',scheduled:'Scheduled',previewRefresh:'This is sample data; no live refresh was made.',overlap:'Time clash',
    dayView:'Day',weekView:'Week',weeklyTimetable:'Weekly timetable',calendarLabel:'CLASS TIMETABLE',weekViewScroll:'Weekly timetable; scroll vertically or sideways to explore classes',
    liveEntryHeading:'Or use your real NTU account',liveEntryDesc:'Connect through the existing Campus Week account and backend.',restoreSession:'Use existing session',signInNtu:'Sign in',realAccount:'REAL NTU ACCOUNT',realLoginExplanation:'Uses the existing secure Campus Week login and the same timetable/COOL backend as the original site.',studentNumber:'NTU student number',ntuPassword:'NTU Mail password',accountSecurity:'Only sign in on the official Campus Week address.',timetableConnection:'Timetable connection',coolConnection:'COOL connection',syncTimetable:'Sync timetable',syncCool:'Sync COOL',realAssignmentsNote:'Live COOL calendar · ✓ marks done only here; submit assignments in COOL',realAnnouncementsNote:'Live COOL announcements · Last 90 days · Refreshes every 2 minutes while focused',noCalendar:'No connected COOL calendar. Select Refresh or connect from Settings.',liveNoAssignments:'No upcoming calendar deadlines.',liveNoTimetable:'No saved classes yet. Use Settings → Timetable → Sync timetable.',
    doneLocally:'Marked done here only; this does not submit to COOL.',markDone:'Mark done',markUndone:'Mark not done',englishNamesMissing:'NTU did not provide an English title for some classes; showing their original names.',
    assignments:'Assignments',announcements:'Announcements',coolShowMore:count=>`Show ${count} more`,coolShowLess:'Show less',sampleAnnouncements:'Fictional announcements for layout preview; not connected to COOL.',campusAccessEyebrow:'CAMPUS',campusShortcuts:'Campus shortcuts',freeDay:'Free',
    scheduleItem:'event',scheduleItems:'events',customEvent:'PERSONAL',
    tasksLoading:'Loading your saved tasks…',tasksSaving:'Saving…',tasksLoadFailed:'Could not load tasks. Refresh tasks to try again.',tasksSaveFailed:'Could not confirm the save. Your last saved tasks are shown; please try again.',tasksConflict:'This task changed on another device. Latest tasks loaded; please try again.',tasksFull:'You have 500 tasks. Remove an old task before adding another.',tasksRetry:'Refresh tasks',tasksUndo:'Undo remove',removeTask:'Remove task',
    days:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],shortDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  },
  zh:{
    loginEyebrow:'臺大 · CAMPUS WEEK',loginTitle:'登入',loginIntro:'使用臺大學號和電子郵件密碼登入。',checkingSession:'正在檢查登入狀態…',tryPreview:'試用範例課表',previewLabel:'範例學生',engineeringProfile:'工程學院學生',socialProfile:'社會科學院學生',enterPreview:'開啟範例課表',loginSafety:'僅使用範例資料，不需要臺大帳號。',disclaimer:'獨立學生專案 · 非臺灣大學官方服務',headerEyebrow:'臺大 · CAMPUS WEEK 預覽',mySchedule:'我的課表',
    chooseDate:'選擇日期',today:'今天',week:'本週',coursesLabel:'臺大 + 課程',upcomingDates:'近期日期',refresh:'重新整理',sampleDeadlines:'以上為虛構事件與期限，尚未連結 NTU COOL。',toDo:'待辦事項',manualTasks:'手動任務',newTask:'新增任務',add:'新增',tasksOnly:'預覽任務僅暫存於記憶體，重新整理後會消失。',
    lessonDescription:'說明',lessonReset:'還原原始資料',lessonCancel:'取消',lessonSave:'儲存變更',lessonSaving:'儲存中…',lessonSaved:'已儲存變更。',lessonSaveFailed:'無法儲存，已保留你的編輯內容，請再試一次。',lessonChanged:'其他裝置已變更此課程，請重新開啟以載入最新資料。',lessonNameEn:'課程名稱（英文）',lessonNameZh:'課程名稱（中文）',lessonHelpEn:'套用至此課程的所有課堂，名稱僅變更英文版本。',lessonHelpZh:'套用至此課程的所有課堂，名稱僅變更中文版本。',lessonPreview:'預覽編輯僅保留至離開此預覽。',classDetails:'課程詳情',time:'時間',location:'地點',courseCode:'課號',status:'狀態',repeatsWeekly:'此預覽使用每週重複課表。',preferences:'偏好設定',settings:'設定',account:'帳號',appearance:'外觀',language:'語言',timetable:'課表',widgets:'小工具',privacy:'隱私與安全',about:'關於',
    accountDesc:'Campus Week 身分與登入狀態。',demoAccount:'虛構帳號 · 僅供設計預覽',accountActions:'帳號操作',switchHelp:'切換帳號前會清除畫面上的上一位虛構學生資料。',switchAccount:'切換帳號',logOut:'登出',appearanceDesc:'預覽主題設定；不會儲存變更。',theme:'主題',light:'淺色',dark:'深色',langDesc:'選擇介面語言。課程名稱來自範例資料。',interfaceLanguage:'介面語言',
    timetableDesc:'真實帳號模式沿用現有臺大 ePortfolio 課表連線。',previewStatus:'預覽資料',syncNotConnected:'本預覽未連線至臺大帳號。',reconnectLater:'稍後重新連線',coolDesc:'真實帳號模式沿用現有 COOL 行事曆；公告尚未連接。',widgetsDesc:'選用小工具不會影響主要課表。',hanziLater:'未來可選擇啟用，預設關閉；使用者名稱輸入及資料載入會稍後實作。',comingLater:'稍後推出',
    securityDesc:'正式帳號存取仍由現有 Cloudflare 後端處理。',noCredentials:'預覽不需帳密',securityPreview:'範例模式使用虛構資料。真實模式沿用既有安全 API，介面不儲存密碼。',signOutAllLater:'登出所有裝置（稍後）',aboutDesc:'Campus Week 介面骨架 v1。獨立學生專案，與國立臺灣大學無隸屬關係。',designPreview:'設計預覽',aboutDetails:'可切換視覺主題的 Classic 介面，沿用既有帳號、課表與 COOL API。',
    next:'下一堂課',live:'正在上課',startsIn:'距離開始',endsIn:'距離結束',classes:'堂課',singleClass:'堂課',noClasses:'今天沒有課',noClassesDesc:'這天的範例課表沒有課程。',tasks:'項任務',singleTask:'項任務',addPlaceholder:'新增任務…',noTasks:'目前沒有任務。',completed:'已結束',upcoming:'即將開始',scheduled:'已排定',previewRefresh:'這是範例資料，未執行線上同步。',overlap:'時間衝突',
    dayView:'單日',weekView:'整週',weeklyTimetable:'每週課表',calendarLabel:'課程時間表',weekViewScroll:'每週課表；可上下及左右捲動查看課程',
    liveEntryHeading:'或使用真正的臺大帳號',liveEntryDesc:'使用現有 Campus Week 帳號與後端連線。',restoreSession:'使用現有登入狀態',signInNtu:'登入',realAccount:'真實臺大帳號',realLoginExplanation:'沿用既有安全的 Campus Week 登入與課表、COOL 後端。',studentNumber:'臺大學號',ntuPassword:'臺大郵件密碼',accountSecurity:'請只在正確的 Campus Week 網址登入。',timetableConnection:'課表連線',coolConnection:'COOL 連線',syncTimetable:'同步課表',syncCool:'同步 COOL',realAssignmentsNote:'COOL 行事曆；✓ 僅在此標記完成，作業仍需至 COOL 提交',realAnnouncementsNote:'COOL 公告 · 最近 90 天 · 頁面使用中每兩分鐘更新',noCalendar:'尚無 COOL 行事曆，請按重新整理或至設定連線。',liveNoAssignments:'目前沒有近期行事曆截止日期。',liveNoTimetable:'尚無已儲存課表，請到設定 → 課表同步。',
    doneLocally:'僅在本站標記完成，不會向 COOL 提交作業。',markDone:'標記完成',markUndone:'取消完成',englishNamesMissing:'NTU 未提供部分課程的英文名稱，將保留原始課名。',
    assignments:'作業',announcements:'公告',coolShowMore:count=>`顯示另外 ${count} 筆`,coolShowLess:'收起',sampleAnnouncements:'以上為虛構公告，尚未連接 NTU COOL。',campusAccessEyebrow:'校園',campusShortcuts:'校園捷徑',freeDay:'無課',
    scheduleItem:'項行程',scheduleItems:'項行程',customEvent:'個人行程',
    tasksLoading:'正在載入已儲存的任務…',tasksSaving:'儲存中…',tasksLoadFailed:'無法載入任務，請重新整理任務再試一次。',tasksSaveFailed:'無法確認是否已儲存，畫面保留上次儲存的任務，請再試一次。',tasksConflict:'此任務已在其他裝置變更，已載入最新任務，請再試一次。',tasksFull:'已達 500 項任務，請先移除舊任務。',tasksRetry:'重新整理任務',tasksUndo:'復原移除',removeTask:'移除任務',
    days:['星期一','星期二','星期三','星期四','星期五','星期六','星期日'],shortDays:['週一','週二','週三','週四','週五','週六','週日']
  }
};
let language='en',student=null,tasks=[],selectedDate=taipeiToday(),activePanel='account',opened=null,counter=0,coolView='assignments',timetableView='day';
let liveMode=false,liveAccount=null,liveCalendar=null,liveTimetable=null,liveEpoch=0,livePending=false,liveTimetableInfo='',liveCoolInfo='';
let liveTimetableOk=false,liveCalendarOk=false,liveCourseOverrides={},previewCourseOverrides={},lessonDraft=null,lessonSaving=false,liveDetailsRevision=0;
let coolDone=new Set(),coolDoneStorageKey='',previewCoolDone=new Set();
const t = key => dict[language][key]===undefined?key:dict[language][key];
const coolOverflow=createCoolMobileOverflow({
  list:$('cool-list'),
  button:$('cool-mobile-more'),
  showMore:count=>dict[language].coolShowMore(count),
  showLess:()=>t('coolShowLess')
});
const taskStore = new AccountTasks(account, {
  onChange(state){if(liveMode){tasks=state.items;renderTasks();}},
  onSessionExpired:()=>sessionExpired()
});
const announcementStore=new AccountAnnouncements(account,()=>{if(student&&liveMode)renderDeadlines();},()=>sessionExpired());
const eventUI=createEventUI({account,isLive:()=>liveMode,getLanguage:()=>language,getDate:()=>selectedDate,onChange(){if(student){renderBanner();renderCalendar();}},onSessionExpired:()=>sessionExpired()});
function scheduleOn(key){return[...student.courses.filter(c=>c[0]===weekday(key)),...eventsOn(eventUI.events(),key)].sort((a,b)=>a[1].localeCompare(b[1]));}
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
  const keys=new Set([...Array.from({length:8},(_,d)=>offset(today,d)),...nextEventDates(eventUI.events(),today)]);
  for(const key of keys){
    for(const c of scheduleOn(key)){const start=lessonTime(key,c[1]),end=lessonTime(key,c[2]);if(end>now)events.push({c,key,start,end,live:start<=now});}
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
// Time-grid layout uses real lesson start/end minutes; no additional data source.
// Blocks in overlapping time ranges are assigned independent lanes.
function minutes(hhmm){const [hour,minute]=hhmm.split(':').map(Number);return hour*60+minute;}
function layoutOverlaps(entries){
  const clusters=[];let current=[],furthest=-1;
  for(const event of entries){
    if(current.length&&event.start>=furthest){clusters.push(current);current=[];furthest=-1;}
    current.push(event);furthest=Math.max(furthest,event.end);
  }
  if(current.length)clusters.push(current);
  for(const cluster of clusters){
    const lanes=[];
    for(const event of cluster){
      let lane=lanes.findIndex(end=>end<=event.start);
      if(lane===-1){lane=lanes.length;lanes.push(event.end);}else lanes[lane]=event.end;
      event.lane=lane;
    }
    for(const event of cluster)event.lanes=lanes.length;
  }
  return entries;
}
function renderWeekTimetable(){
  if(!student||timetableView!=='week')return;
  const container=$('week-timetable-grid');container.replaceChildren();
  const base=monday(selectedDate),courses=Array.from({length:7},(_,d)=>scheduleOn(offset(base,d))).flat();
  const dayCount=courses.some(c=>c[0]>=5)||weekday(selectedDate)>=5?7:5;
  const dayNames=t('shortDays');
  const end=offset(base,dayCount-1);
  $('week-timetable-range').textContent=pretty(base,true)+' – '+pretty(end,true);
  $('week-timetable-scroll').setAttribute('aria-label',t('weekViewScroll'));
  // Round the occupied time range to hours; retain a little context around lessons.
  const earliest=Math.min(...courses.map(c=>minutes(c[1])),9*60);
  const latest=Math.max(...courses.map(c=>minutes(c[2])),17*60);
  const firstHour=Math.max(0,Math.floor((earliest-20)/60));
  const finalHour=Math.min(24,Math.ceil((latest+20)/60));
  const scale=.76; // compact pixels per minute; class durations remain proportional
  const origin=firstHour*60,totalHeight=(finalHour-firstHour)*60*scale;
  container.style.gridTemplateColumns='42px repeat('+dayCount+', minmax(78px, 1fr))';
  container.style.minWidth=(42+dayCount*78)+'px';
  container.style.setProperty('--hour-height',(60*scale)+'px');
  const corner=node('div','timetable-corner');
  corner.style.gridColumn='1';corner.style.gridRow='1';container.append(corner);
  const timeRail=node('div','timetable-time-rail');
  timeRail.style.gridColumn='1';timeRail.style.gridRow='2';timeRail.style.height=totalHeight+'px';
  for(let hour=firstHour;hour<=finalHour;hour++){
    const label=node('span','timetable-hour',String(hour).padStart(2,'0')+':00');
    label.style.top=((hour-firstHour)*60*scale)+'px';timeRail.append(label);
  }
  container.append(timeRail);
  for(let day=0;day<dayCount;day++){
    const key=offset(base,day),dayCourses=courses.filter(c=>c[0]===day);
    const head=node('div','timetable-day-head');
    head.style.gridColumn=String(day+2);head.style.gridRow='1';
    if(key===taipeiToday())head.classList.add('is-today');
    if(key===selectedDate)head.classList.add('is-selected');
    head.append(node('strong','',dayNames[day]),node('span','',String(dateFor(key).getUTCDate())));
    container.append(head);
    const track=node('div','timetable-day-track');
    track.style.gridColumn=String(day+2);track.style.gridRow='2';
    track.style.height=totalHeight+'px';
    const entries=layoutOverlaps(dayCourses.map(c=>({c,start:minutes(c[1]),end:minutes(c[2])}))
      .sort((a,b)=>a.start-b.start||a.end-b.end));
    for(const {c,start,end,lane,lanes} of entries){
      const block=node('button','timetable-lesson');
      block.type='button';block.dataset.color=String(scheduleAccent(c));block.classList.toggle('custom-event',!!c[7]);
      if(end-start<70)block.classList.add('is-short');
      const pct=100/lanes;
      block.style.top=((start-origin)*scale+2)+'px';
      block.style.height=Math.max(23,(end-start)*scale-4)+'px';
      block.style.left='calc('+(lane*pct)+'% + 3px)';
      block.style.width='calc('+pct+'% - 6px)';
      block.setAttribute('aria-label',longDate(key)+' · '+c[1]+'–'+c[2]+' · '+c[language==='zh'?4:3]+' · '+c[5]);
      block.title=longDate(key)+' · '+c[1]+'–'+c[2]+' · '+c[language==='zh'?4:3]+' · '+c[5];
      block.append(node('small','timetable-lesson-time',c[1]+'–'+c[2]),
        node('strong','timetable-lesson-title',c[language==='zh'?4:3]),
        node('span','timetable-lesson-room',c[5]));
      block.addEventListener('click',()=>showLesson(c,key));
      track.append(block);
    }
    container.append(track);
  }
}
function setTimetableView(view){
  if(view!=='day'&&view!=='week')return;
  timetableView=view;
  $('view-day').setAttribute('aria-pressed',String(view==='day'));
  $('view-week').setAttribute('aria-pressed',String(view==='week'));
  $('schedule-list').hidden=view==='week';
  $('week-timetable').hidden=view!=='week';
  if(student)renderCalendar();
}

// Expand only cards whose actual wrapped content needs more vertical room.
// Other lessons retain the adaptive 70–116px desktop sizing.
function fitLessonCards(){
  if(!student||timetableView!=='day'||window.innerWidth<=790)return;
  const list=$('schedule-list');
  if(list.hidden||!list.isConnected)return;
  const cards=[...list.querySelectorAll('.lesson')];
  for(const button of cards){
    button.style.removeProperty('min-height');
    button.style.removeProperty('max-height');
    button.style.removeProperty('flex');
  }
  for(const button of cards){
    const card=button.querySelector('.lesson-card');
    const parts=[...card.children].filter(n=>!n.classList.contains('lesson-arrow'));
    const style=getComputedStyle(card);
    const required=parts.reduce((sum,part)=>sum+part.scrollHeight,0)
      +Math.max(0,parts.length-1)*(parseFloat(style.rowGap)||parseFloat(style.gap)||0)
      +parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)
      +parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth)+2;
    if(required>button.getBoundingClientRect().height+1){
      button.style.minHeight=Math.max(70,Math.ceil(required))+'px';
      button.style.maxHeight='none';
      button.style.flex='0 0 auto';
    }
  }
}
if(typeof ResizeObserver!=='undefined'){
  new ResizeObserver(()=>{if(student&&timetableView==='day')fitLessonCards();})
    .observe(document.querySelector('.schedule-column'));
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
    const count=scheduleOn(key).length;
    const countLabel=eventsOn(eventUI.events(),key).length?(count===1?'scheduleItem':'scheduleItems'):(count===1?'singleClass':'classes');
    btn.append(node('span','day-name',t('shortDays')[d]),node('span','day-date',String(dateFor(key).getUTCDate())),
      node('small','day-subtitle',count?count+' '+t(countLabel):t('freeDay')));
    btn.addEventListener('click',()=>{selectedDate=key;renderCalendar();});strip.append(btn);
  }
  const items=scheduleOn(selectedDate);
  const numberOfClasses=timetableView==='week'?Array.from({length:7},(_,d)=>scheduleOn(offset(base,d)).length).reduce((a,b)=>a+b,0):items.length;
  $('selected-day').textContent=timetableView==='week'?t('weeklyTimetable'):t('days')[weekday(selectedDate)];
  $('selected-date').textContent=timetableView==='week'?t('calendarLabel'):pretty(selectedDate);
  $('class-count').textContent=numberOfClasses+' '+t(eventUI.events().length?(numberOfClasses===1?'scheduleItem':'scheduleItems'):(numberOfClasses===1?'singleClass':'classes'));
  const list=$('schedule-list');list.replaceChildren();
  if(!items.length){const empty=node('div','empty-card');empty.append(node('strong','',liveMode&&!student.courses.length?t('liveNoTimetable'):t('noClasses')),node('span','',liveMode&&!student.courses.length?'':t('noClassesDesc')));list.append(empty);}
  for(const c of items){
    const btn=node('button','lesson');btn.type='button';
    btn.classList.toggle('custom-event',!!c[7]);
    if(selectedDate===today){btn.classList.toggle('live',lessonState(c,selectedDate)===t('live'));btn.classList.toggle('completed',lessonState(c,selectedDate)===t('completed'));}
    const clock=node('span','lesson-time');clock.append(node('strong','',c[1]),node('span','',c[2]));
    const period=lessonPeriod(c);if(period)clock.append(node('small','lesson-period',period));
    const card=node('span','lesson-card');card.dataset.color=String(scheduleAccent(c));
    card.append(node('span','lesson-name',c[language==='zh'?4:3]),node('span','lesson-room',c[5]));
    if(c[7])card.append(node('small','event-kind',t('customEvent')));
    if(items.some(other=>other!==c&&other[1]<c[2]&&c[1]<other[2]))card.append(node('span','state-pill',t('overlap')));
    btn.append(clock,card);btn.addEventListener('click',()=>showLesson(c,selectedDate));list.append(btn);
  }
  renderWeekTimetable();
  requestAnimationFrame(fitLessonCards);
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
// Use the same official NTU period boundaries and format as the production timetable.
function lessonPeriod(c){return c[7]?'':formatPeriods(minutes(c[1]),minutes(c[2]),language==='zh'?'zh-TW':'en',true);}
function addCoolCheck(card,key,doneStore,save=()=>{}){
  const done=doneStore.has(key);
  card.classList.add('cool-checkable');
  card.classList.toggle('done',done);
  const control=node('button','cool-done-button'+(done?' is-done':''),'✓');
  control.type='button';control.setAttribute('aria-pressed',String(done));
  control.setAttribute('aria-label',t(done?'markUndone':'markDone'));
  control.title=t('doneLocally');
  control.addEventListener('click',()=>{
    if(doneStore.has(key))doneStore.delete(key);else doneStore.add(key);
    save();renderDeadlines();
  });
  card.append(control);
}
async function coolDoneKey(studentNumber){
  const data=new TextEncoder().encode('campus-week-v1\\0'+studentNumber);
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
  return 'campus-week-cool-done-v1-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function restoreCoolChecks(current,epoch){
  try{
    const key=await coolDoneKey(current.studentNumber);
    if(!liveMode||epoch!==liveEpoch)return;
    coolDoneStorageKey=key;
    const raw=JSON.parse(localStorage.getItem(key)||'[]');
    coolDone=new Set(Array.isArray(raw)?raw.filter(x=>typeof x==='string'&&x.length<=512).slice(0,500):[]);
    renderDeadlines();
  }catch{if(epoch===liveEpoch){coolDoneStorageKey='';coolDone=new Set();}}
}
function saveCoolChecks(){
  if(!liveMode||!coolDoneStorageKey)return;
  try{localStorage.setItem(coolDoneStorageKey,JSON.stringify([...coolDone].slice(0,500)))}catch{}
}

function renderDeadlines(){
  const scrollTop=$('cool-list').scrollTop;
  renderDeadlinesContent();
  coolOverflow.update(coolView,scrollTop);
}
function renderDeadlinesContent(){
  updateSyncDots();
  const list=$('cool-list'),expanded=new Set([...list.querySelectorAll('details[open]')].map(el=>el.dataset.announcement));list.replaceChildren();if(!student)return;
  if(liveMode){renderLiveDeadlines(expanded);return;}
  document.querySelectorAll('[data-cool-view]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.coolView===coolView)));
  $('cool-list').setAttribute('aria-labelledby',coolView==='assignments'?'cool-assignments-tab':'cool-announcements-tab');
  $('cool-heading').textContent=coolView==='assignments'?t('upcomingDates'):t('announcements');
  $('cool-preview-note').textContent=coolView==='assignments'?t('sampleDeadlines'):t('sampleAnnouncements');
  if(coolView==='announcements'){
    const profile=student.id===profiles.engineering.id?'engineering':'social';
    for(const entry of announcements[profile]){
      const card=node('article','cool-item announcement-card card'),date=node('span','cool-date'),copy=node('span','cool-copy');
      const key=offset(taipeiToday(),-entry[4]);date.append(node('strong','',String(dateFor(key).getUTCDate())),node('small','',pretty(key,true).replace(/[0-9]/g,'').trim()));
      copy.append(node('strong','',entry[language==='zh'?1:0]),node('small','',entry[language==='zh'?3:2]));
      card.append(date,copy);list.append(card);
    }
    return;
  }
  for(const [index,item] of student.deadlines.entries()){
    const key=offset(taipeiToday(),item[0]),card=node('article','cool-item card'),
      main=node('div','cool-main'),date=node('span','cool-date'),copy=node('span','cool-copy');
    date.append(node('strong','',String(dateFor(key).getUTCDate())),node('small','',pretty(key,true).replace(/[0-9]/g,'').trim()));
    copy.append(node('strong','',item[language==='zh'?2:1]),node('small','',item[language==='zh'?4:3]));
    main.append(date,copy,node('span','cool-due',language==='zh'?item[0]+' 天後':'In '+item[0]+' days'));
    card.append(main);
    addCoolCheck(card,'preview-'+index,previewCoolDone);
    list.append(card);
  }
}
function renderLiveDeadlines(expanded=new Set()){
  const list=$('cool-list');
  document.querySelectorAll('[data-cool-view]').forEach(button=>
    button.setAttribute('aria-selected',String(button.dataset.coolView===coolView)));
  list.setAttribute('aria-labelledby',coolView==='assignments'?'cool-assignments-tab':'cool-announcements-tab');
  $('cool-heading').textContent=coolView==='assignments'?t('upcomingDates'):t('announcements');
  $('cool-preview-note').textContent=coolView==='assignments'?t('realAssignmentsNote'):t('realAnnouncementsNote');
  if(coolView==='announcements'){
    const state=announcementStore;
    $('cool-refresh').disabled=state.busy||state.loading;
    $('cool-preview-note').textContent=state.error?liveNotice(state.error):state.busy||state.loading?(language==='zh'?'正在更新公告…':'Refreshing announcements…'):t('realAnnouncementsNote')+(state.items?.syncedAt?' · '+new Intl.DateTimeFormat(language==='zh'?'zh-TW':'en-US',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'}).format(new Date(state.items.syncedAt)):'');
    if(!state.items?.items?.length){list.append(node('div','empty-card',state.items?(language==='zh'?'最近 90 天沒有課程公告。':'No course announcements in the last 90 days.'):state.error?liveNotice(state.error):(language==='zh'?'正在載入公告…':'Loading announcements…')));return;}
    const fmt=new Intl.DateTimeFormat(language==='zh'?'zh-TW':'en-US',{timeZone:'Asia/Taipei',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    for(const item of state.items.items){
      const card=node('article','cool-item announcement-card card'),copy=node('div','cool-copy');
      const link=node('a','announcement-title',item.title);
      try{const url=new URL(item.url);if(url.origin!=='https://cool.ntu.edu.tw'||url.protocol!=='https:'||url.username||url.password)continue;link.href=url.href;}catch{continue;}
      link.target='_blank';link.rel='noopener noreferrer';
      copy.append(node('small','',item.course+' · '+fmt.format(new Date(item.postedAt))),link);
      if(item.author)copy.append(node('small','',item.author));
      if(item.body){const details=node('details','announcement-body'),body=node('p','',item.body);details.dataset.announcement=item.id;details.open=expanded.has(item.id);details.append(node('summary','',language==='zh'?'閱讀公告':'Read announcement'),body);copy.append(details);}
      if(item.bodyTruncated)copy.append(node('small','',language==='zh'?'完整內容請至 COOL 查看。':'Open in COOL for the complete announcement.'));
      card.append(copy);list.append(card);
    }
    return;
  }
  $('cool-refresh').disabled=false;
  if(!liveCalendar){
    list.append(node('div','empty-card',t('noCalendar')));return;
  }
  const items=mapCalendar(liveCalendar);
  if(!items.length){list.append(node('div','empty-card',t('liveNoAssignments')));return;}
  const dateTime=new Intl.DateTimeFormat(language==='zh'?'zh-TW':'en-US',{
    timeZone:'Asia/Taipei',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  for(const item of items.slice(0,40)){
    const card=node('article','cool-item card'),
      main=node(item.url?'a':'div','cool-main'),
      date=node('span','cool-date'),copy=node('span','cool-copy');
    const when=new Date(item.dueAt);
    date.append(node('strong','',String(when.toLocaleDateString('en-US',{timeZone:'Asia/Taipei',day:'numeric'}))),
      node('small','',when.toLocaleDateString(language==='zh'?'zh-TW':'en-US',{timeZone:'Asia/Taipei',month:'short'})));
    copy.append(node('strong','',item.title),node('small','',item.course));
    const due=node('span','cool-due',dateTime.format(when));
    main.append(date,copy,due);
    if(item.url){
      main.href=item.url;main.target='_blank';main.rel='noopener noreferrer';
      main.setAttribute('aria-label',(language==='zh'?'在 COOL 開啟：':'Open in COOL: ')+item.title);
    }
    card.append(main);
    if(item.kind==='assignment')addCoolCheck(card,item.id,coolDone,saveCoolChecks);
    else card.classList.add('cool-nonassignment');
    list.append(card);
  }
}

function renderTasks(){
  updateSyncDots();
  const list=$('todo-list');list.replaceChildren();$('task-count').textContent=tasks.length+' '+(tasks.length===1?t('singleTask'):t('tasks'));
  const state=taskStore.state,busy=liveMode&&(!state.ready||state.saving);
  $('task-input').disabled=busy;$('task-form').querySelector('button[type="submit"]').disabled=busy;
  const errorKey=state.error?.code==='tasks_full'?'tasksFull':['task_changed','task_not_found'].includes(state.error?.code)?'tasksConflict':state.error?.phase==='load'?'tasksLoadFailed':'tasksSaveFailed';
  const taskStatus=!liveMode?t('tasksOnly'):state.error?t(errorKey):state.saving?t('tasksSaving'):state.loading?t('tasksLoading'):'';
  $('tasks-status').textContent=taskStatus;$('tasks-status').hidden=!taskStatus;
  $('tasks-retry').textContent=t('tasksRetry');$('tasks-retry').hidden=!liveMode||!state.error;$('tasks-retry').disabled=state.loading||state.saving;
  $('tasks-undo').textContent=t('tasksUndo');$('tasks-undo').hidden=!liveMode||!state.undo;$('tasks-undo').disabled=busy;
  if(!tasks.length){list.append(node('div','empty-card',liveMode&&!state.ready?t(state.error?'tasksLoadFailed':'tasksLoading'):t('noTasks')));return;}
  for(const task of tasks){
    const row=node('div','todo-row card'),check=node('button','todo-check',task.done?'✓':''),label=node('span','todo-label',task.text),remove=node('button','todo-remove','×');
    row.classList.toggle('done',task.done);check.type='button';remove.type='button';
    check.setAttribute('aria-label',t(task.done?'markUndone':'markDone'));check.setAttribute('aria-pressed',String(task.done));remove.setAttribute('aria-label',t('removeTask'));
    check.disabled=remove.disabled=busy;
    check.addEventListener('click',()=>{if(liveMode){void taskStore.setDone(task,!task.done);return;}task.done=!task.done;renderTasks();});
    remove.addEventListener('click',()=>{if(liveMode){void taskStore.remove(task);return;}tasks=tasks.filter(x=>x.id!==task.id);renderTasks();});
    row.append(check,label,remove);list.append(row);
  }
}
function renderTranslations(){
  eventUI.locale();
  document.documentElement.lang=language==='zh'?'zh-Hant':'en';
  document.querySelectorAll('[data-i18n]').forEach(el=>{const translated=t(el.dataset.i18n);if(typeof translated==='string')el.textContent=translated;});
  $('language-en').setAttribute('aria-pressed',String(language==='en'));$('language-zh').setAttribute('aria-pressed',String(language==='zh'));$('login-language-en').setAttribute('aria-pressed',String(language==='en'));$('login-language-zh').setAttribute('aria-pressed',String(language==='zh'));
  $('settings-language').value=language;$('task-input').placeholder=t('addPlaceholder');
  $('cool-refresh').title=t('refresh');$('cool-refresh').setAttribute('aria-label',t('refresh'));
  // Keep the chosen NTU panel tab when the interface language changes.
  document.querySelectorAll('[data-cool-view]').forEach(button=>button.textContent=t(button.dataset.i18n));
}
function showPanel(which){
  activePanel=which;
  settingsUI.update({student,liveMode,language,timetable:liveTimetable});
}

function renderAll(){
  renderTranslations();if(!student)return;renderBanner();renderCalendar();renderDeadlines();renderTasks();updateLiveStatus();showPanel(activePanel);
  if(opened&&$('lesson-dialog').open)populateLesson(opened.c,opened.key);
}
function populateLesson(c,key){
  const current=student?.courses.find(row=>row[8]===c[8]&&row[0]===c[0]&&row[1]===c[1]&&row[2]===c[2])||c;
  $('lesson-dialog-name').textContent=current[language==='zh'?4:3];
  $('lesson-dialog-time').textContent=longDate(key)+' · '+c[1]+'–'+c[2];
  $('lesson-dialog-status').textContent=lessonState(c,key);
  $('lesson-name-label').textContent=t(lessonDraft?.language==='zh'?'lessonNameZh':'lessonNameEn');
  $('lesson-edit-help').textContent=t(!liveMode?'lessonPreview':lessonDraft?.language==='zh'?'lessonHelpZh':'lessonHelpEn');
}
function lessonControls(){
  for(const control of $('lesson-edit-form').querySelectorAll('input,textarea,button'))control.disabled=lessonSaving;
  $('close-lesson').disabled=lessonSaving;
  $('lesson-save').textContent=t(lessonSaving?'lessonSaving':'lessonSave');
}
function showLesson(c,key){
  if(c[7]){eventUI.open(c[7],key);return;}
  opened={c,key};
  const version=(liveMode?liveCourseOverrides:previewCourseOverrides)[c[8]]?.version||0;
  lessonDraft={id:c[8],language,version,initial:{name:c[language==='zh'?4:3],room:c[5],description:c[9]||''}};
  $('lesson-name-input').value=lessonDraft.initial.name;$('lesson-room-input').value=lessonDraft.initial.room;
  $('lesson-description-input').value=lessonDraft.initial.description;$('lesson-edit-message').hidden=true;
  lessonSaving=false;lessonControls();populateLesson(c,key);$('lesson-dialog').showModal();
}
async function saveLessonDetails(reset=false){
  if(!opened||!lessonDraft||lessonSaving||!$('lesson-edit-form').reportValidity())return;
  const draft=lessonDraft,epoch=liveEpoch,body={version:draft.version,...(reset?{reset:true}:{language:draft.language})};
  if(!reset)for(const [key,id]of [['name','lesson-name-input'],['room','lesson-room-input'],['description','lesson-description-input']]){
    const value=$(id).value.trim();if(value!==draft.initial[key])body[key]=key==='name'&&!value?null:value;
  }
  if(!reset&&Object.keys(body).length===2){$('lesson-dialog').close();return;}
  lessonSaving=true;liveDetailsRevision++;lessonControls();$('lesson-edit-message').hidden=true;
  try{
    if(liveMode){
      const result=await account.changeCourseDetails(draft.id,body);
      if(epoch!==liveEpoch||lessonDraft!==draft)return;
      if(result.studentNumber!==liveAccount?.studentNumber){sessionExpired();return;}
      liveDetailsRevision++;liveTimetable=result.timetable;liveCourseOverrides=result.courseOverrides||{};
      renderLiveAccount();
    }else{
      const previous=previewCourseOverrides[draft.id]||{},next=reset?{}:{...previous};
      if(!reset)for(const key of ['name','room','description'])if(Object.hasOwn(body,key))next[key==='name'?(draft.language==='en'?'nameEn':'nameZh'):key]=body[key];
      next.version=draft.version+1;previewCourseOverrides={...previewCourseOverrides,[draft.id]:next};
      const profile=profiles[$('preview-profile').value];student={...profile,courses:applyCourseOverrides(previewCourseRows(profile),previewCourseOverrides)};
      renderAll();
    }
    if(epoch===liveEpoch&&lessonDraft===draft)$('lesson-dialog').close();
  }catch(error){
    if(epoch!==liveEpoch||lessonDraft!==draft)return;
    if(error.status===401){sessionExpired();return;}
    $('lesson-edit-message').textContent=error.code==='course_changed'?t('lessonChanged'):t('lessonSaveFailed');$('lesson-edit-message').hidden=false;
    if(error.code==='course_changed')void readLiveSnapshots();
  }finally{if(epoch===liveEpoch&&lessonDraft===draft){lessonSaving=false;lessonControls();}}
}
function previewCourseRows(profile){return profile.courses.map(c=>{const row=[...c];row[8]='preview:'+(c[6]||c[3]);return row;});}
function leavePreview(){
  liveEpoch++;liveMode=false;livePending=false;liveAccount=null;liveCalendar=null;liveTimetable=null;liveCourseOverrides={};previewCourseOverrides={};liveTimetableInfo='';liveCoolInfo='';coolDone.clear();coolDoneStorageKey='';previewCoolDone.clear();
  if($('lesson-dialog').open)$('lesson-dialog').close();
  if($('settings-dialog').open)$('settings-dialog').close();
  taskStore.bind(null);mailUI.bind(null);announcementStore.bind(null);settingsUI.reset();$('task-input').value='';
  eventUI.reset();
  student=null;tasks=[];opened=null;counter=0;selectedDate=taipeiToday();activePanel='account';coolView='assignments';setTimetableView('day');coolOverflow.reset();
  for(const id of ['schedule-list','cool-list','todo-list','day-strip','week-timetable-grid'])$(id).replaceChildren();
  $('next-title').textContent='—';$('next-meta').textContent='';$('next-countdown').textContent='';$('next-badge-day').textContent='—';$('next-badge-time').textContent='';
  $('account-name').textContent='';$('account-id').textContent='';
  $('app-screen').hidden=true;$('login-screen').hidden=false;$('login-screen').dataset.authCheck='ready';showLoginMessage();$('live-login-form').reset();$('live-login-error').hidden=true;$('live-login-number').focus();
}
/* Desktop panel resizing: widths are ratios, so they still adapt to window size.
   Only these visual ratios are persisted, never student data. */
const dashboardResize=(()=>{
  const workspace=document.querySelector('.workspace');
  const panels=[
    workspace.querySelector('.schedule-column'),
    workspace.querySelector('.cool-column'),
    workspace.querySelector('.side-column')
  ];
  const handles=[...workspace.querySelectorAll('.column-resizer')];
  const largeDesktop=window.matchMedia('(min-width:1101px)');
  const storageKey='campus-week-preview-panel-widths-v1';
  let dragging=null;
  const widths=()=>panels.map(panel=>panel.getBoundingClientRect().width);
  function place(){
    const show=Boolean(student&&largeDesktop.matches&&!$('app-screen').hidden);
    for(const handle of handles)handle.hidden=!show;
    if(!show)return;
    const rect=workspace.getBoundingClientRect();
    const sections=panels.map(p=>p.getBoundingClientRect());
    handles[0].style.left=(sections[0].right+sections[1].left)/2-rect.left+'px';
    handles[1].style.left=(sections[1].right+sections[2].left)/2-rect.left+'px';
    const total=widths().reduce((a,b)=>a+b,0);
    for(let i=0;i<handles.length;i++)
      handles[i].setAttribute('aria-valuenow',String(Math.round((widths().slice(0,i+1).reduce((a,b)=>a+b,0)/total)*100)));
  }
  function apply(values,save=false){
    const total=values.reduce((a,b)=>a+b,0);
    if(!Number.isFinite(total)||total<=0)return;
    for(let i=0;i<3;i++)workspace.style.setProperty(
      ['--column-schedule','--column-ntu','--column-tasks'][i],(values[i]/total).toFixed(6)+'fr'
    );
    place();
    if(save){try{localStorage.setItem(storageKey,JSON.stringify(values.map(v=>Math.round(v/total*10000)/10000)));}catch{}}
  }
  function adjust(index,shift,from,save=false){
    const next=from.slice();
    const min=220; // Matches desktop grid minimum; both neighbors remain readable.
    const left=index===0?0:1,right=left+1;
    const delta=Math.max(min-next[left],Math.min(shift,next[right]-min));
    next[left]+=delta;next[right]-=delta;
    apply(next,save);
  }
  function stop(event){
    if(!dragging||dragging.pointerId!==event.pointerId)return;
    const handle=dragging.handle;
    dragging=null;handle.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing-dashboard');
    if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
    apply(widths(),true);
  }
  for(const handle of handles){
    const index=handle.dataset.divider==='left'?0:1;
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||!largeDesktop.matches||!student)return;
      dragging={handle,index,pointerId:event.pointerId,x:event.clientX,from:widths()};
      handle.setPointerCapture(event.pointerId);handle.classList.add('is-dragging');
      document.body.classList.add('is-resizing-dashboard');event.preventDefault();
    });
    handle.addEventListener('pointermove',event=>{
      if(dragging?.handle!==handle||dragging.pointerId!==event.pointerId)return;
      adjust(index,event.clientX-dragging.x,dragging.from);
    });
    handle.addEventListener('pointerup',stop);
    handle.addEventListener('pointercancel',stop);
    handle.addEventListener('keydown',event=>{
      if(!largeDesktop.matches||!student||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();adjust(index,(event.key==='ArrowRight'?1:-1)*(event.shiftKey?48:18),widths(),true);
    });
    handle.addEventListener('dblclick',()=>{
      for(const key of ['--column-schedule','--column-ntu','--column-tasks'])workspace.style.removeProperty(key);
      try{localStorage.removeItem(storageKey);}catch{}
      place();
    });
  }
  try{
    const values=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(Array.isArray(values)&&values.length===3&&values.every(x=>Number.isFinite(x)&&x>=.1&&x<=.8)
      &&Math.abs(values.reduce((a,b)=>a+b,0)-1)<.01)apply(values);
  }catch{}
  window.addEventListener('resize',place,{passive:true});
  return{place};
})();

// Real data stays behind the existing Cloudflare account API and never enters theme storage.
function liveNotice(e){return e?.message||(language==='zh'?'連線失敗':'Connection unavailable');}
function updateSyncDots(){
  const online=navigator.onLine!==false,tasksState=taskStore.state,announcements=announcementStore;
  const entries=[
    ['timetable',!!liveTimetable&&liveTimetableOk,liveTimetableInfo],
    ['cool',coolView==='announcements'?!!announcements.items&&!announcements.error&&!announcements.loading&&!announcements.busy:!!liveCalendar&&liveCalendarOk,coolView==='announcements'?announcements.error?.message:liveCoolInfo],
    ['tasks',tasksState.ready&&!tasksState.error&&!tasksState.saving&&!tasksState.loading,tasksState.error?(language==='zh'?'同步失敗':'Sync failed'):'']
  ];
  for(const [key,ready,detail]of entries){
    const dot=$(key+'-sync-dot');dot.hidden=!liveMode;
    const synced=liveMode&&online&&ready;
    dot.classList.toggle('is-synced',!!synced);
    const label=synced?(language==='zh'?'已同步':'Synced'):!online?(language==='zh'?'離線':'Offline'):detail||(language==='zh'?'尚未同步':'Not synced yet');
    dot.title=label;dot.setAttribute('aria-label',label);
  }
}
function updateLiveStatus(){
  updateSyncDots();
  $('live-timetable-refresh').disabled=$('live-cool-refresh').disabled=!liveMode||livePending;
  if(!liveMode)return;
  const messageT=liveTimetableInfo||(liveTimetable?(language==='zh'?'已載入課表':'Saved timetable loaded'):t('liveNoTimetable'));
  const messageC=liveCoolInfo||(liveCalendar?(language==='zh'?'已載入 COOL 行事曆':'COOL calendar loaded'):t('noCalendar'));
  const missing=language==='en'&&liveTimetable?englishNameMissing(liveTimetable):0;
  $('live-timetable-settings-status').textContent=
    messageT+(missing?' · '+t('englishNamesMissing'):'');
  $('live-cool-settings-status').textContent=messageC;
}
function renderLiveAccount(){
  student=studentFromAccount(liveAccount,liveTimetable,liveCourseOverrides);
  renderAll();dashboardResize.place();
}
function sessionExpired(){
  account.current=null;leavePreview();
  showLoginMessage(language==='zh'?'登入已過期，請重新登入。':'Session expired. Please sign in again.');
}
async function readLiveSnapshots(){
  if(!liveMode||!liveAccount)return;
  void taskStore.refresh();
  eventUI.refresh();
  const epoch=liveEpoch,detailsRevision=liveDetailsRevision;
  const [tResult,cResult]=await Promise.allSettled([account.timetable(),account.coolCalendar()]);
  if(epoch!==liveEpoch||!liveMode)return;
  if(tResult.status==='fulfilled'&&detailsRevision===liveDetailsRevision&&!lessonSaving){
    if(tResult.value.studentNumber!==liveAccount.studentNumber){sessionExpired();return;}
    liveCourseOverrides=tResult.value.courseOverrides||{};
    liveTimetable=tResult.value.timetable||null;liveTimetableOk=tResult.value.connectionStatus==='authorized';
    liveTimetableInfo=tResult.value.connectionStatus==='reconnect_required'
      ?'Timetable reconnect required. Last saved classes are preserved.':'';
  }else if(tResult.status==='rejected'){
    if(tResult.reason?.status===401){sessionExpired();return;}
    liveTimetableInfo=liveNotice(tResult.reason);liveTimetableOk=false;
  }
  if(cResult.status==='fulfilled'){
    liveCalendar=cResult.value.calendar||null;liveCalendarOk=cResult.value.connectionStatus==='authorized';
    liveCoolInfo=cResult.value.connectionStatus==='reconnect_required'
      ?'COOL reconnect required. Last saved deadlines are preserved.':'';
  }else{
    if(cResult.reason?.status===401){sessionExpired();return;}
    liveCoolInfo=liveNotice(cResult.reason);liveCalendarOk=false;
  }
  renderLiveAccount();
}
function startLive(current){
  if(!current?.studentNumber||!current?.csrfToken)throw Error('Campus Week returned an invalid session.');
  liveMode=true;liveEpoch++;liveAccount=current;liveTimetable=null;liveCalendar=null;liveCourseOverrides={};coolDone.clear();coolDoneStorageKey='';previewCoolDone.clear();
  liveTimetableInfo='';liveCoolInfo='';tasks=[];counter=0;coolView='assignments';coolOverflow.reset();
  $('task-input').value='';taskStore.bind(current);mailUI.bind(current);
  selectedDate=taipeiToday();opened=null;activePanel='account';setTimetableView('day');
  $('login-screen').hidden=true;$('app-screen').hidden=false;
  
  renderLiveAccount();announcementStore.bind(current);eventUI.reset(current);restoreCoolChecks(current,liveEpoch);readLiveSnapshots();
}
function showLoginMessage(message=''){
  const status=$('live-login-status');status.textContent=message;status.hidden=!message;
}
async function restoreLive(){
  $('login-screen').dataset.authCheck='checking';
  showLoginMessage();
  try{
    const current=await account.restore();
    if(current)startLive(current);
  }catch(e){
    // A failed session check must not trap students behind the loading screen.
    showLoginMessage(language==='zh'?'無法檢查登入狀態，請直接登入。':'Could not check your session. You can sign in.');
  }finally{
    $('login-screen').dataset.authCheck='ready';
  }
}
async function syncLive(which){
  if(!liveMode||!liveAccount||livePending||lessonSaving)return;
  const epoch=liveEpoch,detailsRevision=liveDetailsRevision;livePending=true;
  if(which==='timetable'){liveTimetableOk=false;liveTimetableInfo='Checking NTU ePortfolio…';}
  else{liveCalendarOk=false;liveCoolInfo='Checking your COOL calendar…';}
  updateLiveStatus();
  try{
    const result=which==='timetable'
      ?await account.syncTimetable(undefined,undefined,true)
      :await account.syncCoolCalendar(undefined,undefined,true);
    if(epoch!==liveEpoch)return;
    if(which==='timetable'&&result.studentNumber!==liveAccount.studentNumber){sessionExpired();return;}
    if(which==='timetable'){if(detailsRevision===liveDetailsRevision&&!lessonSaving){liveCourseOverrides=result.courseOverrides||{};liveTimetable=result.timetable||liveTimetable;}else if(!lessonSaving)void readLiveSnapshots();liveTimetableOk=true;liveTimetableInfo='Timetable updated';}
    else{liveCalendar=result.calendar||liveCalendar;liveCalendarOk=true;liveCoolInfo='COOL calendar updated';}
    renderLiveAccount();
  }catch(e){
    if(epoch!==liveEpoch)return;
    if(e.status===401){sessionExpired();return;}
    if(which==='timetable')liveTimetableInfo=liveNotice(e);else liveCoolInfo=liveNotice(e);
  }finally{if(epoch===liveEpoch){livePending=false;updateLiveStatus();}}
}
async function submitLiveLogin(event){
  event.preventDefault();
  if(livePending||!event.currentTarget.reportValidity())return;
  livePending=true;const button=$('live-login-submit'),pass=$('live-login-password'),number=$('live-login-number');
  button.disabled=true;const secret=pass.value,studentNumber=number.value.trim();pass.value='';
  const message=$('live-login-error');message.hidden=true;message.textContent='';
  showLoginMessage(language==='zh'?'正在驗證臺大帳號…':'Signing in…');
  try{
    const availability=await fetch('/api/ntu/status',{credentials:'same-origin',cache:'no-store'});
    if(!availability.ok||(await availability.json()).loginEnabled!==true)
      throw Error('NTU sign-in is not enabled on this Campus Week server.');
    const current=await account.login(studentNumber,secret);
    startLive(current);
  }catch(e){message.textContent=liveNotice(e);message.hidden=false;showLoginMessage();}
  finally{pass.value='';if(liveMode)number.value='';livePending=false;button.disabled=false;}
}
async function endLiveAccount(){
  if(liveMode&&account.current){
    try{await account.logout();}catch(e){
      if(e.status!==401){liveTimetableInfo=liveNotice(e);updateLiveStatus();return;}
    }
  }
  account.current=null;leavePreview();
}

function enterPreview(){
  liveMode=false;liveEpoch++;liveAccount=null;liveCalendar=null;liveTimetable=null;liveCourseOverrides={};previewCourseOverrides={};coolDone.clear();coolDoneStorageKey='';previewCoolDone.clear();account.current=null;
  taskStore.bind(null);mailUI.bind(null);announcementStore.bind(null);$('task-input').value='';
  eventUI.reset();
  const key=$('preview-profile').value;if(!Object.hasOwn(profiles,key))return;
  previewCourseOverrides={};student={...profiles[key],courses:previewCourseRows(profiles[key])};tasks=student.tasks.map(text=>({id:++counter,text,done:false}));
  selectedDate=taipeiToday();activePanel='account';opened=null;coolView='assignments';setTimetableView('day');coolOverflow.reset();
  $('login-screen').hidden=true;$('app-screen').hidden=false;renderAll();dashboardResize.place();$('open-settings').focus();
}
function chooseLanguage(value){language=value;renderAll();}
$('enter-preview').addEventListener('click',enterPreview);
$('live-login-form').addEventListener('submit',submitLiveLogin);
$('live-timetable-refresh').addEventListener('click',()=>syncLive('timetable'));
$('live-cool-refresh').addEventListener('click',()=>{void syncLive('cool');void announcementStore.refresh();});
$('view-day').addEventListener('click',()=>setTimetableView('day'));
$('view-week').addEventListener('click',()=>setTimetableView('week'));
$('login-language-en').addEventListener('click',()=>chooseLanguage('en'));
$('login-language-zh').addEventListener('click',()=>chooseLanguage('zh'));
$('language-en').addEventListener('click',()=>chooseLanguage('en'));
$('language-zh').addEventListener('click',()=>chooseLanguage('zh'));
$('settings-language').addEventListener('change',e=>chooseLanguage(e.target.value));
$('page-refresh').addEventListener('click',()=>{
  if(liveMode){if(!livePending)readLiveSnapshots();void announcementStore.refresh();return;}
  renderAll();$('toast').textContent=t('previewRefresh');
});
$('previous-week').addEventListener('click',()=>{selectedDate=offset(selectedDate,-7);renderCalendar();});
$('next-week').addEventListener('click',()=>{selectedDate=offset(selectedDate,7);renderCalendar();});
$('jump-today').addEventListener('click',()=>{selectedDate=taipeiToday();renderCalendar();});
$('choose-date').addEventListener('change',e=>{try{dateFor(e.target.value);selectedDate=e.target.value;renderCalendar();}catch{$('choose-date').value=selectedDate;}});
$('cool-refresh').addEventListener('click',()=>{
  if(liveMode){if(coolView==='announcements')void announcementStore.refresh();else void syncLive('cool');return;}
  renderDeadlines();$('toast').textContent=t('previewRefresh');
});
document.querySelectorAll('[data-cool-view]').forEach(button=>button.addEventListener('click',()=>{
  coolView=button.dataset.coolView;renderDeadlines();
}));
$('task-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!student)return;const content=$('task-input').value.trim();if(!content)return;
  if(liveMode){const epoch=liveEpoch;if(await taskStore.add(content)&&epoch===liveEpoch&&$('task-input').value.trim()===content)$('task-input').value='';return;}
  tasks.unshift({id:++counter,text:content,done:false});$('task-input').value='';renderTasks();
});
$('tasks-retry').addEventListener('click',()=>{if(liveMode)void taskStore.refresh();});
$('tasks-undo').addEventListener('click',()=>{if(liveMode)void taskStore.undo();});
$('open-settings').addEventListener('click',()=>{showPanel('account');settingsUI.open();$('settings-dialog').showModal();});
$('settings-close-desktop').addEventListener('click',()=>$('settings-dialog').close());
$('settings-close-mobile').addEventListener('click',()=>$('settings-dialog').close());
$('close-lesson').addEventListener('click',()=>{if(!lessonSaving)$('lesson-dialog').close();});
$('lesson-edit-cancel').addEventListener('click',()=>{if(!lessonSaving)$('lesson-dialog').close();});
$('lesson-edit-form').addEventListener('submit',event=>{event.preventDefault();void saveLessonDetails();});
$('lesson-reset').addEventListener('click',()=>void saveLessonDetails(true));
$('lesson-dialog').addEventListener('cancel',event=>{if(lessonSaving)event.preventDefault();});
$('switch-account').addEventListener('click',()=>{if(liveMode)endLiveAccount();else leavePreview();});
$('log-out').addEventListener('click',()=>{if(liveMode)endLiveAccount();else leavePreview();});
$('settings-dialog').addEventListener('close',()=>{if(student)$('open-settings').focus();});
$('lesson-dialog').addEventListener('close',()=>{opened=null;lessonDraft=null;lessonSaving=false;lessonControls();});
setInterval(()=>{if(student&&!document.hidden){renderBanner();if(selectedDate===taipeiToday())renderCalendar();if(liveMode&&navigator.onLine!==false){void taskStore.refresh();eventUI.refresh();}}},30000);
window.addEventListener('online',()=>{if(liveMode&&!document.hidden){void taskStore.refresh();eventUI.refresh();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&liveMode&&!livePending)readLiveSnapshots();});
window.addEventListener('online',updateSyncDots);
window.addEventListener('offline',updateSyncDots);
const mailUI=createMailUI({account,isLive:()=>liveMode,language:()=>language});

const settingsUI=createSettings({account,onSessionExpired:sessionExpired});
renderTranslations();
// Explicit design-preview links always use the labelled fictional profile.
if(new URL(location.href).searchParams.get('preview')==='settings'){
  $('login-screen').dataset.authCheck='ready';
  enterPreview();showPanel('account');settingsUI.open();$('settings-dialog').showModal();
}else{
  // Same-origin HttpOnly session cookies survive reloads and installed PWA launches.
  // Restore once on startup; show the sign-in form only if no session is available.
  void restoreLive();
}
