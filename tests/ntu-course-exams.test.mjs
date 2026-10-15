import test from 'node:test';
import assert from 'node:assert/strict';
import { syllabusUrl, parseNtuCourseExams, matchImportedCourse, readNtuCourseExams } from '../src/ntu-course-exams.mjs';

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
