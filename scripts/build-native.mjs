import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=process.cwd();
const out=path.resolve(process.argv[2]??'build/native');
const version='24.13.1';
const headerHash='0e0073cb62a38c0d41c08df0311a60b755c68edcd4e4dbb04b0a3bbe0083e186';
const toolchain=path.resolve('build/toolchain');
let headers=process.env.MACSENSORS_NODE_HEADERS;
if(!headers) {
	const archive=path.join(toolchain,`node-v${version}-headers.tar.gz`);fs.mkdirSync(toolchain,{recursive:true});
	if(!fs.existsSync(archive)) {const response=await fetch(`https://nodejs.org/dist/v${version}/node-v${version}-headers.tar.gz`);if(!response.ok)throw new Error('Header download failed');fs.writeFileSync(archive,Buffer.from(await response.arrayBuffer()));}
	if(createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==headerHash)throw new Error('Node header archive hash mismatch');
	const entries=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).split('\n').filter(Boolean);if(entries.some(file=>path.isAbsolute(file)||file.split('/').includes('..')))throw new Error('Unsafe header path');
	execFileSync('tar',['-xzf',archive,'-C',toolchain]);headers=path.join(toolchain,`node-v${version}/include/node`);
}
const nodeVersion=fs.readFileSync(path.join(headers,'node_version.h'),'utf8');
for(const [part,value] of [['MAJOR',24],['MINOR',13],['PATCH',1]])if(!new RegExp(`#define NODE_${part}_VERSION ${value}\\b`).test(nodeVersion))throw new Error('Wrong Node header version');
const inputs=['native/hwmac/addon.c','native/hwmac/collectors.c','native/hwmac/collectors.h','native/hwmac/smc.c','native/hwmac/smc.h','native/hwmac/version.h','native/hwmac/catalog.json','native/hwmac/binding.gyp','scripts/build-native.mjs'];
const hash=createHash('sha256');const sourceFiles=[];
for(const file of inputs.sort()) {const bytes=fs.readFileSync(file);hash.update(`${Buffer.byteLength(file)}:${file}:${bytes.length}:`).update(bytes);sourceFiles.push({path:file,sha256:createHash('sha256').update(bytes).digest('hex')});}
const sourceId=hash.digest('hex');const generated=path.join(out,'generated');fs.mkdirSync(generated,{recursive:true});
fs.writeFileSync(path.join(generated,'source-id.h'),`#define HWMAC_SOURCE_ID "${sourceId}"\n`);
const catalog=JSON.parse(fs.readFileSync('native/hwmac/catalog.json','utf8'));
if(catalog.rows.length>128||new Set(catalog.rows.map(row=>row.key)).size!==catalog.rows.length)throw new Error('Ambiguous or oversized SMC catalog');
const bounds={temperature:[-50,150],fan:[0,30000],voltage:[0,100],current:[-500,500],power:[-1000,2000]};
const entries=catalog.rows.map(row=>{if(!/^[\x20-\x7e]{4}$/.test(row.key)||!bounds[row.type])throw new Error('Invalid catalog row');return `\t{${[row.key,row.label,row.group,row.type].map(x=>JSON.stringify(x)).join(',')},${row.scope==='m5'?5:row.scope==='apple'?1:0},${bounds[row.type].join(',')}}`;});
const models=Object.entries(catalog.modelTables).map(([model,facts])=>{if(facts.table!=='m5')throw new Error('Unknown model table');return `\t{${JSON.stringify(model)},${JSON.stringify(facts.chip)},5}`;});
fs.writeFileSync(path.join(generated,'catalog.inc'),`static const struct { const char *model; const char *chip; unsigned scope; } HWMAC_MODELS[] = {\n${models.join(',\n')}\n};\nstatic const sensor_spec HWMAC_CATALOG[] = {\n${entries.join(',\n')}\n};\n`);
const sdk=execFileSync('xcrun',['--sdk','macosx','--show-sdk-path'],{encoding:'utf8'}).trim();
const compiler=execFileSync('xcrun',['--find','clang'],{encoding:'utf8'}).trim();
const records=[];
for(const kind of ['production','test','wrong-protocol'])for(const architecture of ['arm64','x86_64']) {
	const directory=path.join(out,kind);fs.mkdirSync(directory,{recursive:true});const finalFile=path.join(directory,`hwmac-${architecture}.node`), file=path.join(directory,`.hwmac-${architecture}-${process.pid}.next`);
	const args=['-arch',architecture,'-mmacosx-version-min=13.5','-isysroot',sdk,'-std=c11','-O2','-Wall','-Wextra','-Werror','-fvisibility=hidden',`-ffile-prefix-map=${root}=.`,`-ffile-prefix-map=${out}=build/native`,'-bundle','-Wl,-no_adhoc_codesign','-undefined','dynamic_lookup','-I',headers,'-I',generated,'native/hwmac/addon.c','native/hwmac/collectors.c','native/hwmac/smc.c','-framework','CoreFoundation','-framework','CoreText','-framework','IOKit','-o',file];
	if(kind==='test')args.unshift('-DHWMAC_TEST_BUILD=1');if(kind==='wrong-protocol')args.unshift('-DHWMAC_PROTOCOL_VERSION=999');
	execFileSync(compiler,args,{stdio:'inherit',env:{...process.env,ZERO_AR_DATE:'1',MACOSX_DEPLOYMENT_TARGET:'13.5'}});
	execFileSync('strip',['-S','-x',file]);
	// The linker UUID varies with transient object/output paths. Assign a content UUID
	// after stripping, before signing; every other byte remains part of the hash.
	const payload=fs.readFileSync(file);let offset=32,uuidOffset;
	for(let command=0;command<payload.readUInt32LE(16);command++){const kind=payload.readUInt32LE(offset),length=payload.readUInt32LE(offset+4);if(length<8||offset+length>payload.length)throw new Error('Invalid Mach-O load command');if(kind===0x1b)uuidOffset=offset+8;offset+=length;}
	if(uuidOffset===undefined)throw new Error('Missing linker UUID');
	payload.fill(0,uuidOffset,uuidOffset+16);const uuid=createHash('sha256').update(payload).digest().subarray(0,16);uuid[6]=(uuid[6]&15)|80;uuid[8]=(uuid[8]&63)|128;uuid.copy(payload,uuidOffset);fs.writeFileSync(file,payload);
	const unsignedSha256=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
	execFileSync('codesign',['--force','--sign','-','--timestamp=none','--identifier',`com.lawrensen.mac.hwmac.${kind}.${architecture}`,file],{stdio:'inherit'});execFileSync('codesign',['--verify','--strict',file],{stdio:'inherit'});
	fs.renameSync(file,finalFile);
	records.push({kind,architecture,file:path.relative(out,finalFile),unsignedSha256,sha256:createHash('sha256').update(fs.readFileSync(finalFile)).digest('hex'),bytes:fs.statSync(finalFile).size});
}
fs.writeFileSync(path.join(out,'build-record.json'),JSON.stringify({sourceId,sourceFiles,nodeHeaders:version,headerArchiveSha256:headerHash,compiler:execFileSync(compiler,['--version'],{encoding:'utf8'}).split('\n')[0],sdk:execFileSync('xcrun',['--sdk','macosx','--show-sdk-version'],{encoding:'utf8'}).trim(),deploymentTarget:'13.5',records},null,2)+'\n');
fs.writeFileSync('src/mac/native-contract.ts',`// Generated from the native source inputs by scripts/build-native.mjs.\nexport const NATIVE_PROTOCOL = 1;\nexport const NATIVE_VERSION = '1.0.0';\nexport const NATIVE_SOURCE_ID = '${sourceId}';\n`);
console.log(JSON.stringify({sourceId,artifacts:records.map(r=>({file:r.file,bytes:r.bytes,sha256:r.sha256}))}));
