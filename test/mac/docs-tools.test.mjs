import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {summarizeSoak} from '../../scripts/lib/soak-analysis.mjs';
const root=process.cwd();
test('preview publication refuses a checkout without an authorized remote before any publication',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-preview-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));spawnSync('git',['init','--initial-branch','main'],{cwd:directory});const result=spawnSync(process.execPath,[path.join(root,'scripts/docs-preview-publish.mjs'),'main'],{cwd:directory,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/Unexpected repository/);
});
test('a performance report refuses an unfinished soak instead of fabricating results',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-report-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const result=spawnSync(process.execPath,['scripts/perf-report.mjs',directory,'a'.repeat(64),'123'],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/summary.json/);
});
test('completed soak reports preserve restarts, all samples, failures and private boundaries',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-report-complete-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const start=Date.UTC(2026,0,1),rows=Array.from({length:1441},(_,i)=>({type:'sample',at:new Date(start+i*60000).toISOString(),continuousMs:i*60000,identity:i<60?'private-process-1':'private-process-2',restarted:i===60,flags:[],logs:{warn:0,error:0},freshness:{valid:true},metrics:{continuousMs:i*60000,rssBytes:100*1048576,footprintBytes:80*1048576,fileDescriptors:49,threads:12,cpuUserNs:i*1000000,cpuSystemNs:i*1000000,idleWakeups:i,interruptWakeups:i}}));
 const state={startedAt:rows[0].at,hours:24,intervalMs:60000,files:{'bin/plugin.js':'b'.repeat(64)},directory:'/Users/private/example'};
 const write=()=>{fs.writeFileSync(path.join(directory,'state.json'),JSON.stringify(state));fs.writeFileSync(path.join(directory,'observations.jsonl'),rows.map(row=>JSON.stringify(row)).join('\n'));const summary={...summarizeSoak(rows),stoppedEarly:false,events:[],newDiagnosticReports:[],crashScanErrors:[],crashReview:'No new reports'};fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(summary));return summary;};
 write();const csv=path.join(directory,'samples.csv'),args=['scripts/perf-report.mjs',directory,'a'.repeat(64),'123'];
 const result=spawnSync(process.execPath,[...args,'--csv',csv],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Resource\/freshness gate \| PASS/);assert.match(result.stdout,/Observed process identity changes \| 1/);assert.match(result.stdout,/49 \/ 49 \/ 49/);assert.match(result.stdout,/100.00 MiB \/ 100.00 MiB/);assert.doesNotMatch(result.stdout,/private-process|\/Users\/private/);
 const output=fs.readFileSync(csv,'utf8');assert.equal(output.trim().split('\n').length,1442);assert.doesNotMatch(output,/private-process|\/Users\/private/);const repeated=spawnSync(process.execPath,[...args,'--csv',csv],{encoding:'utf8'});assert.notEqual(repeated.status,0);assert.equal(fs.readFileSync(csv,'utf8'),output);
 rows[90].logs.warn=2;rows[90].flags.push({kind:'plugin-log',explained:false,detail:{warn:2,error:0}});const failed=write();const failure=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(failure.status,0,failure.stderr);assert.match(failure.stdout,/WARN \/ ERROR lines \| 2 \/ 0/);assert.match(failure.stdout,/Resource\/freshness gate \| NOT PASSED/);
 failed.samples--;fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(failed));const mismatch=spawnSync(process.execPath,args,{encoding:'utf8'});assert.notEqual(mismatch.status,0);assert.match(mismatch.stderr,/summary differs/);
});
test('docs screenshot command refuses a missing site URL before a browser is launched',()=>{
 const result=spawnSync(process.execPath,['scripts/docs-site-shots.mjs'],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/Usage:/);
});

test('renderer output errors remain failures despite the SDK exception listener',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-renderer-failure-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const blocker=path.join(directory,'file');fs.writeFileSync(blocker,'owned fixture');
 const result=spawnSync(process.execPath,['--import','tsx','scripts/dump-keys.mjs',path.join(blocker,'out.json')],{encoding:'utf8',env:{...process.env,TSX_TSCONFIG_PATH:'tsconfig.mac.json'}});assert.equal(result.status,1);assert.match(result.stderr,/EEXIST|ENOTDIR/);
});

test('owner photo preparation preserves the input and measures supplied color patches',async t=>{
 const sharp=(await import('sharp')).default,directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-photo-fixture-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const original=path.join(directory,'original.png'),output=path.join(directory,'prepared.png'),regions=path.join(directory,'regions.json');const pixels=Buffer.alloc(32*16*3);
 for(let y=0;y<16;y++)for(let x=0;x<32;x++){const color=x<16?[232,148,13]:[203,33,20];for(let channel=0;channel<3;channel++)pixels[(y*32+x)*3+channel]=color[channel];}
 await sharp(pixels,{raw:{width:32,height:16,channels:3}}).png().toFile(original);const before=fs.readFileSync(original);fs.writeFileSync(regions,JSON.stringify({warn:{left:1,top:1,width:10,height:10},crit:{left:17,top:1,width:10,height:10}}));
 const result=spawnSync(process.execPath,['scripts/prepare-hardware-photo.mjs',original,output,'Synthetic test fixture only',regions],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.deepEqual(fs.readFileSync(original),before);
 const meta=await sharp(output).metadata(),report=JSON.parse(fs.readFileSync(output+'.json'));assert.equal(meta.width,1920);assert.equal(meta.height,960);assert.equal(meta.exif,undefined);assert.ok(report.measurements.every(row=>row.absoluteDifference.every(value=>value===0)&&row.clippedPixelFraction===0));
 const repeated=spawnSync(process.execPath,['scripts/prepare-hardware-photo.mjs',original,output],{encoding:'utf8'});assert.notEqual(repeated.status,0);assert.deepEqual(fs.readFileSync(original),before);
});

test('docs screenshots refuse a malformed extra viewport before a browser is launched',()=>{
 const result=spawnSync(process.execPath,['scripts/docs-site-shots.mjs',os.tmpdir(),'http://127.0.0.1:9/docs/'],{encoding:'utf8',env:{...process.env,DOCS_SHOTS_VIEWPORTS:'390x844,wide'}});assert.notEqual(result.status,0);assert.match(result.stderr,/DOCS_SHOTS_VIEWPORTS/);
});

test('the docs brand mark is the shipped plugin icon, byte for byte, and the favicon sizes are pinned resizes of it',()=>{
 assert.deepEqual(fs.readFileSync('docs/assets/img/brand/mac-sensors-icon-256.png'),fs.readFileSync('com.lawrensen.mac.sdPlugin/imgs/plugin/marketplace.png'));
 // docs-crops.test.mjs recomputes each derived size from the shipped icon.
 const derived=JSON.parse(fs.readFileSync('docs/assets/img/crops/provenance.json','utf8')).images.filter(image=>image.file.startsWith('brand/'));
 assert.ok(derived.every(image=>image.source.file.startsWith('com.lawrensen.mac.sdPlugin/imgs/plugin/marketplace')),'favicon sizes come from the shipped icon');
 assert.deepEqual(fs.readdirSync('docs/assets/img/brand').sort(),['mac-sensors-icon-256.png',...derived.map(image=>image.file.slice('brand/'.length))].sort(),'no unpinned brand image is published');
 const head=fs.readFileSync('docs/_includes/head_custom.html','utf8');for(const size of [16,32,180])assert.match(head,new RegExp(`mac-sensors-icon-${size}\\.png`));
});

test('the shared docs frontend keeps the theme license, names no sibling product and links the public repository',()=>{
 assert.match(fs.readFileSync('docs/assets/js/just-the-docs.LICENSE.txt','utf8'),/MIT License[\s\S]*Patrick Marsceill/);
 assert.match(fs.readFileSync('docs/assets/js/just-the-docs.js','utf8'),/^---\nlayout: null\n---\n\/\/ Just the Docs v0\.10\.1/);
 for(const file of ['docs/assets/css/docs.css','docs/assets/js/docs.js','docs/assets/js/just-the-docs.js',...fs.readdirSync('docs/_includes/components').map(name=>'docs/_includes/components/'+name),'docs/_layouts/default.html','docs/_includes/head_custom.html','docs/_config.yml']){
  const text=fs.readFileSync(file,'utf8');assert.doesNotMatch(text,/HWiNFO|REALiX|—/,file);assert.doesNotMatch(text,/github\.com[/:]slawrensen\/mac-streamdeck-private/i,file);
 }
 const config=fs.readFileSync('docs/_config.yml','utf8');
 assert.match(config,/^gh_edit_repository: https:\/\/github\.com\/slawrensen\/mac-sensors-streamdeck$/m,'header and edit links point at the public product repository');
 assert.match(config,/^bug_reports: https:\/\/github\.com\/slawrensen\/mac-sensors-streamdeck\/issues$/m,'bug reports go to the product repository');
});

test('the docs source validator rejects broken Liquid links, kindless figure captions and a body h1',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-docs-validate-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 fs.cpSync('docs',path.join(directory,'docs'),{recursive:true,filter:source=>!source.includes(path.join('docs','release'))});
 const run=()=>spawnSync(process.execPath,[path.join(root,'scripts/validate-docs.mjs')],{cwd:directory,encoding:'utf8'});
 assert.equal(run().status,0,run().stderr);
 const home=path.join(directory,'docs/index.md'),original=fs.readFileSync(home,'utf8');
 fs.writeFileSync(home,original.replace("{{ '/getting-started.html' | relative_url }}","{{ '/getting-startd.html' | relative_url }}").replace('<figcaption>Settings-panel capture.</figcaption>','<figcaption>The Sensor Control panel.</figcaption>'));
 const broken=run();assert.notEqual(broken.status,0);assert.match(broken.stderr,/index\.md: missing \{\{ '\/getting-startd\.html' \| relative_url \}\}/);assert.match(broken.stderr,/figure caption lacks kind/);
 fs.writeFileSync(home,original);const faq=path.join(directory,'docs/faq.md');fs.writeFileSync(faq,fs.readFileSync(faq,'utf8').replace('\n---\n\n','\n---\n\n# FAQ and privacy\n\n'));
 assert.match(run().stderr,/faq\.md: the layout renders the page title/);
});
