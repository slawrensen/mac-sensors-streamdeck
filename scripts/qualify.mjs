// Ported qualification stages from slawrensen/hwinfo-streamdeck scripts/qualify.mjs at 11b9645b78395f157493648d873a3066673ba493.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validatePack} from './lib/pack-validation.mjs';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
for(let i=0;i<args.length;i++){if(args[i]==='--list')continue;if(!['--stages','--out'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Invalid qualification arguments');i++;}
const order=['prerequisites','core','lint','typecheck','build:native','build','unit','native','pack','archive','abi','recovery','native-gate','cli-validate','copy','tree'];
if(args.includes('--list')){console.log(order.join('\n'));process.exit(0);}
const selected=new Set((option('--stages')??order.join(',')).split(','));if([...selected].some(stage=>!order.includes(stage)))throw new Error('Unknown qualification stage');
const root=process.cwd(),out=path.resolve(option('--out')??'release/qualification'),extracted=path.join(out,'extracted');fs.mkdirSync(out,{recursive:true});
const git=(...values)=>execFileSync('git',values,{encoding:'utf8'}).trim();
const fingerprint=()=>Object.fromEntries(execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard']).toString().split('\0').filter(Boolean).sort().map(file=>[file,fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null]));
const beforeInputs=fingerprint();
const before=git('status','--porcelain'),sourceSha=git('rev-parse','HEAD'),startedAt=new Date().toISOString(),results=[];
const upstream=process.env.MACSENSORS_UPSTREAM_DIR??process.env.MACSENSORS_UPSTREAM;
const run=(command,values,env={})=>{const result=spawnSync(command,values,{cwd:root,encoding:'utf8',env:{...process.env,PATH:path.dirname(process.execPath)+path.delimiter+(process.env.PATH??''),...env},maxBuffer:64*1024*1024});return {ok:result.status===0,output:(result.stdout??'')+(result.stderr??'')+(result.error?String(result.error):'')};};
const node=(script,...values)=>run(process.execPath,[script,...values]);
const many=commands=>{let output='';for(const [command,...values] of commands){const result=run(command,values);output+=result.output;if(!result.ok)return {ok:false,output};}return {ok:true,output};};
for(const stage of order) {
	if(!selected.has(stage)){results.push({stage,status:'SKIPPED'});continue;}
	const at=Date.now();let result;
	try {
		switch(stage) {
			case 'prerequisites':if(process.platform!=='darwin'||Number(process.versions.node.split('.')[0])<24)throw new Error('Requires macOS and Node24 or later');result=many([['xcrun','--find','clang'],['xcrun','--sdk','macosx','--show-sdk-version'],['node_modules/.bin/streamdeck','-v']]);if(result.ok&&!result.output.includes('1.7.4'))throw new Error('Elgato CLI must be1.7.4');break;
			case 'core':result=many([[process.execPath,'scripts/core/sync.mjs','check',...(upstream?['--upstream',upstream]:[])],[process.execPath,'scripts/core/parity.mjs',...(upstream?['--upstream',upstream]:[])]]);break;
			case 'lint':case 'typecheck':case 'build:native':case 'build':result=run('npm',['run',stage]);break;
			case 'unit':result=many([[process.execPath,'scripts/build-observer.mjs'],[process.execPath,'--test','test/mac/soak.test.mjs'],['npm','test'],['npm','run','test:mac'],[process.execPath,'--test','test/mac/core-sync.test.mjs','test/mac/panel-stage.test.mjs','test/mac/process-ownership.test.mjs','test/mac/release-gates.test.mjs','test/mac/load-metrics.test.mjs']]);break;
			case 'native':result=run('npm',['run','test:native']);break;
			case 'pack':result=node('scripts/pack.mjs');break;
			case 'archive':{if(fs.existsSync(extracted))throw new Error('Use a fresh qualification output directory');const record=JSON.parse(fs.readFileSync('build/native/build-record.json'));const pkg=JSON.parse(fs.readFileSync('package.json'));const report=validatePack({archiveBytes:fs.readFileSync('release/com.lawrensen.mac.streamDeckPlugin'),stagingDir:'build/plugin',packageVersion:pkg.version,sourceId:record.sourceId,extractTo:extracted});const rejection=node('test/mac/pack.test.mjs');result={ok:rejection.ok,output:JSON.stringify(report)+'\n'+rejection.output};break;}
			case 'abi':result=node('scripts/abi-check.mjs',path.join(extracted,'bin'));break;
			case 'recovery':result=run(process.execPath,['scripts/e2e.mjs','native-edge'],{MACSENSORS_PLUGIN_DIR:extracted});break;
			case 'native-gate':result=node('scripts/validate-native.mjs',path.join(extracted,'bin'),'--bin');break;
			case 'cli-validate':{const directory=path.join(out,'com.lawrensen.mac.sdPlugin');fs.cpSync(extracted,directory,{recursive:true});result=run('node_modules/.bin/streamdeck',['validate',directory,'--no-update-check']);if(/warning\s|\b[1-9]\d* problems?\b/i.test(result.output))result.ok=false;break;}
			case 'copy':result=node('scripts/validate-release-copy.mjs');break;
			case 'tree':result={ok:before===git('status','--porcelain')&&JSON.stringify(beforeInputs)===JSON.stringify(fingerprint()),output:'Tracked and unignored source bytes must remain identical.\n'+git('status','--porcelain')};break;
		}
	}catch(error){result={ok:false,output:String(error)};}
	fs.writeFileSync(path.join(out,stage.replaceAll(':','-')+'.log'),result.output);results.push({stage,status:result.ok?'PASS':'FAIL',elapsedMs:Date.now()-at});console.log(stage+': '+(result.ok?'PASS':'FAIL'));
	if(!result.ok)break;
}
for(const stage of order)if(!results.some(result=>result.stage===stage))results.push({stage,status:'SKIPPED'});
const complete=results.filter(result=>result.status==='PASS').length===selected.size;
const artifact=fs.existsSync('release/com.lawrensen.mac.streamDeckPlugin')?createHash('sha256').update(fs.readFileSync('release/com.lawrensen.mac.streamDeckPlugin')).digest('hex'):null;
fs.writeFileSync(path.join(out,'record.json'),JSON.stringify({sourceSha,startedAt,finishedAt:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,selected:[...selected],results,artifactSha256:artifact,sourceInputs:beforeInputs,passed:complete,scope:'Software qualification; physical/device/soak evidence is separate'},null,2)+'\n');if(!complete)process.exitCode=1;
