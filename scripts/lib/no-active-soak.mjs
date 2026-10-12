import fs from 'node:fs';
import {hostIdentity,sampleHost} from './soak-host.mjs';
const file='build/soak-active.json';
if(fs.existsSync(file)){
	const lock=JSON.parse(fs.readFileSync(file));
	let current;
	try{current=sampleHost(lock.monitor.pid);}catch{throw new Error('A soak lock exists but its process cannot be verified. Resolve the recorded soak before running e2e.');}
	if(hostIdentity(current)===hostIdentity(lock.monitor))throw new Error('An active hardware soak forbids local e2e runs. Wait for the recorded window to close.');
	throw new Error('Stale soak ownership lock; inspect it before running e2e');
}
