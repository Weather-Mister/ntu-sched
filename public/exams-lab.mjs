const el=id=>document.getElementById(id),course=el('course'),source=el('source'),button=el('check'),retry=el('retry'),
status=el('status'),results=el('results'),match=el('match'),details=el('details'),exams=el('exams'),picker=el('picker'),offering=el('offering');
const node=(tag,text,klass='')=>{const e=document.createElement(tag);if(klass)e.className=klass;if(text!==undefined)e.textContent=text;return e};
const say=(text,error=false)=>{status.textContent=text;status.className=error?'error':'muted'};
let owner=null,epoch=0,request=null,lookupSerial='';
function clear(){results.hidden=picker.hidden=true;match.replaceChildren();details.replaceChildren();exams.replaceChildren();el('schedule').replaceChildren();offering.replaceChildren();}
function invalidate(){epoch++;request?.abort();clear();}
async function get(url,signal) {
 const response=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store',signal});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error?.message||'NTU request failed.');
 return data;
}
const accepted=new Set(['matched-identifiers','matched-cool','matched-timetable','student-selected','code-only']);
export function renderSyllabus(data){
 match.replaceChildren(node('strong',data.matching.status.replaceAll('-',' ')),node('span',' · '+data.matching.reason,'muted'));
 if(!data.course){results.hidden=true;return;}
 const c=data.course;
 details.replaceChildren(node('p',c.title+' · '+c.courseCode+' · Section '+(c.section||'unavailable')+' · Offering '+c.serial+' · Semester '+c.term));
 const link=node('a','Open official NTU syllabus');link.href=c.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';details.append(link);
 exams.replaceChildren();el('schedule').replaceChildren();
 if(!accepted.has(data.matching.status))exams.append(node('p','This syllabus has not been verified for your selected class.','error'));
 else if(!c.exams?.length)exams.append(node('p','No exam entries were found in this syllabus plan. Your instructor may announce them elsewhere.','muted'));
 else for(const exam of c.exams){
  const item=node('div',undefined,'exam'),top=node('div',undefined,'exam-top');
  const labels={explicit:'Explicit date','scheduled-week':'Tentative schedule date','week-only':'Week only','exam-period':'Exam period',cancelled:'Cancelled / no exam',ambiguous:'Unconfirmed timing'};
  top.append(node('strong',exam.kind.charAt(0).toUpperCase()+exam.kind.slice(1)),node('span',labels[exam.certainty]||'Unconfirmed timing','badge'));
  item.append(top,node('div',exam.date||(exam.week?'Week '+exam.week+' · Exact date unavailable':'Exact date unavailable')),node('p',exam.description,'muted'));exams.append(item);
 }
 for(const row of c.schedule||[]){const tr=node('tr');tr.append(node('td',[row.week?'Week '+row.week:'',...(row.dates||[])].filter(Boolean).join(' · ')),node('td',row.description));el('schedule').append(tr);}
 el('plan').hidden=!c.schedule?.length;
 results.hidden=false;
}
async function lookup(manual=false){
 if(!owner||!course.value)return;
 if(manual&&!source.value.trim())return say('Paste an official NTU syllabus URL in Advanced lookup.',true);
 invalidate();const ticket=epoch,expectedOwner=owner;
 request=new AbortController();const signal=request.signal;
 button.disabled=retry.disabled=true;say('Finding the public NTU syllabus…');
 try {
  const query=new URLSearchParams({courseId:course.value});
  if(manual){query.set('source',source.value.trim());for(const field of ['serial','section','code']){const val=el(field).value.trim();if(val)query.set(field,val);}}
  else if(lookupSerial)query.set('serial',lookupSerial);
  const data=await get('/api/exams/'+(manual?'preview':'resolve')+'?'+query,signal);
  const current=await get('/api/auth/me',signal);
  if(ticket!==epoch)return;
  if(data.studentNumber!==expectedOwner||current.studentNumber!==expectedOwner){owner=null;invalidate();course.disabled=true;return say('Your signed-in account changed. Reload this page to load its courses.',true);}
  if(data.candidates?.length){
   offering.replaceChildren(node('option','Select your teacher / section…'));offering.firstChild.value='';
   for(const c of data.candidates){const o=node('option',c.title+' · '+(c.teacher||'Teacher unavailable')+' · Section '+(c.section||'—')+' · '+c.serial);o.value=c.serial;offering.append(o);}
   if(data.course)offering.value=data.course.serial;
   picker.hidden=!!data.course&&data.candidates.length<2;
  }
  renderSyllabus(data);
  say(data.course?'Public syllabus loaded. Preview only; nothing was saved.':data.matching.reason,!data.candidates?.length&&!data.course);
 }catch(error){if(ticket===epoch&&error.name!=='AbortError')say(error.message,true);}
 finally{if(ticket===epoch)button.disabled=retry.disabled=!owner;}
}
course.addEventListener('change',()=>{lookupSerial='';source.value='';for(const id of ['serial','section','code'])el(id).value='';lookup();});
offering.addEventListener('change',()=>{lookupSerial=offering.value;if(lookupSerial)lookup();});
retry.addEventListener('click',()=>lookup());button.addEventListener('click',()=>lookup(true));
async function initialize(){
 const previousOwner=owner,previousCourse=course.value,previousSerial=lookupSerial;
 invalidate();const ticket=epoch;owner=null;course.disabled=button.disabled=retry.disabled=true;say('Loading your imported courses…');
 try {
  const data=await get('/api/timetable');
  if(ticket!==epoch)return;
  const unique=new Map();for(const row of data.timetable?.sessions||[])if(row.courseId&&!unique.has(row.courseId))unique.set(row.courseId,row);
  if(!data.timetable?.term||!unique.size)throw new Error('Sync your NTU timetable in Campus Week first.');
  owner=data.studentNumber;course.replaceChildren();
  for(const row of unique.values()){const option=node('option',(row.titleEn||row.title||row.titleZh)+(row.code?' · '+row.code:''));option.value=row.courseId;course.append(option);}
  el('semester').textContent=unique.size+' imported courses · Semester '+data.timetable.term;
  if(owner===previousOwner&&unique.has(previousCourse)){course.value=previousCourse;lookupSerial=previousSerial;}else{lookupSerial='';source.value='';for(const id of ['serial','section','code'])el(id).value='';}
  course.disabled=button.disabled=retry.disabled=false;await lookup();
 }catch(error){if(ticket===epoch){course.replaceChildren(node('option','No timetable available'));say(error.message,true);}}
}
// Clear private results while hidden; re-check ownership before restoring the view.
document.addEventListener('visibilitychange',()=>{if(document.hidden)invalidate();else initialize();});
window.addEventListener('pageshow',event=>{if(event.persisted)initialize();});
await initialize();
