// Ported capability from slawrensen/hwinfo-streamdeck scripts/lib/process-ownership.mjs at 11b9645b78395f157493648d873a3066673ba493.
// A debugger port is read only from the unique profile this task created.
import { readFileSync, mkdtempSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
export const processIdentity = row => `${row.pid}:${row.createdAt}:${row.commandLine}`;
export function processSnapshot() {
	const output=execFileSync('/bin/ps',['-axo','pid=,ppid=,lstart=,command='],{encoding:'utf8',env:{...process.env,LC_ALL:'C'}});
	return output.trim().split('\n').map(line=>{
		const match=line.match(/^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.+)$/);
		if(!match)throw new Error('Unparseable process identity');
		return {pid:Number(match[1]),parentPid:Number(match[2]),createdAt:new Date(match[3]).toISOString(),commandLine:match[4]};
	});
}
export function ownedDescendants(rows,roots) {
	const owned=new Map(rows.filter(row=>roots.has(processIdentity(row))).map(row=>[row.pid,row]));
	let changed=true;
	while(changed){changed=false;for(const row of rows){const parent=owned.get(row.parentPid);if(!owned.has(row.pid)&&parent&&row.createdAt>=parent.createdAt){owned.set(row.pid,row);changed=true;}}}
	return [...owned.values()];
}
export function createBrowserProfile(prefix) {
	let root=os.tmpdir();
	if(process.env.MACSENSORS_SUITE_BROWSER_ROOT){root=realpathSync(process.env.MACSENSORS_SUITE_BROWSER_ROOT);const relative=path.relative(realpathSync(os.tmpdir()),root);if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(root).startsWith('mac-sensors-suite-'))throw new Error('Invalid suite browser root');}
	return mkdtempSync(path.join(root,prefix));
}
// The Mac harness owns a ChildProcess and terminates that exact launch. A
// Windows-style profile/name lookup deliberately grants no kill authority.
export function cleanupBrowser() { throw new Error('Use the owned ChildProcess on macOS'); }
export function browserDebuggerPort(profile) {
 const port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid browser debugger port');
 return port;
}
