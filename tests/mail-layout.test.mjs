import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

const base=new URL('../public/skeleton/',import.meta.url);
const html=readFileSync(new URL('index.html',base),'utf8');
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
  'mailx-top-action mailx-official-link','mailx-icon-button mailx-refresh-button'
 ]);
 assert.equal(direct.at(-1).id,'mail-close');
 assert.match(mail,/top\.after\(pushButton\)/);
 assert.match(mail,/pushButton\.className='mailx-top-action'/);
 assert.ok(css.includes('.mailx-dialog .mailx-header-tools'));
 assert.ok(css.includes('margin-left:auto;min-width:0'));
});

test('refresh, notifications and official mail remain accessible on mobile',()=>{
 assert.match(css, /grid-template-areas:"brand close" "compose compose" "tools tools"/);
 assert.match(css, /\.mailx-dialog \.mailx-topbar \.mailx-refresh-button\{display:grid\}/);
 assert.match(css, /\.mailx-dialog \.mailx-header-tools \.mailx-official-link\{\s*display:grid/);
 assert.match(css, /\.mailx-dialog \.mailx-header-tools\{\s*justify-content:flex-end;gap:6px;max-width:100%/);
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
