// Cosmetic port of the personal console's schedule interval monitor.
// The shared dashboard supplies its next boundary, including personal events.
export function taipeiClock(now=Date.now()){
 const date=new Date(now+8*3600000),pad=(value,n=2)=>String(value).padStart(n,'0');
 return {time:pad(date.getUTCHours())+':'+pad(date.getUTCMinutes()),seconds:'.'+pad(date.getUTCSeconds()),milliseconds:'.'+pad(date.getUTCMilliseconds(),3)};
}
export function scopeState(boundary, now=Date.now()) {
  if (!boundary || !Number.isFinite(boundary.target) || boundary.target <= now)
    return {active:false, live:false, minutes:0, value:'—', mode:'CLEAR'};
  const seconds=Math.ceil((boundary.target-now)/1000), minutes=Math.ceil(seconds/60);
  const hours=Math.floor(minutes/60), remainder=minutes%60;
  const value=seconds<60?`${seconds}s`:minutes<60?`${minutes}m`:remainder?`${hours}h${String(remainder).padStart(2,'0')}`:`${hours}h`;
  return {active:true,live:boundary.live===true,minutes:(boundary.target-now)/60000,value,mode:boundary.live?'LIVE END':'NEXT START'};
}
export function scopeTrace(state, phase=0) {
  const minutes=Math.max(0,state.minutes||0), wavelength=state.active?12+Math.sqrt(Math.min(360,minutes)/360)*42:80;
  const amplitude=state.active?(state.live?10.2:8.4):1.3, tau=Math.PI*2;
  const segments=Math.ceil(200/Math.min(2,wavelength/20));let path='';
  for(let i=0;i<=segments;i++){
    const x=i*200/segments,position=x/wavelength+phase/tau,cycle=Math.floor(position);
    const hash=Math.sin(cycle*12.9898+78.233)*43758.5453;
    const gain=state.active?0.42+(hash-Math.floor(hash))*1.12:1;
    path+=`${i?'L':'M'}${x.toFixed(1)} ${(21+Math.sin(position*tau)*amplitude*gain).toFixed(2)} `;
  }
  return path.trim();
}
