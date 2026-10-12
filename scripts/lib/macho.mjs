import fs from 'node:fs';
/** Read bounded metadata from the selected thin Mach-O, without executing it. */
export function readMachO(file) {
	const bytes=fs.readFileSync(file);
	if(bytes.length<32||bytes.readUInt32LE(0)!==0xfeedfacf)throw new Error('Expected one thin 64-bit Mach-O');
	const cpu=bytes.readUInt32LE(4),architecture=cpu===0x100000c?'arm64':cpu===0x1000007?'x64':null;
	if(!architecture)throw new Error('Unsupported Mach-O architecture');
	const commands=bytes.readUInt32LE(16),commandBytes=bytes.readUInt32LE(20);
	if(commands>4096||32+commandBytes>bytes.length)throw new Error('Invalid Mach-O command bounds');
	let at=32,metadata,minimumOS,sdk,uuid;
	const text=(start,size)=>bytes.subarray(start,start+size).toString('utf8').split('\0')[0];
	for(let i=0;i<commands;i++) {
		if(at+8>32+commandBytes)throw new Error('Truncated Mach-O command');
		const kind=bytes.readUInt32LE(at),size=bytes.readUInt32LE(at+4);
		if(size<8||at+size>32+commandBytes)throw new Error('Invalid Mach-O command size');
		if(kind===0x32){if(size<24)throw new Error('Truncated build version');minimumOS=bytes.readUInt32LE(at+12);sdk=bytes.readUInt32LE(at+16);}
		if(kind===0x1b){if(size!==24)throw new Error('Invalid UUID command');uuid=bytes.subarray(at+8,at+24).toString('hex');}
		if(kind===0x19) {
			if(size<72)throw new Error('Truncated segment');const sections=bytes.readUInt32LE(at+64);
			if(72+sections*80>size)throw new Error('Invalid section bounds');
			for(let n=0;n<sections;n++) {
				const section=at+72+n*80;
				if(text(section,16)!=='__hwmac_meta')continue;
				if(metadata!==undefined)throw new Error('Duplicate addon metadata');
				const length=bytes.readBigUInt64LE(section+40),offset=bytes.readUInt32LE(section+48);
				if(length>16384n||BigInt(offset)+length>BigInt(bytes.length))throw new Error('Invalid addon metadata bounds');
				metadata=JSON.parse(text(offset,Number(length)));
			}
		}
		at+=size;
	}
	if(at!==32+commandBytes||!metadata||minimumOS===undefined||sdk===undefined||!uuid)throw new Error('Missing required Mach-O metadata');
	return {architecture,metadata,minimumOS,sdk,uuid,bytes};
}
export function versionText(value){return `${value>>>16}.${(value>>>8)&255}.${value&255}`;}
