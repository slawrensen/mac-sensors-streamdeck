// Every copied test is executed from the sync manifest, including future additions.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const { copiedTests } = JSON.parse(fs.readFileSync('core-sync.json', 'utf8'));
if (!copiedTests.length || new Set(copiedTests).size !== copiedTests.length) throw new Error('Invalid copied-test inventory');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...copiedTests], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
