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
	// ioft is unsigned 48.16 fixed point, little endian: the first bytes are TG0B as read on Mac17,9 beside an HID value of 36.2.
	assert.equal(native.testDecode('ioft',Buffer.from([0x33,0x33,0x24,0,0,0,0,0])),0x243333/65536);assert.equal(native.testDecode('ioft',Buffer.from([0,0x80,0x23,0,0,0,0,0])),35.5);assert.equal(native.testDecode('ioft',Buffer.alloc(8)),0);
	assert.equal(native.testDecode('ioft',Buffer.from([0,0,0,0,0,0,0,1])),2**40,'the top byte is the most significant');
	for(const type of ['flt ','sp78','fpe2','ui8 ','ui16','ui32','ioft','xxxx'])assert.equal(native.testDecode(type,Buffer.alloc(7)),null);
	assert.equal(native.testDecode('ioft',Buffer.alloc(4)),null);
});
const catalog=JSON.parse(fs.readFileSync('native/hwmac/catalog.json','utf8'));
const VARIANT_BITS={base:1,pro:2,max:4,ultra:8},VARIANT_SUFFIX={base:'',pro:' Pro',max:' Max',ultra:' Ultra'};
/** 55 common, 4 Apple silicon, 26 M5 Pro family (18 CPU and 8 GPU) and 24 measured-model rows. */
const MAC17_9_ROWS=109;
/** The core layout Mac17,9 was measured on: 6 super and 12 performance cores (hw.perflevel0 and hw.perflevel1 physicalcpu). */
const MEASURED_CORES=[6,12];
/** The rows catalog.json gives one Mac, by the same rule the native side applies. */
const rowsFor=(family,variant,model)=>catalog.rows.filter(row=>row.scope==='common'||row.scope==='apple'||(row.scope===family&&(!row.variants||row.variants.includes(variant)))||row.scope===model);
test('the measured Mac17,9 keeps its rows, also when a translated process reads another CPU name',()=>{
	for(const cpu of ['Apple M5 Pro','VirtualApple @ 2.50GHz processor','']) {
		const mine=native.testCatalog('Mac17,9','t6050',1,cpu,MEASURED_CORES);
		assert.deepEqual([mine.table,mine.variant,mine.measured,mine.rows.length],['m5',VARIANT_BITS.pro,true,MAC17_9_ROWS],cpu);
		assert.deepEqual(mine.rows.map(row=>row.key).sort(),rowsFor('m5','pro','Mac17,9').map(row=>row.key).sort(),cpu);
	}
	// TG Pro parity on Mac17,9: each key was matched to a TG Pro reading within rounding. They name places on this model, so they stay rows of that measured model only.
	const SIDE_SENSORS=['Tp00','Tp08','Tp0C','Tp0K','Tp0O','Tp0U','Tp0X','Tp0d','Tp0g','Tp0m','Tp0p','Tp0y'];
	const parity={...Object.fromEntries(SIDE_SENSORS.map((key,index)=>[key,[`Super zone ${index+1}`,'CPU','temperature']])),Tg08:['GPU region 1','GPU','temperature'],Tg12:['GPU region 2','GPU','temperature'],Tg29:['GPU region 3','GPU','temperature'],Tg3B:['GPU region 4','GPU','temperature'],TaTP:['Airflow top','System','temperature'],TCHP:['Charger','System','temperature'],TPSP:['Power supply','System','temperature'],TaLT:['Ports left','System','temperature'],TaRT:['Ports right','System','temperature'],Ts0P:['Trackpad','System','temperature'],Ts1P:['Pad actuator','System','temperature'],TG0B:['Battery gauge','Battery','temperature']};
	assert.deepEqual(catalog.rows.filter(row=>row.scope==='Mac17,9').map(row=>row.key).sort(),Object.keys(parity).sort());
	for(const [key,[label,group,type]] of Object.entries(parity))assert.deepEqual((({label,group,type})=>({label,group,type}))(catalog.rows.find(r=>r.key===key&&r.scope==='Mac17,9')??{}),{label,group,type},key);
	// Target, minimum and maximum speed mean the same on every Mac with fans, so each of the eight fans has them everywhere and they are only ever read.
	for(let fan=0;fan<8;fan++)for(const [suffix,word] of [['Tg','target'],['Mn','min'],['Mx','max']])assert.deepEqual((({label,group,type,scope})=>({label,group,type,scope}))(catalog.rows.find(r=>r.key===`F${fan}${suffix}`)??{}),{label:`Fan ${fan+1} ${word}`,group:'Fans',type:'fan',scope:'common'},`F${fan}${suffix}`);
	// The same model with another chip, or the same chip in another model, was not measured.
	for(const [model,chip] of [['Unknown','t6050'],['Mac17,9','unknown']])assert.equal(native.testCatalog(model,chip,1,'Apple M5 Pro',MEASURED_CORES).measured,false);
	assert.deepEqual(native.testCatalog('Unknown','t6050',1,'Apple M5 Pro').rows.map(row=>row.key).sort(),rowsFor('m5','pro',null).map(row=>row.key).sort());
});
test('every chip family and variant the catalog lists gets its own rows, each key once, from the exact CPU name',()=>{
	assert.deepEqual(Object.fromEntries(Object.keys(catalog.families).map(name=>[name,catalog.rows.filter(row=>row.scope===name).length])),{m1:18,m2:14,m3:24,m4:25,m5:44,m6:30,a18pro:8});
	assert.equal(catalog.rows.length,246);
	for(const [name,family] of Object.entries(catalog.families))for(const variant of family.variants) {
		const answer=native.testCatalog('Mac0,0','t0000',1,family.brand+VARIANT_SUFFIX[variant]),expected=rowsFor(name,variant,null);
		assert.deepEqual([answer.table,answer.variant,answer.measured],[name,VARIANT_BITS[variant],false],`${name} ${variant}`);
		assert.deepEqual(answer.rows.map(row=>[row.key,row.label,row.group,row.kind]),expected.map(row=>[row.key,row.label,row.group,row.type]),`${name} ${variant}`);
		assert.equal(new Set(answer.rows.map(row=>row.key)).size,answer.rows.length,`${name} ${variant}: one row per key`);
		assert.ok(answer.rows.some(row=>/^((Super|Perf|Eff) core|CPU sensor) 1$/.test(row.label)),`${name} ${variant}: per-core rows`);
		// The production read loop, against an SMC that has every key of this chip's table and no other: each row comes back with its label and value.
		const own=expected.filter(row=>row.scope===name),bytes=Buffer.alloc(4);bytes.writeFloatLE(50);
		const read=native.testSmc('Mac0,0','t0000',1,family.brand+VARIANT_SUFFIX[variant],own.map(row=>({key:row.key,type:'flt ',bytes})));
		assert.deepEqual([read.table,read.tableMeasured,read.cpu,read.rows.length],[name,false,family.brand+VARIANT_SUFFIX[variant],expected.length],`${name} ${variant}`);
		assert.deepEqual(read.rows.filter(row=>row.valid).map(row=>[row.key,row.label,row.group,row.unit,row.value]),own.map(row=>[row.key,row.label,row.group,'°C',50]),`${name} ${variant}: read`);
	}
	// An M6 has 2 super, 4 performance and 6 efficiency cores (Apple's specifications). In the load test on one Mac18,5 behind its Stats
	// table (issue 3668), four keys warmed with the two super cores and six with the performance cores, so the rows past those core
	// counts are named as zones of their cluster. Tp0b and Tp05 warmed with both clusters, so they claim neither.
	assert.deepEqual(native.testCatalog('Mac0,0','t0000',1,'Apple M6').rows.filter(row=>row.group==='CPU'&&/ [0-9]+$/.test(row.label)).map(row=>row.key+' '+row.label),
		['Tp0j Super core 1','Tp0g Super core 2','Tp09 Super zone 1','Tp07 Super zone 2','Tp0m Perf core 1','Tp0L Perf core 2','Tp0I Perf core 3','Tp0d Perf core 4','Tp0E Perf zone 1','Tp0G Perf zone 2','Tp0b CPU sensor 1','Tp05 CPU sensor 2',...['Te07','Te08','Te09','Te0c','Te0h','Te0i'].map((key,index)=>`${key} Eff core ${index+1}`)]);
	// One key means different cores on different families, so the label comes from the family, never from the key alone.
	const label=(cpu,key)=>native.testCatalog('Mac0,0','t0000',1,cpu).rows.find(row=>row.key===key)?.label;
	assert.deepEqual([label('Apple M1','Tp09'),label('Apple M2','Tp09'),label('Apple M6','Tp09')],['Eff core 1','Perf core 3','Super zone 1']);
	// M5 Pro and Max read the layout measured on the M5 Pro; M5 and M5 Ultra keep the source's keys under names that claim no core type.
	const cores=cpu=>native.testCatalog('Mac0,0','t0000',1,cpu).rows.filter(row=>row.group==='CPU'&&/ (core|sensor) [0-9]+$/.test(row.label)).map(row=>row.key+' '+row.label);
	for(const cpu of ['Apple M5 Pro','Apple M5 Max'])assert.deepEqual(cores(cpu),['Tp04 Super core 1','Tp0G Super core 2','Tp0R Super core 3','Tp0a Super core 4','Tp0j Super core 5','Tp0u Super core 6',
		'Tm04 Perf core 1','Tm0G Perf core 2','Tm0R Perf core 3','Tm0a Perf core 4','Tm0j Perf core 5','Tm0u Perf core 6',
		'Tm1Q Perf core 7','Tm1c Perf core 8','Tm1o Perf core 9','Tm21 Perf core 10','Tm2D Perf core 11','Tm2P Perf core 12'],cpu);
	for(const cpu of ['Apple M5','Apple M5 Ultra'])assert.deepEqual([cores(cpu)[0],cores(cpu)[17],cores(cpu).length],['Tp00 CPU sensor 1','Tp0y CPU sensor 18',18],cpu);
	// The two M4 GPU rows that differ between the base chip and Pro or Max.
	const gpu=cpu=>native.testCatalog('Mac0,0','t0000',1,cpu).rows.filter(row=>/^GPU [12]$/.test(row.label)).map(row=>row.key);
	assert.deepEqual([gpu('Apple M4'),gpu('Apple M4 Pro'),gpu('Apple M4 Max')],[['Tg0G','Tg0H'],['Tg1U','Tg1k'],['Tg1U','Tg1k']]);
});
test('a CPU name the catalog does not list, a virtual machine and an Intel Mac get no chip family rows',()=>{
	const common=catalog.rows.filter(row=>row.scope==='common').length,apple=catalog.rows.filter(row=>row.scope==='apple').length;
	for(const cpu of ['Apple M1 (Virtual)','Apple M10','Apple M7 Pro','Apple M4 Ultra','Apple M6 Ultra','Apple A18','Apple A18 Pro Max','apple m1','Apple M1 ','Apple M1 Pro Max','M1','']) {
		const answer=native.testCatalog('Mac0,0','t0000',1,cpu);assert.deepEqual([answer.table,answer.variant,answer.measured,answer.rows.length],['',0,false,common+apple],JSON.stringify(cpu));
	}
	for(const family of [0,-1]) {
		const answer=native.testCatalog('Mac17,9','t6050',family,'Apple M5 Pro',MEASURED_CORES);assert.deepEqual([answer.table,answer.measured,answer.rows.length],['',false,common],`Apple silicon flag ${family}`);
	}
	assert.equal(native.testCatalog('MacBookPro16,1','',0,'Intel(R) Core(TM) i9-9980HK CPU @ 2.40GHz').rows.length,common);
});
const float=value=>{const bytes=Buffer.alloc(4);bytes.writeFloatLE(value);return {type:'flt ',bytes};};
const scripted=keys=>Object.entries(keys).map(([key,value])=>({key,...value}));
test('the read loop reads another chip family through a scripted SMC: its labels, its 10 to 120 °C window and its missing keys',()=>{
	// Mirrors HWMAC_FAMILY_MINIMUM_C and HWMAC_FAMILY_MAXIMUM_C in native/hwmac/collectors.h.
	const FAMILY_MINIMUM_C=10,FAMILY_MAXIMUM_C=120;
	// An M2 Max as its SMC might answer: two efficiency and three performance cores, one GPU row, both fans, the battery. Every other key is not found.
	const keys={Tp1h:float(41.5),Tp1t:float(43),Tp01:float(55.25),Tp05:float(3),Tp09:float(130),Tp0D:{type:'ch8*',bytes:Buffer.from('abcd')},Tg0f:{type:'sp78',bytes:Buffer.from([0x30,0x80])},F0Ac:float(1200),F1Ac:float(0),TB1T:float(31)};
	const packet=native.testSmc('Mac14,6','t6021',1,'Apple M2 Max',scripted(keys));
	assert.deepEqual([packet.source,packet.model,packet.cpu,packet.table,packet.tableMeasured,packet.error],['smc','Mac14,6','Apple M2 Max','m2',false,0]);
	assert.equal(packet.rows.length,rowsFor('m2','max',null).length);
	const row=key=>packet.rows.find(item=>item.key===key),seen=key=>(({label,group,kind,unit,valid,value,code,operation,firmwareCode})=>({label,group,kind,unit,valid,value,code,operation,firmwareCode}))(row(key));
	assert.deepEqual(seen('Tp1h'),{label:'Eff core 1',group:'CPU',kind:'temperature',unit:'°C',valid:true,value:41.5,code:'HWMAC_OK',operation:'smc.read',firmwareCode:0});
	assert.deepEqual(seen('Tp01'),{label:'Perf core 1',group:'CPU',kind:'temperature',unit:'°C',valid:true,value:55.25,code:'HWMAC_OK',operation:'smc.read',firmwareCode:0});
	assert.deepEqual([row('Tg0f').label,row('Tg0f').value,row('F0Ac').value,row('F1Ac').value,row('TB1T').value],['GPU 1',48.5,1200,0,31],'a stopped fan and a common temperature keep their own ranges');
	// A core below 10 or above 120 °C, and a key of a type that is not a number, are withheld with no value.
	for(const key of ['Tp05','Tp09','Tp0D'])assert.deepEqual([row(key).valid,Number.isNaN(row(key).value),row(key).code,row(key).operation],[false,true,'HWMAC_VALUE','smc.read'],key);
	// A key this SMC does not have answers "not found" to the key information request.
	for(const key of ['Tp1p','Tp0j','Tg0j','TC0D','F2Ac'])assert.deepEqual([row(key).valid,row(key).code,row(key).operation,row(key).firmwareCode],[false,'HWMAC_FIRMWARE','smc.keyInfo',0x84],key);
	// No row of another family or of the measured model is asked for.
	assert.equal(row('Tp00'),undefined);assert.equal(row('TaTP'),undefined);assert.equal(row('Te05'),undefined);
	// The window is inclusive at both ends and belongs to chip family rows only: a common temperature keeps -50 to 150.
	const edge=(key,value)=>native.testSmc('Mac14,6','t6021',1,'Apple M2 Max',scripted({[key]:float(value)})).rows.find(item=>item.key===key);
	for(const [key,value,valid] of [['Tp01',FAMILY_MINIMUM_C,true],['Tp01',FAMILY_MAXIMUM_C,true],['Tp01',FAMILY_MINIMUM_C-0.5,false],['Tp01',FAMILY_MAXIMUM_C+0.5,false],['Tg0f',0,false],['Tg0f',FAMILY_MINIMUM_C,true],
		['TB1T',5,true],['TB1T',-50,true],['TB1T',150,true],['TB1T',-50.5,false],['TB1T',150.5,false],['TW0P',0,true]])assert.equal(edge(key,value).valid,valid,`${key} at ${value}`);
});
test('a Mac17,9 with another core layout keeps the model rows, but is not measured and its family rows take the 10 to 120 °C window',()=>{
	// Apple sells Mac17,9 with the 18-core M5 Pro measured here and with a 15-core one: 5 super and 10 performance cores.
	for(const [cores,measured] of [[MEASURED_CORES,true],[[5,10],false],[[12,6],false],[[6,12,6],false],[[6],false],[[],false]]) {
		const answer=native.testCatalog('Mac17,9','t6050',1,'Apple M5 Pro',cores);
		assert.deepEqual([answer.table,answer.measured,answer.modelRows,answer.rows.length],['m5',measured,true,MAC17_9_ROWS],JSON.stringify(cores));
	}
	assert.equal(native.testCatalog('Mac17,9','t6050',1,'Apple M5 Pro').measured,false,'a Mac that reports no layout is not the measured one');
	for(const bad of [[6,0],[1,2,3,4,5],[6,-1],['6',12]])assert.throws(()=>native.testCatalog('Mac17,9','t6050',1,'Apple M5 Pro',bad),{code:'HWMAC_ARGUMENT'},JSON.stringify(bad));
	// The production read loop on the 15-core layout: family rows take the window, the model's own rows read as on the measured Mac.
	const fixture=scripted({Tp04:float(44),Tp0G:float(9.5),Tg0U:float(0),TaTP:float(33),Tp00:float(40)});
	const fifteen=native.testSmc('Mac17,9','t6050',1,'Apple M5 Pro',fixture,1,[5,10]),row=key=>fifteen.rows.find(item=>item.key===key);
	assert.deepEqual([fifteen.table,fifteen.tableMeasured,fifteen.perfCores,fifteen.rows.length],['m5',false,[5,10],MAC17_9_ROWS]);
	assert.deepEqual([row('Tp04').value,row('Tp0G').valid,row('Tg0U').valid,row('TaTP').value,row('Tp00').value],[44,false,false,33,40]);
	const eighteen=native.testSmc('Mac17,9','t6050',1,'Apple M5 Pro',fixture,1,MEASURED_CORES);
	assert.deepEqual([eighteen.tableMeasured,eighteen.rows.find(item=>item.key==='Tp0G').value,eighteen.rows.find(item=>item.key==='Tg0U').value],[true,9.5,0]);
});
test('a production read reports the facts its rows were chosen by, on whatever Mac runs this',async()=>{
	// The test build fakes these facts, so this is the only check of what the shipped reader resolves from the real sysctls and device tree.
	const session=production.open();let packets;try{packets=[await session.read('public'),await session.read('smc'),await session.read('health')];}finally{session.close();}
	for(const packet of packets) {
		assert.equal(typeof packet.cpu,'string');assert.equal(typeof packet.table,'string');assert.equal(typeof packet.tableMeasured,'boolean');
		const expected=native.testCatalog(packet.model,packet.chip,packet.appleSilicon,packet.cpu,packet.perfCores);
		assert.deepEqual([packet.table,packet.tableMeasured],[expected.table,expected.measured],packet.source);
		assert.deepEqual([packet.cpu,packet.table,packet.tableMeasured],[packets[0].cpu,packets[0].table,packets[0].tableMeasured],'every source reports the same facts');
	}
	const smc=packets[1],expected=native.testCatalog(smc.model,smc.chip,smc.appleSilicon,smc.cpu,smc.perfCores);
	assert.ok(Array.isArray(smc.perfCores)&&smc.perfCores.every(count=>Number.isInteger(count)&&count>0),JSON.stringify(smc.perfCores));
	// No SMC service (a virtual machine can lack one) gives no rows; otherwise exactly the rows these facts select.
	if(smc.error===0)assert.deepEqual(smc.rows.map(row=>[row.key,row.label]),expected.rows.map(row=>[row.key,row.label]));
	if(process.arch==='arm64'&&!packets[0].cpu.startsWith('Apple '))assert.deepEqual([smc.table,smc.tableMeasured],['',false]);
	if(packets[0].appleSilicon!==1)assert.deepEqual([smc.table,smc.tableMeasured],['',false],'an Intel Mac never gets a chip family table');
	// Pinned to the system's own answers, not to the native resolver: hw.model, the brand string and the core layout from sysctl, and
	// the table catalog.json gives them. Only the chip comes from the packet (the device tree's arm-io device_type).
	const sysctl=name=>{try{return execFileSync('/usr/sbin/sysctl',['-n',name],{encoding:'utf8'}).trim();}catch{return null;}};
	const model=sysctl('hw.model'),brand=sysctl('machdep.cpu.brand_string'),levels=Number(sysctl('hw.nperflevels')??0);
	const layout=levels>0?Array.from({length:levels},(_,level)=>Number(sysctl(`hw.perflevel${level}.physicalcpu`))):[];
	assert.deepEqual([smc.model,smc.cpu,smc.perfCores],[model,brand,layout]);
	const own=catalog.models[model],apple=sysctl('hw.optional.arm64')==='1',ownTable=apple&&own!==undefined&&own.chip===smc.chip;
	const family=Object.entries(catalog.families).find(([,spec])=>spec.variants.some(variant=>spec.brand+VARIANT_SUFFIX[variant]===brand))?.[0];
	assert.deepEqual([smc.table,smc.tableMeasured],[ownTable?own.family:apple?family??'':'',ownTable&&JSON.stringify(own.cores)===JSON.stringify(layout)]);
	if(model==='Mac17,9'&&smc.chip==='t6050'&&JSON.stringify(layout)==='[6,12]')assert.deepEqual([smc.table,smc.tableMeasured,smc.error===0?smc.rows.length:MAC17_9_ROWS],['m5',true,MAC17_9_ROWS],'the measured Mac');
});
test('CPU names map to their chip family and variant as Apple spells them, from a table written by hand',()=>{
	// Written out, not derived from catalog.json, so a misspelled brand there fails here. This Mac's sysctl says "Apple M5 Pro".
	const BRANDS={'Apple M1':['m1','base'],'Apple M1 Pro':['m1','pro'],'Apple M1 Max':['m1','max'],'Apple M1 Ultra':['m1','ultra'],'Apple M2':['m2','base'],'Apple M2 Pro':['m2','pro'],'Apple M2 Max':['m2','max'],'Apple M2 Ultra':['m2','ultra'],
		'Apple M3':['m3','base'],'Apple M3 Pro':['m3','pro'],'Apple M3 Max':['m3','max'],'Apple M3 Ultra':['m3','ultra'],'Apple M4':['m4','base'],'Apple M4 Pro':['m4','pro'],'Apple M4 Max':['m4','max'],
		'Apple M5':['m5','base'],'Apple M5 Pro':['m5','pro'],'Apple M5 Max':['m5','max'],'Apple M5 Ultra':['m5','ultra'],'Apple M6':['m6','base'],'Apple M6 Pro':['m6','pro'],'Apple M6 Max':['m6','max'],'Apple A18 Pro':['a18pro','base']};
	for(const [cpu,[table,variant]] of Object.entries(BRANDS)){const answer=native.testCatalog('Mac0,0','t0000',1,cpu);assert.deepEqual([answer.table,answer.variant,answer.measured],[table,VARIANT_BITS[variant],false],cpu);}
	assert.equal(Object.keys(BRANDS).length,Object.values(catalog.families).reduce((count,family)=>count+family.variants.length,0),'every name the catalog answers to is in the table');
});
test('a key the SMC does not have is asked again after 1, 2, 4 ... reads, then about every 64 to 95; a present key is read every time',()=>{
	// The measured model against an SMC that has 3 of its 109 rows (MAC17_9_ROWS). Mirrors HWMAC_ABSENT_RECHECK_READS and its per-row offset in native/hwmac/collectors.h.
	const RECHECK=64,OFFSETS=32,present={Tp04:float(44),TaTP:float(33),F0Ac:float(1500)},absent=MAC17_9_ROWS-3,READS=400;
	const run=native.testSmc('Mac17,9','t6050',1,'Apple M5 Pro',scripted(present),READS,MEASURED_CORES),asked=run.transportCalls.map(calls=>calls-3);
	// First read: key information for every row, then the value of the three that exist. Every absent key is then asked together while its wait doubles.
	assert.equal(run.transportCalls[0],MAC17_9_ROWS+3);
	const doubling=[2,5,10,19,36,69],STEADY_FROM=134;
	assert.deepEqual(asked.slice(1,STEADY_FROM).map((calls,index)=>calls?index+1:0).filter(Boolean),doubling);
	for(const read of doubling)assert.equal(asked[read],absent,`read ${read}`);
	// From then on each key waits 64 reads plus its own offset: a read asks a few keys, never all, and no key waits longer than 64 + 31 reads.
	const steady=asked.slice(STEADY_FROM);
	assert.ok(Math.max(...steady)<absent/4,`largest recheck batch ${Math.max(...steady)}`);
	for(let from=0;from+RECHECK+OFFSETS<=steady.length;from+=RECHECK+OFFSETS)assert.ok(steady.slice(from,from+RECHECK+OFFSETS).reduce((sum,calls)=>sum+calls,0)>=absent,`every absent key is asked within ${RECHECK+OFFSETS} reads from ${from}`);
	assert.ok(asked.reduce((sum,calls)=>sum+calls,0)<absent*14,'400 reads ask each absent key about a dozen times, not 400');
	// A repeated answer is the same row a fresh one gives, so the provider cannot tell them apart.
	const first=native.testSmc('Mac17,9','t6050',1,'Apple M5 Pro',scripted(present)),shape=packet=>packet.rows.map(({key,valid,code,operation,firmwareCode})=>[key,valid,code,operation,firmwareCode]);
	for(const reads of [2,4,50])assert.deepEqual(shape(native.testSmc('Mac17,9','t6050',1,'Apple M5 Pro',scripted(present),reads)),shape(first),`${reads} reads`);
	assert.equal(first.rows.filter(row=>row.code==='HWMAC_FIRMWARE'&&row.firmwareCode===0x84&&row.operation==='smc.keyInfo').length,absent);
	// A key that fails for another reason (here: a type that is not a number) is not treated as absent: its value is asked for on every read.
	const odd=native.testSmc('Mac17,9','t6050',1,'Apple M5 Pro',scripted({...present,Tp0G:{type:'ch8*',bytes:Buffer.from('abcd')}}),2);
	assert.deepEqual(odd.transportCalls,[MAC17_9_ROWS+4,4]);
});
test('the same scripted read on the measured model and on a Mac without a table',()=>{
	const fixture=scripted({Tp04:float(44),Tp0G:float(9.5),Tm04:float(-50.5),Tg0U:float(0),TaTP:float(33),Tg08:float(50),Tp00:float(40),F0Mn:float(2317)});
	const mine=native.testSmc('Mac17,9','t6050',1,'Apple M5 Pro',fixture,1,MEASURED_CORES);
	assert.deepEqual([mine.table,mine.tableMeasured,mine.perfCores,mine.rows.length],['m5',true,MEASURED_CORES,MAC17_9_ROWS]);
	const value=key=>mine.rows.find(item=>item.key===key);
	assert.deepEqual([value('Tp04').value,value('TaTP').value,value('Tg08').value,value('Tp00').value,value('F0Mn').value],[44,33,50,40,2317]);
	// The measured model keeps the full temperature range on its family rows, as 1.0.1 read them; only a value outside -50 to 150 is withheld.
	assert.deepEqual([value('Tp0G').value,value('Tg0U').value,value('Tm04').valid,value('Tm04').code],[9.5,0,false,'HWMAC_VALUE']);
	// The same chip in a model that was not measured reads the same family rows through the narrower window, and none of the model's rows.
	const other=native.testSmc('Mac17,7','t6050',1,'Apple M5 Pro',fixture),otherRow=key=>other.rows.find(item=>item.key===key);
	assert.deepEqual([other.table,other.tableMeasured,otherRow('Tp04').value,otherRow('Tp0G').valid,otherRow('Tg0U').valid,otherRow('TaTP'),otherRow('Tp00'),otherRow('Tg08'),otherRow('F0Mn').value],['m5',false,44,false,false,undefined,undefined,undefined,2317]);
	const none=native.testSmc('Mac99,1','t9999',1,'Apple M9',scripted({Tp01:float(50),TB1T:float(30)}));
	assert.deepEqual([none.table,none.tableMeasured,none.rows.length,none.rows.find(item=>item.key==='Tp01')],['',false,59,undefined]);
	for(const bad of [{key:'Tp0',type:'flt '},{key:'Tp012',type:'flt '},{key:'Tp01',type:'flt'},{key:'Tp01',type:'flt  '}])assert.throws(()=>native.testSmc('Mac0,0','t0',1,'Apple M1',[{...bad,bytes:Buffer.alloc(4)}]),{code:'HWMAC_ARGUMENT'},JSON.stringify(bad));
	assert.equal(production.testSmc,undefined);assert.equal(production.testCatalog,undefined);
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
	const allowed={'battery-cycles':['Battery cycles','Battery','count','cycles'],'battery-health':['Battery health','Battery','percent','%'],'ssd-temperature':['SSD SMART','Storage','temperature','°C']};
	assert.equal(new Set(packet.rows.map(row=>row.key)).size,packet.rows.length);
	for(const row of packet.rows){assert.deepEqual([row.label,row.group,row.kind,row.unit],allowed[row.key],row.key);if(row.valid)assert.ok(Number.isFinite(row.value)&&row.continuousMs<=packet.continuousMs,row.key);else assert.notEqual(row.error,0,row.key);}
	// The measured Mac17,9 has an internal battery and one SMART drive, and all three rows answered in every sample of the 1.0.2
	// 24-hour observation. Each value lies inside the range the provider accepts (src/mac/provider.ts KIND), the cycle count is a
	// whole number, and the drive inside the 10 to 120 C window the provider trusts for a whole-Mac temperature.
	if(packet.model!=='Mac17,9')return;
	const value=key=>packet.rows.find(row=>row.key===key&&row.valid)?.value;
	assert.deepEqual(packet.rows.map(row=>[row.key,row.valid]),[['battery-cycles',true],['battery-health',true],['ssd-temperature',true]]);
	assert.ok(Number.isInteger(value('battery-cycles'))&&value('battery-cycles')>=0,String(value('battery-cycles')));
	assert.ok(value('battery-health')>0&&value('battery-health')<=200,String(value('battery-health')));
	assert.ok(value('ssd-temperature')>=10&&value('ssd-temperature')<=120,String(value('ssd-temperature')));
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
