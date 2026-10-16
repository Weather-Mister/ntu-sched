// Account-owned, memory-only exam previews. No background polling or browser storage.
export class AccountExams {
  constructor(client,onChange,onExpired,{now=Date.now}={}) {
    Object.assign(this,{client,onChange,onExpired,now});
    this.epoch=0;this.owner=null;this.entries=new Map();this.busy=false;this.active=false;
    this.signature='';this.courses=[];this.lastForced=-Infinity;
  }
  bind(owner) {
    this.epoch++;this.owner=owner;this.entries.clear();this.signature='';this.courses=[];
    this.busy=false;this.active=false;this.lastForced=-Infinity;
  }
  configure(timetable,overrides={}) {
    const courses=[...new Map((timetable?.sessions||[]).map(c=>[c.courseId,c])).values()];
    const signature=JSON.stringify([timetable?.term,timetable?.changedAt,courses.map(c=>[c.courseId,overrides[c.courseId]?.examOffering?.serial||''])]);
    if(signature===this.signature)return;
    this.signature=signature;this.epoch++;this.busy=false;
    const previous=this.courses;this.courses=courses.map(c=>({...c,selection:overrides[c.courseId]?.examOffering?.serial||''}));
    for(const [id]of this.entries)if(!this.courses.some(c=>c.courseId===id&&previous.some(p=>p.courseId===id&&p.selection===c.selection)))this.entries.delete(id);
    // A fresh imported timetable can change the term or matching evidence.
    if(this.timetableKey!==JSON.stringify([timetable?.term,timetable?.changedAt]))this.entries.clear();
    this.timetableKey=JSON.stringify([timetable?.term,timetable?.changedAt]);
    if(this.active)void this.refresh();
  }
  async refresh(force=false) {
    if(!this.owner||!this.active||this.busy)return;
    if(force&&this.now()-this.lastForced<60000)return;
    if(force)this.lastForced=this.now();
    const epoch=this.epoch,owner=this.owner;
    this.busy=true;this.onChange();
    try {
      for(const c of this.courses){
        if(epoch!==this.epoch||!this.active)return;
        const old=this.entries.get(c.courseId);
        if(!force&&old&&this.now()-old.at<(old.error?60000:900000))continue;
        try {
          const result=await this.client.courseExamPlan(c.courseId);
          if(epoch!==this.epoch)return;
          if(result.studentNumber!==owner.studentNumber){this.onExpired();return;}
          this.entries.set(c.courseId,{result,at:this.now(),error:null});
        }catch(error){
          if(epoch!==this.epoch)return;
          if(error.status===401){this.onExpired();return;}
          this.entries.set(c.courseId,{result:old?.result||null,at:this.now(),error});
          if(error.status===429)break;
        }
        this.onChange();
      }
    }finally{if(epoch===this.epoch){this.busy=false;this.onChange();}}
  }
}

export function officialCourseUrl(course) {
  return /^\d{3}-[123]$/.test(course?.term||'')&&/^\d{4,6}$/.test(course?.serial||'')
    ?`https://course.ntu.edu.tw/en/courses/${course.term}/${course.serial}`:null;
}
// These are week *ranges* for ordering only, not individual exam dates.
// Add other semesters only after verifying NTU's published academic calendar.
// NTU 115-1 teaching week 1 begins Monday, 2026-09-07.
const knownTermStarts={'115-1':'2026-09-07'};
const validDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?value:null;
};
const iso=time=>new Date(time).toISOString().slice(0,10);
const dayTime=date=>Date.parse(date+'T00:00:00Z');
const addDays=(date,n)=>iso(dayTime(date)+n*86400000);
const monday=date=>{
  const day=new Date(dayTime(date)).getUTCDay();
  return addDays(date,-((day+6)%7));
};
const weekNumber=value=>Number.isInteger(value)&&value>=1&&value<=30?value:null;
function weekOne(course) {
  // Prefer real dated rows belonging to this course; none is shown as an exam day.
  for(const row of course.schedule||[]){
    const week=weekNumber(row.week);
    if(!week)continue;
    for(const raw of row.dates||[]){
      const date=validDate(raw);
      if(date)return addDays(monday(date),-(week-1)*7);
    }
  }
  for(const exam of course.exams||[]){
    const week=weekNumber(exam.week);
    const date=['explicit','scheduled-week'].includes(exam.certainty)?validDate(exam.date):null;
    if(week&&date)return addDays(monday(date),-(week-1)*7);
  }
  return knownTermStarts[course.term]||null;
}
export function examFeed(entries,today) {
  const upcoming=[],past=[];
  for(const [courseId,entry]of entries){
    const course=entry.result?.course,url=officialCourseUrl(course);
    if(!url)continue;
    const firstWeek=weekOne(course);
    for(const exam of course.exams||[]){
      if(exam.certainty==='cancelled')continue;
      // An ambiguous or week-only source cannot acquire an exact date in our UI.
      const date=['explicit','scheduled-week'].includes(exam.certainty)?validDate(exam.date):null;
      const week=weekNumber(exam.week);
      const weekStart=week&&firstWeek?addDays(firstWeek,(week-1)*7):null;
      const weekEnd=weekStart?addDays(weekStart,6):null;
      const ended=date?date<today:!!(weekEnd&&weekEnd<today);
      // An ongoing week is positioned at today; its exact exam day is still unknown.
      const sortDate=date||(weekStart?(weekStart<today?today:weekStart):'9999-12-31');
      const item={courseId,course,exam,url,date,week,stale:!!entry.error,sortDate};
      (ended?past:upcoming).push(item);
    }
  }
  const byName=(a,b)=>String(a.course.title||'').localeCompare(String(b.course.title||''))||String(a.exam.kind||'').localeCompare(String(b.exam.kind||''));
  upcoming.sort((a,b)=>a.sortDate.localeCompare(b.sortDate)||byName(a,b));
  past.sort((a,b)=>b.sortDate.localeCompare(a.sortDate)||byName(a,b));
  return {upcoming,past};
}
