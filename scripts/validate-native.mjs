// Reject unsupported or test artifacts before they can enter a release archive.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyNativeSources} from './native-source-id.mjs';
import {readMachO,versionText} from './lib/macho.mjs';
export function validateNativeFiles(directory,sourceId,{bin=false}={}) {
	const allowed=new Set(['hwmac-arm64.node','hwmac-x86_64.node',...(bin?['plugin.js','package.json','native-artifacts.json']:[])]);
	for(const name of fs.readdirSync(directory))if(!allowed.has(name)||!fs.lstatSync(path.join(directory,name)).isFile())throw new Error(`Unexpected native file: ${name}`);
	const results=[];
	for(const [filename,architecture] of [['hwmac-arm64.node','arm64'],['hwmac-x86_64.node','x64']]) {
		const file=path.join(directory,filename);if(fs.lstatSync(file).isSymbolicLink())throw new Error('Native symlinks are not allowed');
		const facts=readMachO(file),info=facts.metadata;
		if(facts.architecture!==architecture||info.arch!==architecture)throw new Error('Wrong native architecture');
		if(info.testHooks!==0)throw new Error('Test native artifacts cannot ship');
		if(info.protocol!==1||info.napi!==8||info.version!=='1.0.0'||info.platform!=='darwin'||info.sourceId!==sourceId)throw new Error('Native protocol or source identity mismatch');
		if(facts.minimumOS>((13<<16)|(5<<8)))throw new Error('Native deployment minimum exceeds macOS13.5');
		execFileSync('codesign',['--verify','--strict',file],{stdio:['ignore','pipe','pipe']});
		results.push({file:filename,architecture,minimumMacOS:versionText(facts.minimumOS),sdk:versionText(facts.sdk),uuid:facts.uuid,sha256:createHash('sha256').update(facts.bytes).digest('hex'),metadata:info});
	}
	return results;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
	const directory=process.argv[2]??'build/native/production';
	const record=JSON.parse(fs.readFileSync('build/native/build-record.json','utf8'));
	verifyNativeSources(record);
	console.log(JSON.stringify(validateNativeFiles(directory,record.sourceId,{bin:process.argv.includes('--bin')}),null,2));
}
