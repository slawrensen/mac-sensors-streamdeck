/** Independent acquisition policy behind the shared action/poller seam. */
import { EventEmitter } from 'node:events';
import streamDeck from '@elgato/streamdeck';
import { HwinfoError, type SensorSnapshot } from '../hwinfo/types';
import { liveKeyOf } from '../hwinfo/reading-links';
import { pushSample } from '../series';
import {trace,traceEnabled} from '../recorder';
import type { PollerStatus } from '../poller';
import { openMacProvider, type MacSnapshotProvider } from './native-loader';
import { PENDING_MESSAGE, TTL_MS } from './provider';
export type { PollerStatus } from '../poller';
/** Read every default: what an absent, blank or malformed stored value means. */
export const POLL_INTERVAL_DEFAULT_MS = 1000;
/** Shortest offered Read every option. */
export const POLL_INTERVAL_MIN_MS = 250;
/** Longest offered Read every option; kept well inside the 15 s reading TTL (TTL_MS) so readings never expire between reads. */
export const POLL_INTERVAL_MAX_MS = 5000;
/** One supported range for runtime and panel (staged pollIntervalOf mirrors this; test/mac/fixtures/poll-interval-cases.json pins both). A blank string is not a number. */
export function parsePollInterval(raw: unknown): number {
	const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
	return Number.isFinite(value) ? Math.min(POLL_INTERVAL_MAX_MS, Math.max(POLL_INTERVAL_MIN_MS, Math.round(value))) : POLL_INTERVAL_DEFAULT_MS;
}
export function parseSourceMode(_raw: unknown): 'auto' { void _raw; return 'auto'; }
type Factory = (ready: () => void) => MacSnapshotProvider;
const pending = (): PollerStatus => ({ state: 'unavailable', reason: 'pending', message: PENDING_MESSAGE });
/**
 * Longest a settled source's readings wait for the read's other sources, so a context that
 * shows readings of several sources gets one publication per read. Below the 250 ms minimum interval.
 * Evidence (PERF.md, 2026-10-12 CI native benchmark on the M5 Pro, SMC read time at 1 s): p50
 * 11.10 ms in the second window, slowest of 1,000 reads 66.39 ms in the first. Intel SMC
 * duration is unknown; a timed read slower than this window publishes twice (bounded).
 */
const SETTLE_WINDOW_MS = 100;
/**
 * A read is fast when its last source settles within this long of the first: half the settle window.
 * Evidence (2026-10-16 actual-app traces on the M5 Pro, 4,418 reads at 250 ms and 1 s): public to SMC
 * p50 11.2 ms, p99 39.1 ms, slowest 47.6 ms, none over 50 ms. A Mac whose reads are slower keeps the
 * timer on every read.
 */
const FAST_SETTLE_MS = 50;
/**
 * Fast reads in a row after which a read waits for its last source without a timer. Node wakes at a
 * timer's deadline even when the timer was cleared first: about two interrupt wakeups per read, measured
 * in the app and in Node alone (2026-10-16). Such a read holds the settled source until the other
 * settles or the next read starts, at most one Read every, and only once: a read that is not fast
 * brings the timer back. Trust starts over each time keys appear or Read every changes. A read whose status is not ok when its
 * first source settles is always timed, so a status screen (for example every reading expired across a
 * sleep longer than the TTL) never waits on a slow source.
 */
const TRUSTED_READS = 8;
/**
 * How long reading continues after the last Sensor Reading key, Sensor Dial or detail tile disappears. The app
 * sends the old page's disappear before the new page's appear, so a page change, opening details or Back would
 * otherwise stop reading for a moment and start every key's session statistics, sparkline and counter baseline
 * over. Longer than an app page switch, short enough that a deck put away stops reading almost at once.
 */
export const RELEASE_GRACE_MS = 2000;
/** Key families in the source observation trace: the native sources' key prefixes and the provider's computed readings. */
const TRACE_SOURCES = ['system', 'smc', 'health', 'computed'] as const;
/** Per key family: row count, newest observation revision and oldest acquisition, as the soak freshness check reads them. */
export function sourceObservations(snapshot: SensorSnapshot): Array<{ source: string; rows: number; observation: number; acquired: number | null }> {
	return TRACE_SOURCES.map(source => {
		const rows = snapshot.readings.filter(reading => reading.key.startsWith(`mac:v1:${source}:`));
		return { source, rows: rows.length, observation: Math.max(0, ...rows.map(reading => reading.observationRevision ?? 0)), acquired: rows.length ? Math.min(...rows.map(reading => reading.observationTime ?? 0)) : null };
	});
}
export class MacPoller extends EventEmitter {
	private readonly logger = streamDeck.logger.createScope('MacSensors');
	private provider: MacSnapshotProvider | null = null;
	private timer: NodeJS.Timeout | null = null;
	private expiry: NodeJS.Timeout | null = null;
	/** The open settle window of the current read; cleared when the last source settles or the last consumer leaves. */
	private settle: NodeJS.Timeout | null = null;
	/** When the current read's first source settled while another was still out; null while no read waits. */
	private waitingSince: number | null = null;
	/** Fast reads in a row, up to TRUSTED_READS. */
	private fastReads = 0;
	private refs = 0;
	private intervalMs = POLL_INTERVAL_DEFAULT_MS;
	private status = pending();
	private readonly series = new Map<string, number[]>();
	private readonly observations = new Map<string, string>();
	private tracedObservation = -1;
	/** Pending stop while no action is visible; a retain before it fires keeps reading going. */
	private stopping: NodeJS.Timeout | null = null;
	constructor(private readonly factory: Factory = openMacProvider, private readonly releaseGraceMs: number = RELEASE_GRACE_MS) { super(); }
	onTick(listener: (status: PollerStatus) => void): void { this.on('tick', listener); }
	checkAgain(): void { if (this.refs > 0) this.tick(); }
	getStatus(): PollerStatus { this.refresh(false); return this.status; }
	isHolding(): boolean { return false; }
	setReadingLinks(_raw: unknown): void { void _raw; /* Saved settings remain untouched; Mac keys resolve directly. */ }
	setSourceMode(_mode: string): void { void _mode; /* There is one Mac source policy. */ }
	subscribeSeries(key: string): void { if (!this.series.has(key)) this.series.set(key, []); }
	getSeries(key: string): readonly number[] | undefined { return this.series.get(key); }
	retain(): void {
		// A page came back inside the grace: the same reading generation continues.
		if (this.stopping) { clearTimeout(this.stopping); this.stopping = null; this.refs++; return; }
		if (++this.refs !== 1) return;
		this.status = pending();
		this.timer = setInterval(() => this.tick(), this.intervalMs).unref();
		this.tick();
		this.logger.info(`Started (${this.intervalMs} ms interval)`);
	}
	release(): void {
		this.refs = Math.max(0, this.refs - 1);
		if (this.refs !== 0 || this.stopping) return;
		if (this.releaseGraceMs <= 0) { this.stop(); return; }
		this.stopping = setTimeout(() => { this.stopping = null; if (this.refs === 0) this.stop(); }, this.releaseGraceMs).unref();
	}
	/** Ends the reading generation: no timer, no provider, cleared local history. */
	private stop(): void {
		if (this.timer) clearInterval(this.timer);
		if (this.expiry) clearTimeout(this.expiry);
		if (this.settle) clearTimeout(this.settle);
		this.timer = this.expiry = this.settle = null;
		this.waitingSince = null; this.fastReads = 0;
		this.provider?.close(); this.provider = null;
		this.status = pending();
		this.observations.clear();
		for (const ring of this.series.values()) ring.length = 0;
		this.logger.info('Stopped (no visible actions)');
	}
	setIntervalMs(ms: number): void {
		const next = parsePollInterval(ms); if (next === this.intervalMs) return;
		this.intervalMs = next;
		// The startup line can predate the stored setting, so the log records every effective change.
		this.logger.info(`Read interval set to ${next} ms`);
		for (const ring of this.series.values()) ring.length = 0;
		this.observations.clear();
		if (this.timer) { clearInterval(this.timer); this.timer = setInterval(() => this.tick(), next).unref(); }
		// The restarted timer can push the next read up to a full new interval away: trust starts over, and a read
		// still waiting publishes what has settled now instead of holding it into the new interval.
		this.fastReads = 0;
		if (this.waitingSince !== null) this.refresh(true);
	}
	diagnostics(): Record<string, string | number | boolean | null> {
		const status = this.getStatus();
		return { state: status.state, ...(status.state === 'unavailable' ? { reason: status.reason, detail: status.message } : { source: 'mac', readings: status.snapshot.readings.length }), intervalMs: this.intervalMs, polling: this.timer !== null, retained: this.refs, sampleAgeMs: this.provider?.age() ?? null };
	}
	private accept(snapshot: SensorSnapshot): void {
		if (!snapshot.readings.length) throw new HwinfoError('no-readable-sensors', 'No readable sensors were found.');
		this.status = { state: 'ok', source: 'mac', snapshot };
		if (traceEnabled()) {
			const revision = Math.max(0, ...snapshot.readings.map(reading => reading.observationRevision ?? 0));
			if (revision !== this.tracedObservation) {
				this.tracedObservation = revision;
				trace({ event: 'sourceObservation', note: JSON.stringify({ catalog: snapshot.catalogRevision, sources: sourceObservations(snapshot) }) });
			}
		}
		for (const [key, ring] of this.series) {
			const reading = snapshot.byKey.get(key);
			if (!reading || !Number.isFinite(reading.value)) { ring.length = 0; this.observations.delete(key); continue; }
			const identity = `${liveKeyOf(reading)}|${reading.type}|${reading.unit}`;
			const observed = `${identity}|${reading.observationRevision ?? ''}|${reading.observationTime ?? ''}`;
			const previous = this.observations.get(key);
			if (previous && !previous.startsWith(identity + '|')) ring.length = 0;
			if (reading.observationRevision !== undefined && reading.observationTime !== undefined && observed !== previous) pushSample(ring, reading.value);
			this.observations.set(key, observed);
		}
	}
	private failure(error: unknown): void {
		this.status = error instanceof HwinfoError
			? { state: 'unavailable', reason: error.reason, message: error.message }
			: { state: 'unavailable', reason: 'source-error', message: 'The sensor source could not be read.' };
		for (const ring of this.series.values()) ring.length = 0;
		this.observations.clear();
	}
	private armExpiry(): void {
		if (this.expiry) clearTimeout(this.expiry); this.expiry = null;
		if (!this.refs) return;
		const delay = this.provider?.untilExpiry();
		if (delay !== null && delay !== undefined) this.expiry = setTimeout(() => this.refresh(true), Math.max(1, Math.min(delay, TTL_MS))).unref();
	}
	private refresh(emit: boolean): void {
		if (!this.provider) return;
		// No snapshot while ok means every published row expired or failed before the other source ever completed: never keep it live.
		try { const snapshot = this.provider.current(); if (snapshot) this.accept(snapshot); else if (this.status.state === 'ok') this.failure(new HwinfoError('pending', PENDING_MESSAGE)); }
		catch (error) { this.failure(error); }
		for (const notice of this.provider.notices?.() ?? []) this.logger.warn(notice);
		this.armExpiry();
		if (emit && this.refs) this.emit('tick', this.status);
	}
	/** One publication per read: a source that settles while another is still out waits for it, timed by SETTLE_WINDOW_MS until reads prove fast and whenever the status is not ok. */
	private settled(): void {
		if (!this.provider) return;
		const now = this.provider.now?.() ?? NaN;
		if ((this.provider.inFlight?.() ?? 0) > 0) {
			this.waitingSince ??= now;
			if (this.fastReads < TRUSTED_READS || this.status.state !== 'ok') this.settle ??= setTimeout(() => { this.settle = null; this.fastReads = 0; this.refresh(true); }, SETTLE_WINDOW_MS).unref();
			return;
		}
		if (this.waitingSince !== null) { this.fastReads = this.waitIsFast(now) ? Math.min(TRUSTED_READS, this.fastReads + 1) : 0; this.waitingSince = null; }
		if (this.settle) { clearTimeout(this.settle); this.settle = null; }
		this.refresh(true);
	}
	/** Whether the current read has waited at most FAST_SETTLE_MS; never fast when the clock is missing (NaN) or ran backwards. */
	private waitIsFast(now: number): boolean {
		const ms = now - (this.waitingSince ?? NaN);
		return ms >= 0 && ms <= FAST_SETTLE_MS;
	}
	private tick(): void {
		if (!this.refs) return;
		// A read that has already waited longer than FAST_SETTLE_MS when the next one starts was slow: the timer bounds the reads that follow.
		if (this.waitingSince !== null && !this.waitIsFast(this.provider?.now?.() ?? NaN)) this.fastReads = 0;
		try {
			if (!this.provider) this.provider = this.factory(() => this.settled());
			this.provider.read();
		} catch (error) { this.failure(error); }
		// refresh accepts current() and arms expiry once; a read() that threw fails again there, or stays failed without a provider.
		this.refresh(false); this.emit('tick', this.status);
	}
}
export const poller = new MacPoller();
