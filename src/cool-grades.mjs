import { ApiError } from './security.mjs';
import { withCoolCourseSession } from './cool-course-session.mjs';
import { instructorEmail } from '../public/course-contacts.mjs';

const COOL = 'https://cool.ntu.edu.tw';
const COURSES = '/api/v1/courses';
const courseQuery = new URLSearchParams([
  ['enrollment_type', 'student'], ['enrollment_state', 'active'],
  ['include[]', 'total_scores'], ['include[]', 'teachers'], ['per_page', '100']
]);
const idText = value => /^\d{1,12}$/.test(String(value)) ? String(value) : '';
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const unavailable = () => new ApiError(502, 'cool_grades_unavailable', 'NTU COOL grades could not be loaded. Try again in a moment.');

async function readPages(jar, path, query, signal) {
  const url = new URL(path, COOL);
  url.search = query.toString();
  const items = [], seen = new Set();
  let bytes = 0;
  for (;;) {
    if (seen.size >= 8 || seen.has(url.href)) throw unavailable();
    seen.add(url.href);
    const response = await fetch(url, {
      redirect: 'manual', signal,
      headers: { Accept: 'application/json', Cookie: jar.header(url), 'User-Agent': 'Campus-Week/1.0' }
    });
    jar.receive(response.headers, url);
    if ([401, 302, 303].includes(response.status)) {
      await response.body?.cancel();
      throw new ApiError(409, 'cool_session_expired', 'Your NTU COOL session expired.');
    }
    if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) {
      await response.body?.cancel();
      if (response.status === 403) throw new ApiError(403, 'cool_grades_restricted', 'NTU COOL restricted access to these grades.');
      throw unavailable();
    }
    const reader = response.body?.getReader(), decoder = new TextDecoder();
    if (!reader) throw unavailable();
    let body = '';
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4 * 1024 * 1024) { await reader.cancel(); throw unavailable(); }
      body += decoder.decode(part.value, { stream: true });
    }
    const data = JSON.parse((body + decoder.decode()).replace(/^while\(1\);\s*/, ''));
    if (!Array.isArray(data) || items.length + data.length > 800) throw unavailable();
    items.push(...data);
    const next = (response.headers.get('Link') || '').split(',').find(part => /rel="next"/.test(part))?.match(/<([^>]+)>/)?.[1];
    if (!next) return items;
    const nextUrl = new URL(next, url), page = nextUrl.searchParams.get('page');
    if (nextUrl.origin !== COOL || nextUrl.username || nextUrl.password || nextUrl.pathname !== path || !page || page.length > 500) throw unavailable();
    // Carry only Canvas's page token forward so a Link cannot alter the request's filters.
    url.searchParams.set('page', page);
  }
}

function studentEnrollments(course) {
  return (Array.isArray(course?.enrollments) ? course.enrollments : []).filter(entry =>
    (entry?.type === 'student' || entry?.type === 'StudentEnrollment') &&
    (!entry.enrollment_state || entry.enrollment_state === 'active'));
}

function summarizeCourse(course) {
  const id = idText(course?.id), enrollments = studentEnrollments(course);
  if (!id || !enrollments.length) return null;
  const totals = enrollments.map(enrollment => ({ score: number(enrollment.computed_current_score), grade: text(enrollment.computed_current_grade, 32) }));
  const total = course.hide_final_grades === true || totals.some(value => value.score !== totals[0].score || value.grade !== totals[0].grade) ? null : totals[0];
  const current = total && (total.score !== null || total.grade) ? total : null;
  const teachers = (Array.isArray(course.teachers) ? course.teachers : []).slice(0, 30).map(teacher => ({
    name: text(teacher?.display_name || teacher?.name, 160), email: instructorEmail(teacher?.email)
  })).filter(teacher => teacher.name || teacher.email);
  return { id, title: text(course.original_name || course.name, 400), code: text(course.course_code, 400), current, teachers };
}

function publishedGrades(assignments, enrolled) {
  const students = new Set(studentEnrollments(enrolled).map(entry => idText(entry.user_id)).filter(Boolean));
  return assignments.flatMap(assignment => {
    const id = idText(assignment?.id), submission = assignment?.submission;
    if (!id || assignment.published === false || !submission || submission.assignment_visible === false ||
        !Number.isFinite(Date.parse(submission.posted_at))) return [];
    if (students.size && !students.has(idText(submission.user_id))) return [];
    const score = number(submission.score), grade = text(submission.grade, 32), excused = submission.excused === true;
    if (!excused && score === null && !grade) return [];
    return [{ id, title: text(assignment.name, 250), score, grade, excused, pointsPossible: number(assignment.points_possible) }];
  });
}

export function coolGradesForStudent(env, student, courseId) {
  return withCoolCourseSession(env, student, courseId ? 'assignment-grades' : 'course-grades', async jar => {
    const signal = AbortSignal.timeout(25000);
    try {
      if (!courseId) {
        const courses = await readPages(jar, COURSES, courseQuery, signal);
        return { courses: courses.map(summarizeCourse).filter(Boolean) };
      }
      const enrollmentQuery = new URLSearchParams(courseQuery);
      enrollmentQuery.delete('include[]');
      const courses = await readPages(jar, COURSES, enrollmentQuery, signal);
      const enrolled = courses.find(course => idText(course?.id) === courseId && studentEnrollments(course).length);
      if (!enrolled) throw new ApiError(404, 'cool_grade_course_missing', 'This course is unavailable in your active NTU COOL enrollments.');
      const query = new URLSearchParams([['include[]', 'submission'], ['per_page', '100']]);
      const assignments = await readPages(jar, `${COURSES}/${courseId}/assignments`, query, signal);
      return { items: publishedGrades(assignments, enrolled) };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw unavailable();
    }
  });
}
