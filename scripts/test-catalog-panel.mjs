import './lib/no-active-soak.mjs';
import './lib/script-failures.mjs';
// Browser regression for independent source discovery. Simulated host and sample data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startPiSim} from './lib/pi-sim.mjs';
import {launch} from './lib/cdp.mjs';
const base=Number(process.env.PI_LAB_PORT_BASE??29480),sim=await startPiSim({httpPort:base+1,wsPort:base});
const browser=await launch({width:320,height:800}),errors=[];
browser.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.text));
const waitFor=async predicate=>{const end=Date.now()+4000;while(Date.now()<end){if(await predicate())return true;await new Promise(resolve=>setTimeout(resolve,30));}return false;};
const requests=()=>sim.piMessages.filter(message=>message.event==='sendToPlugin'&&message.payload?.event==='getSensorTree');
try {
	sim.setFixture('key-configured');sim.snapshot={...sim.snapshot,catalogRevision:1};
	await browser.goto(sim.url('key-configured'));
	assert.ok(await waitFor(()=>browser.evaluate('typeof hwShell !== "undefined" && hwShell.state.tree !== null')),'initial tree never arrived');
	await new Promise(resolve=>setTimeout(resolve,100));const before=requests().length;
	const key='mac:v1:system:memory-total',row={...sim.snapshot.readings[0],key,label:'Arrived asynchronously',value:1024,unit:'B'};
	const readings=[...sim.snapshot.readings,row];sim.snapshot={...sim.snapshot,readings,byKey:new Map(readings.map(reading=>[reading.key,reading])),catalogRevision:2,valueRevision:2};sim.pushPreview();
	assert.ok(await waitFor(()=>browser.evaluate(`hwShell.state.tree?.groups.some(group=>group.readings.some(reading=>reading.key===${JSON.stringify(key)}))`)),'a newly discovered reading never reached the open picker');
	assert.equal(requests().length,before+1,'one catalog change needs one refresh');assert.equal(requests().at(-1).payload.refresh,undefined,'automatic catalog refresh must not accelerate acquisition');
	sim.pushPreview();await new Promise(resolve=>setTimeout(resolve,100));assert.equal(requests().length,before+1);
	sim.data='unavailable';sim.pushPreview();assert.ok(await waitFor(()=>browser.evaluate('document.querySelector("[data-status-action=retry]") !== null')));
	await browser.evaluate('document.querySelector("[data-status-action=retry]").click()');
	assert.ok(await waitFor(async()=>requests().some(message=>message.payload.refresh===true)),'manual Check again did not request a read');
	assert.equal(sim.writes.length,0);assert.equal(sim.globalWrites.length,0);assert.deepEqual(errors,[]);
	const record={scope:'Simulated host, sample data',newReadingAppeared:true,automaticRefreshes:1,manualRefresh:true,settingsWrites:0,globalSettingsWrites:0,errors};
	if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
}finally{await browser.close();await sim.stop();}
