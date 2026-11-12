import fs from 'node:fs';
/** Every key family the Mac poller traces (src/mac/poller.ts TRACE_SOURCES): the measured Mac17,9 has rows in all four on every read. */
export const REQUIRED_SOURCES=['system','smc','health','computed'];
// Trace evidence must come from genuine published acquisitions in this PID.
export function readFreshness(file,continuousMs,{maximumAgeMs=15_000,required=REQUIRED_SOURCES}={}) {
	if(!fs.existsSync(file))return {valid:false,reason:'trace-missing',sources:[]};
	const size=fs.statSync(file).size,length=Math.min(size,1024*1024),buffer=Buffer.alloc(length),fd=fs.openSync(file,'r');
	try{if(fs.readSync(fd,buffer,0,length,size-length)!==length)throw new Error('Short trace read');}finally{fs.closeSync(fd);}
	let newest=null;const lines=buffer.toString('utf8').split('\n');
	for(let i=lines.length-1;i>=0;i--){try{const row=JSON.parse(lines[i]);if(row.event==='sourceObservation'){newest={...row,evidence:JSON.parse(row.note)};break;}}catch{/* Partial first/last line is not an observation. */}}
	if(!newest)return {valid:false,reason:'no-source-observation',sources:[]};
	if(typeof continuousMs==='function')continuousMs=continuousMs();
	if(!Array.isArray(newest.evidence.sources)||!Number.isFinite(continuousMs))return {valid:false,reason:'invalid-evidence',sources:[]};
	const sources=newest.evidence.sources.map(source=>({...source,ageMs:Number.isFinite(source.acquired)?continuousMs-source.acquired:null}));
	const valid=required.every(name=>sources.some(source=>source.source===name&&source.rows>0&&Number.isFinite(source.ageMs)&&source.ageMs>=0&&source.ageMs<=maximumAgeMs&&Number.isSafeInteger(source.observation)&&source.observation>0));
	return {valid,reason:valid?null:'missing-or-expired-source',wall:newest.wall,sources};
}
