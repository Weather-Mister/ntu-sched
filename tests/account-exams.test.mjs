import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountExams,examFeed,officialCourseUrl} from '../public/account-exams.mjs';
const owner={studentNumber:'b12345678'},table={term:'115-1',changedAt:1,sessions:[{courseId:'a',title:'Statics'},{courseId:'a',title:'Statics'},{courseId:'b',title:'Math'}]};
const result=(serial='52528')=>({studentNumber:owner.studentNumber,course:{term:'115-1',serial,title:'Statics',source:'ntu-cool',exams:[]}});
test('exams load only on opening their tab, once per class; cache and refresh are bounded',async()=>{
 let now=100000,calls=[];
 const store=new AccountExams({async courseExamPlan(id){calls.push(id);return result();}},()=>{},()=>assert.fail('owner changed'),{now:()=>now});
 store.bind(owner);store.configure(table);await store.refresh();assert.deepEqual(calls,[]);
 store.active=true;await store.refresh();assert.deepEqual(calls,['a','b']);
 await store.refresh();store.configure(table);assert.equal(calls.length,2);
 await store.refresh(true);assert.equal(calls.length,4);await store.refresh(true);assert.equal(calls.length,4);
 now+=900001;await store.refresh();assert.equal(calls.length,6);
});
test('a new section discards its previous results immediately; late reads and logout cannot restore them',async()=>{
 const waits=[];const store=new AccountExams({courseExamPlan(){return new Promise(resolve=>waits.push(resolve));}},()=>{},()=>{});
 store.bind(owner);store.configure({...table,sessions:[table.sessions[0]]});store.active=true;
 const first=store.refresh();waits.shift()(result());await first;assert.equal(store.entries.size,1);
 store.configure({...table,sessions:[table.sessions[0]]},{a:{examOffering:{serial:'21570'}}});assert.equal(store.entries.size,0);
 const release=waits.shift();store.bind(null);release(result('21570'));await new Promise(r=>setImmediate(r));assert.equal(store.entries.size,0);
});
test('old owner and mismatched response data never enter the exam feed',async()=>{
 let release,expired=0;const store=new AccountExams({courseExamPlan(){return new Promise(r=>release=r);}},()=>{},()=>expired++);
 store.bind(owner);store.configure(table);store.active=true;const pending=store.refresh();
 store.bind({studentNumber:'r23456789'});release(result());await pending;assert.equal(store.entries.size,0);
 store.configure({...table,sessions:[table.sessions[0]]});store.active=true;const mismatch=store.refresh();release(result());await mismatch;assert.equal(expired,1);assert.equal(store.entries.size,0);
});
test('refresh failure preserves only the same section preview and marks it stale; rate limits stop the batch',async()=>{
 let fail=false,calls=0;const store=new AccountExams({async courseExamPlan(){calls++;if(fail)throw Object.assign(Error('Try later'),{status:429});return result();}},()=>{},()=>{});
 store.bind(owner);store.configure(table);store.active=true;await store.refresh();fail=true;await store.refresh(true);
 assert.equal(calls,3);assert.equal(store.entries.get('a').error.status,429);assert.equal(store.entries.get('a').result.course.serial,'52528');
});
test('feed orders future exact dates, separates week-only and ambiguous timing, skips past/cancelled, links public course pages',()=>{
 const entry=result();entry.course.sourceUrl='https://cool.ntu.edu.tw/courses/66746';entry.course.exams=[
  {kind:'midterm',date:'2026-11-02',certainty:'explicit'},
  {kind:'quiz',date:'2026-10-20',certainty:'explicit'},
  {kind:'quiz',date:'2026-10-01',certainty:'explicit'},
  {kind:'midterm',date:null,week:9,certainty:'week-only'},
  {kind:'final',date:'2026-12-01',certainty:'cancelled'},
  {kind:'quiz',date:'2026-10-18',week:8,certainty:'ambiguous'}];
 const feed=examFeed(new Map([['a',{result:entry,error:Error('offline')}]]),'2026-10-16');
 assert.deepEqual(feed.dated.map(x=>x.date),['2026-10-20','2026-11-02']);
 assert.deepEqual(feed.unconfirmed.map(x=>[x.date,x.exam.week]),[[null,8],[null,9]]);
 assert(feed.dated.every(x=>x.url==='https://course.ntu.edu.tw/en/courses/115-1/52528'&&x.stale));
 assert.equal(officialCourseUrl({term:'115-1',serial:'https://evil.example'}),null);
});
