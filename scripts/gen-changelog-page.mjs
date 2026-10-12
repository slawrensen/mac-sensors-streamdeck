import fs from 'node:fs';
const source=fs.readFileSync('CHANGELOG.md','utf8').replace(/^# Changelog\s*/,'');
fs.writeFileSync('docs/changelog.md','---\nlayout: default\ntitle: Changelog\nnav_order: 15\n---\n\n# Changelog\n\n'+source);
