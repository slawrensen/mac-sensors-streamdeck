import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const root=process.cwd();
test('preview publication refuses a checkout without an authorized remote before any publication',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-preview-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));spawnSync('git',['init','--initial-branch','main'],{cwd:directory});const result=spawnSync(process.execPath,[path.join(root,'scripts/docs-preview-publish.mjs'),'main'],{cwd:directory,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/Unexpected repository/);
});
test('a performance report refuses an unfinished soak instead of fabricating results',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-report-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const result=spawnSync(process.execPath,['scripts/perf-report.mjs',directory,'a'.repeat(64),'123'],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/summary.json/);
});
test('docs screenshot command refuses a missing site URL before a browser is launched',()=>{
 const result=spawnSync(process.execPath,['scripts/docs-site-shots.mjs'],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/Usage:/);
});

test('renderer output errors remain failures despite the SDK exception listener',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-renderer-failure-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const blocker=path.join(directory,'file');fs.writeFileSync(blocker,'owned fixture');
 const result=spawnSync(process.execPath,['--import','tsx','scripts/dump-keys.mjs',path.join(blocker,'out.json')],{encoding:'utf8',env:{...process.env,TSX_TSCONFIG_PATH:'tsconfig.mac.json'}});assert.equal(result.status,1);assert.match(result.stderr,/EEXIST|ENOTDIR/);
});
