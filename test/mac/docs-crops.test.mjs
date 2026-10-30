// Derived documentation images stay reproducible from their pinned sources.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import {DERIVED, IMAGE_ROOT, PROVENANCE, derivePixels, sha256} from '../../scripts/docs-crops.mjs';

const record = JSON.parse(fs.readFileSync(PROVENANCE, 'utf8'));

test('the provenance pins every derived image, in table order', () => {
	assert.equal(record.schema, 1);
	assert.deepEqual(record.images.map(image => image.file), DERIVED.map(entry => entry.output));
	for (const [index, entry] of DERIVED.entries()) {
		const image = record.images[index];
		assert.equal(image.source.file, entry.source, image.file);
		assert.deepEqual(image.regions, entry.regions, image.file);
		assert.deepEqual(image.resize, entry.resize, image.file);
	}
});

test('every derived image is recomputed from its current source, pixel for pixel', async () => {
	for (const image of record.images) {
		const entry = DERIVED.find(row => row.output === image.file);
		assert.equal(sha256(fs.readFileSync(image.source.file)), image.source.sha256, `${image.file}: ${image.source.file} changed; run npm run docs:crops`);
		const bytes = fs.readFileSync(path.join(IMAGE_ROOT, image.file));
		assert.equal(sha256(bytes), image.sha256, image.file);
		assert.equal(bytes.length, image.bytes, image.file);
		const expected = await derivePixels(entry);
		const {data, info} = await sharp(bytes).raw().toBuffer({resolveWithObject: true});
		assert.deepEqual([info.width, info.height, info.channels], [expected.width, expected.height, expected.channels], image.file);
		assert.deepEqual([image.width, image.height], [info.width, info.height], image.file);
		assert.ok(data.equals(expected.data), `${image.file}: pixels differ from the recorded crop of ${image.source.file}`);
	}
});

test('the crops folder and brand folder publish only pinned images', () => {
	const pinned = new Set(record.images.map(image => image.file));
	assert.deepEqual(fs.readdirSync(path.join(IMAGE_ROOT, 'crops')).filter(name => name !== 'provenance.json').map(name => 'crops/' + name).sort(), [...pinned].filter(file => file.startsWith('crops/')).sort());
	// The 256 px mark is the shipped icon itself (docs-tools.test.mjs); the other sizes are derived from it.
	assert.deepEqual(fs.readdirSync(path.join(IMAGE_ROOT, 'brand')).sort(), ['mac-sensors-icon-256.png', ...[...pinned].filter(file => file.startsWith('brand/')).map(file => file.slice('brand/'.length))].sort());
});

test('pages show each crop and keep its full source one click away', () => {
	const pages = fs.readdirSync('docs').filter(name => name.endsWith('.md')).map(name => fs.readFileSync(path.join('docs', name), 'utf8')).join('\n');
	for (const entry of DERIVED.filter(row => row.output.startsWith('crops/'))) {
		const source = '/' + path.relative('docs', entry.source);
		const link = new RegExp(`href="\\{\\{ '${source.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}' \\| relative_url \\}\\}"[^>]*>\\s*<img src="\\{\\{ '/assets/img/${entry.output.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}' \\| relative_url \\}\\}"`);
		assert.match(pages, link, `${entry.output} is shown inside a link to ${source}`);
	}
});
