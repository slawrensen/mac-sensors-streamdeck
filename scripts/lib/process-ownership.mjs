// Ported capability from slawrensen/hwinfo-streamdeck scripts/lib/process-ownership.mjs at 11b9645b78395f157493648d873a3066673ba493.
// A debugger port is read only from the unique profile this task created.
import { readFileSync } from 'node:fs';
import path from 'node:path';
export function browserDebuggerPort(profile) {
 const port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid browser debugger port');
 return port;
}
