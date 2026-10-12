// Mac port of the mock-app capability from slawrensen/hwinfo-streamdeck scripts/e2e-harness.mjs and scripts/lib/e2e-common.mjs at 11b9645b78395f157493648d873a3066673ba493.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function until(predicate,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await sleep(20);}throw new Error('Mock-host condition timed out');}
export function decodeSvg(value){return typeof value==='string'&&value.startsWith('data:image/svg+xml,')?decodeURIComponent(value.slice('data:image/svg+xml,'.length)):null;}
export async function startMock({directory='build/test-plugin',fixture={},globals={theme:'void',pollIntervalMs:'250'},node=process.env.MACSENSORS_NODE??process.execPath}={}) {
	const root=path.resolve(directory),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'mac-mock-')),fixturePath=path.join(scratch,'fixture.json');
	const setFixture=value=>{const next=fixturePath+'.next';fs.writeFileSync(next,JSON.stringify(value));fs.renameSync(next,fixturePath);};setFixture(fixture);
	const uuid=randomUUID(),messages=[],output=[];let ws;
	const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(resolve=>server.once('listening',resolve));const port=server.address().port;
	if(port===23654)throw new Error('Refusing the real app port');
	const info={application:{font:'Tahoma',language:'en',platform:'mac',platformVersion:'27.0.1',version:'7.5.0.22885'},colors:{},devicePixelRatio:1,devices:[{id:'test-keypad',type:0,size:{columns:5,rows:3},name:'Test keypad'},{id:'test-dials',type:13,size:{columns:9,rows:4},name:'Test dials'}],plugin:{uuid:'com.lawrensen.mac',version:JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).Version}};
	server.on('connection',socket=>{ws=socket;socket.on('message',bytes=>{const message=JSON.parse(bytes.toString());messages.push(message);if(message.event==='getGlobalSettings')socket.send(JSON.stringify({event:'didReceiveGlobalSettings',payload:{settings:globals}}));if(message.event==='setGlobalSettings')globals=message.payload;});});
	const child=spawn(node,['bin/plugin.js','-port',String(port),'-pluginUUID',uuid,'-registerEvent','registerPlugin','-info',JSON.stringify(info)],{cwd:root,env:{...process.env,MACSENSORS_TEST_FIXTURE:fixturePath},stdio:['ignore','pipe','pipe']});
	child.stdout.on('data',bytes=>output.push(bytes.toString()));child.stderr.on('data',bytes=>output.push(bytes.toString()));
	let exit;child.on('exit',(code,signal)=>{exit={code,signal};});
	try{await until(()=>messages.some(message=>message.event==='registerPlugin')||exit!==undefined);if(exit)throw new Error('Plugin exited before registration: '+output.join(''));}catch(error){if(child.exitCode===null)child.kill('SIGTERM');server.close();throw error;}
	const send=value=>{if(!ws||ws.readyState!==1)throw new Error('Mock socket is closed');ws.send(JSON.stringify(value));};
	const contexts=new Map();
	const appear=(context,kind,settings={},coordinate=0)=>{const action='com.lawrensen.mac.'+kind,device=kind==='dial'?'test-dials':'test-keypad',controller=kind==='dial'?'Encoder':'Keypad';const record={action,context,device,settings,coordinates:{column:coordinate,row:0},controller};contexts.set(context,record);send({event:'willAppear',action,context,device,payload:{settings,coordinates:record.coordinates,controller,isInMultiAction:false}});};
	const event=(context,name,payload={})=>{const record=contexts.get(context);if(!record)throw new Error('Unknown test context');send({event:name,action:record.action,context,device:record.device,payload:{settings:record.settings,coordinates:record.coordinates,controller:record.controller,...payload}});};
	const settings=(context,value)=>{const record=contexts.get(context);record.settings=value;event(context,'didReceiveSettings',{settings:value});};
	const pi=context=>{const record=contexts.get(context);send({event:'propertyInspectorDidAppear',action:record.action,context,device:record.device});};
	const request=(context,payload)=>{const record=contexts.get(context);send({event:'sendToPlugin',action:record.action,context,device:record.device,payload});};
	const svg=context=>{const message=messages.filter(item=>item.context===context&&(item.event==='setImage'||item.event==='setFeedback')).at(-1);return decodeSvg(message?.payload?.image??message?.payload?.canvas);};
	const closeSocket=()=>{for(const socket of server.clients)socket.close();};
	const stop=async()=>{closeSocket();await sleep(100);if(!exit){await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(4000)]);}if(!exit){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(2000)]);}if(!exit){child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));}for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));fs.rmSync(scratch,{recursive:true,force:true});};
	return {root,child,messages,output,send,appear,event,settings,pi,request,svg,setFixture,closeSocket,stop,exit:()=>exit,hash:createHash('sha256').update(fs.readFileSync(path.join(root,'bin/plugin.js'))).digest('hex')};
}
