import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { run, digest } from '../../scripts/core/sync.mjs';
function fixture() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-sync-test-'));
  const upstream = path.join(scratch, 'source'), root = path.join(scratch, 'target');
  fs.mkdirSync(upstream); fs.mkdirSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: upstream, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  git('init', '-b', 'main'); git('remote', 'add', 'origin', 'https://github.com/slawrensen/hwinfo-streamdeck.git');
  // Fixtures inherit the human identity too. Never set author/committer overrides.
  const expected = 'slawrensen <19673454+slawrensen@users.noreply.github.com>';
  for (const kind of ['GIT_AUTHOR_IDENT','GIT_COMMITTER_IDENT']) assert.equal(git('var',kind).split('>')[0]+'>',expected);
  fs.mkdirSync(path.join(upstream,'src')); fs.writeFileSync(path.join(upstream,'src/a.ts'),'export const n = 1;\n'); fs.writeFileSync(path.join(upstream,'port'),'A');
  git('add','.'); git('commit','-m','Fixture A'); const pin = git('rev-parse','HEAD');
  const bytes = fs.readFileSync(path.join(upstream,'src/a.ts')), hash = digest(bytes);
  const manifest = { schema:1,upstream:{repository:'slawrensen/hwinfo-streamdeck',commit:pin},rewrites:[],files:[{source:'src/a.ts',destination:'src/a.ts',sourceSha256:hash,rewriteCounts:[],rewrittenSha256:hash,patch:null,postPatchSha256:hash}],copiedTests:[],ports:[{source:'port',upstreamSha256:digest('A'),reviewedThroughSha256:digest('A'),disposition:'reviewed',destinations:['scripts/port.mjs'],reason:'fixture',evidence:['fixture']}],runtimePins:{},ownedRegions:[{path:'src',recursive:true}],ownedExclusions:[] };
  fs.writeFileSync(path.join(root,'core-sync.json'),JSON.stringify(manifest,null,2)+'\n'); fs.writeFileSync(path.join(root,'package-lock.json'),'{}'); fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({scripts:{test:'node scripts/core/test.mjs'}})); fs.mkdirSync(path.join(root,'scripts'));fs.writeFileSync(path.join(root,'scripts/port.mjs'),'// fixture');
  const call = (mode,extra={}) => run({root,upstream,mode,...extra});
  return {scratch,root,upstream,git,call,pin,manifest,close(){fs.rmSync(scratch,{recursive:true,force:true});}};
}
test('sync and check preserve recorded bytes; failed promotion rolls back all files',()=>{
 const f=fixture();try {
  const before=fs.readFileSync(path.join(f.root,'core-sync.json'));assert.throws(()=>f.call('sync',{injectFailure:1}),/Injected/);
  assert.equal(fs.existsSync(path.join(f.root,'src/a.ts')),false);assert.deepEqual(fs.readFileSync(path.join(f.root,'core-sync.json')),before);
  f.call('sync');f.call('check');const first=fs.readFileSync(path.join(f.root,'core-sync.json'));f.call('sync');assert.deepEqual(fs.readFileSync(path.join(f.root,'core-sync.json')),first);
  fs.writeFileSync(path.join(f.root,'src/a.ts'),'user edit');assert.throws(()=>f.call('sync'),/Unrecorded/);assert.equal(fs.readFileSync(path.join(f.root,'src/a.ts'),'utf8'),'user edit');assert.equal(fs.existsSync(path.join(f.root,'.core-sync-transaction')),false);
 }finally{f.close();}
});
test('extra paths, missing tests, symlinks and case collisions fail closed',()=>{
 const f=fixture();try {
  f.call('sync');fs.writeFileSync(path.join(f.root,'src/extra.ts'),'extra');assert.throws(()=>f.call('check'),/Undeclared/);fs.unlinkSync(path.join(f.root,'src/extra.ts'));
  fs.symlinkSync('/tmp',path.join(f.root,'src/escape'));assert.throws(()=>f.call('check'),/Symlink/);fs.unlinkSync(path.join(f.root,'src/escape'));
  const file=path.join(f.root,'core-sync.json');const m=JSON.parse(fs.readFileSync(file));m.copiedTests=['missing.test.ts'];fs.writeFileSync(file,JSON.stringify(m));assert.throws(()=>f.call('check'),/membership/);
  m.copiedTests=[];m.files.push({...m.files[0],destination:'src/A.ts'});fs.writeFileSync(file,JSON.stringify(m));assert.throws(()=>f.call('check'),/Colliding/);
 }finally{f.close();}
});
test('recorded patches reproduce; damaged patches leave preimages unchanged',()=>{
 const f=fixture();try {
  f.call('sync');const file=path.join(f.root,'src/a.ts');fs.writeFileSync(file,'export const n = 2;\n');f.call('patch',{file:'src/a.ts',seam:'S1',reason:'fixture'});f.call('check');f.call('sync');assert.equal(fs.readFileSync(file,'utf8'),'export const n = 2;\n');
  const m=JSON.parse(fs.readFileSync(path.join(f.root,'core-sync.json')));fs.appendFileSync(path.join(f.root,m.files[0].patch.path),'damage');assert.throws(()=>f.call('sync'),/Patch hash/);assert.equal(fs.readFileSync(file,'utf8'),'export const n = 2;\n');
 }finally{f.close();}
});
test('unreviewed port A to B survives a later B to C pin with unchanged source',()=>{
 const f=fixture();try {
  f.call('sync');fs.writeFileSync(path.join(f.upstream,'port'),'B');f.git('add','port');f.git('commit','-m','Fixture B');const b=f.git('rev-parse','HEAD');f.call('sync',{pin:b});
  fs.writeFileSync(path.join(f.upstream,'unrelated'),'C');f.git('add','unrelated');f.git('commit','-m','Fixture C');f.call('sync',{pin:f.git('rev-parse','HEAD')});
  const port=JSON.parse(fs.readFileSync(path.join(f.root,'core-sync.json'))).ports[0];assert.equal(port.reviewedThroughSha256,digest('A'));assert.equal(port.upstreamSha256,digest('B'));assert.equal(port.disposition,'pending');assert.throws(()=>f.call('check',{release:true}),/unresolved/);
 }finally{f.close();}
});
