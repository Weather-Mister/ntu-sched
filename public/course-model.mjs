// Identity uses imported source fields, never a student's display overrides.
const normalized = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function courseIdentity(timetable, session) {
  const code=normalized(session.code);
  return JSON.stringify([normalized(timetable.term), code ? 'code' : session.courseIdentifier ? 'identifier' : 'title', code || normalized(session.courseIdentifier || session.titleZh || session.title), ...(session.serial || session.section ? [normalized(session.serial || ''),normalized(session.section || '')] : [])]);
}
export function applyCourseOverrides(rows, overrides = {}) {
  return rows.map(source => {
    const row = [...source], details = overrides[row[8]];
    if (details) {
      row[3] = details.nameEn ?? row[3]; row[4] = details.nameZh ?? row[4];
      row[5] = details.room ?? row[5];
    }
    row[9] = details?.description ?? '';
    return row;
  });
}

// Stable across row ordering, weeks, language changes, devices and reloads.
export function scheduleAccent(row) {
  const key=row[7] ? 'event:'+normalized(row[7].title) : 'course:'+(row[8] || normalized(row[6] || row[4] || row[3]));
  let hash=2166136261;
  for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);
  return (hash>>>0)%7;
}


// Share the schedule's actual palette with COOL and exam cards. COOL course
// IDs are Canvas IDs, not timetable IDs, so only timetable IDs are trusted as
// direct matches. All other sources must match one unambiguous class name/code.
export function createCourseAccentMatcher(rows = [], sessions = []) {
  const byId = new Map(), byName = new Map(), colors = new Map();
  const key = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  const sources = new Map((sessions || []).map(s => [String(s.courseId || ''), s]));
  for (const [index, row] of (rows || []).entries()) {
    if (row[7]) continue; // Personal events do not correspond to COOL classes.
    const identity = String(row[8] || row[6] || row[4] || row[3] || index);
    colors.set(identity, scheduleAccent(row));
    if (row[8]) byId.set(String(row[8]), identity);
    const source = sources.get(String(row[8] || ''));
    for (const raw of [row[3], row[4], row[6], source?.title,
      source?.titleEn, source?.titleZh, source?.code, source?.courseIdentifier]) {
      const name = key(raw);
      if (!name || name === 'ntu cool') continue;
      if (!byName.has(name)) byName.set(name, new Set());
      byName.get(name).add(identity);
    }
  }
  const uniqueColor = identities => identities.size === 1 ? colors.get([...identities][0]) ?? null : null;
  return (item = {}) => {
    if (item.courseId != null && byId.has(String(item.courseId)))
      return colors.get(byId.get(String(item.courseId))) ?? null;
    const course = item.course && typeof item.course === 'object' ? item.course : null;
    const labels = [typeof item.course === 'string' ? item.course : '',
      item.className, item.code, item.courseCode, course?.title,
      course?.titleEn, course?.titleZh, course?.code, course?.courseCode]
      .map(key).filter(Boolean);
    const exact = new Set();
    for (const name of labels) for (const id of byName.get(name) || []) exact.add(id);
    if (exact.size) return uniqueColor(exact);
    // COOL sometimes prefixes its course names with a term or course code.
    // Use whole-name boundaries and prefer the longest match; never guess
    // between equally strong candidates from different classes.
    const strongest = new Set();
    let longest = 0;
    for (const label of labels) for (const [name, identities] of byName) {
      if (name.length < 6 || label.length <= name.length) continue;
      let from = -1;
      while ((from = label.indexOf(name, from + 1)) !== -1) {
        const before = from ? label[from - 1] : '';
        const after = label[from + name.length] || '';
        const boundary = char => !char || !/[\p{L}\p{N}]/u.test(char);
        if (!boundary(before) || !boundary(after)) continue;
        if (name.length > longest) { longest = name.length; strongest.clear(); }
        if (name.length === longest) for (const id of identities) strongest.add(id);
      }
    }
    return uniqueColor(strongest);
  };
}
