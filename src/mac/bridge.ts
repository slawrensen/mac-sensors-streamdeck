import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HwinfoError } from '../hwinfo/types';
import type { HwinfoUnavailableReason } from '../hwinfo/types';
import { NATIVE_PROTOCOL, NATIVE_VERSION, NATIVE_SOURCE_ID } from './native-contract';
import type { NativeBridge } from './native-api';
export class MacSensorError extends HwinfoError {
	constructor(reason: HwinfoUnavailableReason, message: string) { super(reason,message); this.name='MacSensorsError'; }
}
let bridge: NativeBridge | undefined;
let failure: MacSensorError | undefined;
export function validateNative(candidate: NativeBridge, architecture: string, allowTest = false): NativeBridge {
	const info=candidate.getBuildInfo();
	if(info.protocol!==NATIVE_PROTOCOL || info.version!==NATIVE_VERSION || info.sourceId!==NATIVE_SOURCE_ID || info.napi!==8 || info.arch!==architecture || info.platform!=='darwin' || (info.testHooks && !allowTest))throw new MacSensorError('bridge-failed','The native reader does not match this plugin. Reinstall Mac Sensors.');
	if(typeof candidate.open!=='function'||typeof candidate.now!=='function')throw new MacSensorError('bridge-failed','The native reader has an unsupported interface. Reinstall Mac Sensors.');
	return candidate;
}
export function getBridge(): NativeBridge {
	if(bridge)return bridge;
	if(failure)throw failure;
	try {
		if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw new MacSensorError('unsupported-platform','This build needs a supported Mac and app version.');
		const architecture=process.arch==='x64'?'x86_64':'arm64';
		const development=import.meta.url.endsWith('/src/mac/bridge.ts');
		const url=new URL(development?`../../build/native/production/hwmac-${architecture}.node`:`./hwmac-${architecture}.node`,import.meta.url);
		const contractUrl=new URL(development?'../../build/native/native-artifacts.json':'./native-artifacts.json',import.meta.url);
		const contract=JSON.parse(readFileSync(contractUrl,'utf8')) as Record<string,string>;
		const bytes=readFileSync(url);
		if(createHash('sha256').update(bytes).digest('hex')!==contract[architecture])throw new MacSensorError('bridge-failed','The native reader file does not match this plugin. Reinstall Mac Sensors.');
		const require=createRequire(import.meta.url);
		bridge=validateNative(require(fileURLToPath(url)) as NativeBridge,process.arch);
		return bridge;
	} catch(error) {
		failure=error instanceof MacSensorError?error:new MacSensorError('bridge-failed','The native reader could not load. Reinstall Mac Sensors.');
		throw failure;
	}
}
