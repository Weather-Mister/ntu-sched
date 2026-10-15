import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.mjs';
import { mapTimetable } from '../public/skeleton/live-source.mjs';
import { applyCourseOverrides,courseIdentity,scheduleAccent } from '../public/course-model.mjs';
import { decryptAuthorization, encryptAuthorization } from '../src/security.mjs';

const APP = 'https://campus.example';
const KEY = '12'.repeat(32); // Synthetic test key, never a deployment secret.
const realFetch = globalThis.fetch;
let providerCalls = [], failProvider = false, redirectOutside = false, wrongIdentity = false;
let portfolioMode = 'ok', portfolioPosts = 0, portfolioVersion = 1;
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  if (['https://cool.ntu.edu.tw','https://adfs.ntu.edu.tw'].includes(parsed.origin)) return mockCool(parsed, options);
  if (parsed.origin !== 'https://wmail1.cc.ntu.edu.tw') return mockPortfolio(parsed, options);
  assert.equal(parsed.origin, 'https://wmail1.cc.ntu.edu.tw');
  assert.equal(options.headers.get('User-Agent'), 'Campus-Week/1.0');
  providerCalls.push({ url: parsed.href, method: options.method });
  if (failProvider) throw new Error('provider exception must never be returned');
  if (redirectOutside) return new Response('', { status: 302, headers: { Location: 'https://untrusted.example/password' } });
  if (options.method !== 'POST') return new Response('<input type="hidden" name="_token" value="test&amp;nonce">', { headers: { 'Set-Cookie': 'roundcube_sessid=synthetic; Secure; HttpOnly' } });
  assert.equal(options.headers.get('Cookie'), 'roundcube_sessid=synthetic');
  const form = options.body;
  assert.equal(form.get('_token'), 'test&nonce');
  const valid = form.get('_pass') === 'synthetic-password';
  return new Response('rcmail.set_env(' + JSON.stringify(valid ? { task: 'mail', request_token: 'test-token', username: wrongIdentity ? 'b99999999' : form.get('_user') } : { task: 'login' }) + ');');
};
after(() => { globalThis.fetch = realFetch; });

class D1 {
  constructor(db = new DatabaseSync(':memory:')) { this.sqlite = db; }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql); let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return statement.get(...values) || null; },
      async all() { return { success: true, results: statement.all(...values) }; },
      async run() { return { success: true, meta: statement.run(...values), results: [] }; },
      execute() { return { success: true, results: statement.columns().length ? statement.all(...values) : (statement.run(...values), []) }; }
    };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try { const results = statements.map(statement => statement.execute()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
function env() {
  const DB = new D1(); DB.sqlite.exec(readFileSync(new URL('../migrations/0001_accounts.sql', import.meta.url), 'utf8')); DB.sqlite.exec(readFileSync(new URL('../migrations/0004_mail.sql', import.meta.url), 'utf8'));
  return { DB, APP_ORIGIN: APP, NTU_CREDENTIAL_KEY: KEY, NTU_LOGIN_ENABLED: 'true' };
}
async function request(environment, path, { method = 'GET', body, cookie, csrf, origin = APP, headers = {} } = {}) {
  const selected = new Headers({ Origin: origin, ...headers });
  if (body !== undefined) selected.set('Content-Type', 'application/json');
  if (cookie) selected.set('Cookie', cookie);
  if (csrf) selected.set('X-CSRF-Token', csrf);
  return worker.fetch(new Request(APP + '/api/' + path, { method, headers: selected, body: body === undefined ? undefined : JSON.stringify(body) }), environment);
}
async function login(environment, studentNumber = 'b12345678') {
  const response = await request(environment, 'auth/login', { method: 'POST', body: { studentNumber, password: 'synthetic-password' } });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  return { response, body, cookie: response.headers.get('Set-Cookie').split(';')[0], csrf: body.csrfToken };
}

test('student account is verified, authorization is encrypted, and cookie is persistent and HttpOnly', async () => {
  const e = env(), auth = await login(e, ' B12345678 ');
  assert.equal(auth.body.studentNumber, 'b12345678');
  assert.match(auth.response.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax; Max-Age=2592000/);
  assert.equal(auth.response.headers.get('Cache-Control'), 'no-store, private');
  const owner = e.DB.sqlite.prepare('SELECT * FROM students').get();
  const saved = e.DB.sqlite.prepare('SELECT * FROM student_connections').get();
  assert.equal(saved.student_id, owner.id);
  assert.equal(saved.encrypted_authorization.includes('synthetic-password'), false);
  assert.equal(JSON.stringify(auth.body).includes('synthetic-password'), false);
  assert.equal((await decryptAuthorization(KEY, owner.id, 'ntu_mail', saved.encrypted_authorization)).password, 'synthetic-password');
  const token = auth.cookie.split('=')[1];
  assert.notEqual(e.DB.sqlite.prepare('SELECT token_hash FROM sessions').get().token_hash, token);
});
test('sessions restore after reopening with the same database', async () => {
  const e = env(), auth = await login(e);
  const reopened = { ...e, DB: new D1(e.DB.sqlite) };
  const response = await request(reopened, 'auth/me', { cookie: auth.cookie });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).studentNumber, 'b12345678');
});
test('two students only see their own connection records', async () => {
  const e = env(), a = await login(e), b = await login(e, 'r23456789');
  const owner = e.DB.sqlite.prepare("SELECT id FROM students WHERE student_number = 'b12345678'").get();
  e.DB.sqlite.prepare("INSERT INTO student_connections VALUES(?, 'cool', ?, 'authorized', ?)").run(owner.id, 'synthetic-ciphertext', 1);
  const connections = async auth => (await (await request(e, 'connections', { cookie: auth.cookie })).json()).connections;
  assert.equal((await connections(a)).find(row => row.provider === 'cool').status, 'authorized');
  assert.equal((await connections(b)).find(row => row.provider === 'cool').status, 'not_connected');
  const probe = await request(e, 'connections?studentId=' + owner.id, { cookie: b.cookie });
  assert.equal((await probe.json()).connections.find(row => row.provider === 'cool').status, 'not_connected');
});
test('encrypted authorization cannot be transferred to another owner or provider', async () => {
  const encrypted = await encryptAuthorization(KEY, 'student-a', 'ntu_mail', { password: 'synthetic-password' });
  assert.notEqual(encrypted, await encryptAuthorization(KEY, 'student-a', 'ntu_mail', { password: 'synthetic-password' }));
  await assert.rejects(decryptAuthorization(KEY, 'student-b', 'ntu_mail', encrypted));
  await assert.rejects(decryptAuthorization(KEY, 'student-a', 'cool', encrypted));
  await assert.rejects(decryptAuthorization('34'.repeat(32), 'student-a', 'ntu_mail', encrypted));
});
test('invalid credentials cannot create an account or session', async () => {
  const e = env();
  const response = await request(e, 'auth/login', { method: 'POST', body: { studentNumber: 'b12345678', password: 'wrong-synthetic-password' } });
  assert.equal(response.status, 401);
  assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM students').get().n, 0);
  assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
});
test('provider failure is sanitized and creates no account', async () => {
  const e = env(); failProvider = true;
  try {
    const response = await request(e, 'auth/login', { method: 'POST', body: { studentNumber: 'b12345678', password: 'synthetic-password' } });
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes('provider exception'), false);
    assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM students').get().n, 0);
  } finally { failProvider = false; }
});
test('unexpected provider redirects never transmit credentials outside NTU', async () => {
  const e = env(); redirectOutside = true;
  try {
    const response = await request(e, 'auth/login', { method: 'POST', body: { studentNumber: 'b12345678', password: 'synthetic-password' } });
    assert.equal(response.status, 502);
  } finally { redirectOutside = false; }
});
test('provider identity mismatch is rejected', async () => {
  const e = env(); wrongIdentity = true;
  try {
    const response = await request(e, 'auth/login', { method: 'POST', body: { studentNumber: 'b12345678', password: 'synthetic-password' } });
    assert.equal(response.status, 401);
    assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM students').get().n, 0);
  } finally { wrongIdentity = false; }
});
test('cross-site login is rejected before reaching NTU', async () => {
  const e = env(), before = providerCalls.length;
  const response = await request(e, 'auth/login', { method: 'POST', origin: 'https://untrusted.example', body: { studentNumber: 'b12345678', password: 'synthetic-password' } });
  assert.equal(response.status, 403); assert.equal(providerCalls.length, before);
});
test('logout requires CSRF token and revokes only the current session', async () => {
  const e = env(), a = await login(e), another = await login(e), b = await login(e, 'r23456789');
  assert.equal((await request(e, 'auth/logout', { method: 'POST', cookie: a.cookie })).status, 403);
  assert.equal((await request(e, 'auth/logout', { method: 'POST', cookie: a.cookie, csrf: a.csrf })).status, 200);
  assert.equal((await request(e, 'auth/me', { cookie: a.cookie })).status, 401);
  assert.equal((await request(e, 'auth/me', { cookie: another.cookie })).status, 200);
  assert.equal((await request(e, 'auth/me', { cookie: b.cookie })).status, 200);
});
test('logout all revokes all devices for the owner and leaves other students connected', async () => {
  const e = env(), a = await login(e), second = await login(e), b = await login(e, 'r23456789');
  assert.equal((await request(e, 'auth/logout-all', { method: 'POST', cookie: a.cookie, csrf: a.csrf })).status, 200);
  assert.equal((await request(e, 'auth/me', { cookie: a.cookie })).status, 401);
  assert.equal((await request(e, 'auth/me', { cookie: second.cookie })).status, 401);
  assert.equal((await request(e, 'auth/me', { cookie: b.cookie })).status, 200);
});
test('expired and invented tokens cannot authenticate', async () => {
  const e = env(), auth = await login(e);
  e.DB.sqlite.exec('UPDATE sessions SET expires_at = 1');
  assert.equal((await request(e, 'auth/me', { cookie: auth.cookie })).status, 401);
  assert.equal((await request(e, 'auth/me', { cookie: '__Host-campus_week=' + 'a'.repeat(43) })).status, 401);
});
test('login throttling blocks repeated failed attempts before forwarding more passwords', async () => {
  const e = env();
  for (let i = 0; i < 10; i++) assert.equal((await request(e, 'auth/login', { method: 'POST', body: { studentNumber: 'b12345678', password: 'wrong' } })).status, 401);
  const before = providerCalls.length;
  assert.equal((await request(e, 'auth/login', { method: 'POST', body: { studentNumber: 'b12345678', password: 'wrong' } })).status, 429);
  assert.equal(providerCalls.length, before);
});
test('configuration and disabled-login modes fail closed', async () => {
  const e = env(), body = { studentNumber: 'b12345678', password: 'synthetic-password' }, before = providerCalls.length;
  assert.equal((await request({ ...e, NTU_LOGIN_ENABLED: 'false' }, 'auth/login', { method: 'POST', body })).status, 503);
  assert.equal((await request({ ...e, NTU_CREDENTIAL_KEY: 'invalid' }, 'auth/login', { method: 'POST', body })).status, 503);
  assert.equal(providerCalls.length, before);
});
test('unknown fields, malformed student numbers and oversized bodies are rejected', async () => {
  const e = env();
  assert.equal((await request(e, 'auth/login', { method: 'POST', body: { studentNumber: 'b12345678', password: 'synthetic-password', studentId: 'another-owner' } })).status, 400);
  assert.equal((await request(e, 'auth/login', { method: 'POST', body: { studentNumber: 'admin', password: 'synthetic-password' } })).status, 400);
  assert.equal((await request(e, 'auth/login', { method: 'POST', body: { studentNumber: 'b12345678', password: 'x'.repeat(5000) } })).status, 413);
});
test('connections explicitly report that live feeds are not implemented yet', async () => {
  const e = env(), a = await login(e);
  const response = await request(e, 'connections', { cookie: a.cookie });
  const body = await response.json();
  assert.ok(body.connections.every(row => !row.syncReady && row.lastSyncedAt === null));
  assert.equal(JSON.stringify(body).includes('encrypted_authorization'), false);
});

test('login readiness requires a valid encryption key and database without exposing the key', async () => {
  const e = env();
  for (const settings of [{ NTU_CREDENTIAL_KEY: undefined }, { NTU_CREDENTIAL_KEY: 'invalid' }, { DB: undefined }, { NTU_LOGIN_ENABLED: 'false' }]) {
    const response = await request({ ...e, ...settings }, 'health');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).loginEnabled, false);
    const status = await request({ ...e, ...settings }, 'ntu/status');
    assert.equal((await status.json()).loginEnabled, false);
  }
  const health = await request(e, 'health');
  const json = await health.json();
  assert.equal(json.loginEnabled, true);
  assert.equal(json.authorizationStorageReady, true);
  assert.equal(json.databaseBound, true);
  assert.equal(JSON.stringify(json).includes(KEY), false);
});


test('readiness distinguishes a missing secret from invalid format without exposing values', async () => {
  const e = env();
  for (const [secret, issue] of [[undefined, 'missing'], ['', 'missing'], ['wrong-format-synthetic', 'invalid_format'], [KEY, null]]) {
    for (const path of ['health', 'ntu/status']) {
      const response = await request({ ...e, NTU_CREDENTIAL_KEY: secret }, path);
      const body = await response.json();
      assert.equal(body.authorizationStorageIssue, issue);
      assert.equal(body.authorizationStorageReady, issue === null);
      assert.equal(body.loginEnabled, issue === null);
      if (secret) assert.equal(JSON.stringify(body).includes(secret), false);
    }
  }
});



const portfolioTarget = 'https://portal.aca.ntu.edu.tw/eportfolio/course-overview';
const loginForm = '<form name=p1 action=p1.php method=post><input name="user" type=text><input name="pass" type=password><input type=submit name=Submit value="登入"></form>';
function fixtureTimetable(student = 'b12345678') {
  return '<html><body><h1>115學年度第1學期</h1><table><tr><th>課程名稱</th><th>課號</th><th>上課時間/教室</th></tr><tr><td>'+student+' 課程 '+portfolioVersion+'</td><td>ME1001</td><td>(一)2,3,4/機械114</td></tr></table></body></html>';
}
function mockPortfolio(url, options) {
  assert.equal(options.headers.get('User-Agent'), 'Campus-Week/1.0');
  assert.ok(['https://portal.aca.ntu.edu.tw', 'https://web2.cc.ntu.edu.tw'].includes(url.origin));
  const cookies = options.headers.get('Cookie') || '';
  if (url.hostname === 'web2.cc.ntu.edu.tw') assert.equal(cookies.includes('portal_only'), false);
  if (url.hostname === 'portal.aca.ntu.edu.tw') assert.equal(cookies.includes('PHPSESSID'), false);
  const redirect = (location, extra = {}) => new Response(null, { status: 302, headers: { Location: location, ...extra } });
  if (url.href === portfolioTarget) {
    const student = cookies.match(/(?:^|; )portfolio_session=([a-z]\d{8})(?:;|$)/)?.[1];
    if (!student) return redirect('/sso-gateway/login', { 'Set-Cookie': 'portal_only=nonce; Path=/; Secure' });
    if (portfolioMode === 'layout') return new Response('<table><tr><td>unsupported private page and synthetic-password</td></tr></table>');
    if (portfolioMode === 'unavailable') return new Response('private provider error synthetic-password', { status: 503 });
    return new Response(fixtureTimetable(student));
  }
  if (url.pathname === '/sso-gateway/login') return redirect(portfolioMode === 'redirect' ? 'https://untrusted.example/password' : 'https://web2.cc.ntu.edu.tw/p/s/login2/p6.php');
  if (url.pathname.endsWith('/p6.php')) return redirect('p1.php', { 'Set-Cookie': 'PHPSESSID=synthetic; Path=/p/s/login2/; Secure' });
  if (url.pathname.endsWith('/p1.php')) {
    assert.match(cookies, /PHPSESSID=synthetic/);
    if (options.method !== 'POST') return new Response(loginForm);
    portfolioPosts++;
    assert.equal(options.headers.get('Origin'), 'https://web2.cc.ntu.edu.tw');
    assert.equal(options.body.get('Submit'), '登入');
    if (portfolioMode === 'credentials') return new Response(loginForm);
    if (portfolioMode === 'challenge') return new Response('<input autocomplete="one-time-code">');
    if (portfolioMode === 'layout') {} // Authentication succeeds; only the timetable layout fails.
    return redirect('https://portal.aca.ntu.edu.tw/sso-gateway/sso-callback?student='+options.body.get('user'));
  }
  if (url.pathname === '/sso-gateway/sso-callback') return redirect('/eportfolio/login-sso', { 'Set-Cookie': 'portfolio_session='+url.searchParams.get('student')+'; Path=/; Secure; HttpOnly' });
  if (url.pathname === '/eportfolio/login-sso') return redirect(portfolioMode === 'canonical' ? '/eportfolio' : portfolioMode === 'basic-info' ? '/eportfolio/basic-info' : portfolioTarget);
  if (url.pathname === '/eportfolio/basic-info') return new Response('<form method=post action="/eportfolio/private-action"><input type=hidden name=change value=profile></form>');
  if (url.pathname === '/eportfolio') return redirect('/eportfolio/');
  if (url.pathname === '/eportfolio/') return new Response('<a href="/eportfolio/course-overview">Courses</a>');
  throw new Error('Unexpected synthetic endpoint');
}
async function sync(e, auth, body = {}) {
  return request(e, 'timetable/sync', { method: 'POST', cookie: auth.cookie, csrf: auth.csrf, body });
}
test('timetable sync uses saved authorization, keeps cookies scoped, and restores an encrypted snapshot', async () => {
  const e = env(), auth = await login(e), before = portfolioPosts;
  const response = await sync(e, auth); assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  assert.equal(result.changed, true); assert.equal(result.timetable.term, '115-1');
  assert.equal(result.timetable.sessions[0].start, 550); assert.equal(result.timetable.sessions[0].end, 730);
  assert.equal(portfolioPosts, before + 1);
  const restored = await (await request(e, 'timetable', { cookie: auth.cookie })).json();
  assert.deepEqual(restored.timetable, result.timetable);
  assert.equal(JSON.stringify(restored).includes('synthetic-password'), false);
  const saved = e.DB.sqlite.prepare("SELECT * FROM student_connections WHERE provider='timetable'").get();
  assert.equal(saved.encrypted_authorization.includes('課程'), false);
  const account = e.DB.sqlite.prepare('SELECT * FROM students').get();
  const decrypted = await decryptAuthorization(KEY, account.id, 'timetable', saved.encrypted_authorization);
  assert.equal(decrypted.password, 'synthetic-password');
  await assert.rejects(decryptAuthorization(KEY, account.id, 'ntu_mail', saved.encrypted_authorization));
  const again = await sync(e, auth); assert.equal((await again.json()).changed, false); assert.equal(portfolioPosts, before + 1);
  const connections = (await (await request(e, 'connections', { cookie: auth.cookie })).json()).connections;
  assert.equal(connections.find(c => c.provider === 'timetable').syncReady, true);
});
test('successful SSO can return through the ePortfolio root with or without a trailing slash', async () => {
  const e = env(), auth = await login(e); portfolioMode = 'canonical';
  try {
    const response = await sync(e, auth);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).timetable.sessions[0].title, 'b12345678 課程 1');
  } finally { portfolioMode = 'ok'; }
});
test('timetables belong only to the session owner, with CSRF and no supplied student override', async () => {
  const e = env(), a = await login(e), b = await login(e, 'r23456789');
  assert.equal((await request(e, 'timetable/sync', { method: 'POST', cookie: a.cookie, body: {} })).status, 403);
  assert.equal((await sync(e, a, { studentId: 'another-owner' })).status, 400);
  await sync(e, a);
  assert.equal((await (await request(e, 'timetable', { cookie: b.cookie })).json()).timetable, null);
  await sync(e, b);
  const own = await (await request(e, 'timetable?studentId=ignored', { cookie: b.cookie })).json();
  assert.match(own.timetable.sessions[0].title, /r23456789/);
  assert.equal((await request(e, 'timetable')).status, 401);
});
test('manual timetable refresh bypasses the fresh cache while automatic checks use a five-day interval', async () => {
  const e = env(), auth = await login(e); await sync(e, auth);
  const before = portfolioPosts;
  const response = await sync(e, auth, { force: true }); assert.equal(response.status, 200);
  assert.equal(portfolioPosts, before + 1);
  const result = await response.json(); assert.equal(result.checkIntervalMs, 5 * 24 * 60 * 60 * 1000);
  const tasks = []; await worker.scheduled({}, e, { waitUntil: task => tasks.push(task) }); await Promise.all(tasks);
  assert.equal(portfolioPosts, before + 1);
});
test('provider failure and layout changes keep the last successful timetable', async () => {
  const e = env(), auth = await login(e); await sync(e, auth);
  const original = (await (await request(e, 'timetable', { cookie: auth.cookie })).json()).timetable;
  for (const mode of ['layout', 'unavailable']) {
    e.DB.sqlite.exec("UPDATE student_connections SET verified_at=1 WHERE provider='timetable'"); portfolioMode = mode;
    try {
      const result = await sync(e, auth); assert.equal(result.status, 502);
      assert.equal((await result.text()).includes('synthetic-password'), false);
      assert.deepEqual((await (await request(e, 'timetable', { cookie: auth.cookie })).json()).timetable, original);
    } finally { portfolioMode = 'ok'; }
  }
});
test('rejected timetable password does not log out Campus Week and stops automatic retries', async () => {
  const e = env(), auth = await login(e); await sync(e, auth);
  e.DB.sqlite.exec("UPDATE student_connections SET verified_at=1 WHERE provider='timetable'");
  portfolioMode = 'credentials';
  try {
    const failed = await sync(e, auth); assert.equal(failed.status, 409);
    assert.equal((await failed.json()).error.code, 'timetable_credentials_required');
    const before = portfolioPosts;
    assert.equal((await sync(e, auth)).status, 409); assert.equal(portfolioPosts, before);
    assert.equal((await request(e, 'auth/me', { cookie: auth.cookie })).status, 200);
    assert.equal((await (await request(e, 'timetable', { cookie: auth.cookie })).json()).connectionStatus, 'reconnect_required');
  } finally { portfolioMode = 'ok'; }
  assert.equal((await sync(e, auth, { password: 'different-myntu-password' })).status, 200);
});
test('SSO refuses external redirects and verification challenges without repeated credential posts', async () => {
  for (const [mode, status] of [['redirect', 502], ['challenge', 409]]) {
    const e = env(), auth = await login(e), before = portfolioPosts; portfolioMode = mode;
    try { assert.equal((await sync(e, auth)).status, status); assert.equal(portfolioPosts - before, mode === 'redirect' ? 0 : 1); }
    finally { portfolioMode = 'ok'; }
  }
});
test("scheduled checks detect changes and retain another student's isolated snapshot", async () => {
  const e = env(), a = await login(e), b = await login(e, 'r23456789'); await sync(e, a); await sync(e, b);
  e.DB.sqlite.exec("UPDATE student_connections SET verified_at=1 WHERE provider='timetable'");
  portfolioVersion = 2;
  try {
    const tasks = []; await worker.scheduled({}, e, { waitUntil: task => tasks.push(task) }); await Promise.all(tasks);
    for (const [auth, number] of [[a, 'b12345678'], [b, 'r23456789']]) {
      const saved = (await (await request(e, 'timetable', { cookie: auth.cookie })).json()).timetable;
      assert.equal(saved.sessions[0].title, number+' 課程 2');
      assert.ok(saved.syncedAt >= saved.changedAt);
    }
  } finally { portfolioVersion = 1; }
});


test('successful SSO may land on basic-info before the read-only timetable without submitting profile forms', async () => {
  const e = env(), auth = await login(e), before = portfolioPosts; portfolioMode = 'basic-info';
  try {
    const response = await sync(e, auth);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).timetable.sessions[0].title, 'b12345678 課程 1');
    assert.equal(portfolioPosts, before + 1);
  } finally { portfolioMode = 'ok'; }
});
test('public redirect failures do not consume the credential submission budget', async () => {
  const e = env(), auth = await login(e), before = portfolioPosts; portfolioMode = 'redirect';
  try {
    for (let i = 0; i < 5; i++) assert.equal((await sync(e, auth)).status, 502);
    assert.equal(portfolioPosts, before);
    portfolioMode = 'ok';
    assert.equal((await sync(e, auth)).status, 200);
    assert.equal(portfolioPosts, before + 1);
  } finally { portfolioMode = 'ok'; }
});
test('only three credential submissions are allowed per ten-minute window and the pause has a retry time', async () => {
  const e = env(), auth = await login(e), before = portfolioPosts; portfolioMode = 'credentials';
  try {
    for (let i = 0; i < 3; i++) assert.equal((await sync(e, auth)).status, 409);
    const response = await sync(e, auth), result = await response.json();
    assert.equal(response.status, 429);
    assert.equal(result.error.code, 'timetable_try_later');
    assert.ok(result.error.retryAfterSeconds >= 1 && result.error.retryAfterSeconds <= 600);
    assert.equal(response.headers.get('Retry-After'), String(result.error.retryAfterSeconds));
    assert.equal(portfolioPosts, before + 3);
  } finally { portfolioMode = 'ok'; }
});


let announcementsMode = 'ok', announcementReads = 0;
let coolMode = 'ok', coolPosts = 0, coolReads = 0, coolRevision = 1;
const coolForm = '<form method=post action="/adfs/ls/?request=synthetic"><input type=hidden name=__VIEWSTATE value=nonce><input id=ContentPlaceHolder1_UsernameTextBox name=username><input id=ContentPlaceHolder1_PasswordTextBox name=password type=password><input id=ContentPlaceHolder1_SubmitButton name=submit type=submit value=Login></form>';
function mockCool(url, options) {
  options = { ...options, headers: new Headers(options.headers) };
  const redirect = (location, extra={}) => new Response(null,{status:302,headers:{Location:location,...extra}});
  const cookies=options.headers.get('Cookie')||'';
  assert.equal(options.headers.get('User-Agent'),'Campus-Week/1.0');
  if(url.origin==='https://adfs.ntu.edu.tw') {
    assert.equal(cookies.includes('canvas_session'),false);
    if(options.method!=='POST') return new Response(coolForm,{headers:{'Set-Cookie':'adfs_session=synthetic; Path=/adfs/; Secure'}});
    coolPosts++;assert.match(cookies,/adfs_session/);assert.equal(options.headers.get('Origin'),'https://adfs.ntu.edu.tw');assert.equal(options.body.get('__VIEWSTATE'),'nonce');
    if(coolMode==='credentials')return new Response(coolForm);
    if(coolMode==='challenge')return new Response('<input autocomplete=one-time-code>');
    return new Response('<form method=post action="'+(coolMode==='redirect'?'https://evil.example/steal':'https://cool.ntu.edu.tw/login/saml')+'"><input type=hidden name=SAMLResponse value="'+options.body.get('username')+'"><input type=hidden name=RelayState value=synthetic></form>');
  }
  assert.equal(cookies.includes('adfs_session'),false);
  if(url.pathname==='/login/saml') {
    if(options.method!=='POST')return redirect('https://adfs.ntu.edu.tw/adfs/ls/?request=synthetic');
    assert.equal(options.headers.get('Origin'),'https://adfs.ntu.edu.tw'); assert.equal(options.body.has('password'),false);
    return redirect('/',{'Set-Cookie':'canvas_session='+options.body.get('SAMLResponse')+'; Path=/; Secure; HttpOnly'});
  }
  const student=cookies.match(/canvas_session=([a-z]\d{8})/)?.[1];
  if(url.pathname.startsWith('/feeds/calendars/')) {
    coolReads++; assert.equal(cookies,'');
    if(coolMode==='unavailable')return new Response('private provider error synthetic-password',{status:503});
    if(coolMode==='layout')return new Response('<html>private login page synthetic-password</html>');
    if(coolMode==='revoked')return new Response('',{status:404});
    const owner=url.pathname.match(/user_([a-z]\d{8})_synthetic/)[1];
    const events=coolMode==='empty'?'':`BEGIN:VEVENT\r\nUID:event-assignment-123\r\nSUMMARY:${owner} Homework ${coolRevision} [Calculus]\r\nDTSTART:20991017T155900Z\r\nURL:https://cool.ntu.edu.tw/calendar?include_contexts=course_42\r\nEND:VEVENT\r\n`;
    return new Response('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+events+'END:VCALENDAR\r\n',{headers:{'Content-Type':'text/calendar'}});
  }
  assert.ok(student,'provider session is required to discover a private calendar');
  if(url.pathname==='/')return new Response('<h1>Dashboard</h1>');
  if(url.pathname==='/api/v1/users/self/profile')return Response.json({login_id:coolMode==='identity'?'r99999999':student});
  if(url.pathname==='/api/v1/courses') {
    if(announcementsMode==='expired'){announcementsMode='ok';return new Response('',{status:401});}
    if(announcementsMode==='unavailable')return new Response('secret provider error',{status:503});
    return Response.json([{id:42,name:student+' Calculus'}]);
  }
  if(url.pathname==='/api/v1/announcements') {
    announcementReads++;
    assert.equal(url.searchParams.get('active_only'),'true');
    assert.equal(url.searchParams.get('context_codes[]'),'course_42');
    const item={id:123,context_code:'course_42',title:student+' Notice',posted_at:new Date(Date.now()-10000).toISOString(),message:'<p>Hello</p><script>bad()</script><p>World</p>',author:{display_name:'Teacher'}};
    if(announcementsMode==='empty')return Response.json([]);
    if(url.searchParams.get('page')==='2')return Response.json([{...item,id:124,title:'Second page'}]);
    const next=new URL(url);next.searchParams.set('page','2');return Response.json([item],{headers:{Link:'<'+next.href+'>; rel="next"'}});
  }
  if(url.pathname==='/calendar')return new Response('<input id=calendar-feed-url-input value="https://cool.ntu.edu.tw/feeds/calendars/user_'+student+'_synthetic.ics">');
  throw new Error('Unexpected COOL synthetic route');
}
async function syncCool(e,auth,body={}) {return request(e,'cool/calendar/sync',{method:'POST',cookie:auth.cookie,csrf:auth.csrf,body});}
test('COOL automatically discovers the personal calendar through saved NTU login, encrypts it and restores without another login',async()=>{
  const e=env(),auth=await login(e),before=coolPosts;
  const response=await syncCool(e,auth);assert.equal(response.status,200,await response.clone().text());
  const result=await response.json();assert.equal(result.calendar.assignments[0].title,'b12345678 Homework 1');assert.equal(coolPosts,before+1);
  const raw=JSON.stringify(result);assert.equal(raw.includes('_synthetic.ics'),false);assert.equal(raw.includes('synthetic-password'),false);
  const row=e.DB.sqlite.prepare("SELECT * FROM student_connections WHERE provider='cool'").get();assert.equal(row.encrypted_authorization.includes('Homework'),false);assert.equal(row.encrypted_authorization.includes('user_'),false);
  const retained=await decryptAuthorization(KEY,row.student_id,'cool',row.encrypted_authorization);assert.match(retained.feedUrl,/user_b12345678_synthetic/);
  const restored=await request(e,'cool/calendar',{cookie:auth.cookie});assert.deepEqual((await restored.json()).calendar,result.calendar);
  await syncCool(e,auth);assert.equal(coolPosts,before+1);
  await syncCool(e,auth,{force:true});assert.equal(coolPosts,before+1);
  const connections=(await (await request(e,'connections',{cookie:auth.cookie})).json()).connections;
  assert.equal(connections.find(c=>c.provider==='cool').syncReady,true);
});
test('COOL only accepts session ownership and CSRF; other students cannot read or override a calendar',async()=>{
  const e=env(),a=await login(e),b=await login(e,'r23456789');
  assert.equal((await request(e,'cool/calendar')).status,401);
  assert.equal((await request(e,'cool/calendar/sync',{method:'POST',cookie:a.cookie,body:{}})).status,403);
  assert.equal((await syncCool(e,a,{studentId:'someone-else'})).status,400);
  assert.equal((await syncCool(e,a,{feedUrl:'https://evil.example'})).status,400);
  await syncCool(e,a);assert.equal((await (await request(e,'cool/calendar',{cookie:b.cookie})).json()).calendar,null);
  await syncCool(e,b);const own=await (await request(e,'cool/calendar',{cookie:b.cookie})).json();assert.match(own.calendar.assignments[0].title,/r23456789/);
});
test('COOL discovery rejects wrong identities, external SAML destinations and verification challenges',async()=>{
  for(const [mode,status]of [['identity',502],['redirect',502],['challenge',409],['credentials',409]]){
    const e=env(),auth=await login(e),before=coolPosts;coolMode=mode;
    try{const response=await syncCool(e,auth);assert.equal(response.status,status,await response.clone().text());assert.equal(coolPosts,before+1);assert.equal((await response.text()).includes('synthetic-password'),false);assert.equal(e.DB.sqlite.prepare("SELECT * FROM student_connections WHERE provider='cool'").get(),undefined);}
    finally{coolMode='ok';}
  }
});
test('COOL updates changed deadlines and deleted homework while transient failures preserve the last snapshot',async()=>{
  const e=env(),auth=await login(e);await syncCool(e,auth);const before=coolPosts;
  coolRevision=2;
  try{const changed=await (await syncCool(e,auth,{force:true})).json();assert.equal(changed.changed,true);assert.match(changed.calendar.assignments[0].title,/Homework 2/);
    for(const mode of ['layout','unavailable']){coolMode=mode;const result=await syncCool(e,auth,{force:true});assert.equal(result.status,502);assert.equal((await result.text()).includes('synthetic-password'),false);assert.deepEqual((await (await request(e,'cool/calendar',{cookie:auth.cookie})).json()).calendar,changed.calendar);}
    coolMode='empty';const cleared=await (await syncCool(e,auth,{force:true})).json();assert.deepEqual(cleared.calendar.assignments,[]);assert.equal(coolPosts,before);
  }finally{coolMode='ok';coolRevision=1;}
});
test('revoked COOL feed is rediscovered once, then reconnect stops automatic login attempts without signing the student out',async()=>{
  const e=env(),auth=await login(e);await syncCool(e,auth);coolMode='revoked';const before=coolPosts;
  try{const result=await syncCool(e,auth,{force:true});assert.equal(result.status,409);assert.equal(coolPosts,before+1);
    assert.equal((await syncCool(e,auth,{force:true})).status,409);assert.equal(coolPosts,before+1);
    assert.equal((await request(e,'auth/me',{cookie:auth.cookie})).status,200);
    assert.equal((await (await request(e,'cool/calendar',{cookie:auth.cookie})).json()).calendar.assignments.length,1);
  }finally{coolMode='ok';}
  assert.equal((await syncCool(e,auth,{password:'myNTU-password',force:true})).status,200);
});
test('hourly background COOL checks update saved homework without repeating NTU login or affecting timetable',async()=>{
  const e=env(),auth=await login(e);await sync(e,auth);await syncCool(e,auth);const before=coolPosts,tableBefore=portfolioPosts;
  e.DB.sqlite.exec("UPDATE student_connections SET verified_at=1 WHERE provider='cool'");coolRevision=2;
  try{const tasks=[];await worker.scheduled({},e,{waitUntil:task=>tasks.push(task)});await Promise.all(tasks);assert.equal(coolPosts,before);assert.equal(portfolioPosts,tableBefore);assert.match((await (await request(e,'cool/calendar',{cookie:auth.cookie})).json()).calendar.assignments[0].title,/Homework 2/);}
  finally{coolRevision=1;}
});

async function syncAnnouncements(e,auth,body={force:true}) { return request(e,'cool/announcements/sync',{method:'POST',cookie:auth.cookie,csrf:auth.csrf,body}); }
test('announcements connect through saved NTU credentials, paginate, encrypt data and reuse provider cookies',async()=>{
  const e=env(),auth=await login(e),before=coolPosts;
  const response=await syncAnnouncements(e,auth);assert.equal(response.status,200,await response.clone().text());
  const result=await response.json();assert.equal(result.announcements.items.length,2);assert.equal(result.checkIntervalMs,120000);assert.equal(coolPosts,before+1);
  const item=result.announcements.items.find(i=>i.id==='42:123');assert.match(item.body,/Hello/);assert.match(item.body,/World/);assert.doesNotMatch(item.body,/bad/);assert.equal(item.url,'https://cool.ntu.edu.tw/courses/42/discussion_topics/123');
  assert.doesNotMatch(JSON.stringify(result),/canvas_session|synthetic-password/);
  const row=e.DB.sqlite.prepare("SELECT * FROM student_connections WHERE provider='cool'").get();assert.doesNotMatch(row.encrypted_authorization,/Notice|canvas_session/);
  await syncCool(e,auth);await syncAnnouncements(e,auth);assert.equal(coolPosts,before+2); // Calendar discovery once; announcements reuse their session.
  const stored=await(await request(e,'cool/announcements',{cookie:auth.cookie})).json();assert.equal(stored.announcements.items.length,2);
  const reads=announcementReads;await syncAnnouncements(e,auth,{force:false});assert.equal(announcementReads,reads);
  const calendar=await(await request(e,'cool/calendar',{cookie:auth.cookie})).json();assert.equal(calendar.calendar.assignments.length,1);
});
test('announcement routes require owner session and CSRF and never accept a supplied owner or URL',async()=>{
  const e=env(),a=await login(e),b=await login(e,'r23456789');
  assert.equal((await request(e,'cool/announcements')).status,401);
  assert.equal((await request(e,'cool/announcements/sync',{method:'POST',cookie:a.cookie,body:{}})).status,403);
  for(const body of [{studentId:'other'},{url:'https://evil.example'},{force:'yes'}])assert.equal((await syncAnnouncements(e,a,body)).status,400);
  await syncAnnouncements(e,a);assert.equal((await(await request(e,'cool/announcements',{cookie:b.cookie})).json()).announcements,null);
  await syncAnnouncements(e,b);assert.match((await(await request(e,'cool/announcements',{cookie:b.cookie})).json()).announcements.items.find(i=>i.id==='42:123').title,/r23456789/);
});
test('announcement refresh recovers an expired provider session once and preserves snapshots on failure',async()=>{
  const e=env(),auth=await login(e);await syncAnnouncements(e,auth);const before=coolPosts;
  announcementsMode='expired';assert.equal((await syncAnnouncements(e,auth)).status,200);assert.equal(coolPosts,before+1);
  announcementsMode='unavailable';try{assert.equal((await syncAnnouncements(e,auth)).status,502);assert.equal((await(await request(e,'cool/announcements',{cookie:auth.cookie})).json()).announcements.items.length,2);}finally{announcementsMode='ok';}
  announcementsMode='empty';try{assert.deepEqual((await(await syncAnnouncements(e,auth)).json()).announcements.items,[]);}finally{announcementsMode='ok';}
});

const editCourse=(e,auth,id,body)=>request(e,'timetable/courses/'+id,{method:'PATCH',cookie:auth?.cookie,csrf:auth?.csrf,body});
test('course details belong to the student, persist across sign-ins and NTU sync, and have independent names per language',async()=>{
  const e=env(),a=await login(e),b=await login(e,'r23456789');
  const original=await(await sync(e,a)).json();await sync(e,b);const id=original.timetable.sessions[0].courseId;
  assert.match(id,/^[A-Za-z0-9_-]{43}$/);
  const english=await editCourse(e,a,id,{version:0,language:'en',name:'Engineering Maths',room:'Room 114',description:'Bring calculator'});
  assert.equal(english.status,200,await english.clone().text());const saved=await english.json();
  assert.equal(saved.courseOverrides[id].nameEn,'Engineering Maths');assert.equal(saved.courseOverrides[id].nameZh,undefined);
  assert.equal(saved.timetable.sessions[0].title,original.timetable.sessions[0].title); // Source stays original.
  assert.deepEqual((await(await request(e,'timetable',{cookie:b.cookie})).json()).courseOverrides,{});
  assert.equal((await editCourse(e,a,id,{version:1,language:'zh',name:'工程數學'})).status,200);
  const fresh=await login(e),restored=await(await request(e,'timetable',{cookie:fresh.cookie})).json();
  assert.equal(restored.courseOverrides[id].nameEn,'Engineering Maths');assert.equal(restored.courseOverrides[id].nameZh,'工程數學');assert.equal(restored.courseOverrides[id].room,'Room 114');
  portfolioVersion=2;
  try{const synced=await(await sync(e,fresh,{force:true})).json();assert.equal(synced.timetable.sessions[0].courseId,id);assert.equal(synced.courseOverrides[id].description,'Bring calculator');}finally{portfolioVersion=1;}
  const row=e.DB.sqlite.prepare("SELECT encrypted_authorization FROM student_connections WHERE student_id=(SELECT id FROM students WHERE student_number='b12345678') AND provider='timetable'").get();assert.doesNotMatch(row.encrypted_authorization,/Engineering Maths|calculator/);
});
test('course edits require session, CSRF, valid fields, ownership and current version; restore keeps a version tombstone',async()=>{
  const e=env(),a=await login(e),b=await login(e,'r23456789');const id=(await(await sync(e,a)).json()).timetable.sessions[0].courseId;
  const body={version:0,language:'en',name:'Custom'};
  assert.equal((await editCourse(e,null,id,body)).status,401);
  assert.equal((await request(e,'timetable/courses/'+id,{method:'PATCH',cookie:a.cookie,body})).status,403);
  assert.equal((await editCourse(e,b,id,body)).status,404);
  for(const patch of [{...body,studentId:'other'},{...body,language:'fr'},{...body,version:-1},{...body,room:99},{...body,name:'Bad\nName'},{...body,description:'x'.repeat(1001)}])assert.equal((await editCourse(e,a,id,patch)).status,400);
  assert.equal((await editCourse(e,a,'a'.repeat(43),body)).status,404);
  const writes=await Promise.all([editCourse(e,a,id,body),editCourse(e,a,id,{...body,name:'Concurrent'})]);assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);
  assert.equal((await editCourse(e,a,id,{version:0,reset:true})).status,409);
  const reset=await(await editCourse(e,a,id,{version:1,reset:true})).json();assert.deepEqual(reset.courseOverrides[id],{nameEn:null,nameZh:null,room:null,description:null,version:2});
  assert.equal((await editCourse(e,a,id,{version:1,language:'en',room:'stale'})).status,409);
});
test('an in-flight timetable sync preserves a course edit saved while NTU is being read',async()=>{
  const e=env(),auth=await login(e);const id=(await(await sync(e,auth)).json()).timetable.sessions[0].courseId;
  const provider=globalThis.fetch;let reached,release;
  const ready=new Promise(resolve=>{reached=resolve;}),pause=new Promise(resolve=>{release=resolve;});let held=false;
  globalThis.fetch=async(url,options)=>{if(!held&&new URL(url).href===portfolioTarget&&options.headers.get('Cookie')?.includes('portfolio_session=')){held=true;reached();await pause;}return provider(url,options);};
  try{const pending=sync(e,auth,{force:true});await ready;assert.equal((await editCourse(e,auth,id,{version:0,language:'en',name:'Saved during import'})).status,200);release();const result=await(await pending).json();assert.equal(result.courseOverrides[id].nameEn,'Saved during import');}
  finally{release();globalThis.fetch=provider;}
});
test('course mapping updates every meeting, separates courses and languages, and does not mutate imported rows',()=>{
  const rows=[[0,'09:10','10:00','Math','數學','A','ME1',null,'same'],[2,'10:20','12:10','Math','數學','B','ME1',null,'same'],[1,'09:10','10:00','Physics','物理','C','PH1',null,'other']];
  const mapped=applyCourseOverrides(rows,{same:{nameEn:'Eng Math',room:'114',description:'Notebook'}});
  for(const r of mapped.slice(0,2)){assert.equal(r[3],'Eng Math');assert.equal(r[4],'數學');assert.equal(r[5],'114');assert.equal(r[9],'Notebook');}
  assert.equal(mapped[2][3],'Physics');assert.equal(rows[0][3],'Math');assert.equal(rows[1][5],'B');
  assert.equal(courseIdentity({term:'115-1'},{code:'ME1',title:'Old'}),courseIdentity({term:'115-1'},{code:'ME1',title:'New',room:'114',day:4}));
  assert.equal(courseIdentity({term:'115-1'},{titleZh:'工程數學',title:'Math'}),courseIdentity({term:'115-1'},{titleZh:'工程數學',title:'工程數學'}));
  assert.notEqual(courseIdentity({term:'115-1'},{code:'ME1'}),courseIdentity({term:'115-2'},{code:'ME1'}));
});

test('theme adapter applies account overrides without confusing imported classes with personal events',()=>{
  const snapshot={sessions:[{day:0,start:550,end:600,title:'工程數學',titleEn:'Engineering Mathematics',titleZh:'工程數學',room:'Original',code:'ME1',courseId:'class-id'}]};
  const row=mapTimetable(snapshot,{'class-id':{nameEn:'Eng Math',room:'114',description:'Bring book'}})[0];
  assert.equal(row[3],'Eng Math');assert.equal(row[4],'工程數學');assert.equal(row[5],'114');assert.equal(row[7],null);assert.equal(row[8],'class-id');assert.equal(row[9],'Bring book');
  const reset=mapTimetable(snapshot,{'class-id':{nameEn:null,nameZh:null,room:null,description:null}})[0];assert.equal(reset[3],'Engineering Mathematics');assert.equal(reset[5],'Original');
});

test('class accents follow stable identity through meeting changes, reordering and display overrides',()=>{
  const rows=[[0,'09:10','10:00','Math','數學','A','ME1',null,'math-id'],[2,'10:20','12:10','Math','數學','B','ME1',null,'math-id']];
  const color=scheduleAccent(rows[0]);assert.equal(scheduleAccent(rows[1]),color);
  const edited=applyCourseOverrides([...rows].reverse(),{'math-id':{nameEn:'Renamed',nameZh:'新名稱',room:'114'}});
  assert.ok(edited.every(r=>scheduleAccent(r)===color));assert.ok(Number.isInteger(color)&&color>=0&&color<7);
});
test('personal event accents match case-insensitive names, independent of event IDs, dates and repeat rules',()=>{
  const row=title=>[0,'09:00','10:00',title,title,'','',{id:crypto.randomUUID(),title},undefined];
  const color=scheduleAccent(row('Study Group'));
  for(const title of ['study group','STUDY GROUP','  Study Group  ','Study   Group'])assert.equal(scheduleAccent(row(title)),color);
  const first=row('Study Group'),later=row('study group');later[0]=4;later[1]='14:00';later[7].frequency='weekly';assert.equal(scheduleAccent(first),scheduleAccent(later));
});
