import setupArt from './setup-art';
import type { PollerStatus } from '../poller';
import type { StatusKeyOptions } from '../ui/key-renderer';
export { keyLabel, noSelectionScreen } from '../ui/state-screens';
const COPY: Record<string, { lines: [string,string]; hint: string; accent: string; icon: StatusKeyOptions['icon'] }> = {
	pending: { lines: ['Reading sensors','please wait'], hint: 'Readings appear after the first successful sample.', accent:'#4cc2ff', icon:'clock' },
	busy: { lines: ['Source busy','retrying'], hint: 'The source is busy. Choose Check again to request another check.', accent:'#f5a623', icon:'clock' },
	'no-readable-sensors': { lines: ['No sensor data','copy report'], hint: 'No readable sensors were found. Choose Copy support report under Advanced, Support.', accent:'#f5a623', icon:'warning' },
	'access-denied': { lines: ['Access denied','copy report'], hint: 'macOS denied a read. Choose Copy support report under Advanced, Support.', accent:'#ff5d52', icon:'lock' },
	'unsupported-platform': { lines: ['Needs macOS','check requirements'], hint: 'This build needs a supported Mac and app version. Open Installation and requirements in the docs.', accent:'#ff5d52', icon:'warning' },
	'bridge-failed': { lines: ['Bridge failed','reinstall'], hint: 'The native reader could not load. Reinstall Mac Sensors, then choose Copy support report if it still fails.', accent:'#ff5d52', icon:'warning' },
	'font-missing': { lines: ['Tahoma needed','Open Font Book'], hint: 'Install Tahoma Bold in Font Book, then choose Check again.', accent:'#4cc2ff', icon:'warning' },
	'source-error': { lines: ['Source error','copy report'], hint: 'The sensor source could not be read. Choose Copy support report under Advanced, Support.', accent:'#ff5d52', icon:'warning' },
	stale: { lines: ['Not updating','check again'], hint: 'No recent measurement is available. Choose Check again.', accent:'#f5a623', icon:'clock' }
};
function copy(status: PollerStatus): typeof COPY[string] { return COPY[status.state === 'unavailable' ? status.reason : 'stale'] ?? COPY['source-error']!; }
export function statusScreen(status: PollerStatus): StatusKeyOptions | null { return status.state === 'ok' ? null : { ...copy(status), ...(status.state === 'unavailable' && status.reason === 'font-missing' ? {bitmapDataURI:setupArt.key} : {}) }; }
export function statusDialText(status: PollerStatus): {title:string;value:string;rasterSVG?:string} | null { const lines=copy(status).lines; return status.state === 'ok' ? null : {title:lines[0],value:lines[1],...(status.state === 'unavailable' && status.reason === 'font-missing' ? {rasterSVG:`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100"><image width="200" height="100" xlink:href="${setupArt.dial}"/></svg>`}: {})}; }
export function statusSentence(status: PollerStatus): string { return status.state === 'ok' ? '' : copy(status).hint; }
/** The saved reading is absent on this Mac: checking again cannot bring it back, so the face names the panel remedy (the shared copy's words). */
export function missingReadingScreen(): StatusKeyOptions { return {icon:'question',accent:'#f5a623',lines:['Sensor missing','pick again']}; }
