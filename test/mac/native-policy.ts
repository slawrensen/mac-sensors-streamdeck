/** Test bundle only. This module is forbidden in every shipping archive. */
import fs from 'node:fs';
import type {NativeBridge,NativePacket,NativeSource} from '../../src/mac/native-api';
export const allowTestNative=true;
interface Fixture {public?:{value?:number;fault?:number;delayMs?:number};smc?:{value?:number;fault?:number;delayMs?:number};hold?:NativeSource[];}
interface FakeBridge extends NativeBridge {configure(fixture:Fixture):void;}
export function prepareNative(bridge:NativeBridge):NativeBridge {
	(globalThis as {__MAC_SENSORS_TEST_BUILD__?:boolean}).__MAC_SENSORS_TEST_BUILD__=true;
	if(!bridge.getBuildInfo().testHooks)throw new Error('Test bundle requires the isolated fake addon');
	const fake=bridge as FakeBridge;
	const read=():Fixture=>{const file=process.env.MACSENSORS_TEST_FIXTURE;if(!file)throw new Error('Test fixture path missing');const bytes=fs.readFileSync(file);if(bytes.length>16384)throw new Error('Test fixture too large');return JSON.parse(bytes.toString('utf8')) as Fixture;};
	return {getBuildInfo:()=>bridge.getBuildInfo(),now:()=>bridge.now(),open:()=>{
		const session=bridge.open();let closed=false;
		const held:Array<{source:NativeSource;packet:NativePacket;resolve:(packet:NativePacket)=>void;reject:(error:Error)=>void}>=[];
		const timer=setInterval(()=>{const fixture=read();for(let index=held.length-1;index>=0;index--){const item=held[index]!;if(!fixture.hold?.includes(item.source)){held.splice(index,1);item.resolve(item.packet);}}},50).unref();
		return {read:async(source)=>{const fixture=read();fake.configure(fixture);const packet=await session.read(source);if(closed)throw new Error('Test session closed');if(fixture.hold?.includes(source))return new Promise<NativePacket>((resolve,reject)=>held.push({source,packet,resolve,reject}));return packet;},close:()=>{closed=true;clearInterval(timer);for(const item of held)item.reject(new Error('Test session closed'));held.length=0;session.close();}};
	}};
}
