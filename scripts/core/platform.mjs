import fs from 'node:fs';
export function platformMap() {
	const map=JSON.parse(fs.readFileSync(new URL('../../platform-map.json',import.meta.url),'utf8'));
	for(const [alias,values] of Object.entries(map)) {
		if(!alias.startsWith('#platform/'))throw new Error('Invalid platform alias');
		for(const target of Object.values(values))if(!fs.existsSync(target))throw new Error(`Missing platform target: ${target}`);
	}
	return map;
}
export function platformPaths(kind) { return Object.fromEntries(Object.entries(platformMap()).map(([alias,values])=>[alias,['./'+values[kind]]])); }
if(process.argv[1]?.endsWith('/platform.mjs')) {
	for(const kind of ['upstream','mac']) {
		const file=kind==='mac'?'tsconfig.mac.json':'tsconfig.json';
		const config=kind==='mac'?{extends:'./tsconfig.json'}:JSON.parse(fs.readFileSync(file,'utf8'));
		config.compilerOptions={...config.compilerOptions,paths:platformPaths(kind)};
		fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
	}
}
