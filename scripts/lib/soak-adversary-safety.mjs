import fs from 'node:fs';
import {candidateFiles,hostIdentity,processCwd,sampleHost,sha256} from './soak-host.mjs';
export function validateOwnedTarget(ledger,state,{sample=sampleHost,cwd=processCwd,files=candidateFiles,readBackup=sha256,now=Date.now()}={}) {
	if(ledger.authority!=='task-started-plugin'||ledger.uuid!=='com.lawrensen.macdev'||!ledger.process||ledger.directory!==state.directory)throw new Error('Missing task ownership record');
	if(!ledger.backup?.path||!/^[a-f0-9]{64}$/.test(ledger.backup.sha256)||!Number.isFinite(ledger.backup.at)||now-ledger.backup.at<0||now-ledger.backup.at>600_000||readBackup(ledger.backup.path)!==ledger.backup.sha256)throw new Error('A verified recent profile backup is required');
	const current=sample(ledger.process.pid);
	if(hostIdentity(current)!==hostIdentity(ledger.process)||cwd(current.pid)!==state.directory)throw new Error('Process identity changed; refusing termination');
	if(JSON.stringify(files(state.directory))!==JSON.stringify(state.files))throw new Error('Candidate drift; refusing injection');
	return current;
}
export function readOwnerLedger(file){if(!file||!fs.statSync(file).isFile())throw new Error('Owned process ledger required');return JSON.parse(fs.readFileSync(file));}
