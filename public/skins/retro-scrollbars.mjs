// The personal console's physical faders, adapted to the shared scroll containers.
// Native wheel/touch/keyboard scrolling stays intact. No application data is read.
export function startRetroScrollbars(app){
 if(!window.ResizeObserver)return()=>{};
 const layer=document.createElement('div');layer.className='retro-slider-layer';document.body.append(layer);
 const entries=[],hosts=[...app.querySelectorAll('#cool-list,#todo-list,#schedule-list')];
 let frame=0,stopped=false;
 function schedule(){if(!frame&&!stopped)frame=window.requestAnimationFrame(()=>{frame=0;entries.forEach(draw);});}
 function draw(s){
  const el=s.el,r=el.getBoundingClientRect(),max=el.scrollHeight-el.clientHeight,overflow=getComputedStyle(el).overflowY;
  const top=Math.max(0,r.top+5),bottom=Math.min(innerHeight,r.bottom-5);
  const active=!app.hidden&&(overflow==='auto'||overflow==='scroll')&&max>2&&r.width>35&&bottom-top>46&&r.right>0&&r.left<innerWidth;
  if(el.classList.contains('retro-can-scroll')!==active)el.classList.toggle('retro-can-scroll',active);
  s.track.hidden=!active;if(!active)return;
  const height=bottom-top,knob=Math.min(height,s.thumb.offsetHeight||45),width=s.track.offsetWidth||30;
  const travel=Math.max(0,height-knob),pos=travel*Math.max(0,Math.min(max,el.scrollTop))/max;
  Object.assign(s,{top,max,travel,pos,knob});
  s.track.style.top=top+'px';s.track.style.left=Math.max(0,Math.min(innerWidth-width,r.right-3-width))+'px';s.track.style.height=height+'px';
  s.thumb.style.top=pos+'px';s.track.setAttribute('aria-valuemax',String(Math.ceil(max)));s.track.setAttribute('aria-valuenow',String(Math.round(el.scrollTop)));
 }
 const resize=new window.ResizeObserver(schedule);
 for(const el of hosts){
  const track=document.createElement('div'),thumb=document.createElement('div');track.className='retro-slider';thumb.className='retro-slider-knob';
  track.hidden=true;track.tabIndex=0;track.setAttribute('role','scrollbar');track.setAttribute('aria-orientation','vertical');track.setAttribute('aria-valuemin','0');
  track.setAttribute('aria-controls',el.id||'retro-week-rail');
  track.setAttribute('aria-label','Scroll '+({'cool-list':'Upcoming dates','todo-list':'Manual tasks','schedule-list':'Schedule'}[el.id]||'Week and services'));
  if(!el.id)el.id='retro-week-rail';
  track.append(thumb);layer.append(track);el.classList.add('retro-scroll-host');
  const s={el,track,thumb,dragging:false};entries.push(s);
  function move(y){if(!s.travel)return;el.scrollTop=s.max*Math.max(0,Math.min(s.travel,y-s.top-s.grab))/s.travel;schedule();}
  track.addEventListener('pointerdown',e=>{
   if(e.button!==0||track.hidden)return;s.grab=thumb.contains(e.target)?e.clientY-s.top-s.pos:s.knob/2;
   s.dragging=true;track.classList.add('is-dragging');track.setPointerCapture(e.pointerId);track.focus({preventScroll:true});
   if(!thumb.contains(e.target))move(e.clientY);e.preventDefault();
  });
  track.addEventListener('pointermove',e=>{if(s.dragging)move(e.clientY);});
  const stop=()=>{s.dragging=false;track.classList.remove('is-dragging');};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])track.addEventListener(type,stop);
  track.addEventListener('wheel',e=>{el.scrollTop+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?el.clientHeight:1);schedule();e.preventDefault();},{passive:false});
  track.addEventListener('keydown',e=>{
   const deltas={ArrowUp:-40,ArrowDown:40,PageUp:-el.clientHeight*.85,PageDown:el.clientHeight*.85,Home:-el.scrollHeight,End:el.scrollHeight};
   if(!(e.key in deltas))return;e.preventDefault();el.scrollTop+=deltas[e.key];schedule();
  });
  resize.observe(el);
 }
 const mutation=new window.MutationObserver(schedule);mutation.observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class'],characterData:true});
 resize.observe(app);document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);schedule();
 return()=>{
  stopped=true;window.cancelAnimationFrame?.(frame);resize.disconnect();mutation.disconnect();document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);
  for(const {el} of entries){el.classList.remove('retro-scroll-host','retro-can-scroll');if(el.id==='retro-week-rail')el.removeAttribute('id');}layer.remove();
 };
}
