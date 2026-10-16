// Student-created exams are separate from imported NTU/COOL exam plans.
const dateValid=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value+'T00:00:00Z');
  return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===value;
};
export function normalizeCustomExam(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid custom exam');
  if(Object.keys(value).some(key=>!['title','className','kind','date','week','notes'].includes(key)))throw Error('Unexpected exam field');
  const title=value.title, className=value.className??'',notes=value.notes??'',kind=value.kind;
  const week=value.week===null||value.week===''||value.week===undefined?null:Number(value.week);
  if(typeof title!=='string'||!title.trim()||title.trim().length>140||/[^\P{Cc}\t]/u.test(title))throw Error('Invalid exam title');
  if(typeof className!=='string'||className.trim().length>160||/[\x00-\x1f\x7f]/.test(className))throw Error('Invalid exam class');
  if(typeof notes!=='string'||notes.trim().length>500||/[\x00-\x08\x0b-\x1f\x7f]/.test(notes))throw Error('Invalid exam notes');
  if(!['quiz','midterm','final','other'].includes(kind)||!dateValid(value.date))throw Error('Invalid exam date or type');
  if(week!==null&&(!Number.isInteger(week)||week<1||week>30))throw Error('Invalid exam week');
  return {title:title.trim(),className:className.trim(),kind,date:value.date,week,notes:notes.trim()};
}
