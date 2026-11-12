// Production SVG composition, rendered through a caller-supplied local app renderer.
import './lib/script-failures.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {composeScenes,composeStripScenes,stripDefinitions,boardDefinitions,boardFooter,sampleReadings} from './lib/mac-scenes.ts';
const rendererPath=process.env.MACSENSORS_RENDERER_MODULE;
if(!rendererPath)throw new Error('Set MACSENSORS_RENDERER_MODULE to the measured local renderer adapter');
const renderer=await import(pathToFileURL(path.resolve(rendererPath)).href),out=process.argv[2]??'docs/assets/img';fs.mkdirSync(out,{recursive:true});
// `npm run docs:assets -- <folder> strips` draws only the touch strip examples; without it, only the boards. Each keeps its own provenance file.
const onlyStrips=process.argv[3]==='strips';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const scenes=composeScenes(),byId=new Map(scenes.map(scene=>[scene.id,scene])),assets=[];
const frame=async(scene,width)=>{const w=width,h=scene.kind==='key'?width:Math.round(width/2),pixels=renderer.renderBGRA(scene.svg,w,h),rgba=Buffer.alloc(pixels.length);for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3],un=value=>a?Math.min(255,Math.round(value*255/a)):0;rgba[i]=un(pixels[i+2]);rgba[i+1]=un(pixels[i+1]);rgba[i+2]=un(pixels[i]);rgba[i+3]=a;}return sharp(rgba,{raw:{width:w,height:h,channels:4}}).png().toBuffer();};
const rendererFacts={name:'Installed app QtSvg through a measured local adapter',version:renderer.version,deviceEquivalence:'INFERRED until physical photograph calibration'};
/** A dial segment on the touch strip, in device pixels, and the scale the examples are drawn at. */
const SEGMENT_W_PX=200,SEGMENT_H_PX=100,STRIP_SCALE=2,STRIP_GAP_PX=24,STRIP_MARGIN_PX=40,STRIP_RADIUS_PX=14,ALPHA_OPAQUE=255,PANEL_MIN_SHARE=.1;
/** Straight RGBA from the adapter's premultiplied BGRA, keeping alpha so a picture can show through. */
const straight=pixels=>{const rgba=Buffer.alloc(pixels.length);for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3],un=value=>a?Math.min(255,Math.round(value*255/a)):0;rgba[i]=un(pixels[i+2]);rgba[i+1]=un(pixels[i+1]);rgba[i+2]=un(pixels[i]);rgba[i+3]=a;}return rgba;};
/** What the app's renderer leaves see-through at device size: the share of fully clear and fully solid pixels, and a panel's alpha, the most common value between them when it covers a tenth of the segment or more (soft edges alone never do). */
function alphaFacts(svg){
 const pixels=renderer.renderBGRA(svg,SEGMENT_W_PX,SEGMENT_H_PX),total=SEGMENT_W_PX*SEGMENT_H_PX,counts=new Array(256).fill(0);
 for(let i=3;i<pixels.length;i+=4)counts[pixels[i]]++;
 let panelAlpha=null,panelCount=0;for(let a=1;a<ALPHA_OPAQUE;a++)if(counts[a]>panelCount){panelCount=counts[a];panelAlpha=a;}
 const share=count=>Math.round(count/total*1e4)/1e4;
 const panel=panelCount/total>=PANEL_MIN_SHARE;
 return {clear:share(counts[0]),solid:share(counts[ALPHA_OPAQUE]),panelAlpha:panel?panelAlpha:null,panelShare:panel?share(panelCount):0};
}
async function drawStrips(){
 const scenes=composeStripScenes(),stripW=SEGMENT_W_PX*STRIP_SCALE*6,stripH=SEGMENT_H_PX*STRIP_SCALE,W=stripW+2*STRIP_MARGIN_PX*STRIP_SCALE,H=stripDefinitions.length*stripH+(stripDefinitions.length-1)*STRIP_GAP_PX*STRIP_SCALE+2*STRIP_MARGIN_PX*STRIP_SCALE,layers=[];
 const pictures={'cosmic-cliffs':await sharp('docs/assets/img/sources/cosmic-cliffs-strip.jpg').resize(stripW,stripH,{fit:'fill'}).png().toBuffer(),light:await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${stripW}" height="${stripH}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3EEE4"/><stop offset=".55" stop-color="#E4E9F2"/><stop offset="1" stop-color="#F6F2EA"/></linearGradient></defs><rect width="${stripW}" height="${stripH}" fill="url(#g)"/></svg>`)).png().toBuffer()};
 const corners=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${stripW}" height="${stripH}"><rect width="${stripW}" height="${stripH}" rx="${STRIP_RADIUS_PX*STRIP_SCALE}"/></svg>`);
 for(const [row,strip] of stripDefinitions.entries()){
  const faces=[];
  for(const [slot,scene] of scenes.filter(item=>item.strip===strip.id).entries()){const w=SEGMENT_W_PX*STRIP_SCALE,h=SEGMENT_H_PX*STRIP_SCALE;faces.push({input:await sharp(straight(renderer.renderBGRA(scene.svg,w,h)),{raw:{width:w,height:h,channels:4}}).png().toBuffer(),left:slot*w,top:0});}
  const drawn=await sharp(pictures[strip.picture]).composite(faces).png().toBuffer();
  layers.push({input:await sharp(drawn).composite([{input:corners,blend:'dest-in'}]).png().toBuffer(),left:STRIP_MARGIN_PX*STRIP_SCALE,top:STRIP_MARGIN_PX*STRIP_SCALE+row*(stripH+STRIP_GAP_PX*STRIP_SCALE)});
 }
 const file=path.join(out,'dial-backgrounds-looks.jpg');
 await sharp({create:{width:W,height:H,channels:3,background:'#111720'}}).composite(layers).jpeg({quality:88,mozjpeg:true}).toFile(file);console.log('Generated '+file);
 const provenance={schema:1,version:JSON.parse(fs.readFileSync('package.json')).version,command:'npm run docs:assets -- docs/assets/img strips',renderer:rendererFacts,font:JSON.parse(fs.readFileSync('src/mac/tahoma-bold-metrics.json')).fontSha256,sampleData:true,
  picture:{file:'sources/cosmic-cliffs-strip.jpg',sha256:hash(fs.readFileSync('docs/assets/img/sources/cosmic-cliffs-strip.jpg')),credit:'NASA, ESA, CSA, and STScI',source:'https://esawebb.org/images/weic2205a/',license:'CC BY 4.0',change:'Cropped and scaled to a 12 to 1 strip'},
  alphaMeasuredAt:[SEGMENT_W_PX,SEGMENT_H_PX],scenes:scenes.map(({id,strip,theme,look,view,accentWords,svg})=>({id,strip,theme,look,view,accentWords,svgSha256:hash(svg),alpha:alphaFacts(svg)})),
  assets:[{file:path.basename(file),width:W,height:H,sha256:hash(fs.readFileSync(file)),sceneIds:scenes.map(scene=>scene.id),kind:'production-rendered sample data over a picture'}]};
 fs.writeFileSync(path.join(out,'strip-images.provenance.json'),JSON.stringify(provenance,null,2)+'\n');
}
try{
 if(onlyStrips){await drawStrips();}
 else{
 for(const board of boardDefinitions){
  const overview=board.id==='readme-hero',W=overview?1600:1280,H=overview?1040:720,layers=[],title=escape(board.title),subtitle=escape(board.subtitle),footer=escape(boardFooter(board,scenes));
  const background=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="26" fill="#111720"/><path d="M64 154H${W-64}" stroke="#293547"/><g font-family="Arial" fill="#F2F5FA"><text x="64" y="82" font-size="${board.title.length>46?38:44}" font-weight="700">${title}</text><text x="64" y="124" font-size="23" fill="#B3C0D2">${subtitle}</text><text x="64" y="${H-32}" font-size="16" fill="#9CABBD">${footer}</text></g></svg>`;
  const keys=board.scenes.filter(id=>byId.get(id).kind==='key'),dials=board.scenes.filter(id=>byId.get(id).kind==='dial');
  // A board may set tile, gap and top (a device grid such as the 15-key detail page); the defaults keep every other board's bytes.
  const tile=board.tile??(overview?160:board.id==='hero'?200:196),gap=board.gap??(overview?20:28),rowGap=board.gap??(overview?20:32),top=board.top??190;
  for(let i=0;i<keys.length;i++){const row=Math.floor(i/board.columns),count=Math.min(board.columns,keys.length-row*board.columns),left=Math.round((W-(count*tile+(count-1)*gap))/2+(i%board.columns)*(tile+gap));layers.push({input:await frame(byId.get(keys[i]),tile),left,top:top+row*(tile+rowGap)});}
  for(let i=0;i<dials.length;i++){const width=overview?346:board.id==='hero'?420:352,left=board.id==='hero'?430:Math.round((W-(dials.length*width+(dials.length-1)*24))/2+i*(width+24));layers.push({input:await frame(byId.get(dials[i]),width),left,top:overview?760:board.id==='hero'?430:262});}
  const file=path.join(out,board.id+'.png');await sharp(Buffer.from(background)).composite(layers).png({compressionLevel:9}).toFile(file);assets.push({file:path.basename(file),width:W,height:H,sha256:hash(fs.readFileSync(file)),sceneIds:board.scenes,kind:'production-rendered sample data'});console.log('Generated '+file);
 }
 const provenance={schema:1,version:JSON.parse(fs.readFileSync('package.json')).version,command:'npm run docs:assets',renderer:rendererFacts,font:JSON.parse(fs.readFileSync('src/mac/tahoma-bold-metrics.json')).fontSha256,sampleData:true,readings:sampleReadings,scenes:scenes.map(({id,kind,svg,description})=>({id,kind,description,svgSha256:hash(svg)})),assets};
 fs.writeFileSync(path.join(out,'renderer-images.provenance.json'),JSON.stringify(provenance,null,2)+'\n');
 }
}finally{renderer.closeQt();}
