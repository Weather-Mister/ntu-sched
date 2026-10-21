import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const {document}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));

test('feature dialogs have accessible names and the controls required by their controllers',()=>{
 for(const dialog of document.querySelectorAll('dialog')){
  // Lesson/editor titles are filled when opened; their label targets must exist.
  const labels=dialog.getAttribute('aria-labelledby')?.trim().split(/\s+/)||[];
  assert.ok(dialog.getAttribute('aria-label')?.trim()||labels.length&&labels.every(id=>document.getElementById(id)),'dialog '+dialog.id+' needs a valid label');
 }
 for(const id of ['settings-dialog','mail-dialog','exam-editor-dialog','exam-editor-save','exam-editor-remove','exam-editor-reset','exam-editor-hide','task-form','tasks-retry','events-retry']){
  assert.ok(document.getElementById(id),'missing functional control '+id);
 }
});
test('inline browser policy confines scripts, connections and form submissions',()=>{
 const policy=document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content;
 assert.ok(policy,'the application shell needs an inline policy as well as HTTP headers');
 const directives=new Map(policy.split(';').map(part=>{const [name,...values]=part.trim().split(/\s+/);return [name,values];}));
 for(const name of ['script-src','connect-src'])assert.deepEqual(directives.get(name),["'self'"]);
 assert.deepEqual(directives.get('form-action'),["'none'"]);
});
