// Read every: the runtime parse follows the one shared case table that the
// staged panel summary is also checked against (test/mac/panel-stage.test.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// A namespace import keeps the table test runnable against builds without the named range constants.
import * as policy from '../../src/mac/poller';
const { MacPoller, parsePollInterval } = policy;

interface PollCase { label: string; raw?: unknown; special?: 'undefined' | 'NaN' | 'Infinity' | '-Infinity'; expected: number }
/** Values JSON cannot carry are named in the fixture and rebuilt here. */
const SPECIAL: Record<NonNullable<PollCase['special']>, unknown> = { undefined: undefined, NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY, '-Infinity': Number.NEGATIVE_INFINITY };
const table = JSON.parse(readFileSync(new URL('./fixtures/poll-interval-cases.json', import.meta.url), 'utf8')) as { cases: PollCase[] };
const rawOf = (entry: PollCase): unknown => (entry.special ? SPECIAL[entry.special] : entry.raw);

test('the runtime Read every parse follows the shared case table', () => {
	assert.ok(table.cases.length > 40);
	for (const entry of table.cases) assert.equal(parsePollInterval(rawOf(entry)), entry.expected, entry.label);
});

test('one supported range: 250 ms to 5 s, default 1 s, every offered option kept', () => {
	assert.deepEqual([policy.POLL_INTERVAL_MIN_MS, policy.POLL_INTERVAL_DEFAULT_MS, policy.POLL_INTERVAL_MAX_MS], [250, 1000, 5000]);
	for (const offered of [250, 500, 1000, 2000, 5000]) { assert.equal(parsePollInterval(offered), offered); assert.equal(parsePollInterval(String(offered)), offered); }
});

test('a stored interval outside the range runs, and reports, the clamped interval', () => {
	const subject = new MacPoller(() => ({ read: () => null, current: () => null, untilExpiry: () => null, age: () => null, close: () => {} }));
	for (const [stored, effective] of [[60000, 5000], [20000, 5000], [100, 250], [2000, 2000]] as const) {
		subject.setIntervalMs(parsePollInterval(stored));
		assert.equal(subject.diagnostics().intervalMs, effective, String(stored));
	}
});

test('the log records each effective Read every change once, and nothing for a repeat', () => {
	const subject = new MacPoller(() => ({ read: () => null, current: () => null, untilExpiry: () => null, age: () => null, close: () => {} }));
	const lines: string[] = [];
	Object.defineProperty(subject, 'logger', { value: { info: (line: string) => lines.push(line), warn: (line: string) => lines.push(line) } });
	subject.setIntervalMs(2000); subject.setIntervalMs(2000); subject.setIntervalMs(60000); subject.setIntervalMs(5000); subject.setIntervalMs(1000);
	assert.deepEqual(lines, ['Read interval set to 2000 ms', 'Read interval set to 5000 ms', 'Read interval set to 1000 ms']);
});
