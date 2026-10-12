// Read-only macOS host observations. This module never terminates a process.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {processSnapshot} from './process-ownership.mjs';
export const sha256=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export const hostIdentity=row=>`${row.pid}:${row.startSeconds}:${row.startMicroseconds}:${row.executable}`;
export function sampleHost(pid,observer=path.resolve('build/observer/process-observer')) {
	if(!Number.isSafeInteger(pid)||pid<=0)throw new Error('Invalid observed PID');
	const result=spawnSync(observer,[String(pid)],{encoding:'utf8',timeout:10_000});
	if(result.error)throw result.error;
	const row=JSON.parse(result.stdout||'{}');
	if(result.status!==0||row.ok!==true)throw new Error(`Process observation failed: ${JSON.stringify(row)}`);
	for(const key of ['pid','parentPid','startSeconds','startMicroseconds','continuousMs','awakeMs','wallMs','rssBytes','footprintBytes','cpuUserNs','cpuSystemNs','idleWakeups','interruptWakeups','threads','fileDescriptors'])if(!Number.isFinite(row[key])||row[key]<0)throw new Error('Invalid process metric '+key);
	return row;
}
export function processCwd(pid) {
	const text=execFileSync('/usr/sbin/lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{encoding:'utf8',timeout:10_000});
	const directory=text.split('\n').find(line=>line.startsWith('n'))?.slice(1);return directory?fs.realpathSync(directory):null;
}
export function discoverPlugin(directory) {
	const root=fs.realpathSync(directory),found=[];
	for(const row of processSnapshot().filter(row=>/(?:^|\s)(?:\S*\/)?node\s/.test(row.commandLine)&&row.commandLine.includes('bin/plugin.js'))){
		try{if(processCwd(row.pid)===root)found.push(sampleHost(row.pid));}catch{/* Exited while observing, never adopted. */}
	}
	if(found.length>1)throw new Error('More than one process owns the candidate directory');
	return found[0]??null;
}
export function candidateFiles(directory) {
	const root=fs.realpathSync(directory),files={};
	const walk=relative=>{for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
		const name=relative?relative+'/'+entry.name:entry.name;
		if(name==='logs'||name.startsWith('logs/'))continue;
		if(entry.isSymbolicLink())throw new Error('Candidate member is a symlink: '+name);
		if(entry.isDirectory())walk(name);else if(entry.isFile())files[name]=sha256(path.join(root,name));else throw new Error('Unsupported candidate member');
	}};walk('');return Object.fromEntries(Object.entries(files).sort());
}
export function runtimeFacts(row) {
	return {nodeVersion:execFileSync(row.executable,['--version'],{encoding:'utf8',timeout:10_000}).trim(),executable:row.executable,executableSha256:sha256(row.executable)};
}
