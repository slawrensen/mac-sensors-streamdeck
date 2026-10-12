// Generate fixed setup pixels using the locally verified renderer and font.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
const [rendererPath]=process.argv.slice(2);
if(!rendererPath)throw new Error('A local verified renderer module is required');
const renderer=await import(pathToFileURL(rendererPath).href);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mac-setup-art-'));
try {
	const images={};
	for(const [kind,w,h] of [['key',144,144],['dial',200,100]]) {
		const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="black"/><path d="M${w/2-12} 22h24v24h-24z" fill="none" stroke="#4cc2ff" stroke-width="3"/><text x="${w/2}" y="${h===144?91:69}" text-anchor="middle" font-family="Tahoma" font-size="${h===144?16:17}" font-weight="700" fill="#d6d9de">Tahoma needed</text><text x="${w/2}" y="${h===144?116:90}" text-anchor="middle" font-family="Tahoma" font-size="12" font-weight="700" fill="#9ca3af">Open Font Book</text></svg>`;
		const file=path.join(temp,kind+'.png');await renderer.renderPNG(svg,w,h,file);
		images[kind]='data:image/png;base64,'+fs.readFileSync(file).toString('base64');
	}
	fs.writeFileSync('src/mac/setup-art.ts','// Generated fixed setup pixels. No font is needed to display these images.\nexport default '+JSON.stringify(images,null,2)+';\n');
} finally {renderer.closeQt();fs.rmSync(temp,{recursive:true,force:true});}
