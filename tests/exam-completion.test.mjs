import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {examCompletionKey} from '../public/exam-completion.mjs';

test('sourced exams keep a completion identity through name and date edits',()=>{
  const key='import:["course-123","section-4","midterm",0]';
  const item={sourceKey:key,courseId:'course-123',title:'Midterm',date:'2026-10-17'};
  assert.equal(examCompletionKey(item),'exam:'+key);
  assert.equal(examCompletionKey({...item,title:'Updated midterm',date:'2026-10-24',manualRecord:{title:'Updated midterm'}}),'exam:'+key);
});
test('custom exams use a saved record ID, not the mutable title or date',()=>{
  const item={custom:true,sourceKey:null,title:'Quiz',manualRecord:{id:'record-1',title:'Quiz',date:'2026-10-17'}};
  assert.equal(examCompletionKey(item),'exam:custom:record-1');
  assert.equal(examCompletionKey({...item,title:'Quiz moved',manualRecord:{...item.manualRecord,date:'2026-10-25'}}),'exam:custom:record-1');
  assert.equal(examCompletionKey({...item,manualRecord:{id:'record-2'}}),'exam:custom:record-2');
});
test('unidentified exams are not incorrectly marked complete',()=>{
  assert.equal(examCompletionKey(null),null);
  assert.equal(examCompletionKey({}),null);
  assert.equal(examCompletionKey({custom:true,title:'unsaved exam'}),null);
});
test('only exams gain checkmarks; announcements and existing assignments are unchanged',()=>{
  const js=readFileSync(new URL('../public/skeleton/app.mjs',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/skeleton/exams.css',import.meta.url),'utf8');
  assert.match(js,/addCoolCheck\(card,examCompletionKey\(item\),coolDone,saveCoolChecks,actions\)/);
  assert.match(js,/if\(item\.kind==='assignment'\)addCoolCheck\(card,item\.id,coolDone,saveCoolChecks\)/);
  const announce=js.slice(js.indexOf("if(coolView==='announcements'){",js.indexOf("function renderLiveDeadlines(")),js.indexOf("  $('cool-refresh').disabled=false;",js.indexOf("function renderLiveDeadlines(")));
  assert.doesNotMatch(announce,/addCoolCheck/);
  assert.match(css,/\.exam-card \.exam-card-actions/);
  assert.match(js,/coolDoneKey\(current\.studentNumber\)/);
});
