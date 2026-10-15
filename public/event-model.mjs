const DAY=86400000;
export function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value&&value>='2000-01-01'&&value<='2199-12-31';
}
export function eventDay(date){return(new Date(date+'T00:00:00Z').getUTCDay()+6)%7;}
export function normalizeEvent(value){
  const allowed=['title','location','notes','frequency','date','until','days','start','end'];
  if(!value||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('Invalid event fields.');
  const text=(key,max,required=false)=>{const raw=value[key]??'';if(typeof raw!=='string'||Array.from(raw.trim()).length>max||/[\x00-\x08\x0b-\x1f\x7f]/.test(raw)||key!=='notes'&&/[\r\n]/.test(raw))throw Error('Invalid event text.');const result=raw.trim();if(required&&!result)throw Error('Enter an event name.');return result;};
  const title=text('title',140,true),location=text('location',200),notes=text('notes',500);
  if(!['once','weekly'].includes(value.frequency)||!validDate(value.date)||!Number.isInteger(value.start)||!Number.isInteger(value.end)||value.start<0||value.end>1439||value.end<=value.start)throw Error('Check the event date and start/end times.');
  if(!Array.isArray(value.days)||value.days.length>7||value.days.some(n=>!Number.isInteger(n)||n<0||n>6)||new Set(value.days).size!==value.days.length)throw Error('Choose valid weekdays.');
  const days=[...value.days].sort((a,b)=>a-b),until=value.until??null;
  if(value.frequency==='once'&&(days.length||until!==null)||value.frequency==='weekly'&&(!days.length||until!==null&&(!validDate(until)||until<value.date)))throw Error('Check the repeat days and end date.');
  return{title,location,notes,frequency:value.frequency,date:value.date,until,days,start:value.start,end:value.end};
}
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
export function eventsOn(events,date){
  return events.filter(e=>!e.deleted&&(e.frequency==='once'?e.date===date:e.date<=date&&(!e.until||date<=e.until)&&e.days.includes(eventDay(date))))
    .map(e=>[eventDay(date),clock(e.start),clock(e.end),e.title,e.title,e.location,'',e]);
}
export function nextEventDates(events,today){
  const result=new Set();
  for(const e of events){
    if(e.deleted)continue;
    if(e.frequency==='once'){if(e.date>=today)result.add(e.date);continue;}
    const first=e.date>today?e.date:today;
    for(const day of e.days){const distance=(day-eventDay(first)+7)%7;const date=new Date(Date.parse(first+'T00:00:00Z')+distance*DAY).toISOString().slice(0,10);if(!e.until||date<=e.until)result.add(date);}
  }
  return[...result];
}
