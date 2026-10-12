import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
import {startPiSim} from '../../scripts/lib/pi-sim.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('fixture replacement invalidates delayed replies from an old inspector',async()=>{
	const sim=await startPiSim({httpPort:29961,wsPort:29960});let old,current;
	try{
		const connect=async()=>{const socket=new WebSocket('ws://127.0.0.1:29960');await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});socket.send(JSON.stringify({event:'registerPropertyInspector',uuid:'pi-ctx'}));await sleep(20);return socket;};
		sim.setFixture('key-configured');old=await connect();sim.replyDelayMs=100;
		old.send(JSON.stringify({event:'sendToPlugin',payload:{event:'getSensorTree'}}));await sleep(30);
		sim.setFixture('dial-groups');current=await connect();await sleep(130);
		assert.equal(sim.toPiLog.length,0,'an old scheduled answer reached the new inspector');assert.ok(sim.settings.rotationGroups.length>1);assert.equal(sim.writes.length,0);
		current.send(JSON.stringify({event:'sendToPlugin',payload:{event:'getSensorTree'}}));await sleep(130);assert.equal(sim.toPiLog.length,1);assert.equal(sim.toPiLog[0].event,'sensorTree');
	}finally{old?.terminate();current?.terminate();await sim.stop();}
});
