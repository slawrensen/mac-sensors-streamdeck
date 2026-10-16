// One automatic publication per read: the public and SMC halves of a read
// settle at different times, and consumers must see them together, without
// a slow SMC holding public readings past a bounded window and without any
// change to how observations become samples.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { MacPoller, type PollerStatus } from '../../src/mac/poller';
import { MacProvider } from '../../src/mac/provider';
import type { NativeBridge, NativePacket, NativeRow, NativeSource } from '../../src/mac/native-api';
import { tickSignature } from '../../src/detail/tick-signature';
import { SessionStatsStore } from '../../src/stats';

const realImmediate = setImmediate;
const flush = (): Promise<void> => new Promise((resolve) => realImmediate(resolve));
/** Steps mock time one millisecond at a time so every promise settles at its own instant. */
async function advance(ms: number): Promise<void> { for (let i = 0; i < ms; i++) { mock.timers.tick(1); await flush(); } }
const SMC = 'mac:v1:smc:Mac17%2C9:54423154:temp.v1';
const MEM = 'mac:v1:system:memory-free';
const CPU = 'mac:v1:system:cpu-total';
/** Mock clock origin; every recorded time is relative to it. */
const START_MS = 1_000_000;
/** The default Read every. */
const INTERVAL_MS = 1000;
/** host_processor_info counts CPU ticks at 100 Hz (kern.clockrate hz = 100), so a window of a few ms can hold no tick at all. */
const CPU_TICK_MS = 10;
/** Mirrors COUNTER_REBASELINE_MS in src/mac/provider.ts: the shortest counter window a public read may follow its predecessor by. */
const COUNTER_REBASELINE_MS = 250;
/** Mirrors MIN_COUNTER_WINDOW_MS in src/mac/provider.ts: a tick reads public unless a kept rebaseline sample started less than this long ago. */
const MIN_COUNTER_WINDOW_MS = 200;

type Emit = { at: number; signature: string; smc: boolean; mem: boolean; cpu: boolean; status: PollerStatus };
interface Rig { poller: MacPoller; emits: Emit[]; reads: Record<NativeSource, number[]> }
/** Read duration in ms: fixed, or by the 1-based count of that source's reads (the first read of a session is the slow cold one). */
type Delay = number | ((n: number) => number);
/** Real MacPoller and MacProvider over a fake bridge whose reads settle after a delay per source. */
function rig(delay: Record<NativeSource, Delay>, options: { smcError?: boolean; publicError?: (n: number) => boolean; cpu?: boolean; intervalMs?: number } = {}): Rig {
	const reads: Record<NativeSource, number[]> = { public: [], smc: [] };
	const row = (key: string, kind: string, unit: string, value: number, at: number): NativeRow => ({ key, label: key, group: kind === 'temperature' ? 'Battery' : 'Memory', kind, unit, value, valid: true, continuousMs: at, wallSeconds: 1.7e9 + at / 1000, error: 0, systemCode: 0 });
	const packet = (source: NativeSource, n: number, at: number): NativePacket => ({
		source, continuousMs: at, awakeMs: at, wallSeconds: 1.7e9 + at / 1000, durationMs: 1, error: (source === 'smc' && options.smcError) || (source === 'public' && options.publicError?.(n)) ? 12 : 0, systemCode: 0, operation: 'fixture',
		rows: source === 'public' ? [row('memory-free', 'other', 'B', 1e9 + n * 4096, at)] : options.smcError ? [] : [row('TB1T', 'temperature', '°C', 40 + (n % 9), at)],
		model: 'Mac17,9', chip: 't6050', appleSilicon: 1, translated: 0, translationError: 0, fontAvailable: true, cpuValid: options.cpu === true, cpuTicks: [[Math.floor(at / CPU_TICK_MS) * 3, 0, Math.floor(at / CPU_TICK_MS) * 7, 0]],
		networkValid: false, networkIn: '0', networkOut: '0', networkMembers: '1', storageValid: false, storageRead: '0', storageWrite: '0', storageMembers: '1'
	});
	const bridge: NativeBridge = {
		getBuildInfo: () => ({ protocol: 1, napi: 8, version: 'test', sourceId: 'test', arch: process.arch, platform: 'darwin', testHooks: true }),
		now: () => Date.now(),
		open: () => ({ read: (source) => { const at = Date.now(); const n = reads[source].push(at - START_MS); return new Promise((resolve) => { const ms = delay[source]; setTimeout(() => resolve(packet(source, n, at)), typeof ms === 'number' ? ms : ms(n)); }); }, close: () => {} })
	};
	const poller = new MacPoller((ready) => new MacProvider(bridge, ready));
	poller.setIntervalMs(options.intervalMs ?? INTERVAL_MS);
	const emits: Emit[] = [];
	poller.onTick((status: PollerStatus) => emits.push({ at: Date.now() - START_MS, signature: tickSignature(status), smc: status.state === 'ok' && status.snapshot.byKey.has(SMC), mem: status.state === 'ok' && status.snapshot.byKey.has(MEM), cpu: status.state === 'ok' && status.snapshot.byKey.has(CPU), status }));
	return { poller, emits, reads };
}
/** Offsets, within each read interval, of emits that carry a new data state. */
function changes(emits: Emit[]): number[][] {
	const byInterval: number[][] = [];
	let last = '';
	for (const emit of emits) {
		if (emit.signature !== last) (byInterval[Math.floor(emit.at / INTERVAL_MS)] ??= []).push(emit.at % INTERVAL_MS);
		last = emit.signature;
	}
	return byInterval;
}
/** Offsets, within each read interval, of every emit, including ones that repeat the last data state. */
function offsets(emits: Emit[]): number[][] {
	const byInterval: number[][] = [];
	for (const emit of emits) (byInterval[Math.floor(emit.at / INTERVAL_MS)] ??= []).push(emit.at % INTERVAL_MS);
	return byInterval;
}

beforeEach(() => mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: START_MS }));
afterEach(() => mock.timers.reset());

test('a read whose sources settle 35 ms apart publishes its new readings once', async () => {
	const { poller, emits } = rig({ public: 5, smc: 40 });
	poller.retain();
	await advance(5 * INTERVAL_MS);
	poller.release();
	for (let k = 1; k < 5; k++) assert.deepEqual(changes(emits)[k], [40], `interval ${k}`);
	for (let k = 1; k < 5; k++) assert.deepEqual(offsets(emits)[k], [0, 40], `interval ${k}: the timer tick, then one settled publication and no repeat at the window deadline`);
});

test('the first publication carries every source that settles inside the window', async () => {
	const { poller, emits } = rig({ public: 5, smc: 40 });
	poller.retain();
	await advance(200);
	poller.release();
	const first = emits.find((emit) => emit.mem || emit.smc);
	assert.ok(first);
	assert.equal(first.smc, true, 'an SMC key must not be published as missing while its read is still inside the window');
});

test('a slow SMC read never holds public readings past the settle window', async () => {
	const { poller, emits } = rig({ public: 5, smc: 1500 });
	poller.retain();
	await advance(6 * INTERVAL_MS);
	poller.release();
	for (let k = 1; k < 6; k++) assert.ok((changes(emits)[k] ?? []).some((offset) => offset <= 105), `interval ${k}: ${JSON.stringify(changes(emits)[k])}`);
});

test('a failed SMC read publishes the public readings once, when it settles', async () => {
	const { poller, emits } = rig({ public: 5, smc: 40 }, { smcError: true });
	poller.retain();
	await advance(4 * INTERVAL_MS);
	poller.release();
	for (let k = 1; k < 4; k++) assert.deepEqual(changes(emits)[k], [40], `interval ${k}`);
});

test('coalescing changes no measurement: own acquisition times, one sample and one dial observation per read', async () => {
	const { poller, emits, reads } = rig({ public: 5, smc: 40 });
	poller.subscribeSeries(MEM); poller.subscribeSeries(SMC);
	poller.retain();
	await advance(10 * INTERVAL_MS + 100);
	const starts = Array.from({ length: 11 }, (_, k) => k * INTERVAL_MS);
	// The provider's one counter rebaseline read (250 ms after the first public packet) is a genuine extra public observation.
	const publicStarts = [0, 255, ...starts.slice(1)];
	assert.deepEqual(reads, { public: publicStarts, smc: starts });
	assert.equal(poller.getSeries(MEM)?.length, publicStarts.length);
	assert.equal(poller.getSeries(SMC)?.length, starts.length);
	const stats = new SessionStatsStore();
	const seen = new Map<string, Map<number, number>>([[MEM, new Map()], [SMC, new Map()]]);
	for (const { status } of emits) {
		if (status.state !== 'ok') continue;
		for (const key of [MEM, SMC]) {
			const reading = status.snapshot.byKey.get(key);
			if (!reading) continue;
			stats.observe(reading, status.snapshot, 'mac');
			const times = seen.get(key)!, previous = times.get(reading.observationRevision!), acquired = reading.observationTime! - START_MS;
			assert.ok(previous === undefined || previous === acquired, `${key}: one observation, one acquisition time`);
			times.set(reading.observationRevision!, acquired);
		}
	}
	for (const [key, expected] of [[MEM, publicStarts], [SMC, starts]] as const) {
		assert.deepEqual([...seen.get(key)!.values()], expected, `${key}: each observation keeps its own read start; the other source never restamps it`);
		assert.equal(stats.get(key)?.count, expected.length, `${key}: one dial observation per read`);
	}
	poller.release();
});

test('the last release cancels a pending settle window and stops acquisition', async () => {
	const { poller, emits, reads } = rig({ public: 5, smc: 40 });
	poller.retain();
	await advance(6);
	poller.release();
	const count = emits.length;
	await advance(3 * INTERVAL_MS);
	assert.equal(emits.length, count);
	assert.deepEqual(reads, { public: [0], smc: [0] });
});

test('counter readings appear about 250 ms after a key appears or returns, with no extra reads afterwards', async () => {
	const SLOW_INTERVAL_MS = 5000;
	const { poller, emits, reads } = rig({ public: 5, smc: 40 }, { cpu: true, intervalMs: SLOW_INTERVAL_MS });
	const firstCpu = (from: number): number | undefined => emits.find((emit) => emit.at >= from && emit.cpu)?.at;
	poller.retain();
	await advance(3 * SLOW_INTERVAL_MS + 2500);
	assert.ok((firstCpu(0) ?? Infinity) <= 260, `first appearance: CPU usage at ${firstCpu(0)} ms`);
	poller.release();
	await advance(SLOW_INTERVAL_MS);
	const back = Date.now() - START_MS;
	poller.retain();
	await advance(SLOW_INTERVAL_MS - 1);
	assert.ok((firstCpu(back) ?? Infinity) - back <= 260, `return: CPU usage ${(firstCpu(back) ?? Infinity) - back} ms after the key returned`);
	poller.release();
	assert.deepEqual(reads.public, [0, 255, 5000, 10000, 15000, back, back + 255], 'one extra public read per provider generation, none while hidden');
	assert.deepEqual(reads.smc, [0, 5000, 10000, 15000, back]);
});

/** Every rebaseline-integrity property at once: spacing of public reads, every completed public read published, CPU usage never withdrawn once shown. */
function assertCounterWindows(rig: Rig, label: string): void {
	const { emits, reads } = rig;
	for (let i = 1; i < reads.public.length; i++) assert.ok(reads.public[i]! - reads.public[i - 1]! >= COUNTER_REBASELINE_MS, `${label}: public reads ${JSON.stringify(reads.public)} start less than ${COUNTER_REBASELINE_MS} ms apart`);
	const published = new Set<number>();
	for (const { status } of emits) { const reading = status.state === 'ok' ? status.snapshot.byKey.get(MEM) : undefined; if (reading) published.add(reading.observationTime! - START_MS); }
	assert.deepEqual(reads.public.filter((at) => !published.has(at)), [], `${label}: a completed public read was never published`);
	const first = emits.findIndex((emit) => emit.cpu);
	assert.ok(first >= 0, `${label}: CPU usage never appeared`);
	const withdrawn = emits.slice(first).find((emit) => !emit.cpu);
	assert.equal(withdrawn, undefined, `${label}: CPU usage shown at ${emits[first]!.at} ms was withdrawn at ${withdrawn?.at} ms`);
}

test('at Read every 250 ms a due tick replaces the counter rebaseline read', async () => {
	// Bench timing: the first public read of a session is the slow cold one (4.58 ms), later ones take under 1 ms, SMC about 11 ms.
	const it = rig({ public: (n) => (n === 1 ? 5 : 1), smc: 11 }, { cpu: true, intervalMs: COUNTER_REBASELINE_MS });
	it.poller.retain();
	await advance(4 * COUNTER_REBASELINE_MS + 20);
	it.poller.release();
	assert.deepEqual(it.reads.public, [0, 250, 500, 750, 1000], 'no extra public read next to a tick');
	assertCounterWindows(it, '250 ms');
	assert.ok((it.emits.find((emit) => emit.cpu)?.at ?? Infinity) <= 262, 'CPU usage still appears with the 250 ms tick read');
});

test('at Read every 500 ms the regular tick after the rebaseline read still reads public', async () => {
	// Rebaseline at about 255 ms, regular tick at 500 ms: about 245 ms later, a real counter window, so the tick keeps its read.
	const HALF_SECOND_MS = 500;
	const it = rig({ public: (n) => (n === 1 ? 5 : 1), smc: 11 }, { cpu: true, intervalMs: HALF_SECOND_MS });
	it.poller.retain();
	await advance(4 * HALF_SECOND_MS + 20);
	it.poller.release();
	assert.deepEqual(it.reads.public, [0, 255, 500, 1000, 1500, 2000], 'one rebaseline read, and every 500 ms tick reads public');
	assert.deepEqual(it.reads.smc, [0, 500, 1000, 1500, 2000]);
	for (let i = 1; i < it.reads.public.length; i++) assert.ok(it.reads.public[i]! - it.reads.public[i - 1]! >= MIN_COUNTER_WINDOW_MS, `public reads ${JSON.stringify(it.reads.public)} start less than ${MIN_COUNTER_WINDOW_MS} ms apart`);
});

test('a Read every change to 250 ms just after a key appears never leaves two public reads moments apart', async () => {
	// The startup global settings reply can land after the first read: the rebaseline then fires before the restarted timer's first tick.
	const it = rig({ public: (n) => (n === 1 ? 5 : 1), smc: 11 }, { cpu: true });
	it.poller.retain();
	await advance(20);
	it.poller.setIntervalMs(COUNTER_REBASELINE_MS);
	await advance(4 * COUNTER_REBASELINE_MS + 15);
	it.poller.release();
	assert.deepEqual(it.reads.public, [0, 255, 520, 770, 1020], 'the rebaseline read stands in for the public half of the tick 15 ms after it');
	assert.deepEqual(it.reads.smc, [0, 270, 520, 770, 1020], 'SMC keeps its tick cadence');
	assertCounterWindows(it, 'interval change');
});

test('a release inside the settle window leaves no stale publication for the next retain', async () => {
	const { poller, emits } = rig({ public: 5, smc: 40 });
	poller.retain();
	await advance(6);
	poller.release();
	await advance(84);
	poller.retain();
	await advance(100);
	poller.release();
	assert.deepEqual(emits.filter((emit) => emit.at > 90 && emit.at < 130).map((emit) => emit.at), [], 'the released window (deadline 105 ms) must not publish the new read early');
	assert.equal(emits.find((emit) => emit.at > 90 && emit.mem)?.smc, true, 'the new read publishes once, with SMC');
});

test('a public failure after the first packet never earns a generation a second rebaseline read', async () => {
	const { poller, reads } = rig({ public: 5, smc: 40 }, { intervalMs: 5000, publicError: (n) => n === 2 });
	poller.retain();
	await advance(2 * 5000 + 100);
	poller.release();
	assert.deepEqual(reads.public, [0, 255, 5000, 10000], 'the failed rebaseline read resets the baseline, but the recovery at 5000 ms is not followed by another extra read');
});

test('a tick just after a failed rebaseline read still reads public', async () => {
	const { poller, reads } = rig({ public: (n) => (n === 1 ? 5 : 1), smc: 11 }, { publicError: (n) => n === 2 });
	poller.retain();
	await advance(20);
	poller.setIntervalMs(COUNTER_REBASELINE_MS);
	await advance(4 * COUNTER_REBASELINE_MS + 15);
	poller.release();
	assert.deepEqual(reads.public, [0, 255, 270, 520, 770, 1020], 'with no baseline kept there is no sample to stand in for the tick at 270 ms');
});
