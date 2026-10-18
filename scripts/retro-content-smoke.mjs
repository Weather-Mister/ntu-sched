// Populated presentation checks with a local fake Mail provider. Never sends mail.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.argv[2]?pathToFileURL(resolve(process.argv[2])).href:'playwright');
const root=resolve('public'),output=resolve('test-results/retro');await mkdir(output,{recursive:true});
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server=createServer(async(req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const path=resolve(root,'.'+(name==='/fixture'?'/index.html':name));
 if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{let data=await readFile(path);if(name==='/fixture')data=Buffer.from(data.toString().replace('<script type="module" src="/skeleton/app.mjs"></script>',''));res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
try{
 for(const [width,height]of [[1440,900],[1024,768],[390,844],[320,740]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  await page.evaluate(async()=>{
   const {createMailUI}=await import('/skeleton/mail.mjs'),{applyRetroSkin}=await import('/skins/retro.mjs');
   document.body.dataset.theme='retro';document.getElementById('app-screen').hidden=false;document.getElementById('login-screen').hidden=true;
   const studentNumber='b12345678';let version=0;
   const messages=Array.from({length:9},(_,i)=>({uid:String(i+1),mailbox:'INBOX',from:['Engineering Mathematics <math@ntu.edu.tw>','NTU COOL <noreply@ntu.edu.tw>','Professor Chen <chen@ntu.edu.tw>'][i%3],subject:['Homework reminder','Course announcement: Friday classroom','Reading for next week'][i%3],date:'Today · 12:05',snippet:'Fictional message for visual and interaction checks.',unread:i<3,starred:i===2}));
   const account={request:async(path,options={})=>{
    if(path.startsWith('mail/list?'))return{studentNumber,messages,count:messages.length,nextCursor:null};
    if(path.startsWith('mail/message?'))return{studentNumber,...messages[0],headers:'From: Engineering Mathematics\nTo: b12345678@ntu.edu.tw\nToday · 12:05',attachments:[],html:'<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"></head><body><p>Fictional message for the browser test.</p><p>Please bring your notes to class.</p><a href="https://ntu.edu.tw">Course information</a></body></html>'};
    if(path==='mail/push')return{studentNumber,publicKey:'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',devices:[],state:{}};
    if(path==='mail/drafts'&&options.method==='POST')return{studentNumber,version:++version};
    if(path==='mail/drafts')return{studentNumber,drafts:[]};
    if(path==='mail/outbox')throw Error('Sending is forbidden in this fixture');
    if(path==='mail/ai')return{studentNumber,body:'Fictional revised draft',bodyHtml:'<p>Fictional <strong>revised</strong> draft</p>'};
    throw Error('Unexpected fixture request: '+path);
   }};
   const mail=createMailUI({account,isLive:()=>true,language:()=> 'en'});mail.bind({studentNumber});
   applyRetroSkin(true);window.retroFixture={applyRetroSkin,mail};mail.open();
  });
  await page.locator('.campus-mail-item').first().waitFor();
  assert.ok(await page.locator('#mail-dialog').evaluate(e=>e.parentElement.id==='app-screen'&&!e.matches(':modal')));
  await page.screenshot({path:resolve(output,`populated-mail-${width}.png`)});
  await page.locator('.campus-mail-open').first().click();await page.locator('.mail-frame').waitFor({state:'visible'});
  assert.equal(await page.frameLocator('.mail-frame').locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(40, 43, 37)');
  await page.frameLocator('.mail-frame').getByText('Please bring your notes to class.').waitFor({state:'visible'});
  assert.equal(await page.frameLocator('.mail-frame').locator('p').first().evaluate(e=>getComputedStyle(e).color),'rgb(207, 210, 196)');
  await page.screenshot({path:resolve(output,`populated-reader-${width}.png`)});
  await page.locator('.mailx-compose-main').click();await page.locator('.campus-compose:not([hidden])').waitFor();
  await page.locator('#campus-compose-to').fill('fictional@example.invalid');await page.locator('.mailx-email-body').fill('Fictional editable draft');
  await page.locator('.mailx-ai-prompt').fill('Shorten this fictional draft');await page.locator('.mailx-ai-generate').click();
  await page.waitForFunction(()=>document.querySelector('.mailx-email-body').textContent.includes('revised'));
  await page.locator('[data-undo]').click();assert.match(await page.locator('.mailx-email-body').textContent(),/editable draft/);
  await page.locator('[data-redo]').click();assert.match(await page.locator('.mailx-email-body').textContent(),/revised/);
  await page.screenshot({path:resolve(output,`populated-compose-${width}.png`)});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok(await page.locator('#mail-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.keyboard.press('Escape');await page.locator('.campus-compose').waitFor({state:'hidden'});
  assert.equal(await page.locator('#mail-dialog').evaluate(e=>e.open),true);
  await page.evaluate(()=>{document.body.dataset.theme='light';window.retroFixture.applyRetroSkin(false);});
  assert.ok(await page.locator('#mail-dialog').evaluate(e=>e.matches(':modal')&&e.parentElement===document.body));
  await page.evaluate(()=>{document.body.dataset.theme='retro';window.retroFixture.applyRetroSkin(true);});
  assert.ok(await page.locator('#mail-dialog').evaluate(e=>e.open&&!e.matches(':modal')&&e.parentElement.id==='app-screen'));
  await page.keyboard.press('Escape');await page.locator('#mail-dialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('.app-shell').evaluate(e=>e.classList.contains('retro-mail-open')),false);
  await page.evaluate(()=>{
   const list=document.getElementById('cool-list');list.replaceChildren();document.getElementById('cool-heading').textContent='Upcoming exams';
   for(let i=0;i<4;i++){
    const card=document.createElement('article');card.className='cool-item exam-card cool-checkable card'+(i===1?' done':'');
    card.innerHTML='<a class="cool-main" href="https://cool.ntu.edu.tw/"><span class="cool-date exam-stamp"><span class="exam-week-label">Week</span><strong class="exam-week-number">8</strong><span class="exam-month">Nov</span><strong class="exam-day">6</strong></span><span class="cool-copy"><strong></strong><small>Midterm exam · Chapters 1–4</small><small class="exam-source">Class 02 · NTU COOL</small><small class="exam-confidence">Date stated in source</small></span></a><div class="exam-card-actions"><button class="exam-edit-button" type="button">Edit</button><button class="cool-done-button'+(i===1?' is-done':'')+'" type="button" aria-label="Mark done">✓</button></div>';
    card.querySelector('.cool-copy strong').textContent=['Engineering Mathematics · Midterm','Statics · Quiz','General Psychology · Midterm','Mechanism · Final'][i];list.append(card);
   }
  });
  await page.locator('.cool-column').screenshot({path:resolve(output,`assignment-style-exams-${width}.png`)});
  assert.ok(await page.locator('.exam-card').evaluateAll(cards=>cards.every(card=>{const main=card.querySelector('.cool-main').getBoundingClientRect(),actions=card.querySelector('.exam-card-actions').getBoundingClientRect();return main.right<=actions.left+1&&card.scrollWidth<=card.clientWidth+1;})));
  assert.deepEqual(errors,[]);console.log(`${width}×${height}: populated list, CRT reader, composer, draft-only AI/Undo/Redo, Escape, modal restoration and overflow passed.`);
  await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
