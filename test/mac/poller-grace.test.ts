import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { MacPoller, RELEASE_GRACE_MS } from '../../src/mac/poller';
import type { SensorSnapshot } from '../../src/hwinfo/types';
/** A provider double that counts generations, so a test can tell a continued session from a new one. */
function rig():{poller:MacPoller;opened:()=>number;closed:()=>number} {
	let opened=0,closed=0;
	const snapshot:SensorSnapshot={pollTime:1,version:1,revision:1,valueRevision:1,catalogRevision:1,sensors:[],readings:[],byKey:new Map()};
	const poller=new MacPoller(()=>{opened++;return {read:()=>snapshot,current:()=>snapshot,untilExpiry:()=>null,age:()=>0,close:()=>{closed++;}};});
	return {poller,opened:()=>opened,closed:()=>closed};
}
test('a page change inside the release grace keeps the same reading generation',()=>{
	mock.timers.enable({apis:['setTimeout','setInterval','Date']});
	try {
		const r=rig();r.poller.retain();assert.equal(r.opened(),1);
		r.poller.release();mock.timers.tick(RELEASE_GRACE_MS-1);assert.equal(r.closed(),0,'reading continues while the next page appears');
		r.poller.retain();mock.timers.tick(RELEASE_GRACE_MS*2);assert.equal(r.opened(),1,'no new provider, so key session statistics, sparklines and the counter baseline survive');assert.equal(r.closed(),0);
		r.poller.release();mock.timers.tick(RELEASE_GRACE_MS);assert.equal(r.closed(),1,'a deck left without reading actions stops after the grace');assert.equal((r.poller.getStatus() as {reason?:string}).reason,'pending','a real stop returns to the pending status');
		r.poller.retain();assert.equal(r.opened(),2,'after a real stop the next page starts a new generation');r.poller.release();mock.timers.tick(RELEASE_GRACE_MS);assert.equal(r.closed(),2);
	} finally { mock.timers.reset(); }
});
test('the grace never holds a stop open while actions are still visible',()=>{
	mock.timers.enable({apis:['setTimeout','setInterval','Date']});
	try {
		const r=rig();r.poller.retain();r.poller.retain();r.poller.release();mock.timers.tick(RELEASE_GRACE_MS*3);assert.equal(r.closed(),0,'one action is still visible');
		r.poller.release();r.poller.release();mock.timers.tick(RELEASE_GRACE_MS);assert.equal(r.closed(),1,'an extra release cannot schedule a second stop or go negative');
		r.poller.retain();assert.equal(r.opened(),2);r.poller.release();mock.timers.tick(RELEASE_GRACE_MS);
	} finally { mock.timers.reset(); }
});
