import { ApiError } from './security.mjs';
import { NTU_PERIODS } from '../public/ntu-periods.mjs';
import { readPublicNtu, syllabusUrl } from './ntu-course-exams.mjs';

const normal = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s:：()（）–—-]/g, '');
const section = value => normal(value).replace(/^0+(?=\d)/, '');
const unavailable = () => new ApiError(502,'exam_catalog_unavailable','NTU course search is unavailable. Try again later.');

// Only return bounded public metadata. No NTU authorization ever reaches this host.
export async function searchNtuCourses(term, selected) {
  if (!/^\d{3}-[12]$/.test(term)) throw unavailable();
  const keyword = selected.code || selected.courseIdentifier || selected.titleZh || selected.titleEn || selected.title;
  if (typeof keyword !== 'string' || !keyword.trim() || keyword.length > 160) throw unavailable();
  const query = { keyword, semester:term, type:'quick', isPrecise:true, departments:[], isCompulsory:null,
    time:Array.from({length:6},()=>[]), timeStrictMatch:false, isFullYear:null, excludedKeywords:[], enrollMethods:[],
    isEnglishTaught:false,isDistanceLearning:false,hasChanged:false,isAdditionalCourse:false,noPrerequisite:false,isCanceled:false,isIntensive:false };
  const courses = [];
  for (let pageIndex=0;pageIndex<3;pageIndex++) {
    let data;
    try { data=JSON.parse(await readPublicNtu('https://course.ntu.edu.tw/api/v1/courses/search/quick?lang=en_US',{
      method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({query,batchSize:30,pageIndex,sorting:'correlation'})
    },'application/json')); } catch { throw unavailable(); }
    if (!Array.isArray(data.courses) || !Number.isSafeInteger(data.totalCount) || data.totalCount<0 || data.courses.length>30) throw unavailable();
    for (const c of data.courses) {
      if(c.semester!==term || c.provider!=='NTU' || !/^\d{4,6}$/.test(c.serial) || c.status==='Canceled')continue;
      const schedules=(Array.isArray(c.schedules)?c.schedules:[]).slice(0,30).map(s=>({
        day:Number(s.weekday)-1,periods:Array.isArray(s.intervals)?s.intervals.map(String):[],room:String(s.classroom?.name||'').slice(0,160)
      }));
      courses.push({term,serial:c.serial,courseCode:String(c.identifier||'').slice(0,24),courseIdentifier:String(c.code||'').slice(0,24),
        section:String(c.class||'').slice(0,4),title:String(c.name||'').slice(0,160),teacher:String(c.teacher?.name||'').slice(0,160),
        coolId:/^https:\/\/cool\.ntu\.edu\.tw\/courses\/(\d+)\/?$/.exec(c.coolUrl||'')?.[1]||null,
        schedules,sourceUrl:syllabusUrl(`https://course.ntu.edu.tw/en/courses/${term}/${c.serial}`)});
    }
    if ((pageIndex+1)*30>=data.totalCount) return [...new Map(courses.map(c=>[c.serial,c])).values()];
    if(!data.courses.length)throw unavailable();
  }
  throw new ApiError(409,'exam_search_too_broad','This course has too many catalog results to verify safely. Use the official syllabus link in Advanced lookup.');
}

function meetingKeys(schedules) {
  return schedules.flatMap(s=>s.periods.map(p=>`${s.day}:${p}`)).sort();
}
function matchesTimetable(rows,candidate) {
  const imported=rows.map(s=>({day:s.day,periods:NTU_PERIODS.filter(p=>p[1]>=s.start&&p[2]<=s.end).map(p=>p[0])}));
  if(imported.some(s=>!s.periods.length))return false;
  const a=[...new Set(meetingKeys(imported))],b=[...new Set(meetingKeys(candidate.schedules))];
  return a.length>0&&a.length===b.length&&a.every((p,i)=>p===b[i]);
}

export function resolveNtuCourse(timetable, rows, candidates, {serial, coolIds=[]}={}) {
  const selected=rows[0],codes=[selected.code,selected.courseIdentifier].filter(Boolean).map(normal);
  const titles=[selected.title,selected.titleEn,selected.titleZh].filter(Boolean).map(normal);
  let eligible=candidates.filter(c=>c.term===timetable.term && (codes.length
    ? codes.some(code=>[normal(c.courseCode),normal(c.courseIdentifier)].includes(code))
    : titles.includes(normal(c.title))));
  if(selected.serial)eligible=eligible.filter(c=>c.serial===selected.serial);
  if(selected.section)eligible=eligible.filter(c=>section(c.section)===section(selected.section));
  let chosen, status, reason;
  if(serial){
    chosen=eligible.find(c=>c.serial===serial);
    if(!chosen)throw new ApiError(400,'exam_section_invalid','Choose one of the matching public course sections.');
    status='student-selected';reason='You selected this public course section. Verify it is your enrolled section.';
  } else if(selected.serial && eligible.length===1){
    chosen=eligible[0];status='matched-identifiers';reason='The imported offering serial and course metadata match.';
  } else {
    const timed=eligible.filter(c=>matchesTimetable(rows,c));
    const enrolled=timed.filter(c=>c.coolId&&coolIds.includes(c.coolId));
    if(enrolled.length===1){chosen=enrolled[0];status='matched-cool';reason='Course metadata, all meeting periods and your saved COOL course link match.';}
    else if(timed.length===1){chosen=timed[0];status='matched-timetable';reason='One catalog offering matches the course name/code and all imported meeting periods. Enrollment is not independently verified.';}
    // Prefer matching times in the picker, but do not hide other possible sections.
    eligible.sort((a,b)=>Number(matchesTimetable(rows,b))-Number(matchesTimetable(rows,a)));
  }
  return {selected:chosen||null,matching:{status:status||(eligible.length?'choose-section':'not-found'),
    reason:reason||(eligible.length?'Several sections or incomplete meeting details need your choice.':'No exact course name or code match was found for this semester.')},candidates:eligible};
}
