// Source checks for the public docs: front matter, local links (Markdown and
// HTML, including Liquid relative_url), image alt text and kind-first captions,
// the grouped navigation and the layout-owned page heading.
import fs from 'node:fs';
import path from 'node:path';
const KIND = /^(?:Production-rendered|Settings-panel capture|Hardware photograph)/;
const pages = fs.readdirSync('docs').filter(file => file.endsWith('.md')), errors = [];
const plain = html => html.replace(/<[^>]+>/g, '').replace(/\*\*?/g, '').trim();
/** Resolves a docs-relative or Liquid relative_url link to a source file, or null for links it does not own. */
function sourceFor(url) {
	const liquid = /^\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}$/.exec(url);
	if (liquid) url = liquid[1].replace(/^\//, '') || 'index.html';
	else if (/^(?:[a-z]+:|#|\{\{)/i.test(url)) return null;
	const target = url.split('#')[0];
	if (target === '') return null;
	return target.endsWith('.html') ? target.replace(/\.html$/, '.md') : target;
}
for (const file of pages) {
	const source = fs.readFileSync(path.join('docs', file), 'utf8');
	if (!/^---\nlayout: default\n/.test(source)) errors.push(file + ': missing front matter');
	const body = source.replace(/^---\n[\s\S]*?\n---\n/, '');
	if (/^# /m.test(body.replace(/```[\s\S]*?```/g, ''))) errors.push(file + ': the layout renders the page title as its only h1; remove the body "# " heading');
	const links = [...source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g), ...source.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(match => match[1]);
	for (const url of links) {
		const target = sourceFor(url);
		if (target !== null && !fs.existsSync(path.join('docs', target))) errors.push(file + ': missing ' + url);
	}
	for (const match of source.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)) if (!match[1].trim()) errors.push(file + ': image without alt text');
	for (const match of source.matchAll(/!\[[^\]]*\]\([^)]*\)\n\n([^\n]+)/g)) if (!/^\*(?:Production-rendered|Settings-panel capture|Hardware photograph)/.test(match[1])) errors.push(file + ': image caption lacks kind');
	for (const match of source.matchAll(/<img\b[^>]*>/g)) if (!/\salt="[^"]+"/.test(match[0])) errors.push(file + ': HTML image without alt text');
	for (const match of source.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/g)) {
		if (!/<img\b/.test(match[1])) continue;
		const caption = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(match[1]);
		if (!caption || !KIND.test(plain(caption[1]))) errors.push(file + ': figure caption lacks kind');
	}
	for (const match of source.matchAll(/\sdata-image-caption="([^"]*)"/g)) if (!KIND.test(match[1])) errors.push(file + ': viewer caption lacks kind');
}
const navigation = fs.readFileSync('docs/_data/navigation.yml', 'utf8'), navigated = [...navigation.matchAll(/^\s+url: (\S+)$/gm)].map(match => match[1]);
for (const url of navigated) if (!fs.existsSync(path.join('docs', url === '/' ? 'index.md' : url.replace(/^\//, '').replace(/\.html$/, '.md')))) errors.push('navigation: missing page ' + url);
for (const file of pages) if (file !== '404.md' && !navigated.includes(file === 'index.md' ? '/' : '/' + file.replace(/\.md$/, '.html'))) errors.push('navigation: ' + file + ' is not listed');
if (new Set(navigated).size !== navigated.length) errors.push('navigation: a page is listed twice');
if (fs.existsSync('docs/CNAME')) errors.push('Project docs must inherit the umbrella domain');
if (fs.existsSync('docs/.nojekyll')) errors.push('Jekyll must be enabled');
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({pages: pages.length, localLinks: 'PASS', captions: 'PASS', navigation: navigated.length}));
