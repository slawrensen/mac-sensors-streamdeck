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
/** These tests pin what a real stop does, so they stop at once instead of after the production release grace. */
const poller0 = (factory: ConstructorParameters<typeof MacPoller>[0]): MacPoller => new MacPoller(factory, 0);

const realImmediate = setImmediate;
const flush = (): Promise<void> => new Promise((resolve) => realImmediate(resolve));
/** Steps mock time one millisecond at a time so every promise settles at its own instant. */
async function advance(ms: number): Promise<void> { for (let i = 0; i < ms; i++) { mock.timers.tick(1); await flush(); } }
const SMC = 'mac:v1:smc:Mac17%2C9:54423154:temp.v1';
const MEM = 'mac:v1:system:memory-free';
const CPU = 'mac:v1:system:cpu-total';
const NET = 'mac:v1:system:network-receive';
/** Mock clock origin; every recorded time is relative to it. */
const START_MS = 1_000_000;
/** The default Read every. */
const INTERVAL_MS = 1000;
/** host_processor_info counts CPU ticks at 100 Hz (kern.clockrate hz = 100), so a window of a few ms can hold no tick at all. */
const CPU_TICK_MS = 10;
/** Mirrors COUNTER_REBASELINE_MS in src/mac/provider.ts: the rebaseline read's target start after the first request, and the read spacing these tests expect when reads are fast. */
const COUNTER_REBASELINE_MS = 250;
/** Mirrors MIN_COUNTER_WINDOW_MS in src/mac/provider.ts: the rebaseline read starts at least this long after the first read completed, and a tick reads public unless a kept rebaseline sample started less than this long ago. */
const MIN_COUNTER_WINDOW_MS = 200;
/** Mirrors SETTLE_WINDOW_MS in src/mac/poller.ts: the longest a timed read holds its settled source. No fake read in this file lasts exactly this long, so a setTimeout of this length is the settle timer. */
const SETTLE_WINDOW_MS = 100;
/** Mirrors TRUSTED_READS in src/mac/poller.ts: fast reads in a row after which a read waits without a timer. */
const TRUSTED_READS = 8;

type Emit = { at: number; signature: string; smc: boolean; mem: boolean; cpu: boolean; status: PollerStatus };
interface Rig { poller: MacPoller; emits: Emit[]; reads: Record<NativeSource, number[]> }
/** Read duration in ms: fixed, or by the 1-based count of that source's reads (the first read of a session is the slow cold one). */
type Delay = number | ((n: number) => number);
/** Mirrors HEALTH_MIN_SPACING_MS in src/mac/provider.ts: at the 1 s default the health source is asked every second read. */
const HEALTH_MIN_SPACING_MS = 1500;
/**
 * Real MacPoller and MacProvider over a fake bridge whose reads settle after a delay per source. The health source answers
 * with no rows after public's delay unless a test sets its own, so it never changes when a read's last source settles.
 */
function rig(delay: { public: Delay; smc: Delay; health?: Delay }, options: { smcError?: boolean; publicError?: (n: number) => boolean; cpu?: boolean; intervalMs?: number; clock?: false; asleepMs?: () => number; clockFails?: () => boolean; network?: (n: number) => bigint } = {}): Rig {
	const reads: Record<NativeSource, number[]> = { public: [], smc: [], health: [] };
	// asleepMs: time the Mac spent asleep so far. The native continuous clock counts it; the awake clock and Node timers do not.
	// clockFails: the native clock reads NaN, as when mach_timebase_info fails.
	const continuous = (): number => (options.clockFails?.() ? NaN : Date.now() + (options.asleepMs?.() ?? 0));
	const row = (key: string, kind: string, unit: string, value: number, at: number): NativeRow => ({ key, label: key, group: kind === 'temperature' ? 'Battery' : 'Memory', kind, unit, value, valid: true, continuousMs: at, wallSeconds: 1.7e9 + at / 1000, error: 0, systemCode: 0 });
	const packet = (source: NativeSource, n: number, at: number): NativePacket => ({
		source, continuousMs: at, awakeMs: at - (options.asleepMs?.() ?? 0), wallSeconds: 1.7e9 + at / 1000, durationMs: 1, error: (source === 'smc' && options.smcError) || (source === 'public' && options.publicError?.(n)) ? 12 : 0, code: (source === 'smc' && options.smcError) || (source === 'public' && options.publicError?.(n)) ? 'HWMAC_BOUNDS' : 'HWMAC_OK', systemCode: 0, operation: 'fixture',
		rows: source === 'public' ? [row('memory-free', 'other', 'B', 1e9 + n * 4096, at)] : source === 'health' || options.smcError ? [] : [row('TB1T', 'temperature', '°C', 40 + (n % 9), at)],
		model: 'Mac17,9', chip: 't6050', cpu: 'Apple M5 Pro', table: 'm5', tableMeasured: true, appleSilicon: 1, translated: 0, translationError: 0, fontAvailable: true, cpuValid: options.cpu === true, cpuTicks: [[Math.floor(at / CPU_TICK_MS) * 3, 0, Math.floor(at / CPU_TICK_MS) * 7, 0]],
		networkValid: options.network !== undefined, networkIn: String(options.network?.(n) ?? 0n), networkOut: String(options.network?.(n) ?? 0n), networkMembers: '1', storageValid: false, storageRead: '0', storageWrite: '0', storageMembers: '1'
	});
	const bridge: NativeBridge = {
		getBuildInfo: () => ({ protocol: 1, napi: 8, version: 'test', sourceId: 'test', arch: process.arch, platform: 'darwin', testHooks: true }),
		now: continuous,
		open: () => ({ read: (source) => { const at = continuous(); const n = reads[source].push(Date.now() - START_MS); return new Promise((resolve) => { const ms = delay[source] ?? delay.public; setTimeout(() => resolve(packet(source, n, at)), typeof ms === 'number' ? ms : ms(n)); }); }, close: () => {} })
	};
	const poller = poller0((ready) => {
		const provider = new MacProvider(bridge, ready);
		// clock false: a provider that cannot time its reads.
		return options.clock === false ? { read: () => provider.read(), current: () => provider.current(), untilExpiry: () => provider.untilExpiry(), age: () => provider.age(), close: () => provider.close(), notices: () => provider.notices(), inFlight: () => provider.inFlight() } : provider;
	});
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
const range = (from: number, to: number): number[] => Array.from({ length: to - from }, (_, i) => from + i);
/**
 * Arm times of settle timers, seen through setTimeout. Node wakes at a timer's deadline even when it was
 * cleared first (measured 2026-10-16), so arming none is what saves the wakeups. Call inside a test and
 * restore before afterEach resets the mock clock.
 */
function settleTimers(): { at: number[]; restore: () => void } {
	const at: number[] = [];
	const mocked = globalThis.setTimeout;
	const spy = mock.method(globalThis, 'setTimeout', ((callback: () => void, ms?: number) => { if (ms === SETTLE_WINDOW_MS) at.push(Date.now() - START_MS); return mocked(callback, ms); }) as typeof setTimeout);
	return { at, restore: () => spy.mock.restore() };
}
/** Read intervals in which a settle timer was armed. */
const timedReads = (at: number[]): number[] => at.map((offset) => Math.floor(offset / INTERVAL_MS));
/** When each public observation, by its acquisition time, was first published. */
function firstPublished(emits: Emit[]): Map<number, number> {
	const first = new Map<number, number>();
	for (const { at, status } of emits) {
		const reading = status.state === 'ok' ? status.snapshot.byKey.get(MEM) : undefined;
		if (reading && !first.has(reading.observationTime! - START_MS)) first.set(reading.observationTime! - START_MS, at);
	}
	return first;
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

test('after eight fast reads in a row a read waits for its last source without a timer and still publishes once', async () => {
	const READS = 20;
	const timers = settleTimers();
	try {
		const { poller, emits } = rig({ public: 5, smc: 40 });
		poller.retain();
		await advance(READS * INTERVAL_MS);
		poller.release();
		assert.deepEqual(timedReads(timers.at), range(0, TRUSTED_READS), 'one settle timer for each of the first reads, then none');
		for (let k = 1; k < READS; k++) assert.deepEqual(offsets(emits)[k], [0, 40], `interval ${k}: the timer tick, then one publication when the last source settles`);
		for (let k = 1; k < READS; k++) assert.deepEqual(changes(emits)[k], [40], `interval ${k}`);
	} finally { timers.restore(); }
});

test('the first slow SMC read after a fast run holds public readings at most until the next read, and the timer returns until reads are fast again', async () => {
	const READS = 30;
	const SLOW_READ = 11; // 1-based: the SMC read at 10 s, after ten fast ones
	const SLOW_MS = 2500; // still out at the next two ticks
	const timers = settleTimers();
	try {
		const { poller, emits, reads } = rig({ public: 5, smc: (n) => (n === SLOW_READ ? SLOW_MS : 40) });
		poller.retain();
		await advance(READS * INTERVAL_MS);
		poller.release();
		const slowAt = reads.smc[SLOW_READ - 1]!, published = firstPublished(emits);
		assert.ok(published.get(slowAt)! <= slowAt + INTERVAL_MS, `public read at ${slowAt} ms published at ${published.get(slowAt)} ms, after the next read started`);
		for (const at of [slowAt + INTERVAL_MS, slowAt + 2 * INTERVAL_MS]) assert.ok(published.get(at)! - at <= 5 + SETTLE_WINDOW_MS, `with the slow SMC read still out, public read at ${at} ms published at ${published.get(at)} ms`);
		const slowInterval = slowAt / INTERVAL_MS;
		assert.deepEqual(timedReads(timers.at), [...range(0, TRUSTED_READS), ...range(slowInterval + 1, slowInterval + 3 + TRUSTED_READS)], 'timed for the two reads the slow one overlaps and the fast ones that rebuild trust, then untimed');
		for (let k = slowInterval + 3; k < READS; k++) assert.deepEqual(offsets(emits)[k], [0, 40], `interval ${k}: one publication per read again`);
	} finally { timers.restore(); }
});

test('reads start timed again every time keys come back', async () => {
	const READS = 12;
	const timers = settleTimers();
	try {
		const { poller } = rig({ public: 5, smc: 40 });
		poller.retain();
		await advance(READS * INTERVAL_MS);
		poller.release();
		await advance(INTERVAL_MS);
		const back = Date.now() - START_MS;
		poller.retain();
		await advance(READS * INTERVAL_MS);
		poller.release();
		assert.deepEqual(timers.at.filter((at) => at >= back).map((at) => Math.floor((at - back) / INTERVAL_MS)), range(0, TRUSTED_READS), 'trust from the last time keys were shown is not reused');
	} finally { timers.restore(); }
});

test('a provider that cannot time its reads keeps the settle timer on every read', async () => {
	const READS = 12;
	const timers = settleTimers();
	try {
		const { poller, emits } = rig({ public: 5, smc: 40 }, { clock: false });
		poller.retain();
		await advance(READS * INTERVAL_MS);
		poller.release();
		assert.deepEqual(timedReads(timers.at), range(0, READS));
		for (let k = 1; k < READS; k++) assert.deepEqual(offsets(emits)[k], [0, 40], `interval ${k}`);
	} finally { timers.restore(); }
});

test('coalescing changes no measurement: own acquisition times, one sample and one dial observation per read', async () => {
	const { poller, emits, reads } = rig({ public: 5, smc: 40 });
	poller.subscribeSeries(MEM); poller.subscribeSeries(SMC);
	poller.retain();
	// Past TRUSTED_READS, so reads that wait with and without the settle timer both count.
	const READS = 2 * TRUSTED_READS;
	await advance(READS * INTERVAL_MS + 100);
	const starts = Array.from({ length: READS + 1 }, (_, k) => k * INTERVAL_MS);
	// The provider's one counter rebaseline read (250 ms after the first public request) is a genuine extra public observation.
	const publicStarts = [0, 250, ...starts.slice(1)];
	// One interval after a health request is inside HEALTH_MIN_SPACING_MS and two are not, so health is read every second tick.
	assert.ok(INTERVAL_MS < HEALTH_MIN_SPACING_MS && 2 * INTERVAL_MS >= HEALTH_MIN_SPACING_MS);
	assert.deepEqual(reads, { public: publicStarts, smc: starts, health: starts.filter((_, k) => k % 2 === 0) });
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
	assert.deepEqual(reads, { public: [0], smc: [0], health: [0] });
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
	assert.deepEqual(reads.public, [0, 250, 5000, 10000, 15000, back, back + 250], 'one extra public read per provider generation, none while hidden');
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
	// Rebaseline at 250 ms (counted from the first request), regular tick at 500 ms: 250 ms later, a real counter window, so the tick keeps its read.
	const HALF_SECOND_MS = 500;
	const it = rig({ public: (n) => (n === 1 ? 5 : 1), smc: 11 }, { cpu: true, intervalMs: HALF_SECOND_MS });
	it.poller.retain();
	await advance(4 * HALF_SECOND_MS + 20);
	it.poller.release();
	assert.deepEqual(it.reads.public, [0, 250, 500, 1000, 1500, 2000], 'one rebaseline read, and every 500 ms tick reads public');
	assert.deepEqual(it.reads.smc, [0, 500, 1000, 1500, 2000]);
	for (let i = 1; i < it.reads.public.length; i++) assert.ok(it.reads.public[i]! - it.reads.public[i - 1]! >= MIN_COUNTER_WINDOW_MS, `public reads ${JSON.stringify(it.reads.public)} start less than ${MIN_COUNTER_WINDOW_MS} ms apart`);
});

test('at Read every 500 ms a slow first read still leaves the next tick its public read', async () => {
	// A cold first read of 60 ms (Intel public read time is unknown): the rebaseline waits the 200 ms counter window after it completes,
	// at 260 ms, and the 500 ms tick 240 ms later keeps its read.
	const HALF_SECOND_MS = 500;
	const SLOW_COLD_READ_MS = 60;
	const it = rig({ public: (n) => (n === 1 ? SLOW_COLD_READ_MS : 1), smc: 11 }, { cpu: true, intervalMs: HALF_SECOND_MS });
	it.poller.retain();
	await advance(4 * HALF_SECOND_MS + 20);
	it.poller.release();
	assert.deepEqual(it.reads.public, [0, 260, 500, 1000, 1500, 2000], 'the rebaseline keeps a 200 ms counter window and the 500 ms tick keeps its read');
});

test('a first read slower than the rebaseline delay still leaves the rebaseline a full counter window', async () => {
	// The native read samples its counters at the end, so the window runs from the first read's completion to the next read.
	const VERY_SLOW_COLD_READ_MS = 300;
	const it = rig({ public: (n) => (n === 1 ? VERY_SLOW_COLD_READ_MS : 1), smc: 11 }, { cpu: true });
	it.poller.retain();
	await advance(INTERVAL_MS + 20);
	it.poller.release();
	assert.ok(it.reads.public[1]! - VERY_SLOW_COLD_READ_MS >= MIN_COUNTER_WINDOW_MS, `public reads ${JSON.stringify(it.reads.public)}: the rebaseline starts ${it.reads.public[1]! - VERY_SLOW_COLD_READ_MS} ms after the first read completed`);
	assert.deepEqual(it.reads.public, [0, 500, 1000], 'one rebaseline read 200 ms after the slow first read completed, then the regular tick');
});

test('a Read every change to 250 ms just after a key appears never leaves two public reads moments apart', async () => {
	// The startup global settings reply can land after the first read: the rebaseline then fires before the restarted timer's first tick.
	const it = rig({ public: (n) => (n === 1 ? 5 : 1), smc: 11 }, { cpu: true });
	it.poller.retain();
	await advance(20);
	it.poller.setIntervalMs(COUNTER_REBASELINE_MS);
	await advance(4 * COUNTER_REBASELINE_MS + 15);
	it.poller.release();
	assert.deepEqual(it.reads.public, [0, 250, 520, 770, 1020], 'the rebaseline read stands in for the public half of the tick 20 ms after it');
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

test('a release while a read waits leaves the next generation no stale wait to score', async () => {
	const READS = 12;
	const timers = settleTimers();
	try {
		const { poller } = rig({ public: 5, smc: 40 });
		poller.retain();
		await advance(6); // public settled at 5 ms, SMC still out
		poller.release();
		await advance(INTERVAL_MS);
		const back = Date.now() - START_MS;
		poller.retain();
		await advance(READS * INTERVAL_MS);
		poller.release();
		assert.deepEqual(timers.at.filter((at) => at >= back).map((at) => Math.floor((at - back) / INTERVAL_MS)), range(0, TRUSTED_READS), 'the first read after the return counts toward trust');
	} finally { timers.restore(); }
});

test('a public failure after the first packet never earns a generation a second rebaseline read', async () => {
	const { poller, reads } = rig({ public: 5, smc: 40 }, { intervalMs: 5000, publicError: (n) => n === 2 });
	poller.retain();
	await advance(2 * 5000 + 100);
	poller.release();
	assert.deepEqual(reads.public, [0, 250, 5000, 10000], 'the failed rebaseline read resets the baseline, but the recovery at 5000 ms is not followed by another extra read');
});

test('a tick just after a failed rebaseline read still reads public', async () => {
	const { poller, reads } = rig({ public: (n) => (n === 1 ? 5 : 1), smc: 11 }, { publicError: (n) => n === 2 });
	poller.retain();
	await advance(20);
	poller.setIntervalMs(COUNTER_REBASELINE_MS);
	await advance(4 * COUNTER_REBASELINE_MS + 15);
	poller.release();
	assert.deepEqual(reads.public, [0, 250, 270, 520, 770, 1020], 'with no baseline kept there is no sample to stand in for the tick at 270 ms');
});

test('a read that starts from a status screen is always timed, so a slow SMC read after a sleep past the TTL holds system readings at most the settle window', async () => {
	// Review T8: a trusted run, then a sleep longer than the 15 s TTL expires every reading, and the first SMC read after the wake is slow.
	const SLEEP_MS = 60_000;
	const SLOW_AFTER_WAKE_MS = 1500;
	const PUBLIC_MS = 5;
	const FAST_READS = 12;
	for (const intervalMs of [INTERVAL_MS, 5000]) {
		let asleep = 0;
		const timers = settleTimers();
		try {
			const { poller, emits } = rig({ public: PUBLIC_MS, smc: () => (asleep ? SLOW_AFTER_WAKE_MS : 40) }, { intervalMs, asleepMs: () => asleep });
			const start = Date.now() - START_MS;
			poller.retain();
			await advance(FAST_READS * intervalMs + intervalMs / 2);
			assert.deepEqual(timers.at.filter((at) => at >= start + TRUSTED_READS * intervalMs), [], `${intervalMs} ms: the reads before the sleep were trusted (untimed)`);
			asleep = SLEEP_MS;
			const woke = Date.now() - START_MS;
			await advance(2 * intervalMs + SLOW_AFTER_WAKE_MS);
			poller.release();
			const after = emits.filter((emit) => emit.at >= woke);
			const screen = after.find((emit) => emit.status.state !== 'ok'), back = after.find((emit) => emit.status.state === 'ok');
			assert.ok(screen && back, `${intervalMs} ms: ${JSON.stringify(after.map((emit) => [emit.at, emit.status.state]))}`);
			assert.ok(back.at - screen.at <= PUBLIC_MS + SETTLE_WINDOW_MS, `${intervalMs} ms: the status screen stayed ${back.at - screen.at} ms while system readings were ready`);
			assert.equal(back.mem, true, `${intervalMs} ms: system readings come back first`);
		} finally { timers.restore(); }
	}
});

test('a Read every change publishes a waiting read at once instead of holding it into the new interval', async () => {
	// Review T4: trusted, SMC read 11 hangs, public settles 5 ms after the tick, and the setting changes 15 ms before the next tick.
	const HUNG_SMC_READ = 11; // 1-based, after ten fast reads
	const HUNG_MS = 600_000;
	const CHANGE_LEAD_MS = 15;
	const PUBLIC_MS = 5;
	for (const [fromMs, toMs] of [[INTERVAL_MS, 5000], [INTERVAL_MS, COUNTER_REBASELINE_MS], [5000, COUNTER_REBASELINE_MS]] as const) {
		const { poller, emits, reads } = rig({ public: PUBLIC_MS, smc: (n) => (n === HUNG_SMC_READ ? HUNG_MS : 40) }, { intervalMs: fromMs });
		const start = Date.now() - START_MS;
		poller.retain();
		await advance(HUNG_SMC_READ * fromMs - CHANGE_LEAD_MS);
		const changedAt = Date.now() - START_MS;
		poller.setIntervalMs(toMs);
		await advance(2 * toMs + 2 * SETTLE_WINDOW_MS);
		poller.release();
		const hungAt = reads.smc[HUNG_SMC_READ - 1]!, published = firstPublished(emits);
		assert.equal(hungAt, start + (HUNG_SMC_READ - 1) * fromMs, `${fromMs}->${toMs} ms: the hung SMC read`);
		assert.ok(published.get(hungAt)! <= changedAt, `${fromMs}->${toMs} ms: public read at ${hungAt} ms (settled ${hungAt + PUBLIC_MS}) published at ${published.get(hungAt)} ms, after the change at ${changedAt} ms`);
		const nextAt = reads.public.find((at) => at > changedAt)!;
		assert.ok(published.get(nextAt)! - nextAt <= PUBLIC_MS + SETTLE_WINDOW_MS, `${fromMs}->${toMs} ms: with SMC still out, public read at ${nextAt} ms published at ${published.get(nextAt)} ms`);
	}
});

test('a Read every change starts trust over', async () => {
	const FAST_READS = 12;
	const NEW_INTERVAL_MS = 2000;
	const timers = settleTimers();
	try {
		const { poller } = rig({ public: 5, smc: 40 });
		poller.retain();
		await advance(FAST_READS * INTERVAL_MS + INTERVAL_MS / 2);
		const changedAt = Date.now() - START_MS;
		poller.setIntervalMs(NEW_INTERVAL_MS);
		await advance(FAST_READS * NEW_INTERVAL_MS);
		poller.release();
		// The restarted timer's first read starts one new interval after the change.
		assert.deepEqual(timers.at.filter((at) => at >= changedAt).map((at) => Math.floor((at - changedAt) / NEW_INTERVAL_MS)), range(1, TRUSTED_READS + 1), 'the reads after the change are timed until they prove fast again');
	} finally { timers.restore(); }
});

test('a clock that reads NaN publishes about once per read, not on a 1 ms expiry loop, and readings return when it recovers', async () => {
	// Review T7a: the native clock reads NaN for three reads. untilExpiry used to answer 0, and the poller re-armed a 1 ms expiry timer forever.
	const FAILS_FROM_MS = 10_500, FAILS_FOR_MS = 3000;
	let fails = false;
	const { poller, emits, reads } = rig({ public: 5, smc: 40 }, { clockFails: () => fails });
	poller.retain();
	await advance(FAILS_FROM_MS);
	fails = true;
	await advance(FAILS_FOR_MS);
	fails = false;
	await advance(2 * INTERVAL_MS);
	poller.release();
	const during = emits.filter((emit) => emit.at >= FAILS_FROM_MS && emit.at < FAILS_FROM_MS + FAILS_FOR_MS);
	const readsDuring = reads.smc.filter((at) => at >= FAILS_FROM_MS && at < FAILS_FROM_MS + FAILS_FOR_MS).length;
	assert.equal(readsDuring, FAILS_FOR_MS / INTERVAL_MS);
	// Each read publishes at its tick and once more when its sources settle.
	assert.ok(during.length <= 2 * readsDuring, `${during.length} publications during ${readsDuring} reads`);
	assert.deepEqual([...new Set(during.map((emit) => emit.status.state === 'unavailable' ? emit.status.reason : emit.status.state))], ['source-error']);
	const recovered = emits.find((emit) => emit.at >= FAILS_FROM_MS + FAILS_FOR_MS && emit.mem && emit.smc);
	assert.ok(recovered && recovered.at <= FAILS_FROM_MS + FAILS_FOR_MS + INTERVAL_MS, `readings back at ${recovered?.at} ms`);
	assert.equal(emits.at(-1)?.status.state, 'ok');
});

/** 2^32 bytes: where a 32-bit interface byte counter wraps. */
const WRAP = 2n ** 32n;
/** Bytes per public read on a steady link, so the third read lands exactly on 2^32 and later reads pass it. */
const BYTES_PER_READ = 1_000_000n;
const crossing = (n: number): bigint => WRAP - 3n * BYTES_PER_READ + BigInt(n) * BYTES_PER_READ;
const networkCatalog = (emit: Emit): number | undefined => emit.status.state === 'ok' && emit.status.snapshot.byKey.has(NET) ? emit.status.snapshot.catalogRevision : undefined;

test('network counters crossing 4 GiB keep the network rows, their sparkline and the catalog', async () => {
	const { poller, emits, reads } = rig({ public: 5, smc: 40 }, { network: crossing });
	poller.subscribeSeries(NET);
	poller.retain();
	await advance(8 * INTERVAL_MS + 100);
	const samples = poller.getSeries(NET)?.length;
	poller.release();
	const first = emits.findIndex((emit) => networkCatalog(emit) !== undefined);
	assert.ok(first >= 0 && reads.public.length >= 4, 'the reads pass 2^32 while the network key is shown');
	assert.ok(emits.slice(first).every((emit) => networkCatalog(emit) !== undefined), 'no later read withholds the network rows');
	assert.equal(new Set(emits.slice(first).map(networkCatalog)).size, 1, 'crossing 2^32 changes no catalog');
	assert.equal(samples, reads.public.length - 1, 'one sample per read after the baseline; the ring is never cleared');
});

test('a network counter that decreases is a reset: that read withholds the network rows and the sparkline restarts', async () => {
	// What 32-bit getifaddrs counters reported: the third read wraps to 0, below the second, so no rate exists for it.
	const { poller, reads } = rig({ public: 5, smc: 40 }, { network: (n) => crossing(n) % WRAP });
	poller.subscribeSeries(NET);
	poller.retain();
	await advance(8 * INTERVAL_MS + 100);
	const samples = poller.getSeries(NET)?.length;
	poller.release();
	assert.equal(samples, reads.public.length - 3, 'the baseline, the sample before the decrease and the withheld read are gone');
});
