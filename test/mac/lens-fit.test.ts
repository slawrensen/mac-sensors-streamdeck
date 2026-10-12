import assert from 'node:assert/strict';
import {test} from 'node:test';
import {faceFont} from '../../src/ui/face-font';
import {inksWithin} from '../../src/ui/format';
import {inKeyLens,quadValueFontSize,renderReadingKey,renderQuadKey} from '../../src/ui/key-renderer';
import {renderDetailTitleKey} from '../../src/ui/detail-renderer';
import {loadThemes,resolvePalette} from '../../src/ui/themes';
import {themeTextColors} from '../../src/ui/text-colors';
const palette=resolvePalette(loadThemes(),'void',null,'normal'),text=themeTextColors(palette);
test('Mac labels do not inherit Windows historical overscan exceptions',()=>{
	assert.equal(faceFont().preserveLegacyFits,false);
	for(const label of ['CPU Package','Memory active','Network receive']){
		const svg=renderReadingKey({label,valueText:'25.3',unitText:'GB',statBadge:'',palette});
		const match=svg.match(/<text[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/);assert.ok(match);
		assert.ok(inKeyLens([{text:match[2]!,fontSize:Number(match[1])}]),label);
		assert.match(svg,/>25\.3<\/text>/);
	}
});
test('quad values retain their digits inside both outer lens margins',()=>{
	for(const center of [36,108])for(const value of ['1762','-999','88.8','9999','N/A']){
		const size=quadValueFontSize(value,false,center);
		assert.ok(size>=12);
		assert.ok(inksWithin([{text:value,fontSize:size,fontWeight:700}],'middle',center,Math.max(10,center-26),Math.min(133,center+26)),value);
	}
	const svg=renderQuadKey({cells:[{label:'CCD1',valueText:'1762',unitText:'RPM',color:'#4CC2FF'}],labels:true,palette});
	assert.match(svg,/<text x="36" y="22"[^>]*>CCD1<\/text>/);assert.match(svg,/>1762<\/text>/);
});
test('long detail ranges stay whole while fitting the Mac lens',()=>{
	const svg=renderDetailTitleKey({title:'Everything',rangeText:'497-527 / 553',palette,text});
	const range=svg.match(/<text x="72" y="110"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/);assert.ok(range);
	assert.equal(range[2],'497-527 / 553');assert.ok(inKeyLens([{text:range[2]!,fontSize:Number(range[1])}]));
});
