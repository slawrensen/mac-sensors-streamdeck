import './lib/script-failures.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {composeScenes} from './lib/mac-scenes.ts';
const output=process.argv[2]??'build/sample-faces.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({scope:'Production composition, fixed public sample data',scenes:composeScenes()},null,2)+'\n');
