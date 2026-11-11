import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import sharp from 'sharp';
import {composeScenes,composeStripScenes,stripDefinitions,STRIP_LOOKS,currentSnapshot,NAMED_NOW,sampleReadings,sampleSnapshot,sampleGroups,PROVIDER_GROUPS,boardDefinitions,boardFooter} from '../../scripts/lib/mac-scenes';
import {GLASS_OPACITY,TINT_OPACITY} from '../../src/ui/glass';
import {DETAIL_PROFILES} from '../../src/detail/managed-profiles';
import {statusScreen} from '../../src/mac/state-screens';
import {renderStatusKey} from '../../src/ui/key-renderer';
import type {PollerStatus} from '../../src/poller';
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
/**
 * Status faces whose second line changed in 1.1 after the boards were drawn, with the line the status board shows. The boards cannot be
 * redrawn until the private Qt adapter is measured again for the current app (the scene hashes pin what was drawn), and
 * docs/status-screens.md says which lines the image shows. Empty again once the boards are redrawn.
 */
const DRAWN_SECOND_LINE:Record<string,string>={'status-busy':'retrying','status-bridge-failed':'reinstall'};
type StripProvenance={renderer:{version:string};picture:{file:string;sha256:string;credit:string;license:string};alphaMeasuredAt:number[];scenes:{id:string;look:string;view:string;svgSha256:string;alpha:{clear:number;solid:number;panelAlpha:number|null;panelShare:number}}[];assets:{file:string;sha256:string;sceneIds:string[]}[]};
const ALPHA_OPAQUE=255;
test('the touch strip examples are today\'s faces, and each Background look is as see-through in the app\'s renderer as its name says',()=>{
	const provenance=JSON.parse(fs.readFileSync('docs/assets/img/strip-images.provenance.json','utf8')) as StripProvenance,scenes=composeStripScenes();
	// Six segments a strip: the five looks in panel order, then Tint on the three-row overview.
	assert.equal(scenes.length,stripDefinitions.length*(STRIP_LOOKS.length+1));
	assert.deepEqual(scenes.filter(scene=>scene.strip===stripDefinitions[0].id).map(scene=>[scene.look,scene.view]),[...STRIP_LOOKS.map(look=>[look,'single']),['tint','overview']]);
	assert.deepEqual(provenance.scenes.map(scene=>[scene.id,scene.svgSha256]),scenes.map(scene=>[scene.id,hash(scene.svg)]),'redraw with npm run docs:assets -- docs/assets/img strips');
	assert.deepEqual(provenance.alphaMeasuredAt,[200,100],'measured at the size of one dial segment');
	for(const {id,look,alpha} of provenance.scenes) {
		// Measured through QtSvg, so these are what the app composites over the strip picture, not what the SVG asks for.
		if(look==='theme')assert.deepEqual(alpha,{clear:0,solid:1,panelAlpha:null,panelShare:0},id+': Theme hides the picture everywhere');
		else if(look==='glass'||look==='tint'){
			assert.equal(alpha.panelAlpha,Math.round((look==='glass'?GLASS_OPACITY:TINT_OPACITY)*ALPHA_OPAQUE),id+': the panel has the opacity the source names');
			assert.equal(alpha.clear,0,id+': a panel covers the whole segment');assert.ok(alpha.panelShare>.5&&alpha.solid<.5,id+': most of the segment is panel, not ink');
		}else{assert.equal(alpha.panelAlpha,null,id+': no panel');assert.ok(alpha.clear>.6,id+': most of the segment shows the picture untouched');}
	}
	// Outline adds an edge to what Clear draws, so it covers more.
	const clearShare=(look:string)=>provenance.scenes.find(scene=>scene.look===look&&scene.view==='single')!.alpha.clear;
	assert.ok(clearShare('outline')<clearShare('clear'));
	const [asset]=provenance.assets;assert.equal(provenance.assets.length,1);
	assert.equal(hash(fs.readFileSync(path.join('docs/assets/img',asset!.file))),asset!.sha256);assert.deepEqual(asset!.sceneIds,scenes.map(scene=>scene.id));
	assert.equal(hash(fs.readFileSync(path.join('docs/assets/img',provenance.picture.file))),provenance.picture.sha256);
	// The picture is someone else's work under CC BY 4.0: the page that shows it must carry the credit the provenance records.
	const page=fs.readFileSync('docs/sensor-dial.md','utf8');
	assert.ok(page.includes('assets/img/'+asset!.file)&&page.includes(provenance.picture.credit)&&page.includes(provenance.picture.license),'credit and licence beside the image');
	// The page quotes the measured shares: they must be the recorded ones.
	const percent=(look:string)=>(clearShare(look)*100).toFixed(1)+'%';
	assert.ok(page.includes(`Outline leaves ${percent('outline')} of the segment fully clear, and Clear ${percent('clear')}.`));
});
const pngsIn=(dir:string)=>fs.readdirSync(dir).filter(file=>file.endsWith('.png')).sort();
test('documentation boards recompose from production code and fixed public sample inputs',()=>{
	const provenance=JSON.parse(fs.readFileSync('docs/assets/img/renderer-images.provenance.json','utf8')) as {version:string;readings:unknown;scenes:{id:string;svgSha256:string}[];assets:{file:string;sha256:string;sceneIds:string[]}[]};
	// The recorded version is the release that last drew the boards. The scene hashes below prove today's code composes the same SVGs,
	// so a version bump alone needs no redraw; the measured Qt adapter is private and tied to one app build.
	assert.match(provenance.version,/^\d+\.\d+\.\d+$/);assert.deepEqual(JSON.parse(JSON.stringify(sampleReadings)),provenance.readings);
	const scenes=composeScenes();assert.equal(scenes.length,provenance.scenes.length);
	for(const scene of scenes){
		const recorded=provenance.scenes.find(row=>row.id===scene.id)?.svgSha256,drawn=DRAWN_SECOND_LINE[scene.id];
		if(drawn===undefined){assert.equal(hash(scene.svg),recorded,scene.id);continue;}
		// A face whose second line changed after its board was drawn: today's face is the same face with only that line changed.
		const face=statusScreen({state:'unavailable',reason:scene.id.replace('status-',''),message:''} as PollerStatus)!;
		assert.equal(scene.svg,renderStatusKey(face),scene.id);assert.notEqual(face.lines[1],drawn,`${scene.id} matches its board again: drop it from DRAWN_SECOND_LINE`);
		assert.equal(hash(renderStatusKey({...face,lines:[face.lines[0]!,drawn]})),recorded,scene.id);
	}
	for(const asset of provenance.assets){assert.equal(hash(fs.readFileSync(path.join('docs/assets/img',asset.file))),asset.sha256,asset.file);assert.deepEqual(asset.sceneIds,boardDefinitions.find(board=>board.id+'.png'===asset.file)?.scenes);assert.equal(hash(fs.readFileSync(path.join('.github/readme',asset.file))),asset.sha256);}
	// Every board has a pinned image, and the README folder carries no image the provenance does not pin.
	assert.deepEqual(provenance.assets.map(asset=>asset.file).sort(),boardDefinitions.map(board=>board.id+'.png').sort());
	assert.deepEqual(pngsIn('.github/readme'),provenance.assets.map(asset=>asset.file).sort());
});

test('panel captures and marketing artwork retain their recorded sources',()=>{
	const record=JSON.parse(fs.readFileSync('docs/assets/img/panel-captures.provenance.json','utf8')) as {version:string;sourceSha256:Record<string,string>;captures:{file:string;sha256:string;build:string}[]};
	assert.equal(record.version,JSON.parse(fs.readFileSync('package.json','utf8')).version);
	for(const [file,digest] of Object.entries(record.sourceSha256))assert.equal(hash(fs.readFileSync(path.join('build/plugin',file))),digest,file);
	for(const capture of record.captures)assert.equal(hash(fs.readFileSync(path.join('docs/assets/img',capture.file))),capture.sha256);
	// No documentation image escapes pinning: each PNG is a board or a panel capture, never both.
	const boards=(JSON.parse(fs.readFileSync('docs/assets/img/renderer-images.provenance.json','utf8')) as {assets:{file:string}[]}).assets.map(asset=>asset.file);
	assert.deepEqual(pngsIn('docs/assets/img'),[...boards,...record.captures.map(capture=>capture.file)].sort());
	const marketing=JSON.parse(fs.readFileSync('marketing/provenance.json','utf8')) as {assets:{file:string;sha256:string;width:number;height:number;inputs:{file:string;sha256:string}[]}[]};
	for(const asset of marketing.assets){assert.equal(hash(fs.readFileSync(path.join('marketing',asset.file))),asset.sha256);assert.equal(asset.width,asset.file==='app-icon-288.png'?288:1920);assert.equal(asset.height,asset.file==='app-icon-288.png'?288:960);for(const input of asset.inputs)assert.equal(hash(fs.readFileSync(input.file)),input.sha256);}
	assert.deepEqual(pngsIn('marketing'),marketing.assets.map(asset=>asset.file).sort());
});


test('board text names the dial views as the panel does and says when faces show custom labels',()=>{
 // The View options in the shipped panel source, without the panel's parenthetical help.
 const panel=fs.readFileSync('com.lawrensen.mac.sdPlugin/ui/sensor-dial.html','utf8'),dials=boardDefinitions.find(board=>board.id==='dials')!;
 for(const value of ['single','tworow','overview']){const name=new RegExp(`<option value="${value}">([^<(]+)`).exec(panel)?.[1]?.trim();assert.ok(name&&dials.subtitle.includes(name),value+': '+name);}
 const scenes=composeScenes(),custom=(id:string)=>scenes.find(scene=>scene.id===id)!.customLabel;
 // Typed labels (CPU super 1, CPU activity, the opener on the Back tile) count; catalog labels and status faces do not.
 for(const id of ['reading-0','reading-4','layout-triple','back','dial-overview','detail-page-back'])assert.equal(custom(id),true,id);
 for(const id of ['reading-1','bar','ring','status-missing','detail-page-title','detail-page-tile-0'])assert.equal(custom(id),false,id);
 assert.match(boardFooter(boardDefinitions.find(board=>board.id==='key-layouts')!,scenes),/custom labels/);
 assert.doesNotMatch(boardFooter(boardDefinitions.find(board=>board.id==='status')!,scenes),/custom/);
});

test('individual dial colors change fills while preserving all geometry and words',()=>{
 const scenes=composeScenes(),plain=scenes.find(scene=>scene.id==='dial-overview')!,colored=scenes.find(scene=>scene.id==='dial-overview-colored')!;
 assert.notEqual(plain.svg,colored.svg);const withoutFills=(svg:string)=>svg.replace(/fill="#(?:[0-9a-f]{6}|[0-9a-f]{8})"/gi,'fill="COLOR"');assert.equal(withoutFills(plain.svg),withoutFills(colored.svg));
});

test('type accents recolor the reading faces and change nothing else',()=>{
 const scenes=composeScenes(),withoutColors=(svg:string)=>svg.replace(/#(?:[0-9a-f]{8}|[0-9a-f]{6})\b/gi,'COLOR');
 for(let index=0;index<sampleReadings.length;index++){const plain=scenes.find(scene=>scene.id==='reading-'+index)!,accented=scenes.find(scene=>scene.id==='accent-reading-'+index)!;assert.equal(withoutColors(plain.svg),withoutColors(accented.svg),'reading '+index);}
 // Startup volume available is SensorType.Other with a byte unit, so it has no type accent and keeps the theme accent.
 assert.notEqual(scenes.find(scene=>scene.id==='reading-0')!.svg,scenes.find(scene=>scene.id==='accent-reading-0')!.svg);assert.equal(scenes.find(scene=>scene.id==='reading-7')!.svg,scenes.find(scene=>scene.id==='accent-reading-7')!.svg);
});

test('the details board is the bundled 15-key detail page, cell for cell',()=>{
 const standard=DETAIL_PROFILES.find(profile=>profile.key==='standard')!,board=boardDefinitions.find(row=>row.id==='details')!;
 assert.equal(board.columns,standard.layout.columns);assert.equal(board.scenes.length,standard.layout.columns*standard.layout.rows);
 for(const [role,cell] of Object.entries(standard.layout.nav))if(cell!==null)assert.equal(board.scenes[cell.row*standard.layout.columns+cell.column],'detail-page-'+role);
 standard.layout.readings.forEach((cell,index)=>assert.equal(board.scenes[cell.row*standard.layout.columns+cell.column],'detail-page-tile-'+index));
 assert.ok(!boardDefinitions.some(row=>row.scenes.includes('status-access-denied')),'no Mac code path raises access-denied');
});

test('sample readings sit in the groups the shipped Mac provider reports, in its order',()=>{
 // The provider's GROUPS literal is private to src/mac/provider.ts, so the mirror is checked against its source text.
 const provider=fs.readFileSync('src/mac/provider.ts','utf8'),literal=/const GROUPS:Record<string,number>=\{([^}]*)\}/.exec(provider)?.[1];
 const groups=Object.fromEntries((literal??'').split(',').map(entry=>entry.split(':')).map(([name,id])=>[name!,Number(id)]));
 assert.deepEqual(Object.keys(groups).sort((a,b)=>groups[a]!-groups[b]!),[...PROVIDER_GROUPS]);
 const catalog=(JSON.parse(fs.readFileSync('native/hwmac/catalog.json','utf8')) as {rows:{key:string;label:string;group:string;variants?:string[]}[]}).rows,collectors=fs.readFileSync('native/hwmac/collectors.c','utf8');
 // A sample reading keeps the name its board shows (NAMED_NOW in scripts/lib/mac-scenes.ts maps it to today's name).
 for(const reading of sampleReadings){
  const group=sampleGroups[reading.key]!,smc=/^mac:v1:smc:[^:]+:([0-9a-f]{8}):/.exec(reading.key),label=NAMED_NOW[reading.label]??reading.label;
  // One key can carry another name on another chip; the sample readings are the measured M5 Pro's.
  if(smc){const row=catalog.find(entry=>entry.key===Buffer.from(smc[1]!,'hex').toString('ascii')&&(entry.variants===undefined||entry.variants.includes('pro')));assert.equal(row?.label,label);assert.equal(row?.group,group,label);}
  else{const name=reading.key.replace('mac:v1:system:','');assert.ok(collectors.includes(`"${name}", "${label}", "${group}"`)||provider.includes(`'${name}','${label}','${group}'`),label+' in '+group);}
 }
 // MacProvider.rebuild(): one sensor per present group in GROUPS order, id from GROUPS, reading ids 0, readings by sensor, then system
 // counters before SMC rows inside a group (test/mac/provider.test.ts pins the provider's own order).
 const snapshot=sampleSnapshot(),present=PROVIDER_GROUPS.filter(name=>Object.values(sampleGroups).includes(name));
 assert.deepEqual(snapshot.sensors,present.map((name,index)=>({index,id:groups[name],instance:0,name})));
 for(const reading of snapshot.readings){assert.equal(reading.id,0);assert.equal(snapshot.sensors[reading.sensorIndex]?.name,sampleGroups[reading.key]);}
 assert.deepEqual(snapshot.readings.map(row=>row.key.replace(/^mac:v1:(?:system:|smc:Mac17%2C9:)/,'')),['cpu-total','54703034:temp.v1','54673055:temp.v1','memory-active','disk-root-available','network-receive','46304163:rpm.v1','50535452:power.v1']);
 // The panel captures show the same snapshot under today's names: only labels differ, and each one is a name the provider gives.
 const current=currentSnapshot();assert.deepEqual(current.readings.map(row=>[row.key,row.value,row.sensorIndex]),snapshot.readings.map(row=>[row.key,row.value,row.sensorIndex]));
 for(const row of current.readings)assert.equal(row.label,NAMED_NOW[snapshot.byKey.get(row.key)!.label]??snapshot.byKey.get(row.key)!.label);
});

test('every 1920 by 960 listing image is fully opaque',async()=>{
 // A transparent pixel shows as a white crescent on a light listing page; the app icon keeps the package icon's own alpha.
 const marketing=JSON.parse(fs.readFileSync('marketing/provenance.json','utf8')) as {assets:{file:string;width:number}[]};
 for(const asset of marketing.assets.filter(row=>row.width===1920)){
  const pixels=await sharp(path.join('marketing',asset.file)).ensureAlpha().raw().toBuffer();
  let transparent=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]!<255)transparent++;
  assert.equal(transparent,0,asset.file);
 }
});

test('sample readings carry session statistics, and the stat-modes board shows each step of a press',()=>{
 for(const reading of sampleReadings){assert.equal(reading.statistics,'producer',reading.label);assert.ok(reading.valueMin<=reading.value&&reading.value<=reading.valueMax,reading.label);assert.ok(reading.valueMin<=reading.valueAvg&&reading.valueAvg<=reading.valueMax,reading.label);}
 const scenes=composeScenes(),words=(id:string)=>[...scenes.find(scene=>scene.id===id)!.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(match=>match[1]);
 const board=boardDefinitions.find(row=>row.id==='stat-modes')!;assert.deepEqual(board.scenes,['single','dual'].flatMap(layout=>['current','min','max','avg'].map(mode=>`stat-${layout}-${mode}`)));
 // The one-reading faces show the session value with its badge; the dual faces share one badge; nothing reads N/A.
 assert.deepEqual(words('stat-single-current'),['CPU super 1','62.4','°C']);
 for(const [mode,badge,value] of [['min','MIN','39.9'],['max','MAX','63.7'],['avg','AVG','51.3']] as const){assert.deepEqual(words('stat-single-'+mode),['CPU super 1',badge,value,'°C']);assert.ok(words('stat-dual-'+mode).includes(badge),mode);}
 for(const scene of scenes.filter(row=>row.id.startsWith('stat-')))assert.ok(!scene.svg.includes('N/A'),scene.id);
});
