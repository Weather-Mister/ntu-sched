import test from 'node:test';
import assert from 'node:assert/strict';
import {CookieJar} from '../src/ntu-cookies.mjs';
import {readCoolCoursePlan,parseCoolCoursePlan} from '../src/cool-course-plan.mjs';
const SOURCE='https://cool.ntu.edu.tw/courses/64620';
test('COOL Week 10 / Midterm 2 modules preserve source and never infer dates from unlocks',()=>{
 const plan=parseCoolCoursePlan('',[{name:'Week 10',unlock_at:'2026-11-09',items:[{title:'Midterm 2',type:'SubHeader',due_at:'2026-11-10'}]},{name:'Week 11',items:[{title:'Cam Drive'}]}],'115-1',SOURCE);
 assert.deepEqual(plan.exams.map(e=>[e.kind,e.week,e.date,e.certainty,e.sourceUrl]),[['midterm',10,null,'week-only',SOURCE]]);
});
test('COOL modules take priority over conflicting syllabus exams instead of merging two sets',()=>{
 const plan=parseCoolCoursePlan('<script>steal()</script><table><tr><td>Week 8</td><td>11/2</td><td>Midterm exam</td></tr></table>',[
  {name:'Assessments',items:[{title:'Final exam on 12/21',type:'Assignment',submission:{score:99}},{title:'Final project presentation'}]},
  {name:'Week 12',published:false,items:[{title:'Quiz'}]}
 ],'115-1',SOURCE);
 assert.deepEqual(plan.exams.map(e=>[e.kind,e.date,e.certainty]),[['final','2026-12-21','explicit']]);assert.equal(plan.sourcePart,'modules');
 assert.doesNotMatch(JSON.stringify(plan),/score|steal|submission/);
});
test('COOL plan fetch verifies active enrollment, reads only syllabus/modules, and fills omitted module items',async()=>{
 const previous=globalThis.fetch,seen=[];const jar=new CookieJar();jar.receive(new Headers({'Set-Cookie':'canvas_session=synthetic; Path=/; Secure'}),new URL(SOURCE));
 globalThis.fetch=async(url,options)=>{
  url=new URL(url);seen.push(url.href);assert.equal(options.redirect,'manual');assert.match(options.headers.Cookie,/canvas_session=synthetic/);assert.doesNotMatch(url.href,/grades|submissions|total_scores/);
  if(url.pathname==='/api/v1/courses')return Response.json([{id:64620}]);
  if(url.pathname==='/api/v1/courses/64620')return Response.json({id:64620,syllabus_body:''});
  if(url.pathname.endsWith('/modules'))return Response.json([{id:10,name:'Week 10',items_count:1}]);
  return Response.json([{title:'Midterm 2',type:'SubHeader'}]);
 };
 try{const result=await readCoolCoursePlan(jar,'64620','115-1');assert.equal(result.exams[0].week,10);assert.equal(result.exams[0].date,null);assert.equal(seen.length,3);assert(!seen.some(u=>u.includes('syllabus_body')));}finally{globalThis.fetch=previous;}
});

test('Statics weekly modules win without reading or parsing a second syllabus source',()=>{
 const syllabus={toString(){throw Error('syllabus must not be parsed');}};
 const modules=[['Week 05 - QUIZ I',5],['Week 09 - Midterm Exam',9],['Week 13 - QUIZ II',13],['Week 16 - Final Exam',16]].map(([name],i)=>({id:i+1,name,items:[]}));
 const result=parseCoolCoursePlan(syllabus,modules,'115-1',SOURCE);
 assert.deepEqual(result.exams.map(e=>[e.kind,e.week,e.date]),[['quiz',5,null],['midterm',9,null],['quiz',13,null],['final',16,null]]);
 assert.equal(result.sourcePart,'modules');
});

test('COOL syllabus is fetched only after modules return no exam entries, with inert parsing',async()=>{
 const previous=globalThis.fetch,seen=[];
 globalThis.fetch=async(url)=>{url=new URL(url);seen.push(url.pathname);
  if(url.pathname==='/api/v1/courses')return Response.json([{id:64620}]);
  if(url.pathname.endsWith('/modules'))return Response.json([{id:1,name:'Week 8',items:[{title:'Lecture'}],items_count:1}]);
  return Response.json({id:64620,syllabus_body:'<script>steal()</script><table><tr><td>Week 8</td><td>11/2</td><td>Midterm exam</td></tr></table>'});
 };
 try{const result=await readCoolCoursePlan(new CookieJar(),'64620','115-1');assert.deepEqual(seen,['/api/v1/courses','/api/v1/courses/64620/modules','/api/v1/courses/64620']);assert.equal(result.sourcePart,'syllabus');assert.equal(result.exams[0].date,'2026-11-02');assert.doesNotMatch(JSON.stringify(result),/steal/);}finally{globalThis.fetch=previous;}
});
test('a different student cannot read a course plan merely by knowing its COOL ID',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json([{id:99999}]);};
 try{await assert.rejects(readCoolCoursePlan(new CookieJar(),'64620','115-1'),{code:'cool_course_not_enrolled'});assert.equal(calls,1);}finally{globalThis.fetch=previous;}
});
test('COOL pagination rejects external, grade and repeated destinations before sending cookies',async()=>{
 const previous=globalThis.fetch;
 try{for(const next of ['https://evil.example/steal','https://cool.ntu.edu.tw/api/v1/courses/64620/grades','https://cool.ntu.edu.tw/api/v1/courses?include[]=total_scores','https://cool.ntu.edu.tw/api/v1/courses?enrollment_state=active&per_page=100']){
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json([{id:64620}],{headers:{Link:'<'+next+'>; rel="next"'}});};
  await assert.rejects(readCoolCoursePlan(new CookieJar(),'64620','115-1'),{code:'cool_plan_unavailable'});assert.equal(calls,1);
 }}finally{globalThis.fetch=previous;}
});
test('expired COOL sessions are reported without following login redirects',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://adfs.ntu.edu.tw/adfs/ls'}});};
 try{await assert.rejects(readCoolCoursePlan(new CookieJar(),'64620','115-1'),{code:'cool_session_expired'});assert.equal(calls,1);}finally{globalThis.fetch=previous;}
});
