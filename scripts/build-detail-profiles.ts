// Ported from slawrensen/hwinfo-streamdeck scripts/build-detail-profiles.ts at 11b9645b78395f157493648d873a3066673ba493.
import fs from 'node:fs';
import path from 'node:path';
import {DETAIL_PROFILES,DETAIL_PROFILE_REVISION} from '../src/detail/managed-profiles';
import {buildDetailProfileArchive} from './lib/detail-profile-archive';
const directory=process.argv[2]??'build/plugin',uuid=process.argv[3]??'com.lawrensen.mac';
if(!['com.lawrensen.mac','com.lawrensen.macdev'].includes(uuid))throw new Error('Unknown profile identity');
for(const profile of DETAIL_PROFILES) {
	const target=path.join(directory,`${profile.name}.streamDeckProfile`);fs.mkdirSync(path.dirname(target),{recursive:true});
	fs.writeFileSync(target,buildDetailProfileArchive(profile,DETAIL_PROFILE_REVISION,uuid));
}
console.error(`Generated ${DETAIL_PROFILES.length} current-revision detail profiles`);
