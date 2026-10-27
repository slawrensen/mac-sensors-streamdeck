// Documentation capture on a simulated host with public Mac sample readings.
import './lib/script-failures.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startPiSim} from './lib/pi-sim.mjs';
import {launch} from './lib/cdp.mjs';
import {sampleSnapshot,sampleReadings} from './lib/mac-scenes.ts';
const out=process.argv[2]??'docs/assets/img',root='build/plugin',base=Number(process.env.PI_CAPTURE_PORT_BASE??29990);fs.mkdirSync(out,{recursive:true});
const sim=await startPiSim({httpPort:base+1,wsPort:base}),browser=await launch({width:378,height:800,scale:2}),captures=[],errors=[];
browser.on('Runtime.exceptionThrown',row=>errors.push(row.exceptionDetails?.text));
const settle=()=>browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
// Opened sections turn their markers over 0.12 s; capturing before that ends is a race, so wait for every running animation.
const finished=async()=>{await browser.evaluate('Promise.all(document.getAnimations().map(animation=>animation.finished)).then(()=>true)');await settle();};
// Room around a clipped section so its frame is not cut, in CSS pixels.
const CLIP_MARGIN_PX=8,PICKER_WAIT_TRIES=100,POLL_MS=30;
const keySettings={readingKey:sampleReadings[0].key,label:'CPU super 1',displayMode:'sparkline',theme:'void',warnValue:'75',critValue:'90'};
const dialSettings={readingKey:sampleReadings[0].key,label:'CPU super 1',rotationKeys:sampleReadings.slice(0,3).map(r=>r.key),dialView:'overview',theme:'void'};
try{
 // Optional steps per capture: openAll (every details element), open (section ids), picker (text typed into the Reading search) and clip (a selector; the PNG is that element's box instead of the full page).
 // Every capture state comes from the fixture settings or from view-only interactions, so the clean-observation rule below still holds.
 for(const {fixture,file,settings,openAll,open,picker,clip} of [
  {fixture:'key-configured',file:'settings-key.png',settings:keySettings},
  {fixture:'dial-configured',file:'settings-dial.png',settings:dialSettings},
  {fixture:'dial-configured',file:'settings-reading-colors.png',settings:{...dialSettings,readingColors:Object.fromEntries(sampleReadings.slice(0,3).map((row,index)=>[row.key,['#4CC2FF','#FF7E8E','#38CD89'][index]]))},openAll:true},
  {fixture:'key-configured',file:'settings-picker.png',settings:keySettings,picker:'cpu'},
  {fixture:'dial-configured',file:'settings-dial-controls.png',settings:{...dialSettings,controlPreset:'custom'},open:['sec-interaction'],clip:'#sec-interaction'},
  {fixture:'control-default',file:'settings-control.png',settings:{},clip:'body'},
  {fixture:'key-configured',file:'settings-press-details.png',settings:{...keySettings,pressBehavior:'open-details'},open:['sec-interaction'],clip:'#sec-interaction'}
 ]){
  sim.setFixture(fixture,{snapshot:sampleSnapshot(),settings,globals:{theme:'void',textMode:'theme',typeAccents:'off',pollIntervalMs:'1000'}});await browser.goto(sim.url(fixture));
  // The control panel has no reading, so it never asks for the sensor tree; it is ready once the plugin side has answered.
  for(let i=0;i<100;i++){if(await browser.evaluate('!!(window.__hwPanel?.kind==="control"?window.__hwPanel.heardFromPlugin:window.__hwPanel?.tree) && !document.documentElement.hasAttribute("data-folds-pending")'))break;await new Promise(resolve=>setTimeout(resolve,30));}
  await browser.evaluate('document.fonts.ready');await settle();
  if(openAll){await browser.evaluate('document.querySelectorAll("details").forEach(element=>element.open=true)');await finished();}
  if(open){await browser.evaluate(`${JSON.stringify(open)}.forEach(id=>{document.getElementById(id).open=true})`);await finished();}
  if(picker!==undefined){
   await browser.click('#picker-search');await browser.type(picker);
   let shown=false;for(let i=0;i<PICKER_WAIT_TRIES&&!shown;i++){shown=await browser.evaluate('(()=>{const list=document.getElementById("picker-list");return !list.hidden&&list.querySelectorAll("[role=option]").length>0})()');if(!shown)await new Promise(resolve=>setTimeout(resolve,POLL_MS));}
   if(!shown)throw new Error('The Reading picker did not open with results for '+picker);
   await browser.evaluate('window.scrollTo(0,0)');await finished();
  }
  let png;
  if(clip){
   const box=await browser.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(clip)}).getBoundingClientRect(),top=Math.max(0,r.top+scrollY-${CLIP_MARGIN_PX});return {x:0,y:top,width:document.documentElement.clientWidth,height:Math.ceil(r.bottom+scrollY+${CLIP_MARGIN_PX}-top)}})()`);
   png=Buffer.from((await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{...box,scale:1}})).data,'base64');
  }else png=await browser.screenshot({full:true});
  fs.writeFileSync(path.join(out,file),png);
  // control.html loads no pi-common.js, so its build comes from the same cache-busting version its stylesheet link carries.
  const facts=await browser.evaluate('({build:window.__hwPiVersion??new URL(document.querySelector("link[href*=\'pi.css\']").href).searchParams.get("v"),width:innerWidth,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})');
  if(facts.overflow||sim.writes.length||sim.globalWrites.length||errors.length)throw new Error('Capture did not remain a clean observation: '+file);captures.push({file,kind:'settings-panel capture, simulated host, sample data',sha256:createHash('sha256').update(png).digest('hex'),settings,...(open?{open}:{}),...(picker!==undefined?{picker}:{}),...(clip?{clip}:{}),...facts});
 }
}finally{await browser.close();await sim.stop();}
const sourceSha256=Object.fromEntries(fs.readdirSync(root+'/ui').sort().map(file=>['ui/'+file,createHash('sha256').update(fs.readFileSync(path.join(root,'ui',file))).digest('hex')]));
fs.writeFileSync(path.join(out,'panel-captures.provenance.json'),JSON.stringify({version:JSON.parse(fs.readFileSync('package.json')).version,scope:'Staged Mac panel in Chromium, simulated host; not the app webview',sourceSha256,captures},null,2)+'\n');console.log(JSON.stringify(captures.map(({file,build,width,dpr})=>({file,build,width,dpr}))));
