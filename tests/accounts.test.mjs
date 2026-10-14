import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.mjs';
import { decryptAuthorization, encryptAuthorization } from '../src/security.mjs';

const APP = 'https://campus.example';
const KEY = '12'.repeat(32); // Synthetic test key, never a deployment secret.
const realFetch = globalThis.fetch;
let providerCalls = [], failProvider = false, redirectOutside = false, wrongIdentity = false;
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://wmail1.cc.ntu.edu.tw');
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
  const DB = new D1(); DB.sqlite.exec(readFileSync(new URL('../migrations/0001_accounts.sql', import.meta.url), 'utf8'));
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
