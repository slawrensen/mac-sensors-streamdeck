import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
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
test('upload kit takes the update notes for its own version and stops before any download when they are missing',t=>{
	const listing=fs.readFileSync(path.join(root,'test/mac/fixtures/stage-upload-listing.md'),'utf8');
	const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mac-stage-upload-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
	// A stand-in gh that records every call and answers the release lookup as published, so only the listing check can stop the run.
	const calls=path.join(dir,'gh-calls.txt');fs.mkdirSync(path.join(dir,'bin'));
	fs.writeFileSync(path.join(dir,'bin','gh'),`#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$0.cjs" "$@"\n`,{mode:0o755});// a #! line cannot hold a Node path with spaces
	fs.writeFileSync(path.join(dir,'bin','gh.cjs'),`require('node:fs').appendFileSync(${JSON.stringify(calls)},process.argv.slice(2).join(' ')+'\\n');\nif(process.argv[2]==='api')process.stdout.write(JSON.stringify({draft:false,published_at:'2026-10-13T13:25:34Z',html_url:'https://example.invalid/release'}));\n`,{mode:0o755});
	fs.mkdirSync(path.join(dir,'docs/release'),{recursive:true});fs.writeFileSync(path.join(dir,'docs/release/STREAM_DECK_MARKETPLACE.md'),listing);
	const stage=tag=>run('stage-upload.mjs',[tag],dir,{PATH:path.join(dir,'bin')+path.delimiter+process.env.PATH});
	const missing=stage('v1.0.2');
	assert.notEqual(missing.status,0);assert.match(missing.stderr,/Missing listing section "## Update notes 1\.0\.2\.0" in docs\/release\/STREAM_DECK_MARKETPLACE\.md; add the Marketplace update notes for v1\.0\.2/);
	assert.equal(fs.existsSync(calls),false,'no gh call before the listing check');assert.equal(fs.existsSync(path.join(dir,'release')),false,'no upload folder left behind');
});
test('upload kit listing sections map to their portal files with the versioned notes',async()=>{
	const {listingFiles,updateNotesHeading}=await import(pathToFileURL(path.join(root,'scripts/stage-upload.mjs')).href);
	const listing=fs.readFileSync(path.join(root,'test/mac/fixtures/stage-upload-listing.md'),'utf8');
	assert.equal(updateNotesHeading('v1.0.1'),'Update notes 1.0.1.0');
	const files=Object.fromEntries(listingFiles(listing,'v1.0.1'));
	assert.deepEqual(Object.keys(files),['name-and-tagline.txt','description.txt','release-notes.txt','features.txt','portal-fields.txt']);
	assert.equal(files['release-notes.txt'],'Fixture notes for 1.0.1.0.\n\n- One fixture change.\n');assert.doesNotMatch(files['release-notes.txt'],/FIRST RELEASE/);
	assert.equal(files['name-and-tagline.txt'],'Fixture name\nFixture tagline\n');
	assert.throws(()=>listingFiles(listing.replace(/## Update notes 1\.0\.1\.0\n[\s\S]*?(?=## Feature bullets)/,'## Update notes 1.0.1.0\n\n'),'v1.0.1'),/Missing listing section "## Update notes 1\.0\.1\.0"/);
	assert.throws(()=>listingFiles(listing.replace('## Portal fields','## Portal'),'v1.0.1'),/Missing listing section "## Portal fields"/);
});
test('panel suites keep the guard\'s nonzero exit when every check passed but an uncaught error happened',()=>{
	// The suites end with an explicit process.exit; run their real closing statements after a handled asynchronous error.
	const guard=path.join(root,'scripts/lib/script-failures.mjs');
	// Long enough for the setImmediate throw to land first; the tail is synchronous.
	const TAIL_DELAY_MS=20;
	for(const suite of ['e2e-pi-panels.mjs','e2e-pi-persistence.mjs']){
		const source=fs.readFileSync(path.join(root,'scripts',suite),'utf8'),tail=source.slice(source.lastIndexOf('\n}\n')+3);
		assert.match(tail,/^process\.exit\(/m,suite);assert.doesNotMatch(tail,/\bawait\b/,suite);
		const exitOf=failing=>spawnSync(process.execPath,['--input-type=module','-e',`import ${JSON.stringify(guard)}; process.on('uncaughtException',()=>{}); const failures=[]; const results={errors:[]}; ${failing?"setImmediate(()=>{throw new Error('EXPECTED_SUITE_FAILURE')});":''} setTimeout(()=>{${tail}},${TAIL_DELAY_MS});`],{encoding:'utf8'});
		assert.equal(exitOf(false).status,0,suite);
		const failed=exitOf(true);assert.equal(failed.status,1,suite);assert.match(failed.stderr,/EXPECTED_SUITE_FAILURE/);
	}
});
test('native drift fails moved addon bytes without a native source change, even when the toolchain changed',t=>{
	const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mac-native-drift-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
	// Shaped like the published v1.0.0 native-manifest.json fields native-drift.mjs reads.
	const previous={sourceId:'a'.repeat(64),compiler:'Apple clang version 21.0.0 (clang-2100.1.1.101)',sdk:'26.5',entries:[{architecture:'arm64',sha256:'1'.repeat(64)},{architecture:'x86_64',sha256:'2'.repeat(64)}]};
	const write=(name,manifest)=>{const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify(manifest));return file;};
	const before=write('previous.json',previous),drift=manifest=>run('native-drift.mjs',[write('current.json',manifest),before]);
	const moved={...previous,entries:[{architecture:'arm64',sha256:'3'.repeat(64)},previous.entries[1]]};
	const same=drift(previous);assert.equal(same.status,0,same.stderr);assert.deepEqual(JSON.parse(same.stdout).moved,[]);
	assert.equal(drift({...moved,sourceId:'b'.repeat(64)}).status,0,'a native source change explains new bytes');
	for(const toolchain of [{compiler:'Apple clang version 21.0.0 (clang-2100.9.9.9)'},{sdk:'26.6'}]){
		const result=drift({...moved,...toolchain});
		assert.notEqual(result.status,0,`a toolchain change alone must not pass moved bytes: ${JSON.stringify(toolchain)}`);assert.match(result.stderr,/Unexplained native byte drift for arm64.*toolchainChanged true/);
	}
	const bare=drift(moved);assert.notEqual(bare.status,0);assert.match(bare.stderr,/Unexplained native byte drift for arm64.*toolchainChanged false/);
	const first=run('native-drift.mjs',[before]);assert.equal(first.status,0);assert.match(first.stdout,/establishes the baseline/);
});
