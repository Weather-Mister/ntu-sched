import { ApiError } from './security.mjs';
import { documentFrom } from './portfolio-html.mjs';

const BASE = 'https://course.ntu.edu.tw';
const reject = () => new ApiError(400, 'exam_source_invalid', 'Use an official NTU Course Information syllabus URL.');
const norm = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const asCode = value => norm(value).replace(/[\s-]/g, '').toUpperCase();
const mention = /mid[\s-]?term(?:\s+(?:exam|test))?|\bfinal\s+(?:exam|test)|\bfinals\b|\bquiz(?:zes)?\b|期中(?:考試|考|測驗)|期末(?:考試|考|測驗)|小考|隨堂考|測驗/iu;
const period = /(?:期中考週|期末考週|mid[\s-]?term week|finals? week|exam week)/iu;
const kind = s => /mid[\s-]?term|期中/iu.test(s) ? 'midterm' : /final|期末/iu.test(s) ? 'final' : 'quiz';

export function syllabusUrl(value) {
  if (typeof value !== 'string' || value.length > 1200) throw reject();
  let url; try { url = new URL(value.trim()); } catch { throw reject(); }
  if (url.origin !== BASE || url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
      !/^\/(?:en\/)?courses\/\d{3}-[12]\/\d{4,6}\/?$/.test(url.pathname)) throw reject();
  return url.href;
}
function academicTerm(source) { return new URL(source).pathname.match(/\/courses\/(\d{3}-[12])\//)?.[1] || null; }
function offeringNumber(source) { return new URL(source).pathname.match(/\/(\d{4,6})\/?$/)?.[1] || null; }
function dateIn(text, term) {
  const full = [...text.matchAll(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/g)];
  const md = [...text.matchAll(/(?:^|[^\d])(\d{1,2})\s*(?:\/|月)\s*(\d{1,2})\s*(?:日)?(?=[^\d]|$)/g)];
  const choices = full.length ? full.map(m => [+m[1], +m[2], +m[3]]) : md.map(m => {
    const year = +term.slice(0, 3) + 1911;
    return [Number(term.slice(-1)) === 2 || +m[1] < 8 ? year + 1 : year, +m[1], +m[2]];
  });
  return [...new Set(choices.map(([y,m,d]) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return '';
    const day = new Date(Date.UTC(y, m - 1, d));
    return day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d
      ? String(y) + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0') : '';
  }).filter(Boolean))];
}
function sourceLabel(text, labels, pattern) {
  for (const label of labels) {
    const index = text.indexOf(label);
    if (index === -1) continue;
    const value = text.slice(index + label.length, index + label.length + 110).match(pattern);
    if (value) return value[1];
  }
  return '';
}
function spacedText(node) {
  if(node.nodeType===3)return node.textContent;
  return [...node.childNodes].map(spacedText).join(' ');
}
export function parseNtuCourseExams(html, source) {
  const url = syllabusUrl(source), term = academicTerm(url);
  const doc = documentFrom(html);
  for (const element of doc.querySelectorAll('script,style,noscript,template')) element.remove();
  const allText = norm(spacedText(doc.body || doc.documentElement));
  if (!allText || /請先登入系統|please log in to the system/i.test(allText)) throw new ApiError(502, 'exam_source_unavailable', 'NTU did not return a public course syllabus.');
  const title = norm(doc.querySelector('h1')?.textContent || doc.querySelector('h2')?.textContent).slice(0,160);
  const courseCode = sourceLabel(allText, ['課號', 'Course Number', 'Course Code'], /^\s*([A-Za-z]{2,12}\s*\d{3,6})\b/);
  const courseIdentifier = sourceLabel(allText, ['課程識別碼', 'Course Identifier'], /^\s*(\d{3}\s*[A-Za-z0-9]{3,9})\b/);
  const classSection = sourceLabel(allText, ['班次', 'Class No.', 'Section'], /^\s*([A-Za-z0-9]{1,4})\b/) ||
    [...doc.querySelectorAll('li,p,div,span')].map(e=>/^Class\s+([A-Za-z0-9]{1,4})$/i.exec(norm(spacedText(e)))?.[1]).find(Boolean)||'';
  const serial = offeringNumber(url);
  if (!courseCode) throw new ApiError(502, 'exam_source_layout', 'NTU syllabus metadata was not readable. No exam dates were added.');
  const exams = [], schedule = [], unique = new Set();
  for (const tr of doc.querySelectorAll('table tr')) {
    const cells = [...tr.children].filter(e => /^(TD|TH)$/i.test(e.tagName));
    if (cells.length < 2) continue;
    const first=norm(spacedText(cells[0]));
    const weekMatch=/(?:\bWeek\s*(\d{1,2})\b|第\s*(\d{1,2})\s*週)/i.exec(first);
    const week=weekMatch?Number(weekMatch[1]||weekMatch[2]):null;
    const startsDate=/^(?:\d{4}[-/])?\d{1,2}\s*(?:\/|月|-)\s*\d{1,2}/.test(first);
    if ((!week&&!startsDate) || week>30) continue;
    // NTU renders week, optional date, description as three cells; mobile repeats dates in the week cell.
    const separateDate=cells.length>=3 && (!norm(cells[1].textContent)||dateIn(norm(cells[1].textContent),term).length>0);
    const dateCell=first+' '+(separateDate?norm(cells[1].textContent):'');
    const description=norm(cells.slice(separateDate?2:1).map(spacedText).join(' '));
    const scheduled=dateIn(dateCell,term);
    if(description&&schedule.length<200)schedule.push({week,dates:scheduled,description:description.slice(0,1200)});
    if (!mention.test(description)) continue;
    const specific = dateIn(description, term);
    const examMention=mention.exec(description),inlineDate=/(?:20\d{2}[-/])?\d{1,2}\s*(?:\/|月|-)\s*\d{1,2}(?:日)?/.exec(description);
    const between=inlineDate&&examMention ? (inlineDate.index>examMention.index
      ? description.slice(examMention.index+examMention[0].length,inlineDate.index)
      : description.slice(inlineDate.index+inlineDate[0].length,examMention.index)) : null;
    // A homework deadline elsewhere in the same row is not an explicit exam date.
    const linkedDate=between!==null&&/^[\s:：,，()（）\-\dIVX]*(?:(?:on|scheduled for|at|date|日期|於)\s*)?$/iu.test(between);
    const isPeriod = period.test(description) && !/(?:\bexam\b|考試|測驗|小考)/iu.test(description.replace(period, ''));
    const cancelled=/\b(?:no|cancelled|canceled)\s+(?:midterm|final|exam|quiz)|\b(?:exam|quiz)\s+(?:cancelled|canceled)|不考|取消|無期[中末]考/iu.test(description);
    const certainty = cancelled ? 'cancelled' : isPeriod ? 'exam-period' : specific.length === 1&&linkedDate ? 'explicit' : specific.length > 1 ? 'ambiguous' : scheduled.length === 1 ? 'scheduled-week' : week ? 'week-only' : 'ambiguous';
    const date = certainty === 'explicit' ? specific[0] : certainty === 'scheduled-week' ? scheduled[0] : null;
    const key = [kind(description), date, week, description].join('|');
    if (unique.has(key)) continue;
    unique.add(key);
    exams.push({ kind: kind(description), description: description.slice(0,300),
      date, week, certainty, scheduleDates: scheduled.slice(0,5), sourceUrl: url });
    if (exams.length >= 100) break;
  }
  return { sourceUrl:url, term, serial, courseCode:asCode(courseCode), courseIdentifier: norm(courseIdentifier),
    section: classSection, title, schedule, exams, retrievedAt: Date.now() };
}

export function matchImportedCourse(timetable, selected, info) {
  if (!timetable?.term || timetable.term !== info.term) return { status:'different-term', reason:'The syllabus is from a different academic semester.' };
  if (!selected) return { status:'missing', reason:'This course is not in your saved timetable.' };
  if (!selected.code && !selected.courseIdentifier) return { status:'unverified', reason:'The imported timetable has no official course code for this class.' };
  if (![selected.code, selected.courseIdentifier].filter(Boolean).some(value => asCode(value) === asCode(info.courseCode) || asCode(value) === asCode(info.courseIdentifier)))
    return { status:'different-course', reason:'Official course codes do not match.' };
  if (selected.serial && selected.serial !== info.serial)
    return { status:'different-section', reason:'The NTU offering serial numbers do not match.' };
  if (selected.section && info.section && asCode(selected.section).replace(/^0+/,'') !== asCode(info.section).replace(/^0+/,''))
    return { status:'different-section', reason:'Course section numbers do not match.' };
  const offering=selected.serial || selected.section&&info.section;
  return { status: offering ? 'matched-identifiers' : 'code-only',
    reason: offering ? 'Official course and offering identifiers match.' : 'Course code matches; the section has not been verified.' };
}

export async function readPublicNtu(source, options={}, contentType='text/html') {
  const url=new URL(source);
  if(url.origin!==BASE||url.username||url.password||url.hash)throw reject();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(source, { ...options, redirect:'manual', credentials:'omit',
      headers:{ Accept:contentType, 'User-Agent':'Campus-Week/1.0',...options.headers }, signal:controller.signal });
    if (!response.ok || (response.status >= 300 && response.status < 400) ||
        !(response.headers.get('Content-Type') || '').toLowerCase().includes(contentType)) {
      await response.body?.cancel();
      throw new ApiError(502,'exam_source_unavailable','The public NTU syllabus could not be fetched.');
    }
    let html = '', size = 0;
    const reader = response.body?.getReader(); if (!reader) throw new Error('No body');
    const decoder = new TextDecoder();
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024*1024) { await reader.cancel(); throw new Error('Oversized syllabus'); }
      html += decoder.decode(part.value, {stream:true});
    }
    html += decoder.decode();
    return html;
  } catch(error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502,'exam_source_unavailable','The public NTU syllabus could not be fetched. No exam dates were saved.');
  } finally { clearTimeout(timer); }
}
export async function readNtuCourseExams(input) {
  const source=syllabusUrl(input);
  return parseNtuCourseExams(await readPublicNtu(source),source);
}
