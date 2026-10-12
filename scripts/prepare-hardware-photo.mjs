// Owner-supplied real photograph only. The original is never overwritten.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const [input,output,caption='Mac Sensors on a real Mac and Stream Deck',regionsFile]=process.argv.slice(2);
if(!input||!output||path.resolve(input)===path.resolve(output))throw new Error('Usage: prepare-hardware-photo <original photo> <new output PNG> [caption] [alert-region JSON]');
if(fs.existsSync(output))throw new Error('Output already exists; choose a new file');fs.mkdirSync(path.dirname(output),{recursive:true});
const original=fs.readFileSync(input),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),photo=await sharp(original).rotate().resize(1760,740,{fit:'contain',background:'#111720'}).png().toBuffer();
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const heading=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="960"><g font-family="Arial" fill="#F2F5FA"><text x="80" y="85" font-size="54" font-weight="700">Mac Sensors on hardware</text><text x="80" y="925" font-size="23" fill="#B3C0D2">Hardware photograph. ${escape(caption)}</text></g></svg>`);
await sharp({create:{width:1920,height:960,channels:4,background:'#111720'}}).composite([{input:photo,left:80,top:135},{input:heading,left:0,top:0}]).png().toFile(output);
const regions=regionsFile?JSON.parse(fs.readFileSync(regionsFile)):null,measurements=[];
if(regions)for(const [name,target] of [['warn',[232,148,13]],['crit',[203,33,20]]]){
 const region=regions[name];if(!region||!['left','top','width','height'].every(key=>Number.isInteger(region[key])&&region[key]>=0)||region.width<1||region.height<1)throw new Error('Invalid alert region');
 const {data,info}=await sharp(original).rotate().extract(region).removeAlpha().raw().toBuffer({resolveWithObject:true});const sums=[0,0,0];let clipped=0;
 for(let i=0;i<data.length;i+=info.channels){for(let c=0;c<3;c++)sums[c]+=data[i+c];if([data[i],data[i+1],data[i+2]].some(value=>value===0||value===255))clipped++;}
 const count=info.width*info.height,mean=sums.map(sum=>sum/count);measurements.push({name,target,mean,absoluteDifference:mean.map((value,index)=>Math.abs(value-target[index])),clippedPixelFraction:clipped/count});
}
fs.writeFileSync(output+'.json',JSON.stringify({kind:'owner-supplied hardware photograph',originalSha256:hash(original),outputSha256:hash(fs.readFileSync(output)),width:1920,height:960,metadataStripped:true,caption,measurements,gradeApplied:false,review:'Owner must review the original, alert-region measurements and final crop; no automatic color claim'},null,2)+'\n');
console.log(output);
