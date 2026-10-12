// Content identity, never mtime, ties runtime tests to the current inputs.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const walk=root=>fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>{
	const file=path.join(root,entry.name);if(entry.isSymbolicLink())throw new Error('Build input symlink: '+file);
	return entry.isDirectory()?walk(file):entry.isFile()?[file]:[];
});
export function buildInputs(test=false) {
	const files=['package.json','package-lock.json','identity.json','platform-map.json','rollup.config.mjs','tsconfig.json','tsconfig.mac.json',...walk('src'),...walk('core-patches'),...walk('com.lawrensen.mac.sdPlugin').filter(file=>!file.includes('/bin/')&&!file.includes('/logs/')),...walk('scripts').filter(file=>/\.(?:mjs|ts)$/.test(file))];
	files.push(...walk('native/hwmac').filter(file=>/\.(?:c|h)$/.test(file)||/\/(?:catalog.json|binding.gyp)$/.test(file)));
	if(test)files.push('test/mac/native-policy.ts');
	return Object.fromEntries([...new Set(files)].sort().map(file=>[file,hash(file)]));
}
export function recordBuild(directory,test=false) {
	const outputs=Object.fromEntries(walk(directory).filter(file=>!file.includes('/logs/')).sort().map(file=>[path.relative(directory,file),hash(file)]));
	const record={schema:1,test,inputs:buildInputs(test),outputs};
	fs.writeFileSync(`build/${test?'test':'production'}-inputs.json`,JSON.stringify(record,null,2)+'\n');
}
export function verifyBuild(directory,test=false) {
	const record=JSON.parse(fs.readFileSync(`build/${test?'test':'production'}-inputs.json`));
	if(record.test!==test||JSON.stringify(record.inputs)!==JSON.stringify(buildInputs(test))||Object.entries(record.outputs).some(([file,sha])=>!fs.existsSync(path.join(directory,file))||hash(path.join(directory,file))!==sha))throw new Error('Build inputs or outputs changed; run npm run build && npm run build:test');
}
