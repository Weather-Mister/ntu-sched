import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base=new URL('../public/skeleton/',import.meta.url);
const html=readFileSync(new URL('index.html',base),'utf8');
const css=readFileSync(new URL('mobile-overflow.css',base),'utf8');

test('viewport overflow guard loads after existing component styles',()=>{
  const files=['styles.css','desktop.css','mail-composer.css','settings.css','mobile-overflow.css'];
  const locations=files.map(file=>html.indexOf(`href="./${file}"`));
  assert.ok(locations.every(index=>index>=0));
  assert.deepEqual([...locations].sort((a,b)=>a-b),locations);
});

test('mobile page cannot extend horizontally, with a narrow-screen fallback',()=>{
  assert.match(css,/@media \(max-width:790px\)/);
  assert.match(css,/html, body\s*\{[^}]*max-width:100%;[^}]*overflow-x:hidden;[^}]*overflow-x:clip;/s);
  assert.match(css,/\.login-screen, \.app-shell, \.dashboard-hero, \.week-section,/);
  assert.match(css,/\.workspace, \.day-strip-row, \.day-strip, \.schedule-column,/);
  assert.match(css,/\.dashboard-hero \.topbar\s*\{[^}]*flex-wrap:wrap;/);
  assert.match(css,/\.week-section \.week-toolbar\s*\{[^}]*flex-wrap:wrap;/);
  assert.match(css,/\.section-head\s*\{[^}]*flex-wrap:wrap;/);
});

test('wide interactive content stays reachable within its own scroller',()=>{
  assert.match(css,/\.week-timetable-scroll\s*\{[^}]*overscroll-behavior-x:contain;/s);
  assert.match(css,/\.mailx-dialog \.mailx-mobile-tabs\s*\{[^}]*overscroll-behavior-x:contain;/s);
  assert.match(css,/\.campus-compose \.mailx-format-toolbar\s*\{[^}]*overscroll-behavior-x:contain;/s);
  assert.match(css,/\.mailx-dialog \.mailx-header-tools\s*\{[^}]*flex-wrap:wrap;/s);
  assert.match(css,/\.settings-hub \.settings-main\s*\{[^}]*overflow-x:clip;/s);
});

test('narrow settings cards use minmax tracks instead of intrinsic widths',()=>{
  assert.match(css,/@media \(max-width:600px\)/);
  assert.match(css,/\.settings-hub \.settings-install-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/s);
  assert.match(css,/\.settings-hub \.settings-connection-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/s);
  assert.match(css,/@media \(max-width:380px\)/);
});
