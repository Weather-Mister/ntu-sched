import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

const base=new URL('../public/skeleton/',import.meta.url);
const html=readFileSync(new URL('../index.html',base),'utf8');
const mail=readFileSync(new URL('mail.mjs',base),'utf8');
const css=readFileSync(new URL('styles.css',base),'utf8');
const {document}=parseHTML(html);

test('mail header keeps Compose and student badge on left and X last on right',()=>{
 const header=document.querySelector('#mail-dialog .mailx-topbar');
 const direct=[...header.children];
 assert.deepEqual(direct.map(el=>el.className),[
  'mailx-brand','mailx-compose-main','mailx-account-switch','mailx-header-tools','mailx-icon-button mailx-close'
 ]);
 assert.equal(header.querySelector('.mailx-demo-badge'),null);
 const group=header.querySelector('.mailx-header-tools');
 assert.deepEqual([...group.children].map(el=>el.className),[
  'mailx-icon-button mailx-refresh-button','mailx-top-action mailx-official-link'
 ]);
 assert.equal(direct.at(-1).id,'mail-close');
 assert.match(mail,/refreshButton\.before\(pushButton\)/);
 assert.match(mail,/pushButton\.className='mailx-top-action campus-mail-push'/);
 assert.ok(css.includes('.mailx-dialog .mailx-header-tools'));
 assert.ok(css.includes('margin-left:auto;min-width:0'));
});

test('phone mail controls share one aligned row without page overflow',()=>{
 const mobile=readFileSync(new URL('mobile-overflow.css',base),'utf8');
 assert.match(mobile,/grid-template-areas:"brand close" "compose tools"/);
 assert.match(mobile,/\.mailx-dialog \.mailx-header-tools\s*\{[^}]*flex-wrap:nowrap;/s);
 assert.match(mobile,/\.mailx-dialog \.mailx-header-tools \.mailx-refresh-button\s*\{[^}]*display:grid;/s);
 assert.match(mobile,/\.mailx-dialog \.mailx-header-tools \.mailx-official-link\s*\{[^}]*white-space:nowrap;/s);
 assert.match(mobile,/\.mailx-dialog \.mailx-label-desktop\s*\{display:none\}/);
 assert.match(mobile,/\.mailx-dialog \.mailx-label-mobile\s*\{display:inline\}/);
 assert.match(mail,/mobileEnable:'Alerts off',mobileDisable:'Alerts on'/);
 assert.match(mail,/mobileEnable:'通知關閉',mobileDisable:'通知開啟'/);
 assert.match(mail,/pushButton\.setAttribute\('aria-label',pushLabel\)/);
 assert.match(mail,/officialLink\.setAttribute\('aria-label',w\(\)\.officialMail\)/);
});

test('external images action joins Translate in message toolbar and still loads via the original endpoint',()=>{
 assert.match(mail,/const imagesControl=button\(w\(\)\.images,\(\)=>void read\(message,true\)\)/);
 assert.match(mail,/imagesControl\.className='campus-mail-images'/);
 assert.match(mail,/tools\.prepend\(imagesControl\)/);
 assert.match(mail,/tools\.prepend\(control\)/);
 assert.doesNotMatch(mail,/head\.append\(button\(w\(\)\.images/);
 assert.match(mail,/\.\.\.\(images\?\{images:'1'\}:\{\}\)/);
 assert.match(css,/\.mailx-reader-toolbar-buttons \.campus-mail-images\{/);
 assert.match(css,/\.mailx-reader-toolbar-buttons \.campus-mail-images:hover/);
 assert.match(css,/\.mailx-dialog \.mailx-reader-toolbar-buttons\{width:100%;justify-content:flex-start\}/);
});
