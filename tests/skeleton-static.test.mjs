import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseHTML } from 'linkedom';

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

test('main dashboard reload button refreshes the whole site instead of only data', () => {
  assert.match(html, /id="page-refresh"[^>]*aria-label="Reload site"/);
  assert.match(js, /\$\('page-refresh'\)\.addEventListener\('click',\(\)=>window\.location\.reload\(\)\)/);
  assert.match(js, /\$\('page-refresh'\)\.title=t\('reloadSite'\)/);
  assert.match(js, /reloadSite:'Reload site'/);
  assert.match(js, /reloadSite:'重新載入網站'/);
  assert.match(js, /\$\('cool-refresh'\)\.addEventListener/);
  assert.match(js, /\$\('live-timetable-refresh'\)\.addEventListener/);
});

test('Lucide settings and refresh artwork is bundled in local SVG symbols', () => {
  const {document}=parseHTML(html);
  const settings=document.querySelector('#i-settings');
  const refresh=document.querySelector('#i-refresh');
  assert.ok(settings);
  assert.ok(refresh);
  assert.equal(settings.getAttribute('viewBox'),'0 0 24 24');
  assert.equal(refresh.getAttribute('viewBox'),'0 0 24 24');
  assert.ok(settings.querySelector('path').getAttribute('d').startsWith('M9.671 4.136'));
  assert.ok(refresh.querySelector('path').getAttribute('d').startsWith('M3 12a9 9'));
  for(const [button,icon] of [
    ['page-refresh','i-refresh'],
    ['open-settings','i-settings'],
    ['cool-refresh','i-refresh']
  ]) {
    assert.equal(document.querySelector('#'+button+' use')?.getAttribute('href'),'#'+icon);
  }
  assert.equal(document.querySelector('.mailx-refresh-button use')?.getAttribute('href'),'#i-refresh');
  assert.match(readFileSync(new URL('settings.mjs',skeleton),'utf8'),/use\.setAttribute\('href','#i-refresh'\)/);
  const notice=readFileSync(new URL('LUCIDE-LICENSE.txt',skeleton),'utf8');
  assert.match(notice,/ISC License/);
  assert.match(notice,/Lucide Icons and Contributors/);
  assert.match(notice,/Permission to use, copy, modify, and\/or distribute/);
  assert.match(html,/License: \.\/LUCIDE-LICENSE\.txt/);
});

test('exam status dropdown is removed and unavailable classes use the reddish feed footer',()=>{
  const examStyles=readFileSync(new URL('exams.css',skeleton),'utf8');
  const {document}=parseHTML(html);
  const footer=document.getElementById('cool-preview-note');
  assert.equal(footer.tagName,'DIV','the warning contains a valid list of classes');
  assert.match(js,/examUnavailableCourses\(examStore\.courses,examStore\.entries/);
  assert.match(js,/footer\.classList\.add\('exam-warning'\)/);
  assert.match(js,/footer\.hidden=true/);
  assert.doesNotMatch(js,/exam-course-status|Course status \/ choose sections/);
  assert.match(examStyles,/\.preview-footnote\.exam-warning\{/);
  assert.match(examStyles,/\.preview-footnote\.exam-warning\[hidden\]\{display:none\}/);
  assert.match(js,/chooseSection:'Choose your class',section:'Class'/);
  assert.match(js,/chooseSection:'選擇你的課程班別',section:'班別'/);
  assert.match(html,/data-i18n="chooseSection">Choose your class</);
  assert.match(js,/const history=node\('details','exam-past'\)/);
});

test('custom exams and imported overrides use a separate account-backed editor and compact warning',()=>{
  const examStyles=readFileSync(new URL('exams.css',skeleton),'utf8');
  const editor=readFileSync(new URL('exam-editor.mjs',skeleton),'utf8');
  const {document}=parseHTML(html);
  for(const id of ['exam-editor-dialog','exam-editor-name','exam-editor-kind','exam-editor-class','exam-editor-date','exam-editor-week','exam-editor-notes','exam-editor-save','exam-editor-remove','exam-editor-reset']){
    assert.ok(document.getElementById(id),'missing exam editor field '+id);
  }
  assert.match(js,/createExamEditor\(/);
  assert.match(js,/examFeed\(examStore.entries,taipeiToday\(\),examEditor.items\(\)\)/);
  assert.match(js,/examEditor\.open\(item\)/);
  assert.match(js,/examEditor\.bind\(current\)/);
  assert.match(js,/const details=node\('details','exam-warning-disclosure'\)/);
  assert.match(js,/details.open=missingExamsOpen/);
  assert.match(examStyles,/padding:5px 8px;margin:9px 0 0/);
  assert.match(examStyles,/\.exam-warning-disclosure>summary\{/);
  assert.match(examStyles,/\.exam-editor-fields\{/);
  assert.match(editor,/normalizeCustomExam/);
  assert.match(editor,/store.remove\(editing.manualRecord\)/);
});

test('phone exam tabs and date inputs cannot overlap, with Add exam inline',()=>{
  const examStyles=readFileSync(new URL('exams.css',skeleton),'utf8');
  const mobileOverflow=readFileSync(new URL('mobile-overflow.css',skeleton),'utf8');
  assert.match(examStyles,/\.cool-column \.cool-panel-header \.cool-view-switch\{\s*display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(examStyles,/\.cool-column \.cool-panel-header \.cool-view-switch button\{[\s\S]*?white-space:normal;[\s\S]*?overflow-wrap:anywhere;/);
  assert.match(js,/const headingRow=node\('div','exam-list-heading'\)/);
  assert.match(js,/headingRow\.append\(heading,addExamButton\);list\.append\(headingRow\)/);
  assert.doesNotMatch(js,/list\.append\(addExamButton\)/);
  assert.match(examStyles,/\.exam-list-heading\{display:flex;align-items:center;justify-content:space-between/);
  assert.match(examStyles,/@media\(max-width:600px\)\{\s*\.exam-editor-fields\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(examStyles,/\.exam-editor-fields input\{display:block;width:100%;max-width:100%;min-width:0;/);
  assert.match(mobileOverflow,/@media \(max-width:790px\) \{[\s\S]*?\.event-dialog \.event-fields \{[\s\S]*?display:block;/);
  assert.match(mobileOverflow,/\.event-dialog \.event-fields input,[\s\S]*?\.event-dialog #event-until \{[\s\S]*?box-sizing:border-box;/);
});

test('iOS event sheet constrains native picker boxes and disallows horizontal scrolling',()=>{
  const mobile=readFileSync(new URL('mobile-overflow.css',skeleton),'utf8');
  assert.match(mobile,/\.event-dialog \{[\s\S]*?inline-size:min\(520px,calc\(100vw - 24px\)\);[\s\S]*?overflow-x:hidden;/);
  assert.match(mobile,/\.event-dialog \.event-form \{[\s\S]*?inline-size:100%;[\s\S]*?overflow-x:clip;/);
  assert.match(mobile,/\.event-dialog \.event-fields>div \{[\s\S]*?inline-size:100%;[\s\S]*?overflow-x:clip;/);
  assert.match(mobile,/\.event-dialog \.event-fields input,[\s\S]*?min-inline-size:0;[\s\S]*?max-inline-size:100%;/);
  assert.match(mobile,/input\[type="date"\]::-webkit-date-and-time-value/);
  assert.match(mobile,/input\[type="time"\]::-webkit-datetime-edit/);
  // iOS WebKit bug 301648: padding on native date/time hosts overflows 100%.
  assert.match(mobile,/\.event-dialog \.event-form input\[type="date"\],[\s\S]*?\.event-dialog \.event-form input\[type="time"\],[\s\S]*?padding:0;/);
  assert.match(mobile,/\.exam-editor-dialog \.exam-editor-form input\[type="date"\]/);
});
