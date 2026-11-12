import assert from 'node:assert/strict';
import {test} from 'node:test';
import {statusDialText,statusScreen,statusSentence} from '../../src/mac/state-screens';
import {renderStatusKey} from '../../src/ui/key-renderer';
import type {PollerStatus} from '../../src/poller';
const unavailable=(reason:string):PollerStatus=>({state:'unavailable',reason,message:''} as PollerStatus);
test('a status face names the same first step as its panel hint',()=>{
	// Bridge failed: the hint asks to quit and reopen Stream Deck before reinstalling, so the key does too.
	const bridge=unavailable('bridge-failed');
	assert.deepEqual(statusScreen(bridge)?.lines,['Bridge failed','reopen Stream Deck']);
	assert.match(statusSentence(bridge),/^The native reader could not load\. Quit and reopen Stream Deck; if it still fails, reinstall/);
	// Source busy: the hint's step is Check again, as on the Not updating face.
	const busy=unavailable('busy');
	assert.deepEqual([statusScreen(busy)?.lines,statusDialText(busy)],[['Source busy','check again'],{title:'Source busy',value:'check again'}]);
	assert.match(statusSentence(busy),/Choose Check again\.$/);
	for(const reason of ['pending','busy','no-readable-sensors','access-denied','unsupported-platform','bridge-failed','font-missing','source-error']){
		const lines=statusScreen(unavailable(reason))?.lines;assert.ok(lines,reason);
		// Both lines draw whole on the key: no ellipsis.
		if(reason!=='font-missing')assert.deepEqual([...renderStatusKey({icon:'warning',accent:'#ff5d52',lines}).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(match=>match[1]),lines,reason);
	}
});
