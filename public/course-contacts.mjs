export function instructorEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return '';
  const email = value.trim();
  return /^[a-z0-9_+.-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(email) ? email : '';
}

export const normalizeCourseText = value => String(value || '').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
export const courseSectionKey = value => normalizeCourseText(value).replace(/^0+(?=\d)/, '');
export const academicCourseCode = /^([A-Z]+\d{3,5}[A-Z]?)(?:-([A-Z0-9]{1,4}(?:[,、][A-Z0-9]{1,4})*))?$/;

export function coolCourseIdentity(course) {
  const code = String(course.code || '').normalize('NFKC').toUpperCase();
  const suffix = /\(([^()]+)\)\s*$/.exec(code);
  const match = academicCourseCode.exec((suffix?.[1] || code).replace(/\s/g, ''));
  const name = match && suffix ? code.slice(0, suffix.index) : '';
  const bilingual = /\p{Script=Han}/u.test(course.title) && /\s+[A-Z]/i.test(course.title);
  const englishTitle = bilingual ? course.title.match(/(?:\p{Script=Han}|\))\s+([A-Z][\s\S]*)$/iu)?.[1] : '';
  return {
    code: match?.[1] || '', sections: (match?.[2] || '').split(/[,、]/).map(courseSectionKey).filter(Boolean),
    names: [course.title, name, englishTitle].map(normalizeCourseText).filter(Boolean), englishTitle
  };
}
