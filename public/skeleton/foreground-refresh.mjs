// Reuse saved provider snapshots; only active pages request an overdue refresh.
// Retry transient failures slowly and pause rejected credentials until reconnect.
export class ForegroundRefresh {
  constructor(now=Date.now){this.now=now;this.sources=new Map();}
  reset(){this.sources.clear();}
  record(kind,result){
    const snapshot=kind==='timetable'?result.timetable:result.calendar;
    const previous=this.sources.get(kind)||{};
    this.sources.set(kind,{...previous,authorized:result.connectionStatus==='authorized',
      syncedAt:Number(snapshot?.syncedAt)||0,interval:Math.max(60000,result.checkIntervalMs||(kind==='timetable'?5*86400000:300000))});
  }
  attempt(kind){const source=this.sources.get(kind);if(source)source.retryAt=this.now()+300000;}
  fail(kind,error){
    const source=this.sources.get(kind);if(!source)return;
    source.retryAt=this.now()+Math.max(300000,(error.retryAfterSeconds||0)*1000);
    if(['cool_credentials_required','cool_verification_required','cool_calendar_reconnect','timetable_credentials_required','timetable_verification_required','timetable_reconnect_required'].includes(error.code))source.authorized=false;
  }
  next(){
    const now=this.now();
    for(const [kind,source]of this.sources){
      if(source.authorized&&now-source.syncedAt>=source.interval&&now>=(source.retryAt||0)){this.attempt(kind);return kind;}
    }
    return null;
  }
}
