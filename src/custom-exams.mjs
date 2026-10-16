import {ApiError} from './security.mjs';
import {normalizeCustomExam} from '../public/custom-exam-model.mjs';

// Lightweight runtime migration like student_preferences: works with existing D1
// deployments and accounts without a separate manual migration step.
export const CUSTOM_EXAMS_SCHEMA='CREATE TABLE IF NOT EXISTS custom_exams (student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, id TEXT NOT NULL, details TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, PRIMARY KEY(student_id,id))';
const ready=new WeakMap();
async function schema(env){
  if(!ready.has(env.DB))ready.set(env.DB,env.DB.prepare(CUSTOM_EXAMS_SCHEMA).run().catch(e=>{ready.delete(env.DB);throw e;}));
  await ready.get(env.DB);
}
const fields='id,details,version,created_at,updated_at,deleted_at';
const result=row=>({...JSON.parse(row.details),id:row.id,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,deleted:row.deleted_at!==null});
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const invalid=()=>new ApiError(400,'invalid_custom_exam','Enter an exam title, valid date and optional details.');
const changed=()=>new ApiError(409,'custom_exam_changed','The exam changed on another device. Reopen it and try again.');
const missing=()=>new ApiError(404,'custom_exam_missing','This exam is no longer available.');
const full=()=>new ApiError(409,'custom_exams_full','You can save up to 200 custom exams.');
const read=(env,owner,id)=>env.DB.prepare('SELECT '+fields+' FROM custom_exams WHERE student_id=? AND id=?').bind(owner,id).first();
function details(body){
  const{id,version,...rest}=body;
  try{return JSON.stringify(normalizeCustomExam(rest));}catch{throw invalid();}
}
export async function listCustomExams(env,owner){
  await schema(env);
  return (await env.DB.prepare('SELECT '+fields+' FROM custom_exams WHERE student_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 200').bind(owner).all()).results.map(result);
}
export async function createCustomExam(env,owner,body){
  await schema(env);if(!validId(body.id)||Object.hasOwn(body,'version'))throw invalid();
  const value=details(body),now=Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO custom_exams(student_id,id,details,created_at,updated_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM custom_exams WHERE student_id=? AND deleted_at IS NULL)<200')
    .bind(owner,body.id,value,now,now,owner).run();
  const row=await read(env,owner,body.id);
  if(!row)throw full();
  if(row.deleted_at!==null||row.details!==value)throw changed();
  return result(row);
}
export async function changeCustomExam(env,owner,id,body,remove=false){
  await schema(env);
  if(!validId(id)||!Number.isSafeInteger(body.version)||body.version<1||Object.hasOwn(body,'id'))throw invalid();
  const restore=!remove&&body.deleted===false;
  if((remove||restore)&&Object.keys(body).some(key=>!(restore?['version','deleted']:['version']).includes(key)))throw invalid();
  const value=remove||restore?null:details(body),current=await read(env,owner,id);
  if(!current)throw missing();
  if(current.version!==body.version)throw changed();
  if(current.deleted_at!==null&&!restore)throw missing();
  const now=Date.now();
  const row=await env.DB.prepare('UPDATE custom_exams SET details=?,deleted_at=?,updated_at=?,version=version+1 WHERE student_id=? AND id=? AND version=? '+(restore?'AND (deleted_at IS NULL OR (SELECT COUNT(*) FROM custom_exams WHERE student_id=? AND deleted_at IS NULL)<200) ':'')+'RETURNING '+fields)
    .bind(value??current.details,remove?now:null,now,owner,id,body.version,...(restore?[owner]:[])).first();
  if(!row){const latest=await read(env,owner,id);if(restore&&latest?.version===body.version)throw full();throw changed();}
  return result(row);
}
