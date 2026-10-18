import {scopeState,scopeTrace,taipeiClock} from './retro-scope.mjs';
import {decorateRetroDates} from './retro-dates.mjs';
import {startRetroScrollbars} from './retro-scrollbars.mjs';
let cleanup, boundary=null, refresh, readBoundary;
export function setRetroBoundaryReader(reader){readBoundary=reader;}
export function updateRetroBoundary(next) {
  boundary=next?{target:next.live?next.end:next.start,live:next.live}:null;
  refresh?.();
}
// Reparent the existing controls; their listeners, forms and shared models stay intact.
// Comment anchors restore the precise original order when switching away.
export function applyRetroSkin(enabled) {
  if(!enabled){cleanup?.();cleanup=undefined;return;}
  if(cleanup)return;
  const app=document.getElementById('app-screen');if(!app)return;
  const workspace=app.querySelector('.workspace'),rail=app.querySelector('.week-section');
  const schedule=app.querySelector('.schedule-column'),toolbar=rail.querySelector('.week-toolbar');
  const moves=[],decorations=[];
  function move(element,parent,before=null){const anchor=document.createComment('retro restore');element.before(anchor);moves.push([element,anchor]);parent.insertBefore(element,before);}
  move(rail,workspace,workspace.firstChild);
  move(toolbar,schedule,schedule.firstChild);
  const desk=document.createElement('div');desk.className='retro-desk-art';desk.setAttribute('aria-hidden','true');
  desk.innerHTML='<div class="retro-paper paper-a"><small>STATICS / SCRATCH</small><p>ΣF = 0　 ΣM = 0</p><p>Rₐ + Rᵦ − W = 0</p><p>→ check signs again</p><svg viewBox="0 0 150 45"><path d="M8 30h130M30 30l8-13 8 13M105 30l8-13 8 13M72 2v25m-4-5 4 5 4-5"/></svg></div><div class="retro-paper paper-b"><small>MATH / WORKING NOTES</small><p>μ(x) = e∫P(x)dx</p><p>∫ sec x dx = ln|sec x + tan x| + C</p><p>IC → solve constants</p></div><div class="retro-paper paper-c"><small>MECHANISM / IC SKETCH</small><p>v = ωr</p><p>I.C. ?</p></div><i class="retro-coffee-ring"></i>';
  app.before(desk);decorations.push(desk);
  const decor=document.createElement('div');decor.className='retro-hardware';decor.setAttribute('aria-hidden','true');
  decor.innerHTML='<i class="retro-screw s1"></i><i class="retro-screw s2"></i><i class="retro-screw s3"></i><i class="retro-screw s4"></i><i class="retro-wear"></i><span class="retro-serial">CAMPUS WEEK / ACADEMIC CONSOLE</span><span class="retro-vent"></span>';
  app.append(decor);decorations.push(decor);
  const scope=document.createElement('div');scope.className='retro-scope';scope.setAttribute('role','img');
  // No click, keyboard or audio capture behavior: this is a time display only.
  scope.innerHTML='<div class="scope-head"><span>ΔT / SCHED</span><b>—</b></div><svg class="scope-wave" viewBox="0 0 200 42" preserveAspectRatio="none" aria-hidden="true"><path class="scope-gridline" d="M0 7H200 M0 21H200 M0 35H200 M25 0V42 M75 0V42 M125 0V42 M175 0V42"/><path class="scope-trace" d="M0 21H200"/></svg><div class="scope-foot">CLEAR</div>';
  const banner=app.querySelector('.next-class');banner.insertBefore(scope,banner.querySelector('.next-badge'));decorations.push(scope);
  const clock=document.createElement('div');clock.className='retro-clock';clock.setAttribute('role','timer');clock.setAttribute('aria-live','off');clock.setAttribute('aria-label','Taipei local time');
  clock.innerHTML='<span class="retro-clock-label">LOCAL / TPE</span><span class="retro-clock-digits"><span class="retro-clock-time"></span><span class="retro-clock-seconds"></span><span class="retro-clock-ms"></span></span>';
  banner.insertBefore(clock,banner.querySelector('.next-badge'));decorations.push(clock);
  const clockTime=clock.querySelector('.retro-clock-time'),clockSeconds=clock.querySelector('.retro-clock-seconds'),clockMs=clock.querySelector('.retro-clock-ms');
  function tickClock(){const value=taipeiClock();clockTime.textContent=value.time;clockSeconds.textContent=value.seconds;clockMs.textContent=value.milliseconds;}
  const trace=scope.querySelector('.scope-trace'),value=scope.querySelector('b'),mode=scope.querySelector('.scope-foot');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),desktop=matchMedia('(min-width:860px)');
  let frame=0,timer=0,phase=0,last=0,lastDraw=0,state=scopeState(boundary);
  const active=()=>!document.hidden&&!app.hidden,visible=()=>active()&&desktop.matches;
  function metadata(){
    tickClock();
    state=scopeState(readBoundary?readBoundary():boundary);value.textContent=state.value;mode.textContent=state.mode;
    const zh=document.documentElement.lang.startsWith('zh');
    scope.setAttribute('aria-label',state.active?(zh?`課表時間顯示，${state.live?'距離結束':'距離開始'} ${state.value}`:`Schedule interval monitor, ${state.value} until ${state.live?'current event ends':'next event starts'}`):(zh?'課表時間顯示，沒有近期行程':'Schedule interval monitor, no upcoming events'));
    if(reduced.matches)trace.setAttribute('d',scopeTrace(state));
  }
  function draw(timestamp){
    if(!active()||reduced.matches){frame=0;return;}
    if(timestamp-lastDraw>55){
      tickClock();
      const dt=last?Math.min(100,timestamp-last):0;last=timestamp;lastDraw=timestamp;
      const urgency=state.active?1-Math.min(1,state.minutes/180):0;
      if(visible()){phase+=dt*(0.00135+urgency*0.0036);trace.setAttribute('d',scopeTrace(state,phase));}
    }
    frame=window.requestAnimationFrame(draw);
  }
  function reconcile(){
    window.cancelAnimationFrame?.(frame);clearInterval(timer);frame=0;timer=0;last=0;
    metadata();
    if(active()){
      trace.setAttribute('d',scopeTrace(state,phase));timer=setInterval(metadata,1000);
      if(!reduced.matches)frame=window.requestAnimationFrame(draw);
    }
  }
  refresh=metadata;
  const observer=new window.MutationObserver(reconcile);observer.observe(app,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',reconcile);reduced.addEventListener('change',reconcile);desktop.addEventListener('change',reconcile);
  reconcile();
  const stopDates=decorateRetroDates(document.getElementById('cool-list'));
  const stopScrollbars=startRetroScrollbars(app);
  cleanup=()=>{
    stopDates();stopScrollbars();
    refresh=undefined;window.cancelAnimationFrame?.(frame);clearInterval(timer);observer.disconnect();
    document.removeEventListener('visibilitychange',reconcile);reduced.removeEventListener?.('change',reconcile);desktop.removeEventListener?.('change',reconcile);
    for(const [element,anchor] of moves.reverse()){anchor.replaceWith(element);}
    for(const element of decorations)element.remove();
  };
}
