// Check the actual published site's image viewer and phone navigation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launch} from './lib/cdp.mjs';
const root=process.argv[2],output=process.argv[3]??'build/docs-journey.json';if(!/^https?:\/\//.test(root??''))throw new Error('Expected a published site URL');
const browser=await launch({width:390,height:844});
const until=async expression=>{for(let i=0;i<200;i++){if(await browser.evaluate(`Boolean(${expression})`))return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Timed out waiting for '+expression);};
try{
 await browser.goto(root);await browser.evaluate('document.fonts.ready');
 await until('document.querySelector(".main-content a[data-image-viewer]")');
 await browser.click('.main-content a[data-image-viewer]');await until('document.querySelector("dialog.image-viewer")?.open');
 await browser.key('Escape');await until('!document.querySelector("dialog.image-viewer").open');
 const restored=await browser.evaluate('document.activeElement?.matches("a[data-image-viewer]")');assert.ok(restored,'focus returns to the image link');
 const menu=await browser.evaluate('document.querySelector("#menu-button")?.id');if(menu){await browser.click('#menu-button');assert.ok(await browser.evaluate('document.querySelector(".site-nav")?.getBoundingClientRect().height>0'));}
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({scope:'Published docs in Chromium at phone width',viewerOpens:true,escapeCloses:true,focusRestored:restored,mobileNavigation:Boolean(menu)},null,2)+'\n');
}finally{await browser.close();}
