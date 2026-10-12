/** Rendering fixtures for pinned slawrensen/hwinfo-streamdeck and the copied core. */
import fs from 'node:fs';
import path from 'node:path';
import { renderDial, renderDialOverview, renderDialTwoRow } from '../../src/ui/dial-renderer';
import { renderReadingKey, renderDualKey, renderQuadKey } from '../../src/ui/key-renderer';
import { setFaceFont } from '../../src/ui/face-font';
import { loadThemes, resolvePalette } from '../../src/ui/themes';
import { applyGlobalThemeSettings } from '../../src/ui/theme-store';
import { dialGalleryFixture } from '../lib/dial-gallery';
import { composeDialSvg, type DialSettings } from '../../src/actions/sensor-dial';
import { SessionStatsStore } from '../../src/stats';
import { replayTrace, standardSnapshot, type TraceFixture } from '../../test/replay';
const output:Record<string,string>={};
const config=loadThemes(),plain=resolvePalette(config,'void',null,'normal'),ember=resolvePalette(config,'ember','temperature','normal');
const cells=[{label:'CPU',valueText:'56.3',unitText:'°C',color:'#4CC2FF'},{label:'GPU',valueText:'48.2',unitText:'°C',color:'#FF7E8E'},{label:'Pump',valueText:'2850',unitText:'RPM',color:'#38CD89'},{label:'Power',valueText:'142',unitText:'W',color:'#D4AB33'}];
for(const font of ['segoe-ui','tahoma'] as const) {
	setFaceFont(font);
	const prefix=`legacy/${font}/`;
	const single={label:'CPU Package',valueText:'56.3',unitText:'°C',statBadge:'',palette:plain};
	output[prefix+'singlePlain']=renderReadingKey(single);
	output[prefix+'singleSparkline']=renderReadingKey({...single,history:[50,60,55,70,65]});
	output[prefix+'singleBadge']=renderReadingKey({...single,statBadge:'MAX',history:[50,60,55,70,65],palette:ember});
	output[prefix+'dual']=renderDualKey({top:{label:'CPU Package',valueText:'56.3',unitText:'°C',statBadge:''},bottom:{label:'GPU Temp',valueText:'48.2',unitText:'°C',statBadge:''},sharedBadge:'',palette:plain});
	output[prefix+'quad']=renderQuadKey({cells,palette:plain});output[prefix+'quadLabeled']=renderQuadKey({cells,labels:true,palette:plain});
	output[prefix+'dialNoThreshold']=renderDial({title:'CPU Package',valueText:'56.3',unitText:'°C',statsText:'▼ 41.2   ▲ 79.0   session',fraction:.42,palette:plain,barColor:plain.accent});
	output[prefix+'dialFullBar']=renderDial({title:'CPU Package',valueText:'79.0',unitText:'°C · MAX',statsText:'',fraction:1,palette:ember,barColor:ember.accent});
	output[prefix+'overview']=renderDialOverview({rows:[{label:'Temperature',valueText:'56.3',unitText:'°C',selected:true,valueColor:plain.value},{label:'Hot Spot',valueText:'62.1',unitText:'°C',selected:false,valueColor:plain.value},{label:'Memory',valueText:'48.0',unitText:'°C',selected:false,valueColor:plain.value}],contextText:'GPU',statsText:'▼41.2 ▲79.0',palette:plain});
	output[prefix+'twoRow']=renderDialTwoRow({rows:[{label:'CPU Package',valueText:'56.3',unitText:'°C',selected:true,valueColor:plain.value,history:[50,60,55]},{label:'GPU Temp',valueText:'48.2',unitText:'°C',selected:false,valueColor:plain.value}],footerText:'▼ 41.2  ▲ 79.0  session',palette:plain});
	const legacy=JSON.parse(fs.readFileSync('test/golden/legacy-faces.json','utf8')) as Record<string,string>;
	for(const key of Object.keys(legacy))if(!output[prefix+key])throw new Error('Unrendered golden '+key);
	const colorKeys=Object.keys(JSON.parse(fs.readFileSync('test/golden/dial-color-baseline.json','utf8')) as Record<string,string>);
	for(const key of colorKeys) {
		const [view,theme,textMode]=key.split('/');const fixture=dialGalleryFixture(view==='overview'?'overview':'tworow');
		fixture.state.settings={...fixture.state.settings,dialView:view,theme,textMode,textColor:'#123abc'} as DialSettings;
		applyGlobalThemeSettings({textFont:font,theme:'void',typeAccents:'on',textMode:'theme'});
		output[`dial-color/${font}/${key}`]=composeDialSvg(fixture.state,{state:'ok',snapshot:fixture.snapshot,source:'shared-memory'},fixture.historyOf);
	}
	for(const file of fs.readdirSync('test/traces').filter((name)=>name.endsWith('.json')).sort()) {
		const fixture=JSON.parse(fs.readFileSync(path.join('test/traces',file),'utf8')) as TraceFixture;
		for(let step=0;step<=fixture.events.length;step++) {
			const outcomes=replayTrace({...fixture,events:fixture.events.slice(0,step)});
			for(const [context,outcome] of outcomes) {
				const settings={...fixture.contexts[context]?.settings,readingKey:outcome.selection} as DialSettings;
				output[`trace/${font}/${file}/${step}/${context}`]=composeDialSvg({settings,stats:new SessionStatsStore(),statMode:outcome.statMode,overlay:null,pinned:outcome.pinned,cyclePaused:outcome.paused},{state:'ok',snapshot:standardSnapshot(),source:'shared-memory'});
			}
		}
	}
}
const target=process.argv[2];if(!target)throw new Error('Output JSON path required');fs.writeFileSync(target,JSON.stringify(output)+'\n');
console.log(JSON.stringify({faces:Object.keys(output).length,output:target}));
