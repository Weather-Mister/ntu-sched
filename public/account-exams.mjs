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
export function examFeed(entries,today) {
  const dated=[],unconfirmed=[];
  for(const [courseId,entry]of entries){
    const course=entry.result?.course,url=officialCourseUrl(course);
    if(!url)continue;
    for(const exam of course.exams||[]){
      if(exam.certainty==='cancelled')continue;
      const date=/^\d{4}-\d{2}-\d{2}$/.test(exam.date||'')&&['explicit','scheduled-week'].includes(exam.certainty)?exam.date:null;
      if(date&&date<today)continue;
      const item={courseId,course,exam,url,date,stale:!!entry.error};
      (date?dated:unconfirmed).push(item);
    }
  }
  dated.sort((a,b)=>a.date.localeCompare(b.date)||a.course.title.localeCompare(b.course.title));
  unconfirmed.sort((a,b)=>(a.exam.week??99)-(b.exam.week??99)||a.course.title.localeCompare(b.course.title));
  return {dated,unconfirmed};
}
