import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom/worker';
import { initLiveTimetable } from '../public/live-timetable.mjs';
import { CampusAccount } from '../public/campus-account.mjs';

const snapshot = (title, syncedAt = Date.now()) => ({ timetable: { sessions: [{ title, day: 0, start: 550, end: 600, room: '', code: '' }], warnings: [], term: '115-1', syncedAt }, connectionStatus: 'authorized', checkIntervalMs: 900000 });
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(client) {
  const { document, window } = parseHTML('<html><body><section class="schedule-panel"><div class="schedule-meta"></div></section></body></html>');
  document.visibilityState = 'visible';
  const originals = new Map(['document', 'window', 'navigator', 'CustomEvent', 'setInterval', 'setTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const timers = [], timeouts = [];
  for (const [key, value] of Object.entries({ document, window, navigator: { onLine: true }, CustomEvent: window.CustomEvent, setTimeout: fn => { timeouts.push(fn); return timeouts.length; }, setInterval: fn => { timers.push(fn); return timers.length; } })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  let opened = 0, expired = 0; const updates = [], clears = [];
  window.addEventListener('campus-live-timetable', e => updates.push(e.detail.timetable));
  window.addEventListener('campus-live-timetable-clear', () => clears.push(true));
  const controller = initLiveTimetable({ client, openLogin: () => opened++, onSessionExpired: () => expired++ });
  return { controller, document, window, timers, timeouts, updates, clears, get opened() { return opened; }, get expired() { return expired; }, cleanup() { for (const [key, value] of originals) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } } };
}
test('refresh restores saved timetable without another NTU login while fresh', async () => {
  let syncs = 0; const f = fixture({ timetable: async () => snapshot('Saved course'), syncTimetable: async () => { syncs++; } });
  try { f.controller.setAccount({ studentNumber: 'b12345678' }); await settle(); assert.equal(f.updates[0].sessions[0].title, 'Saved course'); assert.equal(syncs, 0); assert.match(f.document.getElementById('timetable-sync-status').textContent, /Last checked/); }
  finally { f.cleanup(); }
});
test('first connection syncs automatically; switching owners ignores a late previous response', async () => {
  let resolveA; const a = new Promise(resolve => { resolveA = resolve; }); let reads = 0;
  const f = fixture({ timetable: async () => ++reads === 1 ? a : snapshot('Second owner'), syncTimetable: async () => snapshot('Should not render') });
  try {
    f.controller.setAccount({ studentNumber: 'b12345678' }); f.controller.setAccount({ studentNumber: 'r23456789' }); await settle();
    resolveA(snapshot('Previous owner')); await settle();
    assert.deepEqual(f.updates.map(t => t.sessions[0].title), ['Second owner']); assert.equal(f.clears.length, 1);
    f.controller.setAccount(null); assert.equal(f.clears.length, 2);
  } finally { f.cleanup(); }
});
test('stale timetable is shown immediately and checked for changes automatically', async () => {
  let syncs = 0; const f = fixture({ timetable: async () => snapshot('Old course', 1), syncTimetable: async () => { syncs++; return snapshot('Changed course'); } });
  try { f.controller.setAccount({ studentNumber: 'b12345678' }); await settle(); assert.equal(syncs, 1); assert.deepEqual(f.updates.map(t => t.sessions[0].title), ['Old course', 'Changed course']); f.timers[0](); await settle(); assert.equal(syncs, 1); }
  finally { f.cleanup(); }
});
test('automatic checks preserve a manually chosen timetable until Show live timetable is clicked', async () => {
  const f = fixture({ timetable: async () => snapshot('Live course'), syncTimetable: async () => snapshot('New live course') });
  try {
    f.controller.setAccount({ studentNumber: 'b12345678' }); await settle();
    f.window.dispatchEvent(new f.window.CustomEvent('campus-timetable-source', { detail: { source: 'import' } }));
    const show = [...f.document.querySelectorAll('button')].find(n => n.textContent === 'Show live timetable'); assert.equal(show.hidden, false);
    show.click(); assert.equal(f.updates.length, 2); assert.equal(show.hidden, true);
  } finally { f.cleanup(); }
});
test('transient sync failure preserves displayed classes and does not retry in a loop', async () => {
  let attempts = 0; const f = fixture({ timetable: async () => snapshot('Saved course', 1), syncTimetable: async () => { attempts++; throw new Error('NTU unavailable'); } });
  try { f.controller.setAccount({ studentNumber: 'b12345678' }); await settle(); f.timers[0](); await settle(); assert.equal(attempts, 1); assert.equal(f.updates.length, 1); assert.equal(f.updates[0].sessions[0].title, 'Saved course'); }
  finally { f.cleanup(); }
});
test('a late expired request cannot clear the next student account in the client', async () => {
  const original = globalThis.fetch; let respond;
  globalThis.fetch = () => new Promise(resolve => { respond = resolve; });
  try {
    const client = new CampusAccount(); client.current = { studentNumber: 'b12345678', csrfToken: 'first' };
    const request = client.timetable(); const next = { studentNumber: 'r23456789', csrfToken: 'next' }; client.current = next;
    respond(Response.json({ error: { code: 'login_required', message: 'expired' } }, { status: 401 }));
    await assert.rejects(request); assert.equal(client.current, next);
  } finally { globalThis.fetch = original; }
});

test('a temporary sign-in pause retains the original sync error and disables repeated submissions', async () => {
  let attempts = 0;
  const reason = 'NTU returned an unexpected sign-in destination.';
  const f = fixture({ timetable: async () => snapshot('Saved course'), syncTimetable: async () => {
    attempts++;
    if (attempts === 1) throw new Error(reason);
    throw Object.assign(new Error('Paused'), { code: 'timetable_try_later', retryAfterSeconds: 60 });
  } });
  try {
    f.controller.setAccount({ studentNumber: 'b12345678' }); await settle();
    const button = f.document.getElementById('timetable-sync');
    button.click(); await settle(); button.click(); await settle();
    const notice = f.document.querySelector('p.notice');
    assert.ok(notice.textContent.includes(reason));
    assert.match(notice.textContent, /Sign-in checks resume at/);
    assert.equal(button.disabled, true);
    button.click(); f.timers[0](); await settle();
    assert.equal(attempts, 2); assert.equal(f.timeouts.length, 1);
    assert.equal(f.updates[0].sessions[0].title, 'Saved course');
  } finally { f.cleanup(); }
});
