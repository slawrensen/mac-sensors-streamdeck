// Mac counterparts of the pinned slawrensen/hwinfo-streamdeck protocol, resilience, native-edge, drill-down and socket-close harnesses.
import './lib/script-failures.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {startMock,sleep,until} from './lib/mock-host.mjs';
import {profileCells} from './lib/profile-cells.mjs';
const mode=process.argv[2]??'core',output=process.argv[3]??`build/e2e-${mode}.json`;
const temperature='mac:v1:smc:Mac17%2C9:54423154:temp.v1',memory='mac:v1:system:memory-total';
const records=[];
const hasValue=(svg,value)=>new RegExp('>\\s*'+value+'(?:\\.0+)?\\s*<').test(svg??'');
async function withHost(run,options){const host=await startMock(options);try{await run(host);records.push({bundleSha256:host.hash,frames:host.messages.filter(message=>['setImage','setFeedback'].includes(message.event)).length,passed:true});}catch(error){fs.mkdirSync('build',{recursive:true});fs.writeFileSync(`build/e2e-${mode}-failure.json`,JSON.stringify({messages:host.messages.slice(-100),output:host.output},null,2));throw error;}finally{await host.stop();}}
if(mode==='core')await withHost(async host=>{
	host.appear('key','reading',{readingKey:temperature,displayMode:'sparkline',future:{keep:true}});host.appear('dial','dial',{readingKey:temperature,rotationKeys:[temperature,memory],future:{keep:true}});
	await until(()=>hasValue(host.svg('key'),30)&&hasValue(host.svg('dial'),30));
	host.pi('key');host.request('key',{event:'getSensorTree'});host.request('key',{event:'getPreview'});await until(()=>host.messages.some(message=>message.payload?.event==='sensorTree'));
	assert.ok(host.messages.find(message=>message.payload?.event==='sensorTree').payload.groups.flatMap(group=>group.readings).some(reading=>reading.key===temperature));
	assert.equal(host.messages.filter(message=>message.event==='setSettings').length,0,'opening panel wrote settings');
	host.event('key','keyDown');host.event('key','keyUp');await until(()=>host.svg('key')?.includes('N/A'));
	host.event('dial','dialRotate',{ticks:1,pressed:false});await until(()=>host.messages.some(message=>message.event==='setSettings'&&message.context==='dial'));
	const writes=host.messages.filter(message=>message.event==='setSettings'&&message.context==='dial');assert.equal(writes.length,1);assert.equal(writes[0].payload.readingKey,memory);assert.deepEqual(writes[0].payload.future,{keep:true});
	for(let index=1;index<6;index++)host.appear('dial'+index,'dial',{readingKey:temperature,rotationKeys:[temperature,memory]},index);
	await until(()=>[1,2,3,4,5].every(index=>hasValue(host.svg('dial'+index),30)));
	const before=host.messages.filter(message=>message.event==='setSettings').length;host.event('dial3','dialRotate',{ticks:1,pressed:false});await until(()=>host.messages.filter(message=>message.event==='setSettings').length>before);
	assert.ok(host.messages.filter(message=>message.event==='setSettings').slice(before).every(message=>message.context==='dial3'));
	host.appear('control','control',{command:'resetStats',target:''});await sleep(100);host.event('control','keyDown');host.event('control','keyUp');await until(()=>host.svg('control')?.includes('cx="59"'));
	const keyWritesBefore=host.messages.filter(message=>message.event==='setSettings'&&message.context==='key').length;host.settings('key',{readingKey:'old:windows:key',future:{keep:true}});await until(()=>host.svg('key')?.includes('Sensor missing'));assert.equal(host.messages.filter(message=>message.event==='setSettings'&&message.context==='key').length,keyWritesBefore);
	host.request('key',{event:'getSupportReport',requestId:'report'});await until(()=>host.messages.some(message=>message.payload?.event==='supportReport'));
	const report=JSON.stringify(host.messages.find(message=>message.payload?.event==='supportReport').payload);assert.doesNotMatch(report,/\/Users\/|serialNumber|hardwareUUID|HWINFO_|HWiNFO/);
});
else if(mode==='resilience')await withHost(async host=>{
	host.appear('temperature','reading',{readingKey:temperature});host.appear('memory','reading',{readingKey:memory});await until(()=>hasValue(host.svg('temperature'),30));
	host.setFixture({smc:{fault:5}});await until(()=>host.svg('temperature')?.includes('Sensor missing'));assert.ok(!host.svg('memory')?.includes('Source error'));
	host.setFixture({smc:{fault:0,value:0}});await until(()=>hasValue(host.svg('temperature'),0));
	host.setFixture({public:{fault:4}});await until(()=>host.svg('temperature')?.includes('data:image/png;base64'));
	host.setFixture({public:{fault:0},smc:{fault:0,value:35}});await until(()=>hasValue(host.svg('temperature'),35));
	host.setFixture({hold:['smc'],smc:{value:35}});await sleep(16_000);assert.ok(host.svg('temperature')?.includes('Sensor missing'));assert.ok(!host.svg('memory')?.includes('No sensor data'));
	host.setFixture({smc:{value:40}});await until(()=>hasValue(host.svg('temperature'),40));
	host.event('temperature','willDisappear');host.event('memory','willDisappear');await sleep(300);host.appear('temperature-return','reading',{readingKey:temperature});await until(()=>hasValue(host.svg('temperature-return'),40));
});
else if(mode==='socket-close')await withHost(async host=>{
	host.appear('key','reading',{readingKey:temperature});await until(()=>hasValue(host.svg('key'),30));host.closeSocket();await until(()=>host.exit()!==undefined,5000);assert.equal(host.exit().code,0);
});
else if(mode==='native-edge') {
	for(const damage of ['missing','protocol','hash']) {
		const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'mac-edge-'));fs.cpSync(process.env.MACSENSORS_PLUGIN_DIR??'build/plugin',scratch,{recursive:true});
		try {
			const architecture=process.arch==='x64'?'x86_64':'arm64',name=`hwmac-${architecture}.node`,target=path.join(scratch,'bin',name);
			if(damage==='missing')fs.unlinkSync(target);
			else if(damage==='protocol'){fs.copyFileSync(path.join('build/native/wrong-protocol',name),target);const hashes=JSON.parse(fs.readFileSync(path.join(scratch,'bin/native-artifacts.json')));hashes[architecture]=createHash('sha256').update(fs.readFileSync(target)).digest('hex');fs.writeFileSync(path.join(scratch,'bin/native-artifacts.json'),JSON.stringify(hashes));}
			else fs.appendFileSync(target,'bad');
			await withHost(async host=>{host.appear('key','reading',{readingKey:temperature});await until(()=>host.svg('key')?.includes('Bridge failed'));assert.ok(!host.svg('key')?.includes('>30<'));},{directory:scratch});
		}finally{fs.rmSync(scratch,{recursive:true,force:true});}
	}
}
else if(mode==='drilldown')await withHost(async host=>{
	const settings={readingKey:temperature,pressBehavior:'open-details'};host.appear('opener','reading',settings);await until(()=>hasValue(host.svg('opener'),30));
	host.event('opener','keyDown');host.event('opener','keyUp');await until(()=>host.messages.some(message=>message.event==='switchToProfile'));
	const switched=host.messages.find(message=>message.event==='switchToProfile');assert.equal(switched.payload.profile,'profiles/detail-r3-standard');
	host.event('opener','willDisappear');const cells=profileCells(host.root,switched.payload.profile);let back;
		records.push({profile:switched.payload.profile,cells:cells.length,archiveLoaded:true});
	// Drive the real archive's Back action; saved role alone must route Back.
	back=cells.find(cell=>cell.settings?.detailRole==='back'||cell.Settings?.detailRole==='back');assert.ok(back,'archive has no configurable Back tile');
	host.appear('back','reading',{detailRole:'back'});host.event('back','keyDown');host.event('back','keyUp');await until(()=>host.messages.filter(message=>message.event==='switchToProfile').length>=2);
	assert.equal(host.messages.filter(message=>message.event==='switchToProfile').at(-1).payload.profile,undefined);
});
else throw new Error('Unknown e2e mode '+mode);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({mode,scope:'Mock Stream Deck host, built bundle and isolated fake addon',records},null,2)+'\n');console.log(JSON.stringify({mode,passed:true,runs:records.length}));
