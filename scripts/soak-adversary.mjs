// Only an explicitly recorded task-owned development plugin PID may be stopped.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {hostIdentity,sampleHost} from './lib/soak-host.mjs';
import {validateOwnedTarget,readOwnerLedger} from './lib/soak-adversary-safety.mjs';
const [command,outArg,ledgerArg]=process.argv.slice(2),out=path.resolve(outArg??'');
if(!outArg)throw new Error('Usage: soak-adversary <kill|marker> <soak-directory> <owned-ledger|event-name>');
const state=JSON.parse(fs.readFileSync(path.join(out,'state.json'))),clock=sampleHost(process.pid);
const event={id:randomUUID(),at:new Date(clock.wallMs).toISOString(),continuousMs:clock.continuousMs};
if(command==='marker') {
	if(!['app-restart-begin','app-restart-end','sleep-begin','wake','physical-gesture','e2e-begin','e2e-end'].includes(ledgerArg))throw new Error('Unknown owner event');
	Object.assign(event,{type:ledgerArg,verified:false,scope:'Owner marker only; observed recovery and host timestamps must verify it'});
}else if(command==='kill') {
	const ledger=readOwnerLedger(ledgerArg),current=validateOwnedTarget(ledger,state);
	Object.assign(event,{type:'plugin-kill-intent',verified:false,pid:current.pid,identity:hostIdentity(current),backupSha256:ledger.backup.sha256});
	fs.appendFileSync(path.join(out,'events.jsonl'),JSON.stringify(event)+'\n');
	process.kill(current.pid,'SIGKILL');
	let ended=false;
	for(let attempt=0;attempt<50;attempt++){
		try{if(hostIdentity(sampleHost(current.pid))!==hostIdentity(current)){ended=true;break;}}catch{ended=true;break;}
		await new Promise(resolve=>setTimeout(resolve,100));
	}
	if(!ended)throw new Error('The signalled process has not exited; injection remains unverified');
	Object.assign(event,{type:'plugin-kill',verified:true});

}else throw new Error('Unknown adversary command');
fs.appendFileSync(path.join(out,'events.jsonl'),JSON.stringify(event)+'\n');console.log(JSON.stringify(event));
