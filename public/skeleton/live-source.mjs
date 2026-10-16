// Campus Week shared data adapter: source-agnostic rows for all future themes.
// Credentials, cookies, CSRF and NTU scraping stay in the production client/Worker.
import { applyCourseOverrides } from '../course-model.mjs';
import { CampusAccount } from '../campus-account.mjs';

export const account = new CampusAccount();
const validDay = n => Number.isInteger(n) && n >= 0 && n <= 6;
const hhmm = n => String(Math.floor(n/60)).padStart(2,'0') + ':' + String(n%60).padStart(2,'0');
const label = v => typeof v === 'string' ? v.trim().slice(0,4000) : '';
// ePortfolio sometimes puts its two official names in the same cell or on
// separate lines. Take the supplied English text, never guess a translation.
const englishPart = value => {
  const raw=label(value);
  if(!/[A-Za-z]{2}/.test(raw))return '';
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const direct=lines.find(x=>/[A-Za-z]{2}/.test(x)&&!/[\u3400-\u9fff]/.test(x));
  if(direct)return direct;
  const latin=raw.replace(/[\u3400-\u9fff]+/g,' ').replace(/[（）]/g,' ')
    .replace(/\(\s*\)/g,' ').replace(/\s+/g,' ').trim();
  return /[A-Za-z]{2}/.test(latin)?latin:'';
};
export const englishNameMissing = snapshot => Array.isArray(snapshot?.sessions)
  ? snapshot.sessions.filter(s => s && !englishPart(s.titleEn) && !englishPart(s.title)).length : 0;
const coolLink = v => {
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && url.origin === 'https://cool.ntu.edu.tw'
      && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};
export function mapTimetable(snapshot,overrides={}) {
  const sessions = snapshot?.sessions;
  if (!Array.isArray(sessions)) return [];
  const rows = sessions.filter(s => s && validDay(s.day) &&
    Number.isInteger(s.start) && Number.isInteger(s.end) &&
    s.start >= 0 && s.end <= 1440 && s.end > s.start)
    .map(s => {
      const original=label(s.title),officialEn=label(s.titleEn),officialZh=label(s.titleZh);
      const english = englishPart(officialEn) || englishPart(original) ||
        officialEn || original || officialZh || 'Untitled class';
      const chinese = officialZh || (/[\u3400-\u9fff]/.test(original) ? original : '') || original || english;
      return [s.day, hhmm(s.start), hhmm(s.end), english, chinese, label(s.room), label(s.code), null, label(s.courseId)];
    });
  return applyCourseOverrides(rows,overrides);
}
export function mapCalendar(snapshot) {
  if (!Array.isArray(snapshot?.assignments)) return [];
  const now = Date.now();
  return snapshot.assignments.filter(item => item &&
    typeof item.title === 'string' && Number.isFinite(Date.parse(item.dueAt)) &&
    Date.parse(item.dueAt) >= now)
    .sort((a,b) => Date.parse(a.dueAt)-Date.parse(b.dueAt))
    .map(item => ({
      id: label(item.id).slice(0,512) || [label(item.title),label(item.course),item.dueAt].join('|'),
      title: label(item.title), course: label(item.course) || 'NTU COOL', courseId: label(item.courseId),
      kind: item.kind === 'event' ? 'event' : 'assignment',
      dueAt: item.dueAt, allDay: item.allDay === true, url: coolLink(item.url)
    }));
}
export function studentFromAccount(current,timetable,overrides={}) {
  return {
    name:['My NTU schedule','我的臺大課表'],
    id:current.studentNumber || '',tasks:[],deadlines:[],
    courses:mapTimetable(timetable,overrides)
  };
}
