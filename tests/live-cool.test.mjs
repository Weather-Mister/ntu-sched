import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom/worker';
import { initLiveCool } from '../public/live-cool.mjs';
const settle = () => new Promise(resolve => setImmediate(resolve));
const saved = (title, syncedAt = Date.now()) => ({ calendar: { assignments: [{id:'event-assignment-1',title,course:'Calculus',courseId:'42',dueAt:'2099-10-17T15:59:00Z',url:'https://cool.ntu.edu.tw/courses/42/assignments/1'}],syncedAt,warnings:[] }, connectionStatus:'authorized',checkIntervalMs:300000 });
function fixture(client) {
  const {document,window}=parseHTML('<html><body><section id=cool-feed></section></body></html>');document.visibilityState='visible';
  // Linkedom omits HTMLSelectElement.value's browser setter.
  const selectPrototype=window.HTMLSelectElement.prototype,selectValue=Object.getOwnPropertyDescriptor(selectPrototype,'value');
  Object.defineProperty(selectPrototype,'value',{configurable:true,get:selectValue.get,set(value){for(const option of this.querySelectorAll('option'))option.selected=option.value===value;}});
  const originals=new Map(['document','window','navigator','setInterval','setTimeout'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const timers=[],timeouts=[];
  for(const [key,value]of Object.entries({document,window,navigator:{onLine:true},setInterval:fn=>{timers.push(fn);return timers.length;},setTimeout:fn=>{timeouts.push(fn);return timeouts.length;}}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  let opened=0,expired=0;const controller=initLiveCool({panel:document.getElementById('cool-feed'),client,openLogin:()=>opened++,onSessionExpired:()=>expired++});
  return {controller,document,window,timers,timeouts,get opened(){return opened;},get expired(){return expired;},cleanup(){Object.defineProperty(selectPrototype,'value',selectValue);for(const[key,value]of originals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}};
}
test('COOL discovers a calendar automatically without asking for its URL and displays safe homework',async()=>{
  let syncs=0;const f=fixture({coolCalendar:async()=>({calendar:null,connectionStatus:'not_connected'}),syncCoolCalendar:async(password)=>{assert.equal(password,undefined);syncs++;return saved('<img src=x onerror=alert(1)>');}});
  try{f.controller.setAccount({studentNumber:'b12345678'});await settle();assert.equal(syncs,1);assert.equal(f.document.querySelector('input[type=url]'),null);assert.equal(f.document.querySelector('#cool-list img'),null);assert.equal(f.document.querySelector('#cool-list h3').textContent,'<img src=x onerror=alert(1)>');assert.equal(f.document.getElementById('cool-refresh').textContent,'Refresh homework');}
  finally{f.cleanup();}
});
test('fresh homework restores immediately; manual refresh checks the feed and failures preserve saved work',async()=>{
  let attempts=0;const f=fixture({coolCalendar:async()=>saved('Saved homework'),syncCoolCalendar:async(_secret,_signal,force)=>{attempts++;assert.equal(force,true);throw new Error('COOL temporarily unavailable');}});
  try{f.controller.setAccount({studentNumber:'b12345678'});await settle();assert.equal(attempts,0);f.document.getElementById('cool-refresh').click();await settle();assert.equal(attempts,1);assert.equal(f.document.querySelector('#cool-list h3').textContent,'Saved homework');assert.match(f.document.getElementById('cool-notice').textContent,/temporarily unavailable/);f.timers[0]();await settle();assert.equal(attempts,1);}
  finally{f.cleanup();}
});
test('COOL refresh checks are five minutes apart and pause while hidden or offline',async()=>{
  const originalNow=Date.now;let now=Date.now(),attempts=0;Date.now=()=>now;
  const f=fixture({coolCalendar:async()=>saved('Old homework',now-300001),syncCoolCalendar:async()=>{attempts++;return saved('Changed homework',now);}});
  try{f.document.visibilityState='hidden';f.controller.setAccount({studentNumber:'b12345678'});await settle();assert.equal(attempts,0);
    f.document.visibilityState='visible';
  // Linkedom omits HTMLSelectElement.value's browser setter.
  const selectPrototype=window.HTMLSelectElement.prototype,selectValue=Object.getOwnPropertyDescriptor(selectPrototype,'value');
  Object.defineProperty(selectPrototype,'value',{configurable:true,get:selectValue.get,set(value){for(const option of this.querySelectorAll('option'))option.selected=option.value===value;}});f.document.dispatchEvent(new f.window.Event('visibilitychange'));await settle();assert.equal(attempts,1);
    now+=299999;f.timers[0]();await settle();assert.equal(attempts,1);
    now+=2;globalThis.navigator.onLine=false;f.timers[0]();await settle();assert.equal(attempts,1);
    globalThis.navigator.onLine=true;f.window.dispatchEvent(new f.window.Event('online'));await settle();assert.equal(attempts,2);
  }finally{Date.now=originalNow;f.cleanup();}
});
test('switching student accounts ignores a late COOL response and clears private homework immediately',async()=>{
  let respond,reads=0;const pending=new Promise(resolve=>{respond=resolve;});
  const f=fixture({coolCalendar:async()=>++reads===1?pending:saved('Second student'),syncCoolCalendar:async()=>saved('Unexpected')});
  try{f.controller.setAccount({studentNumber:'b12345678'});f.controller.setAccount({studentNumber:'r23456789'});await settle();respond(saved('Previous student'));await settle();assert.equal(f.document.querySelector('#cool-list h3').textContent,'Second student');f.controller.setAccount(null);assert.equal(f.document.querySelector('#cool-list h3'),null);assert.equal(f.document.getElementById('cool-feed').textContent.includes('Second student'),false);}
  finally{f.cleanup();}
});
test('homework search and course filters work and the announcements tab explains its separate connection',async()=>{
  const result=saved('Essay');result.calendar.assignments.push({...result.calendar.assignments[0],id:'event-assignment-2',title:'Problem set',course:'Physics',courseId:'43'});
  const f=fixture({coolCalendar:async()=>result});
  try{f.controller.setAccount({studentNumber:'b12345678'});await settle();const search=f.document.querySelector('input[type=search]');search.value='problem';search.dispatchEvent(new f.window.Event('input'));assert.equal(f.document.querySelectorAll('#cool-list article').length,1);assert.equal(f.document.querySelector('#cool-list h3').textContent,'Problem set');f.document.getElementById('cool-announcements-tab').click();assert.match(f.document.getElementById('cool-list').textContent,/not part of the calendar/);}
  finally{f.cleanup();}
});
