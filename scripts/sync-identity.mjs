import fs from 'node:fs';
const identity=JSON.parse(fs.readFileSync('identity.json','utf8'));
const source=`/** Generated from identity.json. */\nexport const PLUGIN_UUID = '${identity.uuid}';\nexport const DEVELOPMENT_UUID = '${identity.devUuid}';\nexport const PLUGIN_NAME = '${identity.name}';\n`;
if(fs.readFileSync('src/mac/identity.ts','utf8')!==source)fs.writeFileSync('src/mac/identity.ts',source);
