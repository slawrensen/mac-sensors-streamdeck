import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import path from 'node:path';
import fs from 'node:fs';
import { platformMap } from './scripts/core/platform.mjs';
const map=platformMap();
export default {
 input:'src/plugin.ts',
 output:{file:'build/plugin/bin/plugin.js',format:'es',sourcemap:false},
 treeshake:{moduleSideEffects:(id)=>!/[\\/]@elgato[\\/]utils[\\/]dist[\\/]lists[\\/]/.test(id)},
 plugins:[
  {name:'platform-seams',resolveId(source){if(map[source])return path.resolve(map[source].mac);},generateBundle(){
   const ids=new Set(this.getModuleIds());
   for(const target of Object.values(map))if(!ids.has(path.resolve(target.mac)))throw new Error('Mac seam was not included: '+target.mac);
   const forbidden=['src/poller.ts','src/hwinfo/hwsm-loader.ts','src/hwinfo/shared-memory.ts','src/hwinfo/gadget-registry.ts'].filter(file=>ids.has(path.resolve(file)));
   if(forbidden.length)throw new Error('Windows runtime module reached the Mac bundle: '+forbidden.join(', '));
   fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/platform-modules.json',JSON.stringify({map,windowsRuntimeModules:forbidden},null,2)+'\n');
  }},
  typescript({tsconfig:'tsconfig.mac.json'}),
  nodeResolve({browser:false,exportConditions:['node'],preferBuiltins:true}),commonjs(),
  terser({compress:{passes:2},format:{comments:false}}),
  {name:'module-package',generateBundle(){this.emitFile({fileName:'package.json',source:'{"type":"module"}\n',type:'asset'});}}
 ]
};
