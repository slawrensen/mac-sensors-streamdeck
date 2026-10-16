// Release gate: a tag may build only when ci.yml already tested the exact tree of the
// tagged commit and every job of that run passed. Evidence is either a push run on main
// for the commit itself, or a pull_request run whose tested merge commit has the same
// tree. Read-only GitHub API use through gh: it never triggers, reruns or cancels a run.
// It checks once and never waits. Exit 0 pass, 1 fail, 2 pending; JSON on stdout.
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** Only ci.yml runs count; release.yml and docs runs never test the product tree. */
export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
/** Push runs count only on the branch releases are cut from. */
export const RELEASE_BRANCH = 'main';
/** Every job name ci.yml's matrices produce; test/mac/verify-ci-checks.test.mjs derives the same list from ci.yml, so a matrix change cannot leave the gate stale. */
export const REQUIRED_JOBS = [
	'verify (macos-26, arm64)',
	'verify (macos-26-intel, x64)',
	...['20', '22', '24'].flatMap((node) => [`abi (${node}, macos-26, arm64)`, `abi (${node}, macos-26-intel, x64)`]),
];
/** The jobs that check out and qualify the source; their logs are the only record of the merge commit a pull_request run tested. */
export const VERIFY_JOBS = REQUIRED_JOBS.filter((name) => name.startsWith('verify ('));
/** Exit codes the release workflow and the runbook read: pending means run it again later. */
export const EXIT_CODES = {pass: 0, fail: 1, pending: 2};
/** actions/checkout (pinned in ci.yml) logs this fetch of a pull request's merge ref; a later log format change finds nothing and fails closed. */
const MERGE_FETCH_PATTERN = /\+([0-9a-f]{40}):refs\/remotes\/pull\/\d+\/merge\b/g;
/** GitHub's largest page; the API lists runs newest first, so the first page holds the runs that decide. */
const PAGE_SIZE = 100;
/** Job logs of a full qualification run reach a few hundred KiB; this leaves ample room without unbounded memory. */
const GH_OUTPUT_MAX_BYTES = 64 * 1024 * 1024;
/** A candidate must be a full commit SHA so a short or symbolic name cannot match another commit. */
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

/** Distinct merge commits a job log says it fetched for a pull request, so a fixture can prove the parse. */
export function mergeCommitsInLog(text) {
	return [...new Set(Array.from(String(text ?? '').matchAll(MERGE_FETCH_PATTERN), (match) => match[1]))];
}

/** A run passes only when every job it ran succeeded and every required job exists, so a skipped, cancelled or missing job cannot pass. */
export function judgeJobs(jobs) {
	const problems = [];
	for (const name of REQUIRED_JOBS) {
		const job = jobs.find((entry) => entry.name === name);
		if (!job) problems.push(`${name}: missing`);
		else if (job.status !== 'completed' || job.conclusion !== 'success') problems.push(`${name}: ${job.conclusion ?? job.status}`);
	}
	for (const job of jobs) if (!REQUIRED_JOBS.includes(job.name) && (job.status !== 'completed' || job.conclusion !== 'success')) problems.push(`${job.name}: ${job.conclusion ?? job.status}`);
	return {ok: problems.length === 0, problems};
}

/** Newest first by the start of the latest attempt, so a rerun counts as recent evidence. */
function startedAt(run) {
	return Date.parse(run.run_started_at ?? run.created_at) || 0;
}

/** Calls that may legitimately be gone (expired logs, collected merge commits) make a run unusable as evidence instead of failing the whole check. */
function attempt(read) {
	try {
		return read();
	} catch {
		return null;
	}
}

/**
 * Decides the gate for one candidate through injected read-only calls, so fixtures cover
 * every branch without network. api(route) returns parsed JSON; apiText(route) returns text.
 */
export function evaluateCandidate({repo, sha, api, apiText}) {
	const commit = api(`repos/${repo}/git/commits/${sha}`);
	const tree = commit.tree.sha;
	const heads = [sha, ...commit.parents.map((parent) => parent.sha)];
	const workflow = path.posix.basename(CI_WORKFLOW_PATH);
	const byId = new Map();
	for (const head of heads) for (const run of api(`repos/${repo}/actions/workflows/${workflow}/runs?head_sha=${head}&per_page=${PAGE_SIZE}`).workflow_runs ?? []) byId.set(run.id, run);
	const relevant = [...byId.values()]
		.filter((run) => run.path === CI_WORKFLOW_PATH && ((run.event === 'push' && run.head_branch === RELEASE_BRANCH && run.head_sha === sha) || (run.event === 'pull_request' && heads.includes(run.head_sha))))
		.sort((a, b) => startedAt(b) - startedAt(a));
	const runs = relevant.map((run) => judgeRun({repo, sha, tree, run, api, apiText}));
	const decided = runs.find((row) => row.verdict === 'pass' || row.verdict === 'fail');
	// A rerun still in progress means an earlier attempt of that run may have failed, so it holds the gate.
	const rerunning = runs.find((row) => row.verdict === 'pending' && row.attempt > 1);
	const base = {sha, tree, runs};
	if (rerunning) return {...base, state: 'pending', run: rerunning.id, reason: `run ${rerunning.id} attempt ${rerunning.attempt} is ${rerunning.status}`};
	if (decided) return {...base, state: decided.verdict, run: decided.id, reason: decided.reason};
	const waiting = runs.find((row) => row.verdict === 'pending');
	if (waiting) return {...base, state: 'pending', run: waiting.id, reason: `no completed ci run tested tree ${tree} yet; run ${waiting.id} is ${waiting.status}`};
	return {...base, state: 'fail', reason: `no ci run on ${RELEASE_BRANCH} or pull request tested tree ${tree}`};
}

/** One run's verdict: pending, unverified (cannot tie it to a tree), other-tree, pass or fail. */
function judgeRun({repo, sha, tree, run, api, apiText}) {
	const row = {id: run.id, event: run.event, headSha: run.head_sha, attempt: run.run_attempt ?? 1, status: run.status, conclusion: run.conclusion ?? null};
	if (run.status !== 'completed') return {...row, verdict: 'pending', reason: `run ${run.id} is ${run.status}`};
	const listing = api(`repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=${PAGE_SIZE}`);
	const jobs = listing.jobs ?? [];
	if ((listing.total_count ?? jobs.length) > jobs.length) return {...row, verdict: 'fail', reason: `run ${run.id} has more jobs than one page; the gate cannot see them all`};
	let tested = sha;
	if (run.event === 'pull_request') {
		const verify = VERIFY_JOBS.map((name) => jobs.find((job) => job.name === name));
		if (verify.some((job) => !job)) return {...row, verdict: 'unverified', reason: `run ${run.id} lacks a verify job, so its tested commit is unknown`};
		const found = verify.map((job) => mergeCommitsInLog(attempt(() => apiText(`repos/${repo}/actions/jobs/${job.id}/logs`))));
		const merges = new Set(found.flat());
		if (found.some((list) => list.length !== 1) || merges.size !== 1) return {...row, verdict: 'unverified', reason: `run ${run.id} verify logs do not name exactly one merge commit`};
		tested = [...merges][0];
		const merge = attempt(() => api(`repos/${repo}/git/commits/${tested}`));
		if (!merge) return {...row, testedCommit: tested, verdict: 'unverified', reason: `merge commit ${tested} is not readable`};
		if (!merge.parents?.some((parent) => parent.sha === run.head_sha)) return {...row, testedCommit: tested, verdict: 'unverified', reason: `merge commit ${tested} does not have the run head ${run.head_sha} as a parent`};
		if (merge.tree?.sha !== tree) return {...row, testedCommit: tested, testedTree: merge.tree?.sha ?? null, verdict: 'other-tree', reason: `run ${run.id} tested tree ${merge.tree?.sha}, not ${tree}`};
	}
	const verdictBase = {...row, testedCommit: tested, testedTree: tree};
	if (run.conclusion !== 'success') return {...verdictBase, verdict: 'fail', reason: `run ${run.id} concluded ${run.conclusion}`};
	const judged = judgeJobs(jobs);
	if (!judged.ok) return {...verdictBase, verdict: 'fail', reason: `run ${run.id}: ${judged.problems.join('; ')}`};
	return {...verdictBase, verdict: 'pass', reason: `${run.event} run ${run.id} attempt ${row.attempt} tested tree ${tree}: all ${jobs.length} jobs passed`};
}

/** Thin IO shell around evaluateCandidate: one read-only pass through gh, then an exit code. */
function main() {
	const extra = process.argv.slice(2).filter((arg) => arg !== '--once');
	if (extra.length) throw new Error(`Unknown arguments: ${extra.join(' ')} (only --once is accepted; the check never waits)`);
	const repo = process.env.GH_REPO ?? '';
	if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('GH_REPO must name the repository as owner/name');
	const sha = (process.env.CANDIDATE_SHA ?? execFileSync('git', ['rev-parse', 'HEAD^{commit}'], {encoding: 'utf8'})).trim();
	if (!FULL_SHA_PATTERN.test(sha)) throw new Error('The candidate must be a full 40-character commit SHA');
	const apiText = (route) => execFileSync('gh', ['api', route], {encoding: 'utf8', maxBuffer: GH_OUTPUT_MAX_BYTES, stdio: ['ignore', 'pipe', 'pipe']});
	const api = (route) => JSON.parse(apiText(route));
	const result = evaluateCandidate({repo, sha, api, apiText});
	console.log(JSON.stringify(result, null, 2));
	process.exitCode = EXIT_CODES[result.state];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		main();
	} catch (error) {
		console.log(JSON.stringify({state: 'fail', reason: String(error?.message ?? error)}, null, 2));
		process.exitCode = EXIT_CODES.fail;
	}
}
