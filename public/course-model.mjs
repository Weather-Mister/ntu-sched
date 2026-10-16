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
