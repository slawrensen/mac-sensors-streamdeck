export function slopeMiBPer30Minutes(samples) {
	if(samples.length<3)return null;
	const start=samples[0].continuousMs,x=samples.map(row=>(row.continuousMs-start)/1_800_000),y=samples.map(row=>row.rssBytes/1048576);
	if(x.at(-1)<1)return null;
	const mx=x.reduce((a,b)=>a+b,0)/x.length,my=y.reduce((a,b)=>a+b,0)/y.length;
	const denominator=x.reduce((sum,value)=>sum+(value-mx)**2,0);if(!denominator)return null;
	return x.reduce((sum,value,index)=>sum+(value-mx)*(y[index]-my),0)/denominator;
}
export function summarizeSoak(rows,{minimumHours=24}={}) {
	const samples=rows.filter(row=>row.type==='sample'),groups=new Map();
	for(const row of samples.filter(row=>row.metrics)){const id=row.identity;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row.metrics);}
	const segments=[...groups].map(([identity,metrics])=>({identity,samples:metrics.length,durationHours:(metrics.at(-1).continuousMs-metrics[0].continuousMs)/3_600_000,slopeMiBPer30Minutes:slopeMiBPer30Minutes(metrics),rssStart:metrics[0].rssBytes,rssEnd:metrics.at(-1).rssBytes,maxRss:Math.max(...metrics.map(r=>r.rssBytes)),maxFootprint:Math.max(...metrics.map(r=>r.footprintBytes)),fdStart:metrics[0].fileDescriptors,fdEnd:metrics.at(-1).fileDescriptors,cpuSeconds:(metrics.at(-1).cpuUserNs+metrics.at(-1).cpuSystemNs-metrics[0].cpuUserNs-metrics[0].cpuSystemNs)/1e9}));
	const elapsedHours=samples.length<2?0:(samples.at(-1).continuousMs-samples[0].continuousMs)/3_600_000;
	const flags=samples.flatMap(row=>row.flags??[]),unexplained=flags.filter(flag=>!flag.explained);
	const measurable=segments.filter(segment=>segment.slopeMiBPer30Minutes!==null);
	return {scope:'External real-process observations; manual events and physical-device scope are separate',elapsedHours,samples:samples.length,segments,flags,unexplained:unexplained.length,passed:elapsedHours>=minimumHours&&samples.length>=Math.floor(minimumHours*60)&&measurable.length>0&&measurable.every(segment=>segment.slopeMiBPer30Minutes<1)&&unexplained.length===0};
}
