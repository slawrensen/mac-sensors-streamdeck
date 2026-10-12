import './lib/no-active-soak.mjs';
import './lib/script-failures.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startPiSim} from './lib/pi-sim.mjs';
import {launch} from './lib/cdp.mjs';
const base=Number(process.env.PI_FOCUS_PORT_BASE??29920),sim=await startPiSim({httpPort:base+1,wsPort:base}),browser=await launch({width:189,height:800});
try {
	sim.setFixture('key-back');await browser.goto(sim.url('key-back'));
	for(let attempt=0;attempt<100;attempt++){if(await browser.evaluate('typeof hwShell !== "undefined" && hwShell.state.tree !== null'))break;await new Promise(resolve=>setTimeout(resolve,20));}
	await browser.evaluate('document.querySelectorAll("details").forEach(element=>element.open=true);document.activeElement?.blur();window.scrollTo(0,0)');
	await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
	const read=()=>browser.evaluate(`(()=>{const element=document.activeElement,header=document.querySelector('.hw-head[data-pin]'),box=element.getBoundingClientRect();return {id:element.id,tag:element.tagName,top:box.top,bottom:box.bottom,headerBottom:header.getBoundingClientRect().bottom,pinned:getComputedStyle(header).position};})()`);
	let count=0;for(;count<80;count++){await browser.key('Tab');if((await read()).tag==='BODY')break;}
	const observations=[];
	for(let i=0;i<count;i++){
		await browser.key('Tab',{shift:true});
		if((await read()).id==='config-key'){
			await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
			const observation=await read();observations.push(observation);assert.equal(observation.pinned,'sticky');assert.ok(observation.top>=observation.headerBottom+6,JSON.stringify(observation));assert.ok(observation.bottom<=800);
		}
	}
	assert.ok(observations.length>0,'reverse Tab never reached the configuration field');assert.equal(sim.writes.length,0);assert.equal(sim.globalWrites.length,0);
	const result={scope:'Staged Mac panel, simulated host, Chromium at189x800',observations,settingsWrites:0,globalSettingsWrites:0};
	if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();await sim.stop();}
