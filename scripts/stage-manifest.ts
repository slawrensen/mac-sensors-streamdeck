import fs from 'node:fs';
import path from 'node:path';
import {DETAIL_PROFILES} from '../src/detail/managed-profiles';
const identity=JSON.parse(fs.readFileSync('identity.json','utf8')) as {name:string;uuid:string;author:string;docs:string;nodeMajor:string;minimumMacOS:string;minimumApp:string};
const version=(JSON.parse(fs.readFileSync('package.json','utf8')) as {version:string}).version+'.0';
const states=(image:string,title='middle'):unknown[]=>[{Image:image,TitleAlignment:title}];
const manifest={
	$schema:'https://schemas.elgato.com/streamdeck/plugins/manifest.json',UUID:identity.uuid,Name:identity.name,Version:version,Author:identity.author,
	Description:'Read available temperatures, fan speeds, voltages, current, power and system activity on your Stream Deck. Put one to four readings on a key, add a sparkline, bar or ring, and choose colors and alert thresholds. Dials can show one reading or a compact list, with local session statistics and touch controls. Open a detail page from a key and return with Back. Available sensors depend on the Mac and macOS version. Mac Sensors reads hardware without changing settings or controlling fans; no administrator access or separate monitoring app is required.',
	Category:identity.name,CategoryIcon:'imgs/plugin/category-icon',CodePath:'bin/plugin.js',Icon:'imgs/plugin/marketplace',URL:identity.docs,SDKVersion:3,
	Software:{MinimumVersion:identity.minimumApp},OS:[{Platform:'mac',MinimumVersion:identity.minimumMacOS}],Nodejs:{Version:identity.nodeMajor},
	Actions:[
		{Name:'Sensor Reading',UUID:identity.uuid+'.reading',Icon:'imgs/actions/reading/icon',Tooltip:'Show one to four sensor readings on a key, with colors, alerts and optional graphs.',PropertyInspectorPath:'ui/sensor-reading.html',Controllers:['Keypad'],UserTitleEnabled:false,States:states('imgs/actions/reading/key')},
		{Name:'Sensor Control',UUID:identity.uuid+'.control',Icon:'imgs/actions/control/icon',Tooltip:'Steer Sensor Dials from a key, pedal or Multi Action: change readings, pause cycling, pin or reset local statistics.',PropertyInspectorPath:'ui/control.html',Controllers:['Keypad'],States:states('imgs/actions/control/key','bottom')},
		{Name:'Sensor Detail Slot',UUID:identity.uuid+'.detail-slot',Icon:'imgs/actions/reading/icon',Tooltip:'A tile inside the bundled sensor detail pages.',PropertyInspectorPath:'ui/detail-slot.html',VisibleInActionsList:false,UserTitleEnabled:false,SupportedInMultiActions:false,Controllers:['Keypad'],States:states('imgs/actions/reading/key')},
		{Name:'Sensor Dial',UUID:identity.uuid+'.dial',Icon:'imgs/actions/dial/icon',Tooltip:'Show a sensor or a list on the touchscreen. Rotate to choose a reading and press to reset local session statistics.',PropertyInspectorPath:'ui/sensor-dial.html',Controllers:['Encoder'],UserTitleEnabled:false,Encoder:{layout:'layouts/sensor-dial.json',Icon:'imgs/actions/dial/dial',TriggerDescription:{Rotate:'Cycle readings (set or sensor)',Push:'Reset session min/max',Touch:'Cycle stat mode',LongTouch:'Back to current value'}},States:[{Image:'imgs/actions/dial/dial'}]}
	],
	Profiles:DETAIL_PROFILES.flatMap(profile=>[profile.deviceType,...profile.guestDeviceTypes].map(DeviceType=>({Name:profile.name,DeviceType,AutoInstall:false,DontAutoSwitchWhenInstalled:false,Readonly:false})))
};
const target=process.argv[2]??'build/plugin';fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,'\t')+'\n');
