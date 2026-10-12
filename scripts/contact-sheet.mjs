import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const [out,...files]=process.argv.slice(2);if(!out||!files.length)throw new Error('Usage: contact-sheet <output PNG> <input PNG...>');
fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});const columns=Math.min(2,files.length),width=640,height=360,layers=[];
for(const [index,file] of files.entries())layers.push({input:await sharp(file).resize(width,height,{fit:'contain',background:'#111720'}).png().toBuffer(),left:index%columns*width,top:Math.floor(index/columns)*height});
await sharp({create:{width:columns*width,height:Math.ceil(files.length/columns)*height,channels:4,background:'#111720'}}).composite(layers).png().toFile(out);
