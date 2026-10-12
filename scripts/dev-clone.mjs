// Stage the owned development identity; never rewrite the installed production plugin.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const identity=JSON.parse(fs.readFileSync('identity.json','utf8'));
const target=path.join('build',identity.devUuid+'.sdPlugin'),next=fs.mkdtempSync(path.join('build','.dev-clone-'));
try {
	fs.cpSync('build/plugin',next,{recursive:true});
	const manifest=JSON.parse(fs.readFileSync(path.join(next,'manifest.json'),'utf8'));manifest.UUID=identity.devUuid;manifest.Name=identity.name+' Dev';manifest.Category=manifest.Name;
	for(const action of manifest.Actions)action.UUID=action.UUID.replace(identity.uuid+'.',identity.devUuid+'.');
	fs.writeFileSync(path.join(next,'manifest.json'),JSON.stringify(manifest,null,'\t')+'\n');
	const bundle=path.join(next,'bin/plugin.js');fs.writeFileSync(bundle,"process.env.MACSENSORS_LOG_LEVEL ??= 'debug'; process.env.MACSENSORS_TRACE_EVENTS ??= '1';\n"+fs.readFileSync(bundle,'utf8').replaceAll(identity.uuid,identity.devUuid));
	execFileSync(process.execPath,['--import','tsx','scripts/build-detail-profiles.ts',next,identity.devUuid],{stdio:'inherit'});
	const prior=target+'.previous';if(fs.existsSync(prior))throw new Error('Unfinished dev clone promotion');
	if(fs.existsSync(target))fs.renameSync(target,prior);
	try{fs.renameSync(next,target);}catch(error){if(fs.existsSync(prior))fs.renameSync(prior,target);throw error;}
	if(fs.existsSync(prior))fs.rmSync(prior,{recursive:true});
	console.log(target);
}finally{if(fs.existsSync(next))fs.rmSync(next,{recursive:true,force:true});}
