import os from 'node:os';
import {PLUGIN_NAME} from './identity';
export const runtime = {
	displayName: PLUGIN_NAME, environmentPrefix: 'MACSENSORS_', platformName: 'macOS', forceTahoma: true, legacyFontFits: false,
	statisticsNotice: (_source: string): string | null => { void _source; return 'Historical statistics unavailable'; },
	errorText: (_error: unknown): string => { void _error; return 'unavailable; choose Copy support report'; }
};
export function environment(name: string): string | undefined { return process.env[runtime.environmentPrefix + name]; }
export function runtimeFacts(): Record<string, string | number> {
	return { nodeVersion: process.version, processArchitecture: process.arch, platform: process.platform, osRelease: os.release(), nodePath: process.execPath.startsWith(os.homedir() + '/') ? '~' + process.execPath.slice(os.homedir().length) : '<runtime>/node' };
}
