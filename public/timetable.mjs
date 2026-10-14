import {NTU_PERIODS} from './ntu-periods.mjs';
export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const TEMPLATE = 'course,day,start,end,room,code\nIntroduction to Economics,Monday,09:10,12:00,Social Sciences 101,ECON1001\nAcademic Writing,Wednesday,13:20,15:10,General Building 204,LANG1001\n';
export const SAMPLE = 'course,day,start,end,room,code\nIntroduction to Economics,Monday,09:10,12:00,Social Sciences 101,ECON1001\nMandarin Practice,Monday,14:20,16:10,Language Center 302,LANG1002\nDesign & Society,Tuesday,10:20,12:10,Liberal Education 201,GEN1001\nAcademic Writing,Wednesday,13:20,15:10,General Building 204,LANG1001\nMandarin Practice,Thursday,09:10,11:00,Language Center 302,LANG1002\nDesign & Society,Friday,10:20,12:10,Liberal Education 201,GEN1001\n';
const aliases = {course:['course','title','課程','課程名稱','課名'],courseEn:['course_en','english course name','英文課程名稱','課程英文名稱'],courseZh:['course_zh','chinese course name','中文課程名稱','課程中文名稱'],day:['day','weekday','星期','週幾'],start:['start','start time','開始','開始時間'],end:['end','end time','結束','結束時間'],room:['room','location','教室','地點'],code:['code','course code','課號']};
export function minutes(value) { const m=/^(\d{1,2}):(\d{2})$/.exec(String(value)); if(!m || +m[1]>23 || +m[2]>59) throw new Error('Use a valid time in HH:MM format.'); return +m[1]*60 + +m[2]; }
export function formatTime(n) { return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
// Consecutive NTU periods include short breaks; a missing period stays separate.
const periodBoundaries = new Set(NTU_PERIODS.slice(1).map((period,index)=>`${NTU_PERIODS[index][2]}:${period[1]}`));
export function groupLessons(items) {
 const groups=new Map();
 items.forEach((session,index)=>{const key=JSON.stringify([session.day,session.title,session.code,session.room]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({...session,index});});
 const merged=[];
 for(const group of groups.values()){
  group.sort((a,b)=>a.start-b.start||a.end-b.end);let current;
  for(const item of group){
   if(current&&(item.start<=current.end||periodBoundaries.has(`${current.end}:${item.start}`))&&(!current.titleEn||!item.titleEn||current.titleEn===item.titleEn)&&(!current.titleZh||!item.titleZh||current.titleZh===item.titleZh)){current.end=Math.max(current.end,item.end);current.index=Math.min(current.index,item.index);if(item.titleEn)current.titleEn=item.titleEn;if(item.titleZh)current.titleZh=item.titleZh;}
   else{current={...item};merged.push(current);}
  }
 }
 return merged.sort((a,b)=>a.index-b.index).map(({index,...session})=>session);
}
function dayIndex(value) { const s=value.trim().toLowerCase(); const en=DAYS.findIndex(d=>d.toLowerCase()===s||d.slice(0,3).toLowerCase()===s); if(en>=0)return en; if(/^[1-7]$/.test(s))return +s-1; const cn=s.replace(/^(星期|週|周)/,''); const c='一二三四五六日'.indexOf(cn); if(cn.length===1&&c>=0)return c; if(cn==='天')return 6; throw new Error('Day must be Monday–Sunday, Mon–Sun, 1–7, or 星期一–星期日.'); }
function cells(text,sep) { const rows=[]; let row=[],cell='',quoted=false,after=false; for(let i=0;i<text.length;i++){const c=text[i]; if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;after=true;}}else cell+=c;continue;} if(c==='"'){if(cell.length||after)throw new Error('Unexpected quote in a cell.');quoted=true;continue;} if(c===sep){row.push(cell);cell='';after=false;continue;} if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';after=false;continue;} if(after&&!/\s/.test(c))throw new Error('Unexpected text after a quoted cell.');if(!after)cell+=c;} if(quoted)throw new Error('A quoted cell is missing its closing quote.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows; }
export function parseTimetable(raw) {
 if(typeof raw!=='string'||!raw.trim())throw new Error('Add a timetable file or paste some rows first.');
 if(new TextEncoder().encode(raw).length>1024*1024)throw new Error('Please use a file smaller than 1 MB.');
 const text=raw.replace(/^\uFEFF/,''); const sep=text.split(/\r?\n/)[0].includes('\t')?'\t':','; const rows=cells(text,sep);
 if(rows.length<2)throw new Error('Include a header and at least one class row.');if(rows.length>501)throw new Error('Import up to 500 class sessions at a time.');
 const header=rows.shift().map(x=>x.trim().toLowerCase()); const indices={}; for(const [key,names] of Object.entries(aliases)){const hits=header.map((h,i)=>names.includes(h)?i:-1).filter(i=>i>=0);if(hits.length>1)throw new Error(`Use only one ${key} column.`);indices[key]=hits[0]??-1;}
 for(const k of ['course','day','start','end'])if(indices[k]===-1)throw new Error(`Missing “${k}” column. Download the template for the required headers.`);
 const seen=new Set(),sessions=[],warnings=[];
 rows.forEach((row,i)=>{try{if(row.length!==header.length)throw new Error(`Expected ${header.length} columns; found ${row.length}.`);const get=k=>indices[k]<0?'':row[indices[k]].trim();const title=get('course');if(!title)throw new Error('Course name is empty.');if(title.length>160||get('courseEn').length>160||get('courseZh').length>160||get('room').length>160||get('code').length>60)throw new Error('A course, room, or code is too long.');const start=minutes(get('start')),end=minutes(get('end'));if(end<=start)throw new Error('End time must be after start time on the same day.');const session={title,day:dayIndex(get('day')),start,end,room:get('room'),code:get('code'),...(get('courseEn')?{titleEn:get('courseEn')}:{}),...(get('courseZh')?{titleZh:get('courseZh')}: {})};const key=JSON.stringify(session);if(seen.has(key)){warnings.push(`Row ${i+2}: duplicate session skipped.`);return;}seen.add(key);sessions.push(session);}catch(e){throw new Error(`Row ${i+2}: ${e.message}`);}});
 const grouped=groupLessons(sessions);
 if(grouped.length<sessions.length)warnings.push(`Combined ${sessions.length-grouped.length} repeated period row(s) into continuous lessons.`);
 return {sessions:grouped,warnings};
}
export function conflicts(sessions) {const pairs=[];for(let i=0;i<sessions.length;i++)for(let j=i+1;j<sessions.length;j++){const a=sessions[i],b=sessions[j];if(a.day===b.day&&a.start<b.end&&b.start<a.end)pairs.push([i,j]);}return pairs;}
export function toCSV(sessions) {const bilingual=sessions.some(s=>s.titleEn||s.titleZh);const q=v=>{let t=String(v);if(/^[\s]*[=+@-]/.test(t))t="'"+t;return `"${t.replaceAll('"','""')}"`;};return 'course,day,start,end,room,code'+(bilingual?',course_en,course_zh':'')+'\r\n'+sessions.map(s=>[s.title,DAYS[s.day],formatTime(s.start),formatTime(s.end),s.room,s.code,...(bilingual?[s.titleEn||'',s.titleZh||'']:[])].map(q).join(',')).join('\r\n')+'\r\n';}
