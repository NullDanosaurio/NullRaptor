import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2]||'claude';
const codexRoot='C:/Users/danoa/AppData/Local/OpenAI/Codex/bin';
const candidates=fs.readdirSync(codexRoot).map(n=>path.join(codexRoot,n,'codex.exe')).filter(p=>fs.existsSync(p)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
const codex=candidates[0];
const claude=path.join(root,'node_modules/@anthropic-ai/claude-code/bin/claude.exe');
const ruflo=path.join(root,'node_modules/ruflo/bin/ruflo.js');
const env={...process.env};
const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';
env[pathKey]=[path.join(root,'node_modules/.bin'),path.join(root,'.tools/launchers'),path.dirname(codex),path.dirname(process.execPath),'C:/Users/danoa/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd',env[pathKey]||''].join(path.delimiter);
env.RUFLO_CODEX_EXE=codex;
env.npm_config_cache=path.join(root,'.tools/npm-cache');
delete env.ANTHROPIC_API_KEY;delete env.OPENAI_API_KEY;
function run(command,args){return new Promise((resolve,reject)=>{if(!command)return reject(new Error('No se ha encontrado Codex'));const p=spawn(command,args,{cwd:root,env,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>resolve(code??1));});}
try {
  if(mode==='claude')process.exitCode=await run(claude,[]);
  else if(mode==='codex')process.exitCode=await run(codex,['-c',`mcp_servers.ruflo.command=${JSON.stringify(process.execPath)}`,'-c',`mcp_servers.ruflo.args=${JSON.stringify([ruflo,'mcp','start'])}`,'-c','mcp_servers.ruflo.startup_timeout_sec=120']);
  else if(mode==='prueba'){env.RUFLO_CODEX_EXE=codex;process.exitCode=await run(process.execPath,[path.join(root,'scripts/prueba-equipo.mjs')]);}
  else if(mode==='ruflo')process.exitCode=await run(process.execPath,[ruflo,'--help']);
  else if(mode==='diagnostico'){for(const args of [['/d','/c','where codex'],['/d','/c','codex --version'],['/d','/c','npm.cmd --version'],['/d','/c','npx.cmd --offline --no-install ruflo --version']]){const code=await run('cmd.exe',args);if(code)process.exitCode=code;}}
  else if(mode==='estado'){for(const [command,args] of [[claude,['--version']],[codex,['login','status']],[process.execPath,[ruflo,'--version']]]){const code=await run(command,args);if(code)process.exitCode=code;}}
  else throw new Error('Usa claude, codex, estado, ruflo o prueba');
}catch(e){console.error(e.message);process.exitCode=1;}
