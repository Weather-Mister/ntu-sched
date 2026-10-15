import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const skeleton = new URL('../public/skeleton/', import.meta.url);
const html = readFileSync(new URL('index.html', skeleton), 'utf8');
const css = readFileSync(new URL('styles.css', skeleton), 'utf8');
const js = readFileSync(new URL('app.mjs', skeleton), 'utf8');

test('UI skeleton and account task JavaScript parse as browser modules', () => {
  for (const path of ['app.mjs','live-source.mjs','custom-events.mjs','../account-tasks.mjs','../account-announcements.mjs','../course-model.mjs','../account-events.mjs','../event-model.mjs','../campus-account.mjs']) {
    const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL(path,skeleton))],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
  assert.match(html, /src="\.\/app\.mjs"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.doesNotMatch(html, /https?:\/\/[^"]+\.js/);
});

test('account-connected skeleton confines browser requests to its own origin and renders text safely', () => {
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /type="password"/);
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
