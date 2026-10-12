// Ported from slawrensen/hwinfo-streamdeck scripts/validate-release-copy.mjs at 11b9645b78395f157493648d873a3066673ba493.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
const GLYPH_ALLOW = [/"—"/g, /'—'/g, />—</g];
const BANNED = [
	{ re: /—/, why: "em dash (use a period, comma, colon or parentheses)" },
	{ re: /\bnot just\b/i, why: '"not just X" construction' },
	{ re: /whether you.re/i, why: '"whether you\'re"' },
	{ re: /in today.s world/i, why: '"in today\'s world"' },
	{ re: /let.s dive in/i, why: '"let\'s dive in"' },
	{ re: /\bgame-?chang/i, why: '"game-changing"' },
	{ re: /\brevolutionary\b/i, why: '"revolutionary"' },
	{ re: /\bseamless/i, why: '"seamless"' },
	{ re: /\brobust\b/i, why: '"robust"' },
	{ re: /\bcomprehensive\b/i, why: '"comprehensive"' },
	{ re: /\bempower/i, why: '"empower"' },
	{ re: /\bunlock\b/i, why: '"unlock"' },
	{ re: /\bdelve\b/i, why: '"delve"' },
	{ re: /\bleverag(e|es|ed|ing)\b/i, why: '"leverage"' },
	{ re: /\butiliz/i, why: '"utilize"' },
	{ re: /(?<![\w-])elevate\b/i, why: '"elevate" (marketing sense; "elevated"/"un-elevate" are fine)' },
	{ re: /\bstreamline\b/i, why: '"streamline"' },
	{ re: /boost your productivity/i, why: '"boost your productivity"' },
	{ re: /it(?:.s| is) worth noting/i, why: '"it is worth noting" filler' },
	{ re: /at the end of the day/i, why: '"at the end of the day" filler' },
	{ re: /\bin conclusion\b/i, why: '"in conclusion" filler' },
	{ re: /^\s*(?:>\s*)?(?:\*\*)?bottom line\s*:/i, why: '"bottom line:" filler heading' },
	{ re: /\beffortless(?:ly)?\b/i, why: '"effortless" claim' },
	{ re: /\bunparalleled\b/i, why: '"unparalleled" claim' },
	{ re: /\b(?:take|takes|taking)\b[^.!?\n]{0,80}\bto the next level\b/i, why: '"take it to the next level" claim' },
	{ re: /\b(?:takes?|taking|took)\s+(?:just\s+|only\s+|mere\s+|a\s+few\s+|a\s+matter\s+of\s+)?seconds\b|\b(?:ready|done|set\s*up|running|installed|configured)\s+(?:in|within)\s+(?:just\s+|only\s+|mere\s+|a\s+few\s+|a\s+matter\s+of\s+)?seconds\b|\bmatter\s+of\s+seconds\b/i, why: '"takes seconds" claim with no measurement behind it' },
];
const STALE_GUIDANCE=[];
const full=process.argv.includes('--release'),failures=[];
const files=['README.md','CHANGELOG.md','SECURITY.md','PERF.md','NOTICE.md','native/hwmac/TESTING.md'];
function docs(directory){if(!fs.existsSync(directory))return;for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(file==='docs/release')continue;if(entry.isDirectory())docs(file);else if(/\.(?:md|html|yml)$/.test(file))files.push(file);}}
docs('docs');
const plugin='build/plugin',manifestPath=plugin+'/manifest.json';files.push(manifestPath);
for(const file of ['sensor-reading.html','sensor-dial.html','control.html','detail-slot.html'])files.push(plugin+'/ui/'+file);
if(full)files.push('MARKETPLACE.md','docs/release/STREAM_DECK_MARKETPLACE.md');
for(const file of files){if(!fs.existsSync(file)){failures.push(file+': missing');continue;}const text=fs.readFileSync(file,'utf8');text.split(/\r?\n/).forEach((raw,index)=>{let line=raw;for(const allow of GLYPH_ALLOW)line=line.replace(allow,'');for(const {re,why} of [...BANNED,...STALE_GUIDANCE])if(re.test(line))failures.push(`${file}:${index+1}: ${why}`);if(/HWiNFO|REALiX/.test(line))failures.push(`${file}:${index+1}: wrong product name`);});}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),lock=JSON.parse(fs.readFileSync('package-lock.json','utf8')),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(manifest.UUID!=='com.lawrensen.mac'||manifest.Description.length<250||manifest.Version!==pkg.version+'.0'||lock.version!==pkg.version||lock.packages[''].version!==pkg.version)failures.push('Manifest/package identity, description or version mismatch');
if(!fs.readFileSync('CHANGELOG.md','utf8').includes('## '+manifest.Version+' - '))failures.push('Missing changelog version');
for(const file of ['README.md',...(full?['docs/release/STREAM_DECK_MARKETPLACE.md']:[])]){const text=fs.readFileSync(file,'utf8');if(!/not affiliated/i.test(text)||!text.includes('Mac and macOS are trademarks of Apple Inc.'))failures.push(file+': missing trademark/non-affiliation statement');}
let privateCopy='not available in this checkout';
if(fs.existsSync('.private/copy-rule-hashes.json')&&fs.existsSync('docs/release/COPY_RULES.md')){
 const expected=JSON.parse(fs.readFileSync('.private/copy-rule-hashes.json','utf8')),text=fs.readFileSync('docs/release/COPY_RULES.md','utf8');
 for(const [title,hash] of Object.entries(expected)){
	const section=text.match(new RegExp('^## '+title+'\\r?\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))','m'))?.[0];
	if(section===undefined||createHash('sha256').update(section).digest('hex')!==hash)failures.push('Private copy section changed: '+title);
 }
 privateCopy='checked locally';
}else if(full)failures.push('Private copy-rule evidence is required for final publication');
if(full){for(const file of ['marketing/app-icon-288.png','marketing/thumbnail.png','marketing/shot-1-hero.png','marketing/shot-3-themes.png','marketing/shot-4-settings.png','marketing/shot-5-dials.png','marketing/shot-6-multi.png','marketing/shot-7-dial-views.png','marketing/shot-8-drilldown.png']){if(!fs.existsSync(file)){failures.push(file+': missing');continue;}const bytes=fs.readFileSync(file),size=file.includes('app-icon')?[288,288]:[1920,960];if(bytes.readUInt32BE(16)!==size[0]||bytes.readUInt32BE(20)!==size[1])failures.push(file+': wrong dimensions');}}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log(JSON.stringify({copy:'PASS',files:files.length,privateCopy,scope:full?'publication':'current public software candidate'}));
