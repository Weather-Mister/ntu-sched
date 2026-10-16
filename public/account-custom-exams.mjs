import {AccountEvents} from './account-events.mjs';

// Reuses account ownership checks, stale-read cancellation, optimistic versions,
// create idempotency, and the remove/undo controls already used by personal events.
export class AccountCustomExams extends AccountEvents{
  constructor(account,options={}){
    const compatible={
      get current(){return account.current;},
      async events(){const r=await account.customExams();return{studentNumber:r.studentNumber,events:r.exams};},
      async createEvent(id,values){const r=await account.createCustomExam(id,values);return{studentNumber:r.studentNumber,event:r.exam};},
      async changeEvent(id,version,values){const r=await account.changeCustomExam(id,version,values);return{studentNumber:r.studentNumber,event:r.exam};},
      async removeEvent(id,version){const r=await account.removeCustomExam(id,version);return{studentNumber:r.studentNumber,event:r.exam};}
    };
    super(compatible,options);
    // AccountEvents error adapter already handles its own legacy error keys.
    this.client.current=undefined;
    Object.defineProperty(this.client,'current',{get:()=>account.current});
  }
}
