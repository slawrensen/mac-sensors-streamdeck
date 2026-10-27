import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import path from 'node:path';
import fs from 'node:fs';
import { platformMap } from './scripts/core/platform.mjs';
const map=platformMap();
const testBuild=process.env.MACSENSORS_TEST_BUILD==='1';
const target=(entry)=>testBuild&&entry.test?entry.test:entry.mac;
/**
 * Modules whose top-level code the bundle does not need, so tree shaking can drop them when nothing uses their exports:
 * the @elgato/utils list helpers, and the ws server, stream and subprotocol modules that ws/wrapper.mjs imports but the
 * SDK's WebSocket client (@elgato/streamdeck connection.js imports only the default export) never runs.
 */
const SIDE_EFFECT_FREE=/[\\/]@elgato[\\/]utils[\\/]dist[\\/]lists[\\/]|[\\/]ws[\\/]lib[\\/](websocket-server|stream|subprotocol)\.js$/;
export default {
	input:'src/plugin.ts',
	output:{file:testBuild?'build/test-plugin/bin/plugin.js':'build/plugin/bin/plugin.js',format:'es',sourcemap:false},
	treeshake:{moduleSideEffects:(id)=>!SIDE_EFFECT_FREE.test(id)},
	plugins:[
		{name:'platform-seams',resolveId(source){if(map[source])return path.resolve(target(map[source]));},generateBundle(){
			const ids=new Set(this.getModuleIds());
			for(const entry of Object.values(map))if(!ids.has(path.resolve(target(entry))))throw new Error('Mac seam was not included: '+target(entry));
			const forbidden=['src/poller.ts','src/hwinfo/hwsm-loader.ts','src/hwinfo/shared-memory.ts','src/hwinfo/gadget-registry.ts'].filter(file=>ids.has(path.resolve(file)));
			if(forbidden.length)throw new Error('Windows runtime module reached the Mac bundle: '+forbidden.join(', '));
			fs.mkdirSync('build',{recursive:true});fs.writeFileSync(testBuild?'build/test-platform-modules.json':'build/platform-modules.json',JSON.stringify({map,windowsRuntimeModules:forbidden},null,2)+'\n');
		}},
		typescript({tsconfig:testBuild?'tsconfig.test-build.json':'tsconfig.mac.json'}),
		nodeResolve({browser:false,exportConditions:['node'],preferBuiltins:true}),commonjs(),
		terser({compress:{passes:2},format:{comments:false}}),
		{name:'module-package',generateBundle(){this.emitFile({fileName:'package.json',source:'{"type":"module"}\n',type:'asset'});}}
	]
};
