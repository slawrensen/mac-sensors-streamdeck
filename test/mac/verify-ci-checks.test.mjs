// Fixture proof of the release CI gate and the workflow wiring around it. No network, no
// tag, nothing triggered or published: GitHub is a fake that answers fixed routes.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {CI_WORKFLOW_PATH, EXIT_CODES, REQUIRED_JOBS, VERIFY_JOBS, evaluateCandidate, judgeJobs, mergeCommitsInLog} from '../../scripts/verify-ci-checks.mjs';

const root = process.cwd();
const repo = 'owner/mac';
// Synthetic commits: the candidate merges head into base; merge is the commit a pull request run tested.
const sha = 'c'.repeat(40), base = 'b'.repeat(40), head = 'd'.repeat(40), merge = 'e'.repeat(40), pin = 'f'.repeat(40);
const tree = '1'.repeat(40), otherTree = '2'.repeat(40);
// Verify jobs get ids 100 and 101 in the default job list, so their logs are keyed by those ids.
const FIRST_JOB_ID = 100;

/** The job list of a fully green run, with per-name overrides for failure cases. */
const jobsOf = (over = {}) => REQUIRED_JOBS.map((name, index) => ({id: FIRST_JOB_ID + index, name, status: 'completed', conclusion: 'success', ...over[name]}));
/** A push run on main for the candidate, shaped like the Actions API rows. */
const pushRun = (over = {}) => ({id: 1, event: 'push', head_branch: 'main', head_sha: sha, path: CI_WORKFLOW_PATH, status: 'completed', conclusion: 'success', run_attempt: 1, run_started_at: '2026-10-13T13:21:53Z', ...over});
/** A pull_request run on the merged branch head, started before the merge. */
const prRun = (over = {}) => pushRun({id: 2, event: 'pull_request', head_branch: 'release-1.0.0', head_sha: head, run_started_at: '2026-10-13T13:07:51Z', ...over});
/** The checkout lines actions/checkout writes for a pull request merge ref, followed by the pinned upstream checkout. */
const checkoutLog = (mergeSha) => [
	`2026-10-13T13:08:02.0021950Z [command]/opt/homebrew/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +${mergeSha}:refs/remotes/pull/8/merge`,
	`2026-10-13T13:08:03.5471990Z  * [new ref]         ${mergeSha} -> pull/8/merge`,
	`2026-10-13T13:08:09.9728180Z [command]/opt/homebrew/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin ${pin}`,
].join('\n');
/** Logs for both verify jobs naming the same merge commit. */
const prLogs = (mergeSha = merge) => ({[FIRST_JOB_ID]: checkoutLog(mergeSha), [FIRST_JOB_ID + 1]: checkoutLog(mergeSha)});
/** The tested merge commit: same tree as the candidate, with the run head as a parent. */
const mergeCommit = (over = {}) => ({[merge]: {sha: merge, tree: {sha: tree}, parents: [{sha: base}, {sha: head}], ...over}});

/** A fake read-only GitHub; any route it does not know fails like gh's HTTP 404. */
function world({runs = [], jobs = {}, logs = {}, commits = {}} = {}) {
	const known = {[sha]: {sha, tree: {sha: tree}, parents: [{sha: base}, {sha: head}]}, ...commits};
	const api = (route) => {
		let match;
		if ((match = route.match(/^repos\/owner\/mac\/git\/commits\/([0-9a-f]{40})$/))) {
			if (!known[match[1]]) throw new Error('HTTP 404');
			return known[match[1]];
		}
		if ((match = route.match(/^repos\/owner\/mac\/actions\/workflows\/ci\.yml\/runs\?head_sha=([0-9a-f]{40})&per_page=100$/))) return {workflow_runs: runs.filter((run) => run.head_sha === match[1])};
		if ((match = route.match(/^repos\/owner\/mac\/actions\/runs\/(\d+)\/jobs\?filter=latest&per_page=100$/))) {
			const list = jobs[match[1]] ?? jobsOf();
			return {total_count: list.length, jobs: list};
		}
		throw new Error(`HTTP 404 ${route}`);
	};
	const apiText = (route) => {
		const match = route.match(/^repos\/owner\/mac\/actions\/jobs\/(\d+)\/logs$/);
		if (!match || !(match[1] in logs)) throw new Error('HTTP 404');
		return logs[match[1]];
	};
	return {api, apiText};
}
/** Runs the gate on a fake world and returns the decision. */
const decide = (fixture) => evaluateCandidate({repo, sha, ...world(fixture)});

/** Lines of the YAML block opened by `header` (an exact line), up to the next line indented at or above it. */
function block(lines, header) {
	const start = lines.indexOf(header);
	assert.notEqual(start, -1, `missing block ${header.trim()}`);
	const indent = header.length - header.trimStart().length;
	const out = [];
	for (const line of lines.slice(start + 1)) {
		if (line.trim() && line.length - line.trimStart().length <= indent) break;
		out.push(line);
	}
	return out;
}
/** Mapping keys at one exact indent, so a new key or job shows up in a comparison. */
const keysAt = (lines, indent) => lines.filter((line) => line.length - line.trimStart().length === indent && /^[\w-]+:/.test(line.trim())).map((line) => line.trim().split(':')[0]);
/** List items of `- os: X` / `arch: Y` pairs; any other item shape fails the count check. */
function targets(lines) {
	const items = lines.filter((line) => line.trimStart().startsWith('- '));
	const pairs = Array.from(lines.join('\n').matchAll(/^ *- os: (\S+)\n *arch: (\S+)$/gm), (match) => ({os: match[1], arch: match[2]}));
	assert.equal(pairs.length, items.length, 'every matrix item is exactly an os and an arch');
	return pairs;
}
/** Workflow text as lines. */
const workflow = (name) => fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8').split('\n');

test('the required job list is exactly what the ci.yml matrices produce', () => {
	const lines = workflow('ci.yml');
	assert.deepEqual(keysAt(block(lines, 'jobs:'), 2), ['verify', 'abi']);
	const verifyMatrix = block(block(lines, '  verify:'), '      matrix:');
	assert.deepEqual(keysAt(verifyMatrix, 8), ['include']);
	const abiMatrix = block(block(lines, '  abi:'), '      matrix:');
	assert.deepEqual(keysAt(abiMatrix, 8), ['node', 'target']);
	const nodes = abiMatrix.join('\n').match(/^ {8}node: \[([^\]]*)\]$/m)[1].split(',').map((value) => value.trim());
	const derived = [
		...targets(block(verifyMatrix, '        include:')).map(({os, arch}) => `verify (${os}, ${arch})`),
		...nodes.flatMap((node) => targets(block(abiMatrix, '        target:')).map(({os, arch}) => `abi (${node}, ${os}, ${arch})`)),
	];
	assert.deepEqual([...derived].sort(), [...REQUIRED_JOBS].sort());
	assert.deepEqual(VERIFY_JOBS, ['verify (macos-26, arm64)', 'verify (macos-26-intel, x64)']);
});

test('release.yml checks CI first, with read-only permissions and the same action pins, and still only drafts', () => {
	const lines = workflow('release.yml');
	assert.deepEqual(keysAt(block(lines, 'jobs:'), 2), ['ci-gate', 'build', 'draft']);
	const gate = block(lines, '  ci-gate:'), text = gate.join('\n');
	assert.match(text, /^ {4}runs-on: ubuntu-24\.04$/m);
	assert.match(text, /^ {4}timeout-minutes: 10$/m);
	assert.deepEqual(block(gate, '    permissions:').map((line) => line.trim()), ['actions: read', 'contents: read']);
	assert.match(text, /^ {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m);
	assert.match(text, /^ {10}GH_REPO: \$\{\{ github\.repository \}\}$/m);
	assert.match(text, /^ {8}run: node scripts\/verify-ci-checks\.mjs --once$/m);
	const ci = workflow('ci.yml').map((line) => line.trim());
	const uses = gate.map((line) => line.trim()).filter((line) => line.startsWith('- uses: '));
	assert.equal(uses.length, 2);
	for (const line of uses) assert.ok(ci.includes(line), `pin differs from ci.yml: ${line}`);
	assert.match(text, /persist-credentials: false/);
	assert.ok(block(lines, '  build:').includes('    needs: ci-gate'));
	const draft = block(lines, '  draft:').join('\n');
	assert.match(draft, /^ {4}needs: build$/m);
	assert.match(draft, /args=\(--draft /);
	assert.doesNotMatch(lines.join('\n'), /--draft=false|gh release edit|workflow_run|gh run rerun|gh workflow run/);
});

test('ci.yml runs the release core check on the pinned upstream as its own step before qualification', () => {
	const verify = block(workflow('ci.yml'), '  verify:');
	const starts = verify.flatMap((line, index) => (line.startsWith('      - ') ? [index] : []));
	const steps = starts.map((start, index) => verify.slice(start, starts[index + 1]).join('\n'));
	const at = (pattern) => steps.findIndex((step) => pattern.test(step));
	const core = at(/^ {8}run: npm run core:check -- --release$/m);
	assert.notEqual(core, -1, 'ci.yml verify has no core:check --release step');
	assert.match(steps[core], /^ {10}MACSENSORS_UPSTREAM_DIR: \$\{\{ github\.workspace \}\}\/upstream$/m);
	assert.ok(at(/^ {10}path: upstream$/m) < core, 'the pinned upstream is checked out first');
	assert.ok(core < at(/npm run release:validate/), 'the release core check runs before qualification');
});

test('a push run on main for the exact commit passes only when every job passed', () => {
	assert.equal(decide({runs: [pushRun()]}).state, 'pass');
	const failing = [
		{runs: [pushRun({conclusion: 'failure'})]},
		{runs: [pushRun({conclusion: 'startup_failure'})]},
		{runs: [pushRun({conclusion: 'cancelled'})]},
		{runs: [pushRun()], jobs: {1: jobsOf({'abi (24, macos-26-intel, x64)': {conclusion: 'skipped'}})}},
		{runs: [pushRun()], jobs: {1: jobsOf().filter((job) => job.name !== 'verify (macos-26-intel, x64)')}},
		{runs: [pushRun()], jobs: {1: [...jobsOf(), {id: 9, name: 'extra', status: 'completed', conclusion: 'cancelled'}]}},
	];
	for (const fixture of failing) assert.equal(decide(fixture).state, 'fail', JSON.stringify(fixture.runs));
	assert.match(decide(failing[3]).reason, /abi \(24, macos-26-intel, x64\): skipped/);
	assert.match(decide(failing[4]).reason, /verify \(macos-26-intel, x64\): missing/);
});

test('runs on another branch, commit, workflow or event are not evidence', () => {
	for (const run of [pushRun({head_branch: 'assembly'}), pushRun({head_sha: base}), pushRun({path: '.github/workflows/docs-static.yml'}), pushRun({event: 'workflow_dispatch'})]) {
		const result = decide({runs: [run]});
		assert.equal(result.state, 'fail');
		assert.match(result.reason, /no ci run/);
		assert.deepEqual(result.runs, []);
	}
});

test('a pull_request run counts when its tested merge commit has the candidate tree', () => {
	// The 1.0.0 timeline: the push run had just started when the tag arrived; the pull request run on the same tree had passed.
	const result = decide({runs: [pushRun({status: 'in_progress', conclusion: null}), prRun()], logs: prLogs(), commits: mergeCommit()});
	assert.equal(result.state, 'pass');
	assert.equal(result.run, 2);
	assert.equal(result.runs.find((row) => row.id === 2).testedCommit, merge);
});

test('a pull_request run on another tree, or one the gate cannot tie to a tree, is not evidence', () => {
	const cases = [
		[{logs: prLogs(), commits: mergeCommit({tree: {sha: otherTree}})}, 'other-tree'],
		[{logs: {}, commits: mergeCommit()}, 'unverified'],
		[{logs: {[FIRST_JOB_ID]: checkoutLog(merge), [FIRST_JOB_ID + 1]: checkoutLog('a'.repeat(40))}, commits: mergeCommit()}, 'unverified'],
		[{logs: {[FIRST_JOB_ID]: 'no checkout lines', [FIRST_JOB_ID + 1]: 'no checkout lines'}, commits: mergeCommit()}, 'unverified'],
		[{logs: prLogs(), commits: mergeCommit({parents: [{sha: base}]})}, 'unverified'],
		[{logs: prLogs(), commits: {}}, 'unverified'],
		[{logs: prLogs(), commits: mergeCommit(), jobs: {2: jobsOf().filter((job) => job.name !== 'verify (macos-26, arm64)')}}, 'unverified'],
	];
	for (const [fixture, verdict] of cases) {
		const result = decide({runs: [prRun()], ...fixture});
		assert.equal(result.runs[0].verdict, verdict, JSON.stringify(fixture));
		assert.equal(result.state, 'fail');
	}
});

test('the newest completed run on the tree decides, so an older green run cannot hide a newer red one', () => {
	const newerRed = decide({runs: [pushRun({conclusion: 'failure', run_started_at: '2026-10-13T13:30:00Z'}), prRun()], logs: prLogs(), commits: mergeCommit()});
	assert.equal(newerRed.state, 'fail');
	assert.equal(newerRed.run, 1);
	// The 39b93cd shape: the push run was billing-blocked and the pull request run never ran a step.
	const blocked = decide({runs: [pushRun({conclusion: 'failure'}), prRun({conclusion: 'failure'})], jobs: {2: [{id: 7, name: 'verify (macos-26, arm64)', status: 'completed', conclusion: 'failure'}, {id: 8, name: 'verify (macos-26-intel, x64)', status: 'completed', conclusion: 'failure'}, {id: 9, name: 'abi', status: 'completed', conclusion: 'skipped'}]}});
	assert.equal(blocked.state, 'fail');
	assert.deepEqual(blocked.runs.map((row) => row.verdict), ['fail', 'unverified']);
	assert.match(blocked.runs[1].reason, /verify job logs are not readable/);
});

test('only runs still in progress, or a rerun in progress, mean pending; no run at all fails', () => {
	assert.equal(decide({runs: [pushRun({status: 'queued', conclusion: null})]}).state, 'pending');
	assert.equal(decide({runs: [prRun({status: 'in_progress', conclusion: null})]}).state, 'pending');
	const rerun = decide({runs: [pushRun({status: 'in_progress', conclusion: null, run_attempt: 2}), prRun()], logs: prLogs(), commits: mergeCommit()});
	assert.equal(rerun.state, 'pending');
	assert.match(rerun.reason, /attempt 2/);
	assert.equal(decide({}).state, 'fail');
});

test('job and log parsing reject anything short of all jobs green and one named merge', () => {
	assert.deepEqual(judgeJobs(jobsOf()), {ok: true, problems: []});
	assert.equal(judgeJobs(jobsOf({'verify (macos-26, arm64)': {status: 'in_progress', conclusion: null}})).ok, false);
	assert.deepEqual(mergeCommitsInLog(checkoutLog(merge)), [merge]);
	assert.deepEqual(mergeCommitsInLog(`${checkoutLog(merge)}\n${checkoutLog(merge)}`), [merge]);
	assert.deepEqual(mergeCommitsInLog(null), []);
	assert.deepEqual(mergeCommitsInLog(`fetch origin +${merge}:refs/remotes/origin/main`), []);
});

test('the command exits 0 on pass, 1 on fail or bad input and 2 on pending, through gh only', (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-ci-gate-test-'));
	t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
	// A stand-in gh that serves fixed routes from a JSON file and fails anything else like an HTTP 404.
	fs.writeFileSync(path.join(dir, 'gh'), `#!${process.execPath}\nconst fs = require('node:fs');\nconst routes = JSON.parse(fs.readFileSync(process.env.FAKE_GH_ROUTES, 'utf8'));\nconst [command, route] = process.argv.slice(2);\nif (command !== 'api' || !(route in routes)) { console.error('gh: HTTP 404'); process.exit(1); }\nprocess.stdout.write(JSON.stringify(routes[route]));\n`, {mode: 0o755});
	const routesFor = (run) => ({
		[`repos/${repo}/git/commits/${sha}`]: {sha, tree: {sha: tree}, parents: [{sha: base}]},
		[`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`]: {workflow_runs: [run]},
		[`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${base}&per_page=100`]: {workflow_runs: []},
		[`repos/${repo}/actions/runs/1/jobs?filter=latest&per_page=100`]: {total_count: REQUIRED_JOBS.length, jobs: jobsOf()},
	});
	const cli = (routes, args = ['--once'], env = {}) => {
		const file = path.join(dir, 'routes.json');
		fs.writeFileSync(file, JSON.stringify(routes));
		return spawnSync(process.execPath, [path.join(root, 'scripts/verify-ci-checks.mjs'), ...args], {encoding: 'utf8', env: {...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, FAKE_GH_ROUTES: file, GH_REPO: repo, CANDIDATE_SHA: sha, ...env}});
	};
	const passed = cli(routesFor(pushRun()));
	assert.equal(passed.status, EXIT_CODES.pass, passed.stdout + passed.stderr);
	assert.equal(JSON.parse(passed.stdout).state, 'pass');
	assert.equal(cli(routesFor(pushRun({conclusion: 'failure'}))).status, EXIT_CODES.fail);
	assert.equal(cli(routesFor(pushRun({status: 'in_progress', conclusion: null}))).status, EXIT_CODES.pending);
	assert.equal(cli(routesFor(pushRun()), []).status, EXIT_CODES.pass);
	for (const [args, env] of [[['--wait'], {}], [['--once'], {CANDIDATE_SHA: 'c'.repeat(7)}], [['--once'], {GH_REPO: ''}], [['--once'], {CANDIDATE_SHA: 'a'.repeat(40)}]]) {
		const refused = cli(routesFor(pushRun()), args, env);
		assert.equal(refused.status, EXIT_CODES.fail, JSON.stringify({args, env}));
		assert.equal(JSON.parse(refused.stdout).state, 'fail');
	}
});
