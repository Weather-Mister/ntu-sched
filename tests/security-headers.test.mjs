import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';

const origin='https://campus.example';
test('API success, unauthenticated responses, errors and legacy redirects carry browser protections',async()=>{
 const env={APP_ORIGIN:origin,DB:{prepare(){throw new Error('Unexpected database read');}}};
 for(const [path,options,status] of [
  ['/api/health',{},200],
  ['/api/mail/list',{},401],
  ['/api/tasks',{headers:{Origin:'https://untrusted.example'}},403],
  ['/api/auth/me',{headers:{Cookie:'__Host-campus_week='+'a'.repeat(43)}},503],
  ['/skeleton/?preview=settings',{},308]
 ]){
  const response=await worker.fetch(new Request(origin+path,options),env);
  assert.equal(response.status,status);
  assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
  assert.equal(response.headers.get('X-Frame-Options'),'DENY');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
  assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  assert.match(response.headers.get('Permissions-Policy'),/camera=\(\)/);
  if(path.startsWith('/api/'))assert.equal(response.headers.get('Cache-Control'),'no-store, private');
  else assert.equal(response.headers.get('Location'),origin+'/?preview=settings');
 }
});

test('Cloudflare static asset policy blocks external framing and preserves the mail viewer and same-origin phone preview',()=>{
 const source=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
 const rules=source.split(/\r?\n/).filter(line=>line.trim()&&!line.startsWith('#'));
 assert.equal(rules[0],'/*');
 const headers=new Headers(rules.slice(1).map(line=>{assert.match(line,/^\s+/);const colon=line.indexOf(':');return [line.slice(0,colon).trim(),line.slice(colon+1).trim()];}));
 assert.equal(headers.get('X-Frame-Options'),'SAMEORIGIN');
 assert.equal(headers.get('Strict-Transport-Security'),'max-age=31536000');
 const directives=new Map(headers.get('Content-Security-Policy').split(';').map(part=>{const [name,...values]=part.trim().split(/\s+/);return [name,values];}));
 assert.deepEqual(directives.get('frame-ancestors'),["'self'"]);
 assert.deepEqual(directives.get('script-src'),["'self'"]);
 assert.deepEqual(directives.get('connect-src'),["'self'"]);
 assert.deepEqual(directives.get('frame-src'),["'self'",'blob:']);
 assert.deepEqual(directives.get('img-src'),["'self'",'data:','https:']);
 assert.deepEqual(directives.get('object-src'),["'none'"]);
 assert.deepEqual(directives.get('form-action'),["'none'"]);
});
