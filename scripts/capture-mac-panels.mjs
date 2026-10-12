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
try{
 for(const [fixture,file,settings] of [
  ['key-configured','settings-key.png',{readingKey:sampleReadings[0].key,label:'CPU super 1',displayMode:'sparkline',theme:'void',warnValue:'75',critValue:'90'}],
  ['dial-configured','settings-dial.png',{readingKey:sampleReadings[0].key,label:'CPU super 1',rotationKeys:sampleReadings.slice(0,3).map(r=>r.key),dialView:'overview',theme:'void'}]
 ]){
  sim.setFixture(fixture,{snapshot:sampleSnapshot(),settings,globals:{theme:'void',textMode:'theme',typeAccents:'off',pollIntervalMs:'1000'}});await browser.goto(sim.url(fixture));
  for(let i=0;i<100;i++){if(await browser.evaluate('!!window.__hwPanel?.tree && !document.documentElement.hasAttribute("data-folds-pending")'))break;await new Promise(resolve=>setTimeout(resolve,30));}
  await browser.evaluate('document.fonts.ready');await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const png=await browser.screenshot({full:true});fs.writeFileSync(path.join(out,file),png);const facts=await browser.evaluate('({build:window.__hwPiVersion,width:innerWidth,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})');
  if(facts.overflow||sim.writes.length||sim.globalWrites.length||errors.length)throw new Error('Capture did not remain a clean observation');captures.push({file,kind:'settings-panel capture, simulated host, sample data',sha256:createHash('sha256').update(png).digest('hex'),settings,...facts});
 }
}finally{await browser.close();await sim.stop();}
const sourceSha256=Object.fromEntries(fs.readdirSync(root+'/ui').sort().map(file=>['ui/'+file,createHash('sha256').update(fs.readFileSync(path.join(root,'ui',file))).digest('hex')]));
fs.writeFileSync(path.join(out,'panel-captures.provenance.json'),JSON.stringify({version:JSON.parse(fs.readFileSync('package.json')).version,scope:'Staged Mac panel in Chromium, simulated host; not the app webview',sourceSha256,captures},null,2)+'\n');console.log(JSON.stringify(captures.map(({file,build,width,dpr})=>({file,build,width,dpr}))));
