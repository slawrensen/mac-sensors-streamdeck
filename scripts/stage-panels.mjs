// S1/S2/S5/S8: exact, counted transformations around the copied panel source.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
// The cache-busting token the copied panels carry at the pinned core version.
const BASELINE_PANEL_TOKEN='1.7.1.0-1';
export function stagePanels(destination, token) {
	if(!/^\d+\.\d+\.\d+\.\d+-mac\d+$/.test(token))throw new Error('Invalid panel token');
	const root='com.lawrensen.mac.sdPlugin/ui',rules=JSON.parse(fs.readFileSync('core-patches/panel-stage.json','utf8')).files;
	const records=[], outputs=[];
	for(const name of fs.readdirSync(root).sort()) {
		const input=fs.readFileSync(path.join(root,name));let output=input.toString('utf8');
		for(const rule of rules[name]??[]) {
			const count=output.split(rule.before).length-1;if(count!==rule.count)throw new Error(`${name}: staged anchor changed (${count}/${rule.count})`);
			output=output.split(rule.before).join(rule.after);
		}
		const tokens=output.split(BASELINE_PANEL_TOKEN).length-1;
		if(name.endsWith('.html')||name==='pi-common.js'){if(!tokens)throw new Error(`${name}: missing baseline token`);output=output.replaceAll(BASELINE_PANEL_TOKEN,token);}
		if(name.endsWith('.js'))new vm.Script(output,{filename:name});
		if(/HWiNFO|REALiX|hwinfo-streamdeck|HWINFO_/.test(output))throw new Error(`${name}: platform name remains`);
		outputs.push([name,output]);
		records.push({file:name,inputSha256:createHash('sha256').update(input).digest('hex'),outputSha256:createHash('sha256').update(output).digest('hex'),transformations:rules[name]?.length??0,tokens});
	}
	const target=path.resolve(destination), parent=path.dirname(target);
	fs.mkdirSync(parent,{recursive:true});
	if(fs.existsSync(target)) {
		if(fs.lstatSync(target).isSymbolicLink() || fs.readdirSync(target).some(name=>!outputs.some(([file])=>file===name)))throw new Error('Unexpected existing panel output');
	}
	const scratch=fs.mkdtempSync(path.join(parent,'.panels-next-')), backup=target+'.stage-backup';
	if(fs.existsSync(backup))throw new Error('Unfinished panel promotion');
	try {
		for(const [name,output] of outputs)fs.writeFileSync(path.join(scratch,name),output);
		if(fs.existsSync(target))fs.renameSync(target,backup);
		try {fs.renameSync(scratch,target);}catch(error){if(fs.existsSync(backup))fs.renameSync(backup,target);throw error;}
		if(fs.existsSync(backup))fs.rmSync(backup,{recursive:true});
	}finally{if(fs.existsSync(scratch))fs.rmSync(scratch,{recursive:true});}
	return records;
}
if(process.argv[1]?.endsWith('/stage-panels.mjs')) {
	const destination=process.argv[2]??'build/plugin/ui';
	const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
	const identity=JSON.parse(fs.readFileSync('identity.json','utf8'));
	console.log(JSON.stringify(stagePanels(destination,`${version}.0-mac${identity.panelBuild}`),null,2));
}
