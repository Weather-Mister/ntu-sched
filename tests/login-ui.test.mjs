import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/skeleton/app.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/skeleton/styles.css',import.meta.url),'utf8');
const {document}=parseHTML(html);

test('NTU sign-in is the main form instead of a demo-first flow or modal',()=>{
  const screen=document.getElementById('login-screen');
  assert.equal(screen.dataset.authCheck,'checking');
  assert.ok(screen.querySelector('#live-login-form'));
  assert.ok(screen.querySelector('input[name="studentNumber"][autocomplete="username"]'));
  assert.ok(screen.querySelector('input[name="password"][autocomplete="current-password"]'));
  assert.ok(screen.querySelector('button[type="submit"]'));
  assert.equal(document.querySelectorAll('#live-login-form').length,1);
  assert.equal(document.getElementById('live-login-dialog'),null);
  assert.equal(document.getElementById('live-restore'),null);
  assert.ok(screen.querySelector('details.login-preview #preview-profile'));
  assert.ok(screen.querySelector('details.login-preview #enter-preview'));
  assert.ok(css.includes('.login-screen[data-auth-check="checking"] .login-auth-content{display:none}'));
  assert.ok(css.includes('.login-screen[data-auth-check="ready"] .login-checking{display:none}'));
});

test('an existing session is checked on normal startup, and preview links remain explicitly accessible',()=>{
  assert.match(js,/async function restoreLive\(\)/);
  assert.match(js,/const current=await account\.restore\(\)/);
  assert.match(js,/if\(current\)startLive\(current\)/);
  assert.match(js,/finally\{\s*\$\('login-screen'\)\.dataset\.authCheck='ready';/);
  assert.match(js,/if\(new URL\(location\.href\)\.searchParams\.get\('preview'\)==='settings'\)/);
  assert.match(js,/else\{[\s\S]*?void restoreLive\(\);\s*\}\s*$/);
  assert.doesNotMatch(js,/\$\('live-restore'\)|\$\('live-login-dialog'\)/);
  assert.match(js,/function sessionExpired\(\)[\s\S]*?showLoginMessage\(/);
  assert.match(js,/function leavePreview\(\)[\s\S]*?\$\('live-login-number'\)\.focus\(\);/);
});

test('login stays accessible in English and Traditional Chinese and never stores passwords on the page',()=>{
  assert.ok(html.includes('data-i18n="checkingSession"'));
  assert.ok(js.includes("checkingSession:'Checking your session…'"));
  assert.ok(js.includes("checkingSession:'正在檢查登入狀態…'"));
  assert.ok(js.includes("tryPreview:'Try a sample timetable'"));
  assert.match(js,/pass\.value='';/);
});
