// Read-only steady-state benchmark. No child process is launched per sample.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
const folder=process.argv[2]??'build/native-bench';fs.mkdirSync(folder,{recursive:true});
const architecture=process.arch==='x64'?'x86_64':'arm64';
const file=path.resolve(`build/native/production/hwmac-${architecture}.node`),native=createRequire(import.meta.url)(file);
const sha256=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const startInfo={pid:process.pid,node:process.version,architecture:process.arch,sha256,build:native.getBuildInfo(),startedAt:new Date().toISOString()};
fs.writeFileSync(path.join(folder,'run.json'),JSON.stringify(startInfo,null,2)+'\n');console.log(JSON.stringify(startInfo));
const session=native.open(),results=[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const percentile=(array,p)=>{const sorted=[...array].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];};
try {
	// Every sample reads all three sources at once, the worst case: the provider asks health at most every 1.5 s.
	const cold=await Promise.all([session.read('public'),session.read('smc'),session.read('health')]);
	if(cold.slice(0,2).some(packet=>!packet.rows.some(row=>row.valid)))throw new Error('Public and SMC need a qualified live observation for this benchmark');fs.writeFileSync(path.join(folder,'cold.json'),JSON.stringify(cold,null,2)+'\n');
	for(let i=0;i<20;i++)await Promise.all([session.read('public'),session.read('smc'),session.read('health')]);
	for(const interval of [1000,250]) {
		const beginning=performance.now(),rows=[];const output=fs.openSync(path.join(folder,`${interval}ms.jsonl`),'w');
		try {
			for(let sample=0;sample<1000;sample++) {
				await wait(Math.max(0,beginning+sample*interval-performance.now()));
				const before=performance.now();let heartbeat;
				const responsive=new Promise(resolve=>{heartbeat=setTimeout(()=>resolve(performance.now()-before),1);});
				const [system,smc,health]=await Promise.all([session.read('public'),session.read('smc'),session.read('health')]);const elapsed=performance.now()-before;
				const eventLoopMs=await responsive;clearTimeout(heartbeat);
				const row={sample,interval,at:new Date().toISOString(),elapsedMs:elapsed,publicMs:system.durationMs,smcMs:smc.durationMs,healthMs:health.durationMs,eventLoopMs,publicRows:system.rows.filter(r=>r.valid).length,smcRows:smc.rows.filter(r=>r.valid).length,healthRows:health.rows.filter(r=>r.valid).length,errors:[system.error,smc.error,health.error],rss:process.memoryUsage().rss};
				rows.push(row);fs.writeSync(output,JSON.stringify(row)+'\n');
			}
		}finally{fs.closeSync(output);}
		const result={interval,samples:rows.length,elapsedSeconds:(performance.now()-beginning)/1000,p50Ms:{total:percentile(rows.map(r=>r.elapsedMs),.5),public:percentile(rows.map(r=>r.publicMs),.5),smc:percentile(rows.map(r=>r.smcMs),.5),health:percentile(rows.map(r=>r.healthMs),.5)},p99Ms:{total:percentile(rows.map(r=>r.elapsedMs),.99),public:percentile(rows.map(r=>r.publicMs),.99),smc:percentile(rows.map(r=>r.smcMs),.99),health:percentile(rows.map(r=>r.healthMs),.99),eventLoop:percentile(rows.map(r=>r.eventLoopMs),.99)},maxRss:Math.max(...rows.map(r=>r.rss)),minimumValidRows:{public:Math.min(...rows.map(r=>r.publicRows)),smc:Math.min(...rows.map(r=>r.smcRows)),health:Math.min(...rows.map(r=>r.healthRows))},errors:rows.filter(r=>r.errors.some(Boolean)||r.publicRows===0||r.smcRows===0).length};
		results.push(result);console.log(JSON.stringify(result));
	}
}finally{session.close();fs.writeFileSync(path.join(folder,'summary.json'),JSON.stringify({...startInfo,finishedAt:new Date().toISOString(),results},null,2)+'\n');}
if(results.length!==2||results.some(r=>r.p99Ms.total>25||r.errors))process.exitCode=1;
