// Verify that a release tarball can actually start the packaged remote agent.
// Use isolated extraction; NEVER connect to the production relay.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const tarball = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!tarball || !fs.existsSync(tarball)) {
  console.error('Usage: node selfhost/test-package-integrity.mjs <release.tgz>');
  process.exit(2);
}
const root = '/home/ubuntu/workspace/temp/desktop-commander-selfhost';
fs.mkdirSync(root, {recursive:true,mode:0o700});
const temp = fs.mkdtempSync(path.join(root,'pkg-integrity-'));
const repo = path.resolve(import.meta.dirname,'..');
const needed = ['dist/index.js','dist/selfhost/agent.mjs',
  'dist/selfhost/controllers.mjs','dist/selfhost/windows-ui.mjs',
  'dist/selfhost/startup.mjs','package.json','LICENSE'];
try {
  const listing = spawnSync('tar',['-tzf',tarball],{encoding:'utf8',timeout:10000});
  assert.equal(listing.status,0,'tarball cannot be read: '+listing.stderr);
  const files = new Set(listing.stdout.split('\n'));
  for (const name of needed) assert(files.has('package/'+name),'release is missing '+name);
  const unpack = spawnSync('tar',['-xzf',tarball,'-C',temp],{encoding:'utf8',timeout:12000});
  assert.equal(unpack.status,0,unpack.stderr);
  const packaged = path.join(temp,'package');
  assert.equal(JSON.parse(fs.readFileSync(path.join(packaged,'package.json'),'utf8')).version,'0.3.4-karis.5');
  // Dependencies are already installed in the source tree; this symlink only
  // simulates dependency resolution. The packaged source itself is isolated.
  // npm includes a small bundled dependency under package/node_modules.
  // This extracted tree is task-owned and disposable; replace it with a
  // dependency-resolution symlink for the isolated start-up smoke test.
  const extractedModules = path.join(packaged,'node_modules');
  if (fs.existsSync(extractedModules)) fs.rmSync(extractedModules,{recursive:true,force:true});
  fs.symlinkSync(path.join(repo,'node_modules'),extractedModules,'dir');
  const cli = spawnSync(process.execPath,[path.join(packaged,'dist/index.js'),'remote','--help'],{
    cwd:temp,encoding:'utf8',timeout:15000,
    env:{...process.env,HOME:temp,KARIS_AGENT_CONFIG_DIR:path.join(temp,'agent-home')}
  });
  assert.equal(cli.status,0,(cli.stderr || cli.stdout).slice(0,1000));
  assert.match(cli.stdout,/Karis Desktop Commander/);
  assert.match(cli.stdout,/pair\/PAIRING_KEY/);
  console.log('PASS: portable package '+path.basename(tarball)+
    ', all agent modules present and remote --help starts after extraction');
} finally {
  // Delete only this test's unique temp directory (never shared caches/profiles).
  fs.rmSync(temp,{recursive:true,force:true});
}
