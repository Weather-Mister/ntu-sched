import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translateMail, semanticMailMarkup, TRANSLATION_INSTRUCTIONS } from '../src/mail-translation.mjs';

const chinese = '<!doctype html><html><head><style>body{color:red}</style></head><body>' +
  '<p>您好，請於 10 月 22 日繳交作業。</p><table><tr><th>教室</th><td>101</td></tr></table>' +
  '<img src="https://tracker.example/pixel"><script>run()</script></body></html>';

function context(html=chinese, subject='課程通知') {
  let attempts=0, sent=0, received;
  const buckets=new Map();
  const env={
    GEMINI_API_KEY:'private-test-key', GEMINI_MODEL:'gemini-2.5-flash',
    DB:{prepare(){return {
      bind(key){this.key=key;return this;},
      async first(){const next=(buckets.get(this.key)||0)+1;buckets.set(this.key,next);attempts++;return {attempts:next};}
    };}}
  };
  const owner={student_id:'student-private-id',student_number:'b12345678'};
  const messageReader=async(_env,_owner,url)=>{
    assert.equal(_env,env);assert.equal(_owner,owner);
    assert.equal(url.searchParams.get('uid'),'42');
    assert.equal(url.searchParams.get('mailbox'),'INBOX');
    return {subject,html};
  };
  const googleFetch=async(url,init)=>{
    sent++;
    received={url,init};
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({
      subject:'Course notification',
      body:'Hello, submit your assignment by October 22.\nRoom: 101',
      bodyHtml:'<p>Hello, submit your assignment by October 22.</p><table><tr><th>Room</th><td>101</td></tr></table>'
    })}]}}]});
  };
  return { env,owner,messageReader,googleFetch,get attempts(){return attempts;},
    get sent(){return sent;},get received(){return received;} };
}
const request={mailbox:'INBOX',uid:'42'};
test('Gemini uses the personal client prompt and exact response configuration, with server-side key only',async()=>{
  const c=context();
  const result=await translateMail(c.env,c.owner,request,c);
  assert.equal(c.sent,1);
  assert.match(c.received.url,/gemini-2\.5-flash:generateContent$/);
  assert.equal(c.received.init.headers['x-goog-api-key'],'private-test-key');
  const body=JSON.parse(c.received.init.body);
  assert.equal(body.systemInstruction.parts[0].text,TRANSLATION_INSTRUCTIONS);
  assert.deepEqual(body.generationConfig,{temperature:0,maxOutputTokens:8192,responseMimeType:'application/json'});
  const source=JSON.parse(body.contents[0].parts[0].text);
  assert.equal(source.subject,'課程通知');
  assert.match(source.body,/10 月 22 日/);
  assert.match(source.sourceHtml,/<table>/);
  assert.doesNotMatch(source.sourceHtml,/style|script|tracker\.example/);
  assert.equal(result.subject,'Course notification');
  assert.match(result.html,/Room/);
  assert.doesNotMatch(JSON.stringify(result),/private-test-key|student-private-id/);
});
test('model HTML is sanitized before it reaches the sandboxed mail frame',async()=>{
  const c=context();
  c.googleFetch=async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({
    subject:'Translated',
    body:'Safe result',
    bodyHtml:'<p onclick="run()">Safe result<img src="https://evil.test/t"></p><script>run()</script><a href="javascript:run()">Unsafe link</a><a href="https://ntu.edu.tw">Good link</a>'
  })}]}}]});
  const result=await translateMail(c.env,c.owner,request,c);
  assert.doesNotMatch(result.bodyHtml,/onclick|<script|<img|javascript:|evil\.test/i);
  assert.match(result.bodyHtml,/https:\/\/ntu\.edu\.tw/);
  assert.match(result.html,/Content-Security-Policy/);
});
test('missing key and invalid references or non-Chinese messages never invoke Gemini',async()=>{
  const c=context();
  delete c.env.GEMINI_API_KEY;
  await assert.rejects(translateMail(c.env,c.owner,request,c),e=>e.status===503&&e.code==='translation_unconfigured');
  c.env.GEMINI_API_KEY='private-test-key';
  await assert.rejects(translateMail(c.env,c.owner,{mailbox:'INBOX',uid:'42',body:'spoofed'},c),e=>e.status===400);
  const english=context('<p>English only.</p>','Hello');
  await assert.rejects(translateMail(english.env,english.owner,request,english),e=>e.status===400&&e.code==='translation_not_chinese');
  assert.equal(english.sent,0);
  assert.equal(c.attempts,0);
  assert.equal(c.sent,0);
});
test('Campus translation quota matches personal Mail: 12 per minute, resets next minute',async()=>{
  const c=context(),actualNow=Date.now;
  let fakeTime=102000000; // on an exact minute boundary
  try{
    Date.now=()=>fakeTime;
    for(let i=0;i<12;i++)await translateMail(c.env,c.owner,request,c);
    await assert.rejects(translateMail(c.env,c.owner,request,c),error=>
      error.status===429&&error.code==='translation_limit'&&error.retryAfterSeconds===60);
    assert.equal(c.sent,12);
    fakeTime+=60000;
    await translateMail(c.env,c.owner,request,c);
    assert.equal(c.sent,13);
  }finally{Date.now=actualNow;}
});
test('NTU read failures cannot exhaust Gemini quota',async()=>{
  const c=context();
  c.messageReader=async()=>{throw new Error('NTU temporarily unavailable');};
  for(let i=0;i<20;i++)await assert.rejects(translateMail(c.env,c.owner,request,c));
  assert.equal(c.attempts,0);
  assert.equal(c.sent,0);
});
test('incomplete Gemini output leaves the original email untouched',async()=>{
  const c=context();
  c.googleFetch=async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]});
  await assert.rejects(translateMail(c.env,c.owner,request,c),e=>e.code==='translation_incomplete');
});
test('fragment markup is stripped of HTML instructions and dangerous links',()=>{
  const fragment=semanticMailMarkup('<p style="color:red">Hi <strong>there</strong><img src="https://tracker"/></p><a href="javascript:bad()">bad</a>');
  assert.match(fragment,/<strong>there<\/strong>/);
  assert.doesNotMatch(fragment,/style|img|javascript:/);
});
test('reader translation is per-message cached, reset on sign-out, and uses POST',()=>{
  const ui=readFileSync(new URL('../public/skeleton/mail.mjs',import.meta.url),'utf8');
  assert.match(ui,/translationCache=new Map\(\)/);
  assert.match(ui,/translationRequests=new Map\(\)/);
  assert.match(ui,/translationRequests\.get\(key\)/);
  assert.match(ui,/translationRequests\.set\(key,pending\)/);
  assert.match(ui,/translationCache\.clear\(\);translationShown\.clear\(\);translationRequests\.clear\(\)/);
  assert.match(ui,/request\('translate',\{method:'POST'/);
  assert.match(ui,/showEnglish\(!translationShown\.has\(key\)\)/);
  assert.match(ui,/if\(!result\|\|identity!==epoch\|\|generation!==reading\|\|current!==message\)return/);
});
