// Mach-O evidence for the exact read-only addon files supplied to packaging.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const directory=path.resolve(process.argv[2]??'build/native/production');
const record=JSON.parse(fs.readFileSync(path.join(directory,'../build-record.json'),'utf8'));
const entries=[];
for(const architecture of ['arm64','x86_64']) {
	const file=path.join(directory,`hwmac-${architecture}.node`),bytes=fs.readFileSync(file);
	const otool=execFileSync('otool',['-l',file],{encoding:'utf8'}),linked=execFileSync('otool',['-L',file],{encoding:'utf8'}).split('\n').slice(1).map(x=>x.trim()).filter(Boolean);
	const slices=execFileSync('lipo',['-archs',file],{encoding:'utf8'}).trim().split(/\s+/);
	execFileSync('codesign',['--verify','--strict',file]);
	// codesign writes inspection data to stderr even on success.
	const detail=await import('node:child_process').then(({spawnSync})=>spawnSync('codesign',['-d','--verbose=4',file],{encoding:'utf8'}));const signature=detail.stderr;
	if(detail.status!==0)throw new Error('Signature inspection failed');
	const minimum=otool.match(/\bminos\s+(\S+)/)?.[1],sdk=otool.match(/\bsdk\s+(\S+)/)?.[1],uuid=otool.match(/\buuid\s+(\S+)/)?.[1];
	if(!minimum||!sdk||!uuid)throw new Error('Missing Mach-O deployment metadata');
	const sha256=createHash('sha256').update(bytes).digest('hex');
	entries.push({file:path.basename(file),architecture,slices,minimumMacOS:minimum,sdk,uuid,linked,signature:signature.includes('Signature=adhoc')?'ad-hoc':'other',hardenedRuntime:/flags=.*runtime/.test(signature),cdHash:signature.match(/CDHash=(\S+)/)?.[1],sha256,sliceSha256:sha256,bytes:bytes.length});
}
const output={schema:1,protocol:1,nativeVersion:'1.1.0',sourceId:record.sourceId,sourceFiles:record.sourceFiles,nodeHeaders:record.nodeHeaders,compiler:record.compiler,sdk:record.sdk,entries};
const destination=process.argv[3]??'build/native-manifest.json';fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({manifest:destination,entries:entries.length}));
