import fs from 'node:fs';
const current=JSON.parse(fs.readFileSync(process.argv[2]??'build/native-manifest.json','utf8'));
if(!process.argv[3]){console.log('No previous native manifest; this release establishes the baseline');process.exit(0);}
const previous=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const moved=current.entries.filter(entry=>previous.entries.find(old=>old.architecture===entry.architecture)?.sha256!==entry.sha256).map(entry=>entry.architecture);
const sourceChanged=current.sourceId!==previous.sourceId,toolchainChanged=current.compiler!==previous.compiler||current.sdk!==previous.sdk;
console.log(JSON.stringify({moved,sourceChanged,toolchainChanged,current:{compiler:current.compiler,sdk:current.sdk},previous:{compiler:previous.compiler,sdk:previous.sdk}}));
if(moved.length&&!sourceChanged&&!toolchainChanged)throw new Error('Unexplained native byte drift');
