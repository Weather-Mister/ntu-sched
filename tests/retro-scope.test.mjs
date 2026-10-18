import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeState,scopeTrace,taipeiClock} from '../public/skins/retro-scope.mjs';
test('retro clock displays Taipei time with distinct seconds and milliseconds regardless of host timezone',()=>{
 assert.deepEqual(taipeiClock(Date.parse('2026-10-18T03:59:50.785Z')),{time:'11:59',seconds:'.50',milliseconds:'.785'});
 assert.deepEqual(taipeiClock(Date.parse('2026-10-18T16:00:01.002Z')),{time:'00:00',seconds:'.01',milliseconds:'.002'});
});
test('interval monitor follows real next-start and live-end boundaries, including sub-minute time',()=>{
 const now=Date.parse('2026-10-18T10:00:00+08:00');
 assert.equal(scopeState({target:now+30000,live:false},now).value,'30s');
 assert.equal(scopeState({target:now+61*60000,live:false},now).value,'1h01');
 assert.equal(scopeState({target:now+3600000,live:true},now).mode,'LIVE END');
 assert.equal(scopeState({target:now+3600000,live:false},now).mode,'NEXT START');
 for(const boundary of [null,{target:NaN},{target:now},{target:now-1}])assert.equal(scopeState(boundary,now).active,false);
});
test('waveform is deterministic, continuous in phase, finite, and compresses towards the boundary',()=>{
 const active={active:true,live:false,minutes:360};
 const far=scopeTrace(active),near=scopeTrace({...active,minutes:1});
 assert.equal(far,scopeTrace(active));assert.notEqual(far,scopeTrace(active,.1));
 assert.ok(near.split('L').length>far.split('L').length);
 for(const path of [far,near,scopeTrace({active:false}),scopeTrace({...active,minutes:0},10000)]){
  assert.match(path,/^M0\.0 /);assert.match(path,/L200\.0 /);assert.doesNotMatch(path,/NaN|Infinity/);
  const ys=[...path.matchAll(/[ML][\d.]+ ([-\d.]+)/g)].map(m=>Number(m[1]));assert.ok(ys.every(y=>y>=0&&y<=42));
 }
});
