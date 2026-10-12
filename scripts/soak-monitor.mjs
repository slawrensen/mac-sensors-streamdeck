// Observer only. Fault injection belongs to soak-adversary.mjs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {candidateFiles,discoverPlugin,hostIdentity,runtimeFacts,sampleHost,sha256} from './lib/soak-host.mjs';
import {makeLogTail} from './lib/soak-log-tail.mjs';
import {readFreshness} from './lib/soak-freshness.mjs';
import {summarizeSoak} from './lib/soak-analysis.mjs';
import {validateNativeFiles} from './validate-native.mjs';
const args=process.argv.slice(2),option=(key,fallback)=>{const at=args.indexOf(key);return at<0?fallback:args[at+1];};
const directory=fs.realpathSync(option('--plugin','build/com.lawrensen.macdev.sdPlugin')),out=path.resolve(option('--out','build/soak'));
const hours=Number(option('--hours','24')),intervalMs=Number(option('--interval-ms','60000'));
if(!Number.isFinite(hours)||hours<=0||!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>60000)throw new Error('Invalid observation window');
if(fs.existsSync(out)&&fs.readdirSync(out).length)throw new Error('Use a fresh soak directory');fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
if(manifest.UUID!=='com.lawrensen.macdev')throw new Error('The soak expects the isolated development identity');
const activeLock='build/soak-active.json';if(fs.existsSync(activeLock))throw new Error('Resolve the existing soak lock first');
const initial=discoverPlugin(directory);if(!initial)throw new Error('Candidate process is not running');
validateNativeFiles(path.join(directory,'bin'),JSON.parse(fs.readFileSync('build/native/build-record.json')).sourceId,{bin:true});
if(hours>=24&&!readFreshness(path.join(directory,'logs',`trace-${initial.pid}.jsonl`),()=>sampleHost(process.pid).continuousMs).valid)throw new Error('A formal soak requires fresh real-process evidence from both sources before starting');
const files=candidateFiles(directory),eventsFile=path.join(out,'events.jsonl'),logFile=path.join(out,'observations.jsonl');fs.writeFileSync(eventsFile,'');
const initialClock=sampleHost(process.pid),start=initialClock.continuousMs,startWall=initialClock.wallMs;
const state={schema:1,directory,manifestVersion:manifest.Version,pluginUuid:manifest.UUID,startedAt:new Date(startWall).toISOString(),startContinuousMs:start,intervalMs,hours,monitor:sampleHost(process.pid),initialProcess:initial,files,observerSha256:sha256('build/observer/process-observer'),scope:'Actual Stream Deck app, development identity; device scope must be stated separately',os:{version:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),build:execFileSync('sw_vers',['-buildVersion'],{encoding:'utf8'}).trim()}};
fs.writeFileSync(path.join(out,'state.json'),JSON.stringify(state,null,2)+'\n');
if(hours>=24)fs.writeFileSync(activeLock,JSON.stringify({monitor:state.monitor,out})+'\n',{flag:'wx'});
const logTail=makeLogTail(path.join(directory,'logs'));logTail();
const rows=[],runtimes=new Map();let lastClock=start,lastAwake=initialClock.awakeMs,lastIdentity=hostIdentity(initial),stopping=false,nextDue=start;
const awake=spawn('/usr/bin/caffeinate',['-i','-w',String(process.pid)],{stdio:'ignore'});
process.once('SIGINT',()=>{stopping=true;});process.once('SIGTERM',()=>{stopping=true;});
const append=row=>{rows.push(row);fs.appendFileSync(logFile,JSON.stringify(row)+'\n');};
const events=()=>fs.readFileSync(eventsFile,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
try {
	for(;;){
		const clock=sampleHost(process.pid),row={type:'sample',at:new Date(clock.wallMs).toISOString(),continuousMs:clock.continuousMs,flags:[]};
		const sleepGap=clock.continuousMs-lastClock-(clock.awakeMs-lastAwake);
		if(sleepGap>1000)fs.appendFileSync(eventsFile,JSON.stringify({id:`sleep-${clock.continuousMs}`,type:'observed-sleep-resume',verified:true,continuousMs:clock.continuousMs,sleepMs:sleepGap,at:row.at})+'\n');
		const planned=events().find(event=>['plugin-kill','observed-sleep-resume'].includes(event.type)&&event.verified===true&&clock.continuousMs>=event.continuousMs&&clock.continuousMs-event.continuousMs<=120_000);
		const flag=(kind,detail,allowFault=false)=>row.flags.push({kind,detail,explained:Boolean(allowFault&&planned),eventId:allowFault&&planned?planned.id:null});
		if(clock.continuousMs-lastClock>intervalMs*1.5)flag('sampling-gap',clock.continuousMs-lastClock,sleepGap>1000);
		lastClock=clock.continuousMs;lastAwake=clock.awakeMs;
		try {
			if(JSON.stringify(candidateFiles(directory))!==JSON.stringify(files))flag('candidate-drift','Candidate file bytes or inventory changed');
			const metrics=discoverPlugin(directory);row.metrics=metrics;
			if(!metrics)flag('process-missing','No matching candidate process',true);
			else {
				row.identity=hostIdentity(metrics);row.appPid=metrics.parentPid;
				if(row.identity!==lastIdentity){row.restarted=true;if(!planned)flag('unplanned-restart',row.identity);lastIdentity=row.identity;}
				if(!runtimes.has(row.identity))runtimes.set(row.identity,runtimeFacts(metrics));row.runtime=runtimes.get(row.identity);
				row.freshness=readFreshness(path.join(directory,'logs',`trace-${metrics.pid}.jsonl`),()=>sampleHost(process.pid).continuousMs);
				if(!row.freshness.valid)flag('freshness',row.freshness.reason,true);
			}
			row.logs=logTail();if(['logs-missing','log-rotated-tail-lost'].includes(row.logs.note))flag('log-observation',row.logs.note);if(row.logs.warn||row.logs.error)flag('plugin-log',{warn:row.logs.warn,error:row.logs.error});
		}catch(error){flag('observation-error',String(error));}
		append(row);fs.writeFileSync(path.join(out,'live-summary.json'),JSON.stringify(summarizeSoak(rows),null,2)+'\n');
		if(stopping||clock.continuousMs-rows[0].continuousMs>=hours*3_600_000)break;
		nextDue+=intervalMs;const now=sampleHost(process.pid).continuousMs;if(nextDue<now)nextDue=now+intervalMs;
		await new Promise(resolve=>setTimeout(resolve,Math.max(0,nextDue-now)));
	}
}finally{
	if(awake.exitCode===null)awake.kill('SIGTERM');
	if(fs.existsSync(activeLock)){const lock=JSON.parse(fs.readFileSync(activeLock));if(hostIdentity(lock.monitor)===hostIdentity(state.monitor))fs.unlinkSync(activeLock);}
	const crashReports=[],crashScanErrors=[];
	for(const directory of ['/Library/Logs/DiagnosticReports',path.join(os.homedir(),'Library/Logs/DiagnosticReports')])if(fs.existsSync(directory))for(const name of fs.readdirSync(directory)){const file=path.join(directory,name);try{if(fs.statSync(file).isFile()&&fs.statSync(file).mtimeMs>=startWall&&/\.(?:ips|crash|panic)$/i.test(name))crashReports.push({name,sha256:sha256(file),modifiedAt:new Date(fs.statSync(file).mtimeMs).toISOString()});}catch(error){crashScanErrors.push({name,error:String(error)});}}
	const summary={...summarizeSoak(rows),stoppedEarly:stopping,events:events(),newDiagnosticReports:crashReports,crashScanErrors,crashReview:crashReports.length?'REVIEW REQUIRED':'No new report filenames found in both inspected directories'};
	if(crashReports.length||crashScanErrors.length||stopping)summary.passed=false;
	fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));if(!summary.passed)process.exitCode=1;
}
