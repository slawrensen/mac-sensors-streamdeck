import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {inkEdges} from '../../src/ui/format';
import {inKeyLens,KEY_TEXT_LADDERS,renderReadingKey} from '../../src/ui/key-renderer';
import {renderDial} from '../../src/ui/dial-renderer';
import {loadThemes,resolvePalette} from '../../src/ui/themes';
import {MacProvider,computedRows,counterRows} from '../../src/mac/provider';
import type {NativeBridge,NativePacket,NativeRow,NativeSource} from '../../src/mac/native-api';
type CatalogRow={key:string;label:string;group:string;type:string;scope:string;variants?:string[]};
const catalog=(JSON.parse(fs.readFileSync('native/hwmac/catalog.json','utf8')) as {rows:CatalogRow[]}).rows;
/** The names collectors.c gives its system counter and health rows, read from its source as the build compiles it. */
const collectors=fs.readFileSync('native/hwmac/collectors.c','utf8');
const nativeNamed=[...collectors.matchAll(/(?:system_value|new_row)\(packet, "([a-z0-9-]+)", "([^"]+)", "([A-Za-z]+)"/g)].map(([,key,label,group])=>({key:key!,label:label!,group:group!}));
const palette=resolvePalette(loadThemes(),'void',null,'normal');
const UNITS:Record<string,string>={temperature:'°C',fan:'RPM',voltage:'V',current:'A',power:'W'};
const at=(continuousMs:number):Pick<NativeRow,'continuousMs'|'wallSeconds'|'error'|'systemCode'|'valid'>=>({continuousMs,wallSeconds:1.7e9+continuousMs/1000,error:0,systemCode:0,valid:true});
const row=(key:string,label:string,group:string,kind:string,unit:string,value:number,time=100):NativeRow=>({key,label,group,kind,unit,value,...at(time)});
const catalogRow=(entry:CatalogRow,value=40,time=100):NativeRow=>row(entry.key,entry.label,entry.group,entry.type,UNITS[entry.type]!,entry.type==='fan'?2000:value,time);
function publicPacket(continuousMs:number,ticks:number,bytes:number):NativePacket {
	return {source:'public',rows:nativeNamed.filter(entry=>!entry.key.startsWith('battery')&&!entry.key.startsWith('ssd')).map(entry=>row(entry.key,entry.label,entry.group,'other','B',1e9,continuousMs)),continuousMs,awakeMs:continuousMs,wallSeconds:1.7e9+continuousMs/1000,durationMs:1,error:0,code:'HWMAC_OK',systemCode:0,operation:'fixture',model:'Mac17,9',chip:'t6050',cpu:'Apple M5 Pro',table:'m5',tableMeasured:true,appleSilicon:1,translated:0,translationError:0,fontAvailable:true,cpuValid:true,cpuTicks:[[ticks,0,ticks,0]],networkValid:true,networkIn:String(bytes),networkOut:String(bytes),networkMembers:'1',storageValid:true,storageRead:String(bytes),storageWrite:String(bytes),storageMembers:'1'};
}
/** Every name the Mac provider can put on a face: catalog rows, system counters and health rows, the five worked-out counters and the computed readings of both paths. */
function everyName():{label:string;from:string}[] {
	const names=[...catalog.map(entry=>({label:entry.label,from:`catalog ${entry.scope} ${entry.key}`})),...nativeNamed.map(entry=>({label:entry.label,from:`collectors.c ${entry.key}`}))];
	for(const counted of counterRows(publicPacket(100,10,1000),publicPacket(1100,30,5000)))names.push({label:counted.label,from:`counter ${counted.key}`});
	// The fixed-list path on Mac17,9 and the accepted-rows path on a chip family table, each fed every row its table can give.
	const measured=new Map(catalog.filter(entry=>['common','apple','Mac17,9'].includes(entry.scope)||(entry.scope==='m5'&&(!entry.variants||entry.variants.includes('pro')))).map(entry=>[entry.key,catalogRow(entry)]));
	const family=new Map(catalog.filter(entry=>['common','apple','m2'].includes(entry.scope)).map(entry=>[entry.key,catalogRow(entry)]));
	for(const computed of [...computedRows('Mac17,9','t6050',measured,true,true),...computedRows('Mac14,6','t6021',family,true)])names.push({label:computed.label,from:`computed ${computed.key}`});
	return names;
}
const KEY_LABEL_FLOOR=KEY_TEXT_LADDERS.singleLabel.at(-1)!;
test('every reading name fits the key lens whole at the smallest label size, so its number stays on the face',()=>{
	const names=everyName(),computed=names.filter(name=>name.from.startsWith('computed')).map(name=>name.label);
	assert.deepEqual([...new Set(computed)].sort(),['CPU average','Fan average','Hottest core','Hottest sensor','Mac average']);
	assert.ok(names.length>catalog.length+nativeNamed.length,'counters and computed readings are walked too');
	for(const {label,from} of names) {
		// The production fit: the single key tries its ladder and cuts with an ellipsis at the floor only when nothing fits.
		const svg=renderReadingKey({label,valueText:'88.8',unitText:'°C',statBadge:'',palette}),drawn=/<text x="72" y="32"[^>]*>([^<]*)<\/text>/.exec(svg)?.[1];
		assert.equal(drawn,label.replaceAll('&','&amp;'),`${from}: "${label}" is cut on the key`);
		const edges=inkEdges([{text:label,fontSize:KEY_LABEL_FLOOR}],'middle',72);
		assert.ok(inKeyLens([{text:label,fontSize:KEY_LABEL_FLOOR}]),`${from}: "${label}" inks ${edges.left.toFixed(1)} to ${edges.right.toFixed(1)} at ${KEY_LABEL_FLOOR} px`);
		// The single dial title has more room than the key, so a name that fits the key stays whole there too.
		const dial=renderDial({title:label,valueText:'88.8',unitText:'°C',statsText:'',fraction:.5,palette,barColor:palette.accent});
		assert.ok(dial.includes(`>${label.replaceAll('&','&amp;')}</text>`),`${from}: "${label}" is cut on the dial`);
	}
});
test('numbered names follow one pattern per kind',()=>{
	const numbered=/^(?:(?:Super|Perf|Eff) core|(?:Super|Perf) zone|CPU sensor|GPU region|GPU|Memory|Fan) [1-9][0-9]?(?: (?:target|min|max))?$/;
	for(const entry of catalog.filter(item=>/[0-9]/.test(item.label)&&item.key!=='TB2T'))assert.match(entry.label,numbered,`${entry.scope} ${entry.key}`);
});
test('no two names one Mac can show look alike once case is ignored',()=>{
	// The measured Mac17,9, and a Mac on each chip family table: common and Apple silicon rows, its own rows, the system counters, health rows and computed readings.
	const own:[string,(entry:CatalogRow)=>boolean][]=[['Mac17,9',entry=>entry.scope==='Mac17,9'||(entry.scope==='m5'&&(!entry.variants||entry.variants.includes('pro')))],...['m1','m2','m3','m4','m5','m6','a18pro'].map(name=>[name,(entry:CatalogRow)=>entry.scope===name] as [string,(entry:CatalogRow)=>boolean])];
	const derived=everyName().filter(name=>name.from.startsWith('counter')||name.from.startsWith('computed')).map(name=>name.label);
	for(const [name,mine] of own) {
		// One variant at a time: M4 and M5 give some keys only to some variants, under the same name.
		const variants=[...new Set(catalog.filter(entry=>entry.scope===name).flatMap(entry=>entry.variants??[]))];
		for(const variant of variants.length?variants:[null]) {
			const rows=catalog.filter(entry=>entry.scope==='common'||entry.scope==='apple'||(mine(entry)&&(variant===null||!entry.variants||entry.variants.includes(variant))));
			const labels=[...rows.map(entry=>entry.label),...nativeNamed.map(entry=>entry.label),...new Set(derived)].map(label=>label.toLowerCase());
			for(const label of new Set(labels))assert.equal(labels.filter(item=>item===label).length,1,`${name} ${variant??''}: "${label}"`);
		}
	}
});
/**
 * The 89 readings the measured Mac17,9 showed under 1.0.2 (test/mac/fixtures/mac17-9-readings-1.0.2.json, from npm run probe).
 * A saved key stores one of these identities, so each must still be produced, whatever its label or group now is.
 */
const READINGS_1_0_2=(JSON.parse(fs.readFileSync('test/mac/fixtures/mac17-9-readings-1.0.2.json','utf8')) as {readings:{identity:string;label:string;group:string}[]}).readings;
test('every reading a 1.0.2 key could be saved on keeps its identity under the new names',async()=>{
	assert.equal(READINGS_1_0_2.length,14+67+3+5);
	const answered=new Set(READINGS_1_0_2.map(item=>/^mac:v1:smc:Mac17%2C9:([0-9a-f]{8}):/.exec(item.identity)?.[1]).filter((hex):hex is string=>hex!==undefined).map(hex=>Buffer.from(hex,'hex').toString('ascii')));
	const smcRows=catalog.filter(entry=>answered.has(entry.key)&&(['common','apple','Mac17,9'].includes(entry.scope)||(entry.scope==='m5'&&(!entry.variants||entry.variants.includes('pro'))))).map(entry=>catalogRow(entry,40,0));
	assert.equal(smcRows.length,67,'each answered key is one catalog row on Mac17,9');
	const health=nativeNamed.filter(entry=>entry.key.startsWith('battery')||entry.key.startsWith('ssd')).map(entry=>row(entry.key,entry.label,entry.group,entry.key==='battery-cycles'?'count':entry.key==='battery-health'?'percent':'temperature',entry.key==='battery-cycles'?'cycles':entry.key==='battery-health'?'%':'°C',50,0));
	// The production provider over a bridge that answers with those rows: two public reads so the five worked-out counters appear.
	const pending=new Map<NativeSource,(packet:NativePacket)=>void>(),clock={now:0};
	const bridge:NativeBridge={getBuildInfo:()=>({protocol:1,napi:8,version:'test',sourceId:'test',arch:process.arch,platform:'darwin',testHooks:true}),now:()=>clock.now,open:()=>({read:(source)=>new Promise(resolve=>pending.set(source,resolve)),close:()=>{}})};
	const provider=new MacProvider(bridge,()=>{});
	const answer=async(source:NativeSource,packet:NativePacket)=>{pending.get(source)?.(packet);pending.delete(source);await new Promise(resolve=>setImmediate(resolve));};
	provider.read();await answer('public',publicPacket(0,10,1000));
	clock.now=1000;provider.read();await answer('public',publicPacket(1000,30,5000));
	const smc:NativePacket={...publicPacket(1000,0,0),source:'smc',rows:smcRows.map(item=>({...item,continuousMs:1000,wallSeconds:1.7e9+1}))};
	await answer('smc',smc);await answer('health',{...publicPacket(1000,0,0),source:'health',rows:health.map(item=>({...item,continuousMs:1000,wallSeconds:1.7e9+1}))});
	const snapshot=provider.current();assert.ok(snapshot);
	for(const reading of READINGS_1_0_2)assert.ok(snapshot.byKey.has(reading.identity),`${reading.label} (${reading.identity}) is no longer produced`);
	// A group is not part of an identity either: the drive sensor moved from System to Storage and kept its key.
	const groupNow=(identity:string)=>snapshot.sensors[snapshot.byKey.get(identity)!.sensorIndex]?.name;
	const moved=READINGS_1_0_2.filter(reading=>groupNow(reading.identity)!==reading.group).map(reading=>`${reading.label}: ${reading.group} to ${groupNow(reading.identity)}`);
	assert.deepEqual(moved,['NAND: System to Storage']);
	assert.equal(snapshot.readings.length,READINGS_1_0_2.length,'no reading appeared or vanished, only names changed');
	provider.close();
});
