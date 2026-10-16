import { registerDiagnostics } from '../diagnostics';
import { runtimeFacts } from './runtime';
import { getBridge } from './bridge';
import { MacProvider, type ProviderFacts } from './provider';
import type { SensorSnapshot } from '../hwinfo/types';
export interface MacSnapshotProvider {
	read():SensorSnapshot|null;current():SensorSnapshot|null;untilExpiry():number|null;age():number|null;close():void;notices?():string[];
	/** Reads still out; optional so a provider without it publishes on every completion. */
	inFlight?():number;
}
let facts:ProviderFacts|null=null;
/** The copied entry uses this binding name; its Mac target never loads the Windows reader. */
export function initHwsm():void {
	try {getBridge();}catch{/* The action status reports a typed load failure. */}
	registerDiagnostics('mac',()=>({...runtimeFacts(),...(facts??{catalog:'not sampled'})}));
}
export function openMacProvider(ready:()=>void):MacSnapshotProvider {return new MacProvider(getBridge(),ready,value=>{facts=value;});}
