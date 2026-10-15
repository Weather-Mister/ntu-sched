import test from 'node:test';
import assert from 'node:assert/strict';
import {missingInitialSources,syncInitialSources} from '../public/skeleton/initial-sync.mjs';
import {readFileSync} from 'node:fs';

test('only missing connections qualify for initial setup, not authorized or reconnect-required ones',()=>{
  assert.deepEqual(missingInitialSources({connectionStatus:'not_connected'},{connectionStatus:'authorized'}),{timetable:true,cool:false});
  assert.deepEqual(missingInitialSources({connectionStatus:'authorized'},{connectionStatus:'not_connected'}),{timetable:false,cool:true});
  assert.deepEqual(missingInitialSources({connectionStatus:'reconnect_required'},{connectionStatus:'not_connected'}),{timetable:false,cool:true});
  assert.deepEqual(missingInitialSources(null,null),{timetable:false,cool:false});
});

test('first-time setup syncs timetable and COOL independently using saved credentials',async()=>{
  const calls=[],events=[];
  const account={
    async syncTimetable(...args){calls.push(['timetable',args]);return {studentNumber:'b12345678',timetable:{term:'115-1'}};},
    async syncCoolCalendar(...args){calls.push(['cool',args]);return {calendar:{assignments:[]}};}
  };
  await syncInitialSources(account,{timetable:true,cool:true},(kind,state,payload)=>events.push({kind,state,payload}));
  assert.deepEqual(calls.map(x=>x[0]).sort(),['cool','timetable']);
  assert.ok(calls.every(x=>x[1].length===0),'initial sync must rely on saved credentials, not force flags or plaintext passwords');
  assert.deepEqual(events.filter(x=>x.state==='connected').map(x=>x.kind).sort(),['cool','timetable']);
});

test('a failing COOL login never blocks timetable and surfaces an independent error',async()=>{
  const events=[],error=new Error('COOL is unavailable');
  await syncInitialSources({
    async syncTimetable(){return {timetable:{sessions:[]}};},
    async syncCoolCalendar(){throw error;}
  },{timetable:true,cool:true},(kind,state,payload)=>events.push([kind,state,payload]));
  assert.ok(events.some(([kind,state])=>kind==='timetable'&&state==='connected'));
  assert.ok(events.some(([kind,state,value])=>kind==='cool'&&state==='failed'&&value===error));
});

test('returning students make no extra sync calls when sources are already connected',async()=>{
  let calls=0;
  await syncInitialSources({syncTimetable:()=>{calls++;},syncCoolCalendar:()=>{calls++;}},{timetable:false,cool:false},()=>{});
  assert.equal(calls,0);
});

test('late sync responses from another account cannot update the dashboard',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  let active=true;const updates=[];
  const p=syncInitialSources({async syncTimetable(){await gate;return {timetable:{}};}},{timetable:true,cool:false},(kind,state)=>updates.push([kind,state]),()=>active);
  active=false;release();await p;
  assert.deepEqual(updates,[]);
});

test('live sign-in invokes first-time setup after loading saved snapshots, not on every restored session',()=>{
  const js=readFileSync(new URL('../public/skeleton/app.mjs',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/skeleton/index.html',import.meta.url),'utf8');
  assert.match(js,/startLive\(current,\{firstSignIn:true\}\)/);
  assert.match(js,/if\(current\)startLive\(current\)/);
  assert.match(js,/readLiveSnapshots\(\{initializeMissing:firstSignIn\}\)/);
  assert.match(js,/if\(initializeMissing && epoch===liveEpoch && liveMode\)/);
  assert.match(js,/syncInitialSources\(account,needed/);
  assert.match(js,/initialSyncBusy\|\|lessonSaving/);
  assert.match(html,/id="initial-sync-notice"[^>]*role="status"/);
});
