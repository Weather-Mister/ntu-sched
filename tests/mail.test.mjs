import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../src/worker.mjs';
import {digest,randomToken,encryptAuthorization,decryptAuthorization,base64url} from '../src/security.mjs';
import {sanitizeMail,buildMime,validateSend,rootHeaders} from '../src/mail-content.mjs';
import {parseRoundcubeCommands} from '../src/mail-roundcube.mjs';
import {encryptedPush,validateSubscription} from '../src/mail-push.mjs';
import {refreshMailNotifications} from '../src/mail-store.mjs';
const APP='https://campus.example',KEY='ab'.repeat(32),realFetch=globalThis.fetch;
let calls=[],mime='',latest=20,sendMode='ok',pushStatus=201,failListOnce=0,failMarkOnce=0,virtualMessages=0;
beforeEach(()=>{calls=[];mime='';latest=20;sendMode='ok';pushStatus=201;failListOnce=0;failMarkOnce=0;virtualMessages=0;});
after(()=>{globalThis.fetch=realFetch;});
globalThis.fetch=async(url,init={})=>{
 const u=new URL(url),fields=init.body instanceof URLSearchParams?init.body:u.searchParams,action=fields.get('_action')||u.searchParams.get('_action');calls.push({url:u.href,action,init});
 if(u.hostname==='fcm.googleapis.com')return new Response(null,{status:pushStatus});
 assert.equal(u.origin,'https://wmail1.cc.ntu.edu.tw');
 if(action==='login')return new Response('rcmail.set_env('+JSON.stringify({task:'mail',request_token:'nonce',username:fields.get('_user')})+');',{headers:{'Set-Cookie':'roundcube_sessid=test'}});
 if(!action)return new Response('<input type="hidden" name="_token" value="nonce">');
 if(['list','search'].includes(action)){
  if(failListOnce>0){failListOnce--;return Response.json({action,exec:'this.display_message("Mailbox session rejected","error");'});}
  if(virtualMessages&&action==='list'){
   const page=Number(fields.get('_page')||1),perPage=40,rows=[];
   const start=(page-1)*perPage,end=Math.min(virtualMessages,start+perPage);
   for(let i=start;i<end;i++)rows.push('this.add_message_row('+JSON.stringify(String(virtualMessages-i))+','+JSON.stringify({subject:'Message '+(virtualMessages-i),from:'Professor',date:'Today 12:00',snippet:'Sample message preview'})+','+JSON.stringify({seen:false})+');');
   return Response.json({action,env:{pagecount:Math.ceil(virtualMessages/perPage),messagecount:virtualMessages},exec:rows.join('')});
  }
  const uid=fields.get('_mbox')==='Drafts'?'88':String(latest),subject=fields.get('_mbox')==='Drafts'?'Draft':'Hello <b>student</b>';
  return Response.json({action,env:{pagecount:1,messagecount:1},exec:'this.add_message_row('+JSON.stringify(uid)+','+JSON.stringify({subject,from:'Professor &lt;prof@ntu.edu.tw&gt;',date:'Today 12:00'})+','+JSON.stringify({seen:false})+');'});
 }
 if(action==='show')return new Response('rcmail.set_env({"task":"mail","request_token":"nonce"});<h2 class="subject">Lesson news</h2><table id="message-headers"><tr><td>From: Professor</td></tr></table><div id="messagebody"><p style="color:blue" onclick="steal()">A formatted message</p><script>steal()</script><img src="https://tracker.example/open"></div><ul id="attachment-list"><li><a href="?_action=get&_part=2">notes.pdf</a></li></ul>');
 if(action==='viewsource')return new Response(mime||'From: Professor <prof@ntu.edu.tw>\r\nReply-To: reply@ntu.edu.tw\r\nMessage-ID: <original@ntu.edu.tw>\r\nReferences: <earlier@ntu.edu.tw>\r\n\r\nbody');
 if(action==='get')return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Disposition':'attachment; filename="notes.pdf"'}});
 if(action==='import'){mime=await init.body.get('_file[]').text();return Response.json({ok:true});}
 if(action==='compose')return new Response('rcmail.set_env({"compose_id":"draft-nonce","draft_id":"88"});<input type="hidden" name="_token" value="nonce">');
 if(action==='send'){if(sendMode==='disconnect')throw new Error('Network lost after delivery');return new Response('<script>parent.rcmail.sent_successfully("confirmation");</script>');}
 if(['mark','move'].includes(action)){
  if(action==='mark'&&failMarkOnce>0){failMarkOnce--;return Response.json({action,exec:'this.display_message("Mailbox session rejected","error");'});}
  return Response.json({action,exec:''});
 }
 throw new Error('Unknown mocked action '+action);
};
function env(){const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const DB={prepare(sql){const stmt=sqlite.prepare(sql);let args=[];return{bind(...a){args=a;return this;},async first(){return stmt.get(...args)||null;},async all(){return{results:stmt.all(...args)};},async run(){return{meta:stmt.run(...args)};}};},async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
 return {DB,sqlite,APP_ORIGIN:APP,NTU_CREDENTIAL_KEY:KEY};}
async function identity(e,number='b12345678'){
 const id=crypto.randomUUID(),token=randomToken(),csrf=randomToken();e.sqlite.prepare('INSERT INTO students VALUES(?,?,?)').run(id,number,1);e.sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(await digest(token),id,csrf,1,Math.floor(Date.now()/1000)+3600);
 const auth=await encryptAuthorization(KEY,id,'ntu_mail',{username:number,password:'test-password'});e.sqlite.prepare("INSERT INTO student_connections(student_id,provider,encrypted_authorization,status,verified_at) VALUES(?,'ntu_mail',?,'authorized',?)").run(id,auth,Date.now());return {student_id:id,student_number:number,token,csrf};}
async function request(e,a,path,method='GET',body,extra={}){const headers=new Headers({Origin:APP,...extra});if(a){headers.set('Cookie','__Host-campus_week='+a.token);headers.set('X-CSRF-Token',a.csrf);}if(body)headers.set('Content-Type','application/json');return worker.fetch(new Request(APP+'/api/mail/'+path,{method,headers,body:body?JSON.stringify(body):undefined}),e);}
const sendBody=()=>({id:crypto.randomUUID(),to:'friend@ntu.edu.tw',subject:'Hello',text:'A test message'});
async function subscription(){const key=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return{key,value:{endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:base64url(new Uint8Array(await crypto.subtle.exportKey('raw',key.publicKey))),auth:base64url(crypto.getRandomValues(new Uint8Array(16)))}}};}
test('mail list is scoped to the authenticated student; session and metadata reuse avoid repeated NTU logins',async()=>{
 const e=env(),a=await identity(e),b=await identity(e,'r23456789');let response=await request(e,a,'list');assert.equal(response.status,200);let result=await response.json();assert.equal(result.studentNumber,a.student_number);assert.equal(result.messages[0].subject,'Hello student');assert.equal(result.messages[0].unread,true);
 const before=calls.length;await request(e,a,'list');assert.equal(calls.length,before);
 await request(e,b,'list');assert.equal(calls.filter(c=>c.action==='login').length,2);
 const record=e.sqlite.prepare('SELECT upstream FROM mail_state WHERE student_id=?').get(a.student_id);assert.ok(!record.upstream.includes('nonce'));assert.ok(!record.upstream.includes('test-password'));
 await request(e,a,'list?folder=sent');assert.equal(calls.filter(c=>c.action==='login').length,2);
});
test('NTU mail sessions expire three minutes after login even while requests keep succeeding',async()=>{
 const e=env(),a=await identity(e),originalNow=Date.now,started=originalNow();
 try{
  Date.now=()=>started;
  assert.equal((await request(e,a,'list?folder=sent')).status,200);
  const saved=async()=>decryptAuthorization(KEY,a.student_id,'mail_session',e.sqlite.prepare('SELECT upstream FROM mail_state WHERE student_id=?').get(a.student_id).upstream);
  const first=await saved();assert.equal(first.issuedAt,started);assert.equal(first.expires,started+180000);
  Date.now=()=>started+150000;
  assert.equal((await request(e,a,'list?folder=sent')).status,200);
  assert.deepEqual({issuedAt:(await saved()).issuedAt,expires:(await saved()).expires},{issuedAt:started,expires:started+180000});
  assert.equal(calls.filter(c=>c.action==='login').length,1);
  Date.now=()=>started+181000;
  assert.equal((await request(e,a,'list?folder=sent')).status,200);
  assert.equal(calls.filter(c=>c.action==='login').length,2);
  const fresh=await saved();assert.equal(fresh.issuedAt,started+181000);assert.equal(fresh.expires,started+361000);
 }finally{Date.now=originalNow;e.sqlite.close();}
});
test('mailbox reads recover once from an NTU action error using a fresh session',async()=>{
 const e=env(),a=await identity(e);
 assert.equal((await request(e,a,'list?folder=sent')).status,200);
 failListOnce=1;
 const r=await request(e,a,'list?folder=sent');
 assert.equal(r.status,200);assert.equal((await r.json()).count,1);
 assert.equal(calls.filter(c=>c.action==='login').length,2);
 e.sqlite.close();
});
test('rejected mail mutations discard the faulty session without replaying the operation',async()=>{
 const e=env(),a=await identity(e);
 assert.equal((await request(e,a,'list?folder=sent')).status,200);
 failMarkOnce=1;
 const body={mailbox:'INBOX',uid:'20',action:'read'};
 const failed=await request(e,a,'action','POST',body);
 assert.equal(failed.status,409);assert.equal((await failed.json()).error.code,'ntu_action_failed');
 assert.equal(calls.filter(c=>c.action==='mark').length,1);
 assert.equal(e.sqlite.prepare('SELECT upstream FROM mail_state WHERE student_id=?').get(a.student_id).upstream,null);
 assert.equal((await request(e,a,'action','POST',body)).status,200);
 assert.equal(calls.filter(c=>c.action==='login').length,2);
 assert.equal(calls.filter(c=>c.action==='mark').length,2);
 e.sqlite.close();
});
test('Roundcube subject controls are removed and sender is read from the fromto column',async()=>{
 const e=env(),a=await identity(e);
 virtualMessages=3;
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init={})=>{
  const u=new URL(url),fields=init.body instanceof URLSearchParams?init.body:u.searchParams;
  const action=fields.get('_action')||u.searchParams.get('_action');
  if(action==='list')return Response.json({action,env:{pagecount:1,messagecount:1},exec:'this.add_message_row("3",'+JSON.stringify({
   subject:'<a href="#">Real subject</a><span class="sr-only">Open in new window</span>',
   from:'<span class="empty"></span>',
   fromto:'<span class="adr">Student &lt;student@ntu.edu.tw&gt;</span>',
   date:'Today 12:00'})+','+JSON.stringify({seen:false})+');'});
  return original(url,init);
 };
 try{
  const response=await request(e,a,'list?folder=sent&limit=25');
  assert.equal(response.status,200);const m=(await response.json()).messages[0];
  assert.equal(m.subject,'Real subject');assert.equal(m.from,'Student <student@ntu.edu.tw>');
 }finally{globalThis.fetch=original;e.sqlite.close();}
});
test('opening mailbox loads only the requested metadata batch and no unopened message bodies',async()=>{
 const e=env(),a=await identity(e);virtualMessages=125;
 const first=await request(e,a,'list?folder=sent&limit=25');
 assert.equal(first.status,200);assert.equal((await first.json()).messages.length,25);
 const pageReads=calls.filter(call=>call.action==='list');
 assert.equal(pageReads.length,1);
 assert.equal(pageReads[0].init.method||'GET','GET');
 assert.equal(pageReads[0].url.includes('_page=1'),true);
 assert.equal(calls.some(call=>['show','get','viewsource'].includes(call.action)),false);
 e.sqlite.close();
});
test('progressive mailbox batches return newest 25 then 50 then 50 without duplicate UIDs',async()=>{
 const e=env(),a=await identity(e);virtualMessages=125;
 const first=await(await request(e,a,'list?folder=sent&limit=25')).json();
 assert.equal(first.messages.length,25);assert.equal(first.count,125);assert.equal(first.messages[0].uid,'125');assert.equal(first.messages.at(-1).uid,'101');
 assert.equal(first.messages[0].snippet,'Sample message preview');assert.ok(first.nextCursor);assert.equal(first.hasMore,true);
 const second=await(await request(e,a,'list?folder=sent&limit=50&cursor='+encodeURIComponent(first.nextCursor))).json();
 assert.equal(second.messages.length,50);assert.equal(second.messages[0].uid,'100');assert.equal(second.messages.at(-1).uid,'51');assert.ok(second.nextCursor);
 const third=await(await request(e,a,'list?folder=sent&limit=50&cursor='+encodeURIComponent(second.nextCursor))).json();
 assert.equal(third.messages.length,50);assert.equal(third.messages[0].uid,'50');assert.equal(third.messages.at(-1).uid,'1');
 assert.equal(third.hasMore,false);assert.equal(third.nextCursor,null);
 const ids=[...first.messages,...second.messages,...third.messages].map(m=>m.uid);
 assert.equal(new Set(ids).size,125);
 assert.equal((await request(e,a,'list?folder=sent&limit=50&cursor=broken')).status,400);
 assert.equal((await request(e,a,'list?folder=sent&limit=250')).status,400);
 e.sqlite.close();
});
test('mark all read is scoped to the current NTU mailbox without a message UID',async()=>{
 const e=env(),a=await identity(e);
 const result=await request(e,a,'action','POST',{action:'read-all'});
 assert.equal(result.status,200);
 const mark=calls.find(c=>c.action==='mark');
 assert.equal(mark.init.body.get('_mbox'),'INBOX');assert.equal(mark.init.body.get('_uid'),'*');
 assert.equal(mark.init.body.get('_flag'),'read');assert.equal(mark.init.body.get('_folders'),'cur');
 e.sqlite.close();
});
test('mail routes require login, same origin and CSRF before contacting NTU',async()=>{
 const e=env(),a=await identity(e);assert.equal((await request(e,null,'list')).status,401);
 const r=await worker.fetch(new Request(APP+'/api/mail/send',{method:'POST',headers:{Origin:APP,Cookie:'__Host-campus_week='+a.token,'Content-Type':'application/json'},body:JSON.stringify(sendBody())}),e);assert.equal(r.status,403);
 assert.equal((await request(e,a,'list','GET',undefined,{Origin:'https://evil.example'})).status,403);assert.equal(calls.length,0);
});
test('reader returns only message content, isolated formatting and attachment metadata, with remote images opt in',async()=>{
 const e=env(),a=await identity(e),r=await request(e,a,'message?mailbox=INBOX&uid=20');assert.equal(r.status,200);const m=await r.json();assert.equal(m.subject,'Lesson news');assert.equal(m.replyTo,'reply@ntu.edu.tw');assert.equal(m.attachments[0].part,'2');assert.doesNotMatch(m.html,/steal|onclick|src="https:/);assert.match(m.html,/color:blue/);assert.doesNotMatch(JSON.stringify(m),/request_token/);
 const m2=await(await request(e,a,'message?mailbox=INBOX&uid=20&images=1')).json();assert.match(m2.html,/src="https:\/\/tracker/);
});
test('reader sanitizer removes active elements, script URLs, CSS fetches and unsafe namespaces',()=>{
 const clean=sanitizeMail('<svg><script>x()</script></svg><form action="https://evil"><input></form><a href="javascript:alert(1)">link</a><p style="background:url(https://evil);color:red;position:fixed" onmouseover="x()">Hi</p><iframe src="https://evil"></iframe>');assert.doesNotMatch(clean,/javascript:|https:\/\/evil|onmouseover|position:fixed|<svg|<iframe|<form/);assert.match(clean,/color:red/);
 assert.throws(()=>parseRoundcubeCommands('this.set_env({"x":1});fetch("https://evil");'));
});
test('download streams only the selected attachment and never renders it as an app page',async()=>{
 const e=env(),a=await identity(e),r=await request(e,a,'attachment?mailbox=INBOX&uid=20&part=2');assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/octet-stream');assert.match(r.headers.get('Content-Disposition'),/attachment/);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3]);assert.equal(calls.some(c=>c.action==='viewsource'),false);
});
test('a repeated send ID cannot send twice, and content changes cannot reuse an ID',async()=>{
 const e=env(),a=await identity(e),body=sendBody();const r=await request(e,a,'send','POST',body);assert.equal(r.status,200);assert.equal((await r.json()).status,'sent');assert.equal((await(await request(e,a,'send','POST',body)).json()).status,'sent');assert.equal(calls.filter(c=>c.action==='send').length,1);assert.equal((await request(e,a,'send','POST',{...body,text:'Changed'})).status,409);assert.match(mime,/Message-ID: </);assert.match(mime,/From: b12345678@ntu.edu.tw/);
});
test('a lost delivery confirmation is uncertain; retries only inspect status and never resend',async()=>{
 const e=env(),a=await identity(e),body=sendBody();sendMode='disconnect';assert.equal((await(await request(e,a,'send','POST',body)).json()).status,'uncertain');await request(e,a,'send','POST',body);assert.equal(calls.filter(c=>c.action==='send').length,1);assert.equal((await(await request(e,a,'send/check','POST',{id:body.id})).json()).status,'sent');assert.equal(calls.filter(c=>c.action==='send').length,1);
});
test('reply headers are fetched from NTU, and header injection is rejected',async()=>{
 const e=env(),a=await identity(e);const body={...sendBody(),reply:{mailbox:'INBOX',uid:'20'}};await request(e,a,'send','POST',body);assert.match(mime,/In-Reply-To: <original@ntu.edu.tw>/);assert.match(mime,/References: <earlier@ntu.edu.tw> <original@ntu.edu.tw>/);assert.throws(()=>validateSend({...sendBody(),to:'x@y.example\r\nBcc: victim@example.com'}));assert.throws(()=>validateSend({...sendBody(),subject:'hello\r\nBcc: victim@example.com'}));assert.match(buildMime(sendBody(),'b12345678@ntu.edu.tw','id@host'),/Content-Transfer-Encoding: base64/);
});
test('mail lease prevents simultaneous provider searches from corrupting shared NTU session state',async()=>{
 const e=env(),a=await identity(e);e.sqlite.prepare('INSERT INTO mail_state(student_id,lease,lease_until) VALUES(?,?,?)').run(a.student_id,'other',Date.now()+100000);assert.equal((await request(e,a,'list')).status,429);assert.equal(calls.length,0);
});
test('invalid folders, UIDs and oversized messages fail without reaching NTU',async()=>{
 const e=env(),a=await identity(e);for(const path of ['list?folder=other','list?page=-1','message?mailbox=INBOX&uid=0','attachment?mailbox=INBOX&uid=20&part=../../evil'])assert.equal((await request(e,a,path)).status,400);assert.equal((await request(e,a,'send','POST',{...sendBody(),text:'x'.repeat(50001)})).status,400);assert.equal(calls.length,0);
});
test('push validates service endpoints, encrypts subscriptions, and separates student devices',async()=>{
 const e=env(),a=await identity(e),b=await identity(e,'r23456789'),{value}=await subscription();assert.throws(()=>validateSubscription({...value,endpoint:'https://127.0.0.1/private'}));assert.throws(()=>validateSubscription({...value,endpoint:'https://fcm.googleapis.com.evil.example/send'}));const r=await request(e,a,'push','POST',value);assert.equal(r.status,200);const db=e.sqlite.prepare('SELECT * FROM mail_push').get();assert.doesNotMatch(db.encrypted_subscription,/fcm.googleapis/);assert.deepEqual(await decryptAuthorization(KEY,a.student_id,'mail_push',db.encrypted_subscription),value);
 assert.equal((await(await request(e,b,'push')).json()).devices.length,0);await request(e,b,'push','DELETE',{id:db.id});assert.equal(e.sqlite.prepare('SELECT COUNT(*) AS n FROM mail_push').get().n,1);
 await request(e,b,'push','POST',value);assert.equal(e.sqlite.prepare('SELECT COUNT(*) AS n FROM mail_push').get().n,1);assert.equal(e.sqlite.prepare('SELECT student_id FROM mail_push').get().student_id,b.student_id);
});
test('background checks skip students without alerts, baseline old mail and notify only new arrivals',async()=>{
 const e=env(),a=await identity(e),{value}=await subscription();await identity(e,'r23456789');await request(e,a,'push','POST',value);await refreshMailNotifications(e);assert.equal(calls.filter(c=>new URL(c.url).hostname==='fcm.googleapis.com').length,0);assert.equal(JSON.parse(e.sqlite.prepare('SELECT baseline FROM mail_state').get().baseline).uid,20);
 latest=21;e.sqlite.prepare('UPDATE mail_state SET next_check=0').run();await refreshMailNotifications(e);assert.equal(calls.filter(c=>new URL(c.url).hostname==='fcm.googleapis.com').length,1);
 e.sqlite.prepare('UPDATE mail_state SET next_check=0').run();await refreshMailNotifications(e);assert.equal(calls.filter(c=>new URL(c.url).hostname==='fcm.googleapis.com').length,1);
 latest=22;pushStatus=410;e.sqlite.prepare('UPDATE mail_state SET next_check=0').run();await refreshMailNotifications(e);assert.equal(e.sqlite.prepare('SELECT COUNT(*) AS n FROM mail_push').get().n,0);
});
test('push payload encryption decrypts with the recipient private key and authentication secret',async()=>{
 const {key,value}=await subscription(),payload={title:'New NTU mail'},wire=await encryptedPush(value,payload),salt=wire.subarray(0,16),sender=wire.subarray(21,86),remote=await crypto.subtle.importKey('raw',sender,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=await crypto.subtle.deriveBits({name:'ECDH',public:remote},key.privateKey,256),decode=v=>Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)),enc=new TextEncoder();
 async function derive(input,salt,info,n){return crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},await crypto.subtle.importKey('raw',input,'HKDF',false,['deriveBits']),n*8);}
 const receiver=decode(value.keys.p256dh),info=new Uint8Array(14+receiver.length+sender.length);info.set(enc.encode('WebPush: info\0'));info.set(receiver,14);info.set(sender,14+receiver.length);
 const ikm=await derive(shared,decode(value.keys.auth),info,32),cek=await derive(ikm,salt,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await derive(ikm,salt,enc.encode('Content-Encoding: nonce\0'),12),plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),wire.subarray(86)));
 assert.equal(plain.at(-1),2);assert.deepEqual(JSON.parse(new TextDecoder().decode(plain.subarray(0,-1))),payload);
});
test('temporary push failures retain pending arrivals for retry rather than losing the notification',async()=>{
 const e=env(),a=await identity(e),{value}=await subscription();await request(e,a,'push','POST',value);await refreshMailNotifications(e);latest=21;pushStatus=503;e.sqlite.prepare('UPDATE mail_state SET next_check=0').run();await refreshMailNotifications(e);assert.equal(JSON.parse(e.sqlite.prepare('SELECT baseline FROM mail_state').get().baseline).uid,20);pushStatus=201;e.sqlite.prepare('UPDATE mail_state SET next_check=0').run();await refreshMailNotifications(e);assert.equal(JSON.parse(e.sqlite.prepare('SELECT baseline FROM mail_state').get().baseline).uid,21);
});
