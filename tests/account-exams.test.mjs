import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountExams,examFeed,officialCourseUrl,examUnavailableCourses} from '../public/account-exams.mjs';
const owner={studentNumber:'b12345678'},table={term:'115-1',changedAt:1,sessions:[{courseId:'a',title:'Statics'},{courseId:'a',title:'Statics'},{courseId:'b',title:'Math'}]};
const result=(serial='52528')=>({studentNumber:owner.studentNumber,course:{term:'115-1',serial,title:'Statics',source:'ntu-cool',exams:[]}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('initial account login loads only missing plans, then reuses results indefinitely',async()=>{
 let calls=[];
 const store=new AccountExams({async courseExamPlan(id,force){calls.push([id,force]);return result();}},()=>{},()=>assert.fail('owner changed'));
 store.bind(owner);store.configure(table);
 await settle();
 assert.deepEqual(calls,[['a',false],['b',false]]);
 store.active=true;await store.refresh();
 await store.refresh();store.configure(table);
 assert.equal(calls.length,2);
 await store.refresh(true);
 assert.deepEqual(calls.slice(2),[['a',true],['b',true]]);
});
test('saved account snapshots hydrate before any provider fetch on sign-in',async()=>{
 const calls=[];
 const store=new AccountExams({async courseExamPlan(id){calls.push(id);return result();}},()=>{},()=>{});
 store.bind(owner);
 const cached={a:{term:'115-1',selection:'',result:{course:result().course,selected:{serial:'52528'}},savedAt:123}};
 store.configure(table,{},cached);
 assert.equal(store.entries.get('a').result.course.serial,'52528');
 await settle();assert.deepEqual(calls,['b']);
 store.configure(table,{},cached);await settle();assert.deepEqual(calls,['b']);
});
test('section changes invalidate only that class and never accept late results from an old section or owner',async()=>{
 const calls=[],waits=[];
 const store=new AccountExams({courseExamPlan(id){calls.push(id);return new Promise(resolve=>waits.push({id,resolve}));}},()=>{},()=>{});
 store.bind(owner);store.configure({...table,sessions:[table.sessions[0]]});
 assert.deepEqual(calls,['a']);
 store.configure({...table,sessions:[table.sessions[0]]},{a:{examOffering:{serial:'21570'}}});
 assert.deepEqual(calls,['a','a']);
 waits[0].resolve(result('52528'));await settle();assert.equal(store.entries.size,0);
 waits[1].resolve(result('21570'));await settle();assert.equal(store.entries.get('a').result.course.serial,'21570');
 store.bind(null);assert.equal(store.entries.size,0);
});
test('another student, invalid response owner or forced provider failure cannot replace saved exams',async()=>{
 let calls=0,fail=false,expired=0;
 const store=new AccountExams({async courseExamPlan(id){calls++;if(fail)throw Object.assign(Error('offline'),{status:502});return result();}},()=>{},()=>expired++);
 store.bind(owner);store.configure({...table,sessions:[table.sessions[0]]});await settle();
 fail=true;await store.refresh(true);
 assert.equal(store.entries.get('a').result.course.serial,'52528');
 assert.equal(store.entries.get('a').error.status,502);
 store.bind({studentNumber:'r23456789'});assert.equal(store.entries.size,0);
 store.configure({...table,sessions:[table.sessions[0]]});await settle();
 assert.equal(store.entries.get('a').result,null);
 assert.equal(expired,0);
 const mismatch=new AccountExams({async courseExamPlan(){return result();}},()=>{},()=>expired++);
 mismatch.bind({studentNumber:'r23456789'});mismatch.configure({...table,sessions:[table.sessions[0]]});
 await settle();assert.equal(expired,1);assert.equal(mismatch.entries.size,0);
});
test('chronological feed interleaves dated and week-only exams using academic weeks, and retains past exams',()=>{
 const entry=result();entry.course.sourceUrl='https://cool.ntu.edu.tw/courses/66746';entry.course.exams=[
  {kind:'midterm',date:'2026-11-02',week:9,certainty:'explicit'},
  {kind:'quiz',date:'2026-10-20',week:7,certainty:'explicit'},
  {kind:'quiz',date:'2026-10-01',week:4,certainty:'explicit'},
  {kind:'quiz',date:null,week:6,certainty:'week-only'},
  {kind:'quiz',date:null,week:8,certainty:'week-only'},
  {kind:'midterm',date:null,week:9,certainty:'week-only'},
  {kind:'quiz',date:null,week:1,certainty:'week-only'},
  {kind:'final',date:'2026-12-01',week:13,certainty:'cancelled'},
  {kind:'quiz',date:'2026-10-18',week:8,certainty:'ambiguous'}];
 const feed=examFeed(new Map([['a',{result:entry,error:Error('offline')}]]),'2026-10-16');
 // Week 6 was October 12-18. It has not ended on October 16.
 assert.deepEqual(feed.upcoming.map(x=>[x.date,x.week]),[
  [null,6],['2026-10-20',7],[null,8],[null,8],['2026-11-02',9],[null,9]]);
 assert.deepEqual(feed.past.map(x=>[x.date,x.week]),[
  ['2026-10-01',4],[null,1]]);
 assert(feed.upcoming.every(x=>x.url==='https://course.ntu.edu.tw/en/courses/115-1/52528'&&x.stale));
 assert.equal(officialCourseUrl({term:'115-1',serial:'https://evil.example'}),null);
});
test('unknown term and ambiguous timing never gain invented calendar dates',()=>{
 const r=result();r.course.term='116-1';r.course.exams=[
  {kind:'quiz',week:2,date:'2027-09-14',certainty:'ambiguous'},
  {kind:'midterm',week:7,date:null,certainty:'week-only'}];
 const feed=examFeed(new Map([['a',{result:r}]]),'2027-10-20');
 assert.equal(feed.past.length,0);
 assert.deepEqual(feed.upcoming.map(x=>x.date),[null,null]);
});
test('dated items with invalid calendar dates stay undated',()=>{
 const r=result();r.course.exams=[{kind:'quiz',week:7,date:'2026-02-31',certainty:'explicit'}];
 const feed=examFeed(new Map([['a',{result:r}]]),'2026-10-16');
 assert.equal(feed.upcoming[0].date,null);
});

test('exam footer names only unavailable classes, distinguishing failures, empty plans, and pending reads',()=>{
 const courses=['a','b','c','d','e','f','g'].map(id=>({courseId:id,title:'Class '+id}));
 const entries=new Map([
  ['a',{result:{course:{exams:[{kind:'quiz'}]}}}],
  ['b',{result:{course:null,matching:{status:'choose-section'}}}],
  ['c',{result:{course:{exams:[]}}}],
  ['d',{result:null,error:Error('upstream')}],
  ['e',{result:{course:{exams:[{kind:'midterm'}]}},error:Error('offline')}],
  ['f',{result:{course:null,matching:{status:'not-found'}}}]
 ]);
 const fail=examUnavailableCourses(courses,entries);
 assert.deepEqual(fail.map(x=>[x.title,x.type]),[
  ['Class b','choose-class'],['Class c','no-exams'],['Class d','load-failed'],
  ['Class e','refresh-failed'],['Class f','unmatched-class'],['Class g','not-loaded']
 ]);
 assert.deepEqual(examUnavailableCourses(courses,entries,{busy:true}).map(x=>x.courseId),['b','c','d','e','f']);
 assert.deepEqual(examUnavailableCourses([courses[0]],entries),[]);
});
