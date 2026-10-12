// Verify the framed native source identity against all current native build inputs.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
export function verifyNativeSources(record) {
	const inputs=fs.readdirSync('native/hwmac').filter(file=>/\.(?:c|h)$/.test(file)||['catalog.json','binding.gyp'].includes(file)).map(file=>'native/hwmac/'+file).concat('scripts/build-native.mjs').sort();
	if(JSON.stringify(inputs)!==JSON.stringify(record.sourceFiles.map(file=>file.path).sort()))throw new Error('Native source inventory changed; rebuild');
	const hash=createHash('sha256');
	for(const file of inputs) {
		if(fs.lstatSync(file).isSymbolicLink())throw new Error('Native source symlinks are not allowed');
		const bytes=fs.readFileSync(file),expected=record.sourceFiles.find(item=>item.path===file);
		if(createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw new Error(`Native source changed: ${file}; rebuild`);
		hash.update(`${Buffer.byteLength(file)}:${file}:${bytes.length}:`).update(bytes);
	}
	const actual=hash.digest('hex');if(actual!==record.sourceId)throw new Error('Native source ID mismatch');return actual;
}
if(process.argv[1]?.endsWith('/native-source-id.mjs'))console.log(verifyNativeSources(JSON.parse(fs.readFileSync('build/native/build-record.json','utf8'))));
