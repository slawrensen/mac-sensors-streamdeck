// A public-safe report from a completed private soak. Raw paths and IDs stay out.
import fs from 'node:fs';
import path from 'node:path';
import {summarizeSoak} from './lib/soak-analysis.mjs';
const [directory,packHash,packBytes,...options]=process.argv.slice(2);
if(!directory||!/^[a-f0-9]{64}$/.test(packHash??'')||!Number.isSafeInteger(Number(packBytes))||Number(packBytes)<=0||!(options.length===0||(options.length===2&&options[0]==='--csv')))throw new Error('Usage: perf-report <completed soak directory> <package SHA256> <package bytes> [--csv <new output file>]');
const summary=JSON.parse(fs.readFileSync(path.join(directory,'summary.json'))),state=JSON.parse(fs.readFileSync(path.join(directory,'state.json')));
const rows=fs.readFileSync(path.join(directory,'observations.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(row=>row.type==='sample');
const recomputed=summarizeSoak(rows);
for(const key of ['elapsedHours','samples','segments','flags','unexplained'])if(JSON.stringify(summary[key])!==JSON.stringify(recomputed[key]))throw new Error('Final summary differs from observations: '+key);
if(!rows.length||!recomputed.segments.length)throw new Error('No observed process metrics');
const slopes=summary.segments.map(s=>s.slopeMiBPer30Minutes).filter(x=>x!==null),max=field=>Math.max(...summary.segments.map(s=>s[field]));
const metrics=rows.flatMap(row=>row.metrics?[row.metrics]:[]),first=metrics[0],last=metrics.at(-1);
const flagCount=kind=>summary.flags.filter(flag=>flag.kind===kind).length;
const warn=rows.reduce((n,row)=>n+(row.logs?.warn??0),0),error=rows.reduce((n,row)=>n+(row.logs?.error??0),0);
const pass=recomputed.passed&&!summary.stoppedEarly&&summary.passed===true&&summary.newDiagnosticReports.length===0&&(summary.crashScanErrors?.length??0)===0;
const segmentNumber=new Map(summary.segments.map((segment,index)=>[segment.identity,index+1]));
if(options.length){
 const headings=['timestamp_utc','elapsed_minutes','process_segment','rss_bytes','footprint_bytes','file_descriptors','threads','cpu_user_ns','cpu_system_ns','idle_wakeups','interrupt_wakeups','fresh_sources','warn','error','flags','unexplained_flags'];
 const cells=value=>'"'+String(value??'').replaceAll('"','""')+'"';
 const lines=rows.map(row=>{const m=row.metrics;return [row.at,(row.continuousMs-rows[0].continuousMs)/60000,segmentNumber.get(row.identity),m?.rssBytes,m?.footprintBytes,m?.fileDescriptors,m?.threads,m?.cpuUserNs,m?.cpuSystemNs,m?.idleWakeups,m?.interruptWakeups,row.freshness?.valid??false,row.logs?.warn??0,row.logs?.error??0,(row.flags??[]).length,(row.flags??[]).filter(flag=>!flag.explained).length].map(cells).join(',');});
 fs.writeFileSync(options[1],[headings.join(','),...lines].join('\n')+'\n',{flag:'wx'});
}
const mib=value=>(value/1048576).toFixed(2)+' MiB';
const command='npm run soak -- --plugin <frozen dev directory> --out <evidence directory> --hours '+state.hours+' --interval-ms '+state.intervalMs;
console.log(`### ${state.startedAt.slice(0,10)}: Mac candidate observation

Command: \`${command}\`. Package SHA-256: ${packHash} (${packBytes} bytes). Development bundle SHA-256: ${state.files['bin/plugin.js']}.

| Measure | Result |
| --- | --- |
| Window | ${state.startedAt} to ${rows.at(-1).at}; ${summary.elapsedHours.toFixed(3)} hours, ${summary.samples} samples |
| Maximum measured RSS slope | ${slopes.length?Math.max(...slopes).toFixed(3)+' MiB per 30 minutes':'not enough data'} |
| RSS start / close | ${mib(first.rssBytes)} / ${mib(last.rssBytes)} |
| Maximum RSS | ${mib(max('maxRss'))} |
| Maximum footprint | ${mib(max('maxFootprint'))} |
| File descriptors start / close / maximum | ${first.fileDescriptors} / ${last.fileDescriptors} / ${Math.max(...metrics.map(m=>m.fileDescriptors))} |
| Maximum threads | ${Math.max(...metrics.map(m=>m.threads))} |
| CPU time across measured process segments | ${summary.segments.reduce((n,s)=>n+s.cpuSeconds,0).toFixed(2)} seconds |
| Observed process identity changes | ${rows.filter(row=>row.restarted).length} |
| WARN / ERROR lines | ${warn} / ${error} |
| Sampling gaps / freshness flags | ${flagCount('sampling-gap')} / ${flagCount('freshness')} |
| Unexplained flags | ${summary.unexplained} |
| Resource/freshness gate | ${pass?'PASS':'NOT PASSED'} |

Each observed process segment is kept, including warm-up. A segment shorter than 30 minutes has no fitted slope.

| Segment | Samples | Hours | RSS start / close | MiB per 30 minutes |
| --- | --- | --- | --- | --- |
${summary.segments.map((s,i)=>`| ${i+1} | ${s.samples} | ${s.durationHours.toFixed(3)} | ${mib(s.rssStart)} / ${mib(s.rssEnd)} | ${s.slopeMiBPer30Minutes===null?'not measurable':s.slopeMiBPer30Minutes.toFixed(3)} |`).join('\n')}

Scope: actual app development identity. Physical gestures, Intel hardware and owner-only events require separate evidence. Event records: ${(summary.events??[]).length}; their presence alone does not verify recovery. New diagnostic reports: ${summary.newDiagnosticReports.length}; scan errors: ${summary.crashScanErrors?.length??0}; review: ${summary.crashReview}. ${summary.stoppedEarly?'The observation was stopped early.':'The observer completed its requested window.'}
`);
