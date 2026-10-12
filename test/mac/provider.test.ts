import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MacProvider, counterRows, encodeModel, measurementKey } from '../../src/mac/provider';
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
	await publish(r,'smc');const both=r.provider.current();assert.equal(both?.readings.length,2);assert.ok(both!.catalogRevision!>first.catalogRevision!);assert.equal(both?.readings[0]?.statistics,'unavailable');assert.ok(Number.isNaN(both!.readings[0]!.valueMin));
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
