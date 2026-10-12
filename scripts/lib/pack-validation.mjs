// Ported packaging boundary from slawrensen/hwinfo-streamdeck at 11b9645b78395f157493648d873a3066673ba493.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {listZip,readZipEntry} from './zip.mjs';
import {PLUGIN_ROOT,PLUGIN_UUID,SHIPPED_MEMBERS,TEXT_MEMBER_PATTERN,FORBIDDEN_MEMBER_PATTERNS} from './pack-contract.mjs';
import {validateNativeFiles} from '../validate-native.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function fileList(root,relative='') {
	const files=[];
	for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})) {
		const name=relative?relative+'/'+entry.name:entry.name;
		if(entry.isSymbolicLink())throw new Error(`Symlink in package: ${name}`);
		if(entry.isDirectory())files.push(...fileList(root,name));else if(entry.isFile())files.push(name);else throw new Error(`Unsupported file: ${name}`);
	}
	return files.sort();
}
export function validateStaging(directory,sourceId) {
	const files=fileList(directory),expected=[...SHIPPED_MEMBERS].sort();
	if(JSON.stringify(files)!==JSON.stringify(expected))throw new Error(`Package member inventory differs: ${files.filter(file=>!expected.includes(file)).join(', ')}; missing ${expected.filter(file=>!files.includes(file)).join(', ')}`);
	const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
	if(manifest.UUID!==PLUGIN_UUID||manifest.OS?.length!==1||manifest.OS[0].Platform!=='mac'||manifest.Nodejs?.Version!=='24')throw new Error('Wrong package platform identity');
	validateNativeFiles(path.join(directory,'bin'),sourceId,{bin:true});
	for(const file of files) {
		if(FORBIDDEN_MEMBER_PATTERNS.some(pattern=>pattern.test(file)))throw new Error(`Forbidden package member: ${file}`);
		if(TEXT_MEMBER_PATTERN.test(file)) {
			const text=fs.readFileSync(path.join(directory,file),'utf8');
			if(/HWiNFO|REALiX|HWINFO_|__MAC_SENSORS_TEST_BUILD__|MACSENSORS_TEST_FIXTURE/.test(text))throw new Error(`Platform name in ${file}`);
			if(/\/Users\/|\/home\/[a-z]|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/.test(text))throw new Error(`Private material in ${file}`);
		}
	}
	return files;
}
export function payloadOf(archiveBytes) {
	const {entries,problems}=listZip(archiveBytes);if(problems.length)throw new Error(problems.join('; '));
	const payload=new Map();let expanded=0;
	for(const entry of entries) {
		if(entry.name.endsWith('/'))continue;
		if(!entry.name.startsWith(PLUGIN_ROOT+'/'))throw new Error('Wrong archive root');
		const name=entry.name.slice(PLUGIN_ROOT.length+1);
		if(name.split('/').some(part=>!part||part==='.'||part==='..')||name.includes('\\')||name.includes('\0'))throw new Error('Unsafe archive member');
		if(payload.has(name)||[...payload.keys()].some(key=>key.toLowerCase()===name.toLowerCase()))throw new Error('Duplicate archive member');
		if(!SHIPPED_MEMBERS.includes(name))throw new Error('Unknown archive member: '+name);
		if(entry.uncompressedSize>16*1024*1024||(expanded+=entry.uncompressedSize)>64*1024*1024)throw new Error('Archive expansion exceeds package bounds');
		// Bound inflation before the shared CRC/local-header reader sees it.
		if(entry.method===8){const offset=entry.localHeaderOffset,start=offset+30+archiveBytes.readUInt16LE(offset+26)+archiveBytes.readUInt16LE(offset+28);inflateRawSync(archiveBytes.subarray(start,start+entry.compressedSize),{maxOutputLength:Math.max(1,entry.uncompressedSize)});}
		payload.set(name,readZipEntry(archiveBytes,entry));
	}
	if(payload.size!==SHIPPED_MEMBERS.length||SHIPPED_MEMBERS.some(file=>!payload.has(file)))throw new Error('Missing archive member');
	return payload;
}
export function validatePack({archiveBytes,stagingDir,packageVersion,sourceId,extractTo}) {
	const payload=payloadOf(archiveBytes),scratch=extractTo??fs.mkdtempSync(path.join(os.tmpdir(),'mac-pack-check-'));
	if(extractTo&&fs.existsSync(extractTo)&&fs.readdirSync(extractTo).length)throw new Error('Extraction destination must be empty');
	try {
		for(const [name,bytes] of payload) {
			const target=path.join(scratch,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
			if(stagingDir) {
				const staged=fs.readFileSync(path.join(stagingDir,name));
				if(name==='manifest.json'){if(JSON.stringify(JSON.parse(staged))!==JSON.stringify(JSON.parse(bytes)))throw new Error('Packed manifest differs from staged manifest');}
				else if(!staged.equals(bytes))throw new Error(`Packed bytes differ: ${name}`);
			}
		}
		const manifest=JSON.parse(payload.get('manifest.json'));
		if(manifest.Version!==packageVersion+'.0')throw new Error('Package version mismatch');
		validateStaging(scratch,sourceId);
		return {members:payload.size,payload:Object.fromEntries([...payload].map(([name,bytes])=>[name,hash(bytes)])),archiveSha256:hash(archiveBytes)};
	}finally{if(!extractTo)fs.rmSync(scratch,{recursive:true,force:true});}
}
