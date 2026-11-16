import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../src/worker.mjs';
import {digest,randomToken,encryptAuthorization} from '../src/security.mjs';
import {reportSchema,readReportState} from '../src/report-storage.mjs';
import {compareRecords,safeLinks} from '../src/cool-report.mjs';
import {documentText} from '../src/report-content.mjs';
import {zipSync,strToU8} from 'fflate';

const APP='https://campus.example',CALLBACK='https://chatgpt.com/connector_platform/oauth/callback',KEY='12'.repeat(32);
async function fixture(run){
 const db=new DatabaseSync(':memory:');
 for(const f of readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return {meta:stmt.run(...args)};}};},async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,APP_ORIGIN:APP,NTU_CREDENTIAL_KEY:KEY},owners=[];
 for(const number of ['b15502123','b12345678']){
  const owner={student_id:crypto.randomUUID(),student_number:number,token:randomToken(),csrf:randomToken()};
  db.prepare('INSERT INTO students VALUES(?,?,?)').run(owner.student_id,number,1);
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(await digest(owner.token),owner.student_id,owner.csrf,1,Math.floor(Date.now()/1000)+3600);owners.push(owner);
 }
 async function req(path,{method='GET',body,owner,headers={},form}={}){
  const h=new Headers(headers);if(owner){h.set('Cookie','__Host-campus_week='+owner.token);h.set('X-CSRF-Token',owner.csrf);h.set('Origin',APP);}
  if(body!==undefined)h.set('Content-Type','application/json');if(form)h.set('Content-Type','application/x-www-form-urlencoded');
  const response=await worker.fetch(new Request(APP+path,{method,headers:h,body:form?new URLSearchParams(form):body===undefined?undefined:JSON.stringify(body)}),env);
  return response;
 }
 async function register(callback=CALLBACK){const r=await req('/oauth/register',{method:'POST',body:{redirect_uris:[callback],token_endpoint_auth_method:'none'}});assert.equal(r.status,201);return (await r.json()).client_id;}
 async function authorize({owner=owners[0],client,verifier=randomToken()+randomToken(),approve=true}={}){
  client||=await register();const challenge=await digest(verifier),q=new URLSearchParams({client_id:client,redirect_uri:CALLBACK,response_type:'code',state:'synthetic-state',code_challenge:challenge,code_challenge_method:'S256',resource:APP+'/mcp',scope:'cool:read offline_access'});
  const r=await req('/oauth/authorize?'+q);assert.equal(r.status,303);
  const id=new URL(r.headers.get('Location')).searchParams.get('request');
  const approved=await req('/api/report/authorize',{method:'POST',owner,body:{request:id,approve}});assert.equal(approved.status,200,await approved.clone().text());
  const redirect=new URL((await approved.json()).redirect);assert.equal(redirect.searchParams.get('state'),'synthetic-state');
  return {id,code:redirect.searchParams.get('code'),client,verifier,redirect};
 }
 async function exchange(auth,extra={}){return req('/oauth/token',{method:'POST',form:{client_id:auth.client,grant_type:'authorization_code',code:auth.code,code_verifier:auth.verifier,redirect_uri:CALLBACK,resource:APP+'/mcp',...extra}});}
 async function rpc(token,name,args={}){return req('/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}});}
 const realFetch=globalThis.fetch;
 try{await run({db,env,owners,req,register,authorize,exchange,rpc});}finally{globalThis.fetch=realFetch;db.close();}
}
test('discovery binds tokens to the MCP resource and unauthenticated reads disclose no course data',()=>fixture(async({req})=>{
 const metadata=await (await req('/.well-known/oauth-authorization-server')).json();assert.ok(metadata.grant_types_supported.includes('refresh_token'));assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);
 const r=await req('/mcp',{method:'POST',body:{jsonrpc:'2.0',id:1,method:'tools/list'}});assert.equal(r.status,401);assert.match(r.headers.get('WWW-Authenticate'),/oauth-protected-resource\/mcp/);assert.deepEqual(await r.json(),{error:'unauthorized'});
 const resource=await (await req('/.well-known/oauth-protected-resource/mcp')).json();assert.equal(resource.resource,APP+'/mcp');
}));
test('OAuth enforces registered HTTPS callbacks, state, resource and S256; it never redirects invalid requests',()=>fixture(async({req,register})=>{
 for(const uri of ['http://evil.example/callback','https://user:secret@evil.example/callback','javascript:alert(1)','https://evil.example/callback#x'])assert.equal((await req('/oauth/register',{method:'POST',body:{redirect_uris:[uri]}})).status,400);
 assert.equal((await req('/oauth/register',{method:'POST',body:{redirect_uris:[CALLBACK],grant_types:'wrong'}})).status,400);
 const client=await register();const q=new URLSearchParams({client_id:client,redirect_uri:CALLBACK,response_type:'code',state:'x',code_challenge:await digest('x'),code_challenge_method:'S256',resource:APP+'/mcp'});
 for(const [key,value]of [['redirect_uri','https://evil.example/callback'],['state',''],['resource','https://evil.example/mcp'],['code_challenge_method','plain']]){const copy=new URLSearchParams(q);copy.set(key,value);const r=await req('/oauth/authorize?'+copy);assert.equal(r.status,400);assert.equal(r.headers.get('Location'),null);}
}));
test('consent is session and CSRF protected, denial issues no grant, and pending requests are single use',()=>fixture(async({req,authorize,owners,db})=>{
 const a=await authorize({approve:false});assert.equal(a.redirect.searchParams.get('error'),'access_denied');assert.equal(db.prepare('SELECT count(*) n FROM report_grants').get().n,0);
 const again=await req('/api/report/authorize',{method:'POST',owner:owners[0],body:{request:a.id,approve:true}});assert.equal(again.status,400);
 assert.equal((await req('/api/report/authorize',{method:'POST',body:{request:'x',approve:true},headers:{Origin:APP}})).status,401);
 assert.equal((await req('/api/report/authorize',{method:'POST',owner:{...owners[0],csrf:'wrong'},body:{request:'x',approve:true}})).status,403);
}));
test('authorization codes are bound to client, callback and verifier and cannot be replayed',()=>fixture(async({req,authorize,register,exchange,db})=>{
 const a=await authorize();assert.equal((await exchange(a,{code_verifier:'wrong'.repeat(12)})).status,400);
 const other=await register();assert.equal((await exchange(a,{client_id:other})).status,400);
 assert.equal((await exchange(a,{redirect_uri:'https://evil.example/callback'})).status,400);
 const r=await exchange(a);assert.equal(r.status,200);const tokens=await r.json();assert.ok(tokens.refresh_token);assert.equal(tokens.expires_in,3600);
 assert.equal((await exchange(a)).status,400);const row=db.prepare('SELECT * FROM report_grants').get();assert.notEqual(row.access_hash,tokens.access_token);assert.notEqual(row.refresh_hash,tokens.refresh_token);assert.equal(row.access_hash,await digest(tokens.access_token));
}));
test('refresh survives browser-session expiry, rotates atomically, preserves scope and revokes immediately',()=>fixture(async({req,authorize,exchange,rpc,owners,db})=>{
 const auth=await authorize(),tokens=await (await exchange(auth)).json();db.prepare('DELETE FROM sessions').run();db.prepare('UPDATE report_grants SET access_expires=0').run();
 const refresh=extra=>req('/oauth/token',{method:'POST',form:{client_id:auth.client,grant_type:'refresh_token',refresh_token:tokens.refresh_token,resource:APP+'/mcp',...extra}});
 assert.equal((await refresh({scope:'cool:read'})).status,400);
 const responses=await Promise.all([refresh(),refresh()]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);const renewed=await responses.find(r=>r.status===200).json();
 assert.equal((await rpc(renewed.access_token,'get_daily_report')).status,200);
 assert.equal((await rpc(tokens.access_token,'get_daily_report')).status,401);
 await req('/oauth/revoke',{method:'POST',form:{client_id:auth.client,token:renewed.refresh_token}});
 assert.equal((await rpc(renewed.access_token,'get_daily_report')).status,401);
}));
test('report state is encrypted, isolated per student, and cannot invoke mail or COOL writes',()=>fixture(async({authorize,exchange,rpc,db,owners,req})=>{
 const a=await (await exchange(await authorize())).json(),b=await (await exchange(await authorize({owner:owners[1]}))).json();
 const content='Private exam: vocabulary pages 108–110';
 const save=await (await rpc(a.access_token,'save_daily_report',{date:'2026-11-17',markdown:content})).json();assert.equal(save.result.isError,false);
 assert.equal((await (await rpc(b.access_token,'get_daily_report')).json()).result.structuredContent.report,null);
 assert.equal((await (await rpc(a.access_token,'get_daily_report')).json()).result.structuredContent.report.markdown,content);
 assert.ok(!db.prepare('SELECT encrypted FROM report_state').get().encrypted.includes(content));
 for(const name of ['send_mail','submit_assignment','start_quiz'])assert.equal((await (await rpc(a.access_token,name)).json()).error.code,-32602);
 const bad=await (await rpc(a.access_token,'get_daily_report',{student_id:owners[1].student_id})).json();assert.equal(bad.error.code,-32602);
 const disconnect=await req('/api/report/connections',{method:'DELETE',owner:owners[0]});assert.equal(disconnect.status,200);assert.equal((await rpc(a.access_token,'get_daily_report')).status,401);assert.equal((await rpc(b.access_token,'get_daily_report')).status,200);
}));
test('course checks paginate, respect enrollment, retain failed sections and detect changed deadlines',()=>fixture(async({env,owners,authorize,exchange,rpc})=>{
 const owner=owners[0];
  await env.DB.prepare('INSERT INTO student_connections VALUES(?,?,?,?,?)').bind(owner.student_id,'cool',await encryptAuthorization(KEY,owner.student_id,'cool',{announcementCookies:[['session',{domain:'cool.ntu.edu.tw',path:'/',pair:'session=synthetic',hostOnly:true,expires:null}]]}),'authorized',1).run();
 let due='2026-11-20T15:59:00Z',fail=false,expire=false;const calls=[];
 globalThis.fetch=async(url,init)=>{
  const u=new URL(url);calls.push(u.href);assert.equal(u.origin,'https://cool.ntu.edu.tw');assert.equal(init.redirect,'manual');assert.equal(init.method,undefined);
  if(u.pathname==='/api/v1/courses')return Response.json([{id:67364,name:'Chinese'}]);
  if(u.pathname.endsWith('/assignments')){if(expire)return new Response(null,{status:302,headers:{Location:'https://cool.ntu.edu.tw/login'}});if(fail)return new Response('No',{status:503});if(u.searchParams.get('page')==='2')return Response.json([{id:2,name:'Second task',description:'read',due_at:due,submission:{workflow_state:'unsubmitted'}}]);return Response.json([{id:1,name:'Homework',description:'<p>Pages 108–110</p>',due_at:due,submission:{workflow_state:'submitted',submitted_at:'2026-11-15'}}],{headers:{Link:'<https://cool.ntu.edu.tw/api/v1/courses/67364/assignments?page=2>; rel="next"'}});}
  if(u.pathname==='/api/v1/courses/67364')return Response.json({id:67364,syllabus_body:expire?'<p>New exam date</p>':'<p>Test November 20</p>'});
  return Response.json([]);
 };
 const tokens=await (await exchange(await authorize())).json();
 const scan=async (id='67364')=>(await (await rpc(tokens.access_token,'check_course',{course_id:id})).json()).result;
 const first=(await scan()).structuredContent;assert.equal(first.complete,true);assert.equal(first.sections.assignments.items.length,2);assert.equal(first.sections.assignments.changes.baseline,true);
 due='2026-11-21T15:59:00Z';const second=(await scan()).structuredContent;assert.equal(second.sections.assignments.changes.changed.length,2);
 assert.equal(second.sections.assignments.items[0].submission.state,'submitted');
 fail=true;const third=(await scan()).structuredContent;assert.equal(third.complete,false);assert.equal(third.sections.assignments.status,'not_checked');assert.equal(third.sections.assignments.lastVerifiedAt,second.sections.assignments.checkedAt);assert.equal(third.sections.assignments.changes,null);
 const forbidden=await scan('999');assert.equal(forbidden.isError,true);assert.ok(!calls.some(u=>u.includes('/courses/999/')));
 const before=await readReportState(env,owner,'67364:syllabus');expire=true;assert.equal((await scan()).isError,true);const after=await readReportState(env,owner,'67364:syllabus');assert.deepEqual(after,before,'A session-expiry retry must not consume changes from earlier sections.');
}));
test('content extraction reads Traditional Chinese DOCX text and content changes independent of filenames',async()=>{
 const doc=zipSync({'word/document.xml':strToU8('<w:document><w:p><w:r><w:t>中文考試 11/20 範圍 108–110</w:t></w:r></w:p></w:document>')});
 assert.match((await documentText(doc,'schedule.docx')).text,/中文考試 11\/20 範圍 108–110/);
 assert.deepEqual(compareRecords(null,[{id:1}]),{baseline:true,added:[],changed:[],removed:[]});
 const difference=compareRecords([{id:1,name:'same.docx',text:'old'}],[{id:1,name:'same.docx',text:'new'}]);assert.deepEqual(difference.changed[0].fields,['text']);
 const links=safeLinks([{url:'https://docs.google.com/document/d/abc123/edit?usp=sharing'},{url:'https://evil.example/secret'},{url:'https://cool.ntu.edu.tw/files/1/download?verifier=secret'}]);assert.deepEqual(links,[{title:'Linked course document',url:'https://docs.google.com/document/d/abc123/edit'}]);
});
test('material reads hash actual bytes on every call and never leak provider cookies to download storage',()=>fixture(async({env,owners,authorize,exchange,rpc})=>{
 const owner=owners[0];await env.DB.prepare('INSERT INTO student_connections VALUES(?,?,?,?,?)').bind(owner.student_id,'cool',await encryptAuthorization(KEY,owner.student_id,'cool',{announcementCookies:[['session',{domain:'cool.ntu.edu.tw',path:'/',pair:'session=synthetic',hostOnly:true,expires:null}]]}),'authorized',1).run();
 let wording='Exam November 20: pages 108–110';const storageCalls=[];
 globalThis.fetch=async(url,init)=>{
  const u=new URL(url);
  if(u.hostname==='files.s3.amazonaws.com'){storageCalls.push(init);assert.equal(init.headers.Cookie,undefined);return new Response(zipSync({'word/document.xml':strToU8('<w:document><w:p><w:r><w:t>'+wording+'</w:t></w:r></w:p></w:document>')}));}
  assert.equal(u.origin,'https://cool.ntu.edu.tw');assert.equal(init.headers.Cookie,'session=synthetic');
  if(u.pathname==='/api/v1/courses')return Response.json([{id:67364,name:'Chinese'}]);
  if(u.pathname==='/api/v1/courses/67364/files/42')return Response.json({id:42,filename:'same-schedule.docx',display_name:'same-schedule.docx',url:'https://cool.ntu.edu.tw/files/42/download?verifier=synthetic'});
  if(u.pathname==='/files/42/download')return new Response(null,{status:302,headers:{Location:'https://files.s3.amazonaws.com/doc'}});
  throw Error('Unexpected upstream path');
 };
 const token=(await (await exchange(await authorize())).json()).access_token;
 const read=async()=>(await (await rpc(token,'read_material',{course_id:'67364',kind:'file',source_id:'42'})).json()).result.structuredContent;
 const first=await read();assert.equal(first.baseline,true);assert.equal(first.changed,null);
 wording='Exam November 23: pages 111–113';const next=await read();assert.equal(next.changed,true);assert.notEqual(next.contentHash,first.contentHash);assert.equal(next.previousText,first.text);assert.match(next.text,/November 23/);assert.equal(storageCalls.length,2);assert.ok(!JSON.stringify(next).includes('verifier'));
}));
test('PDF extraction reads real text layers and marks image-only or unsupported sources for review',async()=>{
 const stream='BT /F1 12 Tf 30 150 Td (Exam November 20 pages 108-110) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}const xref=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 const result=await documentText(strToU8(pdf),'schedule.pdf','application/pdf');assert.match(result.text,/Exam November 20 pages 108-110/);assert.equal(result.needsVisualReview,false);
 const unsupported=await documentText(strToU8('fake'),'scan.jpg','image/jpeg');assert.equal(unsupported.needsVisualReview,true);assert.equal(unsupported.unsupported,true);
});
