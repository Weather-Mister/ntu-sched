// Run with: node scripts/retro-smoke.mjs [absolute path to playwright's index.mjs]
// Uses only fictional preview data; never logs in, sends mail, or calls providers.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.argv[2]?pathToFileURL(resolve(process.argv[2])).href:'playwright');
const root=resolve('public'),output=resolve('test-results/retro');await mkdir(output,{recursive:true});
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.startsWith('/api/')){res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'not_authenticated',message:'Preview only'}}));return;}
 const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});res.end(await readFile(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const failures=[],results=[];
async function checkOverflow(page,label){
 const size=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth}));
 assert.ok(size.page<=size.viewport+1,`${label}: page overflow ${JSON.stringify(size)}`);
 for(const selector of ['#settings-dialog[open]','#event-dialog[open]','#mail-dialog[open]']){
  const item=page.locator(selector);if(await item.count())assert.ok(await item.evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${label}: ${selector} overflow`);
 }
}
async function choose(page,theme){
 if(!await page.locator('#settings-dialog').evaluate(e=>e.open))await page.locator('#open-settings').click();
 await page.locator(`[data-theme-choice="${theme}"]`).click();
 await page.waitForFunction(t=>document.body.dataset.theme===t,theme);
 await page.locator('#settings-close-desktop').click();
}
try{
 for(const [width,height] of [[1440,900],[1920,1080],[1024,768],[859,900],[844,390],[790,900],[390,844],[320,740]]){
  if(process.env.SMOKE_WIDTH&&width!==Number(process.env.SMOKE_WIDTH))continue;
  console.log('Checking '+width+'×'+height);
  const page=await browser.newPage({viewport:{width,height}});
  page.on('pageerror',error=>failures.push(`${width}: ${error.message}`));
  await page.goto(url+'/?preview=settings');
  await page.locator('#settings-dialog[open]').waitFor();
  await choose(page,'retro');await checkOverflow(page,`${width} dashboard`);
  assert.equal(await page.locator('.retro-scope').count(),1);
  assert.equal(await page.locator('.retro-clock').count(),1);
  assert.match(await page.locator('.retro-clock-time').textContent(),/^\d{2}:\d{2}$/);
  assert.equal(await page.locator('.retro-slider[aria-controls="retro-week-rail"]').count(),0);
  assert.equal(await page.locator('.week-section').evaluate(e=>getComputedStyle(e).overflowY),'hidden');
  assert.equal(await page.locator('.side-column>.shortcuts-panel').count(),1);
  if(width>=860)assert.ok(await page.locator('.week-section').evaluate(e=>e.querySelector('.day-button').getBoundingClientRect().width>e.getBoundingClientRect().width*.7),'Day keys fill the fixed sidebar');
  const topMail=page.locator('.side-column [data-open-mail]');assert.ok(await topMail.isVisible());
  assert.equal(await page.locator('.topbar [data-open-mail]').count(),0);
  await page.locator('.day-button').first().click();
  const firstName=await page.locator('#selected-day').textContent();assert.ok(firstName);
  if(await page.locator('.lesson-card').count()){
   await page.locator('.lesson-card').first().click();await page.locator('#lesson-dialog[open]').waitFor();
   await checkOverflow(page,`${width} class editor`);await page.keyboard.press('Escape');
  }
  await page.locator('#view-week').click();assert.equal(await page.locator('#week-timetable').isVisible(),true);await checkOverflow(page,`${width} week`);
  await page.locator('#view-day').click();
  await page.locator('#next-week').click();await page.locator('#previous-week').click();
  await page.locator('#add-event').click();await page.locator('#event-dialog[open]').waitFor();
  await checkOverflow(page,`${width} event editor`);
  await page.locator('#event-title').fill('Retro smoke personal event');
  await page.locator('#event-start').fill('18:00');await page.locator('#event-end').fill('19:00');
  await page.locator('#event-save').click();await page.locator('#event-dialog').waitFor({state:'hidden'});
  assert.ok(await page.locator('#schedule-list').textContent().then(x=>x.includes('Retro smoke personal event')));
  await page.locator('#task-input').fill('Retro smoke task');await page.locator('#task-form button').click();
  const task=page.locator('.todo-row').filter({hasText:'Retro smoke task'});assert.equal(await task.count(),1);
  await task.locator('.todo-check').click();assert.ok(await task.evaluate(e=>e.classList.contains('done')));
  await task.locator('.todo-remove').click();assert.equal(await task.count(),0);
  await page.locator('#cool-announcements-tab').click();await page.locator('#cool-announcements-tab').press('ArrowRight');
  assert.equal(await page.locator('#cool-exams-tab').getAttribute('aria-selected'),'true');
  await page.locator('#cool-assignments-tab').click();
  const check=page.locator('.retro-deadline-row .cool-done-button').first();
  await check.waitFor();
  assert.match(await check.evaluate(e=>getComputedStyle(e,'::after').content),/FINISH/);
  await check.click();
  await page.waitForFunction(()=>document.querySelector('.retro-deadline-row .cool-done-button')?.getAttribute('aria-pressed')==='true');
  assert.match(await check.evaluate(e=>getComputedStyle(e,'::after').content),/✓/);
  await check.click();
  await page.waitForFunction(()=>document.querySelector('.retro-deadline-row .cool-done-button')?.getAttribute('aria-pressed')==='false');
  await page.locator('#language-zh').click();await checkOverflow(page,`${width} Chinese`);
  try{await page.locator('#language-en').click({timeout:7000});}catch(error){await page.screenshot({path:resolve(output,'failure.png'),fullPage:true});console.log(await page.evaluate(async()=>{const rows=[];for(let i=0;i<8;i++){const e=document.getElementById('language-en'),r=e.getBoundingClientRect();rows.push({x:r.x,y:r.y,w:r.width,h:r.height,rail:document.querySelector('.week-section').scrollHeight,body:document.body.scrollHeight});await new Promise(r=>setTimeout(r,50));}return rows;}));throw error;}
  await topMail.click();await page.locator('#mail-dialog[open]').waitFor();
  await checkOverflow(page,`${width} mail`);await page.screenshot({path:resolve(output,`mail-${width}.png`)});await page.keyboard.press('Escape');
  await page.locator('#open-settings').click();await checkOverflow(page,`${width} settings`);
  await page.screenshot({path:resolve(output,`settings-${width}.png`)});await page.keyboard.press('Escape');
  if(width===1440){
   const trace=page.locator('.scope-trace'),a=await trace.getAttribute('d');await page.waitForTimeout(180);assert.notEqual(await trace.getAttribute('d'),a);
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
   const still=await trace.getAttribute('d');await page.waitForTimeout(150);assert.equal(await trace.getAttribute('d'),still);await page.emulateMedia({reducedMotion:'no-preference'});
   const control=await page.locator('#task-form').elementHandle();
   for(const theme of ['garden','dark','light','retro','garden','retro','light','dark','retro']){
    await choose(page,theme);await checkOverflow(page,`${width} ${theme}`);
    assert.equal(await page.locator('.retro-scope').count(),theme==='retro'?1:0);
    assert.equal(await page.locator('.retro-clock').count(),theme==='retro'?1:0);
    assert.equal(await page.locator('.garden-scenery').count(),theme==='garden'?1:0);
    assert.equal(await page.locator('.topbar [data-open-mail]').count(),0);
    assert.ok(await control.evaluate(e=>e===document.getElementById('task-form')));
    if(theme!=='retro')assert.ok(await page.locator('.app-shell>.week-section').count());
   }
   await page.reload();await page.locator('#settings-dialog[open]').waitFor();
   assert.equal(await page.locator('body').getAttribute('data-theme'),'retro');await page.keyboard.press('Escape');
   // A long fictional feed exercises pusher drag, rail clicks, wheel, keyboard,
   // appearance cleanup, and keeps the original shared row handlers untouched.
   await page.locator('#cool-list').evaluate(list=>{
    const original=list.querySelector('.retro-deadline-row');
    for(let i=0;i<28;i++){
     const card=original.cloneNode(true);card.classList.add('smoke-clone');
     card.querySelectorAll('.retro-date-time,.retro-date-status,.retro-entry-bar').forEach(n=>n.remove());
     card.querySelector('.cool-copy strong').textContent='Fictional deadline '+(i+1);list.append(card);
    }
   });
   const slider=page.locator('.retro-slider[aria-controls="cool-list"]');await slider.waitFor({state:'visible'});
   await slider.focus();await page.keyboard.press('End');
   await page.waitForFunction(()=>{const e=document.getElementById('cool-list');return e.scrollTop>=e.scrollHeight-e.clientHeight-2;});
   await page.keyboard.press('Home');await page.waitForFunction(()=>document.getElementById('cool-list').scrollTop===0);
   const knob=await slider.locator('.retro-slider-knob').boundingBox();
   await page.mouse.move(knob.x+knob.width/2,knob.y+knob.height/2);await page.mouse.down();await page.mouse.move(knob.x+knob.width/2,knob.y+knob.height/2+100,{steps:8});await page.mouse.up();
   assert.ok(await page.locator('#cool-list').evaluate(e=>e.scrollTop>0));
   await slider.hover();await page.mouse.wheel(0,140);await page.waitForTimeout(100);
   await slider.focus();await page.keyboard.press('Home');
   await page.screenshot({path:resolve(output,'deadline-pusher-desktop.png')});
   await page.locator('#cool-list .smoke-clone').evaluateAll(nodes=>nodes.forEach(n=>n.remove()));
  }
  await page.locator('#jump-today').click();await page.locator('.day-button').first().click();
  await page.screenshot({path:resolve(output,`dashboard-${width}.png`),fullPage:true});
  results.push(`${width}×${height}: dashboard, week, class/event editors, tasks, COOL/exams keyboard tabs, language, mail, settings, overflow passed`);
  await page.close();
 }
 assert.deepEqual(failures,[]);console.log(results.join('\n'));console.log('No browser exceptions. Screenshots: '+output);
}finally{await browser.close();await new Promise(r=>server.close(r));}
