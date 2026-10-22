import {NTU_PERIODS} from './ntu-periods.mjs';

export const COURSE_LOCATION_VERSION=1;
const text=(value,max=200)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';

// The public catalog supplies text, never an executable or provider-supplied URL.
export function catalogClassroom(classroom){
  return {room:text(classroom?.name,160),building:text(classroom?.buildingName),
    location:text(classroom?.location),detail:text(classroom?.detail,400)};
}
export function classroomLabel(place){
  return [...new Set([place.building,place.room].filter(Boolean))]
    .filter((part,i,parts)=>!parts.some((other,j)=>i!==j&&other.includes(part)&&other!==part)).join(' · ');
}
export function classroomMapUrl(place){
  const target=text(place.building)||text(place.room);
  // A bare room number cannot identify a building on a map.
  if(!target||/^(?:room\s*)?[A-Z]?\d+[A-Z]?$/i.test(target))return null;
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('國立臺灣大學 '+target);
}
export function sessionClassrooms(session,options,offeringSerial=''){
  const offering=offeringSerial?(options?.candidates||[]).find(c=>c.serial===offeringSerial)
    :options?.matching?.status==='student-selected'?null:options?.selected;
  if(!offering)return [];
  const periods=NTU_PERIODS.filter(p=>p[1]>=session.start&&p[2]<=session.end).map(p=>p[0]);
  const sourceUrl=/^\d{3}-[12]$/.test(offering.term||'')&&/^\d{4,6}$/.test(offering.serial||'')
    ?`https://course.ntu.edu.tw/en/courses/${offering.term}/${offering.serial}`:null;
  const places=(offering.schedules||[]).filter(s=>s.day===session.day&&s.periods?.some(p=>periods.includes(String(p))))
    .map(s=>({room:text(s.room,160),building:text(s.building),location:text(s.location),detail:text(s.detail,400)}))
    .filter(p=>p.room||p.building||p.location);
  return [...new Map(places.map(p=>[JSON.stringify(p),{...p,mapUrl:classroomMapUrl(p),sourceUrl}])).values()];
}
