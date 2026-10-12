/** Sanitized Mac catalog labels with fixed sample values. No live hardware reads. */
import {compose, type ReadingSettings} from '../../src/actions/sensor-reading';
import {composeDialSvg, type DialSettings, type DialRenderState} from '../../src/actions/sensor-dial';
import {SensorType,type Reading,type SensorSnapshot} from '../../src/hwinfo/types';
import {SessionStatsStore} from '../../src/stats';
import {poller} from '#platform/poller';
import {applyGlobalThemeSettings} from '../../src/ui/theme-store';
import {renderDetailTitleKey,renderDetailPagerKey} from '../../src/ui/detail-renderer';
import {loadThemes,resolvePalette} from '../../src/ui/themes';
import {themeTextColors} from '../../src/ui/text-colors';
export type Scene={id:string;kind:'key'|'dial';svg:string;description:string};
const smc=(key:string,meaning:string)=>`mac:v1:smc:Mac17%2C9:${Buffer.from(key).toString('hex')}:${meaning}.v1`;
export const sampleReadings:Reading[]=[
	{key:smc('Tp00','temp'),label:'CPU super core 1',unit:'°C',value:62.4,type:SensorType.Temperature},
	{key:smc('Tg0U','temp'),label:'GPU 1',unit:'°C',value:54.8,type:SensorType.Temperature},
	{key:smc('F0Ac','rpm'),label:'Fan 1',unit:'RPM',value:1820,type:SensorType.Fan},
	{key:smc('PSTR','power'),label:'System Total',unit:'W',value:38.6,type:SensorType.Power},
	{key:'mac:v1:system:cpu-total',label:'CPU usage',unit:'%',value:37.5,type:SensorType.Usage},
	{key:'mac:v1:system:memory-active',label:'Memory active',unit:'B',value:18_600_000_000,type:SensorType.Other},
	{key:'mac:v1:system:network-receive',label:'Network receive',unit:'B/s',value:12_400_000,type:SensorType.Other},
	{key:'mac:v1:system:disk-root-available',label:'Startup volume available',unit:'B',value:856_000_000_000,type:SensorType.Other}
].map((row,index)=>({...row,id:index+1,sensorIndex:index<4?0:1,valueMin:NaN,valueMax:NaN,valueAvg:NaN,statistics:'unavailable' as const,observationTime:1000,observationRevision:index+1}));
export function sampleSnapshot():SensorSnapshot {const readings=sampleReadings.map(row=>({...row}));return {pollTime:1,version:1,revision:1,valueRevision:1,sensors:[{index:0,id:1,instance:0,name:'Mac sensors'},{index:1,id:2,instance:0,name:'System'}],readings,byKey:new Map(readings.map(row=>[row.key,row]))};}
export function composeScenes():Scene[] {
	applyGlobalThemeSettings({theme:'void',textMode:'theme',typeAccents:'off',dataUnits:'decimal',textFont:'tahoma'});
	const snapshot=sampleSnapshot(),status={state:'ok',snapshot,source:'mac'} as const,stats=new SessionStatsStore(),histories=new Map<string,number[]>();
	for(const [index,row] of snapshot.readings.entries()){
		const history=Array.from({length:36},(_,i)=>row.value*(.64+.36*i/35)+Math.sin(i*.6+index)*row.value*.025);histories.set(row.key,history);for(const value of history)stats.sample(row.key,value);
		// Fixture-only history in this rendering process; no provider is opened.
		poller.subscribeSeries(row.key);const series=poller.getSeries(row.key) as number[];series.length=0;series.push(...history);
	}
	const scenes:Scene[]=[],key=(id:string,settings:ReadingSettings,description:string,back=false)=>scenes.push({id,kind:'key',svg:compose(settings,status,back),description});
	for(const [index,row] of snapshot.readings.entries())key('reading-'+index,{readingKey:row.key,label:['CPU super 1','GPU 1','Fan 1','System Total','CPU activity','Memory active','Network RX','Free space'][index],displayMode:'sparkline'},row.label);
	const primary={readingKey:sampleReadings[0]!.key,label:'CPU super 1',secondaryReadingKey:sampleReadings[1]!.key,secondaryLabel:'GPU 1',quadReadingKey3:sampleReadings[2]!.key,quadLabel3:'Fan 1',quadReadingKey4:sampleReadings[4]!.key,quadLabel4:'CPU'};
	for(const keyLayout of ['dual','triple','quad'])key('layout-'+keyLayout,{...primary,keyLayout,quadLabels:true,...(keyLayout==='triple'?{label:'CPU',secondaryLabel:'GPU',quadLabel3:'Fan'}:{})},keyLayout+' layout');
	key('bar',{readingKey:sampleReadings[4]!.key,displayMode:'bar',warnValue:'65',critValue:'85'},'CPU activity bar');
	key('ring',{readingKey:sampleReadings[4]!.key,displayMode:'ring',warnValue:'65',critValue:'85'},'CPU activity ring');
	key('warn',{readingKey:sampleReadings[0]!.key,label:'CPU super 1',warnValue:'60',critValue:'80',displayMode:'bar'},'Warning sample');
	key('crit',{readingKey:sampleReadings[0]!.key,label:'CPU super 1',warnValue:'40',critValue:'60',displayMode:'bar'},'Critical sample');
	key('back',{readingKey:sampleReadings[0]!.key,label:'CPU super 1'},'Configurable Back tile',true);
	for(const theme of ['void','graphite','ultraviolet','midnight','forest','ember','paper'])key('theme-'+theme,{readingKey:sampleReadings[0]!.key,label:'CPU super 1',theme,displayMode:'sparkline'},theme+' theme');
	for(const dialView of ['single','tworow','overview']){
		const settings:DialSettings={readingKey:sampleReadings[0]!.key,label:'CPU super 1',rotationKeys:sampleReadings.slice(0,3).map(row=>row.key),dialView,overviewLabels:'full',theme:'void',...(dialView==='single'?{warnValue:'75',critValue:'90'}:{})};
		const state:DialRenderState={settings,stats,statMode:'current',overlay:null,pinned:false,cyclePaused:false};scenes.push({id:'dial-'+dialView,kind:'dial',svg:composeDialSvg(state,status,key=>histories.get(key)??[]),description:dialView+' dial view'});
	}
	for(const reason of ['pending','busy','no-readable-sensors','access-denied','unsupported-platform','bridge-failed','font-missing','source-error'] as const)scenes.push({id:'status-'+reason,kind:'key',svg:compose({readingKey:sampleReadings[0]!.key},{state:'unavailable',reason,message:''}),description:reason});
	scenes.push({id:'status-missing',kind:'key',svg:compose({readingKey:'mac:v1:system:missing'},status),description:'Saved sensor missing'});
	const palette=resolvePalette(loadThemes(),'void',null,'normal');
	scenes.push({id:'detail-title',kind:'key',svg:renderDetailTitleKey({title:'Mac sensors',rangeText:'1-8 / 38',palette,text:themeTextColors(palette)}),description:'Detail page title'},{id:'detail-next',kind:'key',svg:renderDetailPagerKey({direction:'next',enabled:true,palette,text:themeTextColors(palette)}),description:'Next detail page'});
	return scenes;
}
export const boardDefinitions=[
	{id:'hero',title:'Mac Sensors',subtitle:'Your Mac, on your keys and dials.',scenes:['reading-0','reading-1','reading-2','reading-4','dial-tworow'],columns:4},
	{id:'key-layouts',title:'Give each reading the space it needs',subtitle:'One, two, three or four readings on a key.',scenes:['reading-0','layout-dual','layout-triple','layout-quad','bar','ring','reading-5','reading-6'],columns:4},
	{id:'details',title:'A closer look, one press away',subtitle:'Reading cells, a configurable Back tile and clear navigation.',scenes:['back','detail-title','reading-1','detail-next','layout-dual','layout-triple','layout-quad','reading-3'],columns:4},
	{id:'dials',title:'Turn through your reading set',subtitle:'Single, two-row and overview views with local session statistics.',scenes:['dial-single','dial-tworow','dial-overview'],columns:3},
	{id:'themes',title:'Choose the look that fits your desk',subtitle:'A shared default, with local choices when you want them.',scenes:['theme-void','theme-graphite','theme-ultraviolet','theme-midnight','theme-forest','theme-ember','theme-paper'],columns:4},
	{id:'alerts',title:'See when a reading crosses your threshold',subtitle:'Normal, warning and critical states. Hardware remains read-only.',scenes:['reading-0','warn','crit','bar'],columns:4},
	{id:'status',title:'A reason when a reading is unavailable',subtitle:'Saved selections stay saved. No stale value is promoted to live.',scenes:['status-pending','status-busy','status-missing','status-no-readable-sensors','status-access-denied','status-bridge-failed','status-font-missing','status-source-error'],columns:4}
];
