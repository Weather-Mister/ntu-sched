import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourseAccentMatcher, scheduleAccent} from '../public/course-model.mjs';

const math=[0,'09:10','10:00','My Engineering Math','工程數學','114','ME2001',null,'math-id'];
const statics=[1,'10:20','12:10','Statics','靜力學','210','ME1005',null,'statics-id'];
const lab=[2,'10:20','12:10','Statics Lab','靜力學實驗','210','ME1006',null,'lab-id'];
const sessions=[
 {courseId:'math-id',titleEn:'Engineering Mathematics I',titleZh:'工程數學一',code:'ME2001'},
 {courseId:'statics-id',titleEn:'Statics',titleZh:'靜力學',code:'ME1005'},
 {courseId:'lab-id',titleEn:'Statics Lab',titleZh:'靜力學實驗',code:'ME1006'}
];
test('exams inherit schedule color by stable course ID even after a title override',()=>{
 const color=createCourseAccentMatcher([math,statics,lab],sessions);
 assert.equal(color({courseId:'math-id',course:{title:'Completely different syllabus title'}}),scheduleAccent(math));
 assert.equal(color({courseId:'statics-id'}),scheduleAccent(statics));
});
test('COOL announcements and assignments match original or overridden class titles and codes',()=>{
 const color=createCourseAccentMatcher([math,statics,lab],sessions);
 for(const course of ['My Engineering Math','Engineering Mathematics I','工程數學','工程數學一','115-1 · Engineering Mathematics I','ME2001'])
   assert.equal(color({courseId:'64620',course}),scheduleAccent(math),course);
 assert.equal(color({course:'115-1 | Statics Lab'}),scheduleAccent(lab));
 assert.equal(color({course:'Statics'}),scheduleAccent(statics));
});
test('manual exams match by selected class name while unmatched and ambiguous items remain neutral',()=>{
 const color=createCourseAccentMatcher([math,statics,lab],sessions);
 assert.equal(color({className:'My Engineering Math'}),scheduleAccent(math));
 assert.equal(color({course:'NTU COOL'}),null);
 assert.equal(color({course:'Unrelated class'}),null);
 const duplicate=[...statics];duplicate[8]='another-statics-id';
 assert.equal(createCourseAccentMatcher([statics,duplicate])({course:'Statics'}),null);
});
test('personal schedule events never become COOL class matches',()=>{
 const event=[4,'12:00','13:00','Lunch','午餐','',null,{title:'Lunch'},'personal-event'];
 assert.equal(createCourseAccentMatcher([event])({course:'Lunch'}),null);
});
