// Listing artwork from verified production boards and documented panel captures.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const out=process.argv[2]??'marketing';fs.mkdirSync(out,{recursive:true});const assets=[];
const record=async(file,kind,inputs)=>{const bytes=fs.readFileSync(path.join(out,file)),meta=await sharp(bytes).metadata();assets.push({file,kind,width:meta.width,height:meta.height,sha256:createHash('sha256').update(bytes).digest('hex'),inputs:inputs.map(input=>({file:input,sha256:createHash('sha256').update(fs.readFileSync(input)).digest('hex')}))});};
for(const [file,source] of [['thumbnail.png','hero'],['shot-1-hero.png','hero'],['shot-3-themes.png','themes'],['shot-5-dials.png','dials'],['shot-6-multi.png','key-layouts'],['shot-7-dial-views.png','dials'],['shot-8-drilldown.png','details']]){
 const input='docs/assets/img/'+source+'.png';await sharp(input).resize(1920,960,{fit:'contain',background:'#111720'}).png().toFile(path.join(out,file));await record(file,'production-rendered sample data',[input]);
}
const panels=['settings-key.png','settings-dial.png'],layers=[];
for(let i=0;i<panels.length;i++){const input='docs/assets/img/'+panels[i],meta=await sharp(input).metadata();layers.push({input:await sharp(input).extract({left:0,top:0,width:meta.width,height:Math.min(900,meta.height)}).resize(560).png().toBuffer(),left:240+i*880,top:180});}
const heading=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="960"><g font-family="Arial"><text x="80" y="88" font-size="56" font-weight="700" fill="#F2F5FA">Make the reading your own</text><text x="80" y="133" font-size="28" fill="#B3C0D2">A live face preview, reading choices and a shared look.</text><text x="80" y="925" font-size="22" fill="#9CABBD">Settings-panel captures. Simulated host with fixed Mac sample data.</text></g></svg>');
await sharp({create:{width:1920,height:960,channels:4,background:'#111720'}}).composite([...layers,{input:heading,left:0,top:0}]).png().toFile(path.join(out,'shot-4-settings.png'));await record('shot-4-settings.png','settings-panel capture, simulated host',panels.map(file=>'docs/assets/img/'+file));
const icon='com.lawrensen.mac.sdPlugin/imgs/plugin/marketplace@2x.png';await sharp(icon).resize(288,288).png().toFile(path.join(out,'app-icon-288.png'));await record('app-icon-288.png','pinned app mark',[icon]);
fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify({version:JSON.parse(fs.readFileSync('package.json')).version,assets,hardwarePhoto:'Owner-only; no substitute image generated',demoVideo:'Owner-only; shot list prepared separately'},null,2)+'\n');console.log(JSON.stringify({assets:assets.length,hardwarePhoto:'pending owner',demoVideo:'pending owner'}));
