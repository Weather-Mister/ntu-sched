import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createComposer} from '../public/skeleton/mail-composer.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(run){
 const {window,document}=parseHTML('<html><body><dialog id="mail"></dialog></body></html>');
 const globals={window,document,sessionStorage:{values:new Map(),setItem(k,v){this.values.set(k,v);},getItem(k){return this.values.get(k)||null;},removeItem(k){this.values.delete(k);}},getSelection:()=>null};
 const previous={};for(const[k,v]of Object.entries(globals)){previous[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 window.HTMLElement.prototype.focus=()=>{};
 let owner='b12345678',pendingAi,failAi=false,version=0,requests=[];
 const request=async(path,options={})=>{const data=options.body?JSON.parse(options.body):null;requests.push({path,data});
  if(path==='ai'){if(failAi)throw new Error('Gemini unavailable');return new Promise(resolve=>{pendingAi=resolve;});}
  if(path==='drafts'&&options.method==='POST')return {id:data.id,version:++version};
  if(path.startsWith('drafts?id=')){const error=new Error('Not found');error.status=404;throw error;}
  if(path==='outbox')return {status:'sent'};
  return {};
 };
 const composer=createComposer({host:document.getElementById('mail'),request,getOwner:()=>owner,tell:()=>{}});composer.bind(owner);
 const find=selector=>document.querySelector(selector),click=selector=>find(selector).click(),input=(selector,value)=>{const node=find(selector);if(node.hasAttribute('contenteditable'))node.innerHTML=value;else node.value=value;node.dispatchEvent(new window.Event('input'));};
 try{await run({composer,document,find,click,input,requests,resolveAi:result=>pendingAi(result),changeOwner(value){owner=value;composer.bind(value);},failAi(){failAi=true;}});}
 finally{composer.bind(null);for(const[k,v]of Object.entries(previous)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
}
test('composer revises the actual manual draft and Undo AI/Redo preserve its rich HTML',async()=>fixture(async({composer,find,click,input,resolveAi,requests})=>{
 await composer.open();input('#campus-compose-to','friend@ntu.edu.tw');input('.mailx-email-body','<p>My <strong>manual draft</strong></p>');input('.mailx-ai-prompt','make it shorter');click('.mailx-ai-generate');await tick();
 assert.match(requests.find(r=>r.path==='ai').data.bodyHtml,/<strong>manual draft<\/strong>/);
 resolveAi({body:'Shorter draft',bodyHtml:'<p>Shorter <em>draft</em></p>'});await tick();assert.equal(find('.mailx-email-body').innerHTML,'<p>Shorter <em>draft</em></p>');
 click('[data-undo]');assert.equal(find('.mailx-email-body').innerHTML,'<p>My <strong>manual draft</strong></p>');click('[data-redo]');assert.equal(find('.mailx-email-body').innerHTML,'<p>Shorter <em>draft</em></p>');
 assert.equal(requests.some(r=>r.path==='outbox'),false);await composer.close();assert.equal(composer.active,false);assert.equal(requests.filter(r=>r.path==='drafts').at(-1).data.bodyHtml,'<p>Shorter <em>draft</em></p>');
}));
test('editing during Gemini generation keeps the newer manual draft',async()=>fixture(async({composer,find,click,input,resolveAi})=>{
 await composer.open();input('.mailx-email-body','Original');input('.mailx-ai-prompt','revise');click('.mailx-ai-generate');await tick();input('.mailx-email-body','New manual edit');resolveAi({body:'Outdated AI',bodyHtml:'<p>Outdated AI</p>'});await tick();
 assert.equal(find('.mailx-email-body').innerHTML,'New manual edit');assert.match(find('.mailx-inline-error').textContent,/Your edits are kept/);await composer.close();
}));
test('account switching clears the editor and ignores a late Gemini response',async()=>fixture(async({composer,find,click,input,resolveAi,changeOwner,requests})=>{
 await composer.open();input('.mailx-email-body','Private first-student draft');input('.mailx-ai-prompt','revise');click('.mailx-ai-generate');await tick();changeOwner('r23456789');resolveAi({body:'Private AI',bodyHtml:'<p>Private AI</p>'});await tick();
 assert.equal(composer.active,false);assert.equal(find('.mailx-email-body').textContent,'');await composer.open();assert.equal(find('.mailx-email-body').textContent,'');assert.equal(requests.some(r=>r.path==='outbox'),false);await composer.close();
}));
test('Gemini errors leave the current editor writable and intact',async()=>fixture(async({composer,find,click,input,failAi})=>{
 await composer.open();input('.mailx-email-body','<p>Keep this <u>draft</u></p>');input('.mailx-ai-prompt','revise');failAi();click('.mailx-ai-generate');await tick();assert.equal(find('.mailx-email-body').innerHTML,'<p>Keep this <u>draft</u></p>');assert.equal(String(find('.mailx-email-body').contentEditable),'true');assert.match(find('.mailx-inline-error').textContent,/Gemini unavailable/);await composer.close();
}));
