import { AccountTasks } from './account-tasks.mjs';
// Reuse the account lifecycle, stale-response protection and acknowledged-save
// behavior already used by tasks. Adapt only the event API's record names.
export class AccountEvents extends AccountTasks{
  constructor(account,options){
    const adapt=async operation=>{try{const value=await operation;return{studentNumber:value.studentNumber,...(value.events?{tasks:value.events}:{task:value.event})};}catch(error){if(error.code==='event_changed')error.code='task_changed';if(error.code==='event_not_found')error.code='task_not_found';throw error;}};
    super({get current(){return account.current;},tasks:()=>adapt(account.events()),changeTask:(id,version,values)=>adapt(account.changeEvent(id,version,values)),removeTask:(id,version)=>adapt(account.removeEvent(id,version))},options);
    this.account=account;this.adapt=adapt;
  }
  bind(current){this.pendingEvent=null;super.bind(current);}
  save(values,existing){
    const key=JSON.stringify(values);
    if(!existing&&this.pendingEvent?.key!==key)this.pendingEvent={key,id:crypto.randomUUID()};
    return this.write(()=>this.adapt(existing?this.account.changeEvent(existing.id,existing.version,values):this.account.createEvent(this.pendingEvent.id,values)),saved=>{
      this.state.items=[saved,...this.state.items.filter(e=>e.id!==saved.id)];this.pendingEvent=null;
    });
  }
}
