import fs from 'node:fs';
import path from 'node:path';
const pages=fs.readdirSync('docs').filter(file=>file.endsWith('.md')),errors=[];
for(const file of pages){const source=fs.readFileSync(path.join('docs',file),'utf8');if(!/^---\nlayout: default\n/.test(source))errors.push(file+': missing front matter');for(const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){const url=match[1];if(/^(?:https?:|#)/.test(url))continue;const target=url.split('#')[0].replace(/\.html$/,'.md');if(!fs.existsSync(path.join('docs',target)))errors.push(file+': missing '+url);}for(const match of source.matchAll(/!\[[^\]]*\]\([^)]*\)\n\n([^\n]+)/g))if(!/^\*(?:Production-rendered|Settings-panel capture|Hardware photograph)/.test(match[1]))errors.push(file+': image caption lacks kind');}
if(fs.existsSync('docs/CNAME'))errors.push('Project docs must inherit the umbrella domain');if(fs.existsSync('docs/.nojekyll'))errors.push('Jekyll must be enabled');
if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify({pages:pages.length,localLinks:'PASS',captions:'PASS'}));
