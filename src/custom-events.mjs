import { ApiError } from './security.mjs';
import { normalizeEvent } from '../public/event-model.mjs';
const fields='id,details,version,created_at,updated_at,deleted_at';
const data=r=>({...JSON.parse(r.details),id:r.id,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at,deleted:r.deleted_at!==null});
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const invalid=()=>new ApiError(400,'invalid_event','Check the event name, date, repeat days and start/end times.');
const conflict=()=>new ApiError(409,'event_changed','This event changed on another device. Reopen it before saving.');
const missing=()=>new ApiError(404,'event_not_found','This event is no longer available.');
const full=()=>new ApiError(409,'events_full','You can save up to 500 personal events.');
const find=(env,owner,id)=>env.DB.prepare(`SELECT ${fields} FROM custom_events WHERE student_id=? AND id=?`).bind(owner,id).first();
function details(body){const{ id,version,...value}=body;try{return JSON.stringify(normalizeEvent(value));}catch{throw invalid();}}
export async function listEvents(env,owner){return(await env.DB.prepare(`SELECT ${fields} FROM custom_events WHERE student_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 500`).bind(owner).all()).results.map(data);}
export async function createEvent(env,owner,body){
  if(!validId(body.id)||Object.hasOwn(body,'version'))throw invalid();
  const value=details(body),now=Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO custom_events(student_id,id,details,created_at,updated_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM custom_events WHERE student_id=? AND deleted_at IS NULL)<500').bind(owner,body.id,value,now,now,owner).run();
  const row=await find(env,owner,body.id);if(!row)throw full();if(row.details!==value||row.deleted_at!==null)throw conflict();return data(row);
}
export async function changeEvent(env,owner,id,body,remove=false){
  if(!validId(id)||!Number.isSafeInteger(body.version)||body.version<1||Object.hasOwn(body,'id'))throw invalid();
  const restore=!remove&&body.deleted===false;
  if((remove||restore)&&Object.keys(body).some(k=>!(restore?['version','deleted']:['version']).includes(k)))throw invalid();
  const value=remove||restore?null:details(body),current=await find(env,owner,id);
  if(!current)throw missing();if(current.version!==body.version)throw conflict();if(current.deleted_at!==null&&!restore)throw missing();
  const now=Date.now(),row=await env.DB.prepare(`UPDATE custom_events SET details=?,deleted_at=?,updated_at=?,version=version+1 WHERE student_id=? AND id=? AND version=? ${restore?'AND (deleted_at IS NULL OR (SELECT COUNT(*) FROM custom_events WHERE student_id=? AND deleted_at IS NULL)<500)':''} RETURNING ${fields}`)
    .bind(value??current.details,remove?now:null,now,owner,id,body.version,...(restore?[owner]:[])).first();
  if(!row){const latest=await find(env,owner,id);if(restore&&latest?.version===body.version)throw full();throw conflict();}return data(row);
}
