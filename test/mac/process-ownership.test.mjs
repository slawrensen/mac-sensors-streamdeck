import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedDescendants,processIdentity} from '../../scripts/lib/process-ownership.mjs';
test('ownership requires the observed parent generation and command',()=>{
	const root={pid:10,parentPid:1,createdAt:'2026-10-12T00:00:00Z',commandLine:'owned'},child={pid:11,parentPid:10,createdAt:'2026-10-12T00:00:01Z',commandLine:'child'};
	const roots=new Set([processIdentity(root)]);
	assert.deepEqual(ownedDescendants([root,child],roots),[root,child]);
	assert.deepEqual(ownedDescendants([{...root,createdAt:'2026-10-12T00:00:02Z'},child],roots),[]);
	assert.deepEqual(ownedDescendants([{...root,commandLine:'unrelated'},child],roots),[]);
	assert.deepEqual(ownedDescendants([child],roots),[]);
});
