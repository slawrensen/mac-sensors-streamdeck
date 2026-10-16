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
const START = 1_000_000;
const INTERVAL = 1000;

type Emit = { at: number; signature: string; smc: boolean; mem: boolean; status: PollerStatus };
interface Rig { poller: MacPoller; emits: Emit[]; reads: Record<NativeSource, number[]> }
/** Real MacPoller and MacProvider over a fake bridge whose reads settle after a fixed delay per source. */
function rig(delay: Record<NativeSource, number>, options: { smcError?: boolean } = {}): Rig {
	const reads: Record<NativeSource, number[]> = { public: [], smc: [] };
	const row = (key: string, kind: string, unit: string, value: number, at: number): NativeRow => ({ key, label: key, group: kind === 'temperature' ? 'Battery' : 'Memory', kind, unit, value, valid: true, continuousMs: at, wallSeconds: 1.7e9 + at / 1000, error: 0, systemCode: 0 });
	const packet = (source: NativeSource, n: number, at: number): NativePacket => ({
		source, continuousMs: at, awakeMs: at, wallSeconds: 1.7e9 + at / 1000, durationMs: 1, error: source === 'smc' && options.smcError ? 12 : 0, systemCode: 0, operation: 'fixture',
		rows: source === 'public' ? [row('memory-free', 'other', 'B', 1e9 + n * 4096, at)] : options.smcError ? [] : [row('TB1T', 'temperature', '°C', 40 + (n % 9), at)],
		model: 'Mac17,9', chip: 't6050', appleSilicon: 1, translated: 0, translationError: 0, fontAvailable: true, cpuValid: false, cpuTicks: [[0, 0, 0, 0]],
		networkValid: false, networkIn: '0', networkOut: '0', networkMembers: '1', storageValid: false, storageRead: '0', storageWrite: '0', storageMembers: '1'
	});
	const bridge: NativeBridge = {
		getBuildInfo: () => ({ protocol: 1, napi: 8, version: 'test', sourceId: 'test', arch: process.arch, platform: 'darwin', testHooks: true }),
		now: () => Date.now(),
		open: () => ({ read: (source) => { const at = Date.now(); const n = reads[source].push(at - START); return new Promise((resolve) => { setTimeout(() => resolve(packet(source, n, at)), delay[source]); }); }, close: () => {} })
	};
	const poller = new MacPoller((ready) => new MacProvider(bridge, ready));
	poller.setIntervalMs(INTERVAL);
	const emits: Emit[] = [];
	poller.onTick((status: PollerStatus) => emits.push({ at: Date.now() - START, signature: tickSignature(status), smc: status.state === 'ok' && status.snapshot.byKey.has(SMC), mem: status.state === 'ok' && status.snapshot.byKey.has(MEM), status }));
	return { poller, emits, reads };
}
/** Offsets, within each read interval, of emits that carry a new data state. */
function changes(emits: Emit[]): number[][] {
	const byInterval: number[][] = [];
	let last = '';
	for (const emit of emits) {
		if (emit.signature !== last) (byInterval[Math.floor(emit.at / INTERVAL)] ??= []).push(emit.at % INTERVAL);
		last = emit.signature;
	}
	return byInterval;
}

beforeEach(() => mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: START }));
afterEach(() => mock.timers.reset());

test('a read whose sources settle 35 ms apart publishes its new readings once', async () => {
	const { poller, emits } = rig({ public: 5, smc: 40 });
	poller.retain();
	await advance(5 * INTERVAL);
	poller.release();
	for (let k = 1; k < 5; k++) assert.deepEqual(changes(emits)[k], [40], `interval ${k}`);
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
	await advance(6 * INTERVAL);
	poller.release();
	for (let k = 1; k < 6; k++) assert.ok((changes(emits)[k] ?? []).some((offset) => offset <= 105), `interval ${k}: ${JSON.stringify(changes(emits)[k])}`);
});

test('a failed SMC read publishes the public readings once, when it settles', async () => {
	const { poller, emits } = rig({ public: 5, smc: 40 }, { smcError: true });
	poller.retain();
	await advance(4 * INTERVAL);
	poller.release();
	for (let k = 1; k < 4; k++) assert.deepEqual(changes(emits)[k], [40], `interval ${k}`);
});

test('coalescing changes no measurement: own acquisition times, one sample and one dial observation per read', async () => {
	const { poller, emits, reads } = rig({ public: 5, smc: 40 });
	poller.subscribeSeries(MEM); poller.subscribeSeries(SMC);
	poller.retain();
	await advance(10 * INTERVAL + 100);
	const starts = Array.from({ length: 11 }, (_, k) => k * INTERVAL);
	assert.deepEqual(reads, { public: starts, smc: starts });
	assert.equal(poller.getSeries(MEM)?.length, 11);
	assert.equal(poller.getSeries(SMC)?.length, 11);
	const stats = new SessionStatsStore();
	const seen = new Map<string, Map<number, number>>([[MEM, new Map()], [SMC, new Map()]]);
	for (const { status } of emits) {
		if (status.state !== 'ok') continue;
		for (const key of [MEM, SMC]) {
			const reading = status.snapshot.byKey.get(key);
			if (!reading) continue;
			stats.observe(reading, status.snapshot, 'mac');
			const times = seen.get(key)!, previous = times.get(reading.observationRevision!), acquired = reading.observationTime! - START;
			assert.ok(previous === undefined || previous === acquired, `${key}: one observation, one acquisition time`);
			times.set(reading.observationRevision!, acquired);
		}
	}
	for (const key of [MEM, SMC]) {
		assert.deepEqual([...seen.get(key)!.values()], starts, `${key}: each observation keeps its own read start; the other source never restamps it`);
		assert.equal(stats.get(key)?.count, 11, `${key}: one dial observation per read`);
	}
	poller.release();
});

test('the last release cancels a pending settle window and stops acquisition', async () => {
	const { poller, emits, reads } = rig({ public: 5, smc: 40 });
	poller.retain();
	await advance(6);
	poller.release();
	const count = emits.length;
	await advance(3 * INTERVAL);
	assert.equal(emits.length, count);
	assert.deepEqual(reads, { public: [0], smc: [0] });
});
