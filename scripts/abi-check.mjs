// Load the same prebuilt bytes under each caller-provided Node runtime.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const folder=process.argv[2]??'build/native/production';
if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw new Error('ABI check requires a supported macOS process');
const architecture=process.arch==='x64'?'x86_64':'arm64',file=path.resolve(folder,`hwmac-${architecture}.node`);
const bytes=fs.readFileSync(file),native=createRequire(import.meta.url)(file),info=native.getBuildInfo();
assert.equal(info.arch,process.arch);assert.equal(info.protocol,1);assert.equal(info.napi,8);assert.equal(info.testHooks,false);
const session=native.open();let packets;
try{packets=await Promise.all([session.read('public'),session.read('smc')]);}finally{session.close();}
const result={node:process.version,nodeApi:process.versions.napi,architecture:process.arch,sha256:createHash('sha256').update(bytes).digest('hex'),build:info,sources:packets.map(packet=>({source:packet.source,model:packet.model,chip:packet.chip,appleSilicon:packet.appleSilicon,translated:packet.translated,translationError:packet.translationError,validRows:packet.rows.filter(row=>row.valid).length,error:packet.error}))};
if(!packets.some(packet=>packet.rows.some(row=>row.valid)))throw new Error('No live read succeeded in this ABI run');
console.log(JSON.stringify(result));
