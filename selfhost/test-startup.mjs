import assert from 'node:assert/strict';
import { readStartup, setStartup } from './startup.mjs';

// Read-only tests: never create or disable an actual OS startup job.
const unknown=readStartup({platform:'freebsd'});
assert.equal(unknown.supported,false);
assert.equal(unknown.enabled,null);
assert.throws(()=>setStartup('delete',{platform:'win32'}),/Invalid startup action/);
assert.throws(()=>setStartup('disable',{platform:'linux',protectedDevice:true}),/service riêng/);
assert.throws(()=>setStartup('enable',{platform:'freebsd'}),/hỗ trợ/);

const vps=readStartup({platform:'linux',protectedDevice:true});
assert.equal(vps.managed,true);
assert.equal(vps.mode,'system');
if(vps.supported){
 assert.equal(typeof vps.enabled,'boolean');
 assert.equal(vps.configured,true);
}
console.log('PASS: startup OS status read-only, unsupported platforms fail closed, system agent cannot be toggled');
