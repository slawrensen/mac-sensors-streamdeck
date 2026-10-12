// Mac equivalents of the pinned upstream e2e check and app-info helpers.
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function makeCheck(onFail) { return (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ': '+detail : ''}`); if (!ok) onFail(name); }; }
export function buildInfo({devices,plugin={uuid:'com.lawrensen.mac',version:'0.9.90.0'}}) {return {application:{font:'Tahoma',language:'en',platform:'mac',platformVersion:'27.0.1',version:'7.5.0.22885'},colors:{},devicePixelRatio:1,devices,plugin};}
