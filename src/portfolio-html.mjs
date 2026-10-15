import { parseHTML } from 'linkedom/worker';
import { ApiError } from './security.mjs';
import { extractTimetableDOM } from './portfolio-extract.mjs';
import { groupLessons } from '../public/timetable.mjs';

export function documentFrom(html) {
  if (typeof html !== 'string' || html.length > 2 * 1024 * 1024) throw new ApiError(502, 'timetable_layout', 'NTU returned an unsupported timetable page. Your saved timetable has not changed.');
  return parseHTML(html).document;
}
export function parsePortfolioTimetable(html) {
  const document = documentFrom(html);
  const result = extractTimetableDOM(document);
  if (!result.sessions.length || result.sessions.length > 500 || result.diagnostics.skippedMeetings) throw new ApiError(502, 'timetable_layout', 'The ePortfolio timetable could not be read completely. Your saved timetable has not changed.');
  const sessions = groupLessons(result.sessions);
  // Use the term actually supplied by ePortfolio; never infer it from today's date.
  const text = document.body?.textContent || document.documentElement?.textContent || '';
  const terms = [...text.matchAll(/(\d{3})\s*學年度\s*第?\s*([12])\s*學期/g)].map(match => `${match[1]}-${match[2]}`);
  const uniqueTerms = [...new Set(terms)];
  return { sessions, warnings: result.warnings, term: uniqueTerms.length === 1 ? uniqueTerms[0] : null };
}

export function combineNames(original, alternate) {
  const same = (a, b) => a.day === b.day && a.start === b.start && a.end === b.end && (!(a.code && b.code) || a.code === b.code) && (!(a.serial && b.serial) || a.serial === b.serial) && (!(a.section && b.section) || a.section === b.section) && ((a.code && b.code && a.code === b.code) || a.room === b.room);
  return original.map(a => {
    const matches = alternate.filter(b => same(a, b));
    if (matches.length !== 1 || original.filter(b => same(b, matches[0])).length !== 1) return a;
    const b = matches[0];
    return { ...a, ...(!a.titleEn && b.titleEn ? { titleEn: b.titleEn } : {}), ...(!a.titleZh && b.titleZh ? { titleZh: b.titleZh } : {}) };
  });
}
