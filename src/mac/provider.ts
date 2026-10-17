import { SensorType, type Reading, type SensorSnapshot, type SensorSource } from '../hwinfo/types';
import type { SnapshotProvider } from '../hwinfo/provider';
import type { NativeBridge, NativePacket, NativeRow, NativeSession, NativeSource } from './native-api';
import { constants } from 'node:os';
import { MacSensorError } from './bridge';
const TTL=15_000;
/** Shortest offered Read every, and the target start of the rebaseline read counted from the first read's request, so CPU usage and rates appear this soon instead of one full interval later. */
const COUNTER_REBASELINE_MS=250;
/** Shortest counter window around the rebaseline read. The kernel counts CPU time in 10 ms ticks (kern.clockrate hz 100), so 200 ms holds about twenty. The native read takes CPU ticks after its font check and network and storage counters last, so the rebaseline read never starts sooner than this after the first read completed, and a tick that would follow a kept rebaseline sample by less than this reads only SMC. At the 500 ms setting the regular tick keeps its read when the first read finishes within 100 ms. */
const MIN_COUNTER_WINDOW_MS=200;
/** sysctl.proc_translated is absent (ENOENT) on Intel Macs; Apple's Rosetta documentation treats that as a native process. */
const TRANSLATION_ABSENT_ERRNO=constants.errno.ENOENT;
/** Native when the sysctl says 0 or does not exist; translated only on 1; anything else, including other errors, stays unknown. */
function translationOf(translated:number,translationError:number):ProviderFacts['translation'] {return translated===0||(translated<0&&translationError===TRANSLATION_ABSENT_ERRNO)?'native':translated===1?'translated':'unknown';}
const GROUPS:Record<string,number>={CPU:1,GPU:2,Memory:3,Storage:4,Network:5,Battery:6,Fans:7,System:8};
const KIND:Record<string,{type:SensorType;meaning:string;minimum:number;maximum:number}>={
	temperature:{type:SensorType.Temperature,meaning:'temp.v1',minimum:-50,maximum:150},
	voltage:{type:SensorType.Voltage,meaning:'voltage.v1',minimum:0,maximum:100},
	fan:{type:SensorType.Fan,meaning:'rpm.v1',minimum:0,maximum:30000},
	current:{type:SensorType.Current,meaning:'current.v1',minimum:-500,maximum:500},
	power:{type:SensorType.Power,meaning:'power.v1',minimum:-1000,maximum:2000},
	usage:{type:SensorType.Usage,meaning:'usage.v1',minimum:0,maximum:100},
	other:{type:SensorType.Other,meaning:'other.v1',minimum:0,maximum:Number.MAX_SAFE_INTEGER}
};
const SYSTEM_KEYS=new Set(['cpu-total','memory-total','memory-free','memory-active','memory-inactive','memory-wired','memory-compressed','swap-used','disk-root-total','disk-root-available','network-receive','network-send','storage-read','storage-write']);
interface Accepted { row: NativeRow; reading: Reading; source: NativeSource; }
export interface ProviderFacts { model:string;chip:string;appleSilicon:boolean|null;translation:'native'|'translated'|'unknown';translationError:number;sourceRows:Record<NativeSource,number>; sourceErrors:Partial<Record<NativeSource,{code:string;operation:string;systemCode:number}>>; }
export function encodeModel(model:string): string | null {
	if(!model||model.length>128||[...model].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)||Buffer.from(model,'utf8').toString('utf8')!==model)return null;
	return [...Buffer.from(model,'utf8')].map(byte=>/[A-Za-z0-9._~-]/.test(String.fromCharCode(byte))?String.fromCharCode(byte):'%'+byte.toString(16).toUpperCase().padStart(2,'0')).join('');
}
/** encodeModel's answer for the last model seen: every SMC row of a packet, and every packet on one Mac, carries the same model, and encoding it per row was about half of the provider's per-read CPU and allocation (2026-10-17 review bench). */
let lastModel:{model:string;encoded:string|null}|null=null;
export function measurementKey(source:NativeSource,row:NativeRow,model:string):string|null {
	if(source==='public')return SYSTEM_KEYS.has(row.key)?`mac:v1:system:${row.key}`:null;
	if(lastModel?.model!==model)lastModel={model,encoded:encodeModel(model)};
	const encoded=lastModel.encoded,kind=KIND[row.kind];
	if(encoded===null||!/^[\x20-\x7e]{4}$/.test(row.key)||!kind)return null;
	return `mac:v1:smc:${encoded}:${Buffer.from(row.key,'ascii').toString('hex')}:${kind.meaning}`;
}
function counter(value:string):bigint|null { if(!/^(0|[1-9][0-9]{0,19})$/.test(value))return null;const result=BigInt(value);return result<=18446744073709551615n?result:null; }
function derived(packet:NativePacket,key:string,label:string,group:string,kind:string,unit:string,value:number):NativeRow {
	return {key,label,group,kind,unit,value,valid:Number.isFinite(value),continuousMs:packet.continuousMs,wallSeconds:packet.wallSeconds,error:0,systemCode:0};
}
export function counterRows(previous:NativePacket|null,packet:NativePacket):NativeRow[] {
	if(!previous)return [];
	const seconds=(packet.continuousMs-previous.continuousMs)/1000;
	const asleep=(packet.continuousMs-previous.continuousMs)-(packet.awakeMs-previous.awakeMs);
	if(!(seconds>0)||!Number.isFinite(seconds)||!Number.isFinite(asleep)||Math.abs(asleep)>50)return [];
	const rows:NativeRow[]=[];
	if(packet.cpuValid&&previous.cpuValid&&packet.cpuTicks.length>0&&packet.cpuTicks.length===previous.cpuTicks.length) {
		let total=0,idle=0,valid=true;
		for(let cpu=0;cpu<packet.cpuTicks.length;cpu++)for(let state=0;state<4;state++) {
			const next=packet.cpuTicks[cpu]?.[state],last=previous.cpuTicks[cpu]?.[state];
			if(next===undefined||last===undefined||!Number.isInteger(next)||!Number.isInteger(last)||next<last||next>0xffffffff||last<0){valid=false;continue;}
			const delta=next-last;total+=delta;if(state===2)idle+=delta;
		}
		if(valid&&total>0)rows.push(derived(packet,'cpu-total','CPU usage','CPU','usage','%',100*(total-idle)/total));
	}
	for(const [valid,oldValid,membership,oldMembership,fields] of [
		[packet.networkValid,previous.networkValid,packet.networkMembers,previous.networkMembers,[['network-receive','Network receive','Network',packet.networkIn,previous.networkIn],['network-send','Network send','Network',packet.networkOut,previous.networkOut]]],
		[packet.storageValid,previous.storageValid,packet.storageMembers,previous.storageMembers,[['storage-read','Storage read','Storage',packet.storageRead,previous.storageRead],['storage-write','Storage write','Storage',packet.storageWrite,previous.storageWrite]]]
	] as const) {
		if(!valid||!oldValid||membership!==oldMembership||counter(membership)===null)continue;
		const parsed=fields.map(([key,label,group,next,last])=>({key,label,group,next:counter(next),last:counter(last)}));
		if(parsed.some(item=>item.next===null||item.last===null||item.next<item.last))continue;
		for(const item of parsed)rows.push(derived(packet,item.key,item.label,item.group,'other','B/s',Number(item.next!-item.last!)/seconds));
	}
	return rows;
}
export class MacProvider implements SnapshotProvider {
	readonly source='mac' as const;
	private readonly session:NativeSession;
	private readonly startedAt:number;
	private closed=false;
	private readonly rows=new Map<string,Accepted>();
	private readonly pending=new Set<NativeSource>();
	private readonly retries=new Map<NativeSource,NodeJS.Timeout>();
	private readonly seenNotices=new Set<string>();
	private noticesQueue:string[]=[];
	private previousPublic:NativePacket|null=null;
	/** The pending counter rebaseline read; a tick read that comes first replaces it. */
	private rebaseline:NodeJS.Timeout|null=null;
	/** Set once the rebaseline is armed, so a generation gets at most one extra read even after a public failure resets the baseline. */
	private rebaselined=false;
	/** When the rebaseline read started; the next tick skips its public read if it would follow within MIN_COUNTER_WINDOW_MS of a successful one. */
	private rebaselineStartedAt:number|null=null;
	/** When the in-flight public read was requested, so the rebaseline window counts from the first read's start, not its completion. */
	private publicRequestedAt:number|null=null;
	private fontKnown=false;
	private fontAvailable=false;
	private readonly completed=new Set<NativeSource>();
	private observation=0;
	private valueRevision=0;
	private freshnessRevision=0;
	private snapshot:SensorSnapshot|null=null;
	private dirty=true;
	private catalogDirty=true;
	private catalogRevision=0;
	private factsValue:ProviderFacts={model:'unknown',chip:'unknown',appleSilicon:null,translation:'unknown',translationError:0,sourceRows:{public:0,smc:0},sourceErrors:{}};
	constructor(private readonly native:NativeBridge,private readonly ready:()=>void,private readonly report:(facts:ProviderFacts)=>void=()=>{}) {this.startedAt=native.now();this.session=native.open();}
	facts():ProviderFacts{return structuredClone(this.factsValue);}
	/** Reads requested and not yet settled; the poller publishes a read once none remain. */
	inFlight():number{return this.closed?0:this.pending.size;}
	/** The reads' own monotonic clock in ms, so the poller can tell how long a read's sources settle apart. */
	now():number{return this.closed?NaN:this.native.now();}
	notices():string[]{const messages=this.noticesQueue;this.noticesQueue=[];return messages;}
	private notice(message:string):void {if(this.seenNotices.has(message))return;if(this.seenNotices.size>=32)return;this.seenNotices.add(message);this.noticesQueue.push(message);}
	private removeSource(source:NativeSource):void {for(const [key,item] of this.rows)if(item.source===source){this.rows.delete(key);this.dirty=true;this.catalogDirty=true;}}
	private accept(source:NativeSource,packet:NativePacket):void {
		if(this.closed)return;
		this.completed.add(source);
		if(packet.error!==0)this.factsValue.sourceErrors[source]={code:packet.error===10?'HWMAC_NO_SERVICE':packet.error===11?'HWMAC_OPEN':'HWMAC_SOURCE',operation:packet.error===10?'smc.matchService':packet.error===11?'smc.open':`${source}.read`,systemCode:packet.systemCode};
		else delete this.factsValue.sourceErrors[source];
		const now=this.native.now();
		if(packet.source!==source||packet.error!==0||!Number.isFinite(now)||!Number.isFinite(packet.continuousMs)||packet.continuousMs>now||now-packet.continuousMs>=TTL||packet.rows.length>128){this.removeSource(source);if(source==='public')this.previousPublic=null;this.notice(`${source} readings unavailable; other sources continue.`);return;}
		if(source==='public'){this.fontKnown=true;this.fontAvailable=packet.fontAvailable===true;}
		const rows=[...packet.rows,...(source==='public'?counterRows(this.previousPublic,packet):[])];
		if(source==='public'){
			if(this.previousPublic===null&&!this.rebaselined)this.armRebaseline(now);
			this.previousPublic=packet;
		}
		// One key per row, shared by the duplicate count and the acceptance pass.
		const keys=rows.map(row=>measurementKey(source,row,packet.model));
		const counts=new Map<string,number>();
		for(const key of keys)if(key)counts.set(key,(counts.get(key)??0)+1);
		const accepted=new Map<string,Accepted>();
		for(let index=0;index<rows.length;index++) {
			const row=rows[index]!,key=keys[index],kind=KIND[row.kind];
			if(!key||counts.get(key)!==1||!kind||!row.valid||!Number.isFinite(row.value)||row.value<kind.minimum||row.value>kind.maximum||!Number.isFinite(row.continuousMs)||row.continuousMs<0||row.continuousMs>now||now-row.continuousMs>=TTL||!Number.isFinite(row.wallSeconds))continue;
			const reading:Reading={key,type:kind.type,sensorIndex:0,id:0,label:row.label,unit:row.unit,value:row.value,valueMin:NaN,valueMax:NaN,valueAvg:NaN,statistics:'unavailable',observationTime:row.continuousMs,observationRevision:++this.observation};
			const previous=this.rows.get(key);
			if(previous&&previous.reading.value!==reading.value)this.freshnessRevision++;
			const changedCatalog=!previous||previous.reading.unit!==reading.unit||previous.reading.type!==reading.type||previous.reading.label!==reading.label||previous.row.group!==row.group;
			if(changedCatalog)this.catalogDirty=true;
			if(changedCatalog||previous?.reading.value!==reading.value)this.dirty=true;
			accepted.set(key,{row,reading,source});
		}
		for(const [key,item] of this.rows)if(item.source===source&&!accepted.has(key)){this.rows.delete(key);this.dirty=true;this.catalogDirty=true;}
		for(const [key,item] of accepted)this.rows.set(key,item);
		this.factsValue={model:packet.model||'unknown',chip:packet.chip||'unknown',appleSilicon:packet.appleSilicon<0?null:packet.appleSilicon===1,translation:translationOf(packet.translated,packet.translationError),translationError:packet.translationError,sourceErrors:this.factsValue.sourceErrors,sourceRows:{...this.factsValue.sourceRows,[source]:accepted.size}};
		if(packet.translated===1)this.notice('Node is running under translation; sensor interfaces follow the detected hardware.');
		if(source==='smc'&&(packet.model!=='Mac17,9'||packet.chip!=='t6050'))this.notice('This model uses common typed sensors; its generation-specific catalog is not qualified.');
		this.rebuild();
	}
	/**
	 * Once per generation: the first accepted public packet only sets the counter baseline, so read public again
	 * COUNTER_REBASELINE_MS after its request, never sooner than MIN_COUNTER_WINDOW_MS after it completed (now).
	 * A missing or non-finite request time leaves the full delay. The rebaseline read's start is the request time that request() stamps.
	 */
	private armRebaseline(now:number):void {
		this.rebaselined=true;
		const sinceRequest=now-(this.publicRequestedAt??NaN),elapsed=Number.isFinite(sinceRequest)?Math.max(0,sinceRequest):0;
		this.rebaseline=setTimeout(()=>{this.rebaseline=null;this.request('public');if(this.pending.has('public'))this.rebaselineStartedAt=this.publicRequestedAt;},Math.max(MIN_COUNTER_WINDOW_MS,COUNTER_REBASELINE_MS-elapsed)).unref();
	}
	private request(source:NativeSource):void {
		if(this.closed||this.pending.has(source)||this.retries.has(source))return;
		try {
			const promise=this.session.read(source);this.pending.add(source);if(source==='public')this.publicRequestedAt=this.native.now();
			void promise.then(packet=>{if(!this.closed)this.accept(source,packet);}).catch(()=>{if(!this.closed){this.completed.add(source);this.removeSource(source);if(source==='public')this.previousPublic=null;this.notice(`${source} read failed; retrying.`);}}).finally(()=>{this.pending.delete(source);if(!this.closed)this.ready();}).catch(()=>{if(!this.closed)this.notice('A sensor update could not be delivered.');});
		} catch(error) {
			if((error as {code?:string}).code==='HWMAC_BUSY') {
				const retry=setTimeout(()=>{this.retries.delete(source);this.request(source);},250).unref();this.retries.set(source,retry);
			} else {this.completed.add(source);this.removeSource(source);this.notice(`${source} could not start; retrying.`);}
		}
	}
	read():SensorSnapshot|null {
		if(this.closed)throw new MacSensorError('pending','Readings appear after the first successful sample.');
		// Counters are only meaningful over a real window: two public reads a few ms apart give CPU usage and rates from almost no ticks or bytes.
		// So a tick read due before the rebaseline replaces it, and a tick just after a rebaseline read that kept a baseline (a Read every change restarted the timer) keeps that sample.
		if(this.rebaseline){clearTimeout(this.rebaseline);this.rebaseline=null;}
		const sinceRebaseline=this.rebaselineStartedAt===null?Infinity:this.native.now()-this.rebaselineStartedAt;this.rebaselineStartedAt=null;
		if(!(sinceRebaseline<MIN_COUNTER_WINDOW_MS&&this.previousPublic!==null))this.request('public');
		this.request('smc');return this.current();
	}
	private rebuild():void {
		if(this.catalogDirty){this.catalogRevision++;this.catalogDirty=false;}
		this.factsValue.sourceRows={public:0,smc:0};for(const item of this.rows.values())this.factsValue.sourceRows[item.source]++;
		this.report(this.facts());
		if(this.dirty){this.valueRevision++;this.dirty=false;}
		const groups=[...new Set([...this.rows.values()].map(item=>Object.hasOwn(GROUPS,item.row.group)?item.row.group:'System'))].sort((a,b)=>GROUPS[a]!-GROUPS[b]!);
		const sensors:SensorSource[]=groups.map((name,index)=>({index,id:GROUPS[name]!,instance:0,name}));
		const readings:Reading[]=[...this.rows.values()].map(item=>({...item.reading,sensorIndex:groups.indexOf(Object.hasOwn(GROUPS,item.row.group)?item.row.group:'System')})).sort((a,b)=>a.sensorIndex-b.sensorIndex||a.key.localeCompare(b.key));
		let latest:Accepted|undefined;for(const item of this.rows.values())if(!latest||item.row.continuousMs>latest.row.continuousMs)latest=item;
		this.snapshot={catalogRevision:this.catalogRevision,pollTime:latest?.row.wallSeconds??0,valueRevision:this.valueRevision,freshnessRevision:this.freshnessRevision,version:1,revision:1,sensors,readings,byKey:new Map(readings.map(reading=>[reading.key,reading]))};
	}
	current():SensorSnapshot|null {
		if(this.closed)throw new MacSensorError('pending','Readings appear after the first successful sample.');
		const now=this.native.now();
		if(!Number.isFinite(now)){this.rows.clear();this.dirty=true;this.catalogDirty=true;this.rebuild();throw new MacSensorError('source-error','The measurement clock is unavailable.');}
		for(const [key,item] of this.rows)if(now-item.row.continuousMs>=TTL||now<item.row.continuousMs){this.rows.delete(key);this.dirty=true;this.catalogDirty=true;}
		if(this.dirty)this.rebuild();
		if(this.fontKnown&&!this.fontAvailable)throw new MacSensorError('font-missing','Install Tahoma Bold in Font Book, then choose Check again.');
		if(!this.fontKnown&&this.completed.size<2){if(now-this.startedAt>=TTL)throw new MacSensorError('busy','The sensor source is still busy. Choose Check again.');return null;}
		if(!this.fontKnown)throw new MacSensorError('source-error','The font prerequisite could not be checked. Choose Check again.');
		if(this.rows.size===0&&this.completed.size===2)throw new MacSensorError('no-readable-sensors','No recent readable sensors were found. Choose Copy support report.');
		return this.rows.size?this.snapshot:null;
	}
	/** Ms until the next row expires. No deadline while the clock is not finite: current() has already cleared the rows, and the interval tick rechecks, so a NaN clock cannot drive a 1 ms expiry loop. */
	untilExpiry():number|null {if(this.closed)return null;const now=this.native.now();if(!Number.isFinite(now))return null;if(!this.rows.size)return !this.fontKnown&&this.completed.size<2&&now-this.startedAt<TTL?this.startedAt+TTL-now:null;return Math.max(0,Math.min(...[...this.rows.values()].map(item=>item.row.continuousMs+TTL-now)));}
	age():number|null {if(this.closed||!this.rows.size)return null;const now=this.native.now();return Number.isFinite(now)?Math.max(...[...this.rows.values()].map(item=>now-item.row.continuousMs)):null;}
	close():void {if(this.closed)return;this.closed=true;for(const retry of this.retries.values())clearTimeout(retry);this.retries.clear();if(this.rebaseline)clearTimeout(this.rebaseline);this.rebaseline=null;this.rows.clear();this.snapshot=null;this.previousPublic=null;this.factsValue.sourceRows={public:0,smc:0};this.report(this.facts());this.session.close();}
}
