import {parseHTML} from 'linkedom';
import {ApiError,digest,encryptAuthorization,decryptAuthorization} from './security.mjs';
import {validateSend,mailReference} from './mail-content.mjs';
import {sendMail,checkSend} from './mail-store.mjs';
import {cleanRichHtml,MAX_ATTACHMENTS,MAX_ATTACHMENT_BYTES,PART_BYTES} from '../public/mail-rich.mjs';
import {COMPOSER_SCHEMA} from './mail-composer-schema.mjs';
const schemas=new WeakMap(),clock=()=>Date.now();
export function ensureComposerSchema(env){
 if(!schemas.has(env.DB))schemas.set(env.DB,(async()=>{for(const sql of COMPOSER_SCHEMA)await env.DB.prepare(sql).run();})().catch(error=>{schemas.delete(env.DB);throw error;}));
 return schemas.get(env.DB);
}
const seal=(env,owner,kind,value)=>encryptAuthorization(env.NTU_CREDENTIAL_KEY,owner.student_id,'mail_compose:'+kind,value);
const unseal=(env,owner,kind,value)=>decryptAuthorization(env.NTU_CREDENTIAL_KEY,owner.student_id,'mail_compose:'+kind,value);
function id(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new ApiError(400,'invalid_draft','Invalid draft or attachment.');return value;}
function conflict(){return new ApiError(409,'draft_conflict','This draft changed in another tab or was queued. Reopen it from Drafts or Outbox.');}
function content(input){
 if(!input||typeof input.to!=='string'||input.to.length>2000||/[\r\n\0]/.test(input.to)||typeof input.subject!=='string'||input.subject.length>500||/[\r\n\0]/.test(input.subject)||typeof input.body!=='string'||input.body.length>100000||typeof input.bodyHtml!=='string'||input.bodyHtml.length>220000||!Array.isArray(input.attachments)||input.attachments.length>MAX_ATTACHMENTS)throw new ApiError(400,'invalid_draft','The draft exceeds the supported limits.');
 const {document}=parseHTML('<html><body></body></html>');
 return {to:input.to,subject:input.subject,body:input.body,bodyHtml:cleanRichHtml(input.bodyHtml,document),reply:input.reply?mailReference(input.reply.mailbox,input.reply.uid):null,attachments:[...new Set(input.attachments.map(a=>id(a.id)))]};
}
async function fileRefs(env,owner,draftId,ids){
 const files=[];
 for(const fileId of ids){const row=await env.DB.prepare('SELECT * FROM mail_files WHERE student_id=? AND draft_id=? AND id=? AND ready=1').bind(owner.student_id,draftId,fileId).first();if(!row)throw new ApiError(409,'attachment_incomplete','An attachment is missing or has not finished uploading.');files.push(await unseal(env,owner,'file:'+draftId+':'+fileId,row.encrypted_metadata));}
 if(files.reduce((n,f)=>n+f.size,0)>MAX_ATTACHMENT_BYTES)throw new ApiError(400,'attachments_limit','Attachments can total up to 20 MB.');return files;
}
export async function saveComposeDraft(env,owner,input){
 await ensureComposerSchema(env);const draftId=id(input?.id),data=content(input),version=input.version;
 if(!Number.isSafeInteger(version)||version<0)throw conflict();
 const refs=await fileRefs(env,owner,draftId,data.attachments);data.attachments=refs;
 const encrypted=await seal(env,owner,'draft:'+draftId,data),time=clock();
 const row=version===0?await env.DB.prepare("INSERT INTO mail_drafts(student_id,id,encrypted_body,version,updated_at) SELECT ?,?,?,1,? WHERE (SELECT COUNT(*) FROM mail_drafts WHERE student_id=? AND state='open')<50 ON CONFLICT(student_id,id) DO NOTHING RETURNING version").bind(owner.student_id,draftId,encrypted,time,owner.student_id).first():await env.DB.prepare("UPDATE mail_drafts SET encrypted_body=?,version=version+1,updated_at=? WHERE student_id=? AND id=? AND version=? AND state='open' RETURNING version").bind(encrypted,time,owner.student_id,draftId,version).first();
 if(!row)throw conflict();return {id:draftId,version:row.version};
}
export async function listComposeDrafts(env,owner,draftId){
 await ensureComposerSchema(env);
 if(draftId){const row=await env.DB.prepare("SELECT * FROM mail_drafts WHERE student_id=? AND id=? AND state='open'").bind(owner.student_id,id(draftId)).first();if(!row)throw new ApiError(404,'draft_missing','Draft not found.');return {draft:{...await unseal(env,owner,'draft:'+row.id,row.encrypted_body),id:row.id,version:row.version,updatedAt:row.updated_at}};}
 const rows=await env.DB.prepare("SELECT * FROM mail_drafts WHERE student_id=? AND state='open' ORDER BY updated_at DESC LIMIT 50").bind(owner.student_id).all(),drafts=[];
 for(const row of rows.results){const data=await unseal(env,owner,'draft:'+row.id,row.encrypted_body);drafts.push({id:row.id,version:row.version,to:data.to,subject:data.subject,snippet:data.body.slice(0,180),updatedAt:row.updated_at});}return {drafts};
}
export async function deleteComposeDraft(env,owner,input){
 await ensureComposerSchema(env);const row=await env.DB.prepare("UPDATE mail_drafts SET state='deleted',version=version+1,updated_at=? WHERE student_id=? AND id=? AND state='open' AND version=? RETURNING id").bind(clock(),owner.student_id,id(input.id),input.version).first();if(!row)throw conflict();return {deleted:true};
}
export async function uploadComposePart(env,owner,input){
 await ensureComposerSchema(env);const draftId=id(input?.draftId),fileId=id(input.id),{name,type,size,part,data}=input;
 if(typeof name!=='string'||!name||name.length>180||/[\r\n\0]/.test(name)||typeof type!=='string'||type.length>120||!/^[-\w.+]+\/[-\w.+]+$/.test(type)||!Number.isSafeInteger(size)||size<0||size>MAX_ATTACHMENT_BYTES||!Number.isSafeInteger(part)||part<0||part>=Math.max(1,Math.ceil(size/PART_BYTES))||typeof data!=='string'||data.length%4!==0||data.length>Math.ceil(PART_BYTES/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new ApiError(400,'invalid_attachment','Invalid attachment data.');
 const bytes=atob(data).length,parts=Math.max(1,Math.ceil(size/PART_BYTES));
 if(bytes!==Math.min(PART_BYTES,size-part*PART_BYTES))throw new ApiError(400,'invalid_attachment','Attachment length does not match.');
 const draft=await env.DB.prepare("SELECT id FROM mail_drafts WHERE student_id=? AND id=? AND state='open'").bind(owner.student_id,draftId).first();if(!draft)throw conflict();
 const metadata={id:fileId,name,type,size};
 await env.DB.prepare('INSERT OR IGNORE INTO mail_files(student_id,draft_id,id,encrypted_metadata,size,parts) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM mail_files WHERE student_id=? AND draft_id=?)<? AND (SELECT COALESCE(SUM(size),0) FROM mail_files WHERE student_id=? AND draft_id=?)+?<=?').bind(owner.student_id,draftId,fileId,await seal(env,owner,'file:'+draftId+':'+fileId,metadata),size,parts,owner.student_id,draftId,MAX_ATTACHMENTS,owner.student_id,draftId,size,MAX_ATTACHMENT_BYTES).run();
 const file=await env.DB.prepare('SELECT * FROM mail_files WHERE student_id=? AND draft_id=? AND id=?').bind(owner.student_id,draftId,fileId).first();if(!file)throw new ApiError(400,'attachments_limit','You can attach up to 8 files, totaling 20 MB.');
 if(JSON.stringify(await unseal(env,owner,'file:'+draftId+':'+fileId,file.encrypted_metadata))!==JSON.stringify(metadata))throw conflict();
 const hash=await digest(data);
 await env.DB.prepare('INSERT OR IGNORE INTO mail_file_parts(student_id,draft_id,file_id,part,encrypted_data,hash,size) VALUES(?,?,?,?,?,?,?)').bind(owner.student_id,draftId,fileId,part,await seal(env,owner,'part:'+draftId+':'+fileId+':'+part,{data}),hash,bytes).run();
 const saved=await env.DB.prepare('SELECT hash FROM mail_file_parts WHERE student_id=? AND draft_id=? AND file_id=? AND part=?').bind(owner.student_id,draftId,fileId,part).first();if(saved.hash!==hash)throw conflict();
 const total=await env.DB.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(size),0) AS size FROM mail_file_parts WHERE student_id=? AND draft_id=? AND file_id=?').bind(owner.student_id,draftId,fileId).first();
 const ready=total.n===parts&&total.size===size;if(ready)await env.DB.prepare('UPDATE mail_files SET ready=1 WHERE student_id=? AND draft_id=? AND id=?').bind(owner.student_id,draftId,fileId).run();
 return {attachment:metadata,ready};
}
export async function removeComposeFile(env,owner,input){
 await ensureComposerSchema(env);const draftId=id(input.draftId),fileId=id(input.id);
 const draft=await env.DB.prepare("SELECT * FROM mail_drafts WHERE student_id=? AND id=? AND state='open'").bind(owner.student_id,draftId).first();if(!draft)throw conflict();
 const data=await unseal(env,owner,'draft:'+draftId,draft.encrypted_body);if(data.attachments.some(a=>a.id===fileId))throw new ApiError(409,'attachment_in_use','Save the draft without this attachment first.');
 // Queued snapshots retain their immutable files even if this draft was restored.
 const used=await env.DB.prepare('SELECT id FROM mail_jobs WHERE student_id=? AND draft_id=? LIMIT 1').bind(owner.student_id,draftId).first();
 if(!used)await env.DB.batch([env.DB.prepare('DELETE FROM mail_file_parts WHERE student_id=? AND draft_id=? AND file_id=?').bind(owner.student_id,draftId,fileId),env.DB.prepare('DELETE FROM mail_files WHERE student_id=? AND draft_id=? AND id=?').bind(owner.student_id,draftId,fileId)]);return {deleted:true};
}
export async function queueComposeMail(env,owner,input){
 await ensureComposerSchema(env);const jobId=id(input?.id),draftId=id(input.draftId);
 if(!Number.isSafeInteger(input.version)||input.version<1)throw conflict();
 const existing=await env.DB.prepare('SELECT * FROM mail_jobs WHERE student_id=? AND id=?').bind(owner.student_id,jobId).first();
 if(existing){if(existing.draft_id!==draftId)throw conflict();return {id:jobId,status:existing.status};}
 const draft=await env.DB.prepare("SELECT * FROM mail_drafts WHERE student_id=? AND id=? AND state='open' AND version=?").bind(owner.student_id,draftId,input.version).first();if(!draft)throw conflict();
 const data=await unseal(env,owner,'draft:'+draftId,draft.encrypted_body);await fileRefs(env,owner,draftId,data.attachments.map(a=>a.id));
 validateSend({id:jobId,to:data.to,subject:data.subject,text:data.body,html:data.bodyHtml,attachments:data.attachments,...(data.reply?{reply:data.reply}:{})});
 const time=clock(),sendAt=input.sendAt==null?time:Date.parse(input.sendAt);
 if(!Number.isFinite(sendAt)||(input.sendAt!=null&&(sendAt<time+60000||sendAt>time+366*86400000)))throw new ApiError(400,'invalid_schedule','Choose a send time at least one minute ahead and within one year.');
 const queued=await env.DB.prepare("SELECT COUNT(*) AS n FROM mail_jobs WHERE student_id=? AND status IN ('pending','scheduled','processing','uncertain')").bind(owner.student_id).first();if(queued.n>=50)throw new ApiError(429,'outbox_limit','Check or cancel existing Outbox messages before queuing more.');
 const payload={...data,draftId},encrypted=await seal(env,owner,'job:'+jobId,payload),hash=await digest(JSON.stringify(payload)),status=input.sendAt==null?'pending':'scheduled';
 await env.DB.batch([
  env.DB.prepare("INSERT INTO mail_jobs(student_id,id,draft_id,encrypted_body,payload_hash,send_at,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mail_drafts WHERE student_id=? AND id=? AND state='open' AND version=?) ON CONFLICT(student_id,id) DO NOTHING").bind(owner.student_id,jobId,draftId,encrypted,hash,sendAt,status,time,time,owner.student_id,draftId,input.version),
  env.DB.prepare("UPDATE mail_drafts SET state='queued',updated_at=? WHERE student_id=? AND id=? AND EXISTS(SELECT 1 FROM mail_jobs WHERE student_id=? AND id=? AND draft_id=?)").bind(time,owner.student_id,draftId,owner.student_id,jobId,draftId)
 ]);
 const saved=await env.DB.prepare('SELECT * FROM mail_jobs WHERE student_id=? AND id=?').bind(owner.student_id,jobId).first();if(!saved||saved.payload_hash!==hash)throw conflict();
 return input.sendAt==null?processComposeJob(env,owner,jobId):{id:jobId,status};
}
export async function processComposeJob(env,owner,jobId){
 const time=clock();
 const job=await env.DB.prepare("UPDATE mail_jobs SET status='processing',lease_until=?,updated_at=? WHERE student_id=? AND id=? AND send_at<=? AND (status IN ('pending','scheduled') OR (status='processing' AND lease_until<?)) RETURNING *").bind(time+240000,time,owner.student_id,jobId,time,time).first();
 if(!job){const row=await env.DB.prepare('SELECT status FROM mail_jobs WHERE student_id=? AND id=?').bind(owner.student_id,jobId).first();return {id:jobId,status:row?.status||'uncertain'};}
 let status='failed';
 try{
  const data=await unseal(env,owner,'job:'+jobId,job.encrypted_body),attachments=[];
  for(const file of data.attachments){let base64='';for(let offset=0;;offset+=8){const rows=await env.DB.prepare('SELECT * FROM mail_file_parts WHERE student_id=? AND draft_id=? AND file_id=? ORDER BY part LIMIT 8 OFFSET ?').bind(owner.student_id,data.draftId,file.id,offset).all();for(const row of rows.results)base64+=(await unseal(env,owner,'part:'+data.draftId+':'+file.id+':'+row.part,row.encrypted_data)).data;if(rows.results.length<8)break;}attachments.push({...file,data:base64});}
  const result=await sendMail(env,owner,{id:jobId,to:data.to,subject:data.subject,text:data.body,html:data.bodyHtml,attachments,...(data.reply?{reply:data.reply}:{})});
  status=['sent','failed'].includes(result.status)?result.status:'uncertain';
 }catch{
  const send=await env.DB.prepare('SELECT status FROM mail_sends WHERE student_id=? AND id=?').bind(owner.student_id,jobId).first();status=send&&send.status!=='failed'?'uncertain':'failed';
 }
 await env.DB.prepare('UPDATE mail_jobs SET status=?,lease_until=0,updated_at=? WHERE student_id=? AND id=?').bind(status,clock(),owner.student_id,jobId).run();return {id:jobId,status};
}
export async function listComposeJobs(env,owner){
 await ensureComposerSchema(env);const rows=await env.DB.prepare('SELECT * FROM mail_jobs WHERE student_id=? ORDER BY created_at DESC LIMIT 50').bind(owner.student_id).all(),jobs=[];
 for(const row of rows.results){const data=await unseal(env,owner,'job:'+row.id,row.encrypted_body);jobs.push({id:row.id,draftId:row.draft_id,to:data.to,subject:data.subject,status:row.status,sendAt:row.send_at,updatedAt:row.updated_at});}return {jobs};
}
export async function changeComposeJob(env,owner,input){
 await ensureComposerSchema(env);const jobId=id(input.id);let job=await env.DB.prepare('SELECT * FROM mail_jobs WHERE student_id=? AND id=?').bind(owner.student_id,jobId).first();if(!job)throw new ApiError(404,'not_found','Outbox message not found.');
 if(input.action==='cancel'){
  const row=await env.DB.prepare("UPDATE mail_jobs SET status='cancelled',updated_at=? WHERE student_id=? AND id=? AND status IN ('pending','scheduled') RETURNING id").bind(clock(),owner.student_id,jobId).first();if(!row)throw new ApiError(409,'send_in_progress','This message is already being processed. Check delivery.');return {id:jobId,status:'cancelled'};
 }
 if(input.action==='check'){
  if(job.status!=='uncertain'&&job.status!=='processing')return {id:jobId,status:job.status};
  if(job.status==='processing'&&job.lease_until>clock())return {id:jobId,status:'processing'};
  const result=await checkSend(env,owner,jobId);const status=result.status==='sent'?'sent':result.status==='failed'?'failed':'uncertain';await env.DB.prepare('UPDATE mail_jobs SET status=?,updated_at=? WHERE student_id=? AND id=?').bind(status,clock(),owner.student_id,jobId).run();return {id:jobId,status};
 }
 if(input.action==='restore'){
  if(!['failed','cancelled'].includes(job.status))throw new ApiError(409,'send_unresolved','Check or cancel this send before restoring the draft.');
  // One original draft per job: never overwrite a draft already edited/restored.
  await env.DB.prepare("UPDATE mail_drafts SET state='open',version=version+1,updated_at=? WHERE student_id=? AND id=? AND state='queued' AND NOT EXISTS(SELECT 1 FROM mail_jobs WHERE student_id=? AND draft_id=? AND status IN ('pending','scheduled','processing','uncertain'))").bind(clock(),owner.student_id,job.draft_id,owner.student_id,job.draft_id).run();return listComposeDrafts(env,owner,job.draft_id);
 }
 throw new ApiError(400,'invalid_action','Choose an Outbox action.');
}
export async function processDueComposeJobs(env){
 await ensureComposerSchema(env);const time=clock(),due=await env.DB.prepare("SELECT j.id,j.student_id,s.student_number FROM mail_jobs j JOIN students s ON s.id=j.student_id WHERE j.send_at<=? AND (j.status IN ('pending','scheduled') OR (j.status='processing' AND j.lease_until<?)) ORDER BY j.send_at LIMIT 4").bind(time,time).all();
 for(const job of due.results)await processComposeJob(env,job,job.id);
}
