// Read-only steady-state benchmark. No child process is launched per sample.
// With --control <file.node> (the shipped reader for this architecture) the candidate and the control read in turn, each
// tick DRIFT_MS later than the interval, so both meet every phase of another app's periodic SMC load alike (D104).
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
// The acquisition budget; how much slower than the control a candidate may be at p99 when the control itself is over
// budget, which means outside load rather than the candidate; and the per-tick drift that walks the read phase.
const BUDGET_MS=25,CONTROL_MARGIN=1.25,DRIFT_MS=3,SAMPLES=1000;
const args=process.argv.slice(2),controlAt=args.indexOf('--control'),controlArg=controlAt<0?-1:controlAt+1;
if(controlAt>=0&&!args[controlArg])throw new Error('--control needs the shipped reader file');
const folder=args.find((arg,index)=>index!==controlAt&&index!==controlArg)??'build/native-bench';fs.mkdirSync(folder,{recursive:true});
const architecture=process.arch==='x64'?'x86_64':'arm64';
const load=file=>({file,native:createRequire(import.meta.url)(file),sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
const candidate=load(path.resolve(`build/native/production/hwmac-${architecture}.node`)),control=controlAt<0?null:load(path.resolve(args[controlArg]));
const startInfo={pid:process.pid,node:process.version,architecture:process.arch,sha256:candidate.sha256,build:candidate.native.getBuildInfo(),control:control&&{sha256:control.sha256,build:control.native.getBuildInfo()},startedAt:new Date().toISOString()};
fs.writeFileSync(path.join(folder,'run.json'),JSON.stringify(startInfo,null,2)+'\n');console.log(JSON.stringify(startInfo));
const session=candidate.native.open(),controlSession=control?.native.open(),results=[];
// The candidate reads all three sources at once, the worst case: the provider asks health at most every 1.5 s. The shipped 1.0.1 reader has no health source.
const arms=[{name:'candidate',session,sources:['public','smc','health']},...(controlSession?[{name:'control',session:controlSession,sources:['public','smc']}]:[])];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const percentile=(array,p)=>{const sorted=[...array].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];};
const readAll=arm=>Promise.all(arm.sources.map(source=>arm.session.read(source)));
const summarize=(interval,rows)=>{const of=key=>rows.map(r=>r[key]).filter(v=>v!==undefined),health=of('healthMs');return {interval,samples:rows.length,p50Ms:{total:percentile(of('elapsedMs'),.5),public:percentile(of('publicMs'),.5),smc:percentile(of('smcMs'),.5),...(health.length?{health:percentile(health,.5)}:{})},p99Ms:{total:percentile(of('elapsedMs'),.99),public:percentile(of('publicMs'),.99),smc:percentile(of('smcMs'),.99),...(health.length?{health:percentile(health,.99)}:{}),eventLoop:percentile(of('eventLoopMs'),.99)},maxRss:Math.max(...of('rss')),minimumValidRows:{public:Math.min(...of('publicRows')),smc:Math.min(...of('smcRows')),...(health.length?{health:Math.min(...of('healthRows'))}:{})},errors:rows.filter(r=>r.errors.some(Boolean)||r.publicRows===0||r.smcRows===0).length};};
// Without a control the budget is absolute. With one, a candidate p99 over budget passes only when the control in the same run is over budget too and the candidate stays within CONTROL_MARGIN of it.
const verdict=(result,controlResult)=>{
	if(result.errors)return 'source errors';
	if(result.p50Ms.total>BUDGET_MS)return 'median over budget';
	if(result.p99Ms.total<=BUDGET_MS)return 'pass';
	if(!controlResult)return 'p99 over budget';
	if(controlResult.errors)return 'control errors';
	if(controlResult.p99Ms.total<=BUDGET_MS)return 'p99 over budget while the control is within it';
	return result.p99Ms.total<=controlResult.p99Ms.total*CONTROL_MARGIN?'pass under outside load':'p99 over the control margin';
};
try {
	const cold=await readAll(arms[0]);
	if(cold.slice(0,2).some(packet=>!packet.rows.some(row=>row.valid)))throw new Error('Public and SMC need a qualified live observation for this benchmark');fs.writeFileSync(path.join(folder,'cold.json'),JSON.stringify(cold,null,2)+'\n');
	for(const arm of arms)for(let i=0;i<20;i++)await readAll(arm);
	for(const interval of [1000,250]) {
		const beginning=performance.now(),rows=[],step=control?interval+DRIFT_MS:interval;const output=fs.openSync(path.join(folder,`${interval}ms.jsonl`),'w');
		try {
			for(let tick=0;tick<SAMPLES*arms.length;tick++) {
				await wait(Math.max(0,beginning+tick*step-performance.now()));
				const arm=arms[tick%arms.length],before=performance.now();let heartbeat;
				const responsive=new Promise(resolve=>{heartbeat=setTimeout(()=>resolve(performance.now()-before),1);});
				const packets=await readAll(arm);const elapsed=performance.now()-before;
				const eventLoopMs=await responsive;clearTimeout(heartbeat);
				const row={arm:arm.name,sample:Math.floor(tick/arms.length),interval,at:new Date().toISOString(),elapsedMs:elapsed,eventLoopMs,errors:packets.map(p=>p.error),rss:process.memoryUsage().rss};
				arm.sources.forEach((source,i)=>{row[`${source}Ms`]=packets[i].durationMs;row[`${source}Rows`]=packets[i].rows.filter(r=>r.valid).length;});
				rows.push(row);fs.writeSync(output,JSON.stringify(row)+'\n');
			}
		}finally{fs.closeSync(output);}
		const own=summarize(interval,rows.filter(r=>r.arm==='candidate')),reference=control?summarize(interval,rows.filter(r=>r.arm==='control')):null;
		const result={...own,elapsedSeconds:(performance.now()-beginning)/1000,...(reference?{control:reference}:{}),verdict:verdict(own,reference)};
		results.push(result);console.log(JSON.stringify(result));
	}
}finally{session.close();controlSession?.close();fs.writeFileSync(path.join(folder,'summary.json'),JSON.stringify({...startInfo,finishedAt:new Date().toISOString(),budgetMs:BUDGET_MS,controlMargin:control?CONTROL_MARGIN:null,results},null,2)+'\n');}
if(results.length!==2||results.some(r=>!r.verdict.startsWith('pass')))process.exitCode=1;
