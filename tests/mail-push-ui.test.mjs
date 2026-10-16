import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const mail=readFileSync(new URL('../public/skeleton/mail.mjs',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/mail-sw.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');

test('mail preloads subscription and VAPID key before the enable click',()=>{
 const prepare=mail.slice(mail.indexOf('async function initPush()'),mail.indexOf('async function togglePush()'));
 const click=mail.slice(mail.indexOf('async function togglePush()'),mail.indexOf('function open()'));
 assert.match(prepare,/const data=await request\('push'\)/);
 assert.match(prepare,/pushKey=Uint8Array\.from/);
 assert.match(prepare,/pushSubscription=sub/);
 assert.match(click,/pushSubscription\|\|await registration\.pushManager\.subscribe/);
 assert.ok(click.indexOf('registration.pushManager.subscribe')<click.indexOf("request('push',{method:'POST'"));
 assert.doesNotMatch(click,/await request\('push'\)(?!.*method:)/);
});
test('a background 401 may not silently revoke a valid push subscription',()=>{
 assert.match(sw,/if\(response\.ok&&\(await response\.json\(\)\)\.studentNumber!==value\.studentNumber\)return/);
 assert.doesNotMatch(sw,/unsubscribe\(/);
 assert.match(sw,/showNotification\(/);
});
test('scheduled notifications do not depend on composed mail or timetable jobs',()=>{
 const scheduled=worker.slice(worker.indexOf('async scheduled(_event, env, ctx)'));
 assert.match(scheduled,/ctx\.waitUntil\(processDueComposeJobs\(env\)\)/);
 assert.match(scheduled,/ctx\.waitUntil\(refreshMailNotifications\(env\)\)/);
 assert.doesNotMatch(scheduled,/await processDueComposeJobs\(env\)/);
});
