// Ported from slawrensen/hwinfo-streamdeck scripts/gen-tahoma-metrics.mjs at 11b9645b78395f157493648d873a3066673ba493.
// Font and renderer binaries are local inputs. Only measured numbers are generated.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadFont } from './lib/ttf.mjs';
const [fontPath, rendererPath, outputPath] = process.argv.slice(2);
if (!fontPath || !rendererPath || !outputPath) throw new Error('Usage: font path, local renderer module, output TS path');
const renderer = await import(pathToFileURL(rendererPath).href);
const font = loadFont(fontPath);
if (font.upem !== 2048) throw new Error('Unexpected units per em');
const blocks = [[32,126],[160,255],[256,383],[384,591],[880,1023],[1024,1279],[1280,1327],[7680,7935],[8192,8303],[8304,8351],[8352,8399],[8448,8527],[8528,8591],[8592,8703],[8704,8959],[9632,9727]];
const sizes = [11,12,13,14,16,18,20,24,28,32,36,44,52], phases = [0,.25,.5,.75], weights=[600,700];
const control = (cp) => cp === 173 || (cp>=8203&&cp<=8207) || (cp>=8232&&cp<=8238) || (cp>=8288&&cp<=8303);
let renders=0, glyphs=0; const missing=[],blank=[],output=[];
try {
 for (const [first,last] of blocks) {
  const values=[];
  for (let cp=first;cp<=last;cp++) {
   const metrics=font.metrics(String.fromCodePoint(cp));
   if (!metrics || metrics.a===0 || control(cp)) {values.push(0,0,0);if(!metrics)missing.push(cp);continue;}
   let lead=0,trail=0,ink=false;
   for (const size of sizes) for(const weight of weights) for(const phase of phases) {
    const x=64+phase,k=size/font.upem;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="112"><rect width="256" height="112" fill="black"/><text x="${x}" y="84" xml:space="preserve" font-family="Tahoma" font-weight="${weight}" font-size="${size}" fill="white">&#${cp};</text></svg>`;
    const raster=renderer.renderBGRA(svg,256,112);renders++;
    let left=256,right=-1;
    for(let y=0;y<112;y++)for(let px=0;px<256;px++){const i=(y*256+px)*4;if(Math.max(raster[i],raster[i+1],raster[i+2])>60){left=Math.min(left,px);right=Math.max(right,px);}}
    if(right<0)continue;ink=true;
    lead=Math.max(lead,Math.ceil((x+metrics.lsb*k-left-.4)/k));
    trail=Math.max(trail,Math.ceil((right-(x+(metrics.a-metrics.rsb)*k)-.85)/k));
   }
   glyphs++;
   if(!ink){blank.push(cp);values.push(-metrics.a,0,0);}else values.push(metrics.a,metrics.lsb-lead,metrics.rsb-trail);
  }
  while(values.length&&values.at(-3)===0)values.splice(-3);
  output.push(`\t[0x${first.toString(16)}, [${values.join(',')}]]`);
 }
 fs.writeFileSync(outputPath,`// Generated Mac Tahoma Bold metrics. Rebuild with scripts/gen-tahoma-metrics.mjs.\nexport const TAHOMA_BOLD_UNITS_PER_EM = 2048;\nexport const TAHOMA_BOLD_BLOCKS: ReadonlyArray<readonly [number, readonly number[]]> = [\n${output.join(',\n')}\n];\n`);
 fs.writeFileSync(outputPath.replace(/\.ts$/,'.json'),JSON.stringify({fontSha256:createHash('sha256').update(fs.readFileSync(fontPath)).digest('hex'),renderer:renderer.version,sizes,phases,weights,threshold:60,leftSlack:.4,rightSlack:.85,renders,glyphs,missing,blank,deviceMatch:'Not yet physically verified'},null,2)+'\n');
 console.log(JSON.stringify({renders,glyphs,missing:missing.length,blank:blank.length}));
} finally {renderer.closeQt();}
