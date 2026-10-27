// Production SVG composition, rendered through a caller-supplied local app renderer.
import './lib/script-failures.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {composeScenes,boardDefinitions,sampleReadings} from './lib/mac-scenes.ts';
const rendererPath=process.env.MACSENSORS_RENDERER_MODULE;
if(!rendererPath)throw new Error('Set MACSENSORS_RENDERER_MODULE to the measured local renderer adapter');
const renderer=await import(pathToFileURL(path.resolve(rendererPath)).href),out=process.argv[2]??'docs/assets/img';fs.mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const scenes=composeScenes(),byId=new Map(scenes.map(scene=>[scene.id,scene])),assets=[];
const frame=async(scene,width)=>{const w=width,h=scene.kind==='key'?width:Math.round(width/2),pixels=renderer.renderBGRA(scene.svg,w,h),rgba=Buffer.alloc(pixels.length);for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3],un=value=>a?Math.min(255,Math.round(value*255/a)):0;rgba[i]=un(pixels[i+2]);rgba[i+1]=un(pixels[i+1]);rgba[i+2]=un(pixels[i]);rgba[i+3]=a;}return sharp(rgba,{raw:{width:w,height:h,channels:4}}).png().toBuffer();};
try{
 for(const board of boardDefinitions){
  const overview=board.id==='readme-hero',W=overview?1600:1280,H=overview?1040:720,layers=[],title=escape(board.title),subtitle=escape(board.subtitle);
  const background=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="26" fill="#111720"/><path d="M64 154H${W-64}" stroke="#293547"/><g font-family="Arial" fill="#F2F5FA"><text x="64" y="82" font-size="${board.title.length>46?38:44}" font-weight="700">${title}</text><text x="64" y="124" font-size="23" fill="#B3C0D2">${subtitle}</text><text x="64" y="${H-32}" font-size="16" fill="#9CABBD">Production-rendered sample data. Mac catalog labels, illustrative values.</text></g></svg>`;
  const keys=board.scenes.filter(id=>byId.get(id).kind==='key'),dials=board.scenes.filter(id=>byId.get(id).kind==='dial');
  // A board may set tile, gap and top (a device grid such as the 15-key detail page); the defaults keep every other board's bytes.
  const tile=board.tile??(overview?160:board.id==='hero'?200:196),gap=board.gap??(overview?20:28),rowGap=board.gap??(overview?20:32),top=board.top??190;
  for(let i=0;i<keys.length;i++){const row=Math.floor(i/board.columns),count=Math.min(board.columns,keys.length-row*board.columns),left=Math.round((W-(count*tile+(count-1)*gap))/2+(i%board.columns)*(tile+gap));layers.push({input:await frame(byId.get(keys[i]),tile),left,top:top+row*(tile+rowGap)});}
  for(let i=0;i<dials.length;i++){const width=overview?346:board.id==='hero'?420:352,left=board.id==='hero'?430:Math.round((W-(dials.length*width+(dials.length-1)*24))/2+i*(width+24));layers.push({input:await frame(byId.get(dials[i]),width),left,top:overview?760:board.id==='hero'?430:262});}
  const file=path.join(out,board.id+'.png');await sharp(Buffer.from(background)).composite(layers).png({compressionLevel:9}).toFile(file);assets.push({file:path.basename(file),width:W,height:H,sha256:hash(fs.readFileSync(file)),sceneIds:board.scenes,kind:'production-rendered sample data'});console.log('Generated '+file);
 }
 const provenance={schema:1,version:JSON.parse(fs.readFileSync('package.json')).version,command:'npm run docs:assets',renderer:{name:'Installed app QtSvg through a measured local adapter',version:renderer.version,deviceEquivalence:'INFERRED until physical photograph calibration'},font:JSON.parse(fs.readFileSync('src/mac/tahoma-bold-metrics.json')).fontSha256,sampleData:true,readings:sampleReadings,scenes:scenes.map(({id,kind,svg,description})=>({id,kind,description,svgSha256:hash(svg)})),assets};
 fs.writeFileSync(path.join(out,'renderer-images.provenance.json'),JSON.stringify(provenance,null,2)+'\n');
}finally{renderer.closeQt();}
