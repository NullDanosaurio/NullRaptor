import {mkdir,copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const check=spawnSync(process.execPath,['--check','src/slug.mjs'],{stdio:'inherit'});
if(check.status!==0)process.exit(check.status??1);
await mkdir('dist',{recursive:true});
await copyFile('src/slug.mjs','dist/slug.mjs');
console.log('Build de la prueba generado en dist/slug.mjs');
