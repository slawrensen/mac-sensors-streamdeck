import assert from 'node:assert/strict';
import fs from 'node:fs';
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
	const r=rig();assert.equal(r.provider.current(),null);assert.equal(r.provider.read(),null);assert.equal(r.pending.size,3,'public, SMC and health are each asked once');
	await publish(r,'public');const first=r.provider.current();assert.ok(first);assert.equal(first.readings.length,1);
	await publish(r,'smc');const both=r.provider.current();assert.equal(both?.readings.length,2);assert.ok(both!.catalogRevision!>first.catalogRevision!);assert.equal(both?.readings[0]?.statistics,'producer');assert.equal(both!.readings[0]!.valueMin,both!.readings[0]!.value);
	const key='mac:v1:smc:Mac17%2C9:54423154:temp.v1',temperature=both!.byKey.get(key)!;
	r.clock.now=200;r.provider.read();await publish(r,'public');const updated=r.provider.current()!;
	assert.equal(updated.catalogRevision,both!.catalogRevision);assert.equal(updated.byKey.get(key)?.observationRevision,temperature.observationRevision);assert.equal(updated.byKey.get(key)?.observationTime,100);
	r.provider.close();await publish(r,'smc');
});
test('failure and independent expiry remove only affected rows without minting freshness',async()=>{
	const r=rig();r.provider.read();await publish(r,'public');await publish(r,'smc');await publish(r,'health');const before=r.provider.current()!;
	r.clock.now=14900;r.provider.read();await publish(r,'public');const recent=r.provider.current()!;
	r.clock.now=15100;const expired=r.provider.current()!;
	assert.equal(expired.readings.length,1);assert.ok(expired.catalogRevision!>recent.catalogRevision!);assert.deepEqual(r.provider.facts().sourceRows,{public:1,smc:0,health:0});assert.equal(expired.pollTime,recent.pollTime);assert.equal(expired.freshnessRevision,before.freshnessRevision);assert.ok(expired.valueRevision!>recent.valueRevision!);
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
	const r=rig();r.provider.read();const missing=packet('public');missing.fontAvailable=false;await publish(r,'public',missing);await publish(r,'smc');await publish(r,'health');assert.throws(()=>r.provider.current(),{reason:'font-missing'});
	r.clock.now=200;assert.throws(()=>r.provider.read(),{reason:'font-missing'});const fixed=packet('public',200);fixed.wallSeconds=100;fixed.rows[0]!.wallSeconds=100;await publish(r,'public',fixed);await publish(r,'smc',packet('smc',200));assert.equal(r.provider.current()!.readings.length,2);
	r.clock.now=15200;assert.throws(()=>r.provider.current(),{reason:'no-readable-sensors'});r.provider.close();
});
test('all-source first-read failure is explicit, and an invalid clock never becomes age zero',async()=>{
	const r=rig();r.provider.read();for(const source of ['public','smc'] as const){const p=packet(source);p.rows=[];await publish(r,source,p);}assert.equal(r.provider.current(),null,'the health source has not answered yet');const empty=packet('health');empty.rows=[];await publish(r,'health',empty);assert.throws(()=>r.provider.current(),{reason:'no-readable-sensors'});
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
async function readSmc(r:ReturnType<typeof rig>,at:number,value:number,unit='°C'):Promise<SensorSnapshot>{r.clock.now=at;r.provider.read();await publish(r,'public',packet('public',at));await publish(r,'smc',smcAt(r,value,unit));if(r.pending.has('health'))await publish(r,'health');return r.provider.current()!;}
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
// Computed readings (TG Pro parity tier B): CPU average, hottest CPU core and fan average on the qualified Mac17,9 table.
const catalogRows=(JSON.parse(fs.readFileSync('native/hwmac/catalog.json','utf8')) as {rows:{key:string;label:string;scope:string}[]}).rows;
/** The 18 Mac17,9 core keys, taken from the native catalog so the provider's input set cannot drift from it. */
const CORE_KEYS=catalogRows.filter(row=>row.scope==='m5'&&/^CPU (super|performance) core [0-9]+$/.test(row.label)).map(row=>row.key);
const CPU_AVERAGE='mac:v1:computed:Mac17%2C9:cpu-average:temp.v1',CPU_HOTTEST='mac:v1:computed:Mac17%2C9:cpu-hottest:temp.v1',FAN_AVERAGE='mac:v1:computed:Mac17%2C9:fan-average:rpm.v1';
const COMPUTED=[CPU_AVERAGE,CPU_HOTTEST,FAN_AVERAGE];
function smcRow(key:string,group:string,kind:string,unit:string,value:number,at:number):NativeRow {return {key,label:key,group,kind,unit,value,valid:true,continuousMs:at,wallSeconds:1700000000+at/1000,error:0,systemCode:0};}
/** One Mac17,9 SMC packet: cores read 40 to 57 C (mean 48.5, hottest 57), fans 2000 and 3000 RPM, and fan target, minimum and maximum rows that must never enter the fan average. */
function m5Packet(at:number):NativePacket {
	const next=packet('smc',at);
	next.rows=[...CORE_KEYS.map((key,index)=>smcRow(key,'CPU','temperature','°C',40+index,at)),smcRow('F0Ac','Fans','fan','RPM',2000,at),smcRow('F1Ac','Fans','fan','RPM',3000,at),
		smcRow('F0Tg','Fans','fan','RPM',9000,at),smcRow('F1Tg','Fans','fan','RPM',9000,at),smcRow('F0Mn','Fans','fan','RPM',2317,at),smcRow('F1Mn','Fans','fan','RPM',2317,at),smcRow('F0Mx','Fans','fan','RPM',7826,at),smcRow('F1Mx','Fans','fan','RPM',7826,at)];
	return next;
}
async function readM5(r:ReturnType<typeof rig>,at:number,change:(next:NativePacket)=>void=()=>{}):Promise<SensorSnapshot>{r.clock.now=at;r.provider.read();await publish(r,'public',packet('public',at));const next=m5Packet(at);change(next);await publish(r,'smc',next);return r.provider.current()!;}
const groupOf=(snapshot:SensorSnapshot,key:string):string|undefined=>{const reading=snapshot.byKey.get(key);return reading?snapshot.sensors[reading.sensorIndex]?.name:undefined;};
test('Mac17,9 gets a CPU average, hottest CPU core and fan average from the actual speeds only',async()=>{
	assert.equal(CORE_KEYS.length,18);
	const r=rig();const snapshot=await readM5(r,100);
	assert.equal(snapshot.byKey.get(CPU_AVERAGE)?.value,48.5);assert.equal(snapshot.byKey.get(CPU_HOTTEST)?.value,57);assert.equal(snapshot.byKey.get(FAN_AVERAGE)?.value,2500,'target, minimum and maximum rows stay out of the fan average');
	assert.deepEqual(COMPUTED.map(key=>[snapshot.byKey.get(key)?.label,groupOf(snapshot,key),snapshot.byKey.get(key)?.type,snapshot.byKey.get(key)?.unit]),[['CPU average','CPU',1,'°C'],['CPU hottest core','CPU',1,'°C'],['Fan average','Fans',3,'RPM']]);
	assert.deepEqual(r.provider.facts().sourceRows,{public:1,smc:CORE_KEYS.length+8,health:0});assert.equal(r.provider.facts().computedRows,3,'computed readings are counted apart from the SMC rows they come from');
	r.provider.close();
});
test('a computed reading is as old as its oldest input and keeps its own session',async()=>{
	const r=rig();let snapshot=await readM5(r,1000,next=>{next.rows[3]!.continuousMs=970;next.rows[3]!.wallSeconds=1700000000.97;});
	assert.equal(snapshot.byKey.get(CPU_AVERAGE)?.observationTime,970);assert.equal(snapshot.byKey.get(CPU_HOTTEST)?.observationTime,970);assert.equal(snapshot.byKey.get(FAN_AVERAGE)?.observationTime,1000,'the fans are not older than their own read');
	snapshot=await readM5(r,2000,next=>{for(const row of next.rows)if(CORE_KEYS.includes(row.key))row.value+=10;});
	const average=snapshot.byKey.get(CPU_AVERAGE)!;assert.deepEqual([average.value,average.valueMin,average.valueMax,average.valueAvg,average.statistics],[58.5,48.5,58.5,53.5,'producer']);
	r.provider.close();
});
test('a computed reading is withheld unless every input is fresh and valid in the same read',async()=>{
	const cases:Array<[string,(next:NativePacket)=>void,string[]]>=[
		['core invalid',next=>{next.rows[5]!.valid=false;},[FAN_AVERAGE]],
		['core missing',next=>{next.rows.splice(7,1);},[FAN_AVERAGE]],
		['core out of range',next=>{next.rows[2]!.value=151;},[FAN_AVERAGE]],
		['core not finite',next=>{next.rows[2]!.value=NaN;},[FAN_AVERAGE]],
		['core duplicated',next=>{next.rows.push({...next.rows[0]!});},[FAN_AVERAGE]],
		['core expired',next=>{next.rows[4]!.continuousMs=next.continuousMs-TTL_MS;},[FAN_AVERAGE]],
		['core from the future',next=>{next.rows[4]!.continuousMs=next.continuousMs+1;},[FAN_AVERAGE]],
		['fan invalid',next=>{next.rows.find(row=>row.key==='F1Ac')!.valid=false;},[CPU_AVERAGE,CPU_HOTTEST]],
		['fan missing, target still read',next=>{next.rows=next.rows.filter(row=>row.key!=='F0Ac');},[CPU_AVERAGE,CPU_HOTTEST]],
		['unqualified model',next=>{next.model='Mac16,1';},[]],
		['unqualified chip',next=>{next.chip='t6041';},[]],
		['source error',next=>{next.error=12;},[]]
	];
	for(const [name,change,expected] of cases) {
		const r=rig();await readM5(r,100);const snapshot=await readM5(r,1100,change);
		assert.deepEqual(COMPUTED.filter(key=>snapshot.byKey.has(key)),expected,name);
		r.provider.close();
	}
});
test('a stale input is never reused: a read missing one core removes the CPU readings instead of averaging the old value',async()=>{
	const r=rig();await readM5(r,100);
	const gap=await readM5(r,1100,next=>{next.rows=next.rows.filter(row=>row.key!==CORE_KEYS[0]);});
	assert.equal(gap.byKey.get(CPU_AVERAGE),undefined);assert.equal(gap.byKey.get(CPU_HOTTEST),undefined);assert.equal(gap.byKey.get(FAN_AVERAGE)?.value,2500);
	const back=await readM5(r,2100);const average=back.byKey.get(CPU_AVERAGE)!;assert.deepEqual([average.valueMin,average.valueMax,average.valueAvg],[48.5,48.5,48.5],'a gap starts the computed session over');
	r.provider.close();
});
test('computed readings expire with their oldest input when SMC stops answering',async()=>{
	const r=rig();await readM5(r,100,next=>{next.rows[0]!.continuousMs=90;});
	r.clock.now=90+TTL_MS-1;r.provider.read();await publish(r,'public',packet('public',r.clock.now));assert.ok(r.provider.current()!.byKey.has(CPU_AVERAGE));
	r.clock.now=90+TTL_MS;assert.equal(r.provider.current()!.byKey.get(CPU_AVERAGE),undefined,'the oldest core expired, so the average did too');
	r.provider.close();
});
// Battery and drive health (TG Pro parity tier C): a third native source over public IOKit interfaces.
/** Mirrors HEALTH_MIN_SPACING_MS in src/mac/provider.ts: the shortest time between two health read requests. */
const HEALTH_MIN_SPACING_MS=1500;
const CYCLES='mac:v1:health:battery-cycles:count.v1',BATTERY_HEALTH='mac:v1:health:battery-health:percent.v1',SSD='mac:v1:health:ssd-temperature:temp.v1';
type HealthRow=[key:string,label:string,group:string,kind:string,unit:string,value:number];
const HEALTH_ROWS:HealthRow[]=[['battery-cycles','Battery cycles','Battery','count','cycles',82],['battery-health','Battery health','Battery','percent','%',92.1],['ssd-temperature','Internal SSD','Storage','temperature','°C',35.85]];
function healthPacket(at:number,rows:HealthRow[]=HEALTH_ROWS):NativePacket {const next=packet('health',at);next.rows=rows.map(([key,label,group,kind,unit,value])=>({...smcRow(key,group,kind,unit,value,at),label}));return next;}
async function readAll(r:ReturnType<typeof rig>,at:number,health:NativePacket|null=healthPacket(at)):Promise<SensorSnapshot>{r.clock.now=at;r.provider.read();await publish(r,'public',packet('public',at));await publish(r,'smc',packet('smc',at));if(health)await publish(r,'health',health);return r.provider.current()!;}
test('health rows are keyed by a fixed name and meaning, the same on every Mac',()=>{
	const row=(key:string,kind:string):NativeRow=>({...packet('health').rows[0]!,key,kind});
	assert.equal(measurementKey('health',row('battery-cycles','count'),'Mac17,9'),CYCLES);assert.equal(measurementKey('health',row('battery-health','percent'),'Mac16,1'),BATTERY_HEALTH);assert.equal(measurementKey('health',row('ssd-temperature','temperature'),''),SSD,'no model segment');
	for(const [source,key,kind] of [['health','memory-total','other'],['health','ssd-serial','other'],['health','battery-cycles','unknown'],['public','battery-cycles','count'],['smc','battery-cycles','count']] as const)assert.equal(measurementKey(source,row(key,kind),'Mac17,9'),null,`${source} ${key} ${kind}`);
});
test('battery cycles, battery health and the internal SSD temperature are accepted as their own source',async()=>{
	const r=rig();const snapshot=await readAll(r,100);
	assert.deepEqual([CYCLES,BATTERY_HEALTH,SSD].map(key=>{const reading=snapshot.byKey.get(key);return [reading?.label,groupOf(snapshot,key),reading?.type,reading?.unit,reading?.value];}),[['Battery cycles','Battery',8,'cycles',82],['Battery health','Battery',8,'%',92.1],['Internal SSD','Storage',1,'°C',35.85]]);
	assert.deepEqual(r.provider.facts().sourceRows,{public:1,smc:1,health:3});
	r.provider.close();
	for(const [value,kept] of [[101,true],[200,true],[200.5,false],[-1,false]] as const){const next=rig();const health=await readAll(next,100,healthPacket(100,[['battery-health','Battery health','Battery','percent','%',value]]));assert.equal(health.byKey.has(BATTERY_HEALTH),kept,`battery health ${value}`);next.provider.close();}
	const cycles=rig();assert.equal((await readAll(cycles,100,healthPacket(100,[['battery-cycles','Battery cycles','Battery','count','cycles',-1]]))).byKey.has(CYCLES),false,'a negative count is withheld');cycles.provider.close();
});
test('the health source is read at most every 1.5 s and its readings keep their own acquisition time in between',async()=>{
	const r=rig();await readAll(r,100);
	r.clock.now=100+HEALTH_MIN_SPACING_MS-1;r.provider.read();assert.deepEqual([...r.pending.keys()].sort(),['public','smc'],'too soon for another health read');
	await publish(r,'public');await publish(r,'smc');const between=r.provider.current()!;
	assert.equal(between.byKey.get(CYCLES)?.observationTime,100,'the skipped read never freshens a health reading');assert.equal(between.byKey.get(SSD)?.value,35.85);
	r.clock.now=100+HEALTH_MIN_SPACING_MS;r.provider.read();assert.deepEqual([...r.pending.keys()].sort(),['health','public','smc']);
	await publish(r,'public');await publish(r,'smc');await publish(r,'health',healthPacket(r.clock.now,[HEALTH_ROWS[0]!,HEALTH_ROWS[1]!,[...HEALTH_ROWS[2]!.slice(0,5),36.85] as HealthRow]));
	const ssd=r.provider.current()!.byKey.get(SSD)!;assert.deepEqual([ssd.value,ssd.valueMin,ssd.valueMax,ssd.observationTime],[36.85,35.85,36.85,100+HEALTH_MIN_SPACING_MS]);
	r.provider.close();
});
test('a failed, missing or expired health read removes only health readings',async()=>{
	const r=rig();await readAll(r,100);
	const failed=healthPacket(1700);failed.error=12;let snapshot=await readAll(r,1700,failed);
	assert.deepEqual([CYCLES,BATTERY_HEALTH,SSD].filter(key=>snapshot.byKey.has(key)),[]);assert.equal(snapshot.readings.length,2,'system and SMC readings stay');assert.equal(r.provider.facts().sourceErrors.health?.operation,'health.read');
	snapshot=await readAll(r,3300,healthPacket(3300,HEALTH_ROWS.slice(0,2)));assert.deepEqual([CYCLES,BATTERY_HEALTH,SSD].filter(key=>snapshot.byKey.has(key)),[CYCLES,BATTERY_HEALTH],'a drive row missing from the packet is a gap');
	r.clock.now=3300+TTL_MS;assert.throws(()=>r.provider.current(),{reason:'no-readable-sensors'},'health rows expire on the same TTL as every other reading');
	r.provider.close();
});
