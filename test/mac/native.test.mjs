import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';
const require=createRequire(import.meta.url),arch=process.arch==='x64'?'x86_64':'arm64';
const nativePath=path.resolve(`build/native/test/hwmac-${arch}.node`);
const native=require(nativePath),production=require(path.resolve(`build/native/production/hwmac-${arch}.node`));
const reset=()=>native.configure({public:{delayMs:0,fault:0,value:68719476736},smc:{delayMs:0,fault:0,value:30},health:{delayMs:0,fault:0,value:82}});
test('production surface has only read capabilities; fake and wrong-protocol artifacts identify themselves',()=>{
	assert.deepEqual(Object.getOwnPropertyNames(production).sort(),['getBuildInfo','now','open']);assert.equal(production.getBuildInfo().testHooks,false);assert.equal(native.getBuildInfo().testHooks,true);
	assert.equal(require(path.resolve(`build/native/wrong-protocol/hwmac-${arch}.node`)).getBuildInfo().protocol,999);
	assert.equal(production.getBuildInfo().arch,process.arch);assert.ok(production.now()>0);
});
test('all command bytes except the three reads are rejected before transport',()=>{
	for(let command=0;command<=255;command++) {
		const result=native.testCommand(command),allowed=[5,8,9].includes(command);
		assert.equal(result.transportCalls,allowed?1:0,`command ${command}`);assert.equal(result.error===0,allowed);
	}
});
test('transport status, exact returned length and firmware errors are independent',()=>{
	assert.deepEqual(native.testTransport(80,0,0),{error:0,systemCode:0,firmwareCode:0});
	assert.equal(native.testTransport(79,0,0).error,4);assert.equal(native.testTransport(81,0,0).error,4);
	assert.deepEqual(native.testTransport(80,5,0),{error:3,systemCode:5,firmwareCode:0});
	assert.deepEqual(native.testTransport(80,0,132),{error:5,systemCode:0,firmwareCode:132});
});
test('typed decoders preserve zero, signed and fractional values, and refuse bad sizes/nonfinite values',()=>{
	assert.equal(native.testDecode('sp78',Buffer.from([0xf6,0x80])),-9.5);assert.equal(native.testDecode('fpe2',Buffer.from([0x0b,0xba])),750.5);
	for(const value of [0,-12.25,53.5,NaN,Infinity,-Infinity]){const bytes=Buffer.alloc(4);bytes.writeFloatLE(value);assert.equal(native.testDecode('flt ',bytes),Number.isFinite(value)?value:null);}
	assert.equal(native.testDecode('ui8 ',Buffer.from([0])),0);assert.equal(native.testDecode('ui16',Buffer.from([1,0])),256);assert.equal(native.testDecode('ui32',Buffer.from([0,1,0,0])),65536);
	for(const type of ['flt ','sp78','fpe2','ui8 ','ui16','ui32','xxxx'])assert.equal(native.testDecode(type,Buffer.alloc(7)),null);
});
test('generation tables require the qualified runtime model, chip and hardware family',()=>{
	assert.deepEqual(native.testCatalog('Mac17,9','t6050',1),{common:true,apple:true,m5:true});
	for(const [model,chip,family] of [['Unknown','t6050',1],['Mac17,9','unknown',1],['Mac17,9','t6050',0],['Mac17,9','t6050',-1]])assert.equal(native.testCatalog(model,chip,family).m5,false);
	const catalog=JSON.parse(fs.readFileSync('native/hwmac/catalog.json','utf8'));assert.equal(new Set(catalog.rows.map(r=>r.key)).size,catalog.rows.length);assert.equal(catalog.rows.filter(r=>r.scope==='m5').length,39);
	// TG Pro parity on Mac17,9: each key was matched to a TG Pro reading or is a fan limit TG Pro reads; all stay read-only rows of existing kinds.
	const parity={TaTP:['Airflow top','System','temperature'],TCHP:['Charger proximity','System','temperature'],TPSP:['Power supply proximity','System','temperature'],TaLT:['Thunderbolt left','System','temperature'],TaRT:['Thunderbolt right','System','temperature'],Ts0P:['Trackpad','System','temperature'],Ts1P:['Trackpad actuator','System','temperature'],F0Tg:['Fan 1 target','Fans','fan'],F1Tg:['Fan 2 target','Fans','fan'],F0Mn:['Fan 1 minimum','Fans','fan'],F1Mn:['Fan 2 minimum','Fans','fan'],F0Mx:['Fan 1 maximum','Fans','fan'],F1Mx:['Fan 2 maximum','Fans','fan']};
	for(const [key,[label,group,type]] of Object.entries(parity))assert.deepEqual((({label,group,type,scope})=>({label,group,type,scope}))(catalog.rows.find(r=>r.key===key)??{}),{label,group,type,scope:'m5'},key);
});
// getifaddrs if_data byte counters are 32-bit (SDK net/if_var.h); a fixture link carries its true 64-bit counters and the hook stores only their low 32 bits there.
const WRAP=2n**32n,link=(name,index,received,sent,extra={})=>({name,index,received,sent,...extra});
/** Mirrors membership() in native/hwmac/collectors.c byte for byte, including its offset basis: an FNV-1a style hash of the sorted en unit numbers, 8 little-endian bytes each. */
const membership=units=>{let hash=1469598103934665603n;for(const unit of [...units].sort((a,b)=>a-b))for(let shift=0n;shift<64n;shift+=8n){hash^=(BigInt(unit)>>shift)&255n;hash=(hash*1099511628211n)%(2n**64n);}return hash.toString();};
test('network byte counters cross a 4 GiB boundary as an increase, never as a decrease',()=>{
	const before=native.testNetwork([link('en0',15,WRAP-1000n,WRAP-300n),link('en1',10,5000n,7000n)]);
	const after=native.testNetwork([link('en0',15,WRAP+500n,WRAP+400n),link('en1',10,5000n,7000n)]);
	assert.equal(before.networkValid,true);assert.equal(after.networkValid,true);assert.equal(after.networkMembers,before.networkMembers);
	assert.equal(BigInt(after.networkIn)-BigInt(before.networkIn),1500n);assert.equal(BigInt(after.networkOut)-BigInt(before.networkOut),700n);
	// More than 4 GiB in one interval stays exact instead of aliasing to the residue.
	const far=native.testNetwork([link('en0',15,3n*WRAP+500n,WRAP+400n),link('en1',10,5000n,7000n)]);assert.equal(BigInt(far.networkIn)-BigInt(before.networkIn),2n*WRAP+1500n);
});
test('network eligibility and membership are unchanged: each en<digits> Ethernet link once, hashed by unit number',()=>{
	const links=[link('en0',15,100n,200n),link('en1',10,1n,2n),link('en01',20,1000n,1000n),link('bridge0',13,1000n,1000n),link('en2',12,1000n,1000n,{type:209}),link('en3a',7,1000n,1000n),link('en',8,1000n,1000n),link('en4',9,1000n,1000n,{inet:true}),link('en5',11,1000n,1000n,{noData:true})];
	assert.deepEqual(native.testNetwork(links),{networkValid:true,networkIn:'101',networkOut:'202',networkMembers:membership([0,1])});
	assert.deepEqual(native.testNetwork([]),{networkValid:false,networkIn:'0',networkOut:'0',networkMembers:membership([])});
	assert.throws(()=>native.testNetwork([link('en0',15,1,2)]),{code:'HWMAC_ARGUMENT'});assert.throws(()=>native.testNetwork([link('en0',15,-1n,2n)]),{code:'HWMAC_ARGUMENT'});
});
test('a link whose 64-bit counters cannot be read, or whose index now names another link, withholds network counters',()=>{
	for(const extra of [{readable:false},{reported:'en9'},{index:0}])assert.equal(native.testNetwork([link('en1',10,1n,2n),link('en0',15,100n,200n,extra)]).networkValid,false,JSON.stringify(extra));
	assert.equal(native.testNetwork([link('en0',15,2n**64n-1n,1n),link('en1',10,1n,1n)]).networkValid,false,'a sum past 2^64 is refused, not wrapped');
});
test('live public network counters equal the 64-bit link totals netstat reports',async t=>{
	// netstat holds a private statistics entitlement; the addon must reach the same totals without one. Link rows only; address rows repeat the counters.
	const totals=()=>{let received=0n,sent=0n,largest=0n;for(const line of execFileSync('/usr/sbin/netstat',['-ibn'],{encoding:'utf8'}).split('\n').slice(1)){const fields=line.trim().split(/\s+/);if(fields.length<10||!/^en[0-9]+\*?$/.test(fields[0])||!/^<Link#[0-9]+>$/.test(fields[2]))continue;const ibytes=BigInt(fields.at(-5)),obytes=BigInt(fields.at(-2));received+=ibytes;sent+=obytes;for(const value of [ibytes,obytes])if(value>largest)largest=value;}return {received,sent,largest};};
	const before=totals(),session=production.open();let packet;try{packet=await session.read('public');}finally{session.close();}const after=totals();
	t.diagnostic(`largest en counter ${after.largest} bytes, ${after.largest>=WRAP?'past':'below'} 2^32`);
	assert.equal(packet.networkValid,true);
	for(const [key,field] of [['networkIn','received'],['networkOut','sent']]){const value=BigInt(packet[key]);assert.ok(before[field]<=value&&value<=after[field],`${key} ${value} outside netstat ${before[field]} to ${after[field]}`);}
});
test('type tags, arguments and idempotent close fail closed',()=>{
	const session=native.open();
	assert.throws(()=>session.read.call({},'smc'),{code:'HWMAC_RECEIVER'});assert.throws(()=>session.close.call({}),{code:'HWMAC_RECEIVER'});
	assert.throws(()=>session.read('public\0bad'),{code:'HWMAC_ARGUMENT'});assert.throws(()=>session.read('unknown'),{code:'HWMAC_ARGUMENT'});assert.throws(()=>session.read(42),{code:'HWMAC_ARGUMENT'});assert.throws(()=>native.open({}),{code:'HWMAC_ARGUMENT'});
	session.close();session.close();assert.throws(()=>session.read('public'),{code:'HWMAC_CLOSED'});
});
test('slow optional reads do not prevent public counters; replacement sessions cannot multiply pending jobs',async()=>{
	reset();native.configure({smc:{delayMs:200}});const first=native.open(),second=native.open();
	const slow=first.read('smc');const closed=assert.rejects(slow,{code:'HWMAC_CLOSED'});
	const quick=await first.read('public');assert.ok(quick.rows[0].valid);assert.throws(()=>second.read('smc'),{code:'HWMAC_BUSY'});
	first.close();assert.throws(()=>second.read('smc'),{code:'HWMAC_BUSY'});await closed;
	native.configure({smc:{delayMs:0}});assert.ok((await second.read('smc')).rows[0].valid);second.close();reset();
});
test('the health source is a third independent read slot with its own fixture row',async()=>{
	reset();const session=native.open();
	const packet=await session.read('health');assert.equal(packet.source,'health');assert.equal(packet.operation,'health.read');
	assert.deepEqual(packet.rows.map(r=>[r.key,r.label,r.group,r.kind,r.unit,r.value,r.valid,r.operation]),[['battery-cycles','Battery cycles','Battery','count','cycles',82,true,'health.read']]);
	native.configure({health:{delayMs:200}});const slow=session.read('health');assert.throws(()=>session.read('health'),{code:'HWMAC_BUSY'});
	const quick=await Promise.all([session.read('public'),session.read('smc')]);assert.ok(quick.every(item=>item.rows[0].valid),'a slow health read never holds the other sources');assert.equal((await slow).rows[0].valid,true);
	for(const name of ['Health','healthy','health\0','heal',''])assert.throws(()=>session.read(name),{code:'HWMAC_ARGUMENT'},JSON.stringify(name));
	session.close();reset();
});
test('the production health source names only public battery and drive rows and needs no privilege',async()=>{
	assert.notEqual(process.getuid(),0,'run as the logged-in user, never root');
	const session=production.open();let packet;try{packet=await session.read('health');}finally{session.close();}
	assert.equal(packet.source,'health');assert.equal(packet.error,0);assert.equal(packet.operation,'health.read');
	const allowed={'battery-cycles':['Battery cycles','Battery','count','cycles'],'battery-health':['Battery health','Battery','percent','%'],'ssd-temperature':['Internal SSD','Storage','temperature','°C']};
	assert.equal(new Set(packet.rows.map(row=>row.key)).size,packet.rows.length);
	for(const row of packet.rows){assert.deepEqual([row.label,row.group,row.kind,row.unit],allowed[row.key],row.key);if(row.valid)assert.ok(Number.isFinite(row.value)&&row.continuousMs<=packet.continuousMs,row.key);else assert.notEqual(row.error,0,row.key);}
});
test('on the qualified Mac17,9 a health read stays a small part of the 25 ms acquisition budget',async()=>{
	// The drive is found among block storage devices; matching the SMART property over the whole registry took 2 to 9 ms there.
	// Reads are spaced as the provider spaces them (at least 1.5 s apart, shortened here): back-to-back reads are faster than real ones.
	const HEALTH_P50_LIMIT_MS=3,READS=11,SPACING_MS=200;const session=production.open(),durations=[];let model='';
	try{for(let i=0;i<READS;i++){const packet=await session.read('health');model=packet.model;durations.push(packet.durationMs);await new Promise(resolve=>setTimeout(resolve,SPACING_MS));}}finally{session.close();}
	if(model!=='Mac17,9')return;
	const median=[...durations].sort((a,b)=>a-b)[Math.floor(READS/2)];assert.ok(median<=HEALTH_P50_LIMIT_MS,`median ${median} ms`);
});
test('a delayed successful response retains its acquisition age',async()=>{
	reset();native.configure({smc:{delayMs:150}});const session=native.open();const before=native.now(),packet=await session.read('smc');session.close();
	assert.ok(packet.rows[0].continuousMs>=before);assert.ok(native.now()-packet.rows[0].continuousMs>=140);assert.equal(packet.code,'HWMAC_OK');reset();
});
test('every deterministic source fault reaches the caller without invented success',async()=>{
	for(let fault=1;fault<=5;fault++) {
		reset();native.configure({smc:{fault}});const session=native.open();const packet=await session.read('smc');session.close();
		if(fault===1)assert.equal(packet.error,10);if(fault===2)assert.ok(Number.isNaN(packet.rows[0].value));if(fault===3)assert.ok(packet.rows[0].value>1e20);if(fault===4)assert.equal(packet.fontAvailable,false);if(fault===5)assert.equal(packet.rows[0].valid,false);
	}
	reset();
});
test('environment teardown while work is queued/running retains resources until completion',async()=>{
	const worker=new Worker(`const {parentPort}=require('node:worker_threads');const n=require(${JSON.stringify(nativePath)});n.configure({smc:{delayMs:200}});const s=n.open();s.read('smc').catch(()=>{});parentPort.postMessage('queued');`,{eval:true});
	await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
	const code=await worker.terminate();assert.equal(code,1);
});
test('10000 reads and 2000 open/close cycles remain inside explicit RSS and descriptor bounds',async()=>{
	reset();const fdCount=()=>execFileSync('/usr/sbin/lsof',['-nP','-p',String(process.pid),'-F','f'],{encoding:'utf8'}).split('\n').filter(line=>/^f[0-9]+/.test(line)).length;
	const session=native.open();for(let i=0;i<100;i++)await session.read('public');global.gc?.();
	const baseline={rss:process.memoryUsage().rss,fds:fdCount()};let peak=baseline.rss;
	for(let i=0;i<10000;i++){await session.read(['public','smc','health'][i%3]);if(i%100===0)peak=Math.max(peak,process.memoryUsage().rss);}
	session.close();for(let i=0;i<2000;i++){const s=native.open();s.close();}peak=Math.max(peak,process.memoryUsage().rss);global.gc?.();await new Promise(resolve=>setImmediate(resolve));global.gc?.();
	const final={rss:process.memoryUsage().rss,fds:fdCount()},record={architecture:process.arch,reads:10000,cycles:2000,baseline,sampledPeakRss:Math.max(peak,final.rss),lifetimePeakRss:process.resourceUsage().maxRSS*1024,final,bounds:{rssGrowth:64*1024*1024,descriptorGrowth:2}};
	fs.mkdirSync('build/native-test-results',{recursive:true});fs.writeFileSync(`build/native-test-results/hygiene-${arch}.json`,JSON.stringify(record,null,2)+'\n');
	assert.ok(final.rss-baseline.rss<=record.bounds.rssGrowth,JSON.stringify(record));assert.ok(final.fds-baseline.fds<=2,JSON.stringify(record));
});
