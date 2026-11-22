import { instructorEmail } from '../course-contacts.mjs';

const COOL = 'https://cool.ntu.edu.tw';
const normalize = value => String(value || '').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const sectionKey = value => normalize(value).replace(/^0+(?=\d)/, '');
const academicCode = /^([A-Z]+\d{3,5}[A-Z]?)(?:-([A-Z0-9]{1,4}(?:[,、][A-Z0-9]{1,4})*))?$/;

function coolIdentity(course) {
  const code = String(course.code || '').normalize('NFKC').toUpperCase();
  const suffix = /\(([^()]+)\)\s*$/.exec(code);
  const match = academicCode.exec((suffix?.[1] || code).replace(/\s/g, ''));
  const name = match && suffix ? code.slice(0, suffix.index) : '';
  const bilingual = /\p{Script=Han}/u.test(course.title) && /\s+[A-Z]/i.test(course.title);
  const english = bilingual ? course.title.match(/(?:\p{Script=Han}|\))\s+([A-Z][\s\S]*)$/iu)?.[1] : '';
  return {
    code: match?.[1] || '', sections: (match?.[2] || '').split(/[,、]/).map(sectionKey).filter(Boolean),
    names: [course.title, name, english].map(normalize).filter(Boolean), englishTitle: english
  };
}

function contacts(offering, course) {
  const listed = [{ name: offering?.teacher, email: offering?.teacherEmail }, ...(course?.teachers || [])];
  const emails = new Set(), namesWithEmail = new Set(), names = new Set(), result = [];
  for (const person of listed) {
    const email = instructorEmail(person.email), name = normalize(person.name), key = email.toLowerCase();
    if (!email || emails.has(key)) continue;
    emails.add(key);
    namesWithEmail.add(name);
    result.push({ name: person.name, email });
  }
  if (result.length === 1 && offering?.teacherEmail && course?.teachers?.length === 1) return result;
  for (const person of listed) {
    const name = normalize(person.name);
    if (!name || namesWithEmail.has(name) || names.has(name) || instructorEmail(person.email)) continue;
    names.add(name);
    result.push({ name: person.name, email: '' });
  }
  return result;
}

export function courseOverviewRows(rows, timetable, options = {}, overrides = {}, coolCourses = [], language = 'en') {
  const sessions = new Map((timetable?.sessions || []).map(session => [session.courseId, session]));
  const provider = coolCourses.map(course => ({ course, ...coolIdentity(course) }));
  const used = new Set();
  const result = [...new Map(rows.filter(row => !row[7]).map(row => [row[8], row])).values()].map(row => {
    const id = row[8], imported = sessions.get(id), catalog = options[id]?.term === timetable?.term ? options[id] : null;
    const chosen = overrides[id]?.examOffering;
    const offering = chosen ? catalog?.candidates?.find(candidate => candidate.serial === chosen.serial) || chosen
      : catalog?.matching?.status === 'student-selected' ? null : catalog?.selected;
    const code = [offering?.courseCode, imported?.code, imported?.courseIdentifier].map(normalize).find(value => academicCode.test(value));
    const section = sectionKey(offering?.section || imported?.section);
    const titles = [imported?.title, imported?.titleEn, imported?.titleZh, offering?.title].map(normalize).filter(Boolean);
    const eligible = provider.filter(item => !section || !item.sections.length || item.sections.includes(section));
    const sameCode = code ? eligible.filter(item => item.code === code) : [];
    const exactSection = section ? sameCode.filter(item => item.sections.includes(section)) : [];
    const matches = exactSection.length ? exactSection : sameCode.length ? sameCode : eligible.filter(item =>
      (!code || !item.code) && item.names.some(name => titles.includes(name)));
    const course = matches.length === 1 ? matches[0].course : null;
    if (course) used.add(course.id);
    return { id, title: row[language === 'zh' ? 4 : 3], course, contacts: contacts(offering, course),
      needsSection: !offering && !!catalog?.candidates?.length };
  });
  for (const { course, code, englishTitle } of provider) {
    if (code && !used.has(course.id)) result.push({ id: 'cool:' + course.id,
      title: (language === 'en' && englishTitle) || course.title || course.code, course, contacts: contacts(null, course) });
  }
  return result;
}

function element(document, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function gradeText(item, decimal, total = false) {
  if (item.excused) return 'Excused';
  if (!Number.isFinite(item.score)) return item.grade;
  const score = decimal.format(item.score);
  const points = total ? score + '%' : Number.isFinite(item.pointsPossible) ? `${score} / ${decimal.format(item.pointsPossible)}` : score;
  return item.grade && !Number.isFinite(Number(item.grade.replace(/%$/, ''))) ? `${item.grade} · ${points}` : points;
}

export function createCourseOverview({ dialog, list, status, refresh, lesson, lessonDialog, account, getContext, onExpired }) {
  const doc = dialog.ownerDocument;
  const decimal = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
  const make = (tag, css, value) => element(doc, tag, css, value);
  const requests = new Map(), items = new Map(), expanded = new Set();
  let courses = null, error = '', checkedAt = 0;

  function reset() {
    for (const request of requests.values()) request.abort();
    requests.clear();
    items.clear();
    expanded.clear();
    courses = null;
    error = '';
    checkedAt = 0;
    if (dialog.open) dialog.close();
    list.replaceChildren();
    lesson.replaceChildren();
    status.textContent = '';
  }

  function message(failure) {
    if (['cool_credentials_required', 'cool_verification_required', 'cool_session_expired'].includes(failure.code)) return 'Reconnect NTU COOL in Settings to see your grades.';
    if (failure.status === 429) return 'NTU COOL checks are temporarily paused. Try again in a few minutes.';
    return 'Could not load grades from NTU COOL. Try again.';
  }

  async function load(id = '', force = false) {
    const active = account.current;
    if (!active || requests.has(id) || (!force && (id ? items.has(id) : courses && Date.now() - checkedAt < 120000))) return;
    const controller = new AbortController();
    requests.set(id, controller);
    if (!id) error = '';
    const isCurrent = () => requests.get(id) === controller;
    try {
      render();
      const result = await account.courseGrades(id, controller.signal);
      if (!isCurrent() || account.current !== active) return;
      if (result.studentNumber !== active.studentNumber) { onExpired(); return; }
      if (id) items.set(id, { grades: result.items });
      else { courses = result.courses; checkedAt = Date.now(); }
    } catch (failure) {
      if (!isCurrent()) return;
      if (failure.status === 401) { onExpired(); return; }
      if (id) items.set(id, { grades: items.get(id)?.grades, error: message(failure) });
      else error = message(failure);
    } finally {
      if (isCurrent()) { requests.delete(id); render(); }
    }
  }

  function details(row, label = '') {
    const wrapper = make('div', 'course-details');
    const grade = row.course?.current;
    const summary = make('div', 'course-grade-summary');
    const gradeStatus = requests.has('') ? 'Loading grade…' : error ? 'Grade unavailable' : row.course ? 'No total published' : 'No matched COOL course';
    summary.append(make('span', '', 'Current grade'), make('strong', '', grade ? gradeText(grade, decimal, true) : gradeStatus));
    wrapper.append(summary);
    const instructors = make('div', 'course-instructors');
    instructors.append(make('span', '', 'Instructor contacts'));
    if (!row.contacts.length) instructors.append(make('p', '', row.needsSection ? 'Choose your class section in the timetable to see its instructor.' : 'Instructor contact unavailable'));
    for (const contact of row.contacts) {
      const line = make('div', 'course-contact');
      if (contact.name) line.append(make('strong', '', contact.name));
      if (contact.email) {
        const mail = make('a', '', contact.email);
        mail.href = 'mailto:' + encodeURIComponent(contact.email).replace('%40', '@');
        line.append(mail);
      } else line.append(make('span', '', 'Email not published'));
      instructors.append(line);
    }
    wrapper.append(instructors);
    if (row.course) {
      const id = row.course.id, controls = make('div', 'course-grade-actions');
      const official = make('a', '', 'Open COOL grades');
      official.href = `${COOL}/courses/${id}/grades`;
      official.target = '_blank';
      official.rel = 'noopener noreferrer';
      if (label) {
        const toggle = make('button', 'button small', 'Graded work');
        toggle.type = 'button';
        toggle.dataset.gradeCourse = row.id;
        toggle.setAttribute('aria-expanded', String(expanded.has(row.id)));
        toggle.setAttribute('aria-label', 'Graded work for ' + label);
        toggle.addEventListener('click', () => {
          if (expanded.delete(row.id)) render();
          else { expanded.add(row.id); render(); void load(id); }
        });
        controls.append(toggle);
      }
      controls.append(official);
      wrapper.append(controls);
      if (label && expanded.has(row.id)) {
        const graded = make('div', 'course-graded-work');
        const state = items.get(id);
        if (requests.has(id)) graded.append(make('p', '', 'Loading graded work…'));
        if (state?.error) {
          graded.append(make('p', '', state.error));
          const retry = make('button', 'button small', 'Retry');
          retry.type = 'button';
          retry.addEventListener('click', () => void load(id, true));
          graded.append(retry);
        }
        if (state?.grades?.length) {
          const scores = make('ul', 'course-score-list');
          for (const item of state.grades) {
            const line = make('li', '');
            line.append(make('span', '', item.title || 'Graded item'), make('strong', '', gradeText(item, decimal)));
            scores.append(line);
          }
          graded.append(scores);
        } else if (state?.grades) graded.append(make('p', '', 'No assignment or exam grades published in COOL.'));
        wrapper.append(graded);
      }
    }
    return wrapper;
  }

  function render() {
    if (!dialog.open && !lessonDialog.open) return;
    const { rows, timetable, options, overrides, language, lessonId } = getContext();
    const classes = courseOverviewRows(rows, timetable, options, overrides, courses || [], language);
    if (lessonDialog.open) {
      const row = classes.find(value => value.id === lessonId);
      lesson.replaceChildren(...(row ? [details(row)] : []));
    }
    if (!dialog.open) return;
    const focusKey = doc.activeElement?.dataset.gradeCourse;
    refresh.disabled = requests.has('');
    status.textContent = refresh.disabled ? 'Checking NTU COOL…' : error || (classes.length ? '' : 'No courses available yet.');
    list.replaceChildren(...classes.map(row => {
      const card = make('article', 'course-overview-card');
      card.append(make('h3', '', row.title), details(row, row.title));
      return card;
    }));
    if (focusKey) Array.from(list.querySelectorAll('[data-grade-course]')).find(button => button.dataset.gradeCourse === focusKey)?.focus({ preventScroll: true });
  }

  function open() {
    dialog.showModal();
    render();
    void load();
  }
  refresh.addEventListener('click', () => {
    void load('', true);
    const { rows, timetable, options, overrides, language } = getContext();
    const classes = courseOverviewRows(rows, timetable, options, overrides, courses || [], language);
    for (const row of classes) if (row.course && expanded.has(row.id)) void load(row.course.id, true);
  });

  return { open, render, reset, showLesson() { render(); void load(); } };
}
