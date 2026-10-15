import ICAL from 'ical.js';
import { ApiError } from './security.mjs';

const ORIGIN = 'https://cool.ntu.edu.tw';
const invalidLink = () => new ApiError(400, 'cool_calendar_url', 'COOL returned an unsupported personal calendar link. Reconnect COOL to retrieve the current calendar.');
export function calendarUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) throw invalidLink();
  let url; try { url = new URL(input.trim().replace(/^webcal:/i, 'https:')); } catch { throw invalidLink(); }
  if (url.origin !== ORIGIN || url.protocol !== 'https:' || url.username || url.password || url.hash || !/^\/feeds\/calendars\/user_[A-Za-z0-9_-]{8,256}\.ics$/.test(url.pathname)) throw invalidLink();
  // Canvas may scope a subscription to selected courses. Do not accept arbitrary
  // callback, target or credential parameters, or send this link to another host.
  for (const [key, value] of url.searchParams) if (!['include_contexts', 'include_contexts[]'].includes(key) || !/^course_\d+$/.test(value)) throw invalidLink();
  return url.href;
}
const layout = () => new ApiError(502, 'cool_calendar_layout', 'COOL did not return a readable calendar. Your saved homework has not changed.');
function deadline(property) {
  if (!property) throw layout();
  const value = property.getFirstValue();
  if (!(value instanceof ICAL.Time)) throw layout();
  const { year, month, day, hour, minute, second } = value;
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (year < 1970 || year > 2200 || new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date) throw layout();
  if (value.isDate) return { date, allDay: true, dueAt: `${date}T23:59:59+08:00` };
  if (hour > 23 || minute > 59 || second > 59) throw layout();
  const tzid = property.getParameter('tzid');
  let millis;
  if (value.zone === ICAL.Timezone.utcTimezone || value.zone?.tzid !== 'floating') millis = value.toUnixTime() * 1000;
  else if (!tzid || ['Asia/Taipei', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Taipei Standard Time'].includes(tzid)) millis = Date.UTC(year, month - 1, day, hour - 8, minute, second);
  else throw layout();
  if (!Number.isFinite(millis)) throw layout();
  return { date, allDay: false, dueAt: new Date(millis).toISOString() };
}
function calendarLink(raw, uid) {
  let url; try { url = new URL(raw || '', ORIGIN); } catch { return { url: ORIGIN + '/calendar', courseId: '' }; }
  if (url.origin !== ORIGIN || url.username || url.password) return { url: ORIGIN + '/calendar', courseId: '' };
  const courseId = url.pathname.match(/^\/courses\/(\d+)\/(?:assignments|quizzes)\/\d+\/?$/)?.[1] || url.searchParams.get('include_contexts')?.match(/^course_(\d+)$/)?.[1] || url.searchParams.get('include_contexts[]')?.match(/^course_(\d+)$/)?.[1] || '';
  const assignmentId = uid.match(/^event-assignment-(\d+)$/)?.[1];
  if (assignmentId && courseId) return { courseId, url: `${ORIGIN}/courses/${courseId}/assignments/${assignmentId}` };
  // Retain a numeric event reference for calendar entries, without turning
  // exams/meetings into assignments or returning arbitrary query parameters.
  const eventId = url.searchParams.get('event_id');
  const query = new URLSearchParams();
  if (courseId) query.set('include_contexts', 'course_'+courseId);
  if (/^\d+$/.test(eventId || '')) query.set('event_id', eventId);
  return { courseId, url: ORIGIN + '/calendar' + (query.size ? '?'+query : '') };
}
export function parseCoolCalendar(text) {
  try {
    if (typeof text !== 'string' || text.length > 2 * 1024 * 1024 || !/^\uFEFF?BEGIN:VCALENDAR\r?\n/i.test(text) || !/\r?\nEND:VCALENDAR\s*$/i.test(text)) throw layout();
    const calendar = new ICAL.Component(ICAL.parse(text.replace(/^\uFEFF/, '')));
    if (calendar.name !== 'vcalendar') throw layout();
    const components = calendar.getAllSubcomponents('vevent');
    if (components.length > 2000) throw layout();
    const latest = new Map(); let recurring = 0;
    for (const event of components) {
      const uid = String(event.getFirstPropertyValue('uid') || '');
      if (!uid || uid.length > 1024) throw layout();
      if (event.hasProperty('rrule') || event.hasProperty('recurrence-id')) { recurring++; continue; }
      const previous = latest.get(uid), sequence = Number(event.getFirstPropertyValue('sequence') || 0);
      const modified = event.getFirstPropertyValue('last-modified') || event.getFirstPropertyValue('dtstamp');
      const stamp = modified?.toUnixTime?.() || 0;
      if (!previous || sequence > previous.sequence || sequence === previous.sequence && stamp >= previous.stamp) latest.set(uid, { event, sequence, stamp });
    }
    const assignments = [];
    for (const [uid, { event }] of latest) {
      if (String(event.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED') continue;
      const summary = String(event.getFirstPropertyValue('summary') || '').trim();
      if (!summary || summary.length > 4000) throw layout();
      const course = summary.match(/\s*\[([^\]]+)\]\s*$/), title = (course ? summary.slice(0, course.index).trim() : summary) || summary;
      const link = calendarLink(String(event.getFirstPropertyValue('url') || ''), uid);
      assignments.push({ id: uid, kind: /^event-assignment-\d+$/.test(uid) ? 'assignment' : 'event', title, course: course?.[1].trim() || 'NTU COOL', ...link, ...deadline(event.getFirstProperty('dtstart')) });
    }
    assignments.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.id.localeCompare(b.id));
    const warnings = [];
    if (recurring) warnings.push(`${recurring} recurring calendar item(s) could not be shown. Check COOL for their dates.`);
    return { assignments, warnings };
  } catch (error) { if (error instanceof ApiError) throw error; throw layout(); }
}
export async function readCoolCalendar(input) {
  let url = calendarUrl(input);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
  try {
    for (let redirects = 0; redirects < 4; redirects++) {
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'text/calendar', 'User-Agent': 'Campus-Week/1.0' }, redirect: 'manual', signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location'); await response.body?.cancel();
        try { url = calendarUrl(new URL(location || '', url).href); } catch { throw new ApiError(502, 'cool_calendar_redirect', 'COOL sent the calendar to an unsupported destination. Your saved homework has not changed.'); }
        if (!location) throw layout();
        continue;
      }
      if ([401, 403, 404, 410].includes(response.status)) { await response.body?.cancel(); throw new ApiError(409, 'cool_calendar_reconnect', 'This COOL calendar link is no longer available. Reconnect COOL to retrieve the current calendar automatically.'); }
      if (!response.ok) { await response.body?.cancel(); throw new ApiError(502, 'cool_calendar_unavailable', 'COOL calendar is temporarily unavailable. Your saved homework has not changed.'); }
      const reader = response.body?.getReader(), decoder = new TextDecoder(); let text = '', size = 0;
      if (!reader) throw layout();
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); throw layout(); }
        text += decoder.decode(next.value, { stream: true });
      }
      text += decoder.decode();
      return { ...parseCoolCalendar(text), syncedAt: Date.now() };
    }
    throw new ApiError(502, 'cool_calendar_redirect', 'COOL calendar did not finish loading. Your saved homework has not changed.');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'cool_calendar_unavailable', 'Could not refresh COOL calendar. Your saved homework has not changed.');
  } finally { clearTimeout(timeout); }
}
