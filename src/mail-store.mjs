import { ApiError, digest, encryptAuthorization, decryptAuthorization } from './security.mjs';
import { Roundcube, roundcubeEnvironment, roundcubeFormInputs, roundcubeSendResult } from './mail-roundcube.mjs';
import { mailReference, mailText, mailListText, messageFromPage, sanitizeMail, rootHeaders, validateSend, buildMime } from './mail-content.mjs';
import { pushConfiguration,sendPush } from './mail-push.mjs';
const clock=()=>Date.now();
const MAIL_SESSION_TTL_MS=3*60*1000;
const MAIL_LEASE_WAIT_MS=7000;
const MAIL_LEASE_POLL_MS=350;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function retryError(){const e=new ApiError(429,'mail_busy','Mail is updating. Please try again in a few seconds.');e.retryAfterSeconds=2;return e;}
async function claimMailbox(env,id,lease){
 // The scheduled notification check and an opened mailbox share a Roundcube
 // session. Wait for its fenced lease instead of failing the first page load.
 const deadline=clock()+MAIL_LEASE_WAIT_MS;
 for(;;){
  const now=clock();
  const row=await env.DB.prepare('UPDATE mail_state SET lease=?,lease_until=? WHERE student_id=? AND lease_until<? RETURNING *').bind(lease,now+180000,id,now).first();
  if(row)return row;
  if(now>=deadline)throw retryError();
  await wait(Math.min(MAIL_LEASE_POLL_MS,Math.max(1,deadline-now)));
 }
}
export async function withMailbox(env,owner,work,{retryRead=false}={}){
 const id=owner.student_id,lease=crypto.randomUUID();
 await env.DB.prepare('INSERT OR IGNORE INTO mail_state(student_id) VALUES(?)').bind(id).run();
 const row=await claimMailbox(env,id,lease),time=clock();
 let s,issuedAt=0,success=false;
 try{
  const auth=await env.DB.prepare("SELECT encrypted_authorization FROM student_connections WHERE student_id=? AND provider='ntu_mail' AND status='authorized'").bind(id).first();
  if(!auth)throw new ApiError(401,'reauthorize','Sign in again to connect NTU Mail.');
  const credentials=await decryptAuthorization(env.NTU_CREDENTIAL_KEY,id,'ntu_mail',auth.encrypted_authorization);
  const newSession=()=>new Roundcube({...credentials});
  s=newSession();
  if(row.upstream)try{
   const saved=await decryptAuthorization(env.NTU_CREDENTIAL_KEY,id,'mail_session',row.upstream);
   // A fixed age, not a sliding expiry: a busy mailbox must still rotate its NTU session.
   // Old saved sessions have no issuedAt and are intentionally discarded.
   if(Number.isFinite(saved.issuedAt)&&saved.issuedAt>0&&saved.issuedAt<=time&&time-saved.issuedAt<MAIL_SESSION_TTL_MS&&
      Array.isArray(saved.cookies)&&saved.env?.request_token){
    s.cookies=new Map(saved.cookies);s.env=saved.env;s.folders=saved.folders;issuedAt=saved.issuedAt;
   }
  }catch{}
  if(!s.env.request_token){
   try{await s.login();}
   catch(error){
    // Only repeat the safe session establishment for read operations.
    // An initial Roundcube login-page response does not mean the user's
    // verified Campus Week or saved NTU connection has expired.
    if(!retryRead||!['ntu_login_unconfirmed','ntu_unavailable'].includes(error?.code))throw error;
    s.close();await wait(650);s=newSession();await s.login();
   }
   issuedAt=clock();
  }
  let result;
  try{result=await work(s,row);}
  catch(error){
   // Retry only idempotent reads: moving mail or sending may have succeeded upstream.
   if(!retryRead||!['ntu_session_expired','ntu_action_failed'].includes(error?.code))throw error;
   s.close();s=newSession();await s.login();issuedAt=clock();
   result=await work(s,row);
  }
  success=true;return result;
 }catch(error){
  if(['ntu_session_expired','ntu_action_failed','reauthorize'].includes(error?.code))
   await env.DB.prepare('UPDATE mail_state SET upstream=NULL WHERE student_id=? AND lease=?').bind(id,lease).run();
  if(error?.code==='ntu_session_expired'||error?.code==='reauthorize')
   throw new ApiError(409,error.code,error.code==='ntu_session_expired'?'NTU Mail session expired. Please retry.':'Sign in again to reconnect NTU Mail.');
  if(error?.code==='ntu_action_failed')
   throw new ApiError(409,'ntu_action_failed','NTU rejected this mail action. Refresh Mail and retry.');
  throw error;
 }finally{
  try{if(success&&s){
   const retained={};for(const key of ['request_token','task','username','mailboxes','sent_mailbox','drafts_mailbox','trash_mailbox','junk_mailbox','archive_mailbox'])if(s.env[key]!==undefined)retained[key]=s.env[key];
   const encrypted=await encryptAuthorization(env.NTU_CREDENTIAL_KEY,id,'mail_session',{cookies:[...s.cookies],env:retained,folders:s.folders,issuedAt,expires:issuedAt+MAIL_SESSION_TTL_MS});
   await env.DB.prepare('UPDATE mail_state SET upstream=?,lease=NULL,lease_until=0 WHERE student_id=? AND lease=?').bind(encrypted,id,lease).run();
  }else await env.DB.prepare('UPDATE mail_state SET lease=NULL,lease_until=0 WHERE student_id=? AND lease=?').bind(id,lease).run();
  }finally{s?.close();}
 }
}
function mailPageCursor(page,offset){
 return btoa(JSON.stringify({page,offset})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
function readMailPageCursor(value){
 if(typeof value!=='string'||value.length>128||!/^[A-Za-z0-9_-]+$/.test(value))throw new ApiError(400,'invalid_mail','Invalid mailbox cursor.');
 let data;try{data=JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/')));}catch{}
 if(!data||!Number.isInteger(data.page)||data.page<1||data.page>1000||!Number.isInteger(data.offset)||data.offset<0||data.offset>1000)throw new ApiError(400,'invalid_mail','Invalid mailbox cursor.');
 return data;
}
export async function listMail(env,owner,url){
 const folder=url.searchParams.get('folder')||'inbox',query=(url.searchParams.get('q')||'').trim(),page=Number(url.searchParams.get('page')||1);
 const progressive=url.searchParams.has('limit')||url.searchParams.has('cursor'),limit=Number(url.searchParams.get('limit'));
 if(!['inbox','unread','starred','sent','drafts','trash','archived'].includes(folder)||query.length>200||
    !Number.isInteger(page)||page<1||page>1000||
    progressive&&(![25,50].includes(limit)||url.searchParams.has('page')))throw new ApiError(400,'invalid_mail','Invalid mailbox search.');
 const cursor=progressive&&url.searchParams.has('cursor')?readMailPageCursor(url.searchParams.get('cursor')):{page:1,offset:0};
 const cacheable=folder==='inbox'&&!query&&(!progressive&&page===1||progressive&&limit===25&&!url.searchParams.has('cursor'));
 if(cacheable){
  const cached=await env.DB.prepare('SELECT inbox,inbox_at FROM mail_state WHERE student_id=?').bind(owner.student_id).first();
  if(cached?.inbox&&clock()-cached.inbox_at<60000){
   const stored=JSON.parse(cached.inbox);
   if((!progressive&&!stored.progressive)||(progressive&&stored.progressive&&stored.limit===25))
    return {...stored,cached:true,updatedAt:cached.inbox_at};
  }
 }
 return withMailbox(env,owner,async s=>{
  const mailbox=['inbox','unread','starred'].includes(folder)?'INBOX':s.folders[folder==='archived'?'archive':folder];
  const filter=folder==='unread'?'UNSEEN':folder==='starred'?'FLAGGED':'';
  const mapped=rows=>rows.map(r=>({...mailReference(mailbox,r.uid),subject:mailListText(r.columns.subject,{subject:true})||'(No subject)',from:[r.columns.from,r.columns.fromto,r.columns.sender,r.columns.to].map(value=>mailListText(value)).find(Boolean)||'',
   date:mailListText(r.columns.date),snippet:mailListText(r.columns.snippet||r.columns.preview||r.columns.text||''),unread:!r.flags.seen,
   starred:!!r.flags.flagged,attachment:!!(r.flags.attachment||r.columns.attachment)}));
  let result;
  if(!progressive){
   const data=await s.list(mailbox,page,query,filter);
   result={folder,mailbox,page,hasMore:data.hasMore,count:data.count,messages:mapped(data.rows)};
  }else{
   const collected=[];let position=cursor.page,skip=cursor.offset,nextCursor=null,total=0,done=false;
   // Follow Roundcube's real page size (which may differ between accounts),
   // returning no more than requested even when NTU provides a larger page.
   for(let attempts=0;attempts<12;attempts++){
    const data=await s.list(mailbox,position,query,filter);
    total=data.count;
    if(skip>data.rows.length)throw new ApiError(409,'mail_changed','Mailbox changed while loading. Refresh Mail to start again.');
    const take=Math.min(limit-collected.length,data.rows.length-skip);
    collected.push(...data.rows.slice(skip,skip+take));
    if(skip+take<data.rows.length){nextCursor=mailPageCursor(position,skip+take);done=true;break;}
    if(!data.hasMore){done=true;break;}
    if(position===1000)throw new ApiError(409,'mail_changed','Reached the end of supported mailbox pages.');
    position++;skip=0;
    if(collected.length===limit){nextCursor=mailPageCursor(position,0);done=true;break;}
   }
   if(!done)throw new ApiError(502,'ntu_unavailable','NTU returned unusually small mailbox pages. Please retry.');
   result={folder,mailbox,progressive:true,limit,hasMore:!!nextCursor,nextCursor,count:total,messages:mapped(collected)};
  }
  if(cacheable)await env.DB.prepare('UPDATE mail_state SET inbox=?,inbox_at=? WHERE student_id=?').bind(JSON.stringify(result),clock(),owner.student_id).run();
  return {...result,updatedAt:clock()};
 },{retryRead:true});
}
export async function readMail(env,owner,url){
 const ref=mailReference(url.searchParams.get('mailbox'),url.searchParams.get('uid'));
 return withMailbox(env,owner,async s=>{
  const html=await(await s.fetch('?'+new URLSearchParams({_task:'mail',_action:'show',_mbox:ref.mailbox,_uid:ref.uid,_safe:'1',_token:s.env.request_token}),{},2*1024*1024)).text();
  const message=messageFromPage(html,ref),headers=await rootHeaders(s,ref);
  return {...message,body:undefined,html:sanitizeMail(message.body,url.searchParams.get('images')==='1'),replyTo:headers.replyTo};
 },{retryRead:true});
}
export async function attachment(env,owner,url){
 const ref=mailReference(url.searchParams.get('mailbox'),url.searchParams.get('uid')),part=url.searchParams.get('part');
 if(!/^\d+(?:\.\d+)*$/.test(part||''))throw new ApiError(400,'invalid_mail','Invalid attachment.');
 return withMailbox(env,owner,async s=>{
  const response=await s.fetch('?'+new URLSearchParams({_task:'mail',_action:'get',_mbox:ref.mailbox,_uid:ref.uid,_part:part,_download:'1',_token:s.env.request_token}),{},-1);
  if(/text\/html/i.test(response.headers.get('content-type')||'')&&!/attachment/i.test(response.headers.get('content-disposition')||'')){await response.body?.cancel();throw new ApiError(502,'attachment_unavailable','NTU could not return this attachment.');}
  let size=0;const limit=20*1024*1024;
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new ApiError(413,'attachment_too_large','Open attachments over 20 MB in official NTU Mail.');}
  const stream=response.body.pipeThrough(new TransformStream({transform(chunk,controller){size+=chunk.length;if(size>limit)controller.error(new Error('Attachment limit exceeded'));else controller.enqueue(chunk);}}));
  return new Response(stream,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':response.headers.get('content-disposition')||'attachment; filename="attachment"','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 },{retryRead:true});
}
async function findMessage(s,folder,messageId){
 const list=await s.list(folder,1,messageId,'','base','text');
 for(const row of list.rows.slice(0,5)){const ref=mailReference(folder,row.uid),headers=await rootHeaders(s,ref);if(headers.messageId.replace(/^<|>$/g,'')===messageId)return ref;}
 return null;
}
export async function sendMail(env,owner,body){
 body=validateSend(body);const payloadHash=await digest(JSON.stringify({to:body.to,subject:body.subject,text:body.text,reply:body.reply||null,...(body.html!==undefined?{html:body.html}:{}),...(body.attachments!==undefined?{attachments:await Promise.all(body.attachments.map(async file=>({...file,data:undefined,hash:await digest(file.data||'')})))}:{})})),id=body.id;
 let job=await env.DB.prepare('SELECT * FROM mail_sends WHERE student_id=? AND id=?').bind(owner.student_id,id).first();
 if(job){if(job.payload_hash!==payloadHash)throw new ApiError(409,'send_changed','This send request has changed. Start a new message.');return {id,status:job.status};}
 const cap=await env.DB.prepare('SELECT COUNT(*) AS n FROM mail_sends WHERE student_id=? AND created_at>?').bind(owner.student_id,clock()-3600000).first();if(cap.n>=30)throw new ApiError(429,'send_limit','Please wait before sending more mail.');
 return withMailbox(env,owner,async s=>{
  // Claim before provider calls. A retry can inspect this job but can never send it again.
  const messageId=crypto.randomUUID()+'@campus-week.local',time=clock();
  await env.DB.prepare("INSERT INTO mail_sends(student_id,id,payload_hash,message_id,status,created_at,updated_at) VALUES(?,?,?,?,'preparing',?,?)").bind(owner.student_id,id,payloadHash,messageId,time,time).run();
  let mayHaveSent=false;
  try{
   const reply=body.reply?await rootHeaders(s,mailReference(body.reply.mailbox,body.reply.uid)):null;
   const mime=buildMime(body,owner.student_number+'@ntu.edu.tw',messageId,reply,true),form=new FormData();
   for(const [key,value]of Object.entries({_task:'mail',_action:'import',_mbox:s.folders.drafts,_remote:'1',_token:s.env.request_token}))form.append(key,value);
   form.append('_file[]',mime,'campus-week.eml');
   await s.fetch('?_task=mail&_action=import&_mbox='+encodeURIComponent(s.folders.drafts),{method:'POST',body:form,headers:{'X-Requested-With':'XMLHttpRequest','X-Roundcube-Request':s.env.request_token}});
   const draft=await findMessage(s,s.folders.drafts,messageId);if(!draft)throw new ApiError(502,'send_prepare_failed','NTU could not prepare your message. Your text is still in the editor.');
   const compose=await(await s.fetch('?'+new URLSearchParams({_task:'mail',_action:'compose',_draft_uid:draft.uid,_mbox:s.folders.drafts,_token:s.env.request_token}))).text(),config=roundcubeEnvironment(compose),fields=roundcubeFormInputs(compose);
   if(!config.compose_id||String(config.draft_id)!==draft.uid||!fields._token)throw new ApiError(502,'send_prepare_failed','NTU could not open the prepared draft.');
   const attachments=Object.values(config.attachments||{}),expected=body.attachments||[];
   if(attachments.length!==expected.length||expected.some(file=>attachments.filter(a=>a.name===file.name).length!==expected.filter(a=>a.name===file.name).length))throw new ApiError(502,'send_attachment_missing','NTU did not load every attachment. Restore your draft and retry.');
   Object.assign(fields,{_task:'mail',_action:'send',_id:String(config.compose_id),_from:owner.student_number+'@ntu.edu.tw',_to:body.to,_cc:'',_bcc:'',_subject:body.subject,_message:body.html||body.text,_is_html:body.html?'1':'0',_draft:'',_draft_saveid:draft.uid,_framed:'1',_charset:'UTF-8',_dsn:'',_mdn:''});
   await env.DB.prepare("UPDATE mail_sends SET status='sending',updated_at=? WHERE student_id=? AND id=?").bind(clock(),owner.student_id,id).run();mayHaveSent=true;
   const result=roundcubeSendResult(await(await s.fetch('?_task=mail&_action=send',{method:'POST',body:new URLSearchParams(fields),headers:{'Content-Type':'application/x-www-form-urlencoded'}})).text());
   const status=result.accepted?'sent':result.rejected?'failed':'uncertain';
   await env.DB.prepare('UPDATE mail_sends SET status=?,updated_at=? WHERE student_id=? AND id=?').bind(status,clock(),owner.student_id,id).run();
   await env.DB.prepare('UPDATE mail_state SET inbox_at=0 WHERE student_id=?').bind(owner.student_id).run();return {id,status};
  }catch(error){await env.DB.prepare('UPDATE mail_sends SET status=?,updated_at=? WHERE student_id=? AND id=?').bind(mayHaveSent?'uncertain':'failed',clock(),owner.student_id,id).run();if(mayHaveSent)return {id,status:'uncertain'};throw error;}
 });
}
export async function checkSend(env,owner,id){
 const job=await env.DB.prepare('SELECT * FROM mail_sends WHERE student_id=? AND id=?').bind(owner.student_id,id).first();if(!job)throw new ApiError(404,'not_found','Send request not found.');
 if(job.status==='sent'||job.status==='failed')return {id,status:job.status};
 return withMailbox(env,owner,async s=>{const found=await findMessage(s,s.folders.sent,job.message_id);if(found)await env.DB.prepare("UPDATE mail_sends SET status='sent',updated_at=? WHERE student_id=? AND id=?").bind(clock(),owner.student_id,id).run();return {id,status:found?'sent':job.status==='preparing'?'failed':'uncertain'};});
}
export async function refreshMailNotifications(env){
 const due=await env.DB.prepare('SELECT m.student_id,s.student_number FROM mail_state m JOIN students s ON s.id=m.student_id WHERE m.next_check<=? AND m.lease_until<? AND EXISTS(SELECT 1 FROM mail_push p WHERE p.student_id=m.student_id) ORDER BY m.next_check LIMIT 4').bind(clock(),clock()).all();
 for(const owner of due.results){try{await withMailbox(env,owner,async(s,state)=>{
   const result=await s.list('INBOX',1);
   const latest=result.rows.reduce((n,r)=>Math.max(n,Number(r.uid)),0),old=state.baseline?JSON.parse(state.baseline):null;
   // Never notify the initial history; newest UID also catches arrivals already marked read.
   let pending=null;if(old&&latest>old.uid)pending={title:'New NTU mail',body:'You have new mail in Campus Mail.',tag:'ntu-mail-'+owner.student_number,studentNumber:owner.student_number,url:'/skeleton/?mail=1'};
   if(pending){const config=await pushConfiguration(env),devices=await env.DB.prepare('SELECT * FROM mail_push WHERE student_id=? AND notified_uid<?').bind(owner.student_id,latest).all();let failed=false;
    for(const device of devices.results){try{const sub=await decryptAuthorization(env.NTU_CREDENTIAL_KEY,owner.student_id,'mail_push',device.encrypted_subscription),status=await sendPush(env,sub,pending,config);if(status===404||status===410)await env.DB.prepare('DELETE FROM mail_push WHERE student_id=? AND id=?').bind(owner.student_id,device.id).run();else if(status<200||status>=300)throw new Error('Push rejected');else await env.DB.prepare('UPDATE mail_push SET notified_uid=? WHERE student_id=? AND id=?').bind(latest,owner.student_id,device.id).run();}catch{failed=true;}}
    if(failed)throw new ApiError(502,'push_retry','Notification delivery will retry.');
   }
   if(!old||latest<old.uid)await env.DB.prepare('UPDATE mail_push SET notified_uid=? WHERE student_id=?').bind(latest,owner.student_id).run();
   await env.DB.prepare('UPDATE mail_state SET baseline=?,checked_at=?,next_check=?,failures=0,last_error=NULL,inbox_at=0 WHERE student_id=?').bind(JSON.stringify({uid:latest}),clock(),Math.floor(clock()/300000)*300000+300000,owner.student_id).run();
  },{retryRead:true});}catch(error){await env.DB.prepare('UPDATE mail_state SET next_check=?,failures=failures+1,last_error=? WHERE student_id=?').bind(clock()+(error.code==='reauthorize'?365*86400000:Math.min(3600000,300000*2**Math.min(4,(await env.DB.prepare('SELECT failures FROM mail_state WHERE student_id=?').bind(owner.student_id).first())?.failures||0))),['reauthorize','ntu_session_expired'].includes(error.code)?'Sign in again to reconnect NTU Mail.':'Mail checks will retry automatically.',owner.student_id).run();}}
}
