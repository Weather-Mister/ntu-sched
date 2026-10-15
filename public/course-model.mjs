// Identity uses imported source fields, never a student's display overrides.
const normalized = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function courseIdentity(timetable, session) {
  const code=normalized(session.code);
  return JSON.stringify([normalized(timetable.term), code ? 'code' : 'title', code || normalized(session.titleZh || session.title)]);
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
