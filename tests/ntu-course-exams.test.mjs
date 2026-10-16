import test from 'node:test';
import assert from 'node:assert/strict';
import { syllabusUrl, parseNtuCourseExams, matchImportedCourse, readNtuCourseExams, parseExamEntry } from '../src/ntu-course-exams.mjs';

const source='https://course.ntu.edu.tw/courses/115-1/23006';
const html = '<html><body><h2>軟體工程設計</h2><div>115-1 開課</div>'+
  '<ul><li>流水號</li><li>23006</li><li>課號</li><li>CSIE5734</li><li>課程識別碼</li><li>922 U0830</li><li>無分班</li></ul>'+
  '<h3>評量方式</h3><table><tr><td>15%</td><td>Midterm Exam</td></tr><tr><td>25%</td><td>Final Exam</td></tr></table>'+
  '<h3>課程進度</h3><table>'+
  '<tr><td>9/15第 2 週</td><td>Quiz: Baseline (3 hours)</td></tr>'+
  '<tr><td>10/27第 8 週</td><td>Design Patterns</td></tr>'+
  '<tr><td>11/3第 9 週</td><td>Midterm Exam (5 hours, from 7:10 am to 12:10 pm)</td></tr>'+
  '<tr><td>12/22第 16 週</td><td>Final Exam (5 hours)</td></tr>'+
  '</table></body></html>';

test('official syllabus URL blocks arbitrary redirects, credentials and private services',()=>{
  assert.equal(syllabusUrl(source),source);
  for (const invalid of [
    'http://course.ntu.edu.tw/courses/115-1/23006',
    'https://course.ntu.edu.tw.evil.test/courses/115-1/23006',
    'https://course.ntu.edu.tw@evil.test/courses/115-1/23006',
    'https://course.ntu.edu.tw/courses/115-1/23006?redirect=https://evil.test',
    'https://reg.aca.ntu.edu.tw/GradeCheck/StudentGCForm',
    'https://course.ntu.edu.tw/courses/115-1/23006#access-token',
    'https://course.ntu.edu.tw/admin',
    'file:///etc/passwd'
  ])assert.throws(()=>syllabusUrl(invalid));
});

test('exam extraction excludes grading percentages and identifies schedule dates',()=>{
  const result=parseNtuCourseExams(html,source);
  assert.equal(result.term,'115-1');assert.equal(result.serial,'23006');
  assert.equal(result.courseCode,'CSIE5734');
  assert.equal(result.courseIdentifier,'922 U0830');
  assert.equal(result.exams.length,3);
  assert.deepEqual(result.exams.map(x=>[x.kind,x.date,x.certainty]),[
    ['quiz','2026-09-15','scheduled-week'],
    ['midterm','2026-11-03','scheduled-week'],
    ['final','2026-12-22','scheduled-week']
  ]);
  assert(result.exams.every(x=>x.sourceUrl===source));
});

test('course identifier match cannot substitute a wrong semester, course or section',()=>{
  const match=(session, info)=>matchImportedCourse({term:'115-1'},session,info);
  const info=parseNtuCourseExams(html,source);
  assert.equal(match({code:'CSIE5734',serial:'23006'},info).status,'matched-identifiers');
  assert.equal(match({code:'922 U0830'},info).status,'code-only');
  assert.equal(match({courseIdentifier:'922 U0830',serial:'23006'},info).status,'matched-identifiers');
  assert.equal(match({code:'ME2001'},info).status,'different-course');
  assert.equal(match({code:'CSIE5734',serial:'99999'},info).status,'different-section');
  assert.equal(match({code:'CSIE5734'}, {...info,term:'114-1'}).status,'different-term');
});

test('network fetch never follows provider redirects or accepts oversized content',async()=>{
 const previous=globalThis.fetch;let attempts=0;
 globalThis.fetch=async()=>{attempts++;return new Response(null,{status:302,headers:{Location:'https://example.com/steal'}})};
 try {await assert.rejects(readNtuCourseExams(source),e=>e.code==='exam_source_unavailable');assert.equal(attempts,1)}
 finally {globalThis.fetch=previous;}
});

test('English NTU layout extracts section and week-only exams without inventing dates',()=>{
 const english='<html><body><h2>Statics</h2><p>Course Number</p><p>ME1005</p><p>Course Identifier</p><p>502 21130</p><div>Class 01</div><table>'+[
  ['Week 5','','Quiz I'],['Week 8','','Midterm exam'],['Week 12','','Quiz II'],['Week 16','','Final exam'],['Week 17','','Final project presentation']
 ].map(c=>'<tr>'+c.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</table></body></html>';
 const result=parseNtuCourseExams(english,'https://course.ntu.edu.tw/en/courses/115-1/52528');
 assert.equal(result.courseCode,'ME1005');assert.equal(result.section,'01');assert.equal(result.courseIdentifier,'502 21130');
 assert.equal(result.schedule.length,5);assert.deepEqual(result.exams.map(e=>[e.kind,e.week,e.date,e.certainty]),[
  ['quiz',5,null,'week-only'],['midterm',8,null,'week-only'],['quiz',12,null,'week-only'],['final',16,null,'week-only']]);
});

test('separate date columns, duplicated mobile dates, ambiguous dates and cancellations stay conservative',()=>{
 const rows=[['11/3 Week 9','11/3','Midterm exam'],['Week 10','11/10','Quiz 11/11 or 11/12'],['Week 11','','No final exam'],['Week 12','','Finals week']];
 const result=parseNtuCourseExams(html.replace(/<h3>課程進度[\s\S]*/, '<table>'+rows.map(c=>'<tr>'+c.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</table></body></html>'),source);
 assert.deepEqual(result.exams.map(e=>[e.date,e.certainty]),[['2026-11-03','scheduled-week'],[null,'ambiguous'],[null,'cancelled'],[null,'exam-period']]);
 assert(!result.exams[0].description.includes('11/3'));
});

test('an absent syllabus section cannot independently verify an imported section',()=>{
 const info=parseNtuCourseExams(html,source);
 assert.equal(matchImportedCourse({term:'115-1'},{code:'CSIE5734',section:'02'},info).status,'code-only');
});

test('No Class is not a section number; unrelated homework dates are not explicit exam dates',()=>{
 const base='<html><body><h2>Course</h2><p>Course Number</p><p>ME1005</p><div>No Class</div><p>3 Credits</p><table>';
 const result=parseNtuCourseExams(base+'<tr><td>Week 8</td><td></td><td>Midterm exam; homework due 11/3</td></tr><tr><td>Week 9</td><td></td><td>Final exam on 11/10</td></tr></table></body></html>',source);
 assert.equal(result.section,'');assert.equal(result.exams[0].date,null);assert.equal(result.exams[0].certainty,'week-only');assert.equal(result.exams[1].date,'2026-11-10');assert.equal(result.exams[1].certainty,'explicit');
});

test('real Engineering Mathematics written dates exclude preparation sessions and retain exact exam dates',()=>{
 for(const text of ['Oct. 12 (M) Solution Audit/Midterm 1 Preparation','Nov. 11 (W) Solution Audit/Midterm 2 Preparation','Review for the midterm exam','期中考複習'])assert.equal(parseExamEntry(text,'115-1',source,{week:6}),null);
 for(const [text,date]of [['Oct. 14 (W) MIDTERM 1 — Parts 1 and 2. 50-min closed-book exam.','2026-10-14'],['Nov. 18 (W) MIDTERM 2 — Parts 3 and 4.','2026-11-18'],['Dec. 21 (M) FINAL EXAM (10:20 – 12:00)','2026-12-21']]){
  const entry=parseExamEntry(text,'115-1',source,{week:6});assert.equal(entry.date,date);assert.equal(entry.certainty,'explicit');
 }
});

test('bounded public fetch rejects oversized data and never sends credentials',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async(_url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');assert.equal(options.headers.Cookie,undefined);return new Response('x'.repeat(1024*1024+1),{headers:{'Content-Type':'text/html'}});};
 try{await assert.rejects(readNtuCourseExams(source),{code:'exam_source_unavailable'});}finally{globalThis.fetch=previous;}
});

test('midterm week without exams is never interpreted as a scheduled midterm',()=>{
 for(const description of [
  'Midterm week no exam',
  'Week 8 — Midterm Week (NO EXAMS)',
  'Mid-term week: no written exam',
  'Midterm week — without a midterm test',
  'Week 8 Midterm week, no examination',
  '期中考週（不用考試）',
  '期中考週（不考試）',
  '期中考取消'
 ]){
  const entry=parseExamEntry(description,'115-1',source,{week:8});
  assert(entry,description);
  assert.equal(entry.certainty,'cancelled',description);
 }
 for(const description of ['Midterm week','Finals week','期中考週','期末考週']){
  const entry=parseExamEntry(description,'115-1',source,{week:8});
  assert.equal(entry.certainty,'exam-period',description);
 }
 const real=parseExamEntry('Midterm week: written exam on Nov 3','115-1',source,{week:8});
 assert.notEqual(real.certainty,'exam-period');
 assert.notEqual(real.certainty,'cancelled');
 const dated=parseExamEntry('Midterm exam on Nov 3','115-1',source,{week:8});
 assert.equal(dated.date,'2026-11-03');
 const quiz=parseExamEntry('Week 8 Midterm 1 Exam 10/28','115-1',source,{week:8});
 assert.notEqual(quiz.certainty,'cancelled');
});
