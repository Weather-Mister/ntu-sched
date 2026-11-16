import {encryptAuthorization,decryptAuthorization} from './security.mjs';

const ready=new WeakMap();
export const REPORT_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS report_clients(id TEXT PRIMARY KEY,redirects TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS report_pending(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,state TEXT NOT NULL,challenge TEXT NOT NULL,scope TEXT NOT NULL,expires_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS report_codes(code_hash TEXT PRIMARY KEY,student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,challenge TEXT NOT NULL,scope TEXT NOT NULL,expires_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS report_grants(id TEXT PRIMARY KEY,student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,client_id TEXT NOT NULL,access_hash TEXT NOT NULL UNIQUE,refresh_hash TEXT UNIQUE,scope TEXT NOT NULL,access_expires INTEGER NOT NULL,refresh_expires INTEGER NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS report_grants_owner ON report_grants(student_id)`,
 `CREATE TABLE IF NOT EXISTS report_state(student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,source TEXT NOT NULL,encrypted TEXT NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(student_id,source))`
];
export async function reportSchema(env){
 if(!ready.has(env.DB))ready.set(env.DB,(async()=>{for(const sql of REPORT_SCHEMA)await env.DB.prepare(sql).run();})().catch(e=>{ready.delete(env.DB);throw e;}));
 await ready.get(env.DB);
}
export async function readReportState(env,owner,source){
 await reportSchema(env);
 const row=await env.DB.prepare('SELECT encrypted,checked_at FROM report_state WHERE student_id=? AND source=?').bind(owner.student_id,source).first();
 return row?{value:await decryptAuthorization(env.NTU_CREDENTIAL_KEY,owner.student_id,'report:'+source,row.encrypted),checkedAt:row.checked_at}:null;
}
export async function writeReportState(env,owner,source,value,checkedAt=Date.now()){
 await reportSchema(env);
 const encrypted=await encryptAuthorization(env.NTU_CREDENTIAL_KEY,owner.student_id,'report:'+source,value);
 // A slower, older request must never replace a newer successful observation.
 await env.DB.prepare('INSERT INTO report_state(student_id,source,encrypted,checked_at) VALUES(?,?,?,?) ON CONFLICT(student_id,source) DO UPDATE SET encrypted=excluded.encrypted,checked_at=excluded.checked_at WHERE excluded.checked_at>report_state.checked_at').bind(owner.student_id,source,encrypted,checkedAt).run();
}
