import type {NativeBridge} from './native-api';
export const allowTestNative=false;
export function prepareNative(bridge:NativeBridge):NativeBridge{return bridge;}
