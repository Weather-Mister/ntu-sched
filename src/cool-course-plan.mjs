import {ApiError} from './security.mjs';
import {connection,limit,mergeCoolConnection} from './cool-store.mjs';
import {discoverCoolCalendar} from './cool-login.mjs';
import {sessionCookies,restoreCookies} from './cool-announcements.mjs';
import {documentFrom} from './portfolio-html.mjs';
import {parseCoursePlan,parseExamEntry} from './ntu-course-exams.mjs';
const COOL='https://cool.ntu.edu.tw';
const unavailable=()=>new ApiError(502,'cool_plan_unavailable','The COOL course plan could not be read. The public syllabus remains available.');
const weekIn=s=>{const m=/(?:\bWeek\s*(\d{1,2})\b|第\s*(\d{1,2})\s*週)/i.exec(String(s||''));const n=Number(m?.[1]||m?.[2]);return n>0&&n<=30?n:null;};

export function parseCoolCoursePlan(syllabus,modules,term,sourceUrl) {
 let plan={schedule:[],exams:[]};
 const seen=new Set();
 function add(text,week){
  if(typeof text!=='string'||!text.trim())return;
  const description=text.trim().slice(0,1200),entry=parseExamEntry(description,term,sourceUrl,{week});
  if(plan.schedule.length<300)plan.schedule.push({week,dates:[],description});
  if(!entry||plan.exams.length>=100)return;
  const key=JSON.stringify([entry.kind,entry.week,entry.date,entry.description]);if(!seen.has(key)){seen.add(key);plan.exams.push(entry);}
 }
 for(const module of modules){
  if(module.published===false||module.locked_for_user===true)continue;
  let week=weekIn(module.name);add(module.name,week);
  for(const item of module.items||[]){
   if(item.published===false||item.locked_for_user===true)continue;
   if(item.type==='SubHeader')week=weekIn(item.title)||week;
   add(item.title,weekIn(item.title)||week);
  }
 }
 if(plan.exams.length)return {...plan,sourceUrl,source:'ntu-cool',sourcePart:'modules',retrievedAt:Date.now()};
 // Read the syllabus only when the weekly modules provide no exam entries.
 const doc=documentFrom('<html><body>'+String(syllabus||'').slice(0,500000)+'</body></html>');
 plan=parseCoursePlan(doc,term,sourceUrl);seen.clear();
 for(const e of plan.exams)seen.add(JSON.stringify([e.kind,e.week,e.date,e.description]));
 // Simple prose syllabuses may use headings rather than tables. Never scan grade/assignment data.
 let syllabusWeek=null;
 for(const e of doc.querySelectorAll('h1,h2,h3,h4,p,li'))if(!e.closest('table')){
  const text=e.textContent||'';syllabusWeek=weekIn(text)||(/^H[1-4]$/.test(e.tagName)?null:syllabusWeek);
  if(!syllabusWeek&&/%/.test(text))continue;
  if(parseExamEntry(text,term,sourceUrl,{week:syllabusWeek}))add(text,syllabusWeek);
 }
 return {...plan,sourceUrl,source:'ntu-cool',sourcePart:'syllabus',retrievedAt:Date.now()};
}

export async function readCoolCoursePlan(jar,id,term) {
 if(!/^\d{1,12}$/.test(id)||!/^\d{3}-[12]$/.test(term))throw unavailable();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 let calls=0,bytes=0;
 const allowed=new Set(['/api/v1/courses',`/api/v1/courses/${id}`,`/api/v1/courses/${id}/modules`]);
 async function one(url,expectedPath){
  if(url.origin!==COOL||url.username||url.password||url.hash||url.pathname!==expectedPath||!allowed.has(expectedPath)||++calls>12)throw unavailable();
  // Only allow query fields constructed here, plus Canvas pagination; never request scores or enrollments.
  for(const [key,value]of url.searchParams)if(!['per_page','page','enrollment_state','include[]'].includes(key)||key==='include[]'&&!['syllabus_body','items'].includes(value))throw unavailable();
  if(url.searchParams.has('enrollment_state')&&url.searchParams.get('enrollment_state')!=='active'||
    ['page','per_page'].some(k=>url.searchParams.has(k)&&!/^\d{1,4}$/.test(url.searchParams.get(k))))throw unavailable();
  const response=await fetch(url,{redirect:'manual',headers:{Accept:'application/json',Cookie:jar.header(url),'User-Agent':'Campus-Week/1.0'},signal:controller.signal});
  jar.receive(response.headers,url);
  if([401,302,303].includes(response.status)){await response.body?.cancel();throw new ApiError(409,'cool_session_expired','COOL sign-in expired.');}
  if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json')){await response.body?.cancel();throw unavailable();}
  const reader=response.body?.getReader();if(!reader)throw unavailable();let text='',decoder=new TextDecoder();
  for(;;){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>3*1024*1024){await reader.cancel();throw unavailable();}text+=decoder.decode(p.value,{stream:true});}
  text+=decoder.decode();let data;try{data=JSON.parse(text.replace(/^while\(1\);\s*/,''));}catch{throw unavailable();}
  const next=(response.headers.get('Link')||'').split(',').find(p=>/rel="next"/.test(p))?.match(/<([^>]+)>/)?.[1];
  return{data,next:next?new URL(next,url):null};
 }
 async function pages(path){
  let url=new URL(path,COOL);const expected=url.pathname,seen=new Set(),items=[];
  while(url){if(seen.has(url.href))throw unavailable();seen.add(url.href);const r=await one(url,expected);if(!Array.isArray(r.data)||items.length+r.data.length>1000)throw unavailable();items.push(...r.data);url=r.next;}
  return items;
 }
 try{
  const active=await pages('/api/v1/courses?enrollment_state=active&per_page=100');
  if(!active.some(c=>String(c.id)===id))throw new ApiError(403,'cool_course_not_enrolled','This COOL course is not in your active enrolled course list.');
  const modules=await pages(`/api/v1/courses/${id}/modules?include[]=items&per_page=100`);
  for(const module of modules){
   if(module.published===false||module.locked_for_user===true)continue;
   if(!/^\d+$/.test(String(module.id)))throw unavailable();
   if(!Array.isArray(module.items)||Number(module.items_count)>module.items.length){
    const path=`/api/v1/courses/${id}/modules/${module.id}/items`;allowed.add(path);module.items=await pages(path+'?per_page=100');
   }
  }
  const sourceUrl=`${COOL}/courses/${id}`,modulePlan=parseCoolCoursePlan('',modules,term,sourceUrl);
  // A generic academic exam week is not proof of a scheduled exam.
  // An explicit cancellation is authoritative and must not be replaced by an older public listing.
  if(modulePlan.exams.some(e=>e.certainty!=='exam-period'))return modulePlan;
  const {data:course}=await one(new URL(`/api/v1/courses/${id}?include[]=syllabus_body`,COOL),`/api/v1/courses/${id}`);
  if(String(course?.id)!==id)throw unavailable();
  return parseCoolCoursePlan(course.syllabus_body,[],term,sourceUrl);
 }catch(error){if(error instanceof ApiError)throw error;throw unavailable();}finally{clearTimeout(timer);}
}

export async function coolPlanForStudent(env,student,candidate) {
 if(!candidate?.coolId)throw new ApiError(404,'cool_course_link_missing','The official catalog does not link this offering to a COOL course.');
 await limit(env,student.student_id,'exam-plan',20);
 const previous=await connection(env,student.student_id);
 if(previous?.value.announcementsReconnect||previous?.status==='reconnect_required')throw new ApiError(409,'cool_credentials_required','Reconnect COOL in Campus Week to read its syllabus.');
 let jar=restoreCookies(previous?.value.announcementCookies),credentials;
 async function login(){
  credentials=previous?.value.password?previous.value:(await connection(env,student.student_id,'timetable'))?.value||(await connection(env,student.student_id,'ntu_mail'))?.value;
  if(credentials?.username!==student.student_number||!credentials.password)throw new ApiError(409,'cool_credentials_required','Connect COOL in Campus Week to read its syllabus.');
  let cookies;
  await discoverCoolCalendar(student.student_number,credentials.password,{skipCalendar:true,beforeCredentialSubmit:()=>limit(env,student.student_id,'login',3),onAuthenticated:authenticated=>{cookies=sessionCookies(authenticated);}});
  jar.clear();jar=restoreCookies(cookies);
 }
 try{
  const hadSession=!!jar.header(new URL(COOL+'/api/v1/courses'));
  if(!hadSession)await login();
  let result;
  try{result=await readCoolCoursePlan(jar,candidate.coolId,candidate.term);}
  catch(error){if(error.code!=='cool_session_expired'||!hadSession)throw error;await login();result=await readCoolCoursePlan(jar,candidate.coolId,candidate.term);}
  // Retain only the existing encrypted provider session; never save syllabus content or exam dates.
  await mergeCoolConnection(env,student.student_id,{announcementCookies:sessionCookies(jar)});
  return result;
 }catch(error){
  if(['cool_credentials_required','cool_verification_required'].includes(error.code))await mergeCoolConnection(env,student.student_id,{announcementsReconnect:true});
  throw error;
 }finally{jar.clear();if(credentials)credentials.password='';}
}
