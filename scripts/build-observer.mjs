import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
if(process.platform!=='darwin')throw new Error('The observer requires macOS');
fs.mkdirSync('build/observer',{recursive:true});
const next=`build/observer/process-observer-${process.pid}.next`;
execFileSync('xcrun',['clang','-std=c11','-O2','-Wall','-Wextra','-Werror','native/observer/process-observer.c','-o',next],{stdio:'inherit'});
fs.renameSync(next,'build/observer/process-observer');
console.log('Built the development-only process observer');
