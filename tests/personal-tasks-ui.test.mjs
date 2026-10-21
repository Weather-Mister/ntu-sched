import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createPersonalTaskLink} from '../public/skeleton/personal-tasks.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('personal link validates the popup origin, source, nonce and active owner before sending a private key',async()=>{
 const {window,document}=parseHTML('<html><body><section class="settings-account"></section></body></html>');
 const globals={window,document,setInterval:()=>0},previous={};for(const[k,v]of Object.entries(globals)){previous[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 let context={student:{id:'b15502123'},liveMode:true,language:'en'},url;const calls=[],popup={postMessage(){},close(){}},controller=createPersonalTaskLink({account:{request:async(path,options)=>{calls.push({path,options});return {studentNumber:'b15502123',linked:!!options};}},getContext:()=>context,onTasksChanged(){}});
 window.open=value=>{url=value;return popup;};
 try{
  controller.update();await tick();document.querySelector('#settings-personal-tasks button').click();
  const nonce=new URL(url).hash.split('=')[1],key='synthetic-private-key-'.repeat(3),data={type:'eren-campus-task-key',nonce,key};
  const send=(origin,source,value=data)=>{const event=new window.Event('message');Object.assign(event,{origin,source,data:value});window.dispatchEvent(event);};
  send('https://untrusted.example',popup);send('https://weather-mister.github.io',{});send('https://weather-mister.github.io',popup,{...data,nonce:'wrong'});await tick();assert.equal(calls.filter(c=>c.options).length,0);
  send('https://weather-mister.github.io',popup);await tick();assert.equal(calls.filter(c=>c.options).length,1);assert.equal(JSON.parse(calls.at(-1).options.body).key,key);
  document.querySelector('#settings-personal-tasks button').click();context={...context,student:{id:'b12345678'}};controller.update();send('https://weather-mister.github.io',popup);await tick();assert.equal(calls.filter(c=>c.options).length,1);assert.equal(document.getElementById('settings-personal-tasks').hidden,true);
 }finally{for(const[k,v]of Object.entries(previous)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
