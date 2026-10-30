// Derived documentation images: crops of the pinned boards and panel captures,
// and favicon sizes of the shipped plugin icon. Pages show these; the full
// sources stay the image-viewer targets. Rerun after any source image changes:
//
//   npm run docs:crops
//
// Each output is recorded in docs/assets/img/crops/provenance.json with its
// source path and SHA-256, the regions cut from it, and its own SHA-256 and
// size. test/mac/docs-crops.test.mjs recomputes every output from its source.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';

export const IMAGE_ROOT = 'docs/assets/img';
export const PROVENANCE = path.join(IMAGE_ROOT, 'crops', 'provenance.json');
/** Margin kept around a board's content box, in source pixels. */
const BOARD_MARGIN_PX = 24;
/** A board's content box, from its first key or dial to its last, widened by the margin. */
const board = (left, top, right, bottom) => ({left: left - BOARD_MARGIN_PX, top: top - BOARD_MARGIN_PX, width: right - left + 2 * BOARD_MARGIN_PX, height: bottom - top + 2 * BOARD_MARGIN_PX});
/** An exact source rectangle given by its corners. */
const box = (left, top, right, bottom) => ({left, top, width: right - left, height: bottom - top});
const ICON = 'com.lawrensen.mac.sdPlugin/imgs/plugin/marketplace@2x.png';

/**
 * Outputs are relative to IMAGE_ROOT; sources are repository paths. A crop
 * stacks its regions top to bottom; a resize scales the whole source.
 */
export const DERIVED = [
	// Homepage cards: one readable part of each board or capture.
	{output: 'crops/key-layouts-top-row.png', source: 'docs/assets/img/key-layouts.png', regions: [box(196, 180, 1084, 396)]},
	{output: 'crops/dials-two-row.png', source: 'docs/assets/img/dials.png', regions: [box(454, 252, 826, 448)]},
	{output: 'crops/details-top-rows.png', source: 'docs/assets/img/details.png', regions: [box(222, 165, 1058, 497)]},
	{output: 'crops/settings-control-header.png', source: 'docs/assets/img/settings-control.png', regions: [box(0, 0, 756, 300)]},
	// Homepage gallery: each board without its baked title, subtitle and footer.
	{output: 'crops/readme-hero.png', source: 'docs/assets/img/readme-hero.png', regions: [board(72, 190, 1528, 933)]},
	{output: 'crops/themes.png', source: 'docs/assets/img/themes.png', regions: [board(206, 190, 1074, 614)]},
	{output: 'crops/accents.png', source: 'docs/assets/img/accents.png', regions: [board(206, 190, 1074, 614)]},
	{output: 'crops/reading-colors.png', source: 'docs/assets/img/reading-colors.png', regions: [board(276, 262, 1004, 438)]},
	{output: 'crops/stat-modes.png', source: 'docs/assets/img/stat-modes.png', regions: [board(206, 190, 1074, 614)]},
	// Sensor Dial page: the Display section of the reading-colors capture, through
	// the last color row; and the settings header above the Display section.
	{output: 'crops/settings-reading-colors-display.png', source: 'docs/assets/img/settings-reading-colors.png', regions: [box(0, 1266, 756, 2450)]},
	{output: 'crops/settings-dial-display.png', source: 'docs/assets/img/settings-dial.png', regions: [box(0, 0, 756, 210), box(0, 1266, 756, 2518)]},
	// Favicon and touch icon sizes of the shipped plugin icon.
	{output: 'brand/mac-sensors-icon-16.png', source: ICON, resize: {width: 16, height: 16}},
	{output: 'brand/mac-sensors-icon-32.png', source: ICON, resize: {width: 32, height: 32}},
	{output: 'brand/mac-sensors-icon-180.png', source: ICON, resize: {width: 180, height: 180}}
];

/** SHA-256 of a file's bytes, so a changed source or output is detected. */
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Decodes the derived image's pixels from its source, so the test can compare without trusting encoder bytes. */
export async function derivePixels(entry) {
	if (!fs.existsSync(entry.source)) throw new Error(`Missing source ${entry.source} for ${entry.output}`);
	const meta = await sharp(entry.source).metadata();
	if (entry.resize) {
		const {data, info} = await sharp(entry.source).resize(entry.resize.width, entry.resize.height, {fit: 'fill', kernel: 'lanczos3'}).raw().toBuffer({resolveWithObject: true});
		return {data, width: info.width, height: info.height, channels: info.channels};
	}
	if (!entry.regions?.length) throw new Error(`${entry.output} has neither regions nor a resize`);
	const parts = [];
	for (const region of entry.regions) {
		if (region.left < 0 || region.top < 0 || region.left + region.width > meta.width || region.top + region.height > meta.height) {
			throw new Error(`${entry.output}: region ${JSON.stringify(region)} lies outside ${entry.source} (${meta.width}x${meta.height})`);
		}
		parts.push(await sharp(entry.source).extract(region).raw().toBuffer({resolveWithObject: true}));
	}
	const width = parts[0].info.width;
	if (parts.some(part => part.info.width !== width || part.info.channels !== parts[0].info.channels)) throw new Error(`${entry.output}: stacked regions must share one width and channel count`);
	return {data: Buffer.concat(parts.map(part => part.data)), width, height: parts.reduce((sum, part) => sum + part.info.height, 0), channels: parts[0].info.channels};
}

/** Encodes derived pixels as PNG with fixed options. */
export async function encode(pixels) {
	return sharp(pixels.data, {raw: {width: pixels.width, height: pixels.height, channels: pixels.channels}}).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
}

/** Writes every derived image, then the provenance record that pins it. */
async function main() {
	const records = [];
	for (const entry of DERIVED) {
		const pixels = await derivePixels(entry), bytes = await encode(pixels), file = path.join(IMAGE_ROOT, entry.output);
		fs.mkdirSync(path.dirname(file), {recursive: true});
		const next = file + '.next';
		fs.writeFileSync(next, bytes);
		fs.renameSync(next, file);
		records.push({
			file: entry.output,
			source: {file: entry.source, sha256: sha256(fs.readFileSync(entry.source))},
			...(entry.resize ? {resize: entry.resize} : {regions: entry.regions}),
			width: pixels.width,
			height: pixels.height,
			bytes: bytes.length,
			sha256: sha256(bytes)
		});
		console.log(`Derived ${file} (${pixels.width}x${pixels.height}, ${bytes.length} bytes)`);
	}
	const provenance = {schema: 1, command: 'npm run docs:crops', kind: 'Crops and resizes of pinned documentation images; each keeps its source image kind', images: records};
	fs.writeFileSync(PROVENANCE, JSON.stringify(provenance, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
