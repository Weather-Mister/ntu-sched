import { ApiError, digest, encryptionKey, encryptAuthorization, normalizeStudentNumber, randomToken, readJson } from './security.mjs';
import { verifyNtuMail } from './ntu-mail.mjs';
import { savedTimetable, syncTimetable, refreshDueTimetables } from './timetable-store.mjs';
const COOKIE = '__Host-campus_week';
const SESSION_SECONDS = 30 * 24 * 3600;
const now = () => Math.floor(Date.now() / 1000);
const cookie = (token, maxAge = SESSION_SECONDS) => `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
function json(value, status = 200, additional = {}) {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...additional
  }});
}
function rawSession(request) {
  const matches = (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(COOKIE + '='));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function sameOrigin(request, env) {
  let expected; try { expected = new URL(env.APP_ORIGIN); } catch { throw new ApiError(503, 'configuration_required', 'Campus Week is not configured yet.'); }
  const url = new URL(request.url);
  if (expected.origin !== url.origin || expected.pathname !== '/' || expected.search || expected.hash || url.protocol !== 'https:') throw new ApiError(503, 'configuration_required', 'Campus Week must use its configured HTTPS address.');
  const origin = request.headers.get('Origin');
  if (origin && origin !== expected.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new ApiError(403, 'origin_rejected', 'Open Campus Week directly to use this action.');
  if (!['GET', 'HEAD'].includes(request.method) && origin !== expected.origin) throw new ApiError(403, 'origin_rejected', 'Open Campus Week directly to use this action.');
}
async function session(request, env, requireCsrf = false) {
  const token = rawSession(request);
  if (!token) throw new ApiError(401, 'login_required', 'Sign in to Campus Week.');
  const tokenHash = await digest(token);
  const row = await env.DB.prepare('SELECT s.token_hash, s.student_id, s.csrf_token, s.expires_at, u.student_number FROM sessions s JOIN students u ON u.id = s.student_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(tokenHash, now()).first();
  if (!row) throw new ApiError(401, 'login_required', 'Your Campus Week session has expired. Sign in again.');
  if (requireCsrf && request.headers.get('X-CSRF-Token') !== row.csrf_token) throw new ApiError(403, 'csrf_required', 'Refresh Campus Week before trying this action.');
  return row;
}
async function rateLimit(request, env, studentNumber) {
  const window = 600, bucket = Math.floor(now() / window);
  // The IP comes from Cloudflare, never X-Forwarded-For supplied by a client.
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const limits = [[`ip:${ip}`, 20], [`student:${studentNumber}`, 10]];
  const results = await env.DB.batch(await Promise.all(limits.map(async ([identity]) => {
    const key = await digest(`${env.NTU_CREDENTIAL_KEY}:login:${identity}:${bucket}`);
    return env.DB.prepare('INSERT INTO login_limits(key, attempts, expires_at) VALUES(?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts').bind(key, (bucket + 1) * window);
  })));
  if (results.some((result, i) => result.results[0].attempts > limits[i][1])) throw new ApiError(429, 'try_later', 'Too many sign-in attempts. Please try again in ten minutes.');
}
async function login(request, env) {
  if (env.NTU_LOGIN_ENABLED !== 'true') throw new ApiError(503, 'login_not_enabled', 'NTU sign-in is not available yet.');
  await encryptionKey(env.NTU_CREDENTIAL_KEY);
  const body = await readJson(request);
  if (Object.keys(body).some(key => !['studentNumber', 'password'].includes(key))) throw new ApiError(400, 'invalid_request', 'Only student number and password are accepted.');
  const studentNumber = normalizeStudentNumber(body.studentNumber);
  if (typeof body.password !== 'string' || !body.password || body.password.length > 1024 || /[\r\n\0]/.test(body.password)) throw new ApiError(400, 'invalid_password', 'Enter your NTU Mail password.');
  await rateLimit(request, env, studentNumber);
  const verified = await verifyNtuMail(studentNumber, body.password);
  const studentIdCandidate = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO students(id, student_number, created_at) VALUES(?, ?, ?)').bind(studentIdCandidate, studentNumber, now()),
    env.DB.prepare('SELECT id, student_number FROM students WHERE student_number = ?').bind(studentNumber)
  ]);
  const student = results[1].results[0];
  const authorization = await encryptAuthorization(env.NTU_CREDENTIAL_KEY, student.id, 'ntu_mail', { username: verified.username, password: body.password });
  body.password = '';
  const token = randomToken(), tokenHash = await digest(token), csrf = randomToken(), expiresAt = now() + SESSION_SECONDS;
  const statements = [
    env.DB.prepare("INSERT INTO student_connections(student_id, provider, encrypted_authorization, status, verified_at) VALUES(?, 'ntu_mail', ?, 'authorized', ?) ON CONFLICT(student_id, provider) DO UPDATE SET encrypted_authorization = excluded.encrypted_authorization, status = excluded.status, verified_at = excluded.verified_at").bind(student.id, authorization, verified.verifiedAt),
    env.DB.prepare('INSERT INTO sessions(token_hash, student_id, csrf_token, created_at, expires_at) VALUES(?, ?, ?, ?, ?)').bind(tokenHash, student.id, csrf, now(), expiresAt)
  ];
  const previous = rawSession(request);
  if (previous) statements.push(env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(previous)));
  await env.DB.batch(statements);
  return json({ studentNumber: student.student_number, csrfToken: csrf, expiresAt, connections: { ntuMail: 'authorized', cool: 'not_connected', timetable: 'not_connected' } }, 200, { 'Set-Cookie': cookie(token) });
}
async function connections(env, studentId) {
  const result = await env.DB.prepare('SELECT provider, status, verified_at FROM student_connections WHERE student_id = ? ORDER BY provider').bind(studentId).all();
  const byProvider = new Map(result.results.map(row => [row.provider, row]));
  return ['ntu_mail', 'cool', 'timetable'].map(provider => ({ provider, status: byProvider.get(provider)?.status || 'not_connected', verifiedAt: byProvider.get(provider)?.verified_at || null, syncReady: provider === 'timetable' && byProvider.get(provider)?.status === 'authorized', lastSyncedAt: provider === 'timetable' ? byProvider.get(provider)?.verified_at || null : null }));
}
export default {
  async fetch(request, env) {
    try {
      const path = new URL(request.url).pathname;
      if (!path.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: { code: 'not_found', message: 'Not found.' } }, 404);
      sameOrigin(request, env);
      const authorizationStorageReady = typeof env.NTU_CREDENTIAL_KEY === 'string' && /^[0-9a-f]{64}$/i.test(env.NTU_CREDENTIAL_KEY);
      // Report only the setup issue, never the secret or any part of its value.
      const authorizationStorageIssue = authorizationStorageReady ? null : env.NTU_CREDENTIAL_KEY ? 'invalid_format' : 'missing';
      const loginEnabled = env.NTU_LOGIN_ENABLED === 'true' && authorizationStorageReady && !!env.DB;
      if (request.method === 'GET' && path === '/api/ntu/status') return json({ available: true, mode: 'accounts', loginEnabled, authorizationStorageReady, authorizationStorageIssue, timetableSyncReady: true, liveSyncReady: false });
      if (request.method === 'GET' && path === '/api/health') return json({ service: 'campus-week', stage: 'accounts-and-timetable', loginEnabled, authorizationStorageReady, authorizationStorageIssue, databaseBound: !!env.DB, timetableSyncReady: true, liveSyncReady: false });
      if (!env.DB) throw new ApiError(503, 'configuration_required', 'Campus Week database is not configured yet.');
      if (path === '/api/auth/login' && request.method === 'POST') return await login(request, env);
      if (path === '/api/auth/me' && request.method === 'GET') {
        const current = await session(request, env);
        return json({ studentNumber: current.student_number, csrfToken: current.csrf_token, expiresAt: current.expires_at });
      }
      if (path === '/api/connections' && request.method === 'GET') {
        const current = await session(request, env);
        return json({ connections: await connections(env, current.student_id) });
      }
      if (path === '/api/timetable' && request.method === 'GET') {
        const current = await session(request, env);
        return json(await savedTimetable(env, current.student_id));
      }
      if (path === '/api/timetable/sync' && request.method === 'POST') {
        const current = await session(request, env, true);
        const body = await readJson(request);
        if (Object.keys(body).some(key => !['password', 'force'].includes(key)) || body.force !== undefined && typeof body.force !== 'boolean' || body.password !== undefined && (typeof body.password !== 'string' || !body.password || body.password.length > 1024 || /[\r\n\0]/.test(body.password))) throw new ApiError(400, 'invalid_request', 'Enter your myNTU password, or use your saved connection.');
        try { return json(await syncTimetable(env, current, body.password, body.force === true)); }
        finally { body.password = ''; }
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        const current = await session(request, env, true);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(current.token_hash).run();
        return json({ signedOut: true }, 200, { 'Set-Cookie': cookie('', 0) });
      }
      if (path === '/api/auth/logout-all' && request.method === 'POST') {
        const current = await session(request, env, true);
        await env.DB.prepare('DELETE FROM sessions WHERE student_id = ?').bind(current.student_id).run();
        return json({ signedOut: true }, 200, { 'Set-Cookie': cookie('', 0) });
      }
      throw new ApiError(404, 'not_found', 'This Campus Week API route is not available yet.');
    } catch (error) {
      if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) } }, error.status, error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {});
      // Provider bodies, passwords, cookies and raw exceptions never enter logs or responses.
      return json({ error: { code: 'temporarily_unavailable', message: 'Campus Week is temporarily unavailable. Please retry.' } }, 503);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => { await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()),
      env.DB.prepare('DELETE FROM login_limits WHERE expires_at <= ?').bind(now())
    ]); await refreshDueTimetables(env); })());
  }
};

