import test from 'node:test';
import assert from 'node:assert/strict';
import {searchNtuCourses,resolveNtuCourse} from '../src/ntu-course-catalog.mjs';

const timetable={term:'115-1'},rows=[{title:'靜力學',titleEn:'Statics',day:1,start:620,end:730,code:''}];
const candidate=(serial,section,extra={})=>({term:'115-1',serial,section,title:'Statics',courseCode:'ME1005',courseIdentifier:'502 21130',coolId:serial,schedules:[{day:1,periods:['3','4'],room:''}],...extra});
const candidates=[candidate('52528','01'),candidate('21570','02')];
test('same-time sections require choice; saved COOL course links disambiguate',()=>{
 assert.equal(resolveNtuCourse(timetable,rows,candidates).matching.status,'choose-section');
 const match=resolveNtuCourse(timetable,rows,candidates,{coolIds:['52528']});assert.equal(match.selected.serial,'52528');assert.equal(match.matching.status,'matched-cool');
 assert.equal(resolveNtuCourse(timetable,rows,candidates,{coolIds:['52528','21570']}).selected,null);
});
test('all imported meetings must match; a unique timetable match remains an inference',()=>{
 const other=candidate('12345','03',{schedules:[{day:2,periods:['3','4']}]});
 assert.equal(resolveNtuCourse(timetable,rows,[...candidates,other]).selected,null);
 const single=resolveNtuCourse(timetable,rows,[candidates[0],other]);assert.equal(single.selected.serial,'52528');assert.equal(single.matching.status,'matched-timetable');
 assert.equal(resolveNtuCourse(timetable,[...rows,{...rows[0],day:4}],candidates,{coolIds:['52528']}).selected,null);
});
test('wrong terms, partial names, conflicting codes, sections and serials cannot auto-match',()=>{
 for(const changes of [{term:'114-1'},{title:'Applied Statics'},{courseCode:'ME1006',courseIdentifier:'999 99999'}]){
  const r=changes.courseCode?[{...rows[0],code:'ME1005'}]:rows;
  assert.equal(resolveNtuCourse(timetable,r,[candidate('52528','01',changes)]).selected,null);
 }
 assert.equal(resolveNtuCourse(timetable,[{...rows[0],serial:'99999'}],candidates).selected,null);
 assert.equal(resolveNtuCourse(timetable,[{...rows[0],section:'2'}],candidates).selected.serial,'21570');
});
test('user choice is labelled and cannot substitute a course outside the exact catalog results',()=>{
 const r=resolveNtuCourse(timetable,rows,candidates,{serial:'21570'});assert.equal(r.matching.status,'student-selected');
 assert.throws(()=>resolveNtuCourse(timetable,rows,candidates,{serial:'99999'}),{code:'exam_section_invalid'});
});
test('catalog API uses fixed public endpoint, explicit term and bounded sanitized metadata',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(url,'https://course.ntu.edu.tw/api/v1/courses/search/quick?lang=en_US');assert.equal(options.credentials,'omit');assert.equal(options.headers.Cookie,undefined);
  const body=JSON.parse(options.body);assert.equal(body.query.semester,'115-1');assert.equal(body.query.keyword,'Statics');assert.equal(body.pageIndex,0);
  return Response.json({totalCount:1,courses:[{semester:'115-1',provider:'NTU',serial:'52528',identifier:'ME1005',code:'502 21130',class:'01',name:'Statics',teacher:{name:'Teacher',email:'unused'},schedules:[],coolUrl:'https://cool.ntu.edu.tw/courses/66746',private:'unused'}]});
 };
 try{const result=await searchNtuCourses('115-1',rows[0]);assert.equal(result[0].courseCode,'ME1005');assert.equal(result[0].courseIdentifier,'502 21130');assert.equal(result[0].coolId,'66746');assert.equal(result[0].private,undefined);assert.equal(calls,1);}finally{globalThis.fetch=previous;}
});
test('catalog pagination never silently treats truncated results as a unique match',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({totalCount:500,courses:Array.from({length:30},()=>({semester:'115-1',provider:'NTU',serial:'52528'}))});};
 try{await assert.rejects(searchNtuCourses('115-1',rows[0]),{code:'exam_search_too_broad'});assert.equal(calls,3);}finally{globalThis.fetch=previous;}
});
