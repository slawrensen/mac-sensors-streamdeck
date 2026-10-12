// Check the actual published site's image zoom and mobile navigation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launch} from './lib/cdp.mjs';
const root=process.argv[2],output=process.argv[3]??'build/docs-journey.json';if(!/^https?:\/\//.test(root??''))throw new Error('Expected a published site URL');
const browser=await launch({width:390,height:844});
try{
 await browser.goto(root);await browser.evaluate('document.fonts.ready');
 for(let i=0;i<100;i++){if(await browser.evaluate('!!document.querySelector(".zoomable")'))break;await new Promise(resolve=>setTimeout(resolve,25));}
 await browser.click('.zoomable');assert.ok(await browser.evaluate('document.querySelector(".zoom-overlay")?.hasAttribute("open")'));
 await browser.key('Escape');assert.equal(await browser.evaluate('document.querySelector(".zoom-overlay")?.hasAttribute("open")'),false);
 const menu=await browser.evaluate('document.querySelector("#menu-button")?.id');if(menu){await browser.click('#menu-button');assert.ok(await browser.evaluate('document.querySelector(".site-nav")?.getBoundingClientRect().height>0'));}
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({scope:'Published docs in Chromium at phone width',zoomOpens:true,escapeCloses:true,mobileNavigation:Boolean(menu)},null,2)+'\n');
}finally{await browser.close();}
