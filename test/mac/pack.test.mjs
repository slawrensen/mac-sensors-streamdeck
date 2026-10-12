import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {validatePack,payloadOf} from '../../scripts/lib/pack-validation.mjs';
import {writeZip} from '../../scripts/lib/zip.mjs';
import {PLUGIN_ROOT} from '../../scripts/lib/pack-contract.mjs';
const bytes=fs.readFileSync('release/com.lawrensen.mac.streamDeckPlugin'),payload=payloadOf(bytes);
const version=JSON.parse(fs.readFileSync('package.json')).version,record=JSON.parse(fs.readFileSync('build/native/build-record.json'));
const entries=()=>[...payload].map(([name,data])=>({name:PLUGIN_ROOT+'/'+name,data}));
const validate=archiveBytes=>validatePack({archiveBytes,packageVersion:version,sourceId:record.sourceId});
test('actual CLI archive validates and each extracted member is present',()=>{assert.equal(validate(bytes).members,payload.size);});
test('duplicate, traversal, missing and unexpected archive members fail',()=>{
	const base=entries();assert.throws(()=>validate(writeZip([...base,base[0]])),/Duplicate/);
	assert.throws(()=>validate(writeZip([...base,{name:PLUGIN_ROOT+'/../outside',data:Buffer.from('x')}])),/Unsafe/);
	assert.throws(()=>validate(writeZip(base.slice(1))),/Missing/);
	assert.throws(()=>validate(writeZip([...base,{name:PLUGIN_ROOT+'/debug.log',data:Buffer.from('x')}])),/Unknown/);
});
test('renamed test addon and a test-policy bundle are refused inside an otherwise valid archive',()=>{
	let changed=entries().map(entry=>entry.name.endsWith('/hwmac-arm64.node')?{...entry,data:fs.readFileSync('build/native/test/hwmac-arm64.node')}:entry);
	assert.throws(()=>validate(writeZip(changed)),/Test native/);
	changed=entries().map(entry=>entry.name.endsWith('/plugin.js')?{...entry,data:Buffer.concat([entry.data,Buffer.from('\nglobalThis.__MAC_SENSORS_TEST_BUILD__=true;')])}:entry);
	assert.throws(()=>validate(writeZip(changed)),/Platform name/);
});
test('wrong version and leaked private paths cannot pass the archive gate',()=>{
	let changed=entries().map(entry=>entry.name.endsWith('/manifest.json')?{...entry,data:Buffer.from(JSON.stringify({...JSON.parse(entry.data),Version:'9.9.9.0'}))}:entry);assert.throws(()=>validate(writeZip(changed)),/version/);
	changed=entries().map(entry=>entry.name.endsWith('/plugin.js')?{...entry,data:Buffer.concat([entry.data,Buffer.from('\n// /Users/private-person/secret')])}:entry);assert.throws(()=>validate(writeZip(changed)),/Private material/);
});
