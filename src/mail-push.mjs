import { ApiError, base64url, digest, encryptAuthorization, decryptAuthorization } from './security.mjs';
const enc=new TextEncoder(),decode=v=>Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const join=(...arrays)=>{const a=new Uint8Array(arrays.reduce((n,b)=>n+b.length,0));let i=0;for(const b of arrays){a.set(b,i);i+=b.length;}return a;};
async function hkdf(key,salt,info,length){return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},await crypto.subtle.importKey('raw',key,'HKDF',false,['deriveBits']),length*8));}
export function validateSubscription(value){
 let url;try{url=new URL(value.endpoint);}catch{throw new ApiError(400,'invalid_push','Invalid notification address.');}
 const h=url.hostname;
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||url.href.length>2000||!(h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='web.push.apple.com'||h.endsWith('.notify.windows.com')))throw new ApiError(400,'invalid_push','This browser notification service is not supported.');
 if(!/^[A-Za-z0-9_-]{87}=?$/.test(value.keys?.p256dh||'')||! /^[A-Za-z0-9_-]{22}={0,2}$/.test(value.keys?.auth||''))throw new ApiError(400,'invalid_push','Invalid notification keys.');
 return {endpoint:url.href,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
export async function pushConfiguration(env){
 let row=await env.DB.prepare("SELECT encrypted_value FROM mail_config WHERE id='vapid'").first();
 if(!row){const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const value={privateKey:await crypto.subtle.exportKey('jwk',key.privateKey),publicKey:base64url(new Uint8Array(await crypto.subtle.exportKey('raw',key.publicKey)))};
  await env.DB.prepare("INSERT OR IGNORE INTO mail_config(id,encrypted_value) VALUES('vapid',?)").bind(await encryptAuthorization(env.NTU_CREDENTIAL_KEY,'system','mail_push',value)).run();row=await env.DB.prepare("SELECT encrypted_value FROM mail_config WHERE id='vapid'").first();
 }
 return decryptAuthorization(env.NTU_CREDENTIAL_KEY,'system','mail_push',row.encrypted_value);
}
export async function encryptedPush(subscription,payload){
 const receiver=decode(subscription.keys.p256dh),auth=decode(subscription.keys.auth),salt=crypto.getRandomValues(new Uint8Array(16));
 const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const publicKey=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
 const remote=await crypto.subtle.importKey('raw',receiver,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:remote},ephemeral.privateKey,256));
 const ikm=await hkdf(shared,auth,join(enc.encode('WebPush: info\0'),receiver,publicKey),32);
 const key=await hkdf(ikm,salt,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(ikm,salt,enc.encode('Content-Encoding: nonce\0'),12);
 const plaintext=enc.encode(JSON.stringify(payload));if(plaintext.length>3000)throw new Error('Push payload too large.');
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']),join(plaintext,new Uint8Array([2]))));
 return join(salt,new Uint8Array([0,0,16,0,65]),publicKey,ciphertext);
}
export async function sendPush(env,subscription,payload,config){
 validateSubscription(subscription);
 const head=base64url(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=base64url(enc.encode(JSON.stringify({aud:new URL(subscription.endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:env.APP_ORIGIN}))),input=head+'.'+claims;
 const key=await crypto.subtle.importKey('jwk',config.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const sig=base64url(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(input))));
 const result=await fetch(subscription.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{TTL:'600',Urgency:'normal','Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',Authorization:`vapid t=${input}.${sig}, k=${config.publicKey}`},body:await encryptedPush(subscription,payload)});
 await result.body?.cancel();return result.status;
}
export async function subscribe(env,owner,value){
 const subscription=validateSubscription(value),id=await digest(subscription.endpoint);
 // The same browser subscription is transferred rather than left attached to another student.
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM mail_push WHERE student_id=?').bind(owner.student_id).first();
 if(count.n>=8&&!await env.DB.prepare('SELECT id FROM mail_push WHERE student_id=? AND id=?').bind(owner.student_id,id).first())throw new ApiError(409,'push_limit','Remove an old device before adding another.');
 await env.DB.prepare('DELETE FROM mail_push WHERE id=? AND student_id<>?').bind(id,owner.student_id).run();
 await env.DB.prepare('INSERT INTO mail_push(student_id,id,encrypted_subscription,created_at) VALUES(?,?,?,?) ON CONFLICT(student_id,id) DO UPDATE SET encrypted_subscription=excluded.encrypted_subscription').bind(owner.student_id,id,await encryptAuthorization(env.NTU_CREDENTIAL_KEY,owner.student_id,'mail_push',subscription),Date.now()).run();
 // Reset the baseline when enabling alerts; old inbox messages never become new alerts.
 await env.DB.prepare('INSERT INTO mail_state(student_id) VALUES(?) ON CONFLICT(student_id) DO UPDATE SET baseline=NULL,next_check=0').bind(owner.student_id).run();
 return {enabled:true,id};
}

/* The same schema is created on demand for deployments not yet migrated. */
export const MAIL_PUSH_TEST_SCHEMA='CREATE TABLE IF NOT EXISTS mail_push_tests (student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE, last_sent_at INTEGER NOT NULL DEFAULT 0)';
export async function testPushDelivery(env,owner,id){
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(id))throw new ApiError(400,'invalid_push','Choose this device from notification settings.');
 const device=await env.DB.prepare('SELECT encrypted_subscription FROM mail_push WHERE student_id=? AND id=?').bind(owner.student_id,id).first();
 if(!device)throw new ApiError(404,'push_device_missing','This device is not registered. Enable mail alerts again.');
 await env.DB.prepare(MAIL_PUSH_TEST_SCHEMA).run();
 await env.DB.prepare('INSERT OR IGNORE INTO mail_push_tests(student_id,last_sent_at) VALUES(?,0)').bind(owner.student_id).run();
 const time=Date.now();
 const claimed=await env.DB.prepare('UPDATE mail_push_tests SET last_sent_at=? WHERE student_id=? AND last_sent_at<=? RETURNING last_sent_at').bind(time,owner.student_id,time-20000).first();
 if(!claimed)throw new ApiError(429,'push_test_wait','Please wait 20 seconds before sending another test.');
 const subscription=await decryptAuthorization(env.NTU_CREDENTIAL_KEY,owner.student_id,'mail_push',device.encrypted_subscription);
 const config=await pushConfiguration(env);
 let status;
 try{status=await sendPush(env,subscription,{kind:'test',studentNumber:owner.student_number},config);}
 catch{throw new ApiError(502,'push_test_failed','Could not reach the push service. Please retry.');}
 if(status===404||status===410){
  await env.DB.prepare('DELETE FROM mail_push WHERE student_id=? AND id=?').bind(owner.student_id,id).run();
  throw new ApiError(410,'push_subscription_expired','Your push subscription expired. Enable mail alerts again.');
 }
 if(status<200||status>=300)throw new ApiError(502,'push_test_rejected','The push provider rejected this test (HTTP '+status+').');
 return {accepted:true,providerStatus:status};
}
