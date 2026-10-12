/** Read-only catalog probe. It never changes an app profile or a hardware setting. */
import { getBridge } from '../src/mac/bridge';
import { MacProvider } from '../src/mac/provider';
const native=getBridge();let observations=0;
const provider=new MacProvider(native,()=>{observations++;});
try {
	provider.read();const limit=Date.now()+10_000;
	while(observations<2&&Date.now()<limit)await new Promise(resolve=>setTimeout(resolve,10));
	await new Promise(resolve=>setTimeout(resolve,1000));provider.read();
	while(observations<4&&Date.now()<limit)await new Promise(resolve=>setTimeout(resolve,10));
	const snapshot=provider.current();if(!snapshot)throw new Error('No accepted sensor observation');
	console.log(JSON.stringify({build:native.getBuildInfo(),facts:provider.facts(),notices:provider.notices(),snapshot:{...snapshot,byKey:undefined}},null,2));
}finally{provider.close();}
