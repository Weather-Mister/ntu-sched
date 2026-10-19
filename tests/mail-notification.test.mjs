import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {newMailSummary,notificationSubject,notificationBody} from '../src/mail-notification.mjs';

function item(uid,subject){
 return {uid:String(uid),columns:{subject}};
}
test('notification subjects are plain-text, length bounded and safe',()=>{
 assert.equal(notificationSubject('Assignment <b>Created</b> &amp; Updated <span class="sr-only">open in new window</span>'),
  'Assignment Created & Updated');
 assert.equal(notificationBody('Graph &amp; Data Description',2),'Graph & Data Description +2');
 assert.equal(notificationBody('New class',0),'New class');
 assert.equal(notificationBody('',0),'(No subject)');
 assert.equal(notificationSubject('A'.repeat(200)).length,140);
 assert.equal(notificationBody('A'.repeat(200),3).length,143);
});
test('new mail summary counts real messages rather than gaps between NTU UIDs',async()=>{
 const page={rows:[item(108,'<b>Newest</b> class'),item(104,'Older new'),item(97,'Previously seen')],hasMore:true};
 let calls=0;
 const summary=await newMailSummary({list(){calls++;throw Error('Should not fetch another page');}},page,100);
 assert.equal(summary.subject,'Newest class');
 assert.equal(summary.additional,1);
 assert.equal(summary.observed,2);
 assert.equal(summary.latest,108);
 assert.equal(summary.limited,false);
 assert.equal(calls,0);
});
test('many arrivals are counted across Roundcube pages until previous mail appears',async()=>{
 const pages=[
  {rows:[item(57,'New lecture'),item(56,'Second'),item(55,'Third')],hasMore:true},
  {rows:[item(54,'Fourth'),item(53,'Fifth'),item(50,'Before')],hasMore:true}
 ];
 const fetched=[];
 const summary=await newMailSummary({async list(folder,page){fetched.push([folder,page]);return pages[page-1];}},
  {rows:pages[0].rows,hasMore:pages[0].hasMore},50);
 assert.deepEqual(fetched,[['INBOX',2]]);
 assert.equal(summary.subject,'New lecture');
 assert.equal(summary.additional,4);
 assert.equal(summary.limited,false);
});
test('a bounded scan uses a lower-bound suffix for exceptionally large batches',async()=>{
 const first={rows:[item(90,'Top')],hasMore:true};
 const summary=await newMailSummary({list(){return {rows:[item(89,'Next')],hasMore:true};}},first,40,{maxPages:2});
 assert.equal(summary.additional,1);
 assert.equal(summary.limited,true);
 assert.equal(notificationBody(summary.subject,summary.additional,summary.limited),'Top +1+');
});
test('push service worker shows the subject and +X; standalone test notifications remain generic',async()=>{
 const source=readFileSync(new URL('../public/mail-sw.js',import.meta.url),'utf8');
 const handlers={},shown=[];
 const self={
  addEventListener(name,handler){handlers[name]=handler;},
  skipWaiting(){},
  clients:{claim:async()=>{},matchAll:async()=>[]},
  registration:{showNotification:async(title,options)=>{shown.push({title,options});}}
 };
 vm.runInNewContext(source,{self,fetch:async()=>({ok:true,json:async()=>({studentNumber:'student'})}),Number,URL});
 async function notify(payload){
  let promise;
  handlers.push({data:{json:()=>payload},waitUntil(p){promise=p;}});
  await promise;
 }
 await notify({studentNumber:'student',kind:'mail',subject:'Lab report due',additional:0});
 await notify({studentNumber:'student',kind:'mail',subject:'Assignment posted',additional:3});
 await notify({studentNumber:'student',kind:'test'});
 assert.equal(shown[0].title,'New NTU mail');
 assert.equal(shown[0].options.body,'Lab report due');
 assert.equal(shown[1].options.body,'Assignment posted +3');
 assert.equal(shown[2].title,'Campus Week test');
 assert.equal(shown[2].options.body,'Test push received successfully.');
});

test('push alerts hide private content unless the current account is verified',async()=>{
 const source=readFileSync(new URL('../public/mail-sw.js',import.meta.url),'utf8');
 for(const mode of ['expired','offline','unavailable','malformed','other','matching']){
  const handlers={},shown=[];
  const self={addEventListener(name,handler){handlers[name]=handler;},registration:{showNotification:async(title,options)=>shown.push({title,options})}};
  const fetch=async()=>{
   if(mode==='offline')throw new Error('offline');
   if(['expired','unavailable'].includes(mode))return {ok:false};
   return {ok:true,json:async()=>{if(mode==='malformed')throw new Error('invalid json');return {studentNumber:mode==='matching'?'student':'another-student'};}};
  };
  vm.runInNewContext(source,{self,fetch,Number,URL});
  const notify=async value=>{let pending;handlers.push({data:{json:()=>value},waitUntil(p){pending=p;}});await pending;};
  const payload={studentNumber:'student',kind:'mail',subject:'Private exam result',body:'Private fallback',additional:2};
  await notify(payload);
  if(mode==='other')assert.equal(shown.length,0);
  else assert.equal(shown[0].options.body,mode==='matching'?'Private exam result +2':'You have new mail in Campus Mail.');
  for(const malformed of [null,{}, {...payload,studentNumber:''},{...payload,kind:'unexpected'}])await notify(malformed);
  assert.equal(shown.length,mode==='other'?0:1);
 }
});
