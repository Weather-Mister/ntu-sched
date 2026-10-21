import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../src/worker.mjs';
import {digest,randomToken} from '../src/security.mjs';
const APP='https://campus.example',ORIGIN='https://weather-mister.github.io',KEY='synthetic-eren-private-key-'.repeat(2);
async function fixture(run){
 const db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return {meta:stmt.run(...args)};}};},async batch(statements){db.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}}};
 const env={DB,APP_ORIGIN:APP};
 async function identity(number){const id=crypto.randomUUID(),token=randomToken(),csrf=randomToken();db.prepare('INSERT INTO students VALUES(?,?,?)').run(id,number,1);db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(await digest(token),id,csrf,1,Math.floor(Date.now()/1000)+3600);return {id,token,csrf};}
 const owner=await identity('b15502123'),other=await identity('b12345678'),calls=[];
 let remote=[{id:'old-personal-id',text:'Personal '+ '字'.repeat(180),done:true,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'}],mode='ok';
 const originalFetch=globalThis.fetch;globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});assert.equal(new URL(url).origin,'https://eren-schedule-data-staging.eren-schedule-a84b7436.workers.dev');assert.equal(init.redirect,'manual');assert.equal(init.headers['x-schedule-key'],KEY);assert.equal(init.headers.Cookie,undefined);if(mode==='redirect')return new Response(null,{status:302,headers:{Location:'https://untrusted.example'}});return Response.json(new URL(url).searchParams.get('route')==='status'?{ok:true,app:mode==='wrong'?'begum':'eren'}:{tasks:remote});};
 const request=async(account,path='tasks',method='GET',body,headers={})=>{const h=new Headers({Origin:APP,...headers});if(account){h.set('Cookie','__Host-campus_week='+account.token);h.set('X-CSRF-Token',account.csrf);}if(body!==undefined)h.set('Content-Type','application/json');const response=await worker.fetch(new Request(APP+'/api/'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env);return {status:response.status,data:await response.json(),headers:response.headers};};
 const bridge=(route,body,headers={})=>request(null,'personal-tasks/bridge?route='+route,body===undefined?'GET':'POST',body,{Origin:ORIGIN,'x-schedule-key':KEY,...headers});
 const link=()=>request(owner,'personal-tasks/link','POST',{key:KEY});
 try{await run({db,owner,other,request,bridge,link,calls,setMode(value){mode=value;},setRemote(value){remote=value;}});}finally{globalThis.fetch=originalFetch;db.close();}
}
test('only the verified owner can link, with CSRF and origin checks before any upstream read',async()=>fixture(async({owner,other,request,calls})=>{
 assert.equal((await request(null,'personal-tasks/link','POST',{key:KEY})).status,401);
 assert.equal((await request(other,'personal-tasks/link','POST',{key:KEY})).status,403);
 assert.equal((await request({...owner,csrf:'wrong'},'personal-tasks/link','POST',{key:KEY})).status,403);
 assert.equal((await request(owner,'personal-tasks/link','POST',{key:KEY},{Origin:'https://untrusted.example'})).status,403);assert.equal(calls.length,0);
}));
test('link preserves both lists and long personal tasks, stores only a key hash, and isolates other students',async()=>fixture(async({db,owner,other,request,link})=>{
 const local=await request(owner,'tasks','POST',{id:crypto.randomUUID(),text:'Campus task'});assert.equal(local.status,201);
 const result=await link();assert.equal(result.status,200);assert.equal(result.data.tasks.length,2);assert.ok(result.data.tasks.some(t=>t.text.length>140&&t.done));
 const saved=db.prepare('SELECT key_hash FROM personal_task_link').get();assert.equal(saved.key_hash,await digest(KEY));assert.notEqual(saved.key_hash,KEY);
 assert.equal((await request(owner)).data.tasks.length,2);assert.deepEqual((await request(other)).data.tasks,[]);
 assert.equal((await request(other,'tasks','POST',{id:crypto.randomUUID(),text:'x'.repeat(141)})).status,400);
}));
test('both sites edit one list; retries and old imports cannot reset completion or resurrect removed tasks',async()=>fixture(async({owner,request,bridge,link})=>{
 await link();const id='new-personal-id';assert.equal((await bridge('todos/create',{id,text:'Shared task',done:false})).status,200);
 let task=(await request(owner)).data.tasks.find(t=>t.id===id);assert.ok(task);
 assert.equal((await request(owner,'tasks/'+id,'PATCH',{version:task.version,done:true})).status,200);
 await bridge('todos/create',{id,text:'Shared task',done:false});assert.equal((await bridge('todos/list')).data.tasks.find(t=>t.id===id).done,true);
 await bridge('todos/update',{id,done:false});task=(await request(owner)).data.tasks.find(t=>t.id===id);assert.equal(task.done,false);
 assert.equal((await request(owner,'tasks/'+id,'PATCH',{version:1,done:true})).status,409);
 await bridge('todos/delete',{id});await bridge('todos/import',{tasks:[{id,text:'Shared task',done:false}]});assert.equal((await request(owner)).data.tasks.some(t=>t.id===id),false);
}));
test('bridge credentials authorize tasks only and never use a Campus Week cookie as authorization',async()=>fixture(async({owner,request,bridge,link})=>{
 assert.equal((await bridge('todos/list')).data.code,'not_linked');await link();
 assert.equal((await bridge('todos/list',undefined,{Origin:'https://untrusted.example'})).status,403);
 assert.equal((await bridge('todos/list',undefined,{'x-schedule-key':'wrong'.repeat(10)})).status,401);
 assert.equal((await request(owner,'personal-tasks/bridge?route=todos/list','GET',undefined,{Origin:ORIGIN})).status,401);
 assert.equal((await bridge('mail/list')).status,404);
 assert.equal((await bridge('todos/create',{id:'injection',text:'No',studentNumber:'b12345678'})).status,400);
 const response=await bridge('todos/list');assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.equal(response.headers.get('Access-Control-Allow-Credentials'),null);
}));
test('wrong workspaces, redirects and invalid snapshots cannot activate the link or overwrite local tasks',async()=>fixture(async({owner,request,link,setMode,setRemote})=>{
 await request(owner,'tasks','POST',{id:crypto.randomUUID(),text:'Keep local'});
 for(const mode of ['wrong','redirect']){setMode(mode);assert.ok((await link()).status>=400);assert.equal((await request(owner,'personal-tasks/link')).data.linked,false);}
 setMode('ok');setRemote([{id:'bad',text:'',done:false}]);assert.equal((await link()).status,400);assert.equal((await request(owner)).data.tasks[0].text,'Keep local');
}));
test('cutover fences writes to the old table and reconnecting cannot restore stale personal state',async()=>fixture(async({db,owner,request,bridge,link})=>{
 const localId=crypto.randomUUID();await request(owner,'tasks','POST',{id:localId,text:'Local'});await link();
 assert.throws(()=>db.prepare('UPDATE manual_tasks SET done=1 WHERE student_id=?').run(owner.id),/shared personal list/);
 await bridge('todos/delete',{id:'old-personal-id'});await link();assert.equal((await request(owner)).data.tasks.some(t=>t.id==='old-personal-id'),false);
 assert.ok((await request(owner)).data.tasks.some(t=>t.id===localId));
}));
