import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import worker from '../src/worker.mjs';
import { digest,randomToken } from '../src/security.mjs';
import { normalizeEvent,eventsOn,nextEventDates } from '../public/event-model.mjs';
import { AccountEvents } from '../public/account-events.mjs';
const APP='https://campus.example';
function env(){
  const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const DB={prepare(sql){const s=sqlite.prepare(sql);let args=[];return{bind(...a){args=a;return this;},async first(){return s.get(...args)||null;},async all(){return{results:s.all(...args)};},async run(){return{meta:s.run(...args)};}};}};
  return{DB,sqlite,APP_ORIGIN:APP};
}
async function identity(e,number='b12345678',id=crypto.randomUUID()){
  e.sqlite.prepare('INSERT OR IGNORE INTO students VALUES(?,?,?)').run(id,number,1);const token=randomToken(),csrf=randomToken();e.sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(await digest(token),id,csrf,1,Math.floor(Date.now()/1000)+3600);return{id,number,token,csrf};
}
async function request(e,owner,path='events',{method='GET',body,csrf=owner?.csrf,origin=APP}={}){
  const headers=new Headers({Origin:origin});if(owner)headers.set('Cookie','__Host-campus_week='+owner.token);if(csrf)headers.set('X-CSRF-Token',csrf);if(body)headers.set('Content-Type','application/json');const result=await worker.fetch(new Request(APP+'/api/'+path,{method,headers,body:body?JSON.stringify(body):undefined}),e);return{status:result.status,body:await result.json()};
}
const values=(extra={})=>({title:'Study group',location:'Main Library',notes:'Bring notes',frequency:'once',date:'2026-10-15',until:null,days:[],start:780,end:840,...extra});
const add=(e,a,data=values(),id=crypto.randomUUID())=>request(e,a,'events',{method:'POST',body:{id,...data}});
test('one-time events appear only on their exact date; weekly events respect weekdays and inclusive dates',()=>{
  const once=normalizeEvent(values()),weekly=normalizeEvent(values({frequency:'weekly',date:'2026-10-12',days:[6,0,2],until:'2026-10-19'}));
  assert.equal(eventsOn([once],'2026-10-15').length,1);assert.equal(eventsOn([once],'2026-10-22').length,0);
  assert.equal(eventsOn([weekly],'2026-10-12').length,1);assert.equal(eventsOn([weekly],'2026-10-14').length,1);assert.equal(eventsOn([weekly],'2026-10-18').length,1);assert.equal(eventsOn([weekly],'2026-10-19').length,1);
  assert.equal(eventsOn([weekly],'2026-10-11').length,0);assert.equal(eventsOn([weekly],'2026-10-20').length,0);
  assert.deepEqual(nextEventDates([weekly],'2026-10-15'),['2026-10-19','2026-10-18']);
  const future=values({date:'2026-11-20'});assert.deepEqual(nextEventDates([future],'2026-10-15'),['2026-11-20']);
});
test('invalid dates, empty repeat days, duplicate days, oversized text and invalid time ranges are rejected',()=>{
  for(const change of [{date:'2026-02-30'},{start:800,end:700},{start:-1},{end:1500},{frequency:'monthly'},{frequency:'weekly',days:[]},{frequency:'weekly',days:[1,1]},{frequency:'weekly',days:[7]},{frequency:'weekly',days:[1],until:'2026-10-01'},{days:[1]},{title:' '},{title:'x'.repeat(141)},{location:'x'.repeat(201)},{notes:'x'.repeat(501)},{studentNumber:'other'}])assert.throws(()=>normalizeEvent(values(change)));
  assert.equal(normalizeEvent(values({date:'2028-02-29'})).date,'2028-02-29');
});
test('each student and device sees only their own persisted events; updates cannot edit official classes',async()=>{
  const e=env(),a=await identity(e),b=await identity(e,'r23456789'),created=await add(e,a);assert.equal(created.status,201);const event=created.body.event;
  assert.equal((await request(e,b)).body.events.length,0);
  for(const[method,change]of[['PATCH',values()],['DELETE',{}],['PATCH',{deleted:false}]])assert.equal((await request(e,b,'events/'+event.id,{method,body:{version:1,...change}})).status,404);
  const device=await identity(e,a.number,a.id);assert.equal((await request(e,device)).body.events[0].title,'Study group');
  const edited=await request(e,a,'events/'+event.id,{method:'PATCH',body:{version:1,...values({title:'Project meeting',location:'Room 205',frequency:'weekly',days:[0,4]})}});assert.equal(edited.body.event.location,'Room 205');assert.equal(edited.body.event.version,2);
  assert.equal((await request(e,a,'events/'+event.id,{method:'PATCH',body:{version:1,...values()}})).status,409);
  assert.equal((await request(e,a,'events?studentNumber='+b.number)).status,400);
  assert.equal((await add(e,a,{...values(),studentId:b.id})).status,400);
});
test('event actions require a session, CSRF and the configured origin',async()=>{
  const e=env(),a=await identity(e),event=(await add(e,a)).body.event;
  for(const[path,method,body]of[['events','GET'],['events','POST',{id:crypto.randomUUID(),...values()}],['events/'+event.id,'PATCH',{version:1,...values()}],['events/'+event.id,'DELETE',{version:1}]]){
    assert.equal((await request(e,null,path,{method,body})).status,401);assert.equal((await request(e,a,path,{method,body,origin:'https://evil.example'})).status,403);if(method!=='GET')assert.equal((await request(e,a,path,{method,body,csrf:''})).status,403);
  }
});
test('remove and Undo persist, while creation retries cannot duplicate an event',async()=>{
  const e=env(),a=await identity(e),id=crypto.randomUUID();await add(e,a,values(),id);await add(e,a,values(),id);assert.equal((await request(e,a)).body.events.length,1);
  const removed=await request(e,a,'events/'+id,{method:'DELETE',body:{version:1}});assert.equal(removed.body.event.deleted,true);assert.equal((await request(e,a)).body.events.length,0);
  assert.equal((await request(e,a,'events/'+id,{method:'PATCH',body:{version:2,deleted:false}})).body.event.deleted,false);
  assert.equal((await request(e,a)).body.events.length,1);
});
test('event capacity is per student; removal frees a slot',async()=>{
  const e=env(),a=await identity(e),b=await identity(e,'r23456789'),stmt=e.sqlite.prepare('INSERT INTO custom_events(student_id,id,details,created_at,updated_at) VALUES(?,?,?,?,?)');
  for(let i=0;i<500;i++)stmt.run(a.id,crypto.randomUUID(),JSON.stringify(values()),i,i);
  assert.equal((await add(e,a)).body.error.code,'events_full');assert.equal((await add(e,b)).status,201);
});
const settle=()=>new Promise(r=>setImmediate(r));
test('event state reuses isolated account loading, acknowledged edits and Undo',async()=>{
  const current={studentNumber:'b12345678'},saved={...values(),id:crypto.randomUUID(),version:1,createdAt:1};
  const account={current,events:async()=>({studentNumber:current.studentNumber,events:[]}),createEvent:async(id,v)=>({studentNumber:current.studentNumber,event:{...v,id,version:1,createdAt:1}}),changeEvent:async(id,version,v)=>({studentNumber:current.studentNumber,event:{...saved,...v,id,version:version+1}}),removeEvent:async(id,version)=>({studentNumber:current.studentNumber,event:{...saved,id,version:version+1,deleted:true}})};
  const store=new AccountEvents(account);store.bind(current);await settle();assert.equal(await store.save(values()),true);const first=store.state.items[0];await store.save(values({title:'Renamed'}),first);assert.equal(store.state.items[0].title,'Renamed');await store.remove(store.state.items[0]);assert.equal(store.state.items.length,0);await store.undo();assert.equal(store.state.items.length,1);store.bind(null);assert.deepEqual(store.state.items,[]);
});
