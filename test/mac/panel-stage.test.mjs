import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { stagePanels } from '../../scripts/stage-panels.mjs';
test('staged panels use one build token, Mac guidance, no source or font setting control',()=>{
	const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mac-panel-stage-'));
	try {
		const token='0.9.90.0-mac1';const records=stagePanels(temp,token);assert.equal(records.length,12);
		for(const name of ['sensor-reading.html','sensor-dial.html']) {
			const text=fs.readFileSync(path.join(temp,name),'utf8');
			assert.doesNotMatch(text,/data-setting="(?:source|textFont)"/);assert.match(text,/data-setting="pollIntervalMs"/);assert.match(text,/Read every/);
			assert.doesNotMatch(text,/HWiNFO|Shared Memory|Gadget|Windows|Segoe UI/);
			for(const match of text.matchAll(/(?:href|src)="pi[^"?]+\?v=([^"]+)"/g))assert.equal(match[1],token);
		}
		const model={};model.self=model;vm.runInNewContext(fs.readFileSync(path.join(temp,'pi-model.js'),'utf8'),model);
		const globals={source:'gadget',textFont:'segoe-ui',future:{keep:true}};const before=structuredClone(globals);
		assert.match(model.hwModel.sharedDefaultsSummary(globals),/saved font kept/);assert.match(model.hwModel.connectionSummary(globals),/Mac sensors/);assert.deepEqual(globals,before);
	}finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('missing staging anchors fail before an output is packaged',()=>{
	const source='core-patches/panel-stage.json';const saved=fs.readFileSync(source);const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mac-panel-negative-'));
	try {
		const rules=JSON.parse(saved);rules.files['control.html'][0].before+='unmatched';fs.writeFileSync(source,JSON.stringify(rules));assert.throws(()=>stagePanels(temp,'0.9.90.0-mac1'),/anchor changed/);
	}finally{fs.writeFileSync(source,saved);fs.rmSync(temp,{recursive:true,force:true});}
});
