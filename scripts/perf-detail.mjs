// Pure production-composition benchmark with public sample data; no sensor provider.
import './lib/script-failures.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {composeScenes} from './lib/mac-scenes.ts';
const output=process.argv[2]??'build/renderer-perf.json',count=Number(process.argv[3]??1000);
if(!Number.isInteger(count)||count<10||count>10000)throw new Error('Expected10to10000iterations');
for(let i=0;i<20;i++)composeScenes();const cpu=process.cpuUsage(),times=[];let faces=0,bytes=0;
for(let i=0;i<count;i++){const start=performance.now(),scenes=composeScenes();times.push(performance.now()-start);faces+=scenes.length;bytes+=scenes.reduce((sum,row)=>sum+Buffer.byteLength(row.svg),0);}
times.sort((a,b)=>a-b);const used=process.cpuUsage(cpu);const report={scope:'Pure production key/dial/detail/status composition with fixed public sample data; not app, device or native-read cost',iterations:count,faces,svgBytes:bytes,p50Ms:times[Math.floor(count*.5)],p99Ms:times[Math.ceil(count*.99)-1],cpuSeconds:(used.user+used.system)/1e6,node:process.version};fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
