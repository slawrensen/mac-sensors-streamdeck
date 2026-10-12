import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {sampleHost,hostIdentity} from '../../scripts/lib/soak-host.mjs';
import {readFreshness} from '../../scripts/lib/soak-freshness.mjs';
import {slopeMiBPer30Minutes,summarizeSoak} from '../../scripts/lib/soak-analysis.mjs';
test('resource observer measures real CPU time and precise process identity',async()=>{
	const child=spawn(process.execPath,['-e',`process.stdout.write('ready\\n');process.stdin.once('data',()=>{const a=process.cpuUsage(),start=performance.now();while(performance.now()-start<700){};process.stdout.write(JSON.stringify(process.cpuUsage(a))+'\\n');});setInterval(()=>{},1000);`],{stdio:['pipe','pipe','pipe']});
	try{
		let text='';child.stdout.on('data',data=>{text+=data;});const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Child observation timeout');};
		await wait(()=>text.includes('ready\n'));const before=sampleHost(child.pid);child.stdin.write('run\n');await wait(()=>text.split('\n').length>=3);const after=sampleHost(child.pid),own=JSON.parse(text.split('\n')[1]);
		assert.equal(hostIdentity(before),hostIdentity(after));assert.ok(after.rssBytes>0&&after.footprintBytes>0&&after.fileDescriptors>=3&&after.threads>0);
		const measured=(after.cpuUserNs+after.cpuSystemNs-before.cpuUserNs-before.cpuSystemNs)/1000,expected=own.user+own.system;assert.ok(measured>expected*.9&&measured<expected*1.3+20000,JSON.stringify({measured,expected}));
	}finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
});
test('dead and malformed PIDs never produce invented zero metrics',()=>{assert.throws(()=>sampleHost(-1));const result=spawnSync('build/observer/process-observer',['2147483647'],{encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(JSON.parse(result.stdout).ok,false);});
test('freshness requires both genuine sources and expires their own acquisition times',t=>{
	const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mac-freshness-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'trace.jsonl');
	const write=sources=>fs.writeFileSync(file,JSON.stringify({event:'sourceObservation',wall:100,note:JSON.stringify({sources})})+'\n');
	const sources=['system','smc'].map(source=>({source,rows:2,observation:4,acquired:1000}));write(sources);assert.equal(readFreshness(file,1500).valid,true);assert.equal(readFreshness(file,16001).valid,false);assert.equal(readFreshness(file,900).valid,false);
	write([sources[0],{...sources[1],rows:0,acquired:null}]);assert.equal(readFreshness(file,1500).valid,false);
});
test('soak slopes use elapsed time and a short or incomplete window cannot pass',()=>{
	const metrics=[0,1,2].map(index=>({continuousMs:index*1_800_000,rssBytes:(100+index*.5)*1048576,footprintBytes:30*1048576,fileDescriptors:20,cpuUserNs:index*1e9,cpuSystemNs:0}));assert.equal(slopeMiBPer30Minutes(metrics),.5);assert.equal(slopeMiBPer30Minutes(metrics.slice(0,2)),null);
	assert.equal(summarizeSoak(metrics.map(row=>({type:'sample',continuousMs:row.continuousMs,identity:'one',metrics:row,flags:[]}))).passed,false);
	const rows=Array.from({length:1441},(_,i)=>({type:'sample',continuousMs:i*60000,identity:'one',metrics:{...metrics[0],continuousMs:i*60000},flags:[]}));assert.equal(summarizeSoak(rows).passed,true);rows[100].flags=[{kind:'missing',explained:false}];assert.equal(summarizeSoak(rows).passed,false);
});

test('adversary requires the exact owned generation, candidate and recent verified backup',async()=>{
	const {validateOwnedTarget}=await import('../../scripts/lib/soak-adversary-safety.mjs');
	const row={pid:123,startSeconds:100,startMicroseconds:42,executable:'/fixture/node'},state={directory:'/fixture/plugin',files:{bundle:'a'}},hash='a'.repeat(64),ledger={authority:'task-started-plugin',uuid:'com.lawrensen.macdev',directory:state.directory,process:row,backup:{path:'/fixture/backup',sha256:hash,at:1000}};
	const hooks={sample:()=>row,cwd:()=>state.directory,files:()=>state.files,readBackup:()=>hash,now:1001};
	assert.equal(validateOwnedTarget(ledger,state,hooks),row);
	for(const changed of [{authority:'discovered'},{uuid:'com.other.plugin'},{process:{...row,startMicroseconds:43}},{backup:{...ledger.backup,at:1}}])assert.throws(()=>validateOwnedTarget({...ledger,...changed},state,{...hooks,now:changed.backup?1_000_000:1001}));
	assert.throws(()=>validateOwnedTarget(ledger,state,{...hooks,cwd:()=>'/other/plugin'}));assert.throws(()=>validateOwnedTarget(ledger,state,{...hooks,files:()=>({bundle:'changed'})}));assert.throws(()=>validateOwnedTarget(ledger,state,{...hooks,readBackup:()=> 'b'.repeat(64)}));
});

test('local e2e refuses an active hardware-soak lock',t=>{
	const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mac-soak-lock-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'build/observer'),{recursive:true});fs.copyFileSync('build/observer/process-observer',path.join(dir,'build/observer/process-observer'));fs.chmodSync(path.join(dir,'build/observer/process-observer'),0o755);
	fs.writeFileSync(path.join(dir,'build/soak-active.json'),JSON.stringify({monitor:sampleHost(process.pid)}));
	const script=path.resolve('scripts/lib/no-active-soak.mjs'),result=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/active hardware soak forbids/);
});
