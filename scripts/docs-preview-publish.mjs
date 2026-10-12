// Publish a committed docs branch through the existing repository's Pages site.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const run=(...args)=>execFileSync(args[0],args.slice(1),{encoding:'utf8'}).trim();
const branch=process.argv[2]??run('git','branch','--show-current');
if(!branch||run('git','status','--porcelain'))throw new Error('Preview publication requires a clean committed branch');
const urls=new Set(run('git','remote','-v').split('\n').map(line=>line.split(/\s+/)[1]));if(urls.size!==1||!urls.has('https://github.com/slawrensen/mac-sensors-streamdeck.git'))throw new Error('Unexpected repository');
const tracked=run('git','ls-files','docs').split('\n');if(tracked.some(file=>file.startsWith('docs/release/')||file==='docs/CNAME'))throw new Error('Private or domain-owner path in docs');
const remote=run('git','ls-remote','origin','refs/heads/'+branch).split(/\s/)[0];if(remote!==run('git','rev-parse',branch))throw new Error('Push the exact docs branch before publishing');
fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/pages-before.json',run('gh','api','repos/slawrensen/mac-sensors-streamdeck/pages')+'\n');
run('gh','api','--method','PUT','repos/slawrensen/mac-sensors-streamdeck/pages','-f',`source[branch]=${branch}`,'-f','source[path]=/docs');
console.log('Pages now uses '+branch+'/docs; verify the deployment and restore main after merge.');
