// Campus Week theme-ready interface: fictional preview and opt-in live NTU data.
import { account, mapTimetable, mapCalendar, studentFromAccount, englishNameMissing } from './live-source.mjs';
import { AccountAnnouncements } from '/account-announcements.mjs';
import { AccountExams, examFeed, examUnavailableCourses } from '/account-exams.mjs';
import { applyCourseOverrides, scheduleAccent } from '/course-model.mjs';
import { formatPeriods } from '/ntu-periods.mjs';
import { AccountTasks } from '/account-tasks.mjs';
import { eventsOn, nextEventDates } from '/event-model.mjs';
import { createEventUI } from './custom-events.mjs';
import {createExamEditor} from './exam-editor.mjs';
import { createMailUI } from './mail.mjs';
import { examCompletionKey } from '/exam-completion.mjs';
import { createSettings } from './settings.mjs';
import { missingInitialSources, syncInitialSources } from './initial-sync.mjs';
import { academicWeek } from '/academic-calendar.mjs';
import { ForegroundRefresh } from './foreground-refresh.mjs';
import { createCoolFeedScroll } from './cool-feed-scroll.mjs';
const $ = id => document.getElementById(id);
const DAY = 86400000;
const foregroundRefresh=new ForegroundRefresh();
const profiles = {
  engineering: {
    name:['Engineering student','工程學院學生'],id:'SAMPLE-A',tasks:['Read chapter 3','Review lab notes'],
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
    name:['Social sciences student','社會科學院學生'],id:'SAMPLE-B',tasks:['Outline policy presentation'],
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
    exams:'Exams',upcomingExams:'Upcoming exams',chooseSection:'Choose your class',section:'Class',automaticSection:'Automatic matching',
    loginEyebrow:'NTU · CAMPUS WEEK',loginTitle:'Sign in',loginIntro:'Use your NTU student number and Mail password.',checkingSession:'Checking your session…',tryPreview:'Try a sample timetable',previewLabel:'Sample student',engineeringProfile:'Engineering student',socialProfile:'Social sciences student',enterPreview:'Open sample timetable',loginSafety:'Sample data only. No NTU account is required.',disclaimer:'Independent student project · Not an official NTU service',headerEyebrow:'NTU · CAMPUS WEEK',mySchedule:'My Schedule',
    teachingWeek:'SEMESTER',flexibleWeek:'Flexible week',chooseDate:'Choose date',today:'Today',week:'Week',coursesLabel:'NTU + COURSES',upcomingDates:'Upcoming dates',refresh:'Refresh',reloadSite:'Reload site',previousWeek:'Previous week',nextWeek:'Next week',closeSettings:'Close settings',closeDetails:'Close class details',openMail:'Open Campus Mail',sampleDeadlines:'Illustrative events and deadlines; not connected to COOL.',toDo:'TO DO',manualTasks:'Manual tasks',newTask:'New task',add:'Add',tasksOnly:'Sample tasks stay in memory and disappear on reload.',
    lessonDescription:'Description',lessonReset:'Restore original details',lessonCancel:'Cancel',lessonSave:'Save changes',lessonSaving:'Saving…',lessonSaved:'Changes saved.',lessonSaveFailed:'Could not save these details. Your edits are still here; please try again.',lessonChanged:'These details changed on another device. Reopen this lesson to load the latest details.',lessonNameEn:'Name (English)',lessonNameZh:'Name (Chinese)',lessonHelpEn:'Applies to every meeting of this class. The name changes only in English.',lessonHelpZh:'Applies to every meeting of this class. The name changes only in Chinese.',lessonPreview:'Sample edits last until you leave the sample timetable.',
    classDetails:'CLASS DETAILS',time:'Time',location:'Location',courseCode:'Course code',status:'Status',repeatsWeekly:'Classes follow a repeating weekly schedule.',preferences:'PREFERENCES',settings:'Settings',account:'Account',appearance:'Appearance',language:'Language',timetable:'Timetable',widgets:'Widgets',privacy:'Privacy & security',about:'About',
    accountDesc:'Your Campus Week identity and sessions.',demoAccount:'Sample account',accountActions:'Account actions',switchHelp:"Switching accounts returns to sign-in.",switchAccount:'Switch account',logOut:'Log out',appearanceDesc:'Choose how Campus Week looks.',theme:'Theme',light:'Light',dark:'Dark',langDesc:'Select interface language. Course names reflect the sample data.',interfaceLanguage:'Interface language',
    timetableDesc:'Live account mode uses the existing NTU ePortfolio timetable connection.',previewStatus:'Sample data',syncNotConnected:'Sign in to connect your NTU account.',reconnectLater:'Reconnect',coolDesc:'Live COOL calendar deadlines use your existing NTU connection. Announcements refresh every two minutes while this page is focused.',widgetsDesc:'Optional extras can be added without affecting the core schedule.',hanziLater:'Connect your Hanzi Steps username to show your progress.',comingLater:'Optional',
    securityDesc:'Production account access remains exclusively with our existing Cloudflare backend.',noCredentials:'Sample mode needs no credentials',securityPreview:'Sample mode is entirely fictional. Live mode uses the existing secure Campus Week API; this interface never stores passwords.',signOutAllLater:'Sign out all devices',aboutDesc:'Campus Week. Independent student project; not affiliated with National Taiwan University.',designPreview:'Sample timetable',aboutDetails:'Your timetable, coursework, tasks and campus mail.',
    next:'UP NEXT',live:'HAPPENING NOW',startsIn:'Starts in',endsIn:'Ends in',classes:'classes',singleClass:'class',noClasses:'No classes today',noClassesDesc:'Your timetable is clear on this date.',tasks:'tasks',singleTask:'task',addPlaceholder:'Add a task…',noTasks:'No tasks yet. Add one above.',completed:'Finished',upcoming:'Upcoming',scheduled:'Scheduled',previewRefresh:'This is sample data; no live refresh was made.',overlap:'Time clash',
    dayView:'Day',weekView:'Week',weeklyTimetable:'Weekly timetable',calendarLabel:'CLASS TIMETABLE',weekViewScroll:'Weekly timetable; scroll vertically or sideways to explore classes',
    liveEntryHeading:'Or use your real NTU account',liveEntryDesc:'Connect through the existing Campus Week account and backend.',restoreSession:'Use existing session',signInNtu:'Sign in',realAccount:'REAL NTU ACCOUNT',realLoginExplanation:'Uses the existing secure Campus Week login and the same timetable/COOL backend as the original site.',studentNumber:'NTU student number',ntuPassword:'NTU Mail password',accountSecurity:'Only sign in on your trusted Campus Week website.',timetableConnection:'Timetable connection',coolConnection:'COOL connection',syncTimetable:'Sync timetable',syncCool:'Sync COOL',realAssignmentsNote:'Live COOL calendar · ✓ marks done only here; submit assignments in COOL',realAnnouncementsNote:'Live COOL announcements · Last 90 days · Refreshes every 2 minutes while focused',noCalendar:'No connected COOL calendar. Select Refresh or connect from Settings.',liveNoAssignments:'No upcoming calendar deadlines.',liveNoTimetable:'No saved classes yet. Use Settings → Timetable → Sync timetable.',
    doneLocally:'Marked done here only; this does not submit to COOL.',examDoneLocally:'Completed here only; this does not change the NTU exam plan.',markDone:'Mark done',markUndone:'Mark not done',englishNamesMissing:'NTU did not provide an English title for some classes; showing their original names.',
    assignments:'Assignments',announcements:'Announcements',sampleAnnouncements:'Fictional announcements for layout preview; not connected to COOL.',campusAccessEyebrow:'CAMPUS',campusShortcuts:'Campus shortcuts',freeDay:'Free',
    scheduleItem:'event',scheduleItems:'events',customEvent:'PERSONAL',
    tasksLoading:'Loading your saved tasks…',tasksSaving:'Saving…',tasksLoadFailed:'Could not load tasks. Refresh tasks to try again.',tasksSaveFailed:'Could not confirm the save. Your last saved tasks are shown; please try again.',tasksConflict:'This task changed on another device. Latest tasks loaded; please try again.',tasksFull:'You have 500 tasks. Remove an old task before adding another.',tasksRetry:'Refresh tasks',tasksUndo:'Undo remove',removeTask:'Remove task',
    days:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],shortDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  },
  zh:{
    exams:'考試',upcomingExams:'近期考試',chooseSection:'選擇你的課程班別',section:'班別',automaticSection:'自動比對',
    loginEyebrow:'臺大 · CAMPUS WEEK',loginTitle:'登入',loginIntro:'使用臺大學號和電子郵件密碼登入。',checkingSession:'正在檢查登入狀態…',tryPreview:'試用範例課表',previewLabel:'範例學生',engineeringProfile:'工程學院學生',socialProfile:'社會科學院學生',enterPreview:'開啟範例課表',loginSafety:'僅使用範例資料，不需要臺大帳號。',disclaimer:'獨立學生專案 · 非臺灣大學官方服務',headerEyebrow:'臺大 · CAMPUS WEEK',mySchedule:'我的課表',
    teachingWeek:'學期',flexibleWeek:'彈性週',chooseDate:'選擇日期',today:'今天',week:'本週',coursesLabel:'臺大 + 課程',upcomingDates:'近期日期',refresh:'重新整理',reloadSite:'重新載入網站',previousWeek:'上一週',nextWeek:'下一週',closeSettings:'關閉設定',closeDetails:'關閉課程詳情',openMail:'開啟 Campus Mail',sampleDeadlines:'以上為虛構事件與期限，尚未連結 NTU COOL。',toDo:'待辦事項',manualTasks:'手動任務',newTask:'新增任務',add:'新增',tasksOnly:'範例任務僅暫存於記憶體，重新整理後會消失。',
    lessonDescription:'說明',lessonReset:'還原原始資料',lessonCancel:'取消',lessonSave:'儲存變更',lessonSaving:'儲存中…',lessonSaved:'已儲存變更。',lessonSaveFailed:'無法儲存，已保留你的編輯內容，請再試一次。',lessonChanged:'其他裝置已變更此課程，請重新開啟以載入最新資料。',lessonNameEn:'課程名稱（英文）',lessonNameZh:'課程名稱（中文）',lessonHelpEn:'套用至此課程的所有課堂，名稱僅變更英文版本。',lessonHelpZh:'套用至此課程的所有課堂，名稱僅變更中文版本。',lessonPreview:'範例編輯僅保留至離開範例課表。',classDetails:'課程詳情',time:'時間',location:'地點',courseCode:'課號',status:'狀態',repeatsWeekly:'課表以每週重複方式顯示。',preferences:'偏好設定',settings:'設定',account:'帳號',appearance:'外觀',language:'語言',timetable:'課表',widgets:'小工具',privacy:'隱私與安全',about:'關於',
    accountDesc:'Campus Week 身分與登入狀態。',demoAccount:'範例帳號',accountActions:'帳號操作',switchHelp:'切換帳號前會清除畫面上的上一位虛構學生資料。',switchAccount:'切換帳號',logOut:'登出',appearanceDesc:'預覽主題設定；不會儲存變更。',theme:'主題',light:'淺色',dark:'深色',langDesc:'選擇介面語言。課程名稱來自範例資料。',interfaceLanguage:'介面語言',
    timetableDesc:'真實帳號模式沿用現有臺大 ePortfolio 課表連線。',previewStatus:'預覽資料',syncNotConnected:'本預覽未連線至臺大帳號。',reconnectLater:'稍後重新連線',coolDesc:'COOL 行事曆及公告使用現有臺大連線，公告在頁面使用中每兩分鐘更新。',widgetsDesc:'選用小工具不會影響主要課表。',hanziLater:'未來可選擇啟用，預設關閉；使用者名稱輸入及資料載入會稍後實作。',comingLater:'稍後推出',
    securityDesc:'正式帳號存取仍由現有 Cloudflare 後端處理。',noCredentials:'預覽不需帳密',securityPreview:'範例模式使用虛構資料。真實模式沿用既有安全 API，介面不儲存密碼。',signOutAllLater:'登出所有裝置（稍後）',aboutDesc:'Campus Week。獨立學生專案，與國立臺灣大學無隸屬關係。',designPreview:'設計預覽',aboutDetails:'可切換視覺主題的 Classic 介面，沿用既有帳號、課表與 COOL API。',
    next:'下一堂課',live:'正在上課',startsIn:'距離開始',endsIn:'距離結束',classes:'堂課',singleClass:'堂課',noClasses:'今天沒有課',noClassesDesc:'這天的課表沒有課程。',tasks:'項任務',singleTask:'項任務',addPlaceholder:'新增任務…',noTasks:'目前沒有任務。',completed:'已結束',upcoming:'即將開始',scheduled:'已排定',previewRefresh:'這是範例資料，未執行線上同步。',overlap:'時間衝突',
    dayView:'單日',weekView:'整週',weeklyTimetable:'每週課表',calendarLabel:'課程時間表',weekViewScroll:'每週課表；可上下及左右捲動查看課程',
    liveEntryHeading:'或使用真正的臺大帳號',liveEntryDesc:'使用現有 Campus Week 帳號與後端連線。',restoreSession:'使用現有登入狀態',signInNtu:'登入',realAccount:'真實臺大帳號',realLoginExplanation:'沿用既有安全的 Campus Week 登入與課表、COOL 後端。',studentNumber:'臺大學號',ntuPassword:'臺大郵件密碼',accountSecurity:'請只在正確的 Campus Week 網址登入。',timetableConnection:'課表連線',coolConnection:'COOL 連線',syncTimetable:'同步課表',syncCool:'同步 COOL',realAssignmentsNote:'COOL 行事曆；✓ 僅在此標記完成，作業仍需至 COOL 提交',realAnnouncementsNote:'COOL 公告 · 最近 90 天 · 頁面使用中每兩分鐘更新',noCalendar:'尚無 COOL 行事曆，請按重新整理或至設定連線。',liveNoAssignments:'目前沒有近期行事曆截止日期。',liveNoTimetable:'尚無已儲存課表，請到設定 → 課表同步。',
    doneLocally:'僅在本站標記完成，不會向 COOL 提交作業。',examDoneLocally:'僅在本站標記已完成，不會更改臺大考試資料。',markDone:'標記完成',markUndone:'取消完成',englishNamesMissing:'NTU 未提供部分課程的英文名稱，將保留原始課名。',
    assignments:'作業',announcements:'公告',sampleAnnouncements:'以上為虛構公告，尚未連接 NTU COOL。',campusAccessEyebrow:'校園',campusShortcuts:'校園捷徑',freeDay:'無課',
    scheduleItem:'項行程',scheduleItems:'項行程',customEvent:'個人行程',
    tasksLoading:'正在載入已儲存的任務…',tasksSaving:'儲存中…',tasksLoadFailed:'無法載入任務，請重新整理任務再試一次。',tasksSaveFailed:'無法確認是否已儲存，畫面保留上次儲存的任務，請再試一次。',tasksConflict:'此任務已在其他裝置變更，已載入最新任務，請再試一次。',tasksFull:'已達 500 項任務，請先移除舊任務。',tasksRetry:'重新整理任務',tasksUndo:'復原移除',removeTask:'移除任務',
    days:['星期一','星期二','星期三','星期四','星期五','星期六','星期日'],shortDays:['週一','週二','週三','週四','週五','週六','週日']
  }
};
let savedLanguage='en';
try{const saved=localStorage.getItem('campus-week:language');if(saved==='en'||saved==='zh')savedLanguage=saved;}catch{}
let language=savedLanguage,student=null,tasks=[],selectedDate=taipeiToday(),activePanel='account',opened=null,counter=0,coolView='assignments',timetableView='day';
let pastExamsOpen=false,hiddenExamsOpen=false,missingExamsOpen=false;
let liveMode=false,liveAccount=null,liveCalendar=null,liveTimetable=null,liveEpoch=0,livePending=false,initialSyncBusy=false,liveTimetableInfo='',liveCoolInfo='';
let liveTimetableOk=false,liveCalendarOk=false,liveCourseOverrides={},liveExamPlans={},liveSectionOptions={},previewCourseOverrides={},lessonDraft=null,lessonSaving=false,liveDetailsRevision=0;
let coolDone=new Set(),coolDoneStorageKey='',previewCoolDone=new Set();
const t = key => dict[language][key]===undefined?key:dict[language][key];
const coolScroll=createCoolFeedScroll({list:$('cool-list')});
const taskStore = new AccountTasks(account, {
  onChange(state){if(liveMode){tasks=state.items;renderTasks();}},
  onSessionExpired:()=>sessionExpired()
});
const announcementStore=new AccountAnnouncements(account,()=>{if(student&&liveMode){if(coolView==='announcements')renderDeadlines();else updateSyncDots();}},()=>sessionExpired());
const examStore=new AccountExams(account,()=>{if(student&&liveMode){
  for(const [courseId,entry] of examStore.entries){
    const result=entry.result;
    if(result?.candidates&&result?.matching){
      liveSectionOptions[courseId]={term:liveTimetable?.term||'',candidates:result.candidates,matching:result.matching,selected:result.selected||null,savedAt:result.savedAt||Date.now()};
    }
  }
  if(coolView==='exams')renderDeadlines();renderCalendar();
}},()=>sessionExpired());
const eventUI=createEventUI({account,isLive:()=>liveMode,getLanguage:()=>language,getDate:()=>selectedDate,onChange(){if(student){renderBanner();renderCalendar();}},onSessionExpired:()=>sessionExpired()});
const examEditor=createExamEditor({account,
  onChange(){if(student&&liveMode&&coolView==='exams')renderDeadlines();},
  onExpired:()=>sessionExpired(),
  getLanguage:()=>language,getToday:()=>taipeiToday(),
  getClasses:()=>[...new Map((student?.courses||[]).filter(c=>!c[7]).map(c=>[c[8],{name:c[language==='zh'?4:3]}])).values()]
});
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
function shortMonth(key){return new Intl.DateTimeFormat(language==='zh'?'zh-TW':'en-US',{timeZone:'UTC',month:'short'}).format(dateFor(key));}
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

let calendarSignature='';
function updateCalendarClock(){
  const today=taipeiToday(),items=scheduleOn(selectedDate);
  $('schedule-list').querySelectorAll('.lesson').forEach((button,index)=>{
    const state=items[index]?lessonState(items[index],selectedDate):'';
    button.classList.toggle('live',selectedDate===today&&state===t('live'));
    button.classList.toggle('completed',selectedDate===today&&state===t('completed'));
  });
}
function renderCalendar(){
  if(!student)return;
  const signature=JSON.stringify([student.id,language,selectedDate,taipeiToday(),timetableView,liveTimetable?.term,student.courses,eventUI.events(),student.courses.map(c=>courseOffering(c))]);
  if(signature===calendarSignature){updateCalendarClock();return;}
  calendarSignature=signature;const base=monday(selectedDate),today=taipeiToday(),strip=$('day-strip');
  const end=offset(base,6);
  const monthfmt=new Intl.DateTimeFormat(language==='zh'?'zh-TW':'en-US',{timeZone:'UTC',month:'short',day:'numeric'});
  const dateRange=language==='zh'?
    monthfmt.format(dateFor(base))+' – '+monthfmt.format(dateFor(end)):
    (base.slice(0,7)===end.slice(0,7)?monthfmt.format(dateFor(base))+'–'+dateFor(end).getUTCDate():monthfmt.format(dateFor(base))+' – '+monthfmt.format(dateFor(end)));
  const academic=academicWeek(selectedDate,liveMode?liveTimetable?.term:undefined);
  const weekLabel=academic?(academic.flexible?t('flexibleWeek'):language==='zh'?'第 '+academic.week+' 週':'Week '+academic.week):dateRange;
  $('week-range').textContent=weekLabel;
  $('week-range').title=dateRange+(academic?' · '+academic.term:'');
  $('week-range').setAttribute('aria-label',academic?weekLabel+' · '+dateRange:dateRange);
  document.querySelector('.week-caption .eyebrow').textContent=t(academic?'teachingWeek':'week');
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
    if(liveMode&&courseOffering(c))card.append(node('span','lesson-section',sectionLabel(courseOffering(c))));
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
function addCoolCheck(card,key,doneStore,save=()=>{},host=card){
  if(!key)return;
  const done=doneStore.has(key);
  card.classList.add('cool-checkable');
  card.classList.toggle('done',done);
  const control=node('button','cool-done-button'+(done?' is-done':''),'✓');
  control.type='button';control.setAttribute('aria-pressed',String(done));
  control.setAttribute('aria-label',t(done?'markUndone':'markDone'));
  control.title=t(key.startsWith('exam:')?'examDoneLocally':'doneLocally');
  control.addEventListener('click',()=>{
    if(doneStore.has(key))doneStore.delete(key);else doneStore.add(key);
    save();renderDeadlines();
  });
  host.append(control);
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
    coolDone=new Set(Array.isArray(raw)?raw.filter(x=>typeof x==='string'&&x.length<=1024).slice(0,500):[]);
    renderDeadlines();
  }catch{if(epoch===liveEpoch){coolDoneStorageKey='';coolDone=new Set();}}
}
function saveCoolChecks(){
  if(!liveMode||!coolDoneStorageKey)return;
  try{localStorage.setItem(coolDoneStorageKey,JSON.stringify([...coolDone].slice(0,500)))}catch{}
}

function renderDeadlines(){
  document.querySelectorAll('[data-cool-view]').forEach(button=>button.tabIndex=button.dataset.coolView===coolView?0:-1);
  const scrollTop=$('cool-list').scrollTop;
  renderDeadlinesContent();
  coolScroll.update(coolView,scrollTop);
}
function renderDeadlinesContent(){
  updateSyncDots();
  const list=$('cool-list'),expanded=new Set([...list.querySelectorAll('details[open]')].map(el=>el.dataset.announcement));list.replaceChildren();if(!student)return;
  if(liveMode){renderLiveDeadlines(expanded);return;}
  if(coolView==='exams'){renderExams();return;}
  $('cool-preview-note').hidden=false;$('cool-preview-note').classList.remove('exam-warning');$('cool-preview-note').removeAttribute('role');
  document.querySelectorAll('[data-cool-view]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.coolView===coolView)));
  $('cool-list').setAttribute('aria-labelledby',coolView==='assignments'?'cool-assignments-tab':'cool-announcements-tab');
  $('cool-heading').textContent=coolView==='assignments'?t('upcomingDates'):t('announcements');
  $('cool-preview-note').textContent=coolView==='assignments'?t('sampleDeadlines'):t('sampleAnnouncements');
  if(coolView==='announcements'){
    const profile=student.id===profiles.engineering.id?'engineering':'social';
    for(const entry of announcements[profile]){
      const card=node('article','cool-item announcement-card card'),date=node('span','cool-date'),copy=node('span','cool-copy');
      const key=offset(taipeiToday(),-entry[4]);date.append(node('strong','',String(dateFor(key).getUTCDate())),node('small','',shortMonth(key)));
      copy.append(node('strong','',entry[language==='zh'?1:0]),node('small','',entry[language==='zh'?3:2]));
      card.append(date,copy);list.append(card);
    }
    return;
  }
  for(const [index,item] of student.deadlines.entries()){
    const key=offset(taipeiToday(),item[0]),card=node('article','cool-item card'),
      main=node('div','cool-main'),date=node('span','cool-date'),copy=node('span','cool-copy');
    date.append(node('strong','',String(dateFor(key).getUTCDate())),node('small','',shortMonth(key)));
    copy.append(node('strong','',item[language==='zh'?2:1]),node('small','',item[language==='zh'?4:3]));
    main.append(date,copy,node('span','cool-due',language==='zh'?item[0]+' 天後':'In '+item[0]+' days'));
    card.append(main);
    addCoolCheck(card,'preview-'+index,previewCoolDone);
    list.append(card);
  }
}
function renderLiveDeadlines(expanded=new Set()){
  if(coolView==='exams'){renderExams();return;}
  $('cool-preview-note').hidden=false;$('cool-preview-note').classList.remove('exam-warning');$('cool-preview-note').removeAttribute('role');
  const list=$('cool-list');
  document.querySelectorAll('[data-cool-view]').forEach(button=>
    button.setAttribute('aria-selected',String(button.dataset.coolView===coolView)));
  list.setAttribute('aria-labelledby',coolView==='assignments'?'cool-assignments-tab':'cool-announcements-tab');
  $('cool-heading').textContent=coolView==='assignments'?t('upcomingDates'):t('announcements');
  $('cool-preview-note').textContent=coolView==='assignments'?t('realAssignmentsNote'):t('realAnnouncementsNote');
  if(coolView==='announcements'){
    const state=announcementStore;
    $('cool-refresh').disabled=state.busy||state.loading;
    $('cool-preview-note').textContent=state.error&&!state.items?liveNotice(state.error):t('realAnnouncementsNote')+(state.items?.syncedAt?' · '+new Intl.DateTimeFormat(language==='zh'?'zh-TW':'en-US',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'}).format(new Date(state.items.syncedAt)):'');
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
  for(const item of items){
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

function courseOffering(c){
  return liveCourseOverrides[c[8]]?.examOffering||examStore.entries.get(c[8])?.result?.selected||liveTimetable?.sessions.find(s=>s.courseId===c[8]&&s.section);
}
function sectionLabel(offering){return offering?(t('section')+' '+(offering.section||'—')+(offering.teacher?' · '+offering.teacher:'')):'';}
function renderExams(){
  const list=$('cool-list');
  document.querySelectorAll('[data-cool-view]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.coolView===coolView)));
  list.setAttribute('aria-labelledby','cool-exams-tab');$('cool-heading').textContent=t('upcomingExams');
  $('cool-refresh').disabled=liveMode&&examStore.busy;
  const footer=$('cool-preview-note');
  footer.hidden=true;footer.classList.remove('exam-warning');footer.removeAttribute('role');footer.replaceChildren();
  if(!liveMode){list.append(node('div','empty-card',language==='zh'?'登入以載入你的課程考試。':'Sign in to load exams for your classes.'));return;}
  if(!examStore.courses.length&&!examEditor.items().length)list.append(node('div','empty-card',t('liveNoTimetable')));
  const headingRow=node('div','exam-list-heading');
  const heading=node('h4','exam-group-title',language==='zh'?'近期考試':'Upcoming exams');
  const addExamButton=node('button','button small exam-add-button',language==='zh'?'+ 新增考試':'+ Add exam');
  addExamButton.type='button';addExamButton.addEventListener('click',()=>examEditor.open());
  headingRow.append(heading,addExamButton);list.append(headingRow);
  if(examStore.busy)list.append(node('p','exam-loading-label',language==='zh'?'正在檢查課程考試…':'Checking course exam plans…'));
  const feed=examFeed(examStore.entries,taipeiToday(),examEditor.items());
  function addExam(item,parent=list){
    const {courseId,course,exam,url,date,week,stale}=item,c=student.courses.find(c=>c[8]===courseId);
    const card=node('article','cool-item exam-card card'),main=node(url?'a':'div','cool-main'),stamp=node('span','cool-date exam-stamp'),copy=node('span','cool-copy');
    if(url){main.href=url;main.target='_blank';main.rel='noopener noreferrer';}
    if(week)stamp.append(node('span','exam-week-label',language==='zh'?'週次':'Week'),node('strong','exam-week-number',String(week)));
    if(date)stamp.append(node('span','exam-month',dateFor(date).toLocaleDateString(language==='zh'?'zh-TW':'en-US',{timeZone:'UTC',month:'short'})),node('strong','exam-day',String(dateFor(date).getUTCDate())));
    if(!week&&!date)stamp.append(node('span','exam-week-label',language==='zh'?'日期':'Date'),node('strong','exam-week-number','—'));
    const kind=({quiz:language==='zh'?'小考':'Quiz',midterm:language==='zh'?'期中考':'Midterm',final:language==='zh'?'期末考':'Final exam',other:language==='zh'?'考試':'Exam'})[exam.kind]||t('upcomingExams');
    const courseName=c?.[language==='zh'?4:3]||course.title;
    const title=item.custom?item.title:item.title?courseName+' · '+item.title:courseName+' · '+kind;
    copy.append(node('strong','',title),node('small','',exam.description||kind));
    const details=item.custom?[language==='zh'?'自訂考試':'Custom exam',item.manualRecord?.className]:
      [sectionLabel(course),item.manualRecord?(language==='zh'?'個人修改':'Personal edit'):null,course.source==='ntu-cool'?'NTU COOL':(language==='zh'?'臺大課程網':'NTU course syllabus')];
    copy.append(node('small','exam-source',details.filter(Boolean).join(' · ')));
    if(!item.custom&&examStore.entries.get(courseId)?.result?.matching?.status==='matched-timetable')
      copy.append(node('small','exam-confidence',language==='zh'?'依上課時間比對班別':'Class matched by timetable'));
    const confidence=item.manualRecord?(language==='zh'?'學生自行輸入的時間':'Student-entered timing'):
      date?(exam.certainty==='explicit'?(language==='zh'?'來源明載日期':'Date stated in source'):(language==='zh'?'課程週表日期':'Date in course schedule')):
        week?(language==='zh'?'僅提供週次':'Week only · no exact date'):(language==='zh'?'未提供日期':'No date provided');
    copy.append(node('small','exam-confidence',confidence+(stale?(language==='zh'?' · 更新失敗，顯示上次結果':' · Refresh failed; last result shown'):'')));
    if(url)main.setAttribute('aria-label',(language==='zh'?'在臺大課程網開啟：':'Open NTU course page: ')+title);
    main.append(stamp,copy);card.append(main);
    const edit=node('button','exam-edit-button',language==='zh'?'編輯':'Edit');
    edit.type='button';edit.setAttribute('aria-label',(language==='zh'?'編輯考試：':'Edit exam: ')+title);
    edit.addEventListener('click',()=>examEditor.open(item));
    const actions=node('div','exam-card-actions');actions.append(edit);
    addCoolCheck(card,examCompletionKey(item),coolDone,saveCoolChecks,actions);
    card.append(actions);parent.append(card);
  }
  if(feed.upcoming.length)feed.upcoming.forEach(item=>addExam(item));
  if(!feed.upcoming.length&&!examStore.busy)list.append(node('div','empty-card',language==='zh'?'目前沒有可顯示的近期考試。':'No upcoming exams to display.'));
  const history=node('details','exam-past');
  history.open=pastExamsOpen;
  history.addEventListener('toggle',()=>{pastExamsOpen=history.open;});
  history.append(node('summary','',language==='zh'?('已結束的考試 ('+feed.past.length+')'):('Past exams ('+feed.past.length+')')));
  const pastList=node('div','exam-past-list');
  if(feed.past.length)feed.past.forEach(item=>addExam(item,pastList));
  else pastList.append(node('p','exam-past-empty',language==='zh'?'沒有已結束的考試。':'No past exams.'));
  history.append(pastList);list.append(history);
  // A student may hide a generic or incorrect NTU syllabus entry without
  // deleting the upstream record or affecting another student's schedule.
  if(feed.hidden.length){
    const hiddenList=node('details','exam-hidden');
    hiddenList.open=hiddenExamsOpen;
    hiddenList.addEventListener('toggle',()=>{hiddenExamsOpen=hiddenList.open;});
    hiddenList.append(node('summary','',language==='zh'?('隱藏的考試 ('+feed.hidden.length+')'):('Hidden exams ('+feed.hidden.length+')')));
    const entries=node('div','exam-hidden-list');
    feed.hidden.forEach(item=>addExam(item,entries));
    hiddenList.append(entries);list.append(hiddenList);
  }

  // Replace the ordinary exams footer with a concise, account-specific warning.
  // Pending requests are not failures; an empty syllabus is distinguished from a fetch error.
  const missing=examUnavailableCourses(examStore.courses,examStore.entries,{busy:examStore.busy});
  const reasons={
    'refresh-failed':language==='zh'?'更新失敗，仍顯示已儲存的考試':'Refresh failed; saved exams still shown',
    'load-failed':language==='zh'?'無法載入考試資料':'Could not load exam information',
    'not-loaded':language==='zh'?'尚未載入':'Not loaded yet',
    'choose-class':language==='zh'?'請在課程詳情中選擇班別':'Choose your class in Class details',
    'unmatched-class':language==='zh'?'找不到對應的課程班別':'Could not match a class',
    'no-exams':language==='zh'?'來源未列出考試':'No exams listed in available sources'
  };
  if(missing.length){
    footer.hidden=false;footer.classList.add('exam-warning');
    const details=node('details','exam-warning-disclosure');
    details.open=missingExamsOpen;
    details.addEventListener('toggle',()=>{missingExamsOpen=details.open;});
    details.append(node('summary','',language==='zh'?('⚠ '+missing.length+' 門課程考試資料未齊 ▾'):('⚠ '+missing.length+' '+(missing.length===1?'class needs':'classes need')+' exam info ▾')));
    const listItems=node('ul','exam-warning-items');
    for(const item of missing){
      const li=node('li','exam-warning-item');
      const c=student.courses.find(row=>row[8]===item.courseId);
      const title=c?.[language==='zh'?4:3]||item.title;
      if(c){
        const button=node('button','exam-warning-class',title);
        button.type='button';button.addEventListener('click',()=>showLesson(c,offset(monday(selectedDate),c[0])));
        li.append(button);
      }else li.append(node('strong','exam-warning-class',title));
      li.append(node('span','exam-warning-reason',reasons[item.type]));listItems.append(li);
    }
    details.append(listItems);footer.append(details);
  }
}
function renderTasks(){
  updateSyncDots();
  const list=$('todo-list');list.replaceChildren();$('task-count').textContent=tasks.length+' '+(tasks.length===1?t('singleTask'):t('tasks'));
  const state=taskStore.state,busy=liveMode&&(!state.ready||state.saving);
  $('task-input').disabled=busy;$('task-form').querySelector('button[type="submit"]').disabled=busy;
  const errorKey=state.error?.code==='tasks_full'?'tasksFull':['task_changed','task_not_found'].includes(state.error?.code)?'tasksConflict':state.error?.phase==='load'?'tasksLoadFailed':'tasksSaveFailed';
  // Background saves and polls stay silent. Display only failures that need action.
  // Do not show a random connectivity warning when a background poll fails
  // but the student's saved tasks are already loaded. Save failures and
  // initial-load failures still remain actionable with Refresh tasks.
  const taskErrorVisible=liveMode&&!!state.error&&(state.error.phase!=='load'||!state.ready);
  const taskStatus=!liveMode?t('tasksOnly'):taskErrorVisible?t(errorKey):'';
  $('tasks-status').textContent=taskStatus;$('tasks-status').hidden=!taskStatus;
  $('tasks-retry').textContent=t('tasksRetry');$('tasks-retry').hidden=!taskErrorVisible;$('tasks-retry').disabled=state.loading||state.saving;
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
  eventUI.locale();examEditor.locale();
  document.documentElement.lang=language==='zh'?'zh-Hant':'en';
  document.querySelectorAll('[data-i18n]').forEach(el=>{const translated=t(el.dataset.i18n);if(typeof translated==='string')el.textContent=translated;});
  $('language-en').setAttribute('aria-pressed',String(language==='en'));$('language-zh').setAttribute('aria-pressed',String(language==='zh'));$('login-language-en').setAttribute('aria-pressed',String(language==='en'));$('login-language-zh').setAttribute('aria-pressed',String(language==='zh'));
  $('settings-language').value=language;$('task-input').placeholder=t('addPlaceholder');
  for(const [id,key]of [['previous-week','previousWeek'],['next-week','nextWeek'],['choose-date','chooseDate'],['open-settings','settings'],['settings-close-desktop','closeSettings'],['settings-close-mobile','closeSettings'],['close-lesson','closeDetails']]){const control=$(id);control.setAttribute('aria-label',t(key));if(control.hasAttribute('title'))control.title=t(key);}
  document.querySelectorAll('[data-open-mail]').forEach(control=>control.setAttribute('aria-label',t('openMail')));
  $('cool-refresh').title=t('refresh');$('cool-refresh').setAttribute('aria-label',t('refresh'));
  $('page-refresh').title=t('reloadSite');$('page-refresh').setAttribute('aria-label',t('reloadSite'));
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
  $('lesson-section-input').disabled=lessonSaving||!lessonDraft?.sectionsReady;
  $('close-lesson').disabled=lessonSaving;
  $('lesson-save').textContent=t(lessonSaving?'lessonSaving':'lessonSave');
}
function showLesson(c,key){
  if(c[7]){eventUI.open(c[7],key);return;}
  opened={c,key};
  const version=(liveMode?liveCourseOverrides:previewCourseOverrides)[c[8]]?.version||0;
  lessonDraft={id:c[8],language,version,initial:{name:c[language==='zh'?4:3],room:c[5],description:c[9]||''}};
  lessonDraft.initial.serial=liveMode?liveCourseOverrides[c[8]]?.examOffering?.serial||'':'';
  const choice=node('option','',t('automaticSection'));choice.value='';
  $('lesson-section-input').replaceChildren(choice);
  if(lessonDraft.initial.serial){const saved=node('option','',sectionLabel(liveCourseOverrides[c[8]].examOffering));saved.value=lessonDraft.initial.serial;$('lesson-section-input').append(saved);}
  $('lesson-section-input').value=lessonDraft.initial.serial;
  $('lesson-section-status').textContent=liveMode?(language==='zh'?'正在載入臺大課程班別…':'Loading NTU classes…'):(language==='zh'?'登入後可選擇實際修課的班別。':'Sign in to choose your class.');
  $('lesson-name-input').value=lessonDraft.initial.name;$('lesson-room-input').value=lessonDraft.initial.room;
  $('lesson-description-input').value=lessonDraft.initial.description;$('lesson-edit-message').hidden=true;
  lessonSaving=false;lessonControls();populateLesson(c,key);$('lesson-dialog').showModal();
  if(liveMode){
    const cached=liveSectionOptions[lessonDraft.id];
    if(cached?.term===liveTimetable?.term)displayLessonSections(lessonDraft,cached);
    else void loadLessonSections(lessonDraft,liveEpoch);
  }
}
function displayLessonSections(draft,result){
  const autoSelected=result.matching?.status==='student-selected'?null:result.selected;
  const automatic=node('option','',t('automaticSection')+(autoSelected?' · '+sectionLabel(autoSelected):''));automatic.value='';
  $('lesson-section-input').replaceChildren(automatic);
  for(const offering of result.candidates||[]){
    const option=node('option','',sectionLabel(offering)+' · '+offering.serial);option.value=offering.serial;$('lesson-section-input').append(option);
  }
  if(draft.initial.serial&&!result.candidates?.some(c=>c.serial===draft.initial.serial)){
    const missing=node('option','',language==='zh'?'已儲存班別已無法使用 · 請重新選擇':'Saved class unavailable · choose again');missing.value=draft.initial.serial;$('lesson-section-input').append(missing);
  }
  $('lesson-section-input').value=draft.initial.serial;draft.sectionsReady=true;lessonControls();
  $('lesson-section-status').textContent=result.candidates?.length?(language==='zh'?'選擇你實際修課的班別，儲存後更新考試。':'Choose your class. Save changes to update its exam plan.'):(language==='zh'?'本學期未找到符合的公開課程。':'No matching public course was found for this semester.');
}
async function loadLessonSections(draft,epoch){
  try{
    const result=await account.courseOptions(draft.id);
    if(lessonDraft!==draft||epoch!==liveEpoch)return;
    if(result.studentNumber!==liveAccount?.studentNumber){sessionExpired();return;}
    liveSectionOptions[draft.id]={term:liveTimetable?.term||'',selected:result.selected,matching:result.matching,candidates:result.candidates,savedAt:result.savedAt||Date.now()};
    displayLessonSections(draft,result);
  }catch(error){
    if(lessonDraft!==draft||epoch!==liveEpoch)return;
    if(error.status===401){sessionExpired();return;}
    $('lesson-section-status').textContent=language==='zh'?'無法載入班別，請關閉後重開再試。其他欄位仍可編輯。':'Could not load classes. Reopen this lesson to retry; other details can still be edited.';
  }
}
async function saveLessonDetails(reset=false){
  if(!opened||!lessonDraft||lessonSaving||!$('lesson-edit-form').reportValidity())return;
  const draft=lessonDraft,epoch=liveEpoch,body={version:draft.version,...(reset?{reset:true}:{language:draft.language})};
  if(!reset)for(const [key,id]of [['name','lesson-name-input'],['room','lesson-room-input'],['description','lesson-description-input']]){
    const value=$(id).value.trim();if(value!==draft.initial[key])body[key]=key==='name'&&!value?null:value;
  }
  if(!reset&&draft.sectionsReady&&$('lesson-section-input').value!==draft.initial.serial)body.offeringSerial=$('lesson-section-input').value||null;
  if(!reset&&Object.keys(body).length===2){$('lesson-dialog').close();return;}
  lessonSaving=true;liveDetailsRevision++;lessonControls();$('lesson-edit-message').hidden=true;
  try{
    if(liveMode){
      const result=await account.changeCourseDetails(draft.id,body);
      if(epoch!==liveEpoch||lessonDraft!==draft)return;
      if(result.studentNumber!==liveAccount?.studentNumber){sessionExpired();return;}
      liveDetailsRevision++;liveTimetable=result.timetable;liveCourseOverrides=result.courseOverrides||{};liveExamPlans=result.examPlans||{};liveSectionOptions=result.sectionOptions||{};
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
  foregroundRefresh.reset();calendarSignature='';
  liveEpoch++;liveMode=false;livePending=false;initialSyncBusy=false;liveAccount=null;liveCalendar=null;liveTimetable=null;liveCourseOverrides={};liveExamPlans={};liveSectionOptions={};previewCourseOverrides={};liveTimetableInfo='';liveCoolInfo='';coolDone.clear();coolDoneStorageKey='';previewCoolDone.clear();
  if($('lesson-dialog').open)$('lesson-dialog').close();
  if($('settings-dialog').open)$('settings-dialog').close();
  taskStore.bind(null);mailUI.bind(null);announcementStore.bind(null);examStore.bind(null);settingsUI.reset();$('task-input').value='';
  eventUI.reset();examEditor.bind(null);
  student=null;tasks=[];opened=null;counter=0;selectedDate=taipeiToday();activePanel='account';coolView='assignments';setTimetableView('day');coolScroll.reset();
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
    ['cool',coolView==='exams'?!!examStore.entries.size&&!examStore.busy&&![...examStore.entries.values()].some(e=>e.error):coolView==='announcements'?!!announcements.items&&!announcements.error&&!announcements.loading&&!announcements.busy:!!liveCalendar&&liveCalendarOk,coolView==='announcements'?announcements.error?.message:coolView==='exams'?'':liveCoolInfo],
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
  $('live-timetable-refresh').disabled=$('live-cool-refresh').disabled=!liveMode||livePending||initialSyncBusy;
  if(!liveMode)return;
  const messageT=liveTimetableInfo||(liveTimetable?(language==='zh'?'已載入課表':'Saved timetable loaded'):t('liveNoTimetable'));
  const messageC=liveCoolInfo||(liveCalendar?(language==='zh'?'已載入 COOL 行事曆':'COOL calendar loaded'):t('noCalendar'));
  const missing=language==='en'&&liveTimetable?englishNameMissing(liveTimetable):0;
  $('live-timetable-settings-status').textContent=
    messageT+(missing?' · '+t('englishNamesMissing'):'');
  $('live-cool-settings-status').textContent=messageC;
}
function renderLiveAccount(){
  examStore.configure(liveTimetable,liveCourseOverrides,liveExamPlans);
  student=studentFromAccount(liveAccount,liveTimetable,liveCourseOverrides);
  renderAll();dashboardResize.place();
}
function sessionExpired(){
  account.current=null;leavePreview();
  showLoginMessage(language==='zh'?'登入已過期，請重新登入。':'Session expired. Please sign in again.');
}
async function readLiveSnapshots({initializeMissing=false}={}){
  if(!liveMode||!liveAccount)return;
  void taskStore.refresh();
  eventUI.refresh();
  const epoch=liveEpoch,detailsRevision=liveDetailsRevision;
  const [tResult,cResult]=await Promise.allSettled([account.timetable(),account.coolCalendar()]);
  if(epoch!==liveEpoch||!liveMode)return;
  if(tResult.status==='fulfilled'&&detailsRevision===liveDetailsRevision&&!lessonSaving){
    if(tResult.value.studentNumber!==liveAccount.studentNumber){sessionExpired();return;}
    foregroundRefresh.record('timetable',tResult.value);
    liveCourseOverrides=tResult.value.courseOverrides||{};
    liveTimetable=tResult.value.timetable||null;liveExamPlans=tResult.value.examPlans||{};liveSectionOptions=tResult.value.sectionOptions||{};liveTimetableOk=tResult.value.connectionStatus==='authorized';
    liveTimetableInfo=tResult.value.connectionStatus==='reconnect_required'
      ?(language==='zh'?'請重新連結課表，已保留上次儲存的課程。':'Timetable reconnect required. Last saved classes are preserved.'):'';
  }else if(tResult.status==='rejected'){
    if(tResult.reason?.status===401){sessionExpired();return;}
    liveTimetableInfo=liveNotice(tResult.reason);liveTimetableOk=false;
  }
  if(cResult.status==='fulfilled'){
    if(cResult.value.studentNumber!==liveAccount.studentNumber){sessionExpired();return;}
    foregroundRefresh.record('cool',cResult.value);
    liveCalendar=cResult.value.calendar||null;liveCalendarOk=cResult.value.connectionStatus==='authorized';
    liveCoolInfo=cResult.value.connectionStatus==='reconnect_required'
      ?(language==='zh'?'請重新連結 COOL，已保留上次儲存的期限。':'COOL reconnect required. Last saved deadlines are preserved.'):'';
  }else{
    if(cResult.reason?.status===401){sessionExpired();return;}
    liveCoolInfo=liveNotice(cResult.reason);liveCalendarOk=false;
  }
  renderLiveAccount();
  checkLiveSources();
  if(initializeMissing && epoch===liveEpoch && liveMode){
    const needed=missingInitialSources(
      tResult.status==='fulfilled'?tResult.value:null,
      cResult.status==='fulfilled'?cResult.value:null
    );
    if(needed.timetable||needed.cool)void initializeLiveSources(needed,epoch,detailsRevision);
  }
}
// New accounts use the NTU credentials already saved by the authenticated backend.
// Syncs are independent and do not block the first dashboard render.
async function initializeLiveSources(needed,epoch,detailsRevision){
  if(initialSyncBusy||epoch!==liveEpoch||!liveMode)return;
  initialSyncBusy=true;
  const active=()=>epoch===liveEpoch&&liveMode&&account.current?.studentNumber===liveAccount?.studentNumber;
  updateLiveStatus();
  try{
    await syncInitialSources(account,needed,(kind,state,payload)=>{
      if(!active())return;
      if(state==='syncing'){
        if(kind==='timetable')liveTimetableInfo=language==='zh'?'正在同步課表…':'Connecting timetable…';
        else liveCoolInfo=language==='zh'?'正在同步 COOL…':'Connecting COOL…';
      }else if(state==='connected'){
        if(payload.studentNumber!==liveAccount.studentNumber){sessionExpired();return;}
        foregroundRefresh.record(kind,payload);
        if(kind==='timetable'){
          if(payload.studentNumber!==liveAccount.studentNumber){sessionExpired();return;}
          if(detailsRevision===liveDetailsRevision&&!lessonSaving){
            liveTimetable=payload.timetable||liveTimetable;
            liveCourseOverrides=payload.courseOverrides||liveCourseOverrides;liveExamPlans=payload.examPlans||{};liveSectionOptions=payload.sectionOptions||{};
          }else if(!lessonSaving)void readLiveSnapshots();
          liveTimetableOk=true;
          liveTimetableInfo=language==='zh'?'課表已同步':'Timetable connected';
        }else{
          liveCalendar=payload.calendar||liveCalendar;
          liveCalendarOk=true;
          liveCoolInfo=language==='zh'?'COOL 已同步':'COOL connected';
          // Announcements already refresh on opening; give a first-time COOL
          // connection another chance if its earlier announcement check failed.
          if(announcementStore.error&&!announcementStore.busy)void announcementStore.refresh();
        }
        renderLiveAccount();
      }else if(state==='failed'){
        if(payload?.status===401){sessionExpired();return;}
        if(kind==='timetable')liveTimetableInfo=liveNotice(payload);
        else liveCoolInfo=liveNotice(payload);
      }
      updateLiveStatus();
    },active);
  }finally{
    if(active()){
      initialSyncBusy=false;
      updateLiveStatus();
    }
  }
}
function startLive(current,{firstSignIn=false}={}){
  if(!current?.studentNumber||!current?.csrfToken)throw Error('Campus Week returned an invalid session.');
  foregroundRefresh.reset();
  liveMode=true;liveEpoch++;initialSyncBusy=false;liveAccount=current;liveTimetable=null;liveCalendar=null;liveCourseOverrides={};liveExamPlans={};liveSectionOptions={};coolDone.clear();coolDoneStorageKey='';previewCoolDone.clear();
  liveTimetableInfo='';liveCoolInfo='';tasks=[];counter=0;coolView='assignments';coolScroll.reset();
  $('task-input').value='';taskStore.bind(current);mailUI.bind(current);examStore.bind(current);examEditor.bind(current);
  selectedDate=taipeiToday();opened=null;activePanel='account';setTimetableView('day');
  $('login-screen').hidden=true;$('app-screen').hidden=false;
  
  renderLiveAccount();announcementStore.bind(current);eventUI.reset(current);restoreCoolChecks(current,liveEpoch);void readLiveSnapshots({initializeMissing:firstSignIn});
  if(new URL(location.href).searchParams.get('mail')==='1'){mailUI.open();const url=new URL(location.href);url.searchParams.delete('mail');history.replaceState(null,'',url.pathname+url.search+url.hash);}
}
function showLoginMessage(message=''){
  const status=$('live-login-status');status.textContent=message;status.hidden=!message;
}
async function restoreLive(){
  const epoch=liveEpoch;
  $('login-screen').dataset.authCheck='checking';
  showLoginMessage();
  try{
    const current=await account.restore();
    if(epoch!==liveEpoch){if(!liveMode&&account.current===current)account.current=null;return;}
    if(current)startLive(current);
  }catch(e){
    // A failed session check must not trap students behind the loading screen.
    showLoginMessage(language==='zh'?'無法檢查登入狀態，請直接登入。':'Could not check your session. You can sign in.');
  }finally{
    $('login-screen').dataset.authCheck='ready';
  }
}
function checkLiveSources(){
  if(!liveMode||livePending||initialSyncBusy||lessonSaving||document.hidden||!document.hasFocus()||navigator.onLine===false)return;
  const which=foregroundRefresh.next();if(which)void syncLive(which,{automatic:true});
}
async function syncLive(which,{automatic=false}={}){
  if(!liveMode||!liveAccount||livePending||initialSyncBusy||lessonSaving)return;
  const epoch=liveEpoch,detailsRevision=liveDetailsRevision;livePending=true;foregroundRefresh.attempt(which);
  if(which==='timetable'){liveTimetableOk=false;liveTimetableInfo=language==='zh'?'正在檢查臺大 ePortfolio…':'Checking NTU ePortfolio…';}
  else{liveCalendarOk=false;liveCoolInfo=language==='zh'?'正在檢查 COOL 行事曆…':'Checking your COOL calendar…';}
  updateLiveStatus();
  try{
    const result=which==='timetable'
      ?await account.syncTimetable(undefined,undefined,!automatic)
      :await account.syncCoolCalendar(undefined,undefined,!automatic);
    if(epoch!==liveEpoch)return;
    if(result.studentNumber!==liveAccount.studentNumber){sessionExpired();return;}
    foregroundRefresh.record(which,result);
    if(which==='timetable'){if(detailsRevision===liveDetailsRevision&&!lessonSaving){liveCourseOverrides=result.courseOverrides||{};liveExamPlans=result.examPlans||{};liveSectionOptions=result.sectionOptions||{};liveTimetable=result.timetable||liveTimetable;}else if(!lessonSaving)void readLiveSnapshots();liveTimetableOk=true;liveTimetableInfo=language==='zh'?'課表已更新':'Timetable updated';}
    else{liveCalendar=result.calendar||liveCalendar;liveCalendarOk=true;liveCoolInfo=language==='zh'?'COOL 行事曆已更新':'COOL calendar updated';}
    renderLiveAccount();
  }catch(e){
    if(epoch!==liveEpoch)return;
    if(e.status===401){sessionExpired();return;}
    foregroundRefresh.fail(which,e);
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
    startLive(current,{firstSignIn:true});
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
  foregroundRefresh.reset();
  liveMode=false;liveEpoch++;liveAccount=null;liveCalendar=null;liveTimetable=null;liveCourseOverrides={};liveExamPlans={};liveSectionOptions={};previewCourseOverrides={};coolDone.clear();coolDoneStorageKey='';previewCoolDone.clear();account.current=null;
  taskStore.bind(null);mailUI.bind(null);announcementStore.bind(null);examStore.bind(null);$('task-input').value='';
  eventUI.reset();examEditor.bind(null);
  const key=$('preview-profile').value;if(!Object.hasOwn(profiles,key))return;
  previewCourseOverrides={};student={...profiles[key],courses:previewCourseRows(profiles[key])};tasks=student.tasks.map(text=>({id:++counter,text,done:false}));
  selectedDate=taipeiToday();activePanel='account';opened=null;coolView='assignments';setTimetableView('day');coolScroll.reset();
  $('login-screen').hidden=true;$('app-screen').hidden=false;renderAll();dashboardResize.place();$('open-settings').focus();
}
function chooseLanguage(value){language=value;try{localStorage.setItem('campus-week:language',value);}catch{}renderAll();}
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
$('page-refresh').addEventListener('click',()=>window.location.reload());
$('previous-week').addEventListener('click',()=>{selectedDate=offset(selectedDate,-7);renderCalendar();});
$('next-week').addEventListener('click',()=>{selectedDate=offset(selectedDate,7);renderCalendar();});
$('jump-today').addEventListener('click',()=>{selectedDate=taipeiToday();renderCalendar();});
$('choose-date').addEventListener('change',e=>{try{dateFor(e.target.value);selectedDate=e.target.value;renderCalendar();}catch{$('choose-date').value=selectedDate;}});
$('cool-refresh').addEventListener('click',()=>{
  if(liveMode){if(coolView==='exams')void examStore.refresh(true);else if(coolView==='announcements')void announcementStore.refresh();else void syncLive('cool');return;}
  renderDeadlines();$('toast').textContent=t('previewRefresh');
});
document.querySelectorAll('[data-cool-view]').forEach(button=>button.addEventListener('click',()=>{
  coolView=button.dataset.coolView;examStore.active=liveMode&&coolView==='exams';renderDeadlines();
  if(examStore.active)void examStore.refresh();
}));
document.querySelector('.cool-view-switch').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const tabs=[...document.querySelectorAll('[data-cool-view]')],index=tabs.findIndex(tab=>tab.dataset.coolView===coolView);
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[next].click();tabs[next].focus();
});
$('task-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!student)return;const content=$('task-input').value.trim();if(!content)return;
  if(liveMode){
    const epoch=liveEpoch,input=$('task-input'),focusWasInForm=$('task-form').contains(document.activeElement);
    const saved=await taskStore.add(content);if(epoch!==liveEpoch)return;
    if(saved&&input.value.trim()===content)input.value='';
    if(focusWasInForm&&(!document.activeElement||document.activeElement===document.body||document.activeElement===input))input.focus();
    return;
  }
  tasks.unshift({id:++counter,text:content,done:false});$('task-input').value='';renderTasks();
});
$('tasks-retry').addEventListener('click',()=>{if(liveMode)void taskStore.refresh();});
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
setInterval(()=>{if(student&&!document.hidden){renderBanner();renderCalendar();if(liveMode&&navigator.onLine!==false){void taskStore.refresh();eventUI.refresh();checkLiveSources();}}},30000);
window.addEventListener('online',()=>{if(liveMode&&!document.hidden){void taskStore.refresh();eventUI.refresh();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&liveMode&&!livePending)readLiveSnapshots();});
window.addEventListener('focus',checkLiveSources);
window.addEventListener('online',()=>{updateSyncDots();checkLiveSources();});
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
