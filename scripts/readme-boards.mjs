// The README uses the same verified production-renderer boards as the docs.
import fs from 'node:fs';
import path from 'node:path';
const target=process.argv[2]??'.github/readme';fs.mkdirSync(target,{recursive:true});
for(const name of ['hero','key-layouts','details','dials','themes','alerts','status','reading-colors'])fs.copyFileSync(path.join('docs/assets/img',name+'.png'),path.join(target,name+'.png'));
fs.copyFileSync('docs/assets/img/renderer-images.provenance.json',path.join(target,'renderer-images.provenance.json'));
