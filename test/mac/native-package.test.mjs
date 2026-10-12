import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {validateNativeFiles} from '../../scripts/validate-native.mjs';
import {readMachO} from '../../scripts/lib/macho.mjs';
const record=JSON.parse(fs.readFileSync('build/native/build-record.json','utf8'));
function fixture(action) {const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mac-native-gate-'));try{for(const name of ['hwmac-arm64.node','hwmac-x86_64.node'])fs.copyFileSync(path.join('build/native/production',name),path.join(temp,name));action(temp);}finally{fs.rmSync(temp,{recursive:true,force:true});}}
test('both production architectures pass independent metadata and signature inspection',()=>{
	const files=validateNativeFiles('build/native/production',record.sourceId);assert.equal(files.length,2);assert.ok(files.every(file=>file.metadata.testHooks===0));
});
test('test artifacts disguised under each production name are rejected without loading them',()=>{
	for(const kind of ['test','wrong-protocol'])for(const arch of ['arm64','x86_64'])fixture(temp=>{
		const name=`hwmac-${arch}.node`;fs.copyFileSync(path.join('build/native',kind,name),path.join(temp,name));assert.throws(()=>validateNativeFiles(temp,record.sourceId),kind==='test'?/Test native/:/protocol/);
	});
});
test('wrong slices, higher deployment floor, unknown members and symlinks are rejected',()=>{
	fixture(temp=>{fs.copyFileSync(path.join(temp,'hwmac-x86_64.node'),path.join(temp,'hwmac-arm64.node'));assert.throws(()=>validateNativeFiles(temp,record.sourceId),/architecture/);});
	fixture(temp=>{const file=path.join(temp,'hwmac-arm64.node'),bytes=fs.readFileSync(file);let offset=32;for(let i=0;i<bytes.readUInt32LE(16);i++){if(bytes.readUInt32LE(offset)===0x32)bytes.writeUInt32LE(14<<16,offset+12);offset+=bytes.readUInt32LE(offset+4);}fs.writeFileSync(file,bytes);assert.throws(()=>validateNativeFiles(temp,record.sourceId),/deployment/);});
	fixture(temp=>{fs.writeFileSync(path.join(temp,'debug.txt'),'fixture');assert.throws(()=>validateNativeFiles(temp,record.sourceId),/Unexpected/);});
	fixture(temp=>{const target=path.join(temp,'hwmac-arm64.node');fs.renameSync(target,target+'.saved');fs.symlinkSync(target+'.saved',target);assert.throws(()=>validateNativeFiles(temp,record.sourceId),/Unexpected|symlink/);});
});
test('truncated or foreign-format binaries cannot masquerade as native metadata',()=>{
	const temp=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'mac-macho-')),'bad.node');try{for(const bytes of [Buffer.alloc(0),Buffer.from('test'),Buffer.alloc(32)]){fs.writeFileSync(temp,bytes);assert.throws(()=>readMachO(temp),/Mach-O/);}}finally{fs.rmSync(path.dirname(temp),{recursive:true,force:true});}
});
