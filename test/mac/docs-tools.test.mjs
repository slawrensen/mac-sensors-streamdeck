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

test('owner photo preparation preserves the input and measures supplied color patches',async t=>{
 const sharp=(await import('sharp')).default,directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-photo-fixture-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const original=path.join(directory,'original.png'),output=path.join(directory,'prepared.png'),regions=path.join(directory,'regions.json');const pixels=Buffer.alloc(32*16*3);
 for(let y=0;y<16;y++)for(let x=0;x<32;x++){const color=x<16?[232,148,13]:[203,33,20];for(let channel=0;channel<3;channel++)pixels[(y*32+x)*3+channel]=color[channel];}
 await sharp(pixels,{raw:{width:32,height:16,channels:3}}).png().toFile(original);const before=fs.readFileSync(original);fs.writeFileSync(regions,JSON.stringify({warn:{left:1,top:1,width:10,height:10},crit:{left:17,top:1,width:10,height:10}}));
 const result=spawnSync(process.execPath,['scripts/prepare-hardware-photo.mjs',original,output,'Synthetic test fixture only',regions],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.deepEqual(fs.readFileSync(original),before);
 const meta=await sharp(output).metadata(),report=JSON.parse(fs.readFileSync(output+'.json'));assert.equal(meta.width,1920);assert.equal(meta.height,960);assert.equal(meta.exif,undefined);assert.ok(report.measurements.every(row=>row.absoluteDifference.every(value=>value===0)&&row.clippedPixelFraction===0));
 const repeated=spawnSync(process.execPath,['scripts/prepare-hardware-photo.mjs',original,output],{encoding:'utf8'});assert.notEqual(repeated.status,0);assert.deepEqual(fs.readFileSync(original),before);
});
