// Campus Week shared data adapter: source-agnostic rows for all future themes.
// Credentials, cookies, CSRF and NTU scraping stay in the production client/Worker.
import { CampusAccount } from '/campus-account.mjs';

export const account = new CampusAccount();
const validDay = n => Number.isInteger(n) && n >= 0 && n <= 6;
const hhmm = n => String(Math.floor(n/60)).padStart(2,'0') + ':' + String(n%60).padStart(2,'0');
const label = v => typeof v === 'string' ? v.slice(0,4000) : '';
const coolLink = v => {
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && url.origin === 'https://cool.ntu.edu.tw'
      && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};
export function mapTimetable(snapshot) {
  const sessions = snapshot?.sessions;
  if (!Array.isArray(sessions)) return [];
  return sessions.filter(s => s && validDay(s.day) &&
    Number.isInteger(s.start) && Number.isInteger(s.end) &&
    s.start >= 0 && s.end <= 1440 && s.end > s.start)
    .map(s => {
      const title = label(s.title) || label(s.titleEn) || label(s.titleZh) || 'Untitled class';
      return [s.day, hhmm(s.start), hhmm(s.end),
        label(s.titleEn) || title, label(s.titleZh) || title, label(s.room), label(s.code)];
    });
}
export function mapCalendar(snapshot) {
  if (!Array.isArray(snapshot?.assignments)) return [];
  const now = Date.now();
  return snapshot.assignments.filter(item => item &&
    typeof item.title === 'string' && Number.isFinite(Date.parse(item.dueAt)) &&
    Date.parse(item.dueAt) >= now)
    .sort((a,b) => Date.parse(a.dueAt)-Date.parse(b.dueAt))
    .map(item => ({
      title: label(item.title), course: label(item.course) || 'NTU COOL',
      kind: item.kind === 'event' ? 'event' : 'assignment',
      dueAt: item.dueAt, allDay: item.allDay === true, url: coolLink(item.url)
    }));
}
export function studentFromAccount(current,timetable) {
  return {
    name:['My NTU schedule','我的臺大課表'],
    id:current.studentNumber || '',tasks:[],deadlines:[],
    courses:mapTimetable(timetable)
  };
}
