import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createMailBadges} from '../public/skeleton/mail-badges.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(run){
 const {window,document}=parseHTML('<html><body><button data-open-mail>Campus Mail</button><nav class="mailx-mobile-tabs"><button data-mail-folder="inbox">Inbox</button><button data-mail-folder="unread">Unread</button></nav><nav class="mailx-nav"><button data-mail-folder="inbox"><svg></svg></button></nav></body></html>');
 let owner='b12345678',locale='en',handler=async()=>({unreadCount:125});const calls=[];
 const globals={window,document,navigator:{onLine:true},setInterval:()=>0},previous={};
 for(const[k,v]of Object.entries(globals)){previous[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 const badges=createMailBadges({account:{request:async path=>{calls.push(path);const studentNumber=owner;return {studentNumber,...await handler()};}},isLive:()=>true,language:()=>locale});
 try{await run({badges,document,calls,handle(fn){handler=fn;},bind(value='b12345678'){owner=value;badges.bind(value?{studentNumber:value}:null);},zh(){locale='zh';badges.locale();}});}
 finally{for(const[k,v]of Object.entries(previous)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
}
test('badges start hidden, show full-account totals capped visually, and clear on logout',async()=>fixture(async({badges,document,bind,calls,zh})=>{
 assert.ok([...document.querySelectorAll('.campus-mail-badge')].every(b=>b.hidden));
 bind();await tick();assert.deepEqual(calls,['mail/unread']);
 const shortcut=document.querySelector('[data-open-mail]');
 assert.equal(shortcut.querySelector('span').textContent,'99+');assert.match(shortcut.getAttribute('aria-label'),/125 unread messages/);
 assert.ok(document.querySelector('.mailx-nav svg'));zh();assert.match(shortcut.title,/125 封未讀/);
 badges.setCount(0);assert.ok([...document.querySelectorAll('.campus-mail-badge')].every(b=>b.hidden));
 badges.setCount(3);bind(null);assert.equal(shortcut.classList.contains('has-unread-mail'),false);assert.ok(shortcut.querySelector('span').hidden);
}));
test('read, unread, archive and read-all update only inbox counts and preserve counts on failed refresh',async()=>fixture(async({badges,document,bind,handle})=>{
 bind();await tick();badges.setCount(3);const text=()=>document.querySelector('.campus-mail-badge').textContent;
 badges.changed('read',{mailbox:'INBOX'},true);assert.equal(text(),'2');
 badges.changed('read',{mailbox:'INBOX'},false);assert.equal(text(),'2');
 badges.changed('unread',{mailbox:'INBOX'},false);assert.equal(text(),'3');
 badges.changed('archive',{mailbox:'Sent'},true);assert.equal(text(),'3');
 badges.changed('trash',{mailbox:'INBOX'},true);assert.equal(text(),'2');
 handle(()=>{throw new Error('Offline');});await badges.refresh(true);assert.equal(text(),'2');
 badges.changed('read-all');assert.ok(document.querySelector('.campus-mail-badge').hidden);
}));
test('pending old-account and pre-mutation responses cannot restore a stale count',async()=>fixture(async({badges,document,bind,handle})=>{
 let resolve;handle(()=>new Promise(r=>{resolve=r;}));bind();
 handle(async()=>({unreadCount:2}));bind('r23456789');await tick();
 resolve({unreadCount:90});await tick();assert.equal(document.querySelector('.campus-mail-badge').textContent,'2');
 handle(()=>new Promise(r=>{resolve=r;}));const pending=badges.refresh(true);
 badges.changed('read',{mailbox:'INBOX'},true);resolve({unreadCount:2});await pending;
 assert.equal(document.querySelector('.campus-mail-badge').textContent,'1');
}));
test('overlapping refreshes coalesce and invalid counts never replace a confirmed value',async()=>fixture(async({badges,document,bind,handle,calls})=>{
 let resolve;handle(()=>new Promise(r=>{resolve=r;}));bind();void badges.refresh(true);void badges.refresh(true);assert.equal(calls.length,1);
 resolve({unreadCount:5});await tick();handle(async()=>({unreadCount:-1}));await badges.refresh(true);
 assert.equal(document.querySelector('.campus-mail-badge').textContent,'5');
}));
