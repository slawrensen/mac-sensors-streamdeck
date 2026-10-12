import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
const root=process.cwd(),run=(script,args=[],cwd=root,env={})=>spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd,env:{...process.env,...env},encoding:'utf8',timeout:30_000});
test('qualification preserves ordered stages and refuses invalid input before work',()=>{
	const listed=run('qualify.mjs',['--list']);assert.equal(listed.status,0);
	assert.deepEqual(listed.stdout.trim().split('\n'),['prerequisites','core','lint','typecheck','build:native','build','unit','native','pack','archive','abi','recovery','native-gate','cli-validate','copy','tree']);
	for(const args of [['--stages','prerequisites,nope'],['--out'],['--unexpected']])assert.notEqual(run('qualify.mjs',args).status,0);
});
test('qualification refuses stale extraction and never runs later stages',t=>{
	const out=fs.mkdtempSync(path.join(os.tmpdir(),'mac-qualify-test-'));t.after(()=>fs.rmSync(out,{recursive:true,force:true}));fs.mkdirSync(path.join(out,'extracted'));
	assert.equal(run('qualify.mjs',['--stages','archive,abi,recovery','--out',out]).status,1);
	const record=JSON.parse(fs.readFileSync(path.join(out,'record.json')));assert.equal(record.passed,false);
	assert.deepEqual(record.results.filter(row=>['archive','abi','recovery'].includes(row.stage)).map(row=>row.status),['FAIL','SKIPPED','SKIPPED']);
});
test('release tag gate rejects injection, disagreement, duplicate and impossible dates',t=>{
	const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mac-release-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
	const put=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value));
	put('package.json',{version:'1.2.3'});put('package-lock.json',{version:'1.2.3',packages:{'':{version:'1.2.3'}}});put('identity.json',{uuid:'com.lawrensen.mac'});
	const log=date=>fs.writeFileSync(path.join(dir,'CHANGELOG.md'),`## 1.2.3.0 - ${date}\n`);log('2026-10-12');
	const check=tag=>run('verify-release-tag.mjs',[],dir,{RELEASE_TAG:tag});assert.equal(check('v1.2.3').status,0);
	for(const tag of ['v1.2.3\n','v1.2.4','v01.2.3','v1.2.3; echo unsafe'])assert.notEqual(check(tag).status,0);
	log('2026-02-30');assert.notEqual(check('v1.2.3').status,0);log('2026-10-12\n## 1.2.3.0 - 2026-10-12');assert.notEqual(check('v1.2.3').status,0);
	log('2026-10-12');put('package-lock.json',{version:'1.2.3',packages:{'':{version:'1.2.2'}}});assert.notEqual(check('v1.2.3').status,0);
});
test('asynchronous failures stay nonzero even when another exception listener handles them',()=>{
	const guard=path.join(root,'scripts/lib/script-failures.mjs');
	const result=spawnSync(process.execPath,['--input-type=module','-e',`import ${JSON.stringify(guard)}; process.on('uncaughtException',()=>{}); setImmediate(()=>{throw new Error('EXPECTED_SCRIPT_FAILURE')});`],{encoding:'utf8'});
	assert.equal(result.status,1);assert.match(result.stderr,/EXPECTED_SCRIPT_FAILURE/);
});
