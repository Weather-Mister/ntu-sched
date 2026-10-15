import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountAnnouncements } from '../public/account-announcements.mjs';
import { readAnnouncements } from '../src/cool-announcements.mjs';
import { CookieJar } from '../src/ntu-cookies.mjs';
import { encryptAuthorization, decryptAuthorization } from '../src/security.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(client) {
  const doc = new EventTarget(), win = new EventTarget(), nav = {onLine:true};
  let now = 1000000, focused = true, tick;
  doc.visibilityState = 'visible'; doc.hasFocus = () => focused;
  const controller = new AccountAnnouncements(client,()=>{},()=>{}, {document:doc,window:win,navigator:nav,now:()=>now,setTimer:fn=>{tick=fn;}});
  return {controller,doc,win,nav,tick:()=>tick(),advance:ms=>now+=ms,focus:v=>focused=v};
}
const owner = {studentNumber:'b12345678'};
const result = (title='Saved',studentNumber=owner.studentNumber) => ({studentNumber,announcements:{items:[{title}],syncedAt:1}});
test('announcements show saved data then refresh on opening, every two minutes only visible, focused and online, and manually',async()=>{
  let calls=0;const f=fixture({coolAnnouncements:async()=>result(),syncCoolAnnouncements:async(_p,_s,force)=>{assert.equal(force,true);calls++;return result('Fresh');}});
  await f.controller.bind(owner);await settle();assert.equal(calls,1);
  f.advance(119999);f.tick();await settle();assert.equal(calls,1);
  f.advance(1);f.focus(false);f.tick();await settle();assert.equal(calls,1);
  f.focus(true);f.doc.visibilityState='hidden';f.tick();await settle();assert.equal(calls,1);
  f.doc.visibilityState='visible';f.nav.onLine=false;f.tick();await settle();assert.equal(calls,1);
  f.nav.onLine=true;f.win.dispatchEvent(new Event('online'));await settle();assert.equal(calls,2);
  f.win.dispatchEvent(new Event('focus'));f.tick();await settle();assert.equal(calls,2);
  await f.controller.refresh();assert.equal(calls,3);
});
test('hidden opening defers upstream fetch and temporary failure preserves saved announcements without a retry loop',async()=>{
  let calls=0;const f=fixture({coolAnnouncements:async()=>result(),syncCoolAnnouncements:async()=>{calls++;throw new Error('Temporary error');}});
  f.doc.visibilityState='hidden';await f.controller.bind(owner);assert.equal(calls,0);assert.equal(f.controller.items.items[0].title,'Saved');
  f.doc.visibilityState='visible';f.doc.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(calls,1);
  for(let i=0;i<5;i++)f.tick();await settle();assert.equal(calls,1);assert.equal(f.controller.items.items[0].title,'Saved');
  f.advance(120000);f.tick();await settle();assert.equal(calls,2);
});
test('account switches clear data immediately and ignore late announcements',async()=>{
  let complete;const delayed=new Promise(resolve=>{complete=resolve;});
  const f=fixture({coolAnnouncements:async()=>result(),syncCoolAnnouncements:async()=>delayed});
  await f.controller.bind(owner);await settle();assert.equal(f.controller.busy,true);
  await f.controller.bind(null);assert.equal(f.controller.items,null);
  complete(result('Old owner'));await settle();assert.equal(f.controller.items,null);
});
test('provider pagination rejects external links before sending COOL cookies',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async url=>{calls++;assert.equal(new URL(url).origin,'https://cool.ntu.edu.tw');return Response.json([],{headers:{Link:'<https://evil.example/steal>; rel="next"'}});};
  try{await assert.rejects(readAnnouncements(new CookieJar()),{code:'cool_announcements_unavailable'});assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('larger encrypted announcement snapshots round-trip without exceeding JS argument limits',async()=>{
  const value={body:'公告'.repeat(100000)};const key='12'.repeat(32);
  const encrypted=await encryptAuthorization(key,'synthetic','cool',value);
  assert.deepEqual(await decryptAuthorization(key,'synthetic','cool',encrypted),value);
});
