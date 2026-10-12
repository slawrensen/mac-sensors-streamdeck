import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {DETAIL_PROFILES} from '../../src/detail/managed-profiles';
import {buildDetailProfileArchive,unzipStore} from '../../scripts/lib/detail-profile-archive';
test('Mac detail archives are deterministic, use their own identity and carry no sensor selection',()=>{
	const identifiers=new Set<string>();
	for(const profile of DETAIL_PROFILES) {
		const bytes=buildDetailProfileArchive(profile,3);assert.deepEqual(bytes,buildDetailProfileArchive(profile,3));
		assert.deepEqual(bytes,fs.readFileSync(`build/plugin/${profile.name}.streamDeckProfile`));
		const members=unzipStore(bytes);assert.equal(members.size,3);
		const metadata=JSON.parse(members.get('package.json')!.toString()) as {OSType:string;OSVersion:string;RequiredPlugins:string[]};
		assert.equal(metadata.OSType,'macOS');assert.equal(metadata.OSVersion,'27.0.1');assert.deepEqual(metadata.RequiredPlugins,['com.lawrensen.mac']);
		for(const [name,data] of members) {
			assert.doesNotMatch(data.toString(),/HWiNFO|com\.lawrensen\.hwinfo|readingKey|serialNumber|hardwareUUID/);
			if(name.endsWith('/manifest.json')){assert.ok(!identifiers.has(name));identifiers.add(name);}
		}
		const page=JSON.parse([...members.entries()].find(([name])=>/Profiles\/.*\/Profiles\//.test(name))![1].toString()) as {Controllers:{Type:string;Actions:Record<string,{UUID:string;Settings:Record<string,unknown>}>|null}[]};
		const keypad=page.Controllers.find(controller=>controller.Type==='Keypad')!.Actions!;assert.equal(Object.keys(keypad).length,profile.layout.columns*profile.layout.rows);
		assert.deepEqual(keypad['0,0']!.Settings,{detailRole:'back'});assert.equal(keypad['0,0']!.UUID,'com.lawrensen.mac.reading');
		if(profile.encoders)assert.equal(page.Controllers.find(controller=>controller.Type==='Encoder')?.Actions,null);
	}
});
