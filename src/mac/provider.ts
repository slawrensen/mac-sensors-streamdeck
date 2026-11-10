import { SensorType, type Reading, type SensorSnapshot, type SensorSource } from '../hwinfo/types';
import type { SnapshotProvider } from '../hwinfo/provider';
import { NATIVE_SOURCES, type NativeBridge, type NativePacket, type NativeRow, type NativeSession, type NativeSource } from './native-api';
import { constants } from 'node:os';
import { MacSensorError } from './bridge';
/** How long a reading stays live after its own acquisition; past it the reading is removed, never shown as current. */
export const TTL_MS=15_000;
/** Shown while no reading is live yet, and again when every live reading lapsed before a full read completed. */
export const PENDING_MESSAGE='Readings appear after the first successful sample.';
/** Shortest offered Read every, and the target start of the rebaseline read counted from the first read's request, so CPU usage and rates appear this soon instead of one full interval later. */
const COUNTER_REBASELINE_MS=250;
/** Shortest counter window around the rebaseline read. The kernel counts CPU time in 10 ms ticks (kern.clockrate hz 100), so 200 ms holds about twenty. The native read takes CPU ticks after its font check and network and storage counters last, so the rebaseline read never starts sooner than this after the first read completed, and a tick that would follow a kept rebaseline sample by less than this reads only SMC. At the 500 ms setting the regular tick keeps its read when the first read finishes within 100 ms. */
const MIN_COUNTER_WINDOW_MS=200;
/** sysctl.proc_translated is absent (ENOENT) on Intel Macs; Apple's Rosetta documentation treats that as a native process. */
const TRANSLATION_ABSENT_ERRNO=constants.errno.ENOENT;
/**
 * Shortest time between two health read requests. Battery cycles and health change over days and the SSD temperature over
 * seconds, and every read sends the drive one SMART command, so health is read about as often as TG Pro's 2 s default:
 * every second read at the 1 s default, with half a read of room for timer jitter. Far inside the TTL, so its readings stay live.
 */
export const HEALTH_MIN_SPACING_MS=1500;
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
	count:{type:SensorType.Other,meaning:'count.v1',minimum:0,maximum:Number.MAX_SAFE_INTEGER},
	// A new battery's nominal capacity can read a little above its design capacity; twice the design capacity is not a battery.
	percent:{type:SensorType.Other,meaning:'percent.v1',minimum:0,maximum:200},
	other:{type:SensorType.Other,meaning:'other.v1',minimum:0,maximum:Number.MAX_SAFE_INTEGER}
};
/** Health rows: one internal battery and one internal drive per Mac, so the name alone identifies them, as system counters do. */
const HEALTH_KEYS=new Set(['battery-cycles','battery-health','ssd-temperature']);
const SYSTEM_KEYS=new Set(['cpu-total','memory-total','memory-free','memory-active','memory-inactive','memory-wired','memory-compressed','swap-used','disk-root-total','disk-root-available','network-receive','network-send','storage-read','storage-write']);
/** A reading this provider computes from other readings of one SMC packet. */
interface ComputedSpec { name:string; label:string; group:string; kind:'temperature'|'fan'; unit:string; reduce:'mean'|'max'; inputs:readonly string[]; }
/**
 * Mac17,9 core keys, as named in native/hwmac/catalog.json: Super core 1 to 6, then Perf core 1 to 12. Measured against TG Pro's
 * own log through a load swing, and by loading each CPU cluster alone: every Tp key warms with the super cores, the Tm keys are the performance cores.
 */
const M5_PRO_CORES=['Tp04','Tp0G','Tp0R','Tp0a','Tp0j','Tp0u','Tm04','Tm0G','Tm0R','Tm0a','Tm0j','Tm0u','Tm1Q','Tm1c','Tm1o','Tm21','Tm2D','Tm2P'] as const;
/** TG Pro's whole-Mac set on Mac17,9: the cores, its four GPU regions, battery, airflow, trackpad, power, ports, wireless and SSD. Its Battery, Battery Gas Gauge and Battery Management Unit all equal TB1T within rounding, so TB1T counts three times, as it does there. */
const M5_PRO_WHOLE_MAC=[...M5_PRO_CORES,'Tg08','Tg12','Tg29','Tg3B','TB1T','TB1T','TB1T','TB2T','TaLP','TaRF','TaTP','Ts0P','Ts1P','TCHP','TPSP','TaLT','TaRT','TW0P','TH0x'] as const;
/**
 * Computed readings exist only where their input set is qualified, as the native model tables are: a fixed
 * list of keys per model and chip, so a missing input can never quietly change what an average covers.
 * The mean of these 18 is within 1 °C of TG Pro's CPU Average in 94.7 % of 530 samples taken through CPU and GPU load swings, where it
 * logs whole degrees 2 seconds apart. Its Fan Average covers the two actual speeds. Fan target, minimum and maximum are never inputs.
 */
const COMPUTED_TABLES:ReadonlyArray<{model:string;chip:string;readings:readonly ComputedSpec[]}>=[{model:'Mac17,9',chip:'t6050',readings:[
	{name:'cpu-average',label:'CPU average',group:'CPU',kind:'temperature',unit:'°C',reduce:'mean',inputs:M5_PRO_CORES},
	{name:'cpu-hottest',label:'Hottest core',group:'CPU',kind:'temperature',unit:'°C',reduce:'max',inputs:M5_PRO_CORES},
	{name:'fan-average',label:'Fan average',group:'Fans',kind:'fan',unit:'RPM',reduce:'mean',inputs:['F0Ac','F1Ac']},
	{name:'computer-average',label:'Mac average',group:'System',kind:'temperature',unit:'°C',reduce:'mean',inputs:M5_PRO_WHOLE_MAC},
	{name:'hottest-sensor',label:'Hottest sensor',group:'System',kind:'temperature',unit:'°C',reduce:'max',inputs:M5_PRO_WHOLE_MAC}
]}];
/**
 * How a chip family table names a per-core CPU temperature (native/hwmac/catalog.json; test/mac/provider.test.ts pins the match):
 * Super, Perf or Eff core N for a sensor named after one core, CPU sensor N where the core is not known.
 */
export const CORE_LABEL=/^(?:(?:Super|Perf|Eff) core|CPU sensor) [1-9][0-9]?$/;
const FAN_SPEED_KEY=/^F[0-7]Ac$/;
/** A temperature counts toward a whole-Mac reading only inside this window: Stats drops a sensor that reads 0 and one above 110 °C, and treats a CPU sensor outside 10 to 120 °C as broken (Modules/Sensors/readers.swift). */
const WHOLE_MAC_TEMPERATURE_C=[10,120] as const;
/** A reading computed over whichever accepted rows of one SMC packet qualify; `least` is how many it needs to mean anything. */
interface AcceptedSpec { name:string; label:string; group:string; kind:'temperature'|'fan'; unit:string; reduce:'mean'|'max'; least:number; takes:(row:NativeRow)=>boolean; }
const isCore=(row:NativeRow):boolean=>row.kind==='temperature'&&row.unit==='°C'&&row.group==='CPU'&&CORE_LABEL.test(row.label);
const isFanSpeed=(row:NativeRow):boolean=>row.kind==='fan'&&FAN_SPEED_KEY.test(row.key);
const isMacTemperature=(row:NativeRow):boolean=>row.kind==='temperature'&&row.unit==='°C'&&row.value>=WHOLE_MAC_TEMPERATURE_C[0]&&row.value<=WHOLE_MAC_TEMPERATURE_C[1];
/** On a Mac whose model has no fixed input list, the rows a chip family table gives are not known ahead, so these cover what answered. */
const FAMILY_COMPUTED:readonly AcceptedSpec[]=[
	{name:'cpu-average',label:'CPU average',group:'CPU',kind:'temperature',unit:'°C',reduce:'mean',least:1,takes:isCore},
	{name:'cpu-hottest',label:'Hottest core',group:'CPU',kind:'temperature',unit:'°C',reduce:'max',least:1,takes:isCore}
];
/** Fan average needs two fans to say anything a Fan reading does not. Fan target, minimum and maximum are never inputs. */
const FAN_COMPUTED:readonly AcceptedSpec[]=[{name:'fan-average',label:'Fan average',group:'Fans',kind:'fan',unit:'RPM',reduce:'mean',least:2,takes:isFanSpeed}];
/** Every Mac. TG Pro's Computer Average rounds to the mean of its 38 SMC temperatures in 95.5 % of 1,563 log rows on Mac17,9, and its other whole-Mac reading is the highest sensor. */
const WHOLE_MAC_COMPUTED:readonly AcceptedSpec[]=[
	{name:'computer-average',label:'Mac average',group:'System',kind:'temperature',unit:'°C',reduce:'mean',least:2,takes:isMacTemperature},
	{name:'hottest-sensor',label:'Hottest sensor',group:'System',kind:'temperature',unit:'°C',reduce:'max',least:2,takes:isMacTemperature}
];
type Reduced=Pick<ComputedSpec,'name'|'label'|'group'|'kind'|'unit'|'reduce'>;
function reduced(spec:Reduced,present:readonly NativeRow[]):NativeRow {
	const oldest=present.reduce((a,b)=>b.continuousMs<a.continuousMs?b:a);
	const value=spec.reduce==='max'?Math.max(...present.map(row=>row.value)):present.reduce((sum,row)=>sum+row.value,0)/present.length;
	return {key:spec.name,label:spec.label,group:spec.group,kind:spec.kind,unit:spec.unit,value,valid:Number.isFinite(value),continuousMs:oldest.continuousMs,wallSeconds:oldest.wallSeconds,error:0,systemCode:0};
}
function overAccepted(specs:readonly AcceptedSpec[],inputs:readonly NativeRow[]):NativeRow[] {
	const rows:NativeRow[]=[];
	for(const spec of specs){const present=inputs.filter(spec.takes);if(present.length>=spec.least)rows.push(reduced(spec,present));}
	return rows;
}
/**
 * Computed rows from the rows accepted out of one SMC packet, keyed by their SMC key. They are never computed from a
 * stale or failed value, and each is as old as its oldest input, so it expires no later than that input.
 *
 * On a model with a fixed input list a reading is produced only when every input was accepted from that packet.
 * On any other Mac that reads a chip family table (familyTable true) the table lists a fixed set of core rows, which
 * of them a chip has is not known ahead, and a core can fail a read on its own, so CPU average and CPU hottest core
 * cover the per-core temperatures accepted from that packet, and are left out when none was. Fan average and the
 * whole-Mac readings likewise cover what was accepted on any Mac without a fixed list.
 */
export function computedRows(model:string,chip:string,inputs:ReadonlyMap<string,NativeRow>,familyTable=false):NativeRow[] {
	const accepted=[...inputs.values()],table=COMPUTED_TABLES.find(item=>item.model===model&&item.chip===chip);
	if(!table)return overAccepted([...(familyTable?FAMILY_COMPUTED:[]),...FAN_COMPUTED,...WHOLE_MAC_COMPUTED],accepted);
	const rows:NativeRow[]=[];
	for(const spec of table.readings) {
		const values=spec.inputs.map(key=>inputs.get(key));
		if(values.some(row=>row===undefined||row.kind!==spec.kind||row.unit!==spec.unit))continue;
		rows.push(reduced(spec,values as NativeRow[]));
	}
	return rows;
}
/** The SMC firmware status for a key this Mac's SMC does not have; such a key answers it to every key information request. */
const SMC_KEY_NOT_FOUND=0x84;
/** HWMAC_FIRMWARE in native/hwmac/addon.c: the SMC answered with a firmware status. */
const NATIVE_FIRMWARE_ERROR=5;
/** Where this Mac's SMC rows come from: its own measured model table, a chip family table not measured on this model, or the common keys only. */
export type SmcTableEvidence='measured'|'source'|'none';
/** Catalog keys of one SMC read by outcome, space separated: accepted, not on this Mac's SMC, and present but failed or out of range. Key names only, never values. */
export interface SmcKeyFacts { answered:string; absent:string; withheld:string; }
/** Minimum, maximum and running mean of one reading's accepted values since its row last appeared: every gap deletes the row, so it starts over. */
interface Session { min: number; max: number; mean: number; count: number; }
/**
 * source is the packet that produced the row, so a failed or expired read of it removes computed readings too. order is the row's place
 * in that packet, which is catalog order for SMC rows (the native reader walks native/hwmac/catalog.json in order), or in the computed list.
 */
interface Accepted { row: NativeRow; reading: Reading; source: NativeSource; session: Session; computed: boolean; order: number; }
/** Inside a group the list reads system counters, then computed readings, then the SMC in catalog order, then battery and drive health. */
const SOURCE_ORDER={public:0,computed:1,smc:2,health:3} as const;
const listOrder=(item:Accepted):number=>SOURCE_ORDER[item.computed?'computed':item.source];
export interface ProviderFacts { model:string;chip:string;cpu:string;smcTable:string;smcTableEvidence:SmcTableEvidence;smcKeys:SmcKeyFacts;appleSilicon:boolean|null;translation:'native'|'translated'|'unknown';translationError:number;sourceRows:Record<NativeSource,number>;computedRows:number; sourceErrors:Partial<Record<NativeSource,{code:string;operation:string;systemCode:number}>>; }
export function encodeModel(model:string): string | null {
	if(!model||model.length>128||[...model].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)||Buffer.from(model,'utf8').toString('utf8')!==model)return null;
	return [...Buffer.from(model,'utf8')].map(byte=>/[A-Za-z0-9._~-]/.test(String.fromCharCode(byte))?String.fromCharCode(byte):'%'+byte.toString(16).toUpperCase().padStart(2,'0')).join('');
}
/** encodeModel's answer for the last model seen: every SMC row of a packet, and every packet on one Mac, carries the same model, and encoding it per row was about half of the provider's per-read CPU and allocation (2026-10-17 review bench). */
let lastModel:{model:string;encoded:string|null}|null=null;
export function measurementKey(source:NativeSource,row:NativeRow,model:string):string|null {
	if(source==='public')return SYSTEM_KEYS.has(row.key)?`mac:v1:system:${row.key}`:null;
	if(source==='health'){const kind=KIND[row.kind];return HEALTH_KEYS.has(row.key)&&kind?`mac:v1:health:${row.key}:${kind.meaning}`:null;}
	if(lastModel===null||lastModel.model!==model)lastModel={model,encoded:encodeModel(model)};
	const encoded=lastModel.encoded,kind=KIND[row.kind];
	if(encoded===null||!/^[\x20-\x7e]{4}$/.test(row.key)||!kind)return null;
	return `mac:v1:smc:${encoded}:${Buffer.from(row.key,'ascii').toString('hex')}:${kind.meaning}`;
}
/** Computed readings depend on the model's input table, so their key carries the model like an SMC key does. */
export function computedKey(row:NativeRow,model:string):string|null {
	const encoded=encodeModel(model),kind=KIND[row.kind];
	return encoded!==null&&kind&&/^[a-z0-9-]{1,32}$/.test(row.key)?`mac:v1:computed:${encoded}:${row.key}:${kind.meaning}`:null;
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
		[packet.networkValid,previous.networkValid,packet.networkMembers,previous.networkMembers,[['network-receive','Network in','Network',packet.networkIn,previous.networkIn],['network-send','Network out','Network',packet.networkOut,previous.networkOut]]],
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
	/** When the last health read was requested; the next read asks health again only HEALTH_MIN_SPACING_MS later. */
	private healthRequestedAt:number|null=null;
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
	private factsValue:ProviderFacts={model:'unknown',chip:'unknown',cpu:'unknown',smcTable:'',smcTableEvidence:'none',smcKeys:{answered:'',absent:'',withheld:''},appleSilicon:null,translation:'unknown',translationError:0,sourceRows:{public:0,smc:0,health:0},computedRows:0,sourceErrors:{}};
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
		if(packet.source!==source||packet.error!==0||!Number.isFinite(now)||!Number.isFinite(packet.continuousMs)||packet.continuousMs>now||now-packet.continuousMs>=TTL_MS||packet.rows.length>128){this.removeSource(source);if(source==='public')this.previousPublic=null;if(source==='smc')this.factsValue.smcKeys={answered:'',absent:'',withheld:''};this.notice(`${source} readings unavailable; other sources continue.`);return;}
		// A read that settles after a long sleep can land before current() has expired the rows it would continue: expire them first, so a gap always starts a new session.
		for(const [key,item] of this.rows)if(now-item.row.continuousMs>=TTL_MS||now<item.row.continuousMs){this.rows.delete(key);this.dirty=true;this.catalogDirty=true;}
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
		for(let index=0;index<rows.length;index++){const key=keys[index];if(key&&counts.get(key)===1)this.admit(key,rows[index]!,source,now,false,index,accepted);}
		// Computed readings see only what this packet just had accepted, never a row kept from an earlier read.
		if(source==='smc'){
			const inputs=new Map<string,NativeRow>();for(const item of accepted.values())inputs.set(item.row.key,item.row);
			computedRows(packet.model,packet.chip,inputs,Boolean(packet.table)).forEach((row,index)=>{const key=computedKey(row,packet.model);if(key)this.admit(key,row,source,now,true,index,accepted);});
		}
		for(const [key,item] of this.rows)if(item.source===source&&!accepted.has(key)){this.rows.delete(key);this.dirty=true;this.catalogDirty=true;}
		for(const [key,item] of accepted)this.rows.set(key,item);
		let direct=0;for(const item of accepted.values())if(!item.computed)direct++;
		const evidence:SmcTableEvidence=packet.tableMeasured===true?'measured':packet.table?'source':'none';
		let smcKeys=this.factsValue.smcKeys;
		if(source==='smc') {
			const answered:string[]=[],absent:string[]=[],withheld:string[]=[];
			for(let index=0;index<packet.rows.length;index++) {
				const row=packet.rows[index]!,key=keys[index];
				if(key&&accepted.has(key))answered.push(row.key);
				else if(row.error===NATIVE_FIRMWARE_ERROR&&row.firmwareCode===SMC_KEY_NOT_FOUND&&row.operation==='smc.keyInfo')absent.push(row.key);
				else withheld.push(row.key);
			}
			smcKeys={answered:answered.join(' '),absent:absent.join(' '),withheld:withheld.join(' ')};
		}
		this.factsValue={model:packet.model||'unknown',chip:packet.chip||'unknown',cpu:packet.cpu||'unknown',smcTable:packet.table||'',smcTableEvidence:evidence,smcKeys,appleSilicon:packet.appleSilicon<0?null:packet.appleSilicon===1,translation:translationOf(packet.translated,packet.translationError),translationError:packet.translationError,sourceErrors:this.factsValue.sourceErrors,sourceRows:{...this.factsValue.sourceRows,[source]:direct},computedRows:this.factsValue.computedRows};
		if(packet.translated===1)this.notice('Node is running under translation; sensor interfaces follow the detected hardware.');
		if(source==='smc'&&evidence==='source')this.notice(`This Mac reads the ${packet.table} chip family sensor table, which has not been measured on this model.`);
		if(source==='smc'&&evidence==='none')this.notice('This model uses common typed sensors; its generation-specific catalog is not qualified.');
		this.rebuild();
	}
	/** Accepts one keyed row of the current packet into `accepted` when it is valid, in range and inside the TTL; anything else is withheld. */
	private admit(key:string,row:NativeRow,source:NativeSource,now:number,computed:boolean,order:number,accepted:Map<string,Accepted>):void {
		const kind=KIND[row.kind];
		if(!kind||!row.valid||!Number.isFinite(row.value)||row.value<kind.minimum||row.value>kind.maximum||!Number.isFinite(row.continuousMs)||row.continuousMs<0||row.continuousMs>now||now-row.continuousMs>=TTL_MS||!Number.isFinite(row.wallSeconds))return;
		const previous=this.rows.get(key);
		// macOS reports current values only, so the session statistics are this provider's own: a unit or kind change starts them over.
		const prior=previous&&previous.reading.unit===row.unit&&previous.reading.type===kind.type?previous.session:null;
		const count=(prior?.count??0)+1,session:Session={min:Math.min(prior?.min??row.value,row.value),max:Math.max(prior?.max??row.value,row.value),mean:prior?prior.mean+(row.value-prior.mean)/count:row.value,count};
		const reading:Reading={key,type:kind.type,sensorIndex:0,id:0,label:row.label,unit:row.unit,value:row.value,valueMin:session.min,valueMax:session.max,valueAvg:session.mean,statistics:'producer',observationTime:row.continuousMs,observationRevision:++this.observation};
		if(previous&&previous.reading.value!==reading.value)this.freshnessRevision++;
		const changedCatalog=!previous||previous.reading.unit!==reading.unit||previous.reading.type!==reading.type||previous.reading.label!==reading.label||previous.row.group!==row.group||previous.order!==order;
		if(changedCatalog)this.catalogDirty=true;
		// A repeated value cannot move the minimum or maximum, but it can move the mean, which an AVG face shows.
		if(changedCatalog||previous?.reading.value!==reading.value||previous.reading.valueAvg!==reading.valueAvg)this.dirty=true;
		accepted.set(key,{row,reading,source,session,computed,order});
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
			const promise=this.session.read(source);this.pending.add(source);if(source==='public')this.publicRequestedAt=this.native.now();if(source==='health')this.healthRequestedAt=this.native.now();
			void promise.then(packet=>{if(!this.closed)this.accept(source,packet);}).catch(()=>{if(!this.closed){this.completed.add(source);this.removeSource(source);if(source==='public')this.previousPublic=null;this.notice(`${source} read failed; retrying.`);}}).finally(()=>{this.pending.delete(source);if(!this.closed)this.ready();}).catch(()=>{if(!this.closed)this.notice('A sensor update could not be delivered.');});
		} catch(error) {
			if((error as {code?:string}).code==='HWMAC_BUSY') {
				const retry=setTimeout(()=>{this.retries.delete(source);this.request(source);},250).unref();this.retries.set(source,retry);
			} else {this.completed.add(source);this.removeSource(source);this.notice(`${source} could not start; retrying.`);}
		}
	}
	read():SensorSnapshot|null {
		if(this.closed)throw new MacSensorError('pending',PENDING_MESSAGE);
		// Counters are only meaningful over a real window: two public reads a few ms apart give CPU usage and rates from almost no ticks or bytes.
		// So a tick read due before the rebaseline replaces it, and a tick just after a rebaseline read that kept a baseline (a Read every change restarted the timer) keeps that sample.
		if(this.rebaseline){clearTimeout(this.rebaseline);this.rebaseline=null;}
		const sinceRebaseline=this.rebaselineStartedAt===null?Infinity:this.native.now()-this.rebaselineStartedAt;this.rebaselineStartedAt=null;
		if(!(sinceRebaseline<MIN_COUNTER_WINDOW_MS&&this.previousPublic!==null))this.request('public');
		this.request('smc');
		// A missing or non-finite clock asks health every read rather than never.
		if(!(this.native.now()-(this.healthRequestedAt??-Infinity)<HEALTH_MIN_SPACING_MS))this.request('health');
		return this.current();
	}
	private rebuild():void {
		if(this.catalogDirty){this.catalogRevision++;this.catalogDirty=false;}
		this.factsValue.sourceRows={public:0,smc:0,health:0};this.factsValue.computedRows=0;for(const item of this.rows.values())if(item.computed)this.factsValue.computedRows++;else this.factsValue.sourceRows[item.source]++;
		this.report(this.facts());
		if(this.dirty){this.valueRevision++;this.dirty=false;}
		const groupOf=(item:Accepted):string=>Object.hasOwn(GROUPS,item.row.group)?item.row.group:'System';
		const groups=[...new Set([...this.rows.values()].map(groupOf))].sort((a,b)=>GROUPS[a]!-GROUPS[b]!);
		const sensors:SensorSource[]=groups.map((name,index)=>({index,id:GROUPS[name]!,instance:0,name}));
		// Group, then source, then the row's own order, so numbered rows read 1, 2, 3; the identity only breaks a tie it never has.
		const ordered=[...this.rows.values()].map(item=>({item,sensorIndex:groups.indexOf(groupOf(item))})).sort((a,b)=>a.sensorIndex-b.sensorIndex||listOrder(a.item)-listOrder(b.item)||a.item.order-b.item.order||a.item.reading.key.localeCompare(b.item.reading.key));
		const readings:Reading[]=ordered.map(({item,sensorIndex})=>({...item.reading,sensorIndex}));
		let latest:Accepted|undefined;for(const item of this.rows.values())if(!latest||item.row.continuousMs>latest.row.continuousMs)latest=item;
		this.snapshot={catalogRevision:this.catalogRevision,pollTime:latest?.row.wallSeconds??0,valueRevision:this.valueRevision,freshnessRevision:this.freshnessRevision,version:1,revision:1,sensors,readings,byKey:new Map(readings.map(reading=>[reading.key,reading]))};
	}
	current():SensorSnapshot|null {
		if(this.closed)throw new MacSensorError('pending',PENDING_MESSAGE);
		const now=this.native.now();
		if(!Number.isFinite(now)){this.rows.clear();this.dirty=true;this.catalogDirty=true;this.rebuild();throw new MacSensorError('source-error','The measurement clock is unavailable.');}
		for(const [key,item] of this.rows)if(now-item.row.continuousMs>=TTL_MS||now<item.row.continuousMs){this.rows.delete(key);this.dirty=true;this.catalogDirty=true;}
		if(this.dirty)this.rebuild();
		if(this.fontKnown&&!this.fontAvailable)throw new MacSensorError('font-missing','Install Tahoma Bold in Font Book, then choose Check again.');
		if(!this.fontKnown&&this.completed.size<NATIVE_SOURCES.length){if(now-this.startedAt>=TTL_MS)throw new MacSensorError('busy','The sensor source is still busy. Choose Check again.');return null;}
		if(!this.fontKnown)throw new MacSensorError('source-error','The font prerequisite could not be checked. Choose Check again.');
		if(this.rows.size===0&&this.completed.size===NATIVE_SOURCES.length)throw new MacSensorError('no-readable-sensors','No recent readable sensors were found. Choose Copy support report.');
		return this.rows.size?this.snapshot:null;
	}
	/** Ms until the next row expires. No deadline while the clock is not finite: current() has already cleared the rows, and the interval tick rechecks, so a NaN clock cannot drive a 1 ms expiry loop. */
	untilExpiry():number|null {if(this.closed)return null;const now=this.native.now();if(!Number.isFinite(now))return null;if(!this.rows.size)return !this.fontKnown&&this.completed.size<NATIVE_SOURCES.length&&now-this.startedAt<TTL_MS?this.startedAt+TTL_MS-now:null;return Math.max(0,Math.min(...[...this.rows.values()].map(item=>item.row.continuousMs+TTL_MS-now)));}
	age():number|null {if(this.closed||!this.rows.size)return null;const now=this.native.now();return Number.isFinite(now)?Math.max(...[...this.rows.values()].map(item=>now-item.row.continuousMs)):null;}
	close():void {if(this.closed)return;this.closed=true;for(const retry of this.retries.values())clearTimeout(retry);this.retries.clear();if(this.rebaseline)clearTimeout(this.rebaseline);this.rebaseline=null;this.rows.clear();this.snapshot=null;this.previousPublic=null;this.factsValue.sourceRows={public:0,smc:0,health:0};this.factsValue.computedRows=0;this.report(this.facts());this.session.close();}
}
