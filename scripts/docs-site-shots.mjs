// Published-page browser evidence; independent of the plugin's e2e harness.
import fs from 'node:fs';
import path from 'node:path';
import {launch} from './lib/cdp.mjs';
const [output,root,commit='unknown',...selected]=process.argv.slice(2);
if(!output||!/^https?:\/\//.test(root??''))throw new Error('Usage: docs-site-shots <output directory> <site URL> <commit> [pages]');
const pages=selected.length?selected:['','installation.html','getting-started.html','sensor-reading.html','sensor-details.html','sensor-dial.html','dial-controls.html','themes.html','thresholds.html','data-sources.html','status-screens.html','hardware.html','faq.html','troubleshooting.html','changelog.html'];
fs.mkdirSync(output,{recursive:true});const browser=await launch(),results=[];let errors=[],requests=[];
browser.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.text??'page exception'));browser.on('Network.loadingFailed',event=>{if(!event.canceled)requests.push(event.errorText);});
await browser.send('Network.enable');
try{
 for(const viewport of [{name:'desktop',width:1280,height:900},{name:'phone',width:390,height:844}]){
  await browser.viewport(viewport.width,viewport.height,1);
  for(const page of pages){
   errors=[];requests=[];const url=new URL(page,root.endsWith('/')?root:root+'/').href;await browser.goto(url);
   await browser.evaluate('document.fonts.ready');await browser.evaluate(`(async()=>{for(const image of document.images){image.loading='eager';try{await image.decode();}catch{}}})()`);
   const metrics=await browser.evaluate(`({title:document.title,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,brokenImages:[...document.images].filter(image=>!image.complete||image.naturalWidth===0).map(image=>image.getAttribute('src')),main:!!document.querySelector('.main-content')})`);
   const file=`${viewport.name}-${page.replace(/\.html$/,'')||'home'}.png`;fs.writeFileSync(path.join(output,file),await browser.screenshot({full:true}));results.push({url,file,viewport,commit,at:new Date().toISOString(),...metrics,errors:[...errors],failedRequests:[...requests]});console.log(file+': '+JSON.stringify(metrics));
  }
 }
}finally{await browser.close();}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({scope:'Actual published docs in Chromium',results},null,2)+'\n');
if(results.some(row=>row.overflow>0||row.brokenImages.length||row.errors.length||row.failedRequests.length||!row.main))process.exitCode=1;
