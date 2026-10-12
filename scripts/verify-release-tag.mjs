// Ported release input gate from slawrensen/hwinfo-streamdeck at 11b9645b78395f157493648d873a3066673ba493.
import fs from 'node:fs';
const tag=process.env.RELEASE_TAG??'';
if(!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$(?![\s\S])/.test(tag))throw new Error('Release tag must be exactly vX.Y.Z');
const pkg=JSON.parse(fs.readFileSync('package.json')),lock=JSON.parse(fs.readFileSync('package-lock.json')),identity=JSON.parse(fs.readFileSync('identity.json'));
if(tag!=='v'+pkg.version||lock.version!==pkg.version||lock.packages[''].version!==pkg.version||identity.uuid!=='com.lawrensen.mac')throw new Error('Release versions or identity disagree');
const version=pkg.version+'.0';
if(!new RegExp('^## '+version.replaceAll('.','\\.')+' - \\d{4}-\\d{2}-\\d{2}[ \\t]*$','m').test(fs.readFileSync('CHANGELOG.md','utf8')))throw new Error('Release changelog entry must be dated');
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`version=${version}\npreview=${pkg.version.startsWith('0.')?'true':'false'}\n`);
console.log('Verified '+tag+' / '+version);
