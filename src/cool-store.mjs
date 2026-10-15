import { ApiError, decryptAuthorization, encryptAuthorization } from './security.mjs';
import { readCoolCalendar } from './cool-calendar.mjs';
import { discoverCoolCalendar } from './cool-login.mjs';

export const COOL_INTERVAL = 5 * 60 * 1000;
async function connection(env, studentId, provider = 'cool') {
  const row = await env.DB.prepare('SELECT status, verified_at, encrypted_authorization FROM student_connections WHERE student_id = ? AND provider = ?').bind(studentId, provider).first();
  if (!row) return null;
  try { return { ...row, value: await decryptAuthorization(env.NTU_CREDENTIAL_KEY, studentId, provider, row.encrypted_authorization) }; }
  catch { throw new ApiError(503, 'cool_authorization_unavailable', 'Your saved COOL connection could not be opened. Reconnect with your myNTU password.'); }
}
function publicSnapshot(row) {
  return { calendar: row?.value?.calendar || null, connectionStatus: row?.status || 'not_connected', checkIntervalMs: COOL_INTERVAL };
}
export async function savedCoolCalendar(env, studentId) { return publicSnapshot(await connection(env, studentId)); }
async function limit(env, studentId, type, maximum) {
  const bucket = Math.floor(Date.now() / 600000);
  const attempts = await env.DB.prepare('INSERT INTO login_limits(key, attempts, expires_at) VALUES(?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts').bind(`cool:${type}:${studentId}:${bucket}`, (bucket + 1) * 600).first();
  if (attempts.attempts > maximum) {
    const error = new ApiError(429, 'cool_try_later', 'COOL checks are temporarily paused. Your timetable and saved homework are still available.');
    error.retryAfterSeconds = Math.max(1, Math.ceil(((bucket + 1) * 600000 - Date.now()) / 1000)); throw error;
  }
}
export async function syncCoolCalendar(env, student, password, force = false) {
  const studentId = student.student_id, previous = await connection(env, studentId);
  if (password === undefined && previous?.status === 'reconnect_required') throw new ApiError(409, 'cool_credentials_required', 'Reconnect COOL with your myNTU password. Your saved homework is still available.');
  if (!force && password === undefined && previous?.value.calendar && Date.now() - previous.verified_at < COOL_INTERVAL) return { ...publicSnapshot(previous), changed: false };
  await limit(env, studentId, 'refresh', 12);
  let credentials;
  async function discover() {
    credentials = password !== undefined ? { username: student.student_number, password } : previous?.value.password ? previous.value : (await connection(env, studentId, 'timetable'))?.value || (await connection(env, studentId, 'ntu_mail'))?.value;
    if (credentials?.username !== student.student_number || typeof credentials?.password !== 'string' || !credentials.password) throw new ApiError(409, 'cool_credentials_required', 'Connect COOL with your myNTU password.');
    return discoverCoolCalendar(student.student_number, credentials.password, { beforeCredentialSubmit: () => limit(env, studentId, 'login', 3) });
  }
  try {
    let feedUrl = password !== undefined ? await discover() : previous?.value.feedUrl || await discover();
    let calendar;
    try { calendar = await readCoolCalendar(feedUrl); }
    catch (error) {
      // A revoked/rotated subscription can be rediscovered once through the
      // owner's saved NTU login. Never repeat credentials within one attempt.
      if (error.code !== 'cool_calendar_reconnect' || credentials) throw error;
      feedUrl = await discover(); calendar = await readCoolCalendar(feedUrl);
    }
    const changed = JSON.stringify(calendar.assignments) !== JSON.stringify(previous?.value.calendar?.assignments);
    calendar.changedAt = changed ? calendar.syncedAt : previous.value.calendar.changedAt || previous.value.calendar.syncedAt;
    const retained = password !== undefined ? { username: student.student_number, password } : previous?.value.password ? { username: previous.value.username, password: previous.value.password } : {};
    const encrypted = await encryptAuthorization(env.NTU_CREDENTIAL_KEY, studentId, 'cool', { ...retained, feedUrl, calendar });
    await env.DB.prepare("INSERT INTO student_connections(student_id, provider, encrypted_authorization, status, verified_at) VALUES(?, 'cool', ?, 'authorized', ?) ON CONFLICT(student_id, provider) DO UPDATE SET encrypted_authorization = excluded.encrypted_authorization, status = excluded.status, verified_at = excluded.verified_at").bind(studentId, encrypted, calendar.syncedAt).run();
    return { calendar, connectionStatus: 'authorized', checkIntervalMs: COOL_INTERVAL, changed };
  } catch (error) {
    if (previous && ['cool_credentials_required', 'cool_verification_required', 'cool_calendar_reconnect'].includes(error.code)) await env.DB.prepare("UPDATE student_connections SET status = 'reconnect_required' WHERE student_id = ? AND provider = 'cool'").bind(studentId).run();
    throw error;
  } finally { if (credentials) credentials.password = ''; password = ''; }
}
export async function refreshDueCoolCalendars(env) {
  const rows = await env.DB.prepare("SELECT u.id AS student_id, u.student_number FROM students u JOIN student_connections c ON c.student_id = u.id WHERE c.provider = 'cool' AND c.status = 'authorized' AND c.verified_at < ? ORDER BY c.verified_at LIMIT 10").bind(Date.now() - 60 * 60 * 1000).all();
  for (const row of rows.results) { try { await syncCoolCalendar(env, row); } catch { /* Keep the last successful snapshot; never log feed tokens. */ } }
}
