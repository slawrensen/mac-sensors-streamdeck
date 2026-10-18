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
/** Stages the panels into a temporary folder and hands each test the staged text. */
function withStaged(check){
	const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mac-panel-stage-'));
	try {stagePanels(temp,'0.9.90.0-mac1');return check((name)=>fs.readFileSync(path.join(temp,name),'utf8'));}
	finally{fs.rmSync(temp,{recursive:true,force:true});}
}
/** Values JSON cannot carry are named in the shared fixture and rebuilt here. */
const SPECIAL={undefined:undefined,NaN:Number.NaN,Infinity:Number.POSITIVE_INFINITY,'-Infinity':Number.NEGATIVE_INFINITY};
test('staged Read every summaries follow the same case table as the Mac runtime parse',()=>withStaged((read)=>{
	const table=JSON.parse(fs.readFileSync(new URL('./fixtures/poll-interval-cases.json',import.meta.url),'utf8'));
	const text=read('pi-model.js');assert.match(text,/mirroring parsePollInterval\n\t \* \(src\/mac\/poller\.ts\)/);assert.doesNotMatch(text,/60_000/);
	const model={};model.self=model;vm.runInNewContext(text,model);
	assert.ok(table.cases.length>40);
	for(const entry of table.cases) {
		const raw=entry.special?SPECIAL[entry.special]:entry.raw;
		assert.equal(model.hwModel.pollIntervalOf(raw),entry.expected,entry.label);
		const globals=entry.special==='undefined'?{}:{pollIntervalMs:raw};const before=structuredClone(globals);
		const shown=entry.expected>=1000?`${entry.expected/1000} s`:`${entry.expected} ms`;
		assert.equal(model.hwModel.connectionSummary(globals),`Mac sensors · read every ${shown}`,entry.label);assert.deepEqual(globals,before,entry.label);
	}
}));
test('Read every has its own help directly under its select, and the select points to it',()=>withStaged((read)=>{
	for(const name of ['sensor-reading.html','sensor-dial.html']) {
		const text=read(name);
		assert.equal(text.split('aria-describedby="poll-help"').length-1,1,name);assert.equal(text.split('id="poll-help"').length-1,1,name);
		assert.match(text,/<select id="shared-poll"[^>]* aria-describedby="poll-help">/,name);
		const select=text.indexOf('id="shared-poll"'),help=text.indexOf('id="poll-help"'),source=text.indexOf('id="source-help"');
		assert.ok(select<help&&help<source,`${name}: the Read every help sits between its select and the availability help`);
		assert.match(text.slice(select,help),/<\/select>\s*<\/div>\s*<\/div>\s*<p class="hw-help" $/,`${name}: nothing between the select row and its help`);
		assert.match(text,/<p class="hw-help" id="poll-help">Every reading key and dial updates from one shared read at this interval\. Changing it clears sparkline history\.[^<]*<\/p>/,name);
	}
}));
test('the fixed text font line uses the field label style, not a bare paragraph',()=>withStaged((read)=>{
	for(const name of ['sensor-reading.html','sensor-dial.html']) {
		const text=read(name);
		assert.match(text,/<div class="hw-field"><div class="hw-label">Text font: Tahoma Bold<\/div><p class="hw-help" id="mac-font-status">Saved font settings are kept\.<\/p><\/div>/,name);
		assert.doesNotMatch(text,/<p>Text font/,name);
	}
	assert.match(read('pi.css'),/\.hw-field > label,\n\.hw-label \{/);
}));
test('panel status copy names this Mac as the source, never the plugin, and promises no restart',()=>withStaged((read)=>{
	const shell=read('pi-shell.js'),common=read('pi-common.js'),model=read('pi-model.js');
	assert.match(shell,/return \{ text: "No sensor data", tone: "danger" \};/);
	assert.match(common,/"Saved reading kept \(no sensor data to show it\)"/);
	assert.match(model,/return "Saved reading not found on this Mac";/);
	assert.match(shell,/"Readings appear under Reading once this Mac reports data\."/);
	assert.match(shell,/keeps the saved reading with its label and colors\. This Mac does not report it right now/);
	// Skipped rotation members and the two fallback lines name this Mac too.
	assert.match(common,/"the missing one is skipped until this Mac reports it again" : `the \$\{missing\} missing ones are skipped until this Mac reports them again`/);
	assert.match(common,/skipped until this Mac reports \$\{missing === 1 \? "it" : "them"\} again\.`;/);
	// The held dial and the empty picker show for every unavailable status, Tahoma missing included, where this Mac still reports readings: they name no cause.
	assert.match(common,/\? "Nothing moves the dial until readings return\."/);
	assert.match(common,/`No readings match "\$\{raw\.trim\(\)\}"\.` : "No readings to show right now\.";/);
	assert.doesNotMatch(common,/until this Mac reports readings|This Mac reports no readings/);
	assert.match(shell,/lines = \[p\.hint \|\| "Sensor data from this Mac is unavailable\."\];/);
	assert.match(shell,/lines = \["This Mac reports no readings right now\."\];/);
	for(const [name,text] of [['pi-shell.js',shell],['pi-common.js',common],['pi-model.js',model]])assert.doesNotMatch(text,/No Mac Sensors data|no Mac Sensors data|not found in Mac Sensors|once Mac Sensors publishes|Mac Sensors restarts|sensor source's current sensor list|Mac Sensors (?:publishes|lists|data returns|data is unavailable|is running but)/,name);
}));
test('missing staging anchors fail before an output is packaged',()=>{
	const source='core-patches/panel-stage.json';const saved=fs.readFileSync(source);const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mac-panel-negative-'));
	try {
		const rules=JSON.parse(saved);rules.files['control.html'][0].before+='unmatched';fs.writeFileSync(source,JSON.stringify(rules));assert.throws(()=>stagePanels(temp,'0.9.90.0-mac1'),/anchor changed/);
	}finally{fs.writeFileSync(source,saved);fs.rmSync(temp,{recursive:true,force:true});}
});
