import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {withListFocus,loadingCard} from '../public/skeleton/ui-state.mjs';

test('list updates preserve scroll and keyboard focus through a disabled saving state without stealing focus',()=>{
 const {document}=parseHTML('<html><body><div id="list"></div><input id="outside"></body></html>'),list=document.getElementById('list');
 let active=document.body;Object.defineProperty(document,'activeElement',{get:()=>active});
 function draw(disabled=false){const button=document.createElement('button');button.dataset.uiFocus='task:1';button.disabled=disabled;button.focus=()=>{if(!button.disabled)active=button;};list.replaceChildren(button);return button;}
 active=draw();list.scrollTop=83;withListFocus(list,()=>{draw();list.scrollTop=0;});assert.equal(active,list.firstChild);assert.equal(list.scrollTop,83);
 withListFocus(list,()=>draw(true));active=document.body;withListFocus(list,()=>draw());assert.equal(active,list.firstChild);
 withListFocus(list,()=>draw(true));active=document.getElementById('outside');withListFocus(list,()=>draw());assert.equal(active,document.getElementById('outside'));
});

test('loading cards announce loading and keep decorative placeholders out of accessibility text',()=>{
 const {document}=parseHTML('<html><body></body></html>');const card=loadingCard(document,'Loading your timetable…');
 assert.equal(card.getAttribute('role'),'status');assert.equal(card.textContent,'Loading your timetable…');assert.equal(card.querySelector('.ui-loading-lines').getAttribute('aria-hidden'),'true');
});

test('overlapping account snapshot reads share one request and finish the loading state',async()=>{
 const source=readFileSync(new URL('../public/skeleton/app.mjs',import.meta.url),'utf8'),code=source.slice(source.indexOf('async function readLiveSnapshots('),source.indexOf('// New accounts use'));
 let finish,calls=0,rendered=0;const result=new Promise(resolve=>{finish=resolve;});
 const context={liveMode:true,liveAccount:{studentNumber:'a'},liveEpoch:1,liveDetailsRevision:0,lessonSaving:false,language:'en',snapshotLoads:new Map(),liveSnapshotsLoading:false,taskStore:{refresh(){}},eventUI:{refresh(){}},updateLiveStatus(){},foregroundRefresh:{record(){}},account:{timetable(){calls++;return result;},coolCalendar(){calls++;return result;}},renderLiveAccount(){rendered++;},checkLiveSources(){},liveNotice:error=>error.message,sessionExpired(){assert.fail('unexpected account change');}};
 vm.createContext(context);vm.runInContext(code,context);
 const first=vm.runInContext('readLiveSnapshots()',context),second=vm.runInContext('readLiveSnapshots()',context);assert.equal(calls,2);assert.equal(context.liveSnapshotsLoading,true);
 finish({studentNumber:'a',connectionStatus:'authorized'});await Promise.all([first,second]);assert.equal(rendered,1);assert.equal(context.liveSnapshotsLoading,false);assert.equal(context.snapshotLoads.size,0);
});
