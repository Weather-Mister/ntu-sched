import {AccountEvents} from './account-events.mjs';

// Reuses account ownership checks, stale-read cancellation, optimistic versions,
// create idempotency, and the remove/undo controls already used by personal events.
export class AccountCustomExams extends AccountEvents{
  constructor(account,options={}){
    const wrap=async operation=>{try{return await operation;}catch(error){if(error.code==='custom_exam_changed')error.code='event_changed';if(error.code==='custom_exam_missing')error.code='event_not_found';throw error;}};
    const compatible={
      get current(){return account.current;},
      async events(){const r=await wrap(account.customExams());return{studentNumber:r.studentNumber,events:r.exams};},
      async createEvent(id,values){const r=await wrap(account.createCustomExam(id,values));return{studentNumber:r.studentNumber,event:r.exam};},
      async changeEvent(id,version,values){const r=await wrap(account.changeCustomExam(id,version,values));return{studentNumber:r.studentNumber,event:r.exam};},
      async removeEvent(id,version){const r=await wrap(account.removeCustomExam(id,version));return{studentNumber:r.studentNumber,event:r.exam};}
    };
    super(compatible,options);
  }
}
