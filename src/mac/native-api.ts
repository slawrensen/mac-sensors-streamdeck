/** Internal read-only addon contract. No native resource identifier crosses it. */
export type NativeSource = 'public' | 'smc' | 'health';
/** Every source a read asks, in request order. */
export const NATIVE_SOURCES: readonly NativeSource[] = ['public', 'smc', 'health'];
export interface NativeRow {
	key: string; label: string; group: string; kind: string; unit: string;
	value: number; valid: boolean; continuousMs: number; wallSeconds: number;
	error: number; systemCode: number; code?: string; operation?: string; firmwareCode?: number;
}
export interface NativePacket {
	source: NativeSource; rows: NativeRow[];
	/** Conservative start of this acquisition batch, not callback completion. */
	continuousMs: number; awakeMs: number; wallSeconds: number; durationMs: number;
	error: number; systemCode: number; operation: string;
	model: string; chip: string; appleSilicon: number; translated: number; translationError: number;
	/** CPU brand string, the chip family table this Mac reads (empty when none), and whether this model and chip were measured. */
	cpu: string; table: string; tableMeasured: boolean;
	fontAvailable: boolean;
	cpuValid: boolean; cpuTicks: number[][];
	networkValid: boolean; networkIn: string; networkOut: string; networkMembers: string;
	storageValid: boolean; storageRead: string; storageWrite: string; storageMembers: string;
}
export interface NativeSession { read(source: NativeSource): Promise<NativePacket>; close(): void; }
export interface NativeBuildInfo { protocol: number; napi: number; version: string; sourceId: string; arch: string; platform: string; testHooks: boolean; }
export interface NativeBridge { getBuildInfo(): NativeBuildInfo; now(): number; open(): NativeSession; }
