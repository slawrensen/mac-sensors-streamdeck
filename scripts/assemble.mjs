import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {recordBuild} from './lib/build-evidence.mjs';
const destination='build/plugin';fs.mkdirSync(destination,{recursive:true});
for(const file of ['themes.json','layouts/sensor-dial.json']){const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join('com.lawrensen.mac.sdPlugin',file),target);}
for(const file of ['LICENSE','NOTICE.md'])fs.copyFileSync(file,path.join(destination,file));
for(const script of ['scripts/stage-manifest.ts','scripts/build-detail-profiles.ts'])execFileSync(process.execPath,['--import','tsx',script,destination],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/gen-icons.mjs'],{stdio:'inherit'});
recordBuild(destination);
