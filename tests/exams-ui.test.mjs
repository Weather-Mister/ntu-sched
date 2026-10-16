import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom/worker';
import {readFileSync} from 'node:fs';
let version=0;
const settle=()=>new Promise(r=>setImmediate(r));
const syllabus={sourceUrl:'https://course.ntu.edu.tw/en/courses/115-1/52528',title:'Statics',courseCode:'ME1005',section:'01',serial:'52528',term:'115-1',schedule:[{week:8,dates:[],description:'<img src=x onerror=alert(1)> Midterm exam'}],exams:[{kind:'midterm',week:8,date:null,certainty:'week-only',description:'Midterm exam'}]};
async function fixture(resolve){
 const originals=new Map(['document','window','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const {document,window}=parseHTML(readFileSync(new URL('../public/exams-lab.html',import.meta.url),'utf8'));
 document.hidden=false;
 for(const id of ['course','offering']){const s=document.getElementById(id);Object.defineProperty(s,'value',{configurable:true,get(){return this.getAttribute('data-value')||this.firstChild?.value||'';},set(v){this.setAttribute('data-value',v);}});}
 let owner='b12345678';const calls=[];
 const fetch=async url=>{calls.push(url);if(url==='/api/auth/me')return Response.json({studentNumber:owner});if(url==='/api/timetable')return Response.json({studentNumber:owner,timetable:{term:'115-1',sessions:[{courseId:'a',titleEn:'Statics'},{courseId:'b',titleEn:'Math'}]}});return Response.json({studentNumber:owner,...await resolve(url)});};
 for(const[k,v]of Object.entries({document,window,fetch}))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
 const promise=import('../public/exams-lab.mjs?test='+ ++version);await promise;
 return{document,window,calls,setOwner(v){owner=v;},async change(id,value){document.getElementById(id).value=value;document.getElementById(id).dispatchEvent(new window.Event('change'));await settle();},cleanup(){for(const[k,v]of originals)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}};
}
test('selecting a lesson fetches the syllabus without manual fields; week-only plans stay inert',async()=>{
 const f=await fixture(async()=>({matching:{status:'matched-timetable',reason:'One matching offering'},course:syllabus,candidates:[]}));
 try{assert(f.calls.some(u=>u==='/api/exams/resolve?courseId=a'));assert.match(f.document.getElementById('exams').textContent,/Week 8 · Exact date unavailable/);assert.equal(f.document.querySelector('#schedule img'),null);assert.match(f.document.getElementById('schedule').textContent,/<img/);await f.change('course','b');assert(f.calls.some(u=>u==='/api/exams/resolve?courseId=b'));}finally{f.cleanup();}
});
test('ambiguous or incomplete metadata offers a section choice, including a single unverified offering',async()=>{
 const f=await fixture(async url=>url.includes('serial=52528')?{matching:{status:'student-selected',reason:'Selected'},course:syllabus,candidates:[syllabus]}:{matching:{status:'choose-section',reason:'Choose section'},course:null,candidates:[syllabus]});
 try{assert.equal(f.document.getElementById('picker').hidden,false);await f.change('offering','52528');assert.match(f.document.getElementById('match').textContent,/student selected/);assert.equal(f.document.getElementById('results').hidden,false);}finally{f.cleanup();}
});

test('missing public exams triggers enrolled COOL fallback and preserves the public course source',async()=>{
 const f=await fixture(async url=>url==='/api/exams/cool-preview'?{plan:{sourceUrl:'https://cool.ntu.edu.tw/courses/64620',exams:[{kind:'midterm',week:10,date:null,certainty:'week-only',description:'Midterm 2'}]}}:{matching:{status:'matched-cool',reason:'Match'},course:{...syllabus,exams:[]},candidates:[]});
 try{assert(f.calls.includes('/api/exams/cool-preview'));assert.equal(f.document.getElementById('cool-results').hidden,false);assert.match(f.document.getElementById('cool-exams').textContent,/Week 10 · Exact date unavailable/);assert.match(f.document.getElementById('details').textContent,/Statics/);}finally{f.cleanup();}
});
test('late course responses and a changed login cannot display another student’s syllabus',async()=>{
 let release,slow=false;const f=await fixture(async()=>{if(slow)await new Promise(r=>release=r);return{matching:{status:'matched-timetable',reason:'match'},course:syllabus,candidates:[]};});
 try{
  slow=true;await f.change('course','b');f.document.hidden=true;f.document.dispatchEvent(new f.window.Event('visibilitychange'));release();await settle();assert.equal(f.document.getElementById('results').hidden,true);
  slow=false;f.document.hidden=false;f.setOwner('r23456789');f.document.dispatchEvent(new f.window.Event('visibilitychange'));await settle();await settle();
  // Now a request begins for the current owner, then the cookie changes before the ownership check.
  slow=true;await f.change('course','b');f.setOwner('b12345678');release();await settle();await settle();assert.equal(f.document.getElementById('results').hidden,true);assert.match(f.document.getElementById('status').textContent,/account changed/);
 }finally{f.cleanup();}
});
