import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {createSettings} from '../public/skeleton/settings.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(run){
 const {window,document}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.getAttribute('data-value')||this.querySelector('option')?.value||'';},set(value){this.setAttribute('data-value',value);},configurable:true});
 window.HTMLElement.prototype.focus=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
 const globals={window,document,matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem(){return null;},setItem(){}},setInterval:()=>0};const previous={};for(const[k,v]of Object.entries(globals)){previous[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 let resolvePreferences;const requests=[];const account={request:async(path,options)=>{requests.push({path,options});if(path==='preferences'&&!options)return new Promise(resolve=>{resolvePreferences=resolve;});if(path==='preferences')return {studentNumber:'b12345678',version:1};if(path.startsWith('widgets/'))return {studentNumber:'b12345678',widget:{streak:9,todayProgress:3,todayGoal:10,unit:5}};}};
 const settings=createSettings({account}),student={id:'b12345678',courses:[[0,'09:10','10:00','Math','數學','A','M',null,'math']]};
 try{await run({window,document,settings,student,requests,resolvePreferences:value=>resolvePreferences(value)});}finally{for(const[k,v]of Object.entries(previous)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
}
test('preview settings update statistics, change the actual theme, and keep the active settings sections visible',async()=>fixture(async({document,settings,student,requests})=>{
 settings.update({student,liveMode:false,language:'en',timetable:null});
 assert.deepEqual(['settings-appearance-title','settings-stats-title','settings-install-title','settings-extras-title'].map(id=>document.getElementById(id).textContent),['Appearance','Your week','Install Campus Week','Hanzi Steps widget']);
 assert.equal(document.querySelector('[data-theme-choice="dark"] strong').textContent,'Dark');
 assert.equal(document.getElementById('account-name').textContent,'');
 assert.equal(document.getElementById('stat-courses').textContent,'1');assert.equal(document.getElementById('stat-sessions').textContent,'1');assert.equal(document.getElementById('stat-hours').textContent,'0.8');
 document.querySelector('[data-theme-choice="dark"]').click();assert.equal(document.body.dataset.theme,'dark');assert.equal(document.querySelector('[data-theme-choice="dark"]').getAttribute('aria-pressed'),'true');assert.equal(requests.length,0);
 assert.deepEqual([...document.querySelectorAll('[data-settings-panel][hidden]')].map(e=>e.dataset.settingsPanel),['widgets']);assert.equal(document.getElementById('dashboard-hanzi').hidden,true);
 const toggle=document.getElementById('settings-hanzi-enabled');toggle.checked=true;toggle.dispatchEvent(new window.Event('change'));assert.equal(toggle.checked,false);assert.match(document.getElementById('settings-hanzi-status').textContent,/username/);
}));
test('a preference response from the previous account cannot change the new account theme or widget',async()=>fixture(async({document,settings,student,resolvePreferences})=>{
 settings.update({student,liveMode:true,language:'en',timetable:null});settings.update({student:{id:'PREVIEW-B',courses:[]},liveMode:false,language:'en',timetable:null});
 resolvePreferences({studentNumber:student.id,version:2,preferences:{theme:'dark',hanziEnabled:true,hanziUsername:'private_user'}});await tick();assert.equal(document.body.dataset.theme,'light');assert.equal(document.getElementById('account-id').textContent,'PREVIEW-B');assert.equal(document.getElementById('dashboard-hanzi').hidden,true);assert.equal(document.getElementById('settings-hanzi-username').value,'');
}));
test('saved Hanzi preferences stay hidden without widget requests and survive theme changes',async()=>fixture(async({document,settings,student,resolvePreferences,requests})=>{
 settings.update({student,liveMode:true,language:'en',timetable:null});resolvePreferences({studentNumber:student.id,version:2,preferences:{theme:'dark',hanziEnabled:true,hanziUsername:'test_user'}});await tick();await tick();
 assert.equal(document.body.dataset.theme,'dark');assert.equal(document.getElementById('dashboard-hanzi').hidden,true);assert.equal(document.getElementById('dashboard-hanzi').textContent,'');assert.equal(document.querySelector('[data-settings-tab="widgets"]').hidden,true);assert.equal(document.querySelector('[data-settings-panel="widgets"]').hidden,true);assert.equal(requests.some(r=>r.path.startsWith('widgets/')),false);document.querySelector('[data-theme-choice="light"]').click();await tick();const saved=JSON.parse(requests.find(r=>r.path==='preferences'&&r.options)?.options.body);assert.equal(saved.hanziEnabled,true);assert.equal(saved.hanziUsername,'test_user');settings.reset();assert.equal(document.getElementById('dashboard-hanzi').hidden,true);assert.equal(document.getElementById('settings-hanzi-username').value,'');
}));

test('settings labels stay concise in Traditional Chinese',async()=>fixture(async({document,settings,student})=>{
 settings.update({student,liveMode:false,language:'zh',timetable:null});
 assert.deepEqual(['settings-appearance-title','settings-stats-title','settings-install-title','settings-extras-title'].map(id=>document.getElementById(id).textContent),['外觀','每週課表','安裝 Campus Week','Hanzi Steps 小工具']);
 assert.equal(document.querySelector('[data-theme-choice="dark"] strong').textContent,'深色');
}));

test('Garden switches the shared interface without replacing controls or leaving decorations behind',async()=>fixture(async({document,settings,student,requests})=>{
 settings.update({student,liveMode:false,language:'en',timetable:null});
 const controls=['schedule-list','task-form','cool-list','mail-dialog'].map(id=>document.getElementById(id));
 for(let i=0;i<8;i++){
  document.querySelector('[data-theme-choice="garden"]').click();
  assert.equal(document.body.dataset.theme,'garden');
  assert.equal(document.querySelectorAll('.garden-scenery').length,1);
  assert.equal(document.querySelectorAll('.garden-mail-decoration').length,1);
  assert.equal(document.querySelector('.garden-scenery').getAttribute('aria-hidden'),'true');
  for(const control of controls)assert.equal(document.getElementById(control.id),control);
  document.querySelector('[data-theme-choice="light"]').click();
  assert.equal(document.body.dataset.theme,'light');
  assert.equal(document.querySelectorAll('.garden-scenery,.garden-mail-decoration,.garden-flight-layer').length,0);
 }
 assert.equal(requests.length,0);
 settings.update({student,liveMode:false,language:'zh',timetable:null});
 assert.equal(document.querySelector('[data-theme-choice="garden"] strong').textContent,'花園');
}));


test('Appearance offers Daylight, Dark, Garden and Retro console',async()=>fixture(async({document,settings,student})=>{
 settings.update({student,liveMode:false,language:'en',timetable:null});
 assert.deepEqual([...document.querySelectorAll('[data-theme-choice]')].map(e=>e.dataset.themeChoice),['light','dark','garden','retro']);
 assert.deepEqual([...document.querySelector('#theme-select').options].map(e=>e.value),['light','dark','garden','retro']);
}));

test('Retro reuses controls and restores the exact layout repeatedly, including Garden transitions',async()=>fixture(async({document,settings,student,requests})=>{
 settings.update({student,liveMode:false,language:'en',timetable:null});
 const app=document.getElementById('app-screen'),before=app.innerHTML;
 const controls=['day-strip','open-settings','task-form','cool-list','schedule-list','mail-dialog','cool-exams-tab'].map(id=>document.getElementById(id));
 let submissions=0;document.getElementById('task-form').addEventListener('submit',()=>submissions++);
 for(let i=0;i<5;i++){
  document.querySelector('[data-theme-choice="retro"]').click();
  assert.equal(document.body.dataset.theme,'retro');
  assert.equal(document.querySelectorAll('.retro-scope').length,1);
  assert.equal(document.querySelector('.retro-scope').hasAttribute('tabindex'),false);
  assert.equal(document.querySelector('.workspace>.week-section #day-strip'),controls[0]);
  assert.ok(document.querySelector('.side-column .shortcuts-panel'));
  assert.ok(document.querySelector('.schedule-column>.week-toolbar'));
  for(const control of controls)assert.equal(document.getElementById(control.id),control);
  document.getElementById('task-form').dispatchEvent(new document.defaultView.Event('submit'));
  document.querySelector('[data-theme-choice="light"]').click();
  assert.equal(app.innerHTML,before);
 }
 assert.equal(submissions,5);assert.equal(requests.length,0);
 document.querySelector('[data-theme-choice="retro"]').click();
 document.querySelector('[data-theme-choice="garden"]').click();
 assert.equal(document.querySelectorAll('.retro-scope,.retro-hardware').length,0);
 assert.equal(document.querySelectorAll('.garden-scenery').length,1);
 document.querySelector('[data-theme-choice="retro"]').click();
 assert.equal(document.querySelectorAll('.garden-scenery,.garden-mail-decoration,.garden-flight-layer').length,0);
 document.querySelector('[data-theme-choice="dark"]').click();
 assert.equal(document.querySelectorAll('.retro-scope,.retro-hardware').length,0);
}));
