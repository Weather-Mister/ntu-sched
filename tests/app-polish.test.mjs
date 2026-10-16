import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import worker from '../src/worker.mjs';
import {AccountTasks} from '../public/account-tasks.mjs';
import {academicWeek} from '../public/academic-calendar.mjs';
import {ForegroundRefresh} from '../public/skeleton/foreground-refresh.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('the main URL serves the full application with resolving local assets and production branding',()=>{
 const {document}=parseHTML(read('public/index.html'));
 assert.equal(document.title,'Campus Week');
 assert.ok(document.getElementById('login-screen'));
 assert.ok(document.getElementById('app-screen'));
 assert.doesNotMatch(document.querySelector('meta[name="description"]').content,/preview|prototype|skeleton/i);
 assert.doesNotMatch(document.querySelector('.topbar .eyebrow').textContent,/preview|prototype|skeleton/i);
 assert.equal(existsSync(new URL('../public/skeleton/index.html',import.meta.url)),false);
 for(const element of document.querySelectorAll('script[src],link[href]')){
  const url=element.getAttribute('src')||element.getAttribute('href');
  assert.ok(url.startsWith('/'),url+' must resolve from the main URL');
  assert.ok(existsSync(new URL('../public'+url,import.meta.url)),url+' must exist');
 }
});
test('all legacy app entry URLs redirect to the main URL while preserving queries',async()=>{
 for(const path of ['/skeleton','/skeleton/','/skeleton/index.html']){
  const response=await worker.fetch(new Request('https://campus.example'+path+'?mail=1'),{});
  assert.equal(response.status,308);assert.equal(response.headers.get('Location'),'https://campus.example/?mail=1');
 }
 let forwarded;
 const response=await worker.fetch(new Request('https://campus.example/'),{ASSETS:{fetch:request=>{forwarded=request.url;return new Response('main app');}}});
 assert.equal(await response.text(),'main app');assert.equal(forwarded,'https://campus.example/');
 const config=JSON.parse(read('wrangler.jsonc'));
 for(const path of ['/skeleton','/skeleton/','/skeleton/index.html'])assert.ok(config.assets.run_worker_first.includes(path));
});
test('installed app identity remains stable while launch URL and scope move to root',()=>{
 const manifest=JSON.parse(read('public/skeleton/manifest.webmanifest'));
 assert.equal(manifest.id,'/skeleton/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
});
test('notification clicks focus the main app and cold launches use the main URL',async()=>{
 const handlers={},opened=[],messages=[];let focused=0,tabs=[];
 const self={location:{origin:'https://campus.example'},addEventListener:(name,fn)=>handlers[name]=fn,
  clients:{matchAll:async()=>tabs,openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(read('public/mail-sw.js'),{self,URL});
 async function click(){let promise;handlers.notificationclick({notification:{close(){}},waitUntil(p){promise=p;}});await promise;}
 await click();assert.deepEqual(opened,['/?mail=1']);
 tabs=[{url:'https://unrelated.example/',focus:async()=>assert.fail('wrong origin')},{url:'https://campus.example/',focus:async()=>focused++,postMessage:value=>messages.push(value)}];
 await click();assert.equal(focused,1);assert.equal(opened.length,1);assert.equal(messages[0].type,'open-mail');
 tabs=[{url:'https://campus.example/skeleton/',focus:async()=>focused++,postMessage:value=>messages.push(value)}];
 await click();assert.equal(focused,2);assert.equal(opened.length,1);
});
test('unchanged task and event polling emits no redraw, while real changes and account switches still do',async()=>{
 const current={studentNumber:'a'};let rows=[{id:'one',version:1,text:'Study',done:false}],redraws=0,expired=0;
 const client={current,tasks:async()=>({studentNumber:'a',tasks:structuredClone(rows)})};
 const store=new AccountTasks(client,{onChange:()=>redraws++,onSessionExpired:()=>expired++});
 store.bind(current);await new Promise(resolve=>setImmediate(resolve));
 redraws=0;await store.refresh();assert.equal(redraws,0);
 rows[0].done=true;rows[0].version++;await store.refresh();assert.equal(redraws,1);assert.equal(store.state.items[0].done,true);
 client.tasks=async()=>({studentNumber:'other',tasks:[{text:'Private'}]});await store.refresh();assert.equal(expired,1);assert.deepEqual(store.state.items,[]);
});
test('foreground refresh follows provider intervals, honors retry delays, and pauses rejected credentials',()=>{
 let time=1_000_000;const checks=new ForegroundRefresh(()=>time);
 checks.record('cool',{calendar:{syncedAt:time},checkIntervalMs:300000,connectionStatus:'authorized'});
 checks.record('timetable',{timetable:{syncedAt:time},connectionStatus:'authorized'});
 assert.equal(checks.next(),null);time+=300000;assert.equal(checks.next(),'cool');assert.equal(checks.next(),null);
 checks.fail('cool',{retryAfterSeconds:600});time+=599999;assert.equal(checks.next(),null);time++;assert.equal(checks.next(),'cool');
 checks.fail('cool',{code:'cool_credentials_required'});time+=5*86400000;assert.equal(checks.next(),'timetable');assert.equal(checks.next(),null);
 checks.record('cool',{calendar:{syncedAt:time},connectionStatus:'authorized'});time+=300000;assert.equal(checks.next(),'cool');
 checks.reset();assert.equal(checks.next(),null);
});
test('clock updates preserve schedule nodes and focus targets while updating lesson state',()=>{
 const {document}=parseHTML(read('public/index.html')),source=read('public/skeleton/app.mjs');
 const day=86400000,iso=d=>d.toISOString().slice(0,10),offset=(s,n)=>iso(new Date(Date.parse(s+'T00:00:00Z')+n*day));
 const words={days:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],shortDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],live:'Now',completed:'Finished'};
 const row=[4,'09:00','10:00','Math','數學','Room A','M',null,'math'];
 const context={document,$:id=>document.getElementById(id),student:{id:'a',courses:[row]},language:'en',selectedDate:'2026-10-16',timetableView:'day',liveTimetable:null,academicWeek,eventUI:{events:()=>[]},courseOffering:()=>null,taipeiToday:()=> '2026-10-16',offset,monday:s=>offset(s,-4),weekday:()=>4,dateFor:s=>new Date(s+'T00:00:00Z'),pretty:s=>s,longDate:s=>s,scheduleOn:()=>[row],eventsOn:()=>[],t:key=>words[key]||key,liveMode:false,scheduleAccent:()=>1,lessonState:()=> 'Now',lessonPeriod:()=>'',renderWeekTimetable(){},requestAnimationFrame(){},fitLessonCards(){},node(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf("let calendarSignature='';"),source.indexOf('const announcements=')),context);
 vm.runInContext('renderCalendar()',context);const button=document.querySelector('.lesson'),dayButton=document.querySelector('.day-button');assert.ok(button.classList.contains('live'));assert.equal(document.getElementById('week-range').textContent,'Week 6');assert.match(document.getElementById('week-range').title,/Oct 12–18/);
 context.lessonState=()=> 'Finished';vm.runInContext('renderCalendar()',context);
 assert.equal(document.querySelector('.lesson'),button);assert.equal(document.querySelector('.day-button'),dayButton);assert.equal(button.classList.contains('live'),false);assert.equal(button.classList.contains('completed'),true);
 row[3]='Renamed';vm.runInContext('renderCalendar()',context);assert.notEqual(document.querySelector('.lesson'),button);assert.match(document.querySelector('.lesson').textContent,/Renamed/);
});

test('academic weeks use NTU semester starts, Monday navigation, and vacation fallbacks',()=>{
 assert.deepEqual(academicWeek('2026-10-16','115-1'),{term:'115-1',week:6,flexible:false});
 assert.equal(academicWeek('2026-10-12','115-1').week,6);
 assert.equal(academicWeek('2026-10-18','115-1').week,6);
 assert.equal(academicWeek('2026-10-19','115-1').week,7);
 assert.equal(academicWeek('2026-09-07','115-1').week,1);
 assert.equal(academicWeek('2026-12-21','115-1').week,16);
 assert.equal(academicWeek('2026-12-28','115-1').flexible,true);
 assert.equal(academicWeek('2027-01-04','115-1'),null);
 assert.equal(academicWeek('2027-02-22','115-2').week,1);
 assert.equal(academicWeek('2027-02-22','115-1'),null);
 assert.equal(academicWeek('2026-09-06'),null);
 assert.equal(academicWeek('2026-10-16','unknown'),null);
 assert.equal(academicWeek('2026-02-30'),null);
});
