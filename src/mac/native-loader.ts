import streamDeck from '@elgato/streamdeck';
import { registerDiagnostics } from '../diagnostics';
import { runtimeFacts } from './runtime';
import { getBridge } from './bridge';
import { MacProvider, type ProviderFacts } from './provider';
import type { SensorSnapshot } from '../hwinfo/types';
export interface MacSnapshotProvider {
	read():SensorSnapshot|null;current():SensorSnapshot|null;untilExpiry():number|null;age():number|null;close():void;notices?():string[];
	/** Reads still out; optional so a provider without it publishes on every completion. */
	inFlight?():number;
	/** Monotonic ms; optional so a provider without it keeps the settle timer on every read. */
	now?():number;
}
let facts:ProviderFacts|null=null;
/** The copied entry uses this binding name; its Mac target never loads the Windows reader. */
export function initHwsm():void {
	// The action status reports a typed load failure; the log keeps which check failed, a fixed sentence with no path.
	try {getBridge();}catch(error){streamDeck.logger.createScope('MacSensors').error(`Native reader unavailable: ${(error as Error).message}`);}
	registerDiagnostics('mac',()=>({...runtimeFacts(),...(facts??{catalog:'not sampled'})}));
}
export function openMacProvider(ready:()=>void):MacSnapshotProvider {return new MacProvider(getBridge(),ready,value=>{facts=value;});}
