const course=document.getElementById('course'),source=document.getElementById('source'),button=document.getElementById('check'),
status=document.getElementById('status'),results=document.getElementById('results'),match=document.getElementById('match'),
details=document.getElementById('details'),exams=document.getElementById('exams');
const node=(tag,text,klass='')=>{const el=document.createElement(tag);if(klass)el.className=klass;if(text!==undefined)el.textContent=text;return el};
const say=(text,error=false)=>{status.textContent=text;status.className=error?'error':'muted'};
async function get(url) {
 const response=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error?.message||'NTU request failed.');
 return data;
}
try {
 const {timetable}=await get('/api/timetable');
 const sessions=timetable?.sessions||[],unique=new Map();
 for(const row of sessions)if(row.courseId&&!unique.has(row.courseId))unique.set(row.courseId,row);
 course.replaceChildren();
 for(const row of unique.values()){
  const option=document.createElement('option');option.value=row.courseId;
  option.textContent=(row.titleEn||row.title||row.titleZh||'Course')+(row.code?' · '+row.code:'');course.append(option);
 }
 if(!timetable?.term)throw new Error('Your timetable has no semester identifier. Sync it in Campus Week first.');
 if(!unique.size)throw new Error('No imported courses found. Sync your timetable in Campus Week.');
 course.disabled=button.disabled=false;say('Imported '+unique.size+' course(s) · Semester '+timetable.term);
} catch(error){course.replaceChildren(node('option','No timetable available'));say(error.message,true);}
button.addEventListener('click',async()=>{
 if(!course.value||!source.value.trim())return say('Select a class and paste its official syllabus URL.',true);
 button.disabled=true;results.hidden=true;say('Checking the public NTU syllabus…');
 try {
  const query=new URLSearchParams({source:source.value.trim(),courseId:course.value});
  for(const field of ['serial','section','code']){const val=document.getElementById(field).value.trim();if(val)query.set(field,val);}
  const data=await get('/api/exams/preview?'+query);
  match.replaceChildren();details.replaceChildren();exams.replaceChildren();
  const valid=['matched-identifiers','code-only'].includes(data.matching.status);
  match.append(node('strong',valid?'Course '+data.matching.status.replace('-',' '):'Not matched'));
  match.append(node('span',' · '+data.matching.reason,'muted'));
  if(data.matching.identifierSource==='student-entered')match.append(node('p','Compared against identifiers you entered manually, not independently imported from NTU.','fine'));
  details.textContent='NTU course '+(data.course.courseCode||'—')+
   ' · Section '+(data.course.section||'unavailable')+' · Offering '+data.course.serial+' · Semester '+data.course.term;
  if(!valid) {
   exams.append(node('p','This syllabus has not been verified for the selected class. Dates are not eligible for import.','error'));
  } else if(!data.course.exams?.length) {
   exams.append(node('p','No exam dates were found in the syllabus schedule. The instructor may announce them elsewhere.','muted'));
  } else {
   for(const exam of data.course.exams){
    const item=node('div',undefined,'exam'),top=node('div',undefined,'exam-top');
    top.append(node('strong',exam.kind.charAt(0).toUpperCase()+exam.kind.slice(1)),
      node('span',exam.certainty==='explicit'?'Explicit date':exam.certainty==='scheduled-week'?'Syllabus schedule date':'Unconfirmed timing','badge'));
    item.append(top,node('div',exam.date||'Exact date unavailable'),
      node('p',exam.description,'muted'));exams.append(item);
   }
  }
  results.hidden=false;say('Read-only syllabus check complete.');
 } catch(error){say(error.message,true);}
 finally{button.disabled=false;}
});
