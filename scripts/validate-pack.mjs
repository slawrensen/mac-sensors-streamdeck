import fs from 'node:fs';
import {validatePack} from './lib/pack-validation.mjs';
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version,record=JSON.parse(fs.readFileSync('build/native/build-record.json','utf8'));
const archive=process.argv[2]??'release/com.lawrensen.mac.streamDeckPlugin';
console.log(JSON.stringify(validatePack({archiveBytes:fs.readFileSync(archive),stagingDir:'build/plugin',packageVersion:version,sourceId:record.sourceId,extractTo:process.argv[3]}),null,2));
