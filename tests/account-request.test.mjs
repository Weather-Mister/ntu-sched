import test from 'node:test';
import assert from 'node:assert/strict';
import {CampusAccount} from '../public/campus-account.mjs';

test('network and non-JSON gateway failures give readable errors without discarding the account or replaying writes',async()=>{
 const original=globalThis.fetch,account=new CampusAccount();account.current={studentNumber:'b12345678',csrfToken:'test'};const current=account.current;let count=0;
 try{
  globalThis.fetch=async()=>{count++;throw new TypeError('Failed to fetch');};
  await assert.rejects(account.request('mail/outbox',{method:'POST',body:'{}'}),e=>e.code==='network_unavailable'&&/internet connection/.test(e.message));
  assert.equal(count,1);assert.equal(account.current,current);
  globalThis.fetch=async()=>new Response('<html>Bad gateway</html>',{status:502});
  await assert.rejects(account.request('mail/list'),e=>e.code==='temporarily_unavailable'&&e.status===502&&!/JSON|Unexpected token/.test(e.message));
  assert.equal(account.current,current);
  const abort=new DOMException('Cancelled','AbortError');globalThis.fetch=async()=>{throw abort;};
  await assert.rejects(account.request('auth/login'),e=>e===abort);
 }finally{globalThis.fetch=original;}
});
