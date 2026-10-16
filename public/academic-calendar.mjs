// NTU 115 academic calendar, revised 2026-09-08:
// https://www.aca.ntu.edu.tw/w/aca/calendar
// Fall classes begin Sep 7, 2026; spring classes begin Feb 22, 2027.
// Sixteen teaching/exam weeks are followed by a flexible teaching/exam week.
// The app displays Monday–Sunday teaching weeks, matching its timetable.
export const NTU_TERM_STARTS=Object.freeze({'115-1':'2026-09-07','115-2':'2027-02-22'});
const DAY=86400000;
export function academicWeek(date,term){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const time=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==date)return null;
  for(const [key,start]of Object.entries(NTU_TERM_STARTS)){
    if(term&&key!==term)continue;
    const week=Math.floor((time-Date.parse(start+'T00:00:00Z'))/(7*DAY))+1;
    if(week>=1&&week<=17)return{term:key,week,flexible:week===17};
  }
  // Unknown terms and vacations retain their date range, without invented weeks.
  return null;
}
