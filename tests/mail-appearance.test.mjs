import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mailDocumentAppearance} from '../public/skins/mail-appearance.mjs';
import {sanitizeMail} from '../src/mail-content.mjs';
test('dark email appearance preserves sandbox CSP, content, links and image URLs without inversion',()=>{
 const source=sanitizeMail('<p>Hello</p><table><tr><td>Room 101</td></tr></table><a href="https://ntu.edu.tw">Course</a><img src="https://example.com/image.png">',true);
 const dark=mailDocumentAppearance(source,'dark');
 const original=parseHTML(source).document,result=parseHTML(dark).document;
 assert.equal(result.body.innerHTML,original.body.innerHTML);
 assert.equal(result.querySelector('meta[http-equiv="Content-Security-Policy"]').content,original.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
 assert.equal(result.querySelector('img').src,original.querySelector('img').src);
 assert.match(result.querySelector('style[data-campus-mail-appearance]').textContent,/color-scheme:dark/);
 assert.doesNotMatch(dark,/filter\s*:\s*invert|<script/i);
 for(const theme of ['light','garden'])assert.equal(mailDocumentAppearance(source,theme),source);
});
