// Port of the original ePortfolio table reader; parses HTML as inert data.
// Read supported table layouts as inert HTML, never scripts or application state.
export function extractTimetableDOM(document){
 const visible=n=>{for(let e=n;e&&e.nodeType===1;e=e.parentElement){if(e.hasAttribute('hidden')||e.getAttribute('aria-hidden')==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(e.getAttribute('style')||'')||e.classList.contains('d-none')||(e.classList.contains('tab-pane')&&!e.classList.contains('active')))return false;}return !!n;};
 const text=n=>n?.innerText?.trim()||'';
 const norm=s=>s.replace(/[\s　/／()（）]/g,'').toLowerCase();
 const periods={'0':[430,480],'1':[490,540],'2':[550,600],'3':[620,670],'4':[680,730],'5':[740,790],'6':[800,850],'7':[860,910],'8':[930,980],'9':[990,1040],'10':[1050,1100],A:[1105,1155],B:[1160,1210],C:[1215,1265],D:[1270,1320]};
 const order=Object.keys(periods),days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
 function day(s){s=s.trim().replace(/[\s()（）]/g,'').replace(/^(星期|週|周)/,'');const i='一二三四五六日'.indexOf(s);if(s.length===1&&i>=0)return i;if(s==='天')return 6;return days.findIndex(d=>d.toLowerCase()===s.toLowerCase()||d.slice(0,3).toLowerCase()===s.toLowerCase());}
 function time(s){const m=/^(\d{1,2})[:：](\d{2})$/.exec(s.trim());return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:-1;}
 const aliases={titleEn:['英文課程名稱','課程英文名稱','課程名稱英文','英文科目名稱','科目英文名稱','英文名稱','englishcoursename','coursenameenglish','coursenameen','coursetitleenglish'],titleZh:['中文課程名稱','課程中文名稱','課程名稱中文','中文科目名稱','中文名稱','chinesecoursename','coursenamechinese','coursenamezh'],title:['課程名稱','科目名稱','課名','course','coursename','title'],code:['課號','課程代碼','coursecode','code'],timing:['上課時間','時間','節次','星期節次','上課時間教室','上課時間與教室','time','schedule','classtime'],room:['教室','上課教室','地點','room','location'],day:['星期','day','weekday'],start:['開始時間','start','starttime'],end:['結束時間','end','endtime']};
 const sessions=[],listed=[],unscheduled=[];let recognized=0,skipped=0,rowNames={};
 function names(node){const lines=text(node).split('\n').map(s=>s.trim()).filter(Boolean);const zh=lines.find(s=>/[\p{Script=Han}]/u.test(s));const en=lines.find(s=>!/[\p{Script=Han}]/u.test(s)&&/[A-Za-z]{2}/.test(s)&&!/^[-A-Za-z]*\d+[A-Za-z0-9-]*$/.test(s));return {...(zh?{titleZh:zh}:{}),...(en?{titleEn:en}:{})};}
 function push(title,d,start,end,room='',code=''){if(!title||title.length>160||room.length>160||code.length>60||d<0||d>6||start<0||end>1439||end<=start){skipped++;return;}if(sessions.length>=500)throw new Error('Too many timetable meetings.');sessions.push({title,day:d,start,end,room,code,...rowNames});}
 function meetings(title,value,room,code){
  if(!value.trim()||/^(?:未定|另訂|時間未定|不定|TBA|TBD|to be announced)$/i.test(value.trim())){unscheduled.push(title);return;}
  const matches=[...value.matchAll(/(?:星期|週|周)?[（(]?([一二三四五六日天])[）)]?\s*(?=\d|[ABCD])/gi)];
  if(!matches.length||value.slice(0,matches[0].index).trim()){skipped++;return;}
  for(let i=0;i<matches.length;i++){
   const match=matches[i],part=value.slice(match.index+match[0].length,matches[i+1]?.index??value.length).trim().replace(/[;；,，、]+$/,'').trim();
   const explicit=/^(\d{1,2}[:：]\d{2})\s*[-–—~～至]\s*(\d{1,2}[:：]\d{2})/.exec(part);
   const periodMatch=explicit?null:/^([0-9ABCD\s,，、\-–—~～至]+)/i.exec(part);
   if(!explicit&&!periodMatch){skipped++;continue;}
   const suffix=part.slice((explicit||periodMatch)[0].length).trim();
   const location=/^(?:[/／]\s*([^;；]+)|[（(]([^()（）]+)[)）])?$/.exec(suffix);
   if(!location){skipped++;continue;}
   const actualRoom=room||location[1]?.trim()||location[2]?.trim()||'';
   if(explicit){push(title,day(match[1]),time(explicit[1]),time(explicit[2]),actualRoom,code);continue;}
   let tokens=[],invalid=false;
   for(const segment of periodMatch[1].toUpperCase().split(/[,，、]/)){
    const raw=segment.replace(/\s/g,'');if(!raw){invalid=true;break;}
    const range=/^(10|[0-9ABCD])[-–—~～至](10|[0-9ABCD])$/.exec(raw);
    if(range){const first=order.indexOf(range[1]),last=order.indexOf(range[2]);if(first<0||last<first){invalid=true;break;}tokens.push(...order.slice(first,last+1));}
    else{const list=raw.match(/10|[0-9ABCD]/g)||[];if(list.join('')!==raw){invalid=true;break;}tokens.push(...list);}
   }
   if(invalid||!tokens.length||tokens.some(p=>!periods[p])){skipped++;continue;}
   tokens=[...new Set(tokens)].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
   let first=tokens[0],last=first;
   for(let n=1;n<=tokens.length;n++){const p=tokens[n];if(p&&order.indexOf(p)===order.indexOf(last)+1){last=p;continue;}push(title,day(match[1]),periods[first][0],periods[last][1],actualRoom,code);first=p;last=p;}
  }
 }
 const tables=[...document.querySelectorAll('table,[role="table"],[role="grid"]')].filter(visible);
 for(const table of tables){const rows=[...table.querySelectorAll('tr,[role="row"]')].filter(n=>n.closest('table,[role="table"],[role="grid"]')===table&&visible(n));const cells=row=>[...row.querySelectorAll(':scope > th,:scope > td,:scope > [role="columnheader"],:scope > [role="cell"]')];let cols=null,header=-1;
 for(let r=0;r<Math.min(rows.length,6);r++){const values=cells(rows[r]).map(n=>norm(text(n))),map={};for(const [key,names]of Object.entries(aliases))map[key]=values.findIndex(v=>names.includes(v));if((map.title>=0||map.titleZh>=0||map.titleEn>=0)&&(map.timing>=0||(map.day>=0&&map.start>=0&&map.end>=0))){cols=map;header=r;break;}}
 if(cols){recognized++;const before=sessions.length;for(const row of rows.slice(header+1)){const values=cells(row);const get=k=>cols[k]>=0?text(values[cols[k]]):'';const title=get('title')||get('titleZh')||get('titleEn');if(!title)continue;rowNames=cols.title>=0?names(values[cols.title]):{};if(get('titleEn'))rowNames.titleEn=get('titleEn');if(get('titleZh'))rowNames.titleZh=get('titleZh');if(Object.values(rowNames).some(s=>s.length>160)){skipped++;continue;}if(cols.timing>=0)meetings(rowNames.titleZh||rowNames.titleEn||title,get('timing'),get('room'),get('code'));else push(rowNames.titleZh||rowNames.titleEn||title,day(get('day')),time(get('start')),time(get('end')),get('room'),get('code'));}listed.push(...sessions.splice(before));continue;}
 let gridDays=null;for(let r=0;r<Math.min(rows.length,6);r++){const values=cells(rows[r]).map(n=>day(text(n)));if(values.filter(d=>d>=0).length>=5){gridDays=values;header=r;break;}}if(!gridDays)continue;recognized++;const occupied=[];
 function rowPeriod(row){const label=text(cells(row)[0]);const p=/^(?:第\s*)?(10|[0-9ABCD])(?:\s*節)?(?:\s|$)/i.exec(label)?.[1]?.toUpperCase();if(p&&periods[p])return p;const start=/(\d{1,2}[:：]\d{2})/.exec(label)?.[1];return start?order.find(p=>periods[p][0]===time(start)):undefined;}
 for(let r=header+1;r<rows.length;r++){const p=rowPeriod(rows[r]);if(!p)continue;let col=0;for(const cell of cells(rows[r])){while((occupied[col]||0)>r)col++;const width=Math.max(1,+cell.getAttribute('colspan')||1),span=Math.max(1,+cell.getAttribute('rowspan')||1),d=gridDays[col];for(let c=col;c<col+width;c++)occupied[c]=r+span;col+=width;if(d===undefined||d<0||!text(cell))continue;const lines=text(cell).split('\n').map(s=>s.trim()).filter(Boolean);const anchor=[...cell.querySelectorAll('a')].find(a=>visible(a)&&text(a));rowNames=anchor?names(anchor):names({innerText:lines[0]});const title=rowNames.titleZh||rowNames.titleEn||(anchor?text(anchor):lines[0]);if(!title||/^[-—]+$/.test(title))continue;const room=lines.filter(s=>s!==title).find(s=>/^(?:教室[:：]?\s*)?[\u3400-\u9fffA-Za-z ]+[- ]?\d+[A-Za-z]?$/.test(s))||'';const last=rows.slice(r,r+span).map(rowPeriod).filter(Boolean).at(-1)||p;push(title,d,periods[p][0],periods[last][1],room,'');}}
 }
 const unique=[...new Map((listed.length?listed:sessions).map(s=>[JSON.stringify(s),s])).values()];return {sessions:unique,diagnostics:{visibleTables:tables.length,recognizedTables:recognized,skippedMeetings:skipped},warnings:[...(skipped?[`${skipped} meeting(s) were not understood. Check for missing classes.`]:[]),...(unscheduled.length?[`${unscheduled.length} course(s) have no fixed weekly meeting time and are not placed on the timetable.`]:[])]};
}
