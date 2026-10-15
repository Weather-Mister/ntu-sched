import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../src/worker.mjs';
import { digest, randomToken } from '../src/security.mjs';
import { CampusAccount } from '../public/campus-account.mjs';
import { AccountTasks } from '../public/account-tasks.mjs';

const APP = 'https://campus.example', KEY = '12'.repeat(32);
class D1 {
  sqlite = new DatabaseSync(':memory:');
  prepare(sql) {
    const statement = this.sqlite.prepare(sql); let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return statement.get(...args) || null; },
      async all() { return { results: statement.all(...args) }; },
      async run() { return { meta: statement.run(...args), results: [] }; },
      execute() { return { results: statement.columns().length ? statement.all(...args) : (statement.run(...args), []) }; }
    };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try { const results = statements.map(s => s.execute()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
function env() {
  const DB = new D1(), directory = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(directory).filter(n => n.endsWith('.sql')).sort()) DB.sqlite.exec(readFileSync(new URL(name, directory), 'utf8'));
  return { DB, APP_ORIGIN: APP, NTU_CREDENTIAL_KEY: KEY, NTU_LOGIN_ENABLED: 'true' };
}
async function identity(e, number = 'b12345678', existingId) {
  const id = existingId || crypto.randomUUID(), token = randomToken(), csrf = randomToken();
  e.DB.sqlite.prepare('INSERT OR IGNORE INTO students VALUES(?, ?, ?)').run(id, number, 1);
  e.DB.sqlite.prepare('INSERT INTO sessions VALUES(?, ?, ?, ?, ?)').run(await digest(token), id, csrf, 1, Math.floor(Date.now()/1000)+3600);
  return { id, cookie: '__Host-campus_week='+token, csrf, number };
}
async function request(e, account, path = 'tasks', { method = 'GET', body, csrf = account?.csrf, origin = APP } = {}) {
  const headers = new Headers({ Origin: origin });
  if (account) headers.set('Cookie', account.cookie);
  if (csrf) headers.set('X-CSRF-Token', csrf);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await worker.fetch(new Request(APP+'/api/'+path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), e);
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const add = (e, a, text = 'Read chapter 3', id = crypto.randomUUID()) => request(e, a, 'tasks', { method: 'POST', body: { id, text } });

test('tasks persist across sessions and Worker instances for the same student, with no provider sign-in', async () => {
  const e = env(), a = await identity(e);
  const saved = await add(e, a, '準備報告'); assert.equal(saved.status, 201);
  const secondDevice = await identity(e, a.number, a.id);
  const read = await request({ ...e, DB: e.DB }, secondDevice);
  assert.equal(read.body.studentNumber, a.number);
  assert.equal(read.body.tasks[0].text, '準備報告');
  assert.equal(read.headers.get('Cache-Control'), 'no-store, private');
  assert.equal(read.body.tasks[0].version, 1);
});
test('student B cannot list, complete, remove or restore student A tasks, even with their UUID', async () => {
  const e = env(), a = await identity(e), b = await identity(e, 'r23456789');
  const task = (await add(e, a)).body.task;
  assert.deepEqual((await request(e, b)).body.tasks, []);
  for (const [method, change] of [['PATCH', {done:true}], ['PATCH', {deleted:false}], ['DELETE', {}]]) {
    assert.equal((await request(e, b, 'tasks/'+task.id, { method, body:{ version:1, ...change } })).status,404);
  }
  assert.equal((await request(e, a)).body.tasks[0].done, false);
  assert.equal((await request(e, b, 'tasks?studentId='+a.id)).status, 400);
  assert.equal((await request(e, b, 'tasks', { method:'POST',body:{id:crypto.randomUUID(),text:'attempt',studentNumber:a.number} })).status,400);
});
test('every task route needs a valid session and every mutation checks CSRF and origin', async () => {
  const e = env(), a = await identity(e), id = crypto.randomUUID();
  for (const [path,method,body] of [['tasks','GET'],['tasks','POST',{id,text:'Task'}],['tasks/'+id,'PATCH',{version:1,done:true}],['tasks/'+id,'DELETE',{version:1}]]) {
    assert.equal((await request(e,null,path,{method,body})).status,401);
    if(method!=='GET')assert.equal((await request(e,a,path,{method,body,csrf:''})).status,403);
    assert.equal((await request(e,a,path,{method,body,origin:'https://evil.example'})).status,403);
  }
});
test('completion and undo removal survive new reads; stale versions cannot overwrite another device', async () => {
  const e=env(),a=await identity(e), task=(await add(e,a)).body.task;
  const completed=await request(e,a,'tasks/'+task.id,{method:'PATCH',body:{version:1,done:true}});
  assert.equal(completed.body.task.version,2);
  assert.equal((await request(e,a)).body.tasks[0].done,true);
  assert.equal((await request(e,a,'tasks/'+task.id,{method:'PATCH',body:{version:1,done:false}})).status,409);
  const removed=await request(e,a,'tasks/'+task.id,{method:'DELETE',body:{version:2}});
  assert.equal(removed.body.task.deleted,true); assert.deepEqual((await request(e,a)).body.tasks,[]);
  const restored=await request(e,a,'tasks/'+task.id,{method:'PATCH',body:{version:3,deleted:false}});
  assert.equal(restored.body.task.done,true); assert.equal(restored.body.task.version,4);
  assert.equal((await request(e,a)).body.tasks.length,1);
});
test('retrying a create after a lost response never duplicates or resets completion', async () => {
  const e=env(),a=await identity(e),id=crypto.randomUUID();
  await add(e,a,'One task',id);
  await request(e,a,'tasks/'+id,{method:'PATCH',body:{version:1,done:true}});
  const retry=await add(e,a,'One task',id);
  assert.equal(retry.body.task.done,true);assert.equal((await request(e,a)).body.tasks.length,1);
  assert.equal((await add(e,a,'Different text',id)).status,409);
});
test('tasks validate text, IDs, versions and extra fields; HTML stays plain task text', async () => {
  const e=env(),a=await identity(e);
  for (const text of ['', '  ', 'x'.repeat(141), 'two\nlines', '\u0000']) assert.equal((await add(e,a,text)).status,400);
  assert.equal((await add(e,a,'Task','not-a-uuid')).status,400);
  const task=(await add(e,a,'<img src=x onerror=alert(1)>')).body.task;
  assert.equal((await request(e,a)).body.tasks[0].text,task.text);
  for(const body of [{done:true},{version:0,done:true},{version:1,done:'true'},{version:1,deleted:true},{version:1,done:true,deleted:false},{version:1,text:'Changed'}]) {
    assert.equal((await request(e,a,'tasks/'+task.id,{method:'PATCH',body})).status,400);
  }
});
test('the 500-task bound is per account and removal frees a slot',async()=>{
  const e=env(),a=await identity(e),b=await identity(e,'r23456789');
  const insert=e.DB.sqlite.prepare('INSERT INTO manual_tasks(student_id,id,text,created_at,updated_at) VALUES(?,?,?,?,?)');
  for(let i=0;i<500;i++)insert.run(a.id,crypto.randomUUID(),'Task '+i,i,i);
  assert.equal((await add(e,a)).body.error.code,'tasks_full');assert.equal((await add(e,b)).status,201);
  const first=(await request(e,a)).body.tasks[0];
  await request(e,a,'tasks/'+first.id,{method:'DELETE',body:{version:1}});
  assert.equal((await add(e,a)).status,201);
  assert.equal((await request(e,a,'tasks/'+first.id,{method:'PATCH',body:{version:2,deleted:false}})).body.error.code,'tasks_full');
});
test('logging in again with the same normalized student number restores their existing tasks',async()=>{
  const e=env(),a=await identity(e);await add(e,a,'Account task');
  const original=globalThis.fetch;
  globalThis.fetch=async(_url,options)=> options.method==='POST'
    ?new Response('rcmail.set_env('+JSON.stringify({task:'mail',request_token:'synthetic',username:options.body.get('_user')})+');')
    :new Response('<input type="hidden" name="_token" value="synthetic">');
  try{
    const login=await request(e,null,'auth/login',{method:'POST',body:{studentNumber:' B12345678 ',password:'synthetic-password'}});
    assert.equal(login.status,200);
    const next={cookie:login.headers.get('Set-Cookie').split(';')[0],csrf:login.body.csrfToken};
    assert.equal((await request(e,next)).body.tasks[0].text,'Account task');
    assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM students').get().n,1);
  }finally{globalThis.fetch=original;}
});

const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function controller(overrides={}){
  const current={studentNumber:'b12345678'}, client={current,tasks:async()=>({studentNumber:'b12345678',tasks:[]}),...overrides};
  let expired=0;const store=new AccountTasks(client,{onSessionExpired:()=>expired++});store.bind(current);
  return{client,store,current,get expired(){return expired;}};
}
const result=task=>({studentNumber:'b12345678',task});
test('account switches discard late reads and writes and clear the previous tasks and undo',async()=>{
  const read=deferred(),write=deferred(),f=controller({tasks:()=>read.promise});
  const next={studentNumber:'r23456789'};f.client.current=next;f.client.tasks=async()=>({studentNumber:next.studentNumber,tasks:[]});f.store.bind(next);
  read.resolve({studentNumber:'b12345678',tasks:[{id:'private',text:'Private'}]});await settle();assert.deepEqual(f.store.state.items,[]);
  f.client.current=f.current;f.store.bind(f.current);f.client.tasks=async()=>({studentNumber:'b12345678',tasks:[]});f.store.bind(f.current);await settle();
  f.client.createTask=()=>write.promise;const adding=f.store.add('Old account task');f.store.bind(null);f.client.current=null;
  write.resolve(result({id:'old',text:'Old account task'}));assert.equal(await adding,false);assert.deepEqual(f.store.state.items,[]);assert.equal(f.store.state.undo,null);
});
test('failed saves keep the saved list; a retry reuses its create UUID and changes only after acknowledgement',async()=>{
  const f=controller();await settle();const ids=[];let tries=0;
  f.client.createTask=async(id,text)=>{ids.push(id);if(++tries===1)throw Error('offline');return result({id,text,version:1});};
  assert.equal(await f.store.add('Keep my draft'),false);assert.deepEqual(f.store.state.items,[]);assert.equal(f.store.state.error.phase,'save');
  assert.equal(await f.store.add('Keep my draft'),true);assert.equal(ids[0],ids[1]);assert.equal(f.store.state.items[0].text,'Keep my draft');
});
test('a slow pre-save refresh cannot overwrite an acknowledged task change',async()=>{
  const f=controller();await settle();const read=deferred();f.client.tasks=()=>read.promise;const refreshing=f.store.refresh();
  f.client.createTask=async(id,text)=>result({id,text,version:1});await f.store.add('New task');
  read.resolve({studentNumber:'b12345678',tasks:[]});await refreshing;assert.equal(f.store.state.items[0].text,'New task');
});
test('a changed shared cookie or expired session clears tasks before displaying another student’s response',async()=>{
  for(const mismatch of [true,false]){
    const f=controller();await settle();f.store.state.items=[{id:'saved',text:'Private'}];
    f.client.tasks=async()=>{if(!mismatch)throw Object.assign(Error('expired'),{status:401});return{studentNumber:'r23456789',tasks:[{id:'other'}]};};
    await f.store.refresh();assert.equal(f.expired,1);assert.deepEqual(f.store.state.items,[]);
  }
});
test('PATCH and DELETE task calls carry CSRF and same-origin credentials',async()=>{
  const original=globalThis.fetch,client=new CampusAccount();client.current={studentNumber:'b12345678',csrfToken:'synthetic-csrf'};
  const methods=[];
  globalThis.fetch=async(url,options)=>{methods.push(options.method);assert.equal(options.headers.get('X-CSRF-Token'),'synthetic-csrf');assert.equal(options.credentials,'same-origin');return Response.json(result({id:'test'}));};
  try{await client.changeTask('test',1,{done:true});await client.removeTask('test',2);assert.deepEqual(methods,['PATCH','DELETE']);}finally{globalThis.fetch=original;}
});

test('the real API client clearing an expired session still clears the task controller',async()=>{
  const original=globalThis.fetch,client=new CampusAccount();client.current={studentNumber:'b12345678',csrfToken:'synthetic-csrf'};
  let expired=0;const store=new AccountTasks(client,{onSessionExpired:()=>expired++});
  globalThis.fetch=async()=>Response.json({error:{code:'login_required',message:'Expired'}},{status:401});
  try{store.bind(client.current);await settle();assert.equal(expired,1);assert.equal(store.current,null);assert.deepEqual(store.state.items,[]);}finally{globalThis.fetch=original;}
});
