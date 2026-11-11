import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mock, test } from 'node:test';
import { CORE_LABEL, MacProvider, TTL_MS, computedRows, counterRows, encodeModel, measurementKey } from '../../src/mac/provider';
import { readingStatBadge, statValue } from '../../src/ui/format';
import type { SensorSnapshot } from '../../src/hwinfo/types';
import type { NativeBridge, NativePacket, NativeRow, NativeSource } from '../../src/mac/native-api';
function packet(source:NativeSource,at=100):NativePacket {
	const row:NativeRow={key:source==='smc'?'TB1T':'memory-total',label:source==='smc'?'Battery':'RAM total',group:source==='smc'?'Battery':'Memory',kind:source==='smc'?'temperature':'other',unit:source==='smc'?'°C':'B',value:source==='smc'?30:1024,valid:true,continuousMs:at,wallSeconds:1700000000+at/1000,error:0,systemCode:0};
	return {source,rows:[row],continuousMs:at,awakeMs:at,wallSeconds:row.wallSeconds,durationMs:1,error:0,code:'HWMAC_OK',systemCode:0,operation:`${source}.read`,model:'Mac17,9',chip:'t6050',cpu:'Apple M5 Pro',table:'m5',tableMeasured:true,appleSilicon:1,translated:0,translationError:0,fontAvailable:true,cpuValid:false,cpuTicks:[[10,10,20,0]],networkValid:false,networkIn:'1000',networkOut:'500',networkMembers:'1',storageValid:false,storageRead:'2000',storageWrite:'1000',storageMembers:'2'};
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
test('64-bit network counters across 4 GiB give exact rates, while any decrease still withholds both rows',()=>{
	const WRAP=2n**32n,before=packet('public',100),after=packet('public',1100);for(const p of [before,after])p.networkValid=true;
	before.networkIn=String(WRAP-1000n);before.networkOut=String(WRAP-300n);after.networkIn=String(WRAP+500n);after.networkOut=String(WRAP+400n);
	const network=(next:NativePacket)=>counterRows(before,next).filter(row=>row.key.startsWith('network')).map(row=>[row.key,row.value]);
	assert.deepEqual(network(after),[['network-receive',1500],['network-send',700]]);
	assert.deepEqual(network({...after,networkIn:String(3n*WRAP+500n)}),[['network-receive',Number(2n*WRAP+1500n)],['network-send',700]],'more than 4 GiB in one interval is exact, not aliased');
	// What a 32-bit source reported after the wrap: a decrease is a reset, never a modulo guess.
	assert.deepEqual(network({...after,networkIn:'500'}),[]);
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
		const packet=(source:NativeSource,at:number):NativePacket=>({source,rows:[],continuousMs:at,awakeMs:at,wallSeconds:1.7e9,durationMs:1,error:source==='smc'?12:0,code:source==='smc'?'HWMAC_BOUNDS':'HWMAC_OK',systemCode:0,operation:'fixture',model:'Mac17,9',chip:'t6050',cpu:'Apple M5 Pro',table:'m5',tableMeasured:true,appleSilicon:1,translated:0,translationError:0,fontAvailable:true,cpuValid:false,cpuTicks:[],networkValid:false,networkIn:'0',networkOut:'0',networkMembers:'1',storageValid:false,storageRead:'0',storageWrite:'0',storageMembers:'1'});
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
const CORE_KEYS=catalogRows.filter(row=>row.scope==='m5'&&/^(Super|Perf) core [0-9]+$/.test(row.label)).map(row=>row.key);
const CPU_AVERAGE='mac:v1:computed:Mac17%2C9:cpu-average:temp.v1',CPU_HOTTEST='mac:v1:computed:Mac17%2C9:cpu-hottest:temp.v1',FAN_AVERAGE='mac:v1:computed:Mac17%2C9:fan-average:rpm.v1';
const COMPUTED=[CPU_AVERAGE,CPU_HOTTEST,FAN_AVERAGE];
const COMPUTER_AVERAGE='mac:v1:computed:Mac17%2C9:computer-average:temp.v1',HOTTEST_SENSOR='mac:v1:computed:Mac17%2C9:hottest-sensor:temp.v1';
function smcRow(key:string,group:string,kind:string,unit:string,value:number,at:number):NativeRow {return {key,label:key,group,kind,unit,value,valid:true,continuousMs:at,wallSeconds:1700000000+at/1000,error:0,systemCode:0};}
/** The other temperatures of the Mac17,9 whole-Mac set, besides its 18 cores. */
const WHOLE_MAC_OTHERS=['Tg08','Tg12','Tg29','Tg3B','TB1T','TB2T','TaLP','TaRF','TaTP','Ts0P','Ts1P','TCHP','TPSP','TaLT','TaRT','TW0P','TH0x'];
/** Every whole-Mac test input is a temperature row the catalog gives Mac17,9, so the list cannot name a key that machine never reads. */
test('the whole-Mac test inputs are temperature rows Mac17,9 reads',()=>{
	const rows=catalogRows as {key:string;scope:string;type?:string;variants?:string[]}[];
	const reads=(key:string)=>rows.find(row=>row.key===key&&(['common','apple','Mac17,9'].includes(row.scope)||(row.scope==='m5'&&(row.variants?.includes('pro')??true))));
	assert.equal(new Set(WHOLE_MAC_OTHERS).size,17);
	for(const key of [...CORE_KEYS,...WHOLE_MAC_OTHERS])assert.equal(reads(key)?.type,'temperature',key);
	assert.ok(!WHOLE_MAC_OTHERS.some(key=>CORE_KEYS.includes(key)));
});
/** One Mac17,9 SMC packet: cores read 40 to 57 C (mean 48.5, hottest 57), the rest of the whole-Mac set 30 C, a side sensor that stays out of every average at 99 C, fans 2000 and 3000 RPM, and fan target, minimum and maximum rows that must never enter the fan average. */
function m5Packet(at:number):NativePacket {
	const next=packet('smc',at);
	next.rows=[...CORE_KEYS.map((key,index)=>smcRow(key,'CPU','temperature','°C',40+index,at)),...WHOLE_MAC_OTHERS.map(key=>smcRow(key,'System','temperature','°C',30,at)),smcRow('Tp00','CPU','temperature','°C',99,at),smcRow('F0Ac','Fans','fan','RPM',2000,at),smcRow('F1Ac','Fans','fan','RPM',3000,at),
		smcRow('F0Tg','Fans','fan','RPM',9000,at),smcRow('F1Tg','Fans','fan','RPM',9000,at),smcRow('F0Mn','Fans','fan','RPM',2317,at),smcRow('F1Mn','Fans','fan','RPM',2317,at),smcRow('F0Mx','Fans','fan','RPM',7826,at),smcRow('F1Mx','Fans','fan','RPM',7826,at)];
	return next;
}
async function readM5(r:ReturnType<typeof rig>,at:number,change:(next:NativePacket)=>void=()=>{}):Promise<SensorSnapshot>{r.clock.now=at;r.provider.read();await publish(r,'public',packet('public',at));const next=m5Packet(at);change(next);await publish(r,'smc',next);return r.provider.current()!;}
const groupOf=(snapshot:SensorSnapshot,key:string):string|undefined=>{const reading=snapshot.byKey.get(key);return reading?snapshot.sensors[reading.sensorIndex]?.name:undefined;};
test('Mac17,9 gets a CPU average, hottest CPU core and fan average from the actual speeds only',async()=>{
	assert.equal(CORE_KEYS.length,18);
	const r=rig();const snapshot=await readM5(r,100);
	assert.equal(snapshot.byKey.get(CPU_AVERAGE)?.value,48.5);assert.equal(snapshot.byKey.get(CPU_HOTTEST)?.value,57);assert.equal(snapshot.byKey.get(FAN_AVERAGE)?.value,2500,'target, minimum and maximum rows stay out of the fan average');
	assert.deepEqual(COMPUTED.map(key=>[snapshot.byKey.get(key)?.label,groupOf(snapshot,key),snapshot.byKey.get(key)?.type,snapshot.byKey.get(key)?.unit]),[['CPU average','CPU',1,'°C'],['Hottest core','CPU',1,'°C'],['Fan average','Fans',3,'RPM']]);
	assert.deepEqual(r.provider.facts().sourceRows,{public:1,smc:CORE_KEYS.length+WHOLE_MAC_OTHERS.length+1+8,health:0});assert.equal(r.provider.facts().computedRows,6,'computed readings are counted apart from the SMC rows they come from');
	assert.deepEqual([COMPUTER_AVERAGE,HOTTEST_SENSOR].map(key=>[snapshot.byKey.get(key)?.label,snapshot.byKey.get(key)?.value,groupOf(snapshot,key),snapshot.byKey.get(key)?.unit]),[['Mac average',(873+19*30)/37,'System','°C'],['Hottest sensor',57,'System','°C']],'the fixed whole-Mac set: never the fan rows, never a sensor outside the set');
	r.provider.close();
});
test('Mac17,9 gets Battery hottest, the higher of its two battery sensors, only when both answered in that read',async()=>{
	const BATTERY_HOTTEST='mac:v1:computed:Mac17%2C9:battery-hottest:temp.v1';
	const set=(next:NativePacket,key:string,value:number):void=>{next.rows.find(row=>row.key===key)!.value=value;};
	const r=rig();const first=await readM5(r,100,next=>{set(next,'TB1T',31.5);set(next,'TB2T',33.25);});
	assert.deepEqual([first.byKey.get(BATTERY_HOTTEST)?.label,first.byKey.get(BATTERY_HOTTEST)?.value,groupOf(first,BATTERY_HOTTEST),first.byKey.get(BATTERY_HOTTEST)?.unit],['Battery hottest',33.25,'Battery','°C']);
	const second=await readM5(r,1100,next=>{set(next,'TB1T',34);set(next,'TB2T',33.25);});
	assert.equal(second.byKey.get(BATTERY_HOTTEST)?.value,34,'whichever sensor is higher in this read');
	const third=await readM5(r,2100,next=>{next.rows=next.rows.filter(row=>row.key!=='TB2T');});
	assert.equal(third.byKey.has(BATTERY_HOTTEST),false,'one sensor alone is the Battery reading, not a comparison');
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
		['unqualified chip: no fixed list, so the fan average covers what answered',next=>{next.chip='t6041';},[FAN_AVERAGE]],
		['source error',next=>{next.error=12;},[]]
	];
	for(const [name,change,expected] of cases) {
		const r=rig();await readM5(r,100);const snapshot=await readM5(r,1100,change);
		assert.deepEqual(COMPUTED.filter(key=>snapshot.byKey.has(key)),expected,name);
		r.provider.close();
	}
});
test('an unqualified model gets only the every-Mac computed readings, under its own model',async()=>{
	const r=rig();const snapshot=await readM5(r,100,next=>{next.model='Mac16,1';});
	const computed=[...snapshot.byKey.keys()].filter(key=>key.startsWith('mac:v1:computed:')).sort();
	assert.deepEqual(computed,['mac:v1:computed:Mac16%2C1:computer-average:temp.v1','mac:v1:computed:Mac16%2C1:fan-average:rpm.v1','mac:v1:computed:Mac16%2C1:hottest-sensor:temp.v1']);
	assert.equal(snapshot.byKey.get('mac:v1:computed:Mac16%2C1:hottest-sensor:temp.v1')?.value,99,'the side sensor counts where no fixed list applies');
	r.provider.close();
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
const HEALTH_ROWS:HealthRow[]=[['battery-cycles','Battery cycles','Battery','count','cycles',82],['battery-health','Battery health','Battery','percent','%',92.1],['ssd-temperature','SSD SMART','Storage','temperature','°C',35.85]];
function healthPacket(at:number,rows:HealthRow[]=HEALTH_ROWS):NativePacket {const next=packet('health',at);next.rows=rows.map(([key,label,group,kind,unit,value])=>({...smcRow(key,group,kind,unit,value,at),label}));return next;}
async function readAll(r:ReturnType<typeof rig>,at:number,health:NativePacket|null=healthPacket(at)):Promise<SensorSnapshot>{r.clock.now=at;r.provider.read();await publish(r,'public',packet('public',at));await publish(r,'smc',packet('smc',at));if(health)await publish(r,'health',health);return r.provider.current()!;}
// Chip family tables: Macs that read a family's rows without their own model having been measured.
const wholeCatalog=JSON.parse(fs.readFileSync('native/hwmac/catalog.json','utf8')) as {families:Record<string,unknown>;rows:{key:string;label:string;group:string;scope:string}[]};
test('the per-core label pattern matches every chip family and model core row in the catalog and no other row',()=>{
	const families=Object.keys(wholeCatalog.families);let cores=0;
	for(const row of wholeCatalog.rows){const core=(families.includes(row.scope)||row.scope==='Mac17,9')&&row.group==='CPU';if(core)cores++;assert.equal(CORE_LABEL.test(row.label),core,`${row.scope} ${row.key} ${row.label}`);}
	assert.equal(cores,10+12+16+12+18+18+18+4+12,'M1, M2, M3, M4, M5 (Pro and Max, then the rest), M6 and A18 Pro core rows, and the Mac17,9 super zones');
	// On an M6, CPU average and Hottest core cover all 18 CPU rows of its table: the zones and CPU sensors are real cluster temperatures.
	const m6=(wholeCatalog.rows as {key:string;label:string;group:string;scope:string}[]).filter(row=>row.scope==='m6'&&row.group==='CPU');
	const inputs=new Map(m6.map((row,index)=>[row.key,labelled(row.key,row.label,'CPU',40+index,100)] as const));
	assert.deepEqual(computedRows('Mac18,5','t0000',inputs,true).filter(row=>row.group==='CPU').map(row=>[row.label,row.value]),[['CPU average',40+17/2],['Hottest core',57]]);
});
const M2_MODEL='Mac14,6',M2_AVERAGE='mac:v1:computed:Mac14%2C6:cpu-average:temp.v1',M2_HOTTEST='mac:v1:computed:Mac14%2C6:cpu-hottest:temp.v1';
const labelled=(key:string,label:string,group:string,value:number,at:number):NativeRow=>({...smcRow(key,group,'temperature','°C',value,at),label});
/** A key the SMC does not have, and a key it has whose value was out of range, as the native side reports them. */
const notFound=(key:string,label:string,at:number):NativeRow=>({...labelled(key,label,'CPU',NaN,at),valid:false,error:5,firmwareCode:0x84,operation:'smc.keyInfo'});
const outOfRange=(key:string,label:string,at:number):NativeRow=>({...labelled(key,label,'CPU',NaN,at),valid:false,error:13,firmwareCode:0,operation:'smc.read'});
/** An M2 Max packet: efficiency core 1 and performance cores 1 and 2 answer unless a test changes them; performance core 4 is not on this SMC. */
function m2Packet(at:number,cores:Record<string,number|null>={Tp1h:40,Tp01:50,Tp05:60}):NativePacket {
	const next=packet('smc',at),names:Record<string,string>={Tp1h:'Eff core 1',Tp01:'Perf core 1',Tp05:'Perf core 2'};
	next.model=M2_MODEL;next.chip='t6021';next.cpu='Apple M2 Max';next.table='m2';next.tableMeasured=false;
	next.rows=[...Object.entries(cores).map(([key,value])=>value===null?outOfRange(key,names[key]!,at):labelled(key,names[key]!,'CPU',value,at)),notFound('Tp0D','Perf core 4',at),
		labelled('Tg0f','GPU 1','GPU',45,at),smcRow('F0Ac','Fans','fan','RPM',1000,at),smcRow('F1Ac','Fans','fan','RPM',2000,at)];
	return next;
}
async function readM2(r:ReturnType<typeof rig>,at:number,next=m2Packet(at)):Promise<SensorSnapshot>{r.clock.now=at;r.provider.read();await publish(r,'public',packet('public',at));await publish(r,'smc',next);return r.provider.current()!;}
test('a Mac on a chip family table gets CPU average and CPU hottest core from the cores that answered in that read',async()=>{
	const r=rig();let snapshot=await readM2(r,100);
	assert.deepEqual([snapshot.byKey.get(M2_AVERAGE)?.value,snapshot.byKey.get(M2_HOTTEST)?.value],[50,60]);
	assert.deepEqual([M2_AVERAGE,M2_HOTTEST].map(key=>[snapshot.byKey.get(key)?.label,groupOf(snapshot,key),snapshot.byKey.get(key)?.unit]),[['CPU average','CPU','°C'],['Hottest core','CPU','°C']]);
	assert.equal(snapshot.byKey.get('mac:v1:computed:Mac14%2C6:fan-average:rpm.v1')?.value,1500,'both fans that answered');
	assert.deepEqual([snapshot.byKey.get('mac:v1:computed:Mac14%2C6:computer-average:temp.v1')?.value,snapshot.byKey.get('mac:v1:computed:Mac14%2C6:hottest-sensor:temp.v1')?.value],[48.75,60],'every temperature that answered, cores and GPU alike');
	assert.equal(snapshot.byKey.get('mac:v1:smc:Mac14%2C6:54703168:temp.v1')?.label,'Eff core 1','the core rows themselves are readings too');
	const facts=r.provider.facts();
	assert.deepEqual([facts.model,facts.cpu,facts.smcTable,facts.smcTableEvidence,facts.computedRows],[M2_MODEL,'Apple M2 Max','m2','source',5]);
	assert.deepEqual(facts.smcKeys,{answered:'Tp1h Tp01 Tp05 Tg0f F0Ac F1Ac',absent:'Tp0D',withheld:''});
	assert.deepEqual(r.provider.notices().filter(line=>/chip family/.test(line)),['This Mac reads the m2 chip family sensor table, which has not been measured on this Mac.']);
	// A core that fails one read leaves that read's average; nothing is carried over from the read before.
	snapshot=await readM2(r,1100,m2Packet(1100,{Tp1h:40,Tp01:50,Tp05:null}));
	assert.deepEqual([snapshot.byKey.get(M2_AVERAGE)?.value,snapshot.byKey.get(M2_HOTTEST)?.value],[45,50]);
	assert.deepEqual([snapshot.byKey.get(M2_AVERAGE)?.valueMin,snapshot.byKey.get(M2_AVERAGE)?.valueMax],[45,50],'the reading keeps its session through the change');
	assert.deepEqual(r.provider.facts().smcKeys,{answered:'Tp1h Tp01 Tg0f F0Ac F1Ac',absent:'Tp0D',withheld:'Tp05'});
	// No core answered: both readings are left out, and they start over when a core returns.
	snapshot=await readM2(r,2100,m2Packet(2100,{Tp1h:null,Tp01:null,Tp05:null}));
	assert.deepEqual([snapshot.byKey.has(M2_AVERAGE),snapshot.byKey.has(M2_HOTTEST),r.provider.facts().computedRows],[false,false,1],'the fan average stays; one temperature is no average');
	snapshot=await readM2(r,3100,m2Packet(3100,{Tp1h:70,Tp01:null,Tp05:null}));
	assert.deepEqual([snapshot.byKey.get(M2_AVERAGE)?.value,snapshot.byKey.get(M2_AVERAGE)?.valueMin,snapshot.byKey.get(M2_HOTTEST)?.value],[70,70,70]);
	assert.deepEqual(r.provider.notices(),[],'the notice is logged once');
	// A failed SMC read takes the key lists with its readings, so a report never shows keys from a read before the failure.
	const failed=m2Packet(4100);failed.error=12;r.clock.now=4100;r.provider.read();await publish(r,'public',packet('public',4100));await publish(r,'smc',failed);
	assert.deepEqual(r.provider.facts().smcKeys,{answered:'',absent:'',withheld:''});assert.equal(r.provider.current()!.byKey.has(M2_AVERAGE),false);
	r.provider.close();
});
test('a Mac with no chip family table gets no CPU readings but keeps the fan and whole-Mac ones; the measured model keeps its fixed inputs',async()=>{
	const r=rig(),next=m2Packet(100);next.table='';next.cpu='Apple M9';
	const snapshot=await readM2(r,100,next);
	assert.deepEqual([...snapshot.byKey.keys()].filter(key=>key.includes(':computed:')).map(key=>key.split(':')[4]).sort(),['computer-average','fan-average','hottest-sensor']);
	assert.deepEqual([r.provider.facts().smcTable,r.provider.facts().smcTableEvidence,r.provider.facts().cpu],['','none','Apple M9']);
	assert.deepEqual(r.provider.notices().filter(line=>/common typed/.test(line)),['This model uses common typed sensors; its generation-specific catalog is not qualified.']);
	r.provider.close();
	// Mac17,9 never falls back to "the cores that answered": seventeen of its eighteen cores give no CPU readings, with or without the family flag.
	const inputs=new Map(CORE_KEYS.slice(1).map((key,index)=>[key,labelled(key,`Perf core ${index+1}`,'CPU',50,100)]));
	const names=(rows:NativeRow[])=>rows.map(row=>row.key);
	for(const family of [false,true])assert.deepEqual(names(computedRows('Mac17,9','t6050',inputs,family,true)),[],String(family));
	assert.deepEqual(names(computedRows(M2_MODEL,'t6021',inputs,false)),['computer-average','hottest-sensor'],'no table, no CPU readings');
	assert.deepEqual(computedRows(M2_MODEL,'t6021',inputs,true).map(row=>[row.key,row.value]),[['cpu-average',50],['cpu-hottest',50],['computer-average',50],['hottest-sensor',50]]);
	// A sensor that reads 0 or an impossible value stays out of the whole-Mac readings, one fan is no average, and a stopped fan still counts.
	const mixed=new Map([labelled('T000','Wi-Fi','System',0,100),labelled('T001','SSD','Storage',130,100),labelled('T002','Battery','Battery',30,100),labelled('T003','Airflow left','System',40,100)].map(row=>[row.key,row] as const));
	assert.deepEqual(computedRows(M2_MODEL,'t6021',mixed).map(row=>[row.key,row.value]),[['computer-average',35],['hottest-sensor',40]]);
	assert.deepEqual(names(computedRows(M2_MODEL,'t6021',new Map([['F0Ac',smcRow('F0Ac','Fans','fan','RPM',1000,100)],['F0Tg',smcRow('F0Tg','Fans','fan','RPM',9000,100)]]))),[],'target speed is not a second fan');
	assert.equal(computedRows(M2_MODEL,'t6021',new Map([['F0Ac',smcRow('F0Ac','Fans','fan','RPM',0,100)],['F1Ac',smcRow('F1Ac','Fans','fan','RPM',3000,100)]]))[0]?.value,1500);
	// A measured model that has no fixed input list still gets the family's CPU readings.
	const unlisted=rig(),own=m2Packet(100);own.tableMeasured=true;
	const kept=await readM2(unlisted,100,own);assert.deepEqual([kept.byKey.get(M2_AVERAGE)?.value,unlisted.provider.facts().smcTableEvidence,unlisted.provider.notices().length],[50,'measured',0]);unlisted.provider.close();
	const measured=rig();await readM5(measured,100);
	assert.deepEqual([measured.provider.facts().smcTable,measured.provider.facts().smcTableEvidence,measured.provider.facts().cpu],['m5','measured','Apple M5 Pro']);assert.deepEqual(measured.provider.notices(),[]);
	measured.provider.close();
});
test('health rows are keyed by a fixed name and meaning, the same on every Mac',()=>{
	const row=(key:string,kind:string):NativeRow=>({...packet('health').rows[0]!,key,kind});
	assert.equal(measurementKey('health',row('battery-cycles','count'),'Mac17,9'),CYCLES);assert.equal(measurementKey('health',row('battery-health','percent'),'Mac16,1'),BATTERY_HEALTH);assert.equal(measurementKey('health',row('ssd-temperature','temperature'),''),SSD,'no model segment');
	for(const [source,key,kind] of [['health','memory-total','other'],['health','ssd-serial','other'],['health','battery-cycles','unknown'],['public','battery-cycles','count'],['smc','battery-cycles','count']] as const)assert.equal(measurementKey(source,row(key,kind),'Mac17,9'),null,`${source} ${key} ${kind}`);
});
test('battery cycles, battery health and the internal SSD temperature are accepted as their own source',async()=>{
	const r=rig();const snapshot=await readAll(r,100);
	assert.deepEqual([CYCLES,BATTERY_HEALTH,SSD].map(key=>{const reading=snapshot.byKey.get(key);return [reading?.label,groupOf(snapshot,key),reading?.type,reading?.unit,reading?.value];}),[['Battery cycles','Battery',8,'cycles',82],['Battery health','Battery',8,'%',92.1],['SSD SMART','Storage',1,'°C',35.85]]);
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
	const failed=healthPacket(1700);failed.error=12;failed.code='HWMAC_BOUNDS';failed.systemCode=7;let snapshot=await readAll(r,1700,failed);
	assert.deepEqual([CYCLES,BATTERY_HEALTH,SSD].filter(key=>snapshot.byKey.has(key)),[]);assert.equal(snapshot.readings.length,2,'system and SMC readings stay');
	assert.deepEqual(r.provider.facts().sourceErrors.health,{code:'HWMAC_BOUNDS',operation:'health.read',systemCode:7},'the report keeps the addon\'s own name for the error');
	snapshot=await readAll(r,3300,healthPacket(3300,HEALTH_ROWS.slice(0,2)));assert.deepEqual([CYCLES,BATTERY_HEALTH,SSD].filter(key=>snapshot.byKey.has(key)),[CYCLES,BATTERY_HEALTH],'a drive row missing from the packet is a gap');
	r.clock.now=3300+TTL_MS;assert.throws(()=>r.provider.current(),{reason:'no-readable-sensors'},'health rows expire on the same TTL as every other reading');
	r.provider.close();
});
// Reading order: the picker, a dial with no rotation set and a detail page in source mode list readings in snapshot order.
type OrderedRow={key:string;label:string;group:string;type:string;scope:string;variants?:string[]};
const UNIT_OF:Record<string,string>={temperature:'°C',fan:'RPM',voltage:'V',current:'A',power:'W'};
/** One SMC packet as the native reader returns it: every row the catalog gives this Mac, in catalog order. */
function catalogPacket(at:number,model:string,chip:string,cpu:string,own:(row:OrderedRow)=>boolean):NativePacket {
	const next=packet('smc',at);next.model=model;next.chip=chip;next.cpu=cpu;
	next.rows=(wholeCatalog.rows as OrderedRow[]).filter(row=>row.scope==='common'||row.scope==='apple'||own(row)).map(row=>({...smcRow(row.key,row.group,row.type,UNIT_OF[row.type]!,row.type==='fan'?2000:45,at),label:row.label}));
	return next;
}
const labelsIn=(snapshot:SensorSnapshot,group:string):string[]=>snapshot.readings.filter(reading=>snapshot.sensors[reading.sensorIndex]?.name===group).map(reading=>reading.label);
const numbered=(labels:string[]):string[]=>labels.filter(label=>/ (core|zone) [0-9]+$/.test(label));
test('readings are listed by group, then system counters, computed, SMC and health, then catalog order, never by identity',async()=>{
	const r=rig();r.clock.now=100;r.provider.read();
	const counters=packet('public',100);counters.cpuValid=counters.networkValid=counters.storageValid=true;counters.cpuTicks=[[10,0,10,0]];await publish(r,'public',counters);
	r.clock.now=1100;r.provider.read();const next=packet('public',1100);next.cpuValid=next.networkValid=next.storageValid=true;next.cpuTicks=[[30,0,30,0]];next.networkIn=next.storageRead='9000';await publish(r,'public',next);
	await publish(r,'smc',catalogPacket(1100,'Mac17,9','t6050','Apple M5 Pro',row=>row.scope==='Mac17,9'||(row.scope==='m5'&&(row.variants?.includes('pro')??true))));
	await publish(r,'health',healthPacket(1100));
	const m5=r.provider.current()!;
	const cores=[...Array.from({length:6},(_,i)=>`Super core ${i+1}`),...Array.from({length:12},(_,i)=>`Perf core ${i+1}`),...Array.from({length:12},(_,i)=>`Super zone ${i+1}`)];
	assert.deepEqual(labelsIn(m5,'CPU').slice(0,6),['CPU usage','CPU average','Hottest core','CPU diode','Virtual diode','CPU proximity'],'counters, computed, then the SMC in catalog order');
	assert.deepEqual(numbered(labelsIn(m5,'CPU')),cores,'super cores 1 to 6, performance cores 1 to 12, then the other super cluster sensors');
	assert.deepEqual(labelsIn(m5,'GPU').filter(label=>/ [0-9]+$/.test(label)),[...Array.from({length:4},(_,i)=>`GPU region ${i+1}`),...Array.from({length:8},(_,i)=>`GPU ${i+1}`)],'TG Pro\'s four GPU regions first');
	assert.deepEqual(labelsIn(m5,'Fans').slice(0,4),['Fan average','Fan 1','Fan 2','Fan 3']);
	assert.deepEqual(labelsIn(m5,'Battery'),['Battery hottest','Battery','Battery 2','Battery gauge','Battery current','Battery power','Battery cycles','Battery health'],'computed, then the SMC in catalog order, then health');
	assert.deepEqual(m5.sensors.map(sensor=>sensor.name),['CPU','GPU','Memory','Storage','Network','Battery','Fans','System']);
	r.provider.close();
	// An M2: efficiency cores 1 to 4 in order. Sorted by the hex of their identity they listed 1, 4, 3, 2.
	const m2=rig();await readM2(m2,100,catalogPacket(100,M2_MODEL,'t6021','Apple M2',row=>row.scope==='m2'));
	assert.deepEqual(numbered(labelsIn(m2.provider.current()!,'CPU')),[...Array.from({length:8},(_,i)=>`Perf core ${i+1}`),...Array.from({length:4},(_,i)=>`Eff core ${i+1}`)]);
	m2.provider.close();
});
test('a reading that moves in the list starts a new catalog revision, so a cached list never keeps the old order',async()=>{
	const r=rig();await readM2(r,100,catalogPacket(100,M2_MODEL,'t6021','Apple M2',row=>row.scope==='m2'));const before=r.provider.current()!;
	const swapped=catalogPacket(1100,M2_MODEL,'t6021','Apple M2',row=>row.scope==='m2'),first=swapped.rows.findIndex(row=>row.label==='Eff core 1'),second=swapped.rows.findIndex(row=>row.label==='Eff core 2');
	[swapped.rows[first],swapped.rows[second]]=[swapped.rows[second]!,swapped.rows[first]!];
	const after=await readM2(r,1100,swapped);
	assert.ok(after.catalogRevision!>before.catalogRevision!);assert.deepEqual(numbered(labelsIn(after,'CPU')).slice(-4),['Eff core 2','Eff core 1','Eff core 3','Eff core 4']);
	r.provider.close();
});
test('a Mac17,9 with another core layout is not the measured Mac: it reports source, and its computed readings cover what answered',async()=>{
	// Apple also sells Mac17,9 with a 15-core M5 Pro, 5 super and 10 performance cores. If its SMC lacks the keys of the cores it does
	// not have (here the sixth super core and performance cores 11 and 12), the fixed 18-core list would leave the CPU readings out on every read.
	const gone=new Set(['Tp0u','Tm2D','Tm2P']),own=(row:OrderedRow)=>row.scope==='Mac17,9'||(row.scope==='m5'&&(row.variants?.includes('pro')??true));
	const fifteen=catalogPacket(100,'Mac17,9','t6050','Apple M5 Pro',own);fifteen.tableMeasured=false;fifteen.perfCores=[5,10];fifteen.rows=fifteen.rows.filter(row=>!gone.has(row.key));
	const r=rig();r.clock.now=100;r.provider.read();await publish(r,'public',packet('public',100));await publish(r,'smc',fifteen);
	const snapshot=r.provider.current()!,facts=r.provider.facts();
	assert.deepEqual([facts.smcTable,facts.smcTableEvidence,facts.cores],['m5','source','5 10']);
	assert.deepEqual(r.provider.notices().filter(line=>/chip family/.test(line)),['This Mac reads the m5 chip family sensor table, which has not been measured on this Mac.']);
	// The chip family path: the 15 cores and the 12 super zones that answered.
	assert.equal(fifteen.rows.filter(row=>CORE_LABEL.test(row.label)).length,15+12);
	assert.deepEqual([CPU_AVERAGE,CPU_HOTTEST,COMPUTER_AVERAGE,HOTTEST_SENSOR,FAN_AVERAGE].map(key=>snapshot.byKey.get(key)?.value),[45,45,45,45,2000]);
	r.provider.close();
	// The measured layout keeps the fixed lists, so the same three missing cores leave the CPU and whole-Mac readings out.
	const measured=rig(),same={...fifteen,tableMeasured:true,perfCores:[6,12]};measured.clock.now=100;measured.provider.read();await publish(measured,'public',packet('public',100));await publish(measured,'smc',same);
	assert.deepEqual([CPU_AVERAGE,CPU_HOTTEST,COMPUTER_AVERAGE,HOTTEST_SENSOR,FAN_AVERAGE].filter(key=>measured.provider.current()!.byKey.has(key)),[FAN_AVERAGE]);
	assert.deepEqual([measured.provider.facts().smcTableEvidence,measured.provider.facts().cores],['measured','6 12']);
	measured.provider.close();
});
