// Stage the owned development identity; never rewrite the installed production plugin.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const identity=JSON.parse(fs.readFileSync('identity.json','utf8'));
const target=path.join('build',identity.devUuid+'.sdPlugin');
if(fs.existsSync(target)) {
	const inUse=spawnSync('/usr/sbin/lsof',['-t','+D',path.resolve(target)],{encoding:'utf8'});
	if(inUse.error||![0,1].includes(inUse.status))throw new Error('Could not establish whether the development plugin is running');
	if(inUse.stdout.trim())throw new Error('Stop the development plugin before replacing it. Its files are in use.');
}
const next=fs.mkdtempSync(path.join('build','.dev-clone-'));
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
