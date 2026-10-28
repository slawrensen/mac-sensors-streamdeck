/** Sanitized Mac catalog labels with fixed sample values. No live hardware reads. */
import {compose, type ReadingSettings} from '../../src/actions/sensor-reading';
import {composeDialSvg, type DialSettings, type DialRenderState} from '../../src/actions/sensor-dial';
import {SensorType,type Reading,type SensorSnapshot} from '../../src/hwinfo/types';
import {SessionStatsStore} from '../../src/stats';
import {poller} from '#platform/poller';
import {applyGlobalThemeSettings,effectiveTextFor,getDeckTheme,measureOptionsFrom,typeAccentsEnabled} from '../../src/ui/theme-store';
import {loadThemes} from '../../src/ui/themes';
import {composeBackFace,composeChunkFace,composePagerFace,composeTitleFace,type DetailFaceContext} from '../../src/detail/detail-faces';
import {pageOf,projectDetailTiles,resolveDetailGroup} from '../../src/detail/detail-group';
import {DETAIL_PROFILES,readingSlotCapacity,type DetailNavRole} from '../../src/detail/managed-profiles';
import type {DetailPresentation,DeviceDetailState} from '../../src/detail/navigation';
export type Scene={id:string;kind:'key'|'dial';svg:string;description:string};
const smc=(key:string,meaning:string)=>`mac:v1:smc:Mac17%2C9:${Buffer.from(key).toString('hex')}:${meaning}.v1`;
/** The shipped provider's groups in its GROUPS order (src/mac/provider.ts); each group's sensor id is its position plus one. */
export const PROVIDER_GROUPS=['CPU','GPU','Memory','Storage','Network','Battery','Fans','System'] as const;
type ProviderGroup=typeof PROVIDER_GROUPS[number];
// Each row's group is the one the native side reports: SMC rows from native/hwmac/catalog.json, public rows from
// native/hwmac/collectors.c, and the counter rows (cpu-total, network-receive) from counterRows in src/mac/provider.ts.
export const sampleGroups:Record<string,ProviderGroup>={};
/** The fixed sample history behind sparklines, bar ranges and the dials' session line, by authoring index. */
const sampleHistory=(value:number,index:number)=>Array.from({length:36},(_,i)=>value*(.64+.36*i/35)+Math.sin(i*.6+index)*value*.025);
// Session statistics as MacProvider keeps them from its own accepted reads (statistics 'producer'): each current value lies
// inside its range. CPU super core 1, the one reading drawn with a bar and a dial session line, takes its statistics from that
// same history, so its MIN, MAX and AVG agree with them (39.9, 63.7, 51.3). The others are hand-picked ranges that suit each
// kind, such as a free-space minimum close to its current value.
const cpuHistory=sampleHistory(62.4,0);
const sampleRows:{key:string;label:string;unit:string;value:number;min:number;max:number;avg:number;type:SensorType;group:ProviderGroup}[]=[
	{key:smc('Tp00','temp'),label:'CPU super core 1',unit:'°C',value:62.4,min:Math.min(...cpuHistory),max:Math.max(...cpuHistory),avg:cpuHistory.reduce((sum,value)=>sum+value,0)/cpuHistory.length,type:SensorType.Temperature,group:'CPU'},
	{key:smc('Tg0U','temp'),label:'GPU 1',unit:'°C',value:54.8,min:36.2,max:57.3,avg:46.1,type:SensorType.Temperature,group:'GPU'},
	{key:smc('F0Ac','rpm'),label:'Fan 1',unit:'RPM',value:1820,min:1190,max:2160,avg:1610,type:SensorType.Fan,group:'Fans'},
	{key:smc('PSTR','power'),label:'System Total',unit:'W',value:38.6,min:9.8,max:64.2,avg:27.4,type:SensorType.Power,group:'System'},
	{key:'mac:v1:system:cpu-total',label:'CPU usage',unit:'%',value:37.5,min:2.6,max:91.4,avg:23.8,type:SensorType.Usage,group:'CPU'},
	{key:'mac:v1:system:memory-active',label:'Memory active',unit:'B',value:18_600_000_000,min:15_200_000_000,max:19_300_000_000,avg:17_400_000_000,type:SensorType.Other,group:'Memory'},
	{key:'mac:v1:system:network-receive',label:'Network receive',unit:'B/s',value:12_400_000,min:1_200,max:46_800_000,avg:3_900_000,type:SensorType.Other,group:'Network'},
	{key:'mac:v1:system:disk-root-available',label:'Startup volume available',unit:'B',value:856_000_000_000,min:853_400_000_000,max:856_200_000_000,avg:855_100_000_000,type:SensorType.Other,group:'Storage'}
];
// As the provider's rebuild(): only groups holding a reading become sensors, in GROUPS order.
const sampleSensorNames=PROVIDER_GROUPS.filter(group=>sampleRows.some(row=>row.group===group));
/** The scenes' authoring order; sampleSnapshot() publishes them in the provider's order. Reading ids are 0, as the provider sets them. */
export const sampleReadings:Reading[]=sampleRows.map(({group,min,max,avg,...row},index)=>{sampleGroups[row.key]=group;return {...row,id:0,sensorIndex:sampleSensorNames.indexOf(group),valueMin:min,valueMax:max,valueAvg:avg,statistics:'producer' as const,observationTime:1000,observationRevision:index+1};});
/** A snapshot shaped as MacProvider.rebuild() shapes one: sensors per present group, readings sorted by sensor then key. */
export function sampleSnapshot():SensorSnapshot {
	const sensors=sampleSensorNames.map((name,index)=>({index,id:PROVIDER_GROUPS.indexOf(name)+1,instance:0,name}));
	const readings=sampleReadings.map(row=>({...row})).sort((a,b)=>a.sensorIndex-b.sensorIndex||a.key.localeCompare(b.key));
	return {catalogRevision:1,pollTime:1,valueRevision:1,freshnessRevision:0,version:1,revision:1,sensors,readings,byKey:new Map(readings.map(row=>[row.key,row]))};
}
// Shared settings for every scene. Accents are off so faces compare across boards; the accents board alone turns on the shipped default.
const docsGlobals={theme:'void',textMode:'theme',typeAccents:'off',dataUnits:'decimal',textFont:'tahoma'} as const;
const STAT_CYCLE=['current','min','max','avg'] as const;
const readingFaceLabels=['CPU super 1','GPU 1','Fan 1','System Total','CPU activity','Memory active','Network RX','Free space'];
// The bundled 15-key detail profile, read from the one registry the runtime and profile generator use.
const standardDetail=DETAIL_PROFILES.find(profile=>profile.key==='standard')!;
type DetailCell={id:string;role:DetailNavRole}|{id:string;index:number};
/** Row-major cells of the 15-key page, so the board grid places each tile where the bundled profile does. */
function detailCells():DetailCell[] {
	const {columns,rows,nav,readings}=standardDetail.layout,cells:DetailCell[]=[];
	for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
		const role=(Object.keys(nav) as DetailNavRole[]).find(name=>nav[name]?.column===column&&nav[name]?.row===row),index=readings.findIndex(cell=>cell.column===column&&cell.row===row);
		cells.push(role!==undefined?{id:'detail-page-'+role,role}:{id:'detail-page-tile-'+index,index});
	}
	return cells;
}
export function composeScenes():Scene[] {
	applyGlobalThemeSettings(docsGlobals);
	const snapshot=sampleSnapshot(),status={state:'ok',snapshot,source:'mac'} as const,stats=new SessionStatsStore(),histories=new Map<string,number[]>();
	// Authoring order, not snapshot order, so every reading keeps its scene id and history phase.
	for(const [index,row] of sampleReadings.entries()){
		const history=sampleHistory(row.value,index);histories.set(row.key,history);for(const value of history)stats.sample(row.key,value);
		// Fixture-only history in this rendering process; no provider is opened.
		poller.subscribeSeries(row.key);const series=poller.getSeries(row.key) as number[];series.length=0;series.push(...history);
	}
	const scenes:Scene[]=[],key=(id:string,settings:ReadingSettings,description:string,back=false)=>scenes.push({id,kind:'key',svg:compose(settings,status,back),description});
	for(const [index,row] of sampleReadings.entries())key('reading-'+index,{readingKey:row.key,label:readingFaceLabels[index],displayMode:'sparkline'},row.label);
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
	const colored:DialRenderState={settings:{readingKey:sampleReadings[0]!.key,label:'CPU super 1',rotationKeys:sampleReadings.slice(0,3).map(row=>row.key),dialView:'overview',overviewLabels:'full',theme:'void',readingColors:Object.fromEntries(sampleReadings.slice(0,3).map((row,index)=>[row.key,['#4CC2FF','#FF7E8E','#38CD89'][index]!]))},stats,statMode:'current',overlay:null,pinned:false,cyclePaused:false};
	scenes.push({id:'dial-overview-colored',kind:'dial',svg:composeDialSvg(colored,status,key=>histories.get(key)??[]),description:'Individual number colors'});
	// No Mac code path raises access-denied, so it has no scene.
	for(const reason of ['pending','busy','no-readable-sensors','unsupported-platform','bridge-failed','font-missing','source-error'] as const)scenes.push({id:'status-'+reason,kind:'key',svg:compose({readingKey:sampleReadings[0]!.key},{state:'unavailable',reason,message:''}),description:reason});
	scenes.push({id:'status-missing',kind:'key',svg:compose({readingKey:'mac:v1:system:missing'},status),description:'Saved sensor missing'});
	// The detail page as DetailController paints it: an opener on CPU super 1 whose Press opens A custom list of the other
	// seven sample readings with Title tile text left blank, so the title is resolveDetailGroup's own default.
	// Opened from the top-left key, so no reading cell becomes a second Back tile.
	const opener={readingKey:sampleReadings[0]!.key,label:'CPU super 1',pressBehavior:'open-details',detailMode:'custom',detailKeys:sampleReadings.slice(1).map(row=>row.key)};
	const group=resolveDetailGroup(snapshot,opener)!,presentation:DetailPresentation={label:opener.label};
	const state:DeviceDetailState={deviceId:'docs',pageSize:readingSlotCapacity(standardDetail),density:1,tilePlan:[],primaryKey:group.primaryKey,groupSettings:opener,presentation,group,openerCell:{column:0,row:0},mirrorSlotIndex:null,offset:0,statModes:new Map(),surfaceCount:standardDetail.layout.columns*standardDetail.layout.rows,pending:false,dispatchedAt:0};
	const page=pageOf(state.group.keys,state.offset,state.pageSize,state.mirrorSlotIndex??undefined,state.density,projectDetailTiles(state.group,state.tilePlan));
	const ctx:DetailFaceContext={config:loadThemes(),deckThemeId:getDeckTheme(),typeAccents:typeAccentsEnabled(),measure:measureOptionsFrom(state.presentation),text:effectiveTextFor(state.presentation)};
	for(const cell of detailCells()){
		if('role' in cell){
			const svg=cell.role==='back'?composeBackFace(state,status,ctx):cell.role==='title'?composeTitleFace(state,page,ctx):composePagerFace(cell.role,page,state,ctx);
			scenes.push({id:cell.id,kind:'key',svg,description:'Detail page '+cell.role+' tile'});
		}else{
			const chunk=page.chunks[cell.index]??[];
			scenes.push({id:cell.id,kind:'key',svg:composeChunkFace(state,chunk,'current',status,ctx,page.specs[cell.index]),description:chunk.length?'Detail page reading tile: '+chunk.map(key=>snapshot.byKey.get(key)?.label).join(', '):'Detail page empty tile'});
		}
	}
	// The shipped default, Accent colors: By sensor type, on the same reading faces.
	applyGlobalThemeSettings({...docsGlobals,typeAccents:'on'});
	for(const [index,row] of sampleReadings.entries())key('accent-reading-'+index,{readingKey:row.key,label:readingFaceLabels[index],displayMode:'sparkline'},row.label+', accents by sensor type');
	applyGlobalThemeSettings(docsGlobals);
	// A press cycles the stat mode (settings.statMode); each face here is one step of that cycle.
	for(const statMode of STAT_CYCLE){
		key('stat-single-'+statMode,{readingKey:sampleReadings[0]!.key,label:'CPU super 1',displayMode:'sparkline',statMode},'CPU super 1, '+statMode);
		key('stat-dual-'+statMode,{...primary,keyLayout:'dual',quadLabels:true,statMode},'Dual layout, '+statMode);
	}
	return scenes;
}
export const boardDefinitions=[
	{id:'readme-hero',title:'Mac Sensors',subtitle:'Seven themes. Live readings on keys and dials. Hardware stays read-only.',scenes:['theme-void','theme-graphite','theme-ultraviolet','theme-midnight','theme-forest','theme-ember','theme-paper','layout-quad','reading-0','reading-1','reading-2','reading-3','reading-4','reading-5','reading-6','reading-7','layout-dual','layout-triple','ring','bar','warn','crit','back','detail-page-title','dial-single','dial-tworow','dial-overview','dial-overview-colored'],columns:8},
	{id:'hero',title:'Mac Sensors',subtitle:'Your Mac, on your keys and dials.',scenes:['reading-0','reading-1','reading-2','reading-4','dial-tworow'],columns:4},
	{id:'key-layouts',title:'Give each reading the space it needs',subtitle:'One, two, three or four readings on a key.',scenes:['reading-0','layout-dual','layout-triple','layout-quad','bar','ring','reading-5','reading-6'],columns:4},
	{id:'details',title:'Detail page on a 15-key Stream Deck',subtitle:'Back, title, Previous and Next, then a custom list of seven readings. The last four cells are empty.',scenes:detailCells().map(cell=>cell.id),columns:standardDetail.layout.columns,tile:144,gap:24,top:175},
	{id:'dials',title:'Turn through your reading set',subtitle:'Single, two-row and overview views with local session statistics.',scenes:['dial-single','dial-tworow','dial-overview'],columns:3},
	{id:'themes',title:'Choose the look that fits your desk',subtitle:'A shared default, with local choices when you want them.',scenes:['theme-void','theme-graphite','theme-ultraviolet','theme-midnight','theme-forest','theme-ember','theme-paper'],columns:4},
	{id:'alerts',title:'See when a reading crosses your threshold',subtitle:'Normal, warning and critical states. Hardware remains read-only.',scenes:['reading-0','warn','crit','bar'],columns:4},
	{id:'reading-colors',title:'Give readings their own number colors',subtitle:'The same readings and geometry. Only numeric fills change.',scenes:['dial-overview','dial-overview-colored'],columns:2},
	{id:'status',title:'Status screens on a key',subtitle:'Shown in place of the reading when there is no live value to draw.',scenes:['status-pending','status-busy','status-missing','status-no-readable-sensors','status-bridge-failed','status-font-missing','status-source-error'],columns:4},
	{id:'accents',title:'Accent colors by sensor type',subtitle:'The default setting. Trend lines take the reading type\'s color; Free space keeps the theme accent.',scenes:['accent-reading-0','accent-reading-1','accent-reading-2','accent-reading-3','accent-reading-4','accent-reading-5','accent-reading-6','accent-reading-7'],columns:4},
	{id:'stat-modes',title:'Pressing a key cycles current, MIN, MAX and AVG',subtitle:'MIN, MAX and AVG come from this session\'s reads. Below, two readings share one badge.',scenes:[...STAT_CYCLE.map(mode=>'stat-single-'+mode),...STAT_CYCLE.map(mode=>'stat-dual-'+mode)],columns:4}
];
