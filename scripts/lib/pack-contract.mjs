// Ported from slawrensen/hwinfo-streamdeck scripts/lib/pack-contract.mjs at 11b9645b78395f157493648d873a3066673ba493.
export const PLUGIN_UUID='com.lawrensen.mac';
export const PLUGIN_ROOT=PLUGIN_UUID+'.sdPlugin';
export const SHIPPED_MEMBERS=Object.freeze([
	'LICENSE','NOTICE.md','manifest.json','themes.json',
	'bin/plugin.js','bin/package.json','bin/native-artifacts.json','bin/hwmac-arm64.node','bin/hwmac-x86_64.node',
	'imgs/actions/control/icon.svg','imgs/actions/control/key.svg','imgs/actions/dial/dial.svg','imgs/actions/dial/icon.svg','imgs/actions/reading/icon.svg','imgs/actions/reading/key.svg','imgs/plugin/category-icon.svg','imgs/plugin/marketplace.png','imgs/plugin/marketplace@2x.png',
	'layouts/sensor-dial.json',
	...['mini','standard','neo','plus','xl','plus-xl'].map(key=>`profiles/detail-r3-${key}.streamDeckProfile`),
	...['control.html','detail-slot.html','sensor-dial.html','sensor-reading.html','pi-command.js','pi-common.js','pi-control.js','pi-model.js','pi-shell.js','pi-slot.js','pi.css','sdpi-components.js'].map(file=>'ui/'+file)
]);
export const TEXT_MEMBER_PATTERN=/\.(?:js|html|css|json|svg|md)$|^LICENSE$/;
export const FORBIDDEN_MEMBER_PATTERNS=[/(?:^|\/)(?:logs|test|src|native|node_modules|\.git|design|review|docs)\//i,/\.(?:log|pdb|dSYM|o|a|dylib|pem|key|p12|pfx|ttf|otf)$/i,/hwmac[-_](?:test|wrong)|koffi|\.next|\.staging|\.DS_Store/i];
