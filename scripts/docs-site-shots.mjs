// Published-page browser evidence; independent of the plugin's e2e harness.
// Full-page and first-view screenshots at a desktop and a phone width (more with
// DOCS_SHOTS_VIEWPORTS=360x800,768x1024,1440x900,2560x1440), with a manifest of
// URL, document status, viewport, browser version, page size, broken images,
// script errors and failed same-site requests. Lazy images are painted before
// capture. Exit 1 when any page has a problem. A missing route must answer 404
// with the site's own not-found page.
import fs from 'node:fs';
import path from 'node:path';
import {launch} from './lib/cdp.mjs';
const [output,root,commit='unknown',...selected]=process.argv.slice(2);
if(!output||!/^https?:\/\//.test(root??''))throw new Error('Usage: docs-site-shots <output directory> <site URL> <commit> [pages]');
const base=root.endsWith('/')?root:root+'/',NOT_FOUND='this-page-does-not-exist.html';
const pages=selected.length?selected:['','installation.html','getting-started.html','sensor-reading.html','sensor-details.html','sensor-dial.html','dial-controls.html','themes.html','thresholds.html','data-sources.html','status-screens.html','hardware.html','faq.html','troubleshooting.html','changelog.html',NOT_FOUND];
const viewports=process.env.DOCS_SHOTS_VIEWPORTS?process.env.DOCS_SHOTS_VIEWPORTS.split(',').map(item=>{const match=/^(\d{3,4})x(\d{3,4})$/.exec(item.trim());if(!match||Number(match[1])<320||Number(match[2])<300)throw new Error('DOCS_SHOTS_VIEWPORTS must be a comma-separated list such as 360x800,768x1024,1440x900,2560x1440');return{name:`${match[1]}x${match[2]}`,width:Number(match[1]),height:Number(match[2])};}):[{name:'desktop',width:1280,height:900},{name:'phone',width:390,height:844}];
fs.mkdirSync(output,{recursive:true});const browser=await launch(),results=[];let errors=[],requests=[],documentStatus,current="";
browser.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.exception?.description??event.exceptionDetails?.text??'page exception'));
browser.on('Runtime.consoleAPICalled',event=>{if(event.type==='error')errors.push(String(event.args?.[0]?.value??'console.error'));});
browser.on('Network.loadingFailed',event=>{if(!event.canceled)requests.push(event.errorText);});
// Only the site's own path counts: the automatic /favicon.ico probe at the domain root belongs to the umbrella site.
browser.on('Network.responseReceived',event=>{const response=event.response;if(event.type==='Document')documentStatus=response.status;const expected=current===NOT_FOUND&&response.status===404&&event.type==='Document';if(response.status>=400&&String(response.url).startsWith(base)&&!expected)requests.push(`${response.status} ${response.url}`);});
await browser.send('Network.enable');
const version=(await browser.send('Browser.getVersion')).product;
try{
 for(const viewport of viewports){
  await browser.viewport(viewport.width,viewport.height,1);
  for(const page of pages){
   errors=[];requests=[];documentStatus=null;current=page;const url=new URL(page,base).href;await browser.goto(url);
   await browser.evaluate('document.fonts.ready');
   // A loaded lazy image can still be absent from an offscreen paint: visit each one for two frames.
   await browser.evaluate(`(async()=>{const painted=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));for(const image of document.images){image.loading='eager';try{await image.decode();}catch{}}for(const image of document.images){image.scrollIntoView({block:'center',behavior:'instant'});await painted();}window.scrollTo({top:0,left:0,behavior:'instant'});await painted();})()`);
   const metrics=await browser.evaluate(`({title:document.title,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,height:document.documentElement.scrollHeight,brokenImages:[...document.images].filter(image=>!image.complete||image.naturalWidth===0).map(image=>image.getAttribute('src')),main:!!document.querySelector('.main-content')})`);
   const file=`${viewport.name}-${page===NOT_FOUND?'not-found':page.replace(/\.html$/,'')||'home'}.png`;fs.writeFileSync(path.join(output,file),await browser.screenshot({full:true}));
   const viewportFile=file.replace(/\.png$/,'-viewport.png');fs.writeFileSync(path.join(output,viewportFile),await browser.screenshot({full:false}));
   const statusOk=page===NOT_FOUND?documentStatus===404&&/^Page not found/.test(metrics.title):documentStatus===200;
   results.push({url,file,viewportFile,viewport,commit,browser:version,at:new Date().toISOString(),documentStatus,statusOk,...metrics,errors:[...errors],failedRequests:[...requests]});console.log(file+': '+JSON.stringify({documentStatus,...metrics}));
  }
 }
}finally{await browser.close();}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({scope:'Actual published docs in Chromium',browser:version,results},null,2)+'\n');
const failed=results.filter(row=>!row.statusOk||row.overflow>0||row.brokenImages.length||row.errors.length||row.failedRequests.length||!row.main);
for(const row of failed)console.error('FAIL '+row.file+': '+JSON.stringify({documentStatus:row.documentStatus,overflow:row.overflow,brokenImages:row.brokenImages,errors:row.errors,failedRequests:row.failedRequests}));
if(failed.length)process.exitCode=1;else console.log(`DOCS SHOTS: ${results.length} captures clean`);
