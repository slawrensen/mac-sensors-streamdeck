import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import sharp from 'sharp';
import {composeScenes,sampleReadings,sampleSnapshot,sampleGroups,PROVIDER_GROUPS,boardDefinitions,boardFooter} from '../../scripts/lib/mac-scenes';
import {DETAIL_PROFILES} from '../../src/detail/managed-profiles';
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const pngsIn=(dir:string)=>fs.readdirSync(dir).filter(file=>file.endsWith('.png')).sort();
test('documentation boards recompose from production code and fixed public sample inputs',()=>{
	const provenance=JSON.parse(fs.readFileSync('docs/assets/img/renderer-images.provenance.json','utf8')) as {version:string;readings:unknown;scenes:{id:string;svgSha256:string}[];assets:{file:string;sha256:string;sceneIds:string[]}[]};
	assert.equal(provenance.version,JSON.parse(fs.readFileSync('package.json','utf8')).version);assert.deepEqual(JSON.parse(JSON.stringify(sampleReadings)),provenance.readings);
	const scenes=composeScenes();assert.equal(scenes.length,provenance.scenes.length);
	for(const scene of scenes)assert.equal(hash(scene.svg),provenance.scenes.find(row=>row.id===scene.id)?.svgSha256,scene.id);
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
 const catalog=(JSON.parse(fs.readFileSync('native/hwmac/catalog.json','utf8')) as {rows:{key:string;label:string;group:string}[]}).rows,collectors=fs.readFileSync('native/hwmac/collectors.c','utf8');
 for(const reading of sampleReadings){
  const group=sampleGroups[reading.key]!,smc=/^mac:v1:smc:[^:]+:([0-9a-f]{8}):/.exec(reading.key);
  if(smc){const row=catalog.find(entry=>entry.key===Buffer.from(smc[1]!,'hex').toString('ascii'));assert.equal(row?.label,reading.label);assert.equal(row?.group,group,reading.label);}
  else{const name=reading.key.replace('mac:v1:system:','');assert.ok(collectors.includes(`"${name}", "${reading.label}", "${group}"`)||provider.includes(`'${name}','${reading.label}','${group}'`),reading.label+' in '+group);}
 }
 // MacProvider.rebuild(): one sensor per present group in GROUPS order, id from GROUPS, reading ids 0, readings by sensor then key.
 const snapshot=sampleSnapshot(),present=PROVIDER_GROUPS.filter(name=>Object.values(sampleGroups).includes(name));
 assert.deepEqual(snapshot.sensors,present.map((name,index)=>({index,id:groups[name],instance:0,name})));
 for(const reading of snapshot.readings){assert.equal(reading.id,0);assert.equal(snapshot.sensors[reading.sensorIndex]?.name,sampleGroups[reading.key]);}
 assert.deepEqual(snapshot.readings.map(row=>row.key),[...snapshot.readings].sort((a,b)=>a.sensorIndex-b.sensorIndex||a.key.localeCompare(b.key)).map(row=>row.key));
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
