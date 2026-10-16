import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';
import {digest,randomToken,encryptAuthorization} from '../src/security.mjs';
import {savedTimetable} from '../src/timetable-store.mjs';
const APP='https://campus.example';
const catalog=()=>Response.json({totalCount:2,courses:['52528','21570'].map((serial,i)=>({semester:'115-1',provider:'NTU',serial,identifier:'ME1005',code:'502 21130',class:i?'02':'01',teacher:i?'Teacher B':'Teacher A',name:'Statics',schedules:[],coolUrl:'https://cool.ntu.edu.tw/courses/66746'}))});
test('saved course sections are catalog-validated, account-owned, versioned, and drive future exam plans without changing imported identity',async()=>{
 const f=await fixture({withSerial:false}),[a,b]=f.owners,previous=globalThis.fetch,calls=[];
 const mutate=(owner,body,csrf=owner.csrf)=>worker.fetch(new Request(APP+'/api/timetable/courses/'+owner.courseId,{method:'PATCH',headers:{Origin:APP,'Content-Type':'application/json',Cookie:'__Host-campus_week='+owner.token,'X-CSRF-Token':csrf},body:JSON.stringify(body)}),f.env);
 const post=(owner,path)=>worker.fetch(new Request(APP+'/api/exams/'+path,{method:'POST',headers:{Origin:APP,'Content-Type':'application/json',Cookie:'__Host-campus_week='+owner.token,'X-CSRF-Token':owner.csrf},body:JSON.stringify({courseId:owner.courseId})}),f.env);
 globalThis.fetch=async(url)=>{calls.push(url);if(url.includes('/search/'))return catalog();const serial=url.split('/').at(-1);return new Response('<html><body><h2>Statics</h2><p>Course Number</p><p>ME1005</p><p>Class '+(serial==='52528'?'01':'02')+'</p><table><tr><td>Week '+(serial==='52528'?'8':'9')+'</td><td></td><td>Midterm exam</td></tr></table></body></html>',{headers:{'Content-Type':'text/html'}});};
 try{
  const before=(await savedTimetable(f.env,a.id)).timetable;
  const options=await post(a,'options');assert.equal(options.status,200);const choices=await options.json();assert.equal(choices.candidates.length,2);assert.equal(choices.course,null);assert.equal(calls.length,1);assert.doesNotMatch(JSON.stringify(choices),/coolId|password|cookie/);
  assert.equal((await mutate(a,{version:0,language:'en',offeringSerial:'52528'},'wrong')).status,403);
  for(const body of [{version:0,language:'en',offeringSerial:'99999'},{version:0,language:'en',offeringSerial:52528},{version:0,language:'en',offeringSerial:'52528',examOffering:{section:'fake'}}])assert.equal((await mutate(a,body)).status,400);
  const response=await mutate(a,{version:0,language:'en',offeringSerial:'21570',room:'Room 114'});assert.equal(response.status,200,await response.clone().text());
  const saved=await response.json();assert.equal(saved.courseOverrides[a.courseId].examOffering.section,'02');assert.equal(saved.courseOverrides[a.courseId].examOffering.sourceUrl,'https://course.ntu.edu.tw/en/courses/115-1/21570');assert.equal(saved.courseOverrides[a.courseId].examOffering.coolId,undefined);assert.deepEqual(saved.timetable,before);
  assert.deepEqual((await savedTimetable(f.env,b.id)).courseOverrides,{});
  const plan=await post(a,'plan');assert.equal(plan.status,200,await plan.clone().text());const payload=await plan.json();assert.equal(payload.course.serial,'21570');assert.equal(payload.course.exams[0].week,9);
  assert.equal((await mutate(a,{version:0,language:'en',offeringSerial:'52528'})).status,409);
  const cleared=await(await mutate(a,{version:1,language:'en',offeringSerial:null})).json();assert.equal(cleared.courseOverrides[a.courseId].examOffering,null);assert.equal(cleared.courseOverrides[a.courseId].room,'Room 114');
  assert.equal((await(await post(a,'plan')).json()).course,null);
 }finally{globalThis.fetch=previous;f.sqlite.close();}
});
async function fixture({withSerial=true}={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){const s=sqlite.prepare(sql);let v=[];return{bind(...a){v=a;return this;},async first(){return s.get(...v)||null;},async all(){return{results:s.all(...v)};},async run(){return{meta:s.run(...v)};}};}};
 const env={DB,APP_ORIGIN:APP,NTU_CREDENTIAL_KEY:'ab'.repeat(32)},owners=[];
 for(const number of ['b12345678','r23456789']){
  const id=crypto.randomUUID(),token=randomToken(),csrf=randomToken();sqlite.prepare('INSERT INTO students VALUES(?,?,?)').run(id,number,1);
  sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(await digest(token),id,csrf,1,Math.floor(Date.now()/1000)+3600);
  const value={timetable:{term:'115-1',sessions:[{title:'Statics',code:'ME1005',...(withSerial?{serial:number[0]==='b'?'52528':'21570'}:{}),day:1,start:620,end:730}]}};
  sqlite.prepare('INSERT INTO student_connections VALUES(?,?,?,?,?)').run(id,'timetable',await encryptAuthorization(env.NTU_CREDENTIAL_KEY,id,'timetable',value),'authorized',Date.now());
  const courseId=(await savedTimetable(env,id)).timetable.sessions[0].courseId;owners.push({id,token,courseId,csrf});
 }
 const request=(owner,query,origin=APP)=>worker.fetch(new Request(APP+'/api/exams/'+query,{headers:{Origin:origin,...(owner?{Cookie:'__Host-campus_week='+owner.token}:{})}}),env);
 return{sqlite,env,owners,request};
}
test('syllabus resolution requires session, same origin and owned course; rejects injected URLs or owner overrides before upstream',async()=>{
 const f=await fixture(),[a,b]=f.owners,previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not fetch');};
 try{
  assert.equal((await f.request(null,'resolve?courseId='+a.courseId)).status,401);
  assert.equal((await f.request(b,'resolve?courseId='+a.courseId)).status,404);
  assert.equal((await f.request(a,'resolve?courseId='+a.courseId,'https://evil.example')).status,403);
  for(const suffix of ['&studentId='+b.id,'&source=https://evil.example','&serial=bad','&courseId='+a.courseId])assert.equal((await f.request(a,'resolve?courseId='+a.courseId+suffix)).status,400);
  assert.equal((await f.request(a,'preview?courseId='+a.courseId+'&serial=21570&source='+encodeURIComponent('https://course.ntu.edu.tw/courses/115-1/52528'))).status,409);
  assert.equal(calls,0);
 }finally{globalThis.fetch=previous;f.sqlite.close();}
});

test('COOL fallback requires CSRF, owned imported class and catalog offering, never an arbitrary COOL URL',async()=>{
 const f=await fixture(),[a,b]=f.owners,previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('must not call');};
 const post=(owner,body,csrf=owner?.csrf)=>worker.fetch(new Request(APP+'/api/exams/cool-preview',{method:'POST',headers:{Origin:APP,'Content-Type':'application/json',...(owner?{Cookie:'__Host-campus_week='+owner.token,'X-CSRF-Token':csrf}:{})},body:JSON.stringify(body)}),f.env);
 try{
  assert.equal((await post(null,{courseId:a.courseId,serial:'52528'})).status,401);
  assert.equal((await post(a,{courseId:a.courseId,serial:'52528'},'wrong')).status,403);
  assert.equal((await post(b,{courseId:a.courseId,serial:'52528'})).status,404);
  assert.equal((await post(a,{courseId:a.courseId,serial:'52528',url:'https://cool.ntu.edu.tw/courses/64620'})).status,400);
  assert.equal(calls,0);
 }finally{globalThis.fetch=previous;f.sqlite.close();}
});
test('two students resolve only their own offering and syllabus reads never alter timetable or expose credentials',async()=>{
 const f=await fixture(),previous=globalThis.fetch,calls=[];
 const before=f.sqlite.prepare('SELECT * FROM student_connections ORDER BY student_id').all();
 globalThis.fetch=async(url,options)=>{
  calls.push(url);assert.equal(options.credentials,'omit');assert.equal(options.headers.Cookie,undefined);
  if(url.includes('/search/'))return Response.json({totalCount:2,courses:['52528','21570'].map((serial,i)=>({semester:'115-1',provider:'NTU',serial,identifier:'ME1005',code:'502 21130',class:i?'02':'01',name:'Statics',schedules:[]}))});
  const serial=url.split('/').at(-1);return new Response('<html><body><h2>Statics</h2><p>Course Number</p><p>ME1005</p><p>Class '+(serial==='52528'?'01':'02')+'</p><table><tr><td>Week 8</td><td></td><td>Midterm exam</td></tr></table></body></html>',{headers:{'Content-Type':'text/html'}});
 };
 try{
  for(const [i,owner] of f.owners.entries()){
   const response=await f.request(owner,'resolve?courseId='+owner.courseId);assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('Cache-Control'),'no-store, private');
   const result=await response.json();assert.equal(result.course.serial,i?'21570':'52528');assert.equal(result.course.exams[0].date,null);assert.doesNotMatch(JSON.stringify(result),/password|encrypted_authorization|csrf|coolId/);
  }
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM student_connections ORDER BY student_id').all(),before);assert.equal(calls.length,4);
 }finally{globalThis.fetch=previous;f.sqlite.close();}
});

test('COOL fallback reuses only the owner session, verifies live enrollment and never persists an exam plan',async()=>{
 const f=await fixture(),previous=globalThis.fetch,[a,b]=f.owners;
 for(const [i,owner]of f.owners.entries()){
  const cookies=[[JSON.stringify(['cool.ntu.edu.tw','/','canvas_session']),{domain:'cool.ntu.edu.tw',hostOnly:true,path:'/',pair:'canvas_session=owner-'+i,expires:null}]];
  f.sqlite.prepare('INSERT INTO student_connections VALUES(?,?,?,?,?)').run(owner.id,'cool',await encryptAuthorization(f.env.NTU_CREDENTIAL_KEY,owner.id,'cool',{announcementCookies:cookies,calendar:{assignments:[]}}),'authorized',Date.now());
 }
 const post=(owner,path='cool-preview')=>worker.fetch(new Request(APP+'/api/exams/'+path,{method:'POST',headers:{Origin:APP,'Content-Type':'application/json',Cookie:'__Host-campus_week='+owner.token,'X-CSRF-Token':owner.csrf},body:JSON.stringify({courseId:owner.courseId,serial:owner===a?'52528':'21570'})}),f.env);
 globalThis.fetch=async(url,options)=>{
  url=new URL(url);
  if(url.hostname==='course.ntu.edu.tw'){assert.equal(options.headers.Cookie,undefined);return Response.json({totalCount:2,courses:['52528','21570'].map((serial,i)=>({semester:'115-1',provider:'NTU',serial,identifier:'ME1005',code:'502 21130',class:i?'02':'01',name:'Statics',schedules:[],coolUrl:'https://cool.ntu.edu.tw/courses/'+(i?'65857':'66746')}))});}
  assert.equal(url.origin,'https://cool.ntu.edu.tw');assert.doesNotMatch(url.href,/scores|grades|submissions/);
  if(url.pathname==='/api/v1/courses')return Response.json(options.headers.Cookie.includes('owner-0')?[{id:66746}]:[]);
  assert.match(options.headers.Cookie,/owner-0/);
  if(url.pathname.endsWith('/modules'))return Response.json([{id:1,name:'Week 10',items:[{title:'Midterm 2'}],items_count:1}]);
  return Response.json({id:66746,syllabus_body:''});
 };
 try{
  const response=await post(a);assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.equal(result.plan.exams[0].week,10);assert.equal(result.plan.exams[0].date,null);assert.doesNotMatch(JSON.stringify(result),/owner-0|cookie|password/);
  const primary=await post(a,'plan');assert.equal(primary.status,200,await primary.clone().text());const preferred=await primary.json();assert.equal(preferred.course.source,'ntu-cool');assert.equal(preferred.course.exams[0].week,10);assert.equal(preferred.course.coolId,undefined);
  assert.equal((await post(b)).status,403);
  const stored=f.sqlite.prepare("SELECT encrypted_authorization FROM student_connections WHERE student_id=? AND provider='cool'").get(a.id);
  assert.doesNotMatch(stored.encrypted_authorization,/Midterm|Week 10/);
  const {decryptAuthorization}=await import('../src/security.mjs');const saved=await decryptAuthorization(f.env.NTU_CREDENTIAL_KEY,a.id,'cool',stored.encrypted_authorization);assert.equal(saved.plan,undefined);assert.equal(saved.exams,undefined);assert.deepEqual(saved.calendar,{assignments:[]});
 }finally{globalThis.fetch=previous;f.sqlite.close();}
});

test('COOL-first plan route requires CSRF and rejects owner/URL overrides before any provider request',async()=>{
 const f=await fixture(),[a,b]=f.owners,previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not fetch');};
 const post=(owner,body,csrf=owner?.csrf)=>worker.fetch(new Request(APP+'/api/exams/plan',{method:'POST',headers:{Origin:APP,'Content-Type':'application/json',...(owner?{Cookie:'__Host-campus_week='+owner.token,'X-CSRF-Token':csrf}:{})},body:JSON.stringify(body)}),f.env);
 try{
  assert.equal((await post(null,{courseId:a.courseId})).status,401);assert.equal((await post(a,{courseId:a.courseId},'wrong')).status,403);assert.equal((await post(b,{courseId:a.courseId})).status,404);
  for(const extra of [{studentId:b.id},{url:'https://evil.example'},{serial:52528}])assert.equal((await post(a,{courseId:a.courseId,...extra})).status,400);
  assert.equal(calls,0);
 }finally{globalThis.fetch=previous;f.sqlite.close();}
});
