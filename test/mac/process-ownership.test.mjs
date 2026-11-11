import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ownedDescendants,processIdentity,processSnapshot,PROCESS_TABLE_MAX_BYTES} from '../../scripts/lib/process-ownership.mjs';
const OVERSIZED_TABLE_ROWS=10_000,OVERSIZED_COMMAND_PAD_CHARS=200,NODE_DEFAULT_MAX_BUFFER_BYTES=1024*1024;
test('a process table larger than Node\'s default output cap is still read whole',()=>{
	const root=fs.mkdtempSync(path.join(os.tmpdir(),'mac-sensors-ps-')),table=path.join(root,'table.txt'),ps=path.join(root,'ps');
	try {
		const lines=Array.from({length:OVERSIZED_TABLE_ROWS},(_,index)=>`${index+2} 1 Tue Nov 10 12:07:23 2026 /usr/bin/fake --row ${index} ${'x'.repeat(OVERSIZED_COMMAND_PAD_CHARS)}`);
		fs.writeFileSync(table,lines.join('\n')+'\n');
		assert.ok(fs.statSync(table).size>2*NODE_DEFAULT_MAX_BUFFER_BYTES);
		assert.ok(fs.statSync(table).size<PROCESS_TABLE_MAX_BYTES);
		fs.writeFileSync(ps,`#!/bin/sh\nexec /bin/cat ${JSON.stringify(table)}\n`,{mode:0o755});
		const rows=processSnapshot(ps);
		assert.equal(rows.length,OVERSIZED_TABLE_ROWS);
		assert.deepEqual(rows.at(-1),{pid:OVERSIZED_TABLE_ROWS+1,parentPid:1,createdAt:new Date('Tue Nov 10 12:07:23 2026').toISOString(),commandLine:`/usr/bin/fake --row ${OVERSIZED_TABLE_ROWS-1} ${'x'.repeat(OVERSIZED_COMMAND_PAD_CHARS)}`});
	} finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test('ownership requires the observed parent generation and command',()=>{
	const root={pid:10,parentPid:1,createdAt:'2026-10-12T00:00:00Z',commandLine:'owned'},child={pid:11,parentPid:10,createdAt:'2026-10-12T00:00:01Z',commandLine:'child'};
	const roots=new Set([processIdentity(root)]);
	assert.deepEqual(ownedDescendants([root,child],roots),[root,child]);
	assert.deepEqual(ownedDescendants([{...root,createdAt:'2026-10-12T00:00:02Z'},child],roots),[]);
	assert.deepEqual(ownedDescendants([{...root,commandLine:'unrelated'},child],roots),[]);
	assert.deepEqual(ownedDescendants([child],roots),[]);
});
