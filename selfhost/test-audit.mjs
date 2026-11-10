import assert from 'node:assert/strict';
import {auditRequest,auditResponse,auditError} from './audit.mjs';

const secret='LEAK_SHOULD_NEVER_BE_LOGGED_123';
const read=auditRequest('read_file',{path:'/home/private/'+secret,offset:0,length:80});
assert(read.includes('offset=0') && read.includes('length=80'));
assert(!read.includes(secret) && !read.includes('/home/private'));
const write=auditRequest('write_file',{path:'/home/private/a.env',content:secret});
assert(write.includes('nội dung ẩn') && !write.includes(secret));
const terminal=auditRequest('start_process',{command:'curl -H Authorization:'+secret,timeout_ms:1200});
assert(terminal.includes('timeout_ms=1200') && !terminal.includes(secret));
const browser=auditRequest('browser_fill',{text:secret,selector:'#password'});
assert(!browser.includes(secret) && !browser.includes('password'));
const result=auditResponse({content:[{type:'text',text:secret},{type:'image',data:secret}]});
assert(result.includes('2 phần') && !result.includes(secret));
assert(!auditError('ENOENT '+secret).includes(secret));
console.log('PASS: allowlisted MCP audit summary and result counts; redacts secrets, paths, commands, prompts and raw responses');
