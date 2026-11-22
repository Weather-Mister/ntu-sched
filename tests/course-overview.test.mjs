import test from 'node:test';
import assert from 'node:assert/strict';
import { courseOverviewRows } from '../public/skeleton/course-overview.mjs';

test('the overview joins repeated lessons, combined COOL sections and the selected instructor', () => {
  const row = [0, '09:00', '10:00', 'My mechanics class', '機械工程概論', '', 'ME1010', null, 'intro'];
  const timetable = { term: '115-1', sessions: [{ courseId: 'intro', title: '機械工程概論', code: 'ME1010', section: '02' }] };
  const options = { intro: { term: '115-1', selected: { serial: '55551', courseCode: 'ME1010', section: '01', teacher: 'Other professor' },
    candidates: [{ serial: '55552', courseCode: 'ME1010', section: '02', teacher: 'Professor Lin', teacherEmail: 'lin@ntu.edu.tw' }] } };
  const overrides = { intro: { examOffering: { serial: '55552' } } };
  const current = { score: 86.5, grade: 'A' };
  const courses = [{ id: '64826', title: '機械工程概論 Introduction to Mechanical Engineering', code: '機械工程概論 (ME1010-01、02、03)', current },
    { id: '98678', title: '機械工程概論 Introduction to Mechanical Engineering', code: '機械工程概論 (ME1010-04)', current: { score: 11 } }];
  const result = courseOverviewRows([row, [...row], [0, 0, 0, 'Personal event', '', '', '', {}]], timetable, options, overrides, courses);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'My mechanics class');
  assert.equal(result[0].course.id, '64826');
  assert.deepEqual(result[0].course.current, current);
  assert.deepEqual(result[0].contacts, [{ name: 'Professor Lin', email: 'lin@ntu.edu.tw' }]);
  assert.equal(result[1].id, 'cool:98678');
  assert.equal(result[1].title, 'Introduction to Mechanical Engineering');
});
