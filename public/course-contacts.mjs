export function instructorEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return '';
  const email = value.trim();
  return /^[a-z0-9_+.-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(email) ? email : '';
}
