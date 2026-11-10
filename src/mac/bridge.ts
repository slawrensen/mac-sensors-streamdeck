import {allowTestNative,prepareNative} from '#platform/native-policy';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HwinfoError } from '../hwinfo/types';
import type { HwinfoUnavailableReason } from '../hwinfo/types';
import { NATIVE_PROTOCOL, NATIVE_VERSION, NATIVE_SOURCE_ID } from './native-contract';
import type { NativeBridge } from './native-api';
/** A failure the status screens report. The message says what failed, for the log and the support report; the user's steps live in state-screens.ts. */
export class MacSensorError extends HwinfoError {
	constructor(reason: HwinfoUnavailableReason, message: string) { super(reason,message); this.name='MacSensorsError'; }
}
let bridge: NativeBridge | undefined;
/** Runs one file read; any failure becomes a bridge failure that names the file, never the path or the system's text. */
function read<T>(load:()=>T,what:string):T {try{return load();}catch{throw new MacSensorError('bridge-failed',what);}}
let failure: MacSensorError | undefined;
export function validateNative(candidate: NativeBridge, architecture: string, allowTest = false): NativeBridge {
	const info=candidate.getBuildInfo();
	if(info.protocol!==NATIVE_PROTOCOL || info.version!==NATIVE_VERSION || info.sourceId!==NATIVE_SOURCE_ID || info.napi!==8 || info.arch!==architecture || info.platform!=='darwin' || (info.testHooks && !allowTest))throw new MacSensorError('bridge-failed','The native reader\'s build information does not match this plugin.');
	if(typeof candidate.open!=='function'||typeof candidate.now!=='function')throw new MacSensorError('bridge-failed','The native reader\'s interface is not the one this plugin uses.');
	return candidate;
}
export function getBridge(): NativeBridge {
	if(bridge)return bridge;
	if(failure)throw failure;
	try {
		if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw new MacSensorError('unsupported-platform','The Node runtime is not macOS on arm64 or x86_64.');
		const architecture=process.arch==='x64'?'x86_64':'arm64';
		const development=import.meta.url.endsWith('/src/mac/bridge.ts');
		const url=new URL(development?`../../build/native/production/hwmac-${architecture}.node`:`./hwmac-${architecture}.node`,import.meta.url);
		const contractUrl=new URL(development?'../../build/native/native-artifacts.json':'./native-artifacts.json',import.meta.url);
		const contract=read(()=>JSON.parse(readFileSync(contractUrl,'utf8')) as Record<string,string>,'The native file list native-artifacts.json is missing or unreadable.');
		const bytes=read(()=>readFileSync(url),'The native reader file is missing or unreadable.');
		if(createHash('sha256').update(bytes).digest('hex')!==contract[architecture])throw new MacSensorError('bridge-failed','The native reader file\'s SHA-256 does not match native-artifacts.json.');
		const require=createRequire(import.meta.url);
		bridge=prepareNative(validateNative(require(fileURLToPath(url)) as NativeBridge,process.arch,allowTestNative));
		return bridge;
	} catch(error) {
		// The loader's own text names files under the home folder, so only this fixed category is kept.
		failure=error instanceof MacSensorError?error:new MacSensorError('bridge-failed','macOS did not load the native reader file.');
		throw failure;
	}
}
