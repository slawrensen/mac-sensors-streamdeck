import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mock, test } from 'node:test';
import { runtime, environment } from '#platform/runtime';
import { poller as selected } from '#platform/poller';
import { MacPoller, parseSourceMode } from '../../src/mac/poller';
import { MacProvider } from '../../src/mac/provider';
import type { NativeBridge, NativePacket, NativeRow, NativeSource } from '../../src/mac/native-api';
import { bareReadingKey } from '../../src/detail/detail-settings';
import { HwinfoError, SensorType, type Reading, type SensorSnapshot } from '../../src/hwinfo/types';
import { SessionStatsStore } from '../../src/stats';
import { setFaceFont, faceFont } from '../../src/ui/face-font';
import { missingReadingScreen, statusScreen, statusDialText, statusSentence } from '#platform/status';
import { renderStatusKey } from '../../src/ui/key-renderer';
/** These tests pin what a real stop does, so they stop at once instead of after the production release grace. */
const poller0 = (factory: ConstructorParameters<typeof MacPoller>[0]): MacPoller => new MacPoller(factory, 0);
const key='mac:v1:smc:Mac17%2C9:54703030:temp.v1';
function row(revision=1): Reading { return {key,type:SensorType.Temperature,sensorIndex:0,id:1,label:'CPU',unit:'°C',value:40,valueMin:NaN,valueMax:NaN,valueAvg:NaN,statistics:'unavailable',observationTime:revision*10,observationRevision:revision}; }
function snapshot(reading=row(), time=1): SensorSnapshot { return {pollTime:time,valueRevision:time,version:1,revision:1,sensors:[{index:0,id:1,instance:0,name:'CPU'}],readings:[reading],byKey:new Map([[key,reading]])}; }
test('Mac test aliases select the same declared platform modules as the bundle',()=>{
	assert.equal(runtime.displayName,'Mac Sensors');assert.ok(selected instanceof MacPoller);
	process.env.HWINFO_LOG_LEVEL='trace';delete process.env.MACSENSORS_LOG_LEVEL;assert.equal(environment('LOG_LEVEL'),undefined);
	process.env.MACSENSORS_LOG_LEVEL='debug';assert.equal(environment('LOG_LEVEL'),'debug');delete process.env.MACSENSORS_LOG_LEVEL;delete process.env.HWINFO_LOG_LEVEL;
	assert.equal(parseSourceMode('gadget'),'auto');setFaceFont('segoe-ui');assert.equal(faceFont().id,'tahoma');
});
test('ws server-only modules are side-effect free to tree shaking, so server code the SDK client never runs stays out of the bundle',async()=>{
	// A computed specifier, because the rollup config is plain JS without type declarations.
	const configUrl=new URL('../../rollup.config.mjs',import.meta.url).href;
	const {default:config}=await import(configUrl) as {default:{treeshake:{moduleSideEffects:(id:string)=>boolean}}};
	const sideEffects=config.treeshake.moduleSideEffects,ws=(file:string):string=>`/repo/node_modules/ws/lib/${file}.js`;
	for(const file of ['websocket-server','stream','subprotocol'])assert.equal(sideEffects(ws(file)),false,file);
	for(const file of ['websocket','receiver','sender','permessage-deflate','extension','validation','constants'])assert.equal(sideEffects(ws(file)),true,file);
	assert.equal(sideEffects('/repo/node_modules/@elgato/utils/dist/lists/index.js'),false);
	assert.equal(sideEffects('/repo/src/plugin.ts'),true);
});
test('canonical Mac keys survive both copied key parsers unchanged',()=>{
	const text=readFileSync('com.lawrensen.mac.sdPlugin/ui/pi-common.js','utf8');
	const body=text.match(/function bareKey\(value\) \{([\s\S]*?)\n\t\}/)?.[1];assert.ok(body);
	const panel=vm.runInNewContext(`(function(value){${body}})`) as (value:string)=>string;
	for(const value of [key,`  ${key}  CPU Super 1`,'mac:v1:system:cpu-total']){assert.equal(bareReadingKey(value),value.trimStart().split(/\s/)[0]);assert.equal(panel(value),bareReadingKey(value));}
});
test('independent source frames do not duplicate dial history; steady acquisitions do count',()=>{
	const store=new SessionStatsStore(), first=row();store.observe(first,snapshot(first,1),'mac');
	store.observe(first,snapshot(first,2),'mac');assert.equal(store.get(key)?.count,1);
	const next=row(2);store.observe(next,snapshot(next,2),'mac');assert.equal(store.get(key)?.count,2);
});
test('Mac poller revalidates cached rows before redraw and closes generations on last release',()=>{
	let current=snapshot(),expired=false,closed=0,ready=()=>{};
	const subject=poller0((callback)=>{ready=callback;return {read:()=>current,current:()=>{if(expired)throw new HwinfoError('no-readable-sensors','Expired');return current;},untilExpiry:()=>null,age:()=>expired?16000:0,close:()=>{closed++;}};});
	subject.subscribeSeries(key);subject.retain();assert.equal(subject.getStatus().state,'ok');assert.equal(subject.getSeries(key)?.length,1);
	current=snapshot(row(),2);ready();assert.equal(subject.getSeries(key)?.length,1);
	current=snapshot(row(2),3);ready();assert.equal(subject.getSeries(key)?.length,2);
	expired=true;assert.equal(subject.getStatus().state,'unavailable');assert.equal(subject.getSeries(key)?.length,0);
	subject.release();assert.equal(closed,1);assert.equal(subject.getStatus().state,'unavailable');ready();assert.equal(subject.getStatus().state,'unavailable');
});
test('a source that stops completing expires at the 15 s TTL while reads continue at the clamped longest interval',async()=>{
	mock.timers.enable({apis:['setInterval','setTimeout','Date'],now:0});
	try {
		const reads:Record<NativeSource,number[]>={public:[],smc:[],health:[]};
		const row=(source:NativeSource,at:number):NativeRow=>({key:source==='smc'?'TB1T':'memory-total',label:source,group:source==='smc'?'Battery':'Memory',kind:source==='smc'?'temperature':'other',unit:source==='smc'?'°C':'B',value:source==='smc'?30:1024,valid:true,continuousMs:at,wallSeconds:1.7e9+at/1000,error:0,systemCode:0});
		const packet=(source:NativeSource,at:number):NativePacket=>({source,rows:[row(source,at)],continuousMs:at,awakeMs:at,wallSeconds:1.7e9+at/1000,durationMs:1,error:0,systemCode:0,operation:'fixture',model:'Mac17,9',chip:'t6050',appleSilicon:1,translated:0,translationError:0,fontAvailable:true,cpuValid:false,cpuTicks:[[0,0,0,0]],networkValid:false,networkIn:'0',networkOut:'0',networkMembers:'1',storageValid:false,storageRead:'0',storageWrite:'0',storageMembers:'1'});
		// Public completes its first read and the provider's counter rebaseline read at 250 ms, then never again; SMC and health always complete.
		const native:NativeBridge={getBuildInfo:()=>({protocol:1,napi:8,version:'t',sourceId:'t',arch:process.arch,platform:'darwin',testHooks:true}),now:()=>Date.now(),open:()=>({read:(source)=>{const at=Date.now();reads[source].push(at);return new Promise(resolve=>{if(source!=='public'||reads.public.length<=2)setTimeout(()=>resolve(packet(source,at)),5);});},close:()=>{}})};
		const subject=poller0((ready)=>new MacProvider(native,ready));
		subject.setIntervalMs(60000);assert.equal(subject.diagnostics().intervalMs,5000);
		const memory='mac:v1:system:memory-total';const seen:{at:number;memory:boolean;state:string}[]=[];
		subject.onTick((s)=>seen.push({at:Date.now(),memory:s.state==='ok'&&s.snapshot.byKey.has(memory),state:s.state}));
		const advance=async(ms:number):Promise<void>=>{for(let i=0;i<ms;i++){mock.timers.tick(1);await new Promise(resolve=>setImmediate(resolve));}};
		subject.retain();await advance(15249);
		assert.equal(seen.at(-1)?.memory,true,'the public reading is still within its TTL at 15.249 s');
		await advance(2);
		const expiry=seen.find(item=>item.at>=15250&&!item.memory);
		assert.equal(expiry?.at,15250,'the public reading leaves at its own 15 s deadline, not at the next read');assert.equal(expiry?.state,'ok');
		await advance(5000);
		assert.deepEqual(reads.smc,[0,5000,10000,15000,20000]);assert.deepEqual(reads.health,reads.smc,'a 5 s interval is longer than the health spacing');assert.deepEqual(reads.public,[0,250,5000]);
		subject.release();
	}finally{mock.timers.reset();}
});
test('missing-font status uses fixed pixels and keeps the Back mark without text rasterization',()=>{
	const status={state:'unavailable',reason:'font-missing',message:'Missing'} as const;
	const options=statusScreen(status);assert.ok(options);const svg=renderStatusKey({...options,returnMark:true});assert.match(svg,/data:image\/png;base64/);assert.doesNotMatch(svg,/<text/);assert.match(svg,/<path/);
	const dial=statusDialText(status);assert.ok(dial?.rasterSVG);assert.doesNotMatch(dial.rasterSVG,/<text/);
});

test('explicit rechecks read only while an action is visible',()=>{
	let reads=0;const subject=poller0(()=>({read:()=>{reads++;return snapshot();},current:()=>snapshot(),untilExpiry:()=>null,age:()=>0,close:()=>{}}));
	subject.checkAgain();assert.equal(reads,0);subject.retain();assert.equal(reads,1);subject.checkAgain();assert.equal(reads,2);subject.release();subject.checkAgain();assert.equal(reads,2);
});
test('a read checks the snapshot and arms expiry once, and a read that throws still ends in its failure',()=>{
	const calls={current:0,untilExpiry:0};
	const subject=poller0(()=>({read:()=>snapshot(),current:()=>{calls.current++;return snapshot();},untilExpiry:()=>{calls.untilExpiry++;return null;},age:()=>0,close:()=>{}}));
	subject.retain();assert.deepEqual(calls,{current:1,untilExpiry:1});subject.checkAgain();assert.deepEqual(calls,{current:2,untilExpiry:2});subject.release();
	const reasons=(poller:MacPoller):string[]=>{const seen:string[]=[];poller.onTick(status=>seen.push(status.state==='unavailable'?status.reason:status.state));poller.retain();poller.release();return seen;};
	const denied=new HwinfoError('access-denied','Denied');
	assert.deepEqual(reasons(poller0(()=>({read:()=>{throw denied;},current:()=>{throw denied;},untilExpiry:()=>null,age:()=>null,close:()=>{}}))),['access-denied']);
	assert.deepEqual(reasons(poller0(()=>{throw new HwinfoError('bridge-failed','No bridge');})),['bridge-failed']);
});
test('readings that lapse before SMC ever completes are not kept live, whether public then fails, stalls or every source had completed',async()=>{
	const memory='mac:v1:system:memory-total';
	const row=(source:NativeSource,at:number):NativeRow=>({key:source==='smc'?'TB1T':'memory-total',label:source,group:source==='smc'?'Battery':'Memory',kind:source==='smc'?'temperature':'other',unit:source==='smc'?'°C':'B',value:source==='smc'?30:1024,valid:true,continuousMs:at,wallSeconds:1.7e9+at/1000,error:0,systemCode:0});
	const packet=(source:NativeSource,at:number):NativePacket=>({source,rows:[row(source,at)],continuousMs:at,awakeMs:at,wallSeconds:1.7e9+at/1000,durationMs:1,error:0,systemCode:0,operation:'fixture',model:'Mac17,9',chip:'t6050',appleSilicon:1,translated:0,translationError:0,fontAvailable:true,cpuValid:false,cpuTicks:[[0,0,0,0]],networkValid:false,networkIn:'0',networkOut:'0',networkMembers:'1',storageValid:false,storageRead:'0',storageWrite:'0',storageMembers:'1'});
	const settle=():Promise<void>=>new Promise(resolve=>setImmediate(resolve));
	for(const variant of ['public rejects','public stalls','every source had completed'] as const) {
		const clock={now:100};const out=new Map<NativeSource,{resolve:(p:NativePacket)=>void;reject:(e:unknown)=>void}>();
		const native:NativeBridge={getBuildInfo:()=>({protocol:1,napi:8,version:'t',sourceId:'t',arch:process.arch,platform:'darwin',testHooks:true}),now:()=>clock.now,open:()=>({read:(source)=>new Promise((resolve,reject)=>out.set(source,{resolve,reject})),close:()=>{}})};
		const subject=poller0((ready)=>new MacProvider(native,ready));subject.subscribeSeries(memory);
		const finish=async(source:NativeSource,how:'resolve'|'reject'):Promise<void>=>{const pending=out.get(source);assert.ok(pending,`${variant}: ${source} in flight`);out.delete(source);if(how==='resolve')pending.resolve(packet(source,clock.now));else pending.reject(Object.assign(new Error('fixture'),{code:'HWMAC_ASYNC'}));await settle();};
		subject.retain();await finish('public','resolve');if(variant==='every source had completed'){await finish('smc','resolve');await finish('health','resolve');}
		assert.equal(subject.getStatus().state,'ok',variant);assert.equal(subject.getSeries(memory)?.length,1,variant);
		clock.now=1100;subject.checkAgain();if(variant==='public rejects')await finish('public','reject');
		clock.now=40_000;const status=subject.getStatus();
		assert.equal(status.state,'unavailable',variant);
		assert.equal(status.state==='unavailable'&&status.reason,variant==='every source had completed'?'no-readable-sensors':'pending',variant);
		assert.equal(subject.getSeries(memory)?.length,0,`${variant}: a lapsed reading leaves no sparkline behind`);
		subject.release();
	}
});
test('the font-missing hint states the repair once; the panel already says saved settings stay',()=>{
	assert.equal(statusSentence({state:'unavailable',reason:'font-missing',message:'Missing'}),'Install Tahoma Bold in Font Book, then choose Check again.');
	const shell=readFileSync('com.lawrensen.mac.sdPlugin/ui/pi-shell.js','utf8');assert.match(shell,/Your reading and every setting stay saved\./);
});
test('the missing-reading face names the panel remedy, a new pick, as the shared copy does',()=>{
	assert.deepEqual(missingReadingScreen().lines,['Sensor missing','pick again']);
	const svg=renderStatusKey(missingReadingScreen());assert.match(svg,/pick again/);assert.doesNotMatch(svg,/check again/);
});
