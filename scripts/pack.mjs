// Ported from slawrensen/hwinfo-streamdeck scripts/pack.mjs at 11b9645b78395f157493648d873a3066673ba493.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {PLUGIN_ROOT,PLUGIN_UUID} from './lib/pack-contract.mjs';
import {validateStaging,validatePack} from './lib/pack-validation.mjs';
import {verifyNativeSources} from './native-source-id.mjs';
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version,record=JSON.parse(fs.readFileSync('build/native/build-record.json','utf8'));
verifyNativeSources(record);validateStaging('build/plugin',record.sourceId);
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'mac-pack-')),stage=path.join(scratch,PLUGIN_ROOT),output=path.join(scratch,'output');
try {
	fs.cpSync('build/plugin',stage,{recursive:true});
	execFileSync(path.resolve('node_modules/.bin/streamdeck'),['pack',stage,'--output',output,'--force','--no-update-check'],{stdio:'inherit'});
	const packed=path.join(output,PLUGIN_UUID+'.streamDeckPlugin'),bytes=fs.readFileSync(packed);
	const result=validatePack({archiveBytes:bytes,stagingDir:'build/plugin',packageVersion:version,sourceId:record.sourceId});
	fs.mkdirSync('release',{recursive:true});const target=path.join('release',PLUGIN_UUID+'.streamDeckPlugin'),next=target+'.next';fs.writeFileSync(next,bytes);fs.renameSync(next,target);
	fs.writeFileSync('release/pack-validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({archive:target,...result}));
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
