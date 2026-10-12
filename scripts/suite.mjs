import './lib/script-failures.mjs';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const modes=['core','resilience','native-edge','drilldown','socket-close'];
const results=[];
for(const mode of modes){const result=spawnSync(process.execPath,['scripts/e2e.mjs',mode],{stdio:'inherit',env:process.env});results.push({mode,passed:result.status===0});if(result.status!==0)break;}
fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/suite.json',JSON.stringify({scope:'Built bundles, mock host and isolated fake addon',results},null,2)+'\n');if(results.length!==modes.length||results.some(result=>!result.passed))process.exitCode=1;
