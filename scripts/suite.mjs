import './lib/no-active-soak.mjs';
import './lib/script-failures.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {processSnapshot,processIdentity,ownedDescendants} from './lib/process-ownership.mjs';
import {verifyBuild} from './lib/build-evidence.mjs';
verifyBuild('build/plugin');verifyBuild('build/test-plugin',true);
const modes=['core','resilience','native-edge','drilldown','load','socket-close'];
const jobs=[...modes.map(mode=>({mode,args:['scripts/e2e.mjs',mode]})),{mode:'pi',args:['scripts/e2e-pi-persistence.mjs']},{mode:'pi-panels',args:['--import','tsx','scripts/e2e-pi-panels.mjs']},{mode:'catalog-panel',args:['--import','tsx','scripts/test-catalog-panel.mjs']},{mode:'panel-focus',args:['--import','tsx','scripts/test-panel-focus.mjs']}];
const results=[],before=processSnapshot(),root=before.find(row=>row.pid===process.pid);
const browserRoot=fs.mkdtempSync(path.join(os.tmpdir(),'mac-sensors-suite-'));
if(!root)throw new Error('Suite process identity unavailable');
const identity=processIdentity(root),recorded=new Map([[identity,root]]);
const observe=()=>{for(const row of ownedDescendants(processSnapshot(),new Set(recorded.keys())))if(!row.commandLine.startsWith('/bin/ps '))recorded.set(processIdentity(row),row);};
let observationError;
const timer=setInterval(()=>{try{observe();}catch(error){observationError=String(error);}},100);
try {
	for(const job of jobs){
		const child=spawn(process.execPath,job.args,{stdio:'inherit',env:{...process.env,TSX_TSCONFIG_PATH:'tsconfig.mac.json',MACSENSORS_SUITE_BROWSER_ROOT:browserRoot}});
		observe();
		const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
		results.push({mode:job.mode,passed:status===0});if(status!==0)break;
	}
}finally{clearInterval(timer);}
await new Promise(resolve=>setTimeout(resolve,1000));
const after=processSnapshot(),orphans=after.filter(row=>recorded.has(processIdentity(row))&&processIdentity(row)!==identity);
const ambiguous=after.filter(row=>!recorded.has(processIdentity(row))&&row.commandLine.includes(browserRoot));
fs.mkdirSync('build',{recursive:true});
fs.writeFileSync('build/suite.json',JSON.stringify({scope:'Built bundles, mock host, isolated fake addon and staged panels in Chromium',results,processSweep:{recordedDescendants:recorded.size-1,remainingOwned:orphans.map(row=>({pid:row.pid,createdAt:row.createdAt})),ambiguous:ambiguous.map(row=>({pid:row.pid,createdAt:row.createdAt})),observationError:observationError??null}},null,2)+'\n');
if(!orphans.length&&!ambiguous.length)fs.rmSync(browserRoot,{recursive:true,force:true});
if(results.length!==jobs.length||results.some(result=>!result.passed)||orphans.length||ambiguous.length||observationError)process.exitCode=1;
verifyBuild('build/plugin');verifyBuild('build/test-plugin',true);
