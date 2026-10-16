import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';
import {digest,randomToken} from '../src/security.mjs';
import {normalizeCustomExam} from '../public/custom-exam-model.mjs';
import {examFeed,examSourceKey} from '../public/account-exams.mjs';
import {AccountCustomExams} from '../public/account-custom-exams.mjs';

const APP='https://campus.example';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){const s=sqlite.prepare(sql);let args=[];return{bind(...a){args=a;return this;},async first(){return s.get(...args)||null;},async all(){return{results:s.all(...args)};},async run(){return{meta:s.run(...args)};}};}};
 const env={DB,APP_ORIGIN:APP},close=()=>sqlite.close();
 const owner=async(number)=>{
   const id=crypto.randomUUID(),token=randomToken(),csrf=randomToken();
   sqlite.prepare('INSERT INTO students VALUES(?,?,?)').run(id,number,1);
   sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(await digest(token),id,csrf,1,Math.floor(Date.now()/1000)+3600);
   return{id,token,csrf,number};
 };
 const request=async(user,path='custom-exams',method='GET',data,options={})=>{
   const headers=new Headers({Origin:options.origin||APP,...(user?{Cookie:'__Host-campus_week='+user.token}:{}),...((user||options.csrf)?{'X-CSRF-Token':options.csrf??user.csrf}:{})});
   if(data!==undefined)headers.set('Content-Type','application/json');
   const response=await worker.fetch(new Request(APP+'/api/'+path,{method,headers,...(data!==undefined?{body:JSON.stringify(data)}:{})}),env);
   return{status:response.status,body:await response.json()};
 };
 return{owner,request,close};
}
const values=(extra={})=>({title:'Physics Midterm',className:'Physics',kind:'midterm',date:'2026-11-18',week:11,notes:'Chapter 6',sourceKey:null,...extra});

test('custom exams validate dates, weeks, and personal overrides without inventing dates',()=>{
 assert.equal(normalizeCustomExam(values({date:null})).date,null);
 assert.equal(normalizeCustomExam(values({date:null})).week,11);
 assert.equal(normalizeCustomExam(values({sourceKey:'import:source-key'})).sourceKey,'import:source-key');
 for(const input of [values({date:'2026-02-31'}),values({date:null,week:null}),values({week:31}),values({kind:'homework'}),values({studentId:'other'}),values({title:'\n'})])
   assert.throws(()=>normalizeCustomExam(input));
});

test('only sourced exams may be hidden, and a hidden item needs no invented date',()=>{
 const payload=values({date:null,week:null,sourceKey:'import:specific-key',hidden:true});
 assert.equal(normalizeCustomExam(payload).hidden,true);
 assert.equal(normalizeCustomExam({...payload,hidden:false}).date,null,'restoring source without a known date is valid');
 assert.throws(()=>normalizeCustomExam(values({hidden:true})));
 assert.throws(()=>normalizeCustomExam(values({hidden:'true',sourceKey:'import:x'})));
});

test('hidden imported exams are owner-scoped and can be shown again',async()=>{
 const f=fixture();
 try{
  const a=await f.owner('b12345678'),b=await f.owner('r23456789');
  const id=crypto.randomUUID(),value=values({title:'PE midterm',date:null,week:null,sourceKey:'import:pe-midterm',hidden:true});
  assert.equal((await f.request(a,'custom-exams','POST',{id,...value})).status,201);
  assert.equal((await f.request(a)).body.exams[0].hidden,true);
  assert.equal((await f.request(b)).body.exams.length,0);
  const changed=await f.request(a,'custom-exams/'+id,'PATCH',{version:1,...value,hidden:false,date:'2026-11-04'});
  assert.equal(changed.status,200);assert.equal(changed.body.exam.hidden,false);
 }finally{f.close();}
});

test('custom exams persist and isolate students; edits require version; restores do not modify original',async()=>{
 const f=fixture();
 try{
  const a=await f.owner('b12345678'),b=await f.owner('r23456789');
  const id=crypto.randomUUID(),created=await f.request(a,'custom-exams','POST',{id,...values()});
  assert.equal(created.status,201);assert.equal(created.body.exam.version,1);
  assert.equal((await f.request(a)).body.exams.length,1);
  assert.equal((await f.request(b)).body.exams.length,0);
  assert.equal((await f.request(a,'custom-exams','POST',{id,...values()})).status,201);

  assert.equal((await f.request(a)).body.exams.length,1);
  assert.equal((await f.request(a,'custom-exams','POST',{id,...values({title:'Collision'})})).status,409);
  assert.equal((await f.request(b,'custom-exams/'+id,'DELETE',{version:1})).status,404);
  const edit=await f.request(a,'custom-exams/'+id,'PATCH',{version:1,...values({date:null,week:12,title:'Physics Midterm II'})});
  assert.equal(edit.status,200);assert.equal(edit.body.exam.date,null);assert.equal(edit.body.exam.version,2);
  assert.equal((await f.request(a,'custom-exams/'+id,'PATCH',{version:1,...values()})).status,409);
  const del=await f.request(a,'custom-exams/'+id,'DELETE',{version:2});
  assert.equal(del.status,200);assert.equal((await f.request(a)).body.exams.length,0);
  assert.equal((await f.request(a,'custom-exams/'+id,'PATCH',{version:3,deleted:false})).status,200);
  assert.equal((await f.request(a)).body.exams.length,1);
  for(const [user,path,method,data,expected] of [
    [null,'custom-exams','GET',undefined,401],
    [null,'custom-exams','POST',{id:crypto.randomUUID(),...values()},401],
    [a,'custom-exams','POST',{id:crypto.randomUUID(),...values(),ownerId:b.id},400],
  ])assert.equal((await f.request(user,path,method,data)).status,expected);
  assert.equal((await f.request(a,'custom-exams','POST',{id:crypto.randomUUID(),...values()}, {csrf:'bad'})).status,403);
  assert.equal((await f.request(a,'custom-exams','POST',{id:crypto.randomUUID(),...values()}, {origin:'https://evil.example'})).status,403);
 }finally{f.close();}
});

test('manual and overridden NTU exams interleave chronologically; original survives restoring override',()=>{
 const imported={kind:'midterm',description:'Midterm exam',week:8,date:null,certainty:'week-only'};
 const course={term:'115-1',serial:'52528',title:'Statics',exams:[imported]};
 const entries=new Map([['a',{result:{course}}]]);
 const sourceKey=examSourceKey('a',imported,0,'52528');
 const override={...values({title:'Statics exam - new date',date:'2026-11-18',week:11,sourceKey}),id:crypto.randomUUID(),version:1};
 const manual={...values({title:'Psych Quiz',date:'2026-10-29',week:null,sourceKey:null}),id:crypto.randomUUID(),version:1};
 const fed=examFeed(entries,'2026-10-16',[override,manual]);
 assert.deepEqual(fed.upcoming.map(x=>x.title),['Psych Quiz','Statics exam - new date']);
 assert.equal(fed.upcoming[1].date,'2026-11-18');
 assert.equal(fed.upcoming[1].manualRecord.id,override.id);
 const rescheduled={...imported,week:9,date:'2026-11-06',description:'Updated NTU exam date',certainty:'explicit'};
 const afterProviderChange=examFeed(new Map([['a',{result:{course:{...course,exams:[rescheduled]}}}]]),'2026-10-16',[override,manual]);
 assert.equal(afterProviderChange.upcoming.find(x=>!x.custom).date,'2026-11-18','personal date survives an upstream revision');

 const restored=examFeed(entries,'2026-10-16',[manual]);
 assert.equal(restored.upcoming.find(x=>!x.custom).date,null);
 assert.equal(restored.upcoming.find(x=>!x.custom).week,8);
 assert.equal(restored.upcoming.length,2);
});

test('custom exam account state protects against stale owner response and allows edits',async()=>{
 const account={current:{studentNumber:'b12345678'},async customExams(){return{studentNumber:this.current.studentNumber,exams:[]};},
  async createCustomExam(id,v){return{studentNumber:this.current.studentNumber,exam:{...v,id,version:1}};},
  async changeCustomExam(id,version,v){return{studentNumber:this.current.studentNumber,exam:{...v,id,version:version+1}};},
  async removeCustomExam(id,version){return{studentNumber:this.current.studentNumber,exam:{...values(),id,version:version+1,deleted:true}};}};
 const store=new AccountCustomExams(account);store.bind(account.current);await new Promise(r=>setImmediate(r));
 assert.equal(store.state.ready,true);
 assert.equal(await store.save(values()),true);
 const first=store.state.items[0];assert.equal(first.title,'Physics Midterm');
 assert.equal(await store.save(values({title:'Updated'}),first),true);
 assert.equal(store.state.items[0].title,'Updated');
 assert.equal(await store.remove(store.state.items[0]),true);
 assert.equal(store.state.items.length,0);
 store.bind(null);assert.equal(store.state.items.length,0);
});
