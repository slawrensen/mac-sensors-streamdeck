import fs from 'node:fs';
// The docs layout renders the page title as the h1 (id "changelog"), so the
// generated body starts at the first release heading.
const source=fs.readFileSync('CHANGELOG.md','utf8').replace(/^# Changelog\s*/,'');
fs.writeFileSync('docs/changelog.md','---\nlayout: default\ntitle: Changelog\nnav_order: 15\ndescription: "Changes in each Mac Sensors release, newest first."\n---\n\n'+source);
