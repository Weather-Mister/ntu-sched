import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarUrl, parseCoolCalendar, readCoolCalendar } from '../src/cool-calendar.mjs';
const feed = 'https://cool.ntu.edu.tw/feeds/calendars/user_synthetic123.ics';
const wrap = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR', ''].join('\r\n');
const event = (id, date, extra = '') => `BEGIN:VEVENT\r\nUID:event-assignment-${id}\r\nSUMMARY:Homework ${id} [Calculus]\r\nDTSTART${date}\r\nURL:https://cool.ntu.edu.tw/calendar?include_contexts=course_42\r\n${extra}END:VEVENT`;
test('COOL feed URL validation accepts subscription URLs and rejects other destinations or embedded credentials', () => {
  assert.equal(calendarUrl(feed.replace('https:', 'webcal:')), feed);
  assert.equal(calendarUrl(feed+'?include_contexts=course_42'), feed+'?include_contexts=course_42');
  for (const url of ['http://cool.ntu.edu.tw/feeds/calendars/user_synthetic123.ics', feed.replace('cool.ntu.edu.tw','evil.example'), feed.replace('https://','https://user:pass@'), feed.replace('.ics','.ics#secret'), feed+'?redirect=https://evil.example', 'https://cool.ntu.edu.tw/login/saml', feed.replace('cool.ntu.edu.tw','127.0.0.1'), feed.replace('user_','course_')]) assert.throws(() => calendarUrl(url), { code: 'cool_calendar_url' });
});
test('calendar deadlines decode folded text, UTC, Taipei and all-day dates with safe direct assignment links', () => {
  const result = parseCoolCalendar(wrap(event(1, ':20261017T155900Z').replace('Homework 1','Essay\\, part 1\\nLong\r\n  title'), event(2, ';TZID=Asia/Taipei:20261016T235900'), event(3, ';VALUE=DATE:20261018')));
  assert.deepEqual(result.assignments.map(a => a.id), ['event-assignment-2','event-assignment-1','event-assignment-3']);
  assert.equal(result.assignments[0].dueAt, '2026-10-16T15:59:00.000Z');
  assert.equal(result.assignments[1].title, 'Essay, part 1\nLong title');
  assert.equal(result.assignments[1].url, 'https://cool.ntu.edu.tw/courses/42/assignments/1');
  assert.equal(result.assignments[2].allDay, true); assert.equal(result.assignments[2].date, '2026-10-18');
});
test('calendar updates use the latest revision, remove cancelled assignments and distinguish other events', () => {
  const result = parseCoolCalendar(wrap(event(1, ':20261017T155900Z','SEQUENCE:1\r\n'),event(1, ':20261019T155900Z','SEQUENCE:2\r\n'),event(2, ':20261017T155900Z','STATUS:CANCELLED\r\n'),'BEGIN:VEVENT\r\nUID:calendar-event-3\r\nSUMMARY:Exam\r\nDTSTART:20261017T155900Z\r\nEND:VEVENT'));
  assert.equal(result.assignments.length,1); assert.equal(result.assignments[0].dueAt,'2026-10-19T15:59:00.000Z'); assert.match(result.warnings[0],/other calendar/);
  assert.equal(parseCoolCalendar(wrap()).assignments.length,0);
});
test('unknown timezone, missing deadline and incomplete calendar fail without partial homework', () => {
  for (const text of ['<html>Login</html>',wrap(event(1, ';TZID=Unknown/Zone:20261017T155900')),wrap(event(1, ':20261017T155900Z')).replace('DTSTART:20261017T155900Z\r\n',''),wrap(event(1, ':20261017T155900Z')).replace('END:VCALENDAR','')]) assert.throws(() => parseCoolCalendar(text), { code:'cool_calendar_layout' });
});
test('untrusted event URLs never leave COOL or expose subscription tokens in returned data', () => {
  for (const url of ['javascript:alert(1)','https://evil.example/courses/42/assignments/1',feed]) {
    const result = parseCoolCalendar(wrap(event(1, ':20261017T155900Z').replace('https://cool.ntu.edu.tw/calendar?include_contexts=course_42',url)));
    assert.equal(result.assignments[0].url,'https://cool.ntu.edu.tw/calendar'); assert.equal(JSON.stringify(result).includes('synthetic123'),false);
  }
});
test('calendar fetch blocks redirects before sending feed tokens outside the allowed subscription route', async () => {
  const original=globalThis.fetch; let calls=0;
  globalThis.fetch=async (_url,options)=>{calls++;assert.equal(options.redirect,'manual'); assert.equal(options.headers.Cookie,undefined);return new Response(null,{status:302,headers:{Location:'https://evil.example/steal'}});};
  try { await assert.rejects(readCoolCalendar(feed),{code:'cool_calendar_redirect'});assert.equal(calls,1); }
  finally {globalThis.fetch=original;}
});
