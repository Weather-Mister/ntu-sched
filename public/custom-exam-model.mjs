// Manual exams and non-destructive personal overrides of imported exams.
const dateValid=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value+'T00:00:00Z');
  return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===value;
};
export function normalizeCustomExam(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid custom exam');
  if(Object.keys(value).some(key=>!['title','className','kind','date','week','notes','sourceKey'].includes(key)))throw Error('Unexpected exam field');
  const title=value.title,className=value.className??'',notes=value.notes??'',kind=value.kind,sourceKey=value.sourceKey??null;
  const date=value.date||null,week=value.week===null||value.week===''||value.week===undefined?null:Number(value.week);
  if(typeof title!=='string'||!title.trim()||title.trim().length>140||/[\x00-\x1f\x7f]/.test(title))throw Error('Invalid exam title');
  if(typeof className!=='string'||className.trim().length>160||/[\x00-\x1f\x7f]/.test(className))throw Error('Invalid exam class');
  if(typeof notes!=='string'||notes.trim().length>500||/[\x00-\x08\x0b-\x1f\x7f]/.test(notes))throw Error('Invalid exam notes');
  if(!['quiz','midterm','final','other'].includes(kind))throw Error('Invalid exam type');
  if(date!==null&&!dateValid(date))throw Error('Invalid exam date');
  if(week!==null&&(!Number.isInteger(week)||week<1||week>30))throw Error('Invalid exam week');
  if(!date&&!week)throw Error('Provide an exact date or a course week');
  if(sourceKey!==null&&(typeof sourceKey!=='string'||sourceKey.length>700||sourceKey.length<4||/[\x00-\x1f\x7f]/.test(sourceKey)))throw Error('Invalid exam source key');
  return {title:title.trim(),className:className.trim(),kind,date,week,notes,sourceKey};
}
