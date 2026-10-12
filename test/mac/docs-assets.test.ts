import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {composeScenes,sampleReadings,boardDefinitions} from '../../scripts/lib/mac-scenes';
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
test('documentation boards recompose from production code and fixed public sample inputs',()=>{
	const provenance=JSON.parse(fs.readFileSync('docs/assets/img/renderer-images.provenance.json','utf8')) as {version:string;readings:unknown;scenes:{id:string;svgSha256:string}[];assets:{file:string;sha256:string;sceneIds:string[]}[]};
	assert.equal(provenance.version,JSON.parse(fs.readFileSync('package.json','utf8')).version);assert.deepEqual(JSON.parse(JSON.stringify(sampleReadings)),provenance.readings);
	const scenes=composeScenes();assert.equal(scenes.length,provenance.scenes.length);
	for(const scene of scenes)assert.equal(hash(scene.svg),provenance.scenes.find(row=>row.id===scene.id)?.svgSha256,scene.id);
	for(const asset of provenance.assets){assert.equal(hash(fs.readFileSync(path.join('docs/assets/img',asset.file))),asset.sha256,asset.file);assert.deepEqual(asset.sceneIds,boardDefinitions.find(board=>board.id+'.png'===asset.file)?.scenes);assert.equal(hash(fs.readFileSync(path.join('.github/readme',asset.file))),asset.sha256);}
});

test('panel captures and marketing artwork retain their recorded sources',()=>{
	const record=JSON.parse(fs.readFileSync('docs/assets/img/panel-captures.provenance.json','utf8')) as {version:string;sourceSha256:Record<string,string>;captures:{file:string;sha256:string;build:string}[]};
	assert.equal(record.version,JSON.parse(fs.readFileSync('package.json','utf8')).version);
	for(const [file,digest] of Object.entries(record.sourceSha256))assert.equal(hash(fs.readFileSync(path.join('build/plugin',file))),digest,file);
	for(const capture of record.captures)assert.equal(hash(fs.readFileSync(path.join('docs/assets/img',capture.file))),capture.sha256);
	const marketing=JSON.parse(fs.readFileSync('marketing/provenance.json','utf8')) as {assets:{file:string;sha256:string;width:number;height:number;inputs:{file:string;sha256:string}[]}[]};
	for(const asset of marketing.assets){assert.equal(hash(fs.readFileSync(path.join('marketing',asset.file))),asset.sha256);assert.equal(asset.width,asset.file==='app-icon-288.png'?288:1920);assert.equal(asset.height,asset.file==='app-icon-288.png'?288:960);for(const input of asset.inputs)assert.equal(hash(fs.readFileSync(input.file)),input.sha256);}
});
