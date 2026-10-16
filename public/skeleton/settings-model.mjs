export const THEMES=['light','dark','garden'];
export function lessonStatistics(rows=[]){
 const courses=new Set(),meetings=new Set(),dailyMinutes=Array(7).fill(0);let sessions=0,minutes=0;
 const time=value=>{const match=/^(\d{2}):(\d{2})$/.exec(String(value));if(!match)return NaN;const h=Number(match[1]),m=Number(match[2]);return h<=24&&m<60&&(h<24||m===0)?h*60+m:NaN;};
 for(const row of rows){
  if(!Array.isArray(row)||row[7]||!Number.isInteger(row[0])||row[0]<0||row[0]>6)continue;
  const start=time(row[1]),end=time(row[2]);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
  const course=String(row[8]||row[6]||row[4]||row[3]||'').trim(),key=[course,row[0],start,end].join('|');
  if(meetings.has(key))continue;meetings.add(key);courses.add(course);sessions++;minutes+=end-start;dailyMinutes[row[0]]+=end-start;
 }
 return {courses:courses.size,sessions,minutes,hours:Math.round(minutes/6)/10,dailyMinutes,days:dailyMinutes.filter(Boolean).length,busiestDay:dailyMinutes.some(Boolean)?dailyMinutes.indexOf(Math.max(...dailyMinutes)):null};
}
export function preferenceDefaults(){return {theme:'light',hanziEnabled:false,hanziUsername:''};}
export function normalizePreferences(value={}){return {theme:THEMES.includes(value.theme)?value.theme:'light',hanziEnabled:value.hanziEnabled===true,hanziUsername:typeof value.hanziUsername==='string'&&/^[a-z0-9_]{2,32}$/.test(value.hanziUsername)?value.hanziUsername:''};}
