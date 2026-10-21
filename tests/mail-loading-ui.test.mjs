import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML,DOMParser} from 'linkedom';
import {createMailUI} from '../public/skeleton/mail.mjs';
import {createMailBadges} from '../public/skeleton/mail-badges.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const row=(uid='1')=>({mailbox:'INBOX',uid,subject:'Message '+uid,from:'Professor',unread:true});
const page=(uid='1')=>({messages:[row(uid)],count:1,nextCursor:null});
const message=(uid='1')=>({...row(uid),headers:'From: Professor',attachments:[],html:'<html><body><p>Message body '+uid+'</p></body></html>'});
async function fixture(run,withBadges=false){
 const {window,document}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
 let owner='b12345678',locale='en',handler=async()=>page();const calls=[],timers=[];
 const globals={window,document,DOMParser,navigator:{onLine:true},sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},
  getSelection:()=>null,MutationObserver:undefined,setInterval:()=>0,setTimeout:callback=>{timers.push(callback);return timers.length;}};
 const previous={};for(const[k,v]of Object.entries(globals)){previous[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 const dialog=document.getElementById('mail-dialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
 const account={request:async path=>{calls.push(path);const studentNumber=owner;return {studentNumber,...await handler(path)};}};
 const badges=withBadges?createMailBadges({account,isLive:()=>true,language:()=>locale}):undefined;
 const ui=createMailUI({account,isLive:()=>true,language:()=>locale,badges});ui.bind({studentNumber:owner});
 const click=selector=>document.querySelector(selector).click();
 try{await run({ui,dialog,document,calls,click,handle(fn){handler=fn;},setLanguage(value){locale=value;ui.locale();},changeOwner(value){owner=value;ui.bind({studentNumber:owner});},async retry(){const callback=timers.shift();assert.ok(callback,'a bounded retry was scheduled');callback();await tick();}});}
 finally{ui.bind(null);for(const[k,v]of Object.entries(previous)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
}

test('reopening Mail during its first load joins one request and keeps its result',async()=>fixture(async({ui,document,calls,handle})=>{
 const pending=deferred();handle(()=>pending.promise);ui.open();ui.open();ui.open();
 assert.equal(calls.length,1);assert.equal(document.querySelector('.mailx-list').getAttribute('aria-busy'),'true');
 assert.match(document.querySelector('.mailx-list').textContent,/Loading/);
 pending.resolve(page());await tick();
 assert.equal(calls.length,1);assert.match(document.querySelector('.mailx-list').textContent,/Message 1/);
 ui.open();assert.equal(calls.length,1,'fresh inbox remains visible on reopen');
}));
test('mail controls update badges after successful reads and preserve badges through locale updates',async()=>fixture(async({ui,document,handle,click})=>{
 handle(path=>path.includes('message?')?message():path.includes('list?')?page():{});
 ui.open();await tick();const badge=()=>document.querySelector('[data-open-mail] .campus-mail-badge');
 assert.equal(badge().textContent,'1');assert.equal(badge().hidden,false);
 ui.locale();assert.equal(document.querySelector('[data-mail-folder="inbox"] .campus-mail-badge').textContent,'1');
 click('.campus-mail-open');await tick();assert.equal(badge().hidden,true);
 click('.campus-mail-icon[aria-label="Mark unread"]');await tick();assert.equal(badge().textContent,'1');assert.equal(badge().hidden,false);
 click('.campus-mail-mark-all');await tick();assert.equal(badge().hidden,true);
 ui.bind(null);assert.equal(badge().hidden,true);
},true));

test('rapid folder changes discard the old list and load only the latest folder',async()=>fixture(async({ui,document,calls,handle,click})=>{
 const pending=deferred();handle(()=>pending.promise);ui.open();
 click('[data-mail-folder="sent"]');click('[data-mail-folder="starred"]');
 handle(()=>page('3'));pending.resolve(page('1'));await tick();await tick();
 assert.equal(calls.length,2);assert.match(calls[1],/folder=starred/);
 assert.match(document.querySelector('.mailx-list').textContent,/Message 3/);assert.doesNotMatch(document.querySelector('.mailx-list').textContent,/Message 1/);
}));

test('old-account completions cannot unlock or redraw a new account request',async()=>fixture(async({ui,document,calls,handle,changeOwner})=>{
 const first=deferred(),second=deferred();handle(()=>first.promise);ui.open();
 handle(()=>second.promise);changeOwner('r23456789');first.resolve(page('1'));await tick();
 ui.open();assert.equal(calls.length,2);assert.equal(document.querySelector('.mailx-list').getAttribute('aria-busy'),'true');
 second.resolve(page('2'));await tick();assert.match(document.querySelector('.mailx-list').textContent,/Message 2/);
 assert.doesNotMatch(document.querySelector('.mailx-list').textContent,/Message 1/);
}));

test('one message click immediately shows its loading reader, coalesces extra clicks, and marks it read',async()=>fixture(async({ui,document,calls,handle,click})=>{
 ui.open();await tick();const pending=deferred();handle(()=>pending.promise);
 click('.campus-mail-open');click('.campus-mail-open');
 assert.equal(calls.filter(path=>path.includes('message?')).length,1);
 assert.ok(document.getElementById('mail-dialog').classList.contains('mail-reading'));
 assert.equal(document.querySelector('.mailx-reader').getAttribute('aria-busy'),'true');
 pending.resolve(message());await tick();
 assert.match(document.querySelector('.mail-frame').srcdoc,/Message body 1/);
 assert.equal(document.querySelector('.mailx-reader').getAttribute('aria-busy'),'false');
 assert.equal(document.querySelector('.campus-mail-item').classList.contains('is-unread'),false);
}));

test('message reads automatically wait for a busy mailbox without another click',async()=>fixture(async({ui,document,calls,handle,click,retry})=>{
 ui.open();await tick();let attempts=0;handle(()=>{if(attempts++===0)throw Object.assign(new Error('Busy'),{code:'mail_busy',retryAfterSeconds:2});return message();});
 click('.campus-mail-open');await tick();assert.match(document.querySelector('.mail-status').textContent,/Retrying/);
 await retry();assert.equal(attempts,2);assert.equal(calls.length,3);assert.ok(document.querySelector('.mail-frame'));
}));

test('a failed read offers an inline retry and recovers without reopening the app',async()=>fixture(async({ui,document,handle,click})=>{
 ui.open();await tick();handle(()=>{throw new Error('NTU Mail is temporarily unavailable.');});
 click('.campus-mail-open');await tick();assert.match(document.querySelector('.mailx-reader').textContent,/Try again/);
 handle(()=>message());click('.campus-mail-retry');await tick();assert.ok(document.querySelector('.mail-frame'));
}));
test('external images stay opt-in and the reader reloads them only after the images control is clicked',async()=>fixture(async({ui,document,calls,handle,click})=>{
 handle(path=>path.includes('message?')?message():page());ui.open();await tick();
 click('.campus-mail-open');await tick();
 assert.equal(new URLSearchParams(calls.find(path=>path.includes('message?')).split('?')[1]).has('images'),false);
 const control=document.querySelector('.campus-mail-images');assert.ok(control);assert.equal(control.getAttribute('aria-label'),'Load external images');
 control.click();await tick();
 assert.equal(new URLSearchParams(calls.at(-1).split('?')[1]).get('images'),'1');assert.ok(document.querySelector('.mail-frame'));
}));
test('compact mail controls retain full accessible labels when the language changes',async()=>fixture(async({document,setLanguage})=>{
 const push=document.querySelector('.campus-mail-push'),official=document.querySelector('.mailx-official-link');
 assert.equal(push.getAttribute('aria-label'),'Enable notifications');assert.equal(push.querySelector('.mailx-label-mobile').textContent,'Alerts off');
 assert.equal(official.getAttribute('aria-label'),'Official NTU Mail ↗');
 setLanguage('zh');assert.equal(push.getAttribute('aria-label'),'啟用通知');assert.equal(push.querySelector('.mailx-label-mobile').textContent,'通知關閉');
 assert.equal(official.getAttribute('aria-label'),'臺大官方信箱 ↗');
}));

test('manual Refresh bypasses inbox cache and keeps acknowledged messages during failure',async()=>fixture(async({ui,document,calls,handle,click})=>{
 ui.open();await tick();handle(()=>{throw new Error('Unavailable');});click('.mailx-refresh-button');await tick();
 assert.match(calls.at(-1),/fresh=1/);assert.match(document.querySelector('.mailx-list').textContent,/Message 1/);
 assert.match(document.querySelector('.mail-status').textContent,/Try again/);
}));

test('switching folder during a pending read prevents that message from reappearing',async()=>fixture(async({ui,document,handle,click})=>{
 ui.open();await tick();const pending=deferred();handle(path=>path.includes('message?')?pending.promise:page('2'));
 click('.campus-mail-open');click('[data-mail-folder="sent"]');await tick();pending.resolve(message());await tick();
 assert.equal(document.querySelector('.mail-frame'),null);assert.equal(document.getElementById('mail-dialog').classList.contains('mail-reading'),false);
}));

test('a completed mail action supersedes an older list refresh rather than restoring stale flags',async()=>fixture(async({ui,document,handle,click,calls})=>{
 ui.open();await tick();const pending=deferred();handle(path=>path.includes('list?')?pending.promise:{});
 click('.mailx-refresh-button');click('.campus-mail-icon');await tick();
 handle(()=>({...page(),messages:[{...row(),starred:true}]}));pending.resolve(page());await tick();await tick();
 assert.equal(calls.filter(path=>path.includes('list?')).length,3);
 assert.equal(document.querySelector('.campus-mail-icon').getAttribute('aria-label'),'Remove star');
}));
