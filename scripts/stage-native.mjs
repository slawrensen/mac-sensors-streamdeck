import fs from 'node:fs';
import path from 'node:path';
import {verifyNativeSources} from './native-source-id.mjs';
import {validateNativeFiles} from './validate-native.mjs';
const record=JSON.parse(fs.readFileSync('build/native/build-record.json','utf8'));
verifyNativeSources(record);
const files=validateNativeFiles('build/native/production',record.sourceId);
const contract=fs.readFileSync('src/mac/native-contract.ts','utf8');if(!contract.includes(record.sourceId))throw new Error('Native loader contract is stale');
const hashes=Object.fromEntries(files.map(file=>[file.architecture==='x64'?'x86_64':file.architecture,file.sha256]));
fs.writeFileSync('build/native/native-artifacts.json',JSON.stringify(hashes,null,2)+'\n');
const target=process.argv[2]??'build/plugin/bin';fs.mkdirSync(target,{recursive:true});
for(const file of files) {
	const destination=path.join(target,file.file),next=destination+'.next';
	if(fs.existsSync(next))throw new Error('Unfinished native stage');
	fs.copyFileSync(path.join('build/native/production',file.file),next);fs.renameSync(next,destination);
}
const next=path.join(target,'native-artifacts.json.next');fs.writeFileSync(next,JSON.stringify(hashes,null,2)+'\n');fs.renameSync(next,path.join(target,'native-artifacts.json'));
console.log(JSON.stringify({sourceId:record.sourceId,files:files.map(file=>file.file)}));
