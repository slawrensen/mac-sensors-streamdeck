// Owner upload kit from published release assets only. This performs no upload.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {payloadOf,validatePack} from './lib/pack-validation.mjs';
const tag=process.argv[2];if(!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$(?![\s\S])/.test(tag??''))throw new Error('Expected a published vX.Y.Ztag');
const release=JSON.parse(execFileSync('gh',['api',`repos/slawrensen/mac-sensors-streamdeck/releases/tags/${tag}`],{encoding:'utf8'}));if(release.draft||!release.published_at)throw new Error('Owner uploads must use a published release');
const out=path.resolve('release','upload-'+tag.slice(1)+'.0');if(fs.existsSync(out))throw new Error('Upload directory already exists; preserve it for review');fs.mkdirSync(out,{recursive:true});
execFileSync('gh',['release','download',tag,'--repo','slawrensen/mac-sensors-streamdeck','--pattern','com.lawrensen.mac.streamDeckPlugin','--pattern','native-manifest.json','--pattern','SHA256SUMS.txt','--dir',out],{stdio:'inherit'});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const line of fs.readFileSync(path.join(out,'SHA256SUMS.txt'),'utf8').trim().split('\n')){const match=line.match(/^([a-f0-9]{64})\s+[* ]?([^/\\]+)$/);if(!match||hash(fs.readFileSync(path.join(out,match[2])))!==match[1])throw new Error('Published release checksum mismatch');}
const pack=fs.readFileSync(path.join(out,'com.lawrensen.mac.streamDeckPlugin')),native=JSON.parse(fs.readFileSync(path.join(out,'native-manifest.json')));validatePack({archiveBytes:pack,packageVersion:tag.slice(1),sourceId:native.sourceId});
const vt=path.join(out,'virustotal');fs.mkdirSync(vt);fs.writeFileSync(path.join(vt,'com.lawrensen.mac.streamDeckPlugin'),pack);const members=payloadOf(pack);
if(native.entries.length!==2||new Set(native.entries.map(entry=>entry.file)).size!==2)throw new Error('Invalid native member inventory');
for(const entry of native.entries){if(!['hwmac-arm64.node','hwmac-x86_64.node'].includes(entry.file))throw new Error('Unexpected native filename');const bytes=members.get('bin/'+entry.file);if(!bytes||hash(bytes)!==entry.sha256)throw new Error('Published native manifest differs');fs.writeFileSync(path.join(vt,entry.file),bytes);}
const gallery=['shot-1-hero.png','shot-6-multi.png','shot-8-drilldown.png','shot-4-settings.png','shot-7-dial-views.png','shot-3-themes.png'];
for(const file of ['app-icon-288.png','thumbnail.png',...gallery])fs.copyFileSync(path.join('marketing',file),path.join(out,file));
const listing=fs.readFileSync('docs/release/STREAM_DECK_MARKETPLACE.md','utf8');for(const [heading,file] of [['Name and tagline','name-and-tagline.txt'],['Description','description.txt'],['First release update notes','release-notes.txt'],['Feature bullets','features.txt'],['Portal fields','portal-fields.txt']]){const escaped=heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),text=listing.match(new RegExp('^## '+escaped+'\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))','m'))?.[1];if(!text)throw new Error('Missing listing section '+heading);fs.writeFileSync(path.join(out,file),text.trim()+'\n');}
fs.copyFileSync('docs/release/OWNER-MEDIA.md',path.join(out,'OWNER-MEDIA.md'));
fs.writeFileSync(path.join(out,'staging.json'),JSON.stringify({tag,releaseUrl:release.html_url,publishedAt:release.published_at,packageSha256:hash(pack),packageBytes:pack.length,galleryOrder:gallery,ownerOnly:['Hardware photograph, inserted after details','Demo video and thumbnail','VirusTotal uploads','Marketplace submission and DRM install']},null,2)+'\n');console.log(out);
