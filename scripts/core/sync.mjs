// Pinned file import from slawrensen/hwinfo-streamdeck. Never writes in the source checkout.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 });
export function safePath(root, name) {
  if (!name || path.isAbsolute(name) || name.includes('\\') || name.split('/').some((p) => !p || p === '.' || p === '..') || name.startsWith('.git/')) throw new Error(`Unsafe path: ${name}`);
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`Symlink path: ${name}`);
  }
  return current;
}
function sourceRepo(manifest, supplied) {
  let repo = supplied;
  if (!repo) {
    repo = path.join(os.tmpdir(), `mac-sensors-core-${manifest.upstream.commit}`);
    if (!fs.existsSync(repo)) git(os.tmpdir(), 'clone', '--bare', `https://github.com/${manifest.upstream.repository}.git`, repo);
  }
  const remote = git(repo, 'remote', 'get-url', 'origin').toString().trim().replace(/\.git$/, '');
  if (![ `https://github.com/${manifest.upstream.repository}`, `git@github.com:${manifest.upstream.repository}` ].includes(remote)) throw new Error('Unexpected source remote');
  return repo;
}
function walk(root, region) {
  const dir = safePath(root, region.path);
  if (!fs.existsSync(dir)) return [];
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = `${region.path}/${entry.name}`;
    safePath(root, name);
    if (entry.isFile()) output.push(name);
    else if (entry.isDirectory() && region.recursive) output.push(...walk(root, { path: name, recursive: true }));
  }
  return output;
}
function validateManifest(root, manifest) {
  const seen = new Set();
  for (const file of manifest.files) {
    safePath(root, file.destination); safePath(root, file.source);
    const key = file.destination.normalize('NFC').toLowerCase();
    if (seen.has(key)) throw new Error(`Colliding destination: ${file.destination}`);
    seen.add(key);
    if (file.patch) safePath(root, file.patch.path);
  }
  const allowed = new Set([...manifest.files.map((f) => f.destination), ...manifest.ownedExclusions]);
  for (const region of manifest.ownedRegions) for (const file of walk(root, region)) if (!allowed.has(file)) throw new Error(`Undeclared copied-region file: ${file}`);
  const actualTests = manifest.files.filter((f) => /\.test\.(?:ts|mjs)$/.test(f.destination)).map((f) => f.destination).sort();
  if (JSON.stringify(actualTests) !== JSON.stringify([...manifest.copiedTests].sort())) throw new Error('Copied-test membership mismatch');
}
function rewritten(repo, pin, entry, rewrites) {
  const mode = git(repo, 'ls-tree', pin, '--', entry.source).toString().split(' ')[0];
  if (mode !== '100644' && mode !== '100755') throw new Error(`Not a regular source blob: ${entry.source}`);
  const source = git(repo, 'show', `${pin}:${entry.source}`);
  let bytes = source; const counts = [];
  for (const [from, to] of rewrites) {
    const old = Buffer.from(from), next = Buffer.from(to), chunks = []; let start = 0, pos, count = 0;
    while ((pos = bytes.indexOf(old, start)) !== -1) { chunks.push(bytes.subarray(start, pos), next); start = pos + old.length; count++; }
    chunks.push(bytes.subarray(start)); bytes = Buffer.concat(chunks); counts.push(count);
  }
  return { source, bytes, counts };
}
function stage(root, manifest, repo, pin, update) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-core-stage-'));
  try {
    const next = structuredClone(manifest); next.upstream.commit = pin;
    for (const file of next.files) {
      const result = rewritten(repo, pin, file, next.rewrites);
      const values = { sourceSha256: digest(result.source), rewriteCounts: result.counts, rewrittenSha256: digest(result.bytes) };
      if (!update && Object.entries(values).some(([k, v]) => JSON.stringify(file[k]) !== JSON.stringify(v))) throw new Error(`Source hash/rewrite mismatch: ${file.destination}`);
      Object.assign(file, values);
      const dest = safePath(folder, file.destination); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, result.bytes);
      if (file.patch) {
        const patch = safePath(root, file.patch.path);
        if (digest(fs.readFileSync(patch)) !== file.patch.sha256) throw new Error(`Patch hash mismatch: ${file.patch.path}`);
        const text = fs.readFileSync(patch, 'utf8');
        const targets = [...text.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
        const origins = [...text.matchAll(/^--- a\/(.+)$/gm)].map((m) => m[1]);
        if (targets.length !== 1 || origins.length !== 1 || targets[0] !== file.destination || origins[0] !== file.destination) throw new Error('Patch must modify exactly its declared copied file');
        git(folder, 'apply', '--check', patch);
        git(folder, 'apply', patch);
      }
      const finalHash = digest(fs.readFileSync(dest));
      if (!update && finalHash !== file.postPatchSha256) throw new Error(`Post-patch mismatch: ${file.destination}`);
      file.postPatchSha256 = finalHash;
    }
    for (const port of next.ports) {
      try { port.upstreamSha256 = digest(git(repo, 'show', `${pin}:${port.source}`)); }
      catch { port.upstreamSha256 = null; }
      if (port.reviewedThroughSha256 !== port.upstreamSha256) port.disposition = 'pending';
    }
    writeJson(path.join(folder, 'core-sync.json'), next);
    return { folder, manifest: next };
  } catch (error) { fs.rmSync(folder, { recursive: true, force: true }); throw error; }
}
function recover(root) {
  const folder = path.join(root, '.core-sync-transaction');
  if (!fs.existsSync(folder)) return;
  const journal = json(path.join(folder, 'journal.json'));
  for (const entry of [...journal.entries].reverse()) {
    const destination = safePath(root, entry.path);
    const current = fs.existsSync(destination) ? digest(fs.readFileSync(destination)) : null;
    if (current !== entry.before && current !== entry.after) throw new Error(`Recovery preserves an external edit: ${entry.path}`);
    if (entry.before === null) { if (fs.existsSync(destination)) fs.unlinkSync(destination); }
    else { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(path.join(folder, entry.backup), destination); }
  }
  fs.rmSync(folder, { recursive: true });
}
function promote(root, staged, old, injectFailure) {
  const folder = path.join(root, '.core-sync-transaction');
  const entries = [...staged.manifest.files.map((f) => ({ path: f.destination, expected: old.files.find((o) => o.destination === f.destination)?.postPatchSha256 })), { path: 'core-sync.json', expected: digest(fs.readFileSync(path.join(root, 'core-sync.json'))) }].map((entry, i) => {
    const destination = safePath(root, entry.path);
    const bytes = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
    if (bytes && digest(bytes) !== entry.expected) throw new Error(`Unrecorded edit preserved: ${entry.path}`);
    const backup = `${i}.before`;
    return { path: entry.path, before: bytes ? digest(bytes) : null, after: digest(fs.readFileSync(path.join(staged.folder, entry.path))), backup };
  });
  fs.mkdirSync(folder);
  for (const entry of entries) if (entry.before !== null) fs.copyFileSync(safePath(root, entry.path), path.join(folder, entry.backup));
  writeJson(path.join(folder, 'journal.json'), { entries });
  try {
    let count = 0;
    for (const entry of entries) {
      const target = safePath(root, entry.path);
      const now = fs.existsSync(target) ? digest(fs.readFileSync(target)) : null;
      if (now !== entry.before) throw new Error(`Concurrent edit preserved: ${entry.path}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temp = `${target}.core-next`; if (fs.existsSync(temp)) throw new Error(`Staging collision: ${temp}`);
      fs.copyFileSync(path.join(staged.folder, entry.path), temp); fs.renameSync(temp, target);
      if (++count === injectFailure) throw new Error('Injected promotion failure');
    }
    fs.rmSync(folder, { recursive: true });
  } catch (error) { recover(root); throw error; }
}
function withLock(root, callback, recovery) {
  const lock = path.join(root, '.core-sync-lock');
  if (fs.existsSync(lock)) {
    if (!recovery) throw new Error('Sync lock exists; use --recover after the recorded writer exits');
    const pid = json(path.join(lock, 'owner.json')).pid;
    try { process.kill(pid, 0); throw new Error('Recorded sync writer is still alive'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    recover(root); fs.rmSync(lock, { recursive: true });
  }
  fs.mkdirSync(lock); writeJson(path.join(lock, 'owner.json'), { pid: process.pid });
  try { if (recovery) recover(root); else if (fs.existsSync(path.join(root, '.core-sync-transaction'))) throw new Error('Unfinished promotion requires --recover'); return callback(); }
  finally { fs.rmSync(lock, { recursive: true, force: true }); }
}
export function run({ root, mode, upstream, pin, file: selected, seam, reason, injectFailure, recovery = false, release = false }) {
  return withLock(root, () => {
    const manifest = json(path.join(root, 'core-sync.json')); validateManifest(root, manifest);
    const repo = sourceRepo(manifest, upstream); const commit = git(repo, 'rev-parse', `${pin ?? manifest.upstream.commit}^{commit}`).toString().trim();
    if (mode === 'patch') {
      if (!seam || !reason) throw new Error('Patch requires --seam and --reason');
      const entry = manifest.files.find((f) => f.destination === selected); if (!entry) throw new Error('Patch target is not copied');
      const result = rewritten(repo, manifest.upstream.commit, entry, manifest.rewrites);
      const current = fs.readFileSync(safePath(root, selected));
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-core-patch-'));
      try {
        for (const [prefix, bytes] of [['a', result.bytes], ['b', current]]) { const target = path.join(scratch, prefix, selected); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
        let diff;
        try { diff = git(scratch, 'diff', '--no-index', '--', `a/${selected}`, `b/${selected}`).toString(); } catch (error) { if (error.status !== 1) throw error; diff = error.stdout.toString(); }
        if (!diff) { entry.patch = null; entry.postPatchSha256 = digest(current); }
        else {
          diff = diff.replaceAll(`a/a/${selected}`, `a/${selected}`).replaceAll(`b/b/${selected}`, `b/${selected}`);
          const name = `core-patches/${selected.replaceAll('/', '__')}.patch`;
          const header = `Source: ${manifest.upstream.repository}/${entry.source}@${manifest.upstream.commit}\nSeam: ${seam}\nReason: ${reason}\nBefore: ${digest(result.bytes)}\nAfter: ${digest(current)}\n\n`;
          fs.mkdirSync(path.dirname(safePath(root, name)), { recursive: true }); fs.writeFileSync(safePath(root, name), header + diff);
          entry.patch = { path: name, sha256: digest(Buffer.from(header + diff)), seam, reason }; entry.postPatchSha256 = digest(current);
        }
        writeJson(path.join(root, 'core-sync.json'), manifest);
      } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
      return;
    }
    const staged = stage(root, manifest, repo, commit, mode === 'sync');
    try {
      if (mode === 'sync') promote(root, staged, manifest, injectFailure);
      else if (mode === 'check') {
        for (const entry of manifest.files) {
          const destination = safePath(root, entry.destination);
          if (!fs.existsSync(destination) || digest(fs.readFileSync(destination)) !== entry.postPatchSha256) throw new Error(`Copied file differs: ${entry.destination}`);
        }
        const lock = json(path.join(root, 'package-lock.json'));
        for (const [name, version] of Object.entries(manifest.runtimePins)) if (lock.packages[`node_modules/${name}`]?.version !== version) throw new Error(`Runtime pin changed: ${name}`);
        const pending = staged.manifest.ports.filter((p) => p.disposition === 'pending' || p.reviewedThroughSha256 !== p.upstreamSha256);
        if (release && pending.length) throw new Error(`${pending.length} unresolved port reviews`);
        for (const port of staged.manifest.ports.filter((p) => p.disposition !== 'pending')) {
          if (!port.reason || !port.evidence?.length || !port.destinations?.length) throw new Error(`Port disposition lacks evidence: ${port.source}`);
          for (const destination of port.destinations) if (!fs.existsSync(safePath(root, destination))) throw new Error(`Missing port destination: ${destination}`);
        }
        const scripts = json(path.join(root, 'package.json')).scripts;
        if (scripts.test !== 'node scripts/core/test.mjs') throw new Error('Copied-test runner was replaced');
        console.log(`core:check: ${manifest.files.length} copied files, ${manifest.copiedTests.length} tests; ${pending.length} port implementation gates open`);
      } else throw new Error(`Unknown mode ${mode}`);
    } finally { fs.rmSync(staged.folder, { recursive: true, force: true }); }
  }, recovery);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); const mode = args.shift();
  const option = (name) => { const at = args.indexOf(name); if (at < 0) return undefined; const value = args[at + 1]; args.splice(at, 2); return value; };
  const flag = (name) => { const at = args.indexOf(name); if (at < 0) return false; args.splice(at, 1); return true; };
  try { run({ root: process.cwd(), mode, upstream: option('--upstream') ?? process.env.MACSENSORS_UPSTREAM, file: option('--file'), seam: option('--seam'), reason: option('--reason'), injectFailure: Number(option('--inject-failure')) || undefined, recovery: flag('--recover'), release: flag('--release'), pin: args[0] }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
