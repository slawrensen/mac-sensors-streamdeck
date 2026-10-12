// Rebuild at a distinct source path and compare every unsigned and signed byte hash.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {verifyNativeSources} from './native-source-id.mjs';
const root=process.cwd(),first=JSON.parse(fs.readFileSync('build/native/build-record.json','utf8'));
verifyNativeSources(first);
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'mac-native-repro-'));
try {
	for(const input of first.sourceFiles){const target=path.join(scratch,input.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(input.path,target);}
	fs.mkdirSync(path.join(scratch,'src/mac'),{recursive:true});
	const headers=process.env.MACSENSORS_NODE_HEADERS??path.join(root,'build/toolchain/node-v24.13.1/include/node');
	execFileSync(process.execPath,['scripts/build-native.mjs'],{cwd:scratch,stdio:'inherit',env:{...process.env,MACSENSORS_NODE_HEADERS:headers}});
	const second=JSON.parse(fs.readFileSync(path.join(scratch,'build/native/build-record.json'),'utf8'));
	if(first.sourceId!==second.sourceId)throw new Error('Source identities differ');
	const comparisons=first.records.map(file=>{const other=second.records.find(item=>item.file===file.file);return {file:file.file,unsignedMatch:file.unsignedSha256===other?.unsignedSha256,signedMatch:file.sha256===other?.sha256};});
	fs.writeFileSync('build/native-reproducibility.json',JSON.stringify({sourceId:first.sourceId,differentSourceRoot:true,comparisons},null,2)+'\n');
	if(!comparisons.every(file=>file.unsignedMatch&&file.signedMatch))throw new Error('Native builds differ; inspect the recorded comparisons');
	console.log(JSON.stringify({sourceId:first.sourceId,artifacts:comparisons.length,identical:true}));
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
