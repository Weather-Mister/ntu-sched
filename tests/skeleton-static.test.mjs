import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import test from 'node:test';

const skeleton = new URL('../public/skeleton/', import.meta.url);
const html = readFileSync(new URL('index.html', skeleton), 'utf8');
const css = readFileSync(new URL('styles.css', skeleton), 'utf8');
const js = readFileSync(new URL('app.mjs', skeleton), 'utf8');

test('UI skeleton JavaScript parses without dependencies', () => {
  assert.doesNotThrow(() => new Script(js, { filename: 'public/skeleton/app.mjs' }));
  assert.match(html, /src="\.\/app\.mjs"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.doesNotMatch(html, /https?:\/\/[^"]+\.js/);
});

test('standalone preview never accesses real accounts or network APIs', () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.doesNotMatch(html, /type="password"/);
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(js, /\.innerHTML\s*=|document\.write\s*\(/);
});

test('skeleton has account gates, bilingual controls, week navigation, tasks, and settings', () => {
  for (const id of ['login-screen','app-screen','preview-profile','settings-dialog','switch-account','log-out','language-en','language-zh','previous-week','next-week','choose-date','jump-today','schedule-list','cool-list','task-form','todo-list']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing ' + id);
  }
  assert.match(html, /data-settings-tab="widgets"/);
  assert.match(html, /Hanzi Steps/);
  assert.match(css, /\.settings-choices\{display:none\}/);
  assert.doesNotMatch(html, /file-transfer|transfer-section|placesDialog|notification-bell/);
});
