// Isolated fake-addon bundle for the mock host. Never installed in the real app.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {recordBuild} from './lib/build-evidence.mjs';
const target='build/test-plugin';fs.cpSync('build/plugin',target,{recursive:true});
const hashes={};
for(const architecture of ['arm64','x86_64']){const file=`hwmac-${architecture}.node`,bytes=fs.readFileSync(path.join('build/native/test',file));hashes[architecture]=createHash('sha256').update(bytes).digest('hex');const destination=path.join(target,'bin',file);fs.writeFileSync(destination+'.next',bytes);fs.renameSync(destination+'.next',destination);}
fs.writeFileSync(path.join(target,'bin/native-artifacts.json'),JSON.stringify(hashes)+'\n');
execFileSync(path.resolve('node_modules/.bin/rollup'),['-c'],{stdio:'inherit',env:{...process.env,MACSENSORS_TEST_BUILD:'1'}});
if(!fs.readFileSync(path.join(target,'bin/plugin.js'),'utf8').includes('__MAC_SENSORS_TEST_BUILD__'))throw new Error('Missing test bundle marker');
recordBuild(target,true);
