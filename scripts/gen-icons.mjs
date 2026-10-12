// Ported static action art from slawrensen/hwinfo-streamdeck at 11b9645b78395f157493648d873a3066673ba493.
// The pinned app mark remains unchanged. Unconfigured faces show no invented reading.
import fs from 'node:fs';
import path from 'node:path';
const source='com.lawrensen.mac.sdPlugin/imgs',destination=process.argv[2]??'build/plugin/imgs';
fs.cpSync(source,destination,{recursive:true});
for(const name of ['actions/reading/key.svg','actions/control/key.svg','actions/dial/dial.svg']) {
	const file=path.join(destination,name);let svg=fs.readFileSync(file,'utf8');
	if((svg.match(/HWiNFO/g)??[]).length!==1)throw new Error('Static action art anchor changed');
	svg=svg.replace('HWiNFO','Mac Sensors');
	if(name==='actions/reading/key.svg')svg=svg.replace('>62</text>','>?</text>').replace('>&#176;C</text>','>READING</text>');
	if(name==='actions/dial/dial.svg')svg=svg.replace('>62&#176;C</text>','>?</text>').replace('>&#9660;41  &#9650;64</text>','>READING</text>');
	fs.writeFileSync(file,svg);
}
