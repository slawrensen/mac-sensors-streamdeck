/** Independent acquisition policy behind the shared action/poller seam. */
import { EventEmitter } from 'node:events';
import streamDeck from '@elgato/streamdeck';
import { HwinfoError, type SensorSnapshot } from '../hwinfo/types';
import { liveKeyOf } from '../hwinfo/reading-links';
import { pushSample } from '../series';
import {trace,traceEnabled} from '../recorder';
import type { PollerStatus } from '../poller';
import { openMacProvider, type MacSnapshotProvider } from './native-loader';
export type { PollerStatus } from '../poller';
/** Read every default: what an absent, blank or malformed stored value means. */
export const POLL_INTERVAL_DEFAULT_MS = 1000;
/** Shortest offered Read every option. */
export const POLL_INTERVAL_MIN_MS = 250;
/** Longest offered Read every option; kept well inside the 15 s reading TTL so readings never expire between reads. */
export const POLL_INTERVAL_MAX_MS = 5000;
/** One supported range for runtime and panel (staged pollIntervalOf mirrors this; test/mac/fixtures/poll-interval-cases.json pins both). A blank string is not a number. */
export function parsePollInterval(raw: unknown): number {
	const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
	return Number.isFinite(value) ? Math.min(POLL_INTERVAL_MAX_MS, Math.max(POLL_INTERVAL_MIN_MS, Math.round(value))) : POLL_INTERVAL_DEFAULT_MS;
}
export function parseSourceMode(_raw: unknown): 'auto' { void _raw; return 'auto'; }
type Factory = (ready: () => void) => MacSnapshotProvider;
const pending = (): PollerStatus => ({ state: 'unavailable', reason: 'pending', message: 'Readings appear after the first successful sample.' });
export class MacPoller extends EventEmitter {
	private readonly logger = streamDeck.logger.createScope('MacSensors');
	private provider: MacSnapshotProvider | null = null;
	private timer: NodeJS.Timeout | null = null;
	private expiry: NodeJS.Timeout | null = null;
	private refs = 0;
	private intervalMs = POLL_INTERVAL_DEFAULT_MS;
	private status = pending();
	private readonly series = new Map<string, number[]>();
	private readonly observations = new Map<string, string>();
	private tracedObservation = -1;
	constructor(private readonly factory: Factory = openMacProvider) { super(); }
	onTick(listener: (status: PollerStatus) => void): void { this.on('tick', listener); }
	checkAgain(): void { if (this.refs > 0) this.tick(); }
	getStatus(): PollerStatus { this.refresh(false); return this.status; }
	isHolding(): boolean { return false; }
	setReadingLinks(_raw: unknown): void { void _raw; /* Saved settings remain untouched; Mac keys resolve directly. */ }
	setSourceMode(_mode: string): void { void _mode; /* There is one Mac source policy. */ }
	subscribeSeries(key: string): void { if (!this.series.has(key)) this.series.set(key, []); }
	getSeries(key: string): readonly number[] | undefined { return this.series.get(key); }
	retain(): void {
		if (++this.refs !== 1) return;
		this.status = pending();
		this.timer = setInterval(() => this.tick(), this.intervalMs).unref();
		this.tick();
		this.logger.info(`Started (${this.intervalMs} ms interval)`);
	}
	release(): void {
		this.refs = Math.max(0, this.refs - 1);
		if (this.refs !== 0) return;
		if (this.timer) clearInterval(this.timer);
		if (this.expiry) clearTimeout(this.expiry);
		this.timer = this.expiry = null;
		this.provider?.close(); this.provider = null;
		this.status = pending();
		this.observations.clear();
		for (const ring of this.series.values()) ring.length = 0;
		this.logger.info('Stopped (no visible actions)');
	}
	setIntervalMs(ms: number): void {
		const next = parsePollInterval(ms); if (next === this.intervalMs) return;
		this.intervalMs = next;
		for (const ring of this.series.values()) ring.length = 0;
		this.observations.clear();
		if (this.timer) { clearInterval(this.timer); this.timer = setInterval(() => this.tick(), next).unref(); }
	}
	diagnostics(): Record<string, string | number | boolean | null> {
		const status = this.getStatus();
		return { state: status.state, ...(status.state === 'unavailable' ? { reason: status.reason } : { source: 'mac', readings: status.snapshot.readings.length }), intervalMs: this.intervalMs, polling: this.timer !== null, retained: this.refs, sampleAgeMs: this.provider?.age() ?? null };
	}
	private accept(snapshot: SensorSnapshot): void {
		if (!snapshot.readings.length) throw new HwinfoError('no-readable-sensors', 'No readable sensors were found.');
		this.status = { state: 'ok', source: 'mac', snapshot };
		if (traceEnabled()) {
			const revision = Math.max(0, ...snapshot.readings.map(reading => reading.observationRevision ?? 0));
			if (revision !== this.tracedObservation) {
				this.tracedObservation = revision;
				const sources = ['system', 'smc'].map(source => {
					const rows = snapshot.readings.filter(reading => reading.key.startsWith(`mac:v1:${source}:`));
					return { source, rows: rows.length, observation: Math.max(0, ...rows.map(reading => reading.observationRevision ?? 0)), acquired: rows.length ? Math.min(...rows.map(reading => reading.observationTime ?? 0)) : null };
				});
				trace({ event: 'sourceObservation', note: JSON.stringify({ catalog: snapshot.catalogRevision, sources }) });
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
		if (delay !== null && delay !== undefined) this.expiry = setTimeout(() => this.refresh(true), Math.max(1, Math.min(delay, 15_000))).unref();
	}
	private refresh(emit: boolean): void {
		if (!this.provider) return;
		try { const snapshot = this.provider.current(); if (snapshot) this.accept(snapshot); }
		catch (error) { this.failure(error); }
		for (const notice of this.provider.notices?.() ?? []) this.logger.warn(notice);
		this.armExpiry();
		if (emit && this.refs) this.emit('tick', this.status);
	}
	private tick(): void {
		if (!this.refs) return;
		try {
			if (!this.provider) this.provider = this.factory(() => this.refresh(true));
			const snapshot = this.provider.read(); if (snapshot) this.accept(snapshot);
		} catch (error) { this.failure(error); }
		this.refresh(false); this.armExpiry(); this.emit('tick', this.status);
	}
}
export const poller = new MacPoller();
