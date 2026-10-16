import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../src/worker.mjs';
import {digest,randomToken} from '../src/security.mjs';
import {readHanziWidget} from '../src/student-preferences.mjs';
import {lessonStatistics} from '../public/skeleton/settings-model.mjs';
const APP='https://campus.example';
function setup(){const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const DB={prepare(sql){const statement=sqlite.prepare(sql);let values=[];return {bind(...v){values=v;return this;},async first(){return statement.get(...values)||null;},async all(){return {results:statement.all(...values)};},async run(){return {meta:statement.run(...values)};}};}};return {DB,sqlite,NTU_CREDENTIAL_KEY:'ab'.repeat(32),APP_ORIGIN:APP};}
async function identity(env,number='b12345678'){const student_id=crypto.randomUUID(),token=randomToken(),csrf=randomToken();env.sqlite.prepare('INSERT INTO students VALUES(?,?,?)').run(student_id,number,1);env.sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(await digest(token),student_id,csrf,1,Math.floor(Date.now()/1000)+3600);return {student_id,student_number:number,token,csrf};}
async function request(env,owner,path,method='GET',body){return worker.fetch(new Request(APP+'/api/'+path,{method,headers:{Origin:APP,'Content-Type':'application/json',...(owner?{Cookie:'__Host-campus_week='+owner.token,'X-CSRF-Token':owner.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);}
test('lesson statistics count stable course IDs and repeated meetings, exclude personal events and reject malformed sessions',()=>{
 const rows=[[0,'09:10','10:00','Math','數學','A','CODE',null,'math'],[2,'10:20','12:10','Renamed','數學','B','CODE',null,'math'],[4,'13:20','15:10','Physics','物理','Lab','P',null,'physics']];
 const stats=lessonStatistics([...rows,rows[0],[1,'09:00','10:00','Study','Study','','',{id:'event'}],[1,'19:00','09:00','Bad'],[6,'09:99','10:00','Bad']]);
 assert.equal(stats.courses,2);assert.equal(stats.sessions,3);assert.equal(stats.minutes,270);assert.equal(stats.hours,4.5);assert.equal(stats.days,3);assert.deepEqual(stats.dailyMinutes,[50,0,110,0,110,0,0]);assert.equal(stats.busiestDay,2);assert.equal(lessonStatistics([]).busiestDay,null);
});
test('preferences are encrypted and scoped to the logged-in student, with conflicts rejected across devices',async()=>{
 const env=setup(),a=await identity(env),b=await identity(env,'r23456789');const values={version:0,theme:'dark',hanziEnabled:true,hanziUsername:'my_username'};
 assert.equal((await request(env,null,'preferences')).status,401);assert.equal((await request(env,{...a,csrf:'wrong'},'preferences','PATCH',values)).status,403);
 const saved=await request(env,a,'preferences','PATCH',values);assert.equal(saved.status,200);assert.equal((await saved.json()).version,1);
 const stored=env.sqlite.prepare('SELECT * FROM student_preferences').get();assert.doesNotMatch(stored.encrypted_preferences,/my_username|dark/);
 const own=await(await request(env,a,'preferences')).json();assert.equal(own.preferences.theme,'dark');assert.equal(own.preferences.hanziUsername,'my_username');
 const other=await(await request(env,b,'preferences')).json();assert.equal(other.preferences.theme,'light');assert.equal(other.preferences.hanziEnabled,false);assert.equal(other.version,0);
 assert.equal((await request(env,a,'preferences','PATCH',values)).status,409);assert.equal((await request(env,a,'preferences','PATCH',{...values,version:1,student_id:b.student_id})).status,400);env.sqlite.close();
});
test('preference runtime bootstrap upgrades an existing database without requiring a manual migration',async()=>{
 const env=setup(),a=await identity(env);env.sqlite.exec('DROP TABLE student_preferences');assert.equal((await request(env,a,'preferences')).status,200);assert.ok(env.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='student_preferences'").get());env.sqlite.close();
});
test('Hanzi proxy calls only the fixed public read-only endpoint, without NTU cookies or authorization',async()=>{
 const env=setup(),a=await identity(env);let call;
 const result=await readHanziWidget(env,a,'example_user',{upstream:async(url,options)=>{call={url,options};return Response.json({streak:12,todayProgress:4,todayGoal:10,unit:8,book:1,unitColor:'url(https://bad.example)',nextCharacter:{character:'學',pinyin:'xué',meaning:'to learn'},private:'never copy'});}});
 assert.equal(call.url,'https://hanzi-steps-api.weatherisgood06.workers.dev/widget?username=example_user');assert.deepEqual(call.options.headers,{Accept:'application/json'});assert.equal(call.options.redirect,'error');assert.equal(result.widget.streak,12);assert.equal(result.widget.unitColor,'#627b61');assert.equal(result.widget.private,undefined);
 await assert.rejects(readHanziWidget(env,a,'https://evil.example',{upstream:()=>{throw new Error('must not call');}}),error=>error.code==='invalid_hanzi_username');
 await assert.rejects(readHanziWidget(env,a,'missing',{upstream:async()=>new Response('',{status:404})}),error=>error.code==='hanzi_not_found');env.sqlite.close();
});
test('all settings sections coexist on one page, with valid jump targets and accessible controls',()=>{
 const html=readFileSync(new URL('../public/skeleton/index.html',import.meta.url),'utf8');const section=html.slice(html.indexOf('<dialog id="settings-dialog"'),html.indexOf('<dialog id="mail-dialog"'));
 for(const panel of ['appearance','timetable','install','widgets']){assert.match(section,new RegExp('data-settings-tab="'+panel+'"'));assert.match(section,new RegExp('data-settings-panel="'+panel+'"'));assert.doesNotMatch(section,new RegExp('data-settings-panel="'+panel+'" hidden'));}
 for(const id of ['account-id','log-out','stat-courses','stat-sessions','stat-hours','settings-hanzi-enabled','settings-hanzi-username','settings-language'])assert.equal((section.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.doesNotMatch(section,/Coming later|settings-rail|data-settings-panel="security"/);assert.match(section,/Preview · Sample data/);assert.doesNotMatch(section,/settings-section-index|A little more you|Your week, in numbers|Your week\. One tap away|Make room for learning|Made for student life|Go with the flow|After hours/);
});

test('Settings provides permission, device registration, local test and server push test',()=>{
 const html=readFileSync(new URL('../public/skeleton/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/skeleton/settings.mjs',import.meta.url),'utf8');
 const testUI=readFileSync(new URL('../public/skeleton/notification-settings.mjs',import.meta.url),'utf8');
 for(const id of ['settings-notify-permission','settings-notify-device','settings-notify-checker','settings-notify-check','settings-notify-local','settings-notify-push','settings-notify-status'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/data-settings-panel="notifications"/);
 assert.match(js,/notificationSettings\.inspect\(\)/);
 assert.match(testUI,/registration\.showNotification\(/);
 assert.match(testUI,/mail\/push\/test/);
});
