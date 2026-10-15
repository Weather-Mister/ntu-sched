import { ApiError, decryptAuthorization, encryptAuthorization } from './security.mjs';
import { readNtuTimetable } from './ntu-timetable.mjs';

export const TIMETABLE_INTERVAL = 5 * 24 * 60 * 60 * 1000;
async function connection(env, studentId, provider = 'timetable') {
  return env.DB.prepare('SELECT provider, status, verified_at, encrypted_authorization FROM student_connections WHERE student_id = ? AND provider = ?').bind(studentId, provider).first();
}
async function authorization(env, studentId, provider, row) {
  if (!row) return null;
  try { return await decryptAuthorization(env.NTU_CREDENTIAL_KEY, studentId, provider, row.encrypted_authorization); }
  catch { throw new ApiError(503, 'authorization_unavailable', 'Your saved NTU connection could not be opened. Please reconnect your account.'); }
}
export async function savedTimetable(env, studentId) {
  const row = await connection(env, studentId);
  const value = await authorization(env, studentId, 'timetable', row);
  return { timetable: value?.timetable || null, connectionStatus: row?.status || 'not_connected', checkIntervalMs: TIMETABLE_INTERVAL };
}
export async function syncTimetable(env, student, password, force = false) {
  const previous = await connection(env, student.student_id);
  const retained = await authorization(env, student.student_id, 'timetable', previous);
  if (!force && password === undefined && retained?.timetable && previous.status === 'authorized' && Date.now() - previous.verified_at < 60000) return { timetable: retained.timetable, connectionStatus: 'authorized', changed: false, checkIntervalMs: TIMETABLE_INTERVAL };
  if (password === undefined && previous?.status === 'reconnect_required') throw new ApiError(409, 'timetable_credentials_required', 'Reconnect your timetable with your myNTU password. Your saved classes are still available.');
  const mail = password === undefined && !retained ? await connection(env, student.student_id, 'ntu_mail') : null;
  const credentials = password === undefined ? retained || await authorization(env, student.student_id, 'ntu_mail', mail) : { username: student.student_number, password };
  if (!credentials || credentials.username !== student.student_number || typeof credentials.password !== 'string' || !credentials.password) throw new ApiError(409, 'timetable_credentials_required', 'Enter your myNTU password to connect your timetable.');
  // Count credential submissions, not public redirect/layout failures.
  async function beforeCredentialSubmit() {
    const bucket = Math.floor(Date.now() / 600000), key = `timetable:${student.student_id}:${bucket}`;
    const limit = await env.DB.prepare('INSERT INTO login_limits(key, attempts, expires_at) VALUES(?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts').bind(key, (bucket + 1) * 600).first();
    if (limit.attempts > 3) {
      const error = new ApiError(429, 'timetable_try_later', 'Timetable sign-in attempts are temporarily paused. Your account is still signed in.');
      error.retryAfterSeconds = Math.max(1, Math.ceil(((bucket + 1) * 600000 - Date.now()) / 1000));
      throw error;
    }
  }
  try {
    const timetable = await readNtuTimetable(student.student_number, credentials.password, { beforeCredentialSubmit });
    const changed = JSON.stringify(timetable.sessions) !== JSON.stringify(retained?.timetable?.sessions) || timetable.term !== retained?.timetable?.term;
    timetable.changedAt = changed ? timetable.syncedAt : retained.timetable.changedAt || retained.timetable.syncedAt;
    const encrypted = await encryptAuthorization(env.NTU_CREDENTIAL_KEY, student.student_id, 'timetable', { username: student.student_number, password: credentials.password, timetable });
    await env.DB.prepare("INSERT INTO student_connections(student_id, provider, encrypted_authorization, status, verified_at) VALUES(?, 'timetable', ?, 'authorized', ?) ON CONFLICT(student_id, provider) DO UPDATE SET encrypted_authorization = excluded.encrypted_authorization, status = excluded.status, verified_at = excluded.verified_at").bind(student.student_id, encrypted, timetable.syncedAt).run();
    return { timetable, connectionStatus: 'authorized', changed, checkIntervalMs: TIMETABLE_INTERVAL };
  } catch (error) {
    if (previous && ['timetable_credentials_required', 'timetable_verification_required'].includes(error.code)) await env.DB.prepare("UPDATE student_connections SET status = 'reconnect_required' WHERE student_id = ? AND provider = 'timetable'").bind(student.student_id).run();
    throw error;
  } finally { credentials.password = ''; password = ''; }
}

export async function refreshDueTimetables(env) {
  // Bound each cron batch and rotate by oldest success; a rejected password stops
  // background attempts until the owner reconnects. Never discard a saved version.
  const due = await env.DB.prepare("SELECT u.id AS student_id, u.student_number FROM students u JOIN student_connections c ON c.student_id = u.id WHERE c.provider = 'timetable' AND c.status = 'authorized' AND c.verified_at < ? ORDER BY c.verified_at LIMIT 10").bind(Date.now() - TIMETABLE_INTERVAL).all();
  for (const student of due.results) {
    try { await syncTimetable(env, student); } catch { /* Provider details and authorization never enter logs. */ }
  }
}
