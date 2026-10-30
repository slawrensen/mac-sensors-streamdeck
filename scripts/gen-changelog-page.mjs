import fs from 'node:fs';
// The docs layout renders the page title as the h1 (id "changelog"), so the
// generated body starts at the first release heading.
// A release heading whose date was corrected keeps its earlier id as an empty
// target just above it, so links made before the correction still land there.
const ALIASES = {'1.0.1.0': ['1010---2026-10-27']};
let source = fs.readFileSync('CHANGELOG.md', 'utf8').replace(/^# Changelog\s*/, '');
for (const [version, ids] of Object.entries(ALIASES)) {
	const heading = new RegExp(`^## ${version.replaceAll('.', '\\.')} - `, 'm');
	if (!heading.test(source)) throw new Error(`CHANGELOG.md has no ${version} heading for its alias`);
	source = source.replace(heading, match => ids.map(id => `<div id="${id}"></div>\n`).join('') + '\n' + match);
}
fs.writeFileSync('docs/changelog.md', '---\nlayout: default\ntitle: Changelog\nnav_order: 15\ndescription: "Changes in each Mac Sensors release, newest first."\n---\n\n' + source);
