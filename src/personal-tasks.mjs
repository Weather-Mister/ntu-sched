import {ApiError,digest,readJson,responseSecurityHeaders} from './security.mjs';
import {listTasks,createTask,changeTask} from './manual-tasks.mjs';
export const PERSONAL_STUDENT='b15502123';
export const PERSONAL_ORIGIN='https://weather-mister.github.io';
const SOURCE='https://eren-schedule-data-staging.eren-schedule-a84b7436.workers.dev/';
const shared={personal:true},schemas=new WeakMap();
const columns='student_id,id,text,done,version,created_at,updated_at,deleted_at';
export const PERSONAL_TASK_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS personal_task_link(student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,key_hash TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS personal_manual_tasks(student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 120),text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 500),done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deleted_at INTEGER,PRIMARY KEY(student_id,id))`,
 ...['INSERT','UPDATE','DELETE'].map(action=>`CREATE TRIGGER IF NOT EXISTS personal_tasks_fence_${action.toLowerCase()} BEFORE ${action} ON manual_tasks WHEN EXISTS(SELECT 1 FROM personal_task_link WHERE student_id=${action==='DELETE'?'OLD':'NEW'}.student_id) BEGIN SELECT RAISE(ABORT,'Tasks moved to the shared personal list'); END`)
];
async function schema(env){
 if(!schemas.has(env.DB))schemas.set(env.DB,(async()=>{for(const sql of PERSONAL_TASK_SCHEMA)await env.DB.prepare(sql).run();})().catch(error=>{schemas.delete(env.DB);throw error;}));
 return schemas.get(env.DB);
}
function ownerOnly(owner){if(owner.student_number!==PERSONAL_STUDENT)throw new ApiError(403,'personal_tasks_owner','This connection is only available to its owner.');}
export async function personalTaskStatus(env,owner){
 ownerOnly(owner);await schema(env);
 return {linked:!!await env.DB.prepare('SELECT student_id FROM personal_task_link WHERE student_id=?').bind(owner.student_id).first()};
}
export async function personalTaskOptions(env,owner){
 if(owner.student_number!==PERSONAL_STUDENT)return undefined;
 return (await personalTaskStatus(env,owner)).linked?shared:undefined;
}
async function sourceRead(route,key){
 let response;try{response=await fetch(SOURCE+'?route='+route,{headers:{'x-schedule-key':key,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});}
 catch{throw new ApiError(502,'personal_tasks_unavailable','Your personal task service could not be reached. Nothing was linked.');}
 if(!response.ok){await response.body?.cancel();throw new ApiError(response.status===401?400:502,'personal_tasks_pairing','Pair your Eren site with its private key, then try connecting again.');}
 const reader=response.body?.getReader();if(!reader)throw new ApiError(502,'personal_tasks_unavailable','The personal task service returned no data.');
 let size=0,text='';const decoder=new TextDecoder();
 try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>256000)throw Error();text+=decoder.decode(next.value,{stream:true});}return JSON.parse(text+decoder.decode());}
 catch{throw new ApiError(502,'personal_tasks_unavailable','The personal task service returned unreadable data.');}
 finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
function importedTask(task){
 const id=task?.id,text=typeof task?.text==='string'?task.text.trim():'';
 if(typeof id!=='string'||!id.length||id.length>120||/[\x00-\x1f\x7f]/.test(id)||!text||Array.from(text).length>500||/[\x00-\x1f\x7f]/.test(text)||typeof task.done!=='boolean')throw new ApiError(400,'personal_tasks_invalid','A personal task could not be imported safely. Your lists are unchanged.');
 const stamp=value=>Number.isSafeInteger(value)&&value>0?value:Date.parse(value)||Date.now();
 return {id,text,done:Number(task.done),version:1,created_at:stamp(task.createdAt),updated_at:stamp(task.updatedAt),deleted_at:null};
}
async function insertRows(env,studentId,rows,extra=[]){
 const statements=[];
 for(let offset=0;offset<rows.length;offset+=12){
  const group=rows.slice(offset,offset+12);
  statements.push(env.DB.prepare('INSERT INTO personal_manual_tasks('+columns+') VALUES '+group.map(()=>'(?,?,?,?,?,?,?,?)').join(',')+' ON CONFLICT(student_id,id) DO NOTHING')
   .bind(...group.flatMap(row=>[studentId,row.id,row.text,row.done,row.version,row.created_at,row.updated_at,row.deleted_at])));
 }
 if(statements.length||extra.length)await env.DB.batch([...statements,...extra]);
}
export async function linkPersonalTasks(env,owner,input){
 ownerOnly(owner);
 if(Object.keys(input).some(k=>k!=='key')||typeof input.key!=='string'||input.key.trim().length<32||input.key.length>200)throw new ApiError(400,'personal_tasks_pairing','Use the private pairing key from your Eren site.');
 const key=input.key.trim();await schema(env);
 const bucket=Math.floor(Date.now()/60000),limit=await env.DB.prepare('INSERT INTO login_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind('personal-link:'+owner.student_id+':'+bucket,(bucket+1)*60).first();
 if(limit.attempts>6)throw new ApiError(429,'personal_tasks_busy','Please wait a moment before trying to connect again.');
 // Verify the fixed Eren workspace before importing anything or authorizing the bridge.
 const status=await sourceRead('status',key);if(status.app!=='eren'||status.ok!==true)throw new ApiError(400,'personal_tasks_pairing','This is not your Eren workspace.');
 const source=await sourceRead('todos/list',key);
 if(!Array.isArray(source.tasks)||source.tasks.length>=200)throw new ApiError(409,'personal_tasks_capacity','The personal list cannot be imported completely. Nothing was linked.');
 const remote=source.tasks.map(importedTask);
 const local=(await env.DB.prepare('SELECT '+columns+' FROM manual_tasks WHERE student_id=?').bind(owner.student_id).all()).results;
 const existing=(await env.DB.prepare('SELECT '+columns+' FROM personal_manual_tasks WHERE student_id=?').bind(owner.student_id).all()).results;
 const merged=new Map(remote.map(row=>[row.id,row]));
 for(const row of local){const previous=merged.get(row.id);if(previous&&previous.text!==row.text)throw new ApiError(409,'personal_tasks_collision','Two tasks share an ID with different text. Nothing was linked.');if(!previous||row.deleted_at!==null||row.updated_at>=previous.updated_at)merged.set(row.id,row);}
 for(const row of existing)merged.set(row.id,row); // Reconnecting never replays an old snapshot over shared edits.
 const rows=[...merged.values()];if(rows.filter(row=>row.deleted_at===null).length>500)throw new ApiError(409,'tasks_full','The combined lists exceed 500 tasks. Nothing was linked.');
 const known=new Set(existing.map(row=>row.id));
 await insertRows(env,owner.student_id,remote.filter(row=>!known.has(row.id)),[
  // Read the local list inside the same transaction as cutover, then fence old writes.
  env.DB.prepare('INSERT INTO personal_manual_tasks('+columns+') SELECT '+columns+' FROM manual_tasks WHERE student_id=? AND NOT EXISTS(SELECT 1 FROM personal_task_link WHERE student_id=?) ON CONFLICT(student_id,id) DO UPDATE SET done=excluded.done,version=excluded.version,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at WHERE personal_manual_tasks.updated_at<excluded.updated_at OR excluded.deleted_at IS NOT NULL').bind(owner.student_id,owner.student_id),
  env.DB.prepare('INSERT INTO personal_task_link(student_id,key_hash,created_at) VALUES(?,?,?) ON CONFLICT(student_id) DO UPDATE SET key_hash=excluded.key_hash').bind(owner.student_id,await digest(key),Date.now())]);
 return {linked:true,tasks:await listTasks(env,owner.student_id,shared)};
}
function equalHash(a,b){if(typeof a!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export async function personalTaskBridge(request,env){
 const origin=request.headers.get('Origin'),cors=origin===PERSONAL_ORIGIN?{'Access-Control-Allow-Origin':PERSONAL_ORIGIN,'Access-Control-Allow-Headers':'content-type, x-schedule-key','Access-Control-Allow-Methods':'GET, POST, OPTIONS',Vary:'Origin'}:{};
 const reply=(data,status=200)=>Response.json(data,{status,headers:{...responseSecurityHeaders,'Cache-Control':'no-store, private',...cors}});
 try{
  if(origin!==PERSONAL_ORIGIN)return reply({error:'Origin is not allowed.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const url=new URL(request.url),route=url.searchParams.get('route');
  if([...url.searchParams.keys()].some(k=>k!=='route')||!['todos/list','todos/create','todos/update','todos/delete','todos/import'].includes(route))return reply({error:'Task action is not available.'},404);
  if(request.method!==(route==='todos/list'?'GET':'POST'))return reply({error:'Method is not allowed.'},405);
  const key=request.headers.get('x-schedule-key')||'';if(key.length<32||key.length>200)return reply({error:'Pairing required.'},401);
  await schema(env);
  const link=await env.DB.prepare('SELECT l.student_id,l.key_hash FROM personal_task_link l JOIN students s ON s.id=l.student_id WHERE s.student_number=?').bind(PERSONAL_STUDENT).first();
  if(!link)return reply({error:'Campus Week tasks are not connected.',code:'not_linked'},404);
  if(!equalHash(link.key_hash,await digest(key)))return reply({error:'Pairing required.'},401);
  const studentId=link.student_id;
  if(route==='todos/list')return reply({tasks:await listTasks(env,studentId,shared)});
  const input=await readJson(request,200000);
  if(route==='todos/import'){
   if(Object.keys(input).some(k=>k!=='tasks')||!Array.isArray(input.tasks)||input.tasks.length>200)throw new ApiError(400,'invalid_task','Invalid task import.');
   const rows=input.tasks.map(importedTask),all=(await env.DB.prepare('SELECT id FROM personal_manual_tasks WHERE student_id=?').bind(studentId).all()).results,known=new Set(all.map(row=>row.id));
   const fresh=[...new Map(rows.map(row=>[row.id,row])).values()].filter(row=>!known.has(row.id));
   const active=await listTasks(env,studentId,shared);if(active.length+fresh.length>500)throw new ApiError(409,'tasks_full','You can save up to 500 tasks.');
   await insertRows(env,studentId,fresh);return reply({ok:true,imported:fresh.length});
  }
  if(Object.keys(input).some(k=>!['id','text','done'].includes(k)))throw new ApiError(400,'invalid_task','Invalid task action.');
  if(typeof input.id!=='string'||!input.id.length||input.id.length>120||/[\x00-\x1f\x7f]/.test(input.id))throw new ApiError(400,'invalid_task','Invalid task ID.');
  const current=await env.DB.prepare('SELECT id,text,done,version,deleted_at FROM personal_manual_tasks WHERE student_id=? AND id=?').bind(studentId,input.id).first();
  if(route==='todos/create'){
   // A queued retry must not reset completion or resurrect a removed task.
   if(current&&current.text===input.text?.trim())return reply({ok:true});
   return reply({task:await createTask(env,studentId,{id:input.id,text:input.text},shared)});
  }
  if(!current||current.deleted_at!==null)return reply({ok:true});
  await changeTask(env,studentId,current.id,route==='todos/delete'?{version:current.version}:{version:current.version,done:input.done},route==='todos/delete',shared);
  return reply({ok:true});
 }catch(error){return reply({error:error instanceof ApiError?error.message:'Personal tasks are temporarily unavailable.',code:error instanceof ApiError?error.code:'personal_tasks_unavailable'},error instanceof ApiError?error.status:503);}
}
