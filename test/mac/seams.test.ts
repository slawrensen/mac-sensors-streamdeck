import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { runtime, environment } from '#platform/runtime';
import { poller as selected } from '#platform/poller';
import { MacPoller, parseSourceMode } from '../../src/mac/poller';
import { bareReadingKey } from '../../src/detail/detail-settings';
import { HwinfoError, SensorType, type Reading, type SensorSnapshot } from '../../src/hwinfo/types';
import { SessionStatsStore } from '../../src/stats';
import { setFaceFont, faceFont } from '../../src/ui/face-font';
import { statusScreen, statusDialText } from '#platform/status';
import { renderStatusKey } from '../../src/ui/key-renderer';
const key='mac:v1:smc:Mac17%2C9:54703030:temp.v1';
function row(revision=1): Reading { return {key,type:SensorType.Temperature,sensorIndex:0,id:1,label:'CPU',unit:'°C',value:40,valueMin:NaN,valueMax:NaN,valueAvg:NaN,statistics:'unavailable',observationTime:revision*10,observationRevision:revision}; }
function snapshot(reading=row(), time=1): SensorSnapshot { return {pollTime:time,valueRevision:time,version:1,revision:1,sensors:[{index:0,id:1,instance:0,name:'CPU'}],readings:[reading],byKey:new Map([[key,reading]])}; }
test('Mac test aliases select the same declared platform modules as the bundle',()=>{
 assert.equal(runtime.displayName,'Mac Sensors');assert.ok(selected instanceof MacPoller);
 process.env.HWINFO_LOG_LEVEL='trace';delete process.env.MACSENSORS_LOG_LEVEL;assert.equal(environment('LOG_LEVEL'),undefined);
 process.env.MACSENSORS_LOG_LEVEL='debug';assert.equal(environment('LOG_LEVEL'),'debug');delete process.env.MACSENSORS_LOG_LEVEL;delete process.env.HWINFO_LOG_LEVEL;
 assert.equal(parseSourceMode('gadget'),'auto');setFaceFont('segoe-ui');assert.equal(faceFont().id,'tahoma');
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
 const subject=new MacPoller((callback)=>{ready=callback;return {read:()=>current,current:()=>{if(expired)throw new HwinfoError('no-readable-sensors','Expired');return current;},untilExpiry:()=>null,age:()=>expired?16000:0,close:()=>{closed++;}};});
 subject.subscribeSeries(key);subject.retain();assert.equal(subject.getStatus().state,'ok');assert.equal(subject.getSeries(key)?.length,1);
 current=snapshot(row(),2);ready();assert.equal(subject.getSeries(key)?.length,1);
 current=snapshot(row(2),3);ready();assert.equal(subject.getSeries(key)?.length,2);
 expired=true;assert.equal(subject.getStatus().state,'unavailable');assert.equal(subject.getSeries(key)?.length,0);
 subject.release();assert.equal(closed,1);assert.equal(subject.getStatus().state,'unavailable');ready();assert.equal(subject.getStatus().state,'unavailable');
});
test('expiry timer invalidates within its deadline even at a sixty-second read cadence',async()=>{
 let expired=false;
 const subject=new MacPoller(()=>({read:()=>snapshot(),current:()=>{if(expired)throw new HwinfoError('no-readable-sensors','Expired');return snapshot();},untilExpiry:()=>expired?null:5,age:()=>0,close:()=>{}}));
 subject.setIntervalMs(60000);const states:string[]=[];subject.onTick((s)=>states.push(s.state));subject.retain();expired=true;
 await new Promise(resolve=>setTimeout(resolve,25));assert.ok(states.includes('unavailable'));subject.release();
});
test('missing-font status uses fixed pixels and keeps the Back mark without text rasterization',()=>{
 const status={state:'unavailable',reason:'font-missing',message:'Missing'} as const;
 const options=statusScreen(status);assert.ok(options);const svg=renderStatusKey({...options,returnMark:true});assert.match(svg,/data:image\/png;base64/);assert.doesNotMatch(svg,/<text/);assert.match(svg,/<path/);
 const dial=statusDialText(status);assert.ok(dial?.rasterSVG);assert.doesNotMatch(dial.rasterSVG,/<text/);
});
