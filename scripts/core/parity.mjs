// Compare fixtures with an export of the pinned slawrensen/hwinfo-streamdeck source.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const root=process.cwd();const manifest=JSON.parse(fs.readFileSync('core-sync.json','utf8'));
const upstreamArg=process.argv.indexOf('--upstream');
const repo=upstreamArg<0?path.join(os.tmpdir(),`mac-sensors-core-${manifest.upstream.commit}`):path.resolve(process.argv[upstreamArg+1]);
if(!fs.existsSync(repo))execFileSync('git',['clone','--bare',`https://github.com/${manifest.upstream.repository}.git`,repo],{stdio:'inherit'});
const remote=execFileSync('git',['-C',repo,'remote','get-url','origin'],{encoding:'utf8'}).trim().replace(/\.git$/,'');
if(![`https://github.com/${manifest.upstream.repository}`,`git@github.com:${manifest.upstream.repository}`].includes(remote))throw new Error('Wrong parity source remote');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'mac-core-parity-')),output=path.join(root,'build/core-parity');fs.mkdirSync(output,{recursive:true});
try {
 const tar=execFileSync('git',['-C',repo,'archive',manifest.upstream.commit],{maxBuffer:64*1024*1024});
 execFileSync('tar',['-xf','-','-C',scratch],{input:tar});
 execFileSync('npm',['ci','--ignore-scripts'],{cwd:scratch,stdio:'inherit'});
 fs.mkdirSync(path.join(scratch,'scripts/core'),{recursive:true});fs.copyFileSync('scripts/core/render-dump.ts',path.join(scratch,'scripts/core/render-dump.ts'));
 const files={reference:path.join(output,'reference.json'),upstream:path.join(output,'upstream-values.json'),mac:path.join(output,'mac-values.json')};
 execFileSync(process.execPath,['--import','tsx','scripts/core/render-dump.ts',files.reference],{cwd:scratch,stdio:'inherit'});
 execFileSync(process.execPath,['--import','tsx','scripts/core/render-dump.ts',files.upstream],{cwd:root,stdio:'inherit'});
 execFileSync(process.execPath,['node_modules/tsx/dist/cli.mjs','--tsconfig','tsconfig.mac.json','scripts/core/render-dump.ts',files.mac],{cwd:root,stdio:'inherit'});
 const [reference,upstream,mac]=Object.values(files).map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
 if(JSON.stringify(Object.keys(reference))!==JSON.stringify(Object.keys(upstream))||JSON.stringify(Object.keys(reference))!==JSON.stringify(Object.keys(mac)))throw new Error('Fixture inventory differs');
 const normalize=(svg)=>svg.replaceAll('com.lawrensen.mac','com.lawrensen.hwinfo');
 const differences=Object.keys(reference).filter(key=>normalize(reference[key])!==normalize(upstream[key]));
 const macDifferences=Object.keys(reference).filter(key=>normalize(reference[key])!==normalize(mac[key]));
 const report={pin:manifest.upstream.commit,faces:Object.keys(reference).length,upstreamDifferences:differences,macDifferences,seams:['S2 platform text','S5 measured Mac font']};
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 if(differences.length)throw new Error(`${differences.length} upstream-valued render differences`);
 console.log(JSON.stringify({faces:report.faces,upstreamDifferences:0,macDifferences:macDifferences.length}));
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
