import test from 'node:test';
import assert from 'node:assert/strict';
import {preferredExamPlan} from '../src/exam-plan.mjs';
const candidate={courseCode:'ME1005',serial:'52528',section:'01',term:'115-1',title:'Statics',coolId:'66746',sourceUrl:'https://course.ntu.edu.tw/en/courses/115-1/52528'};
const publicCourse={...candidate,exams:[{kind:'midterm',date:'2026-11-03',certainty:'scheduled-week'}],schedule:[]};
const coolPlan={sourceUrl:'https://cool.ntu.edu.tw/courses/66746',exams:[{kind:'midterm',week:8,date:null,certainty:'week-only'}],schedule:[]};
test('COOL is preferred even when the public source could offer an exact date; public content is not fetched',async()=>{
 const calls=[];const result=await preferredExamPlan({}, {},{term:'115-1'},candidate,{coolRead:async()=>{calls.push('cool');return coolPlan;},publicRead:async()=>{throw Error('must not fetch public syllabus');}});
 assert.deepEqual(calls,['cool']);assert.equal(result.source,'ntu-cool');assert.equal(result.exams[0].date,null);assert.equal(result.exams[0].week,8);assert.equal(result.sourceUrl,coolPlan.sourceUrl);assert.equal(result.coolId,undefined);
});
test('an empty COOL plan falls back to public content in that order with clear source labels',async()=>{
 const calls=[];const result=await preferredExamPlan({}, {},{term:'115-1'},candidate,{coolRead:async()=>{calls.push('cool');return{exams:[]};},publicRead:async()=>{calls.push('public');return publicCourse;}});
 assert.deepEqual(calls,['cool','public']);assert.equal(result.source,'public-ntu');assert.match(result.sourceReason,/no exam entries/);assert.equal(result.exams[0].date,'2026-11-03');
});
test('unavailable COOL falls back without exposing provider exceptions, credentials or cookie data',async()=>{
 const result=await preferredExamPlan({}, {},{term:'115-1'},candidate,{coolRead:async()=>{throw Error('private provider exception / cookie');},publicRead:async()=>publicCourse});
 assert.equal(result.source,'public-ntu');assert.match(result.sourceReason,/unavailable/);assert.doesNotMatch(JSON.stringify(result),/private provider exception|cookie/);
});
test('public fallback still rejects a different course, term or section',async()=>{
 for(const change of [{courseCode:'ME9999'},{term:'114-1'},{serial:'99999'},{section:'02'}])await assert.rejects(preferredExamPlan({}, {},{term:'115-1'},candidate,{coolRead:async()=>({exams:[]}),publicRead:async()=>({...publicCourse,...change})}),{code:'exam_catalog_changed'});
});
test('COOL cancellation entries retain priority over old public exams',async()=>{
 const result=await preferredExamPlan({}, {},{term:'115-1'},candidate,{coolRead:async()=>({...coolPlan,exams:[{kind:'midterm',certainty:'cancelled',date:null}]}),publicRead:async()=>{throw Error('must not fetch');}});
 assert.equal(result.source,'ntu-cool');assert.equal(result.exams[0].certainty,'cancelled');
});

test('generic COOL midterm week does not prevent a specific public exam, but an explicit no-exam does',async()=>{
 const calls=[];
 const weekOnly={...coolPlan,exams:[{kind:'midterm',week:8,date:null,description:'Midterm week',certainty:'exam-period'}]};
 const fallback=await preferredExamPlan({}, {},{term:'115-1'},candidate,{coolRead:async()=>{calls.push('cool');return weekOnly;},publicRead:async()=>{calls.push('public');return publicCourse;}});
 assert.deepEqual(calls,['cool','public']);
 assert.equal(fallback.source,'public-ntu');
 await preferredExamPlan({}, {},{term:'115-1'},candidate,{
  coolRead:async()=>({...coolPlan,exams:[{kind:'midterm',week:8,description:'Midterm week — no exams',certainty:'cancelled'}]}),
  publicRead:async()=>{throw Error('cancellation should prevent public fallback');}
 });
});
