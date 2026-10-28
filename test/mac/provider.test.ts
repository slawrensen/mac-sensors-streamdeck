import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { MacProvider, TTL_MS, counterRows, encodeModel, measurementKey } from '../../src/mac/provider';
import { readingStatBadge, statValue } from '../../src/ui/format';
import type { SensorSnapshot } from '../../src/hwinfo/types';
import type { NativeBridge, NativePacket, NativeRow, NativeSource } from '../../src/mac/native-api';
function packet(source:NativeSource,at=100):NativePacket {
	const row:NativeRow={key:source==='smc'?'TB1T':'memory-total',label:source==='smc'?'Battery':'Memory total',group:source==='smc'?'Battery':'Memory',kind:source==='smc'?'temperature':'other',unit:source==='smc'?'°C':'B',value:source==='smc'?30:1024,valid:true,continuousMs:at,wallSeconds:1700000000+at/1000,error:0,systemCode:0};
	return {source,rows:[row],continuousMs:at,awakeMs:at,wallSeconds:row.wallSeconds,durationMs:1,error:0,systemCode:0,operation:'fixture',model:'Mac17,9',chip:'t6050',appleSilicon:1,translated:0,translationError:0,fontAvailable:true,cpuValid:false,cpuTicks:[[10,10,20,0]],networkValid:false,networkIn:'1000',networkOut:'500',networkMembers:'1',storageValid:false,storageRead:'2000',storageWrite:'1000',storageMembers:'2'};
}
function rig():{provider:MacProvider;pending:Map<NativeSource,(packet:NativePacket)=>void>;clock:{now:number};events:()=>number;closed:()=>number} {
	const pending=new Map<NativeSource,(packet:NativePacket)=>void>(),clock={now:100};let events=0,closed=0;
	const native:NativeBridge={getBuildInfo:()=>({protocol:1,napi:8,version:'test',sourceId:'test',arch:process.arch,platform:'darwin',testHooks:true}),now:()=>clock.now,open:()=>({read:(source)=>new Promise(resolve=>pending.set(source,resolve)),close:()=>{closed++;}})};
	return {provider:new MacProvider(native,()=>{events++;}),pending,clock,events:()=>events,closed:()=>closed};
}
const settle=():Promise<void>=>new Promise(resolve=>setImmediate(resolve));
async function publish(r:ReturnType<typeof rig>,source:NativeSource,value=packet(source,r.clock.now)):Promise<void>{const resolve=r.pending.get(source);assert.ok(resolve);r.pending.delete(source);resolve(value);await settle();}
test('opening and pending work provide no measurement; each accepted row owns its evidence',async()=>{
	const r=rig();assert.equal(r.provider.current(),null);assert.equal(r.provider.read(),null);assert.equal(r.pending.size,2);
	await publish(r,'public');const first=r.provider.current();assert.ok(first);assert.equal(first.readings.length,1);
	await publish(r,'smc');const both=r.provider.current();assert.equal(both?.readings.length,2);assert.ok(both!.catalogRevision!>first.catalogRevision!);assert.equal(both?.readings[0]?.statistics,'producer');assert.equal(both!.readings[0]!.valueMin,both!.readings[0]!.value);
	const key='mac:v1:smc:Mac17%2C9:54423154:temp.v1',temperature=both!.byKey.get(key)!;
	r.clock.now=200;r.provider.read();await publish(r,'public');const updated=r.provider.current()!;
	assert.equal(updated.catalogRevision,both!.catalogRevision);assert.equal(updated.byKey.get(key)?.observationRevision,temperature.observationRevision);assert.equal(updated.byKey.get(key)?.observationTime,100);
	r.provider.close();await publish(r,'smc');
});
test('failure and independent expiry remove only affected rows without minting freshness',async()=>{
	const r=rig();r.provider.read();await publish(r,'public');await publish(r,'smc');const before=r.provider.current()!;
	r.clock.now=14900;r.provider.read();await publish(r,'public');const recent=r.provider.current()!;
	r.clock.now=15100;const expired=r.provider.current()!;
	assert.equal(expired.readings.length,1);assert.ok(expired.catalogRevision!>recent.catalogRevision!);assert.deepEqual(r.provider.facts().sourceRows,{public:1,smc:0});assert.equal(expired.pollTime,recent.pollTime);assert.equal(expired.freshnessRevision,before.freshnessRevision);assert.ok(expired.valueRevision!>recent.valueRevision!);
	const failed=packet('smc',15100);failed.rows[0]!.valid=false;await publish(r,'smc',failed);assert.equal(r.provider.current()!.readings.length,1);
	r.clock.now=30000;assert.throws(()=>r.provider.current(),{reason:'no-readable-sensors'});r.provider.close();
});
test('steady genuine acquisitions count but late and closed-generation results cannot publish',async()=>{
	const r=rig();r.provider.read();await publish(r,'public');await publish(r,'smc');const first=r.provider.current()!;
	r.clock.now=200;r.provider.read();await publish(r,'public');const second=r.provider.current()!;assert.equal(second.valueRevision,first.valueRevision);assert.notEqual(second.readings[0]?.observationRevision,first.readings[0]?.observationRevision);
	const count=r.events();r.provider.close();await publish(r,'smc');assert.equal(r.events(),count);assert.equal(r.closed(),1);assert.throws(()=>r.provider.current(),{reason:'pending'});
});
test('invalid/duplicate measurements are withheld; valid zero survives; bad model withholds SMC only',async()=>{
	for(const scenario of ['zero','nan','range','duplicate','model'] as const) {
		const r=rig();r.provider.read();await publish(r,'public');const smc=packet('smc');
		if(scenario==='zero')smc.rows[0]!.value=0;if(scenario==='nan')smc.rows[0]!.value=NaN;if(scenario==='range')smc.rows[0]!.value=151;if(scenario==='duplicate')smc.rows.push({...smc.rows[0]!});if(scenario==='model')smc.model='';
		await publish(r,'smc',smc);const current=r.provider.current()!;assert.equal(current.readings.length,scenario==='zero'?2:1);if(scenario==='zero')assert.equal(current.readings.find(row=>row.type===1)?.value,0);r.provider.close();
	}
});
test('continuous time expires values despite wall rollback and font recovery preserves sensor keys',async()=>{
	const r=rig();r.provider.read();const missing=packet('public');missing.fontAvailable=false;await publish(r,'public',missing);await publish(r,'smc');assert.throws(()=>r.provider.current(),{reason:'font-missing'});
	r.clock.now=200;assert.throws(()=>r.provider.read(),{reason:'font-missing'});const fixed=packet('public',200);fixed.wallSeconds=100;fixed.rows[0]!.wallSeconds=100;await publish(r,'public',fixed);await publish(r,'smc',packet('smc',200));assert.equal(r.provider.current()!.readings.length,2);
	r.clock.now=15200;assert.throws(()=>r.provider.current(),{reason:'no-readable-sensors'});r.provider.close();
});
test('all-source first-read failure is explicit, and an invalid clock never becomes age zero',async()=>{
	const r=rig();r.provider.read();for(const source of ['public','smc'] as const){const p=packet(source);p.rows=[];await publish(r,source,p);}assert.throws(()=>r.provider.current(),{reason:'no-readable-sensors'});
	r.clock.now=NaN;assert.equal(r.provider.age(),null);assert.throws(()=>r.provider.current(),{reason:'source-error'});r.provider.close();
});
test('measurement identity is canonical, case preserving and independent of build or catalog order',()=>{
	assert.equal(encodeModel('Mac17,9'),'Mac17%2C9');assert.equal(encodeModel('A!B é'),'A%21B%20%C3%A9');assert.equal(encodeModel(''),null);assert.equal(encodeModel('\ud800'),null);
	const row=packet('smc').rows[0]!;const key=measurementKey('smc',row,'Mac17,9');assert.equal(measurementKey('smc',{...row,label:'Renamed'},'Mac17,9'),key);assert.notEqual(measurementKey('smc',{...row,key:'Tb1T'},'Mac17,9'),key);assert.equal(measurementKey('public',{...row,key:'unknown'},'Mac17,9'),null);
});
test('measurement keys follow the model of each call, so the kept model encoding never goes stale',()=>{
	const row=packet('smc').rows[0]!;
	for(const [model,expected] of [['Mac17,9','mac:v1:smc:Mac17%2C9:54423154:temp.v1'],['A!B é','mac:v1:smc:A%21B%20%C3%A9:54423154:temp.v1'],['',null],['Mac17,9','mac:v1:smc:Mac17%2C9:54423154:temp.v1'],['\ud800',null],['Mac16,1','mac:v1:smc:Mac16%2C1:54423154:temp.v1']] as const)assert.equal(measurementKey('smc',row,model),expected,JSON.stringify(model));
});
test('counter deltas reset on member changes, resets, zero denominator and sleep',()=>{
	const before=packet('public',100),after=packet('public',1100);for(const p of [before,after])p.cpuValid=p.networkValid=p.storageValid=true;after.cpuTicks=[[20,20,40,0]];after.networkIn='2000';after.networkOut='1000';after.storageRead='4000';after.storageWrite='2000';
	const rows=counterRows(before,after);assert.equal(rows.length,5);assert.equal(rows.find(row=>row.key==='cpu-total')?.value,50);assert.equal(rows.find(row=>row.key==='network-receive')?.value,1000);
	assert.deepEqual(counterRows(null,after),[]);assert.deepEqual(counterRows(before,{...after,awakeMs:100}),[]);
	assert.deepEqual(counterRows(before,{...after,continuousMs:20100,awakeMs:1100}),[]);
	assert.ok(!counterRows(before,{...after,networkMembers:'2'}).some(row=>row.key.startsWith('network')));
	assert.ok(!counterRows(before,{...after,networkIn:'1'}).some(row=>row.key.startsWith('network')));
	assert.ok(!counterRows(before,{...after,cpuTicks:before.cpuTicks}).some(row=>row.key==='cpu-total'));
	assert.ok(!counterRows(before,{...after,cpuTicks:[[1,20,40,0]]}).some(row=>row.key==='cpu-total'));
});

test('initial work that never returns becomes busy without claiming a measurement',()=>{
	const r=rig();assert.equal(r.provider.read(),null);assert.equal(r.provider.untilExpiry(),15000);r.clock.now=15100;assert.throws(()=>r.provider.current(),{reason:'busy'});assert.equal(r.provider.age(),null);assert.equal(r.provider.untilExpiry(),null);r.provider.close();
});
test('support facts call a Mac without sysctl.proc_translated (ENOENT, as on Intel) native, and other failures unknown',async()=>{
	for(const [translated,translationError,expected] of [[0,0,'native'],[1,0,'translated'],[-1,2,'native'],[-1,1,'unknown'],[-1,5,'unknown']] as const) {
		const r=rig();r.provider.read();const value=packet('public');value.translated=translated;value.translationError=translationError;await publish(r,'public',value);
		assert.equal(r.provider.facts().translation,expected,`translated ${translated}, errno ${translationError}`);assert.equal(r.provider.facts().translationError,translationError);r.provider.close();
	}
});
test('a non-finite clock at the first request still leaves the rebaseline its full delay',async()=>{
	// mach_timebase_info can fail and make the native clock NaN; a NaN delay would fire the rebaseline about 1 ms later, over no counter window.
	const START_MS=1_000_000,READ_MS=5;
	mock.timers.enable({apis:['setTimeout','Date'],now:START_MS});
	try {
		const reads:number[]=[];let poisonNext=false;
		const packet=(source:NativeSource,at:number):NativePacket=>({source,rows:[],continuousMs:at,awakeMs:at,wallSeconds:1.7e9,durationMs:1,error:source==='smc'?12:0,systemCode:0,operation:'fixture',model:'Mac17,9',chip:'t6050',appleSilicon:1,translated:0,translationError:0,fontAvailable:true,cpuValid:false,cpuTicks:[],networkValid:false,networkIn:'0',networkOut:'0',networkMembers:'1',storageValid:false,storageRead:'0',storageWrite:'0',storageMembers:'1'});
		const bridge:NativeBridge={getBuildInfo:()=>({protocol:1,napi:8,version:'t',sourceId:'t',arch:process.arch,platform:'darwin',testHooks:true}),now:()=>{if(poisonNext){poisonNext=false;return NaN;}return Date.now();},open:()=>({read:(source)=>{const at=Date.now();if(source==='public'){reads.push(at-START_MS);poisonNext=reads.length===1;}return new Promise(resolve=>setTimeout(()=>resolve(packet(source,at)),READ_MS));},close:()=>{}})};
		const provider=new MacProvider(bridge,()=>{});provider.read();
		for(let i=0;i<400;i++){mock.timers.tick(1);await new Promise(resolve=>setImmediate(resolve));}
		assert.deepEqual(reads,[0,READ_MS+250],'the rebaseline waits its full 250 ms after the first read completes when the request time is unknown');
		provider.close();
	} finally { mock.timers.reset(); }
});
test('each SMC row keeps its own measurement key when a packet carries several rows',async()=>{
	const r=rig();r.provider.read();await publish(r,'public');
	const smc=packet('smc');const first=smc.rows[0]!;
	smc.rows=[first,{...first,key:'F0Ac',label:'Fan 1',group:'Fans',kind:'fan',unit:'RPM',value:1234},{...first,key:'PSTR',label:'System power',group:'System',kind:'power',unit:'W',value:7.5}];
	await publish(r,'smc',smc);const snapshot=r.provider.current()!;
	const byLabel=new Map(snapshot.readings.map(reading=>[reading.label,reading]));
	assert.equal(byLabel.get('Fan 1')?.key,'mac:v1:smc:Mac17%2C9:46304163:rpm.v1');assert.equal(byLabel.get('Fan 1')?.value,1234);
	assert.equal(byLabel.get('System power')?.key,'mac:v1:smc:Mac17%2C9:50535452:power.v1');assert.equal(byLabel.get('System power')?.value,7.5);
	assert.equal(byLabel.get(first.label)?.key,measurementKey('smc',first,'Mac17,9'));
	r.provider.close();
});
test('a missing model on the first SMC row withholds it instead of throwing',async()=>{
	const row=packet('smc').rows[0]!;
	// A query string gives a fresh module copy whose model memo is still empty, the only state in which the old memo threw.
	const fresh=await import(`../../src/mac/provider.ts?${'first-model'}`) as typeof import('../../src/mac/provider');
	assert.equal(fresh.measurementKey('smc',row,undefined as unknown as string),null);
	assert.equal(measurementKey('smc',row,undefined as unknown as string),null);
	assert.equal(measurementKey('smc',row,''),null);
	assert.ok(measurementKey('smc',row,'Mac17,9')?.startsWith('mac:v1:smc:Mac17%2C9:'));
});
function smcAt(r:ReturnType<typeof rig>,value:number,unit='°C'):NativePacket {const next=packet('smc',r.clock.now);next.rows[0]!.value=value;next.rows[0]!.unit=unit;return next;}
const smcKey='mac:v1:smc:Mac17%2C9:54423154:temp.v1';
async function readSmc(r:ReturnType<typeof rig>,at:number,value:number,unit='°C'):Promise<SensorSnapshot>{r.clock.now=at;r.provider.read();await publish(r,'public',packet('public',at));await publish(r,'smc',smcAt(r,value,unit));return r.provider.current()!;}
test('keys get real session minimum, maximum and average from accepted Mac readings',async()=>{
	const r=rig();
	let snapshot=await readSmc(r,100,30);let reading=snapshot.byKey.get(smcKey)!;
	assert.equal(reading.statistics,'producer');assert.deepEqual([reading.valueMin,reading.valueMax,reading.valueAvg],[30,30,30]);
	snapshot=await readSmc(r,1100,40);reading=snapshot.byKey.get(smcKey)!;assert.deepEqual([reading.valueMin,reading.valueMax,reading.valueAvg],[30,40,35]);
	snapshot=await readSmc(r,2100,20);reading=snapshot.byKey.get(smcKey)!;assert.deepEqual([reading.valueMin,reading.valueMax,reading.valueAvg],[20,40,30]);
	assert.deepEqual((['current','min','max','avg'] as const).map(mode=>statValue(reading,mode)),[20,20,40,30]);
	assert.deepEqual((['min','max','avg'] as const).map(mode=>readingStatBadge(reading,mode)),['MIN','MAX','AVG']);
	r.provider.close();
});
test('a gap, a unit change, expiry or a new generation starts the session over',async()=>{
	const r=rig();await readSmc(r,100,30);await readSmc(r,1100,40);
	const failed=smcAt(r,99);failed.rows[0]!.valid=false;r.clock.now=2100;r.provider.read();await publish(r,'public',packet('public',2100));await publish(r,'smc',failed);
	assert.equal(r.provider.current()!.byKey.get(smcKey),undefined);
	let reading=(await readSmc(r,3100,50)).byKey.get(smcKey)!;assert.deepEqual([reading.valueMin,reading.valueMax,reading.valueAvg],[50,50,50],'a missing read is a gap');
	reading=(await readSmc(r,4100,10,'°F')).byKey.get(smcKey)!;assert.deepEqual([reading.valueMin,reading.valueMax,reading.valueAvg],[10,10,10],'a unit change is a new session');
	await readSmc(r,5100,12,'°F');r.clock.now=5100+TTL_MS;assert.throws(()=>r.provider.read(),{reason:'no-readable-sensors'},'every row expired');await publish(r,'public',packet('public',r.clock.now));
	assert.equal(r.provider.current()!.byKey.get(smcKey),undefined,'the expired row and its session are gone');
	await publish(r,'smc',smcAt(r,70,'°F'));reading=r.provider.current()!.byKey.get(smcKey)!;assert.deepEqual([reading.valueMin,reading.valueMax,reading.valueAvg],[70,70,70],'expiry is a gap');
	r.provider.close();
	const next=rig();reading=(await readSmc(next,100,25)).byKey.get(smcKey)!;assert.deepEqual([reading.valueMin,reading.valueMax,reading.valueAvg],[25,25,25],'a new generation keeps nothing');next.provider.close();
});
test('a repeated value that moves only the mean still publishes, and a steady value does not',async()=>{
	const r=rig();await readSmc(r,100,30);const moved=await readSmc(r,1100,40);
	const repeated=await readSmc(r,2100,40);assert.ok(repeated.valueRevision!>moved.valueRevision!,'AVG moved from 35 to 36.67, so faces must redraw');
	assert.ok(Math.abs(repeated.byKey.get(smcKey)!.valueAvg-110/3)<1e-9);
	const r2=rig();const first=await readSmc(r2,100,30);const steady=await readSmc(r2,1100,30);assert.equal(steady.valueRevision,first.valueRevision,'a steady reading keeps its revision');
	r.provider.close();r2.provider.close();
});
test('a read that settles after a sleep longer than the TTL starts a new session even before expiry runs',async()=>{
	const r=rig();await readSmc(r,100,30);await readSmc(r,1100,40);
	r.clock.now=2100;r.provider.read();await publish(r,'public',packet('public',2100));
	r.clock.now=2100+60*60*1000;await publish(r,'smc',smcAt(r,90));
	const reading=r.provider.current()!.byKey.get(smcKey)!;assert.deepEqual([reading.valueMin,reading.valueMax,reading.valueAvg],[90,90,90],'the hour-old row is a gap, not part of the session');
	r.provider.close();
});
test('a failed source read is a gap for every reading of that source',async()=>{
	const r=rig();await readSmc(r,100,30);await readSmc(r,1100,40);
	const failed=smcAt(r,0);failed.error=12;r.clock.now=2100;r.provider.read();await publish(r,'public',packet('public',2100));await publish(r,'smc',failed);
	assert.equal(r.provider.current()!.byKey.get(smcKey),undefined);
	const reading=(await readSmc(r,3100,55)).byKey.get(smcKey)!;assert.deepEqual([reading.valueMin,reading.valueMax,reading.valueAvg],[55,55,55]);
	r.provider.close();
});
