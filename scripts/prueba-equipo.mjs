// Prueba del coordinador Ruflo con los dos clientes reales en Windows.
import {DualModeOrchestrator} from '@claude-flow/codex/dual-mode';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=path.join(project,'node_modules/ruflo/bin/ruflo.js');
const codex=process.env.RUFLO_CODEX_EXE;
if(!codex)throw new Error('Ejecuta Abrir-proyecto.ps1 prueba');
// Node no lanza npx.cmd como ejecutable nativo. Usamos el CLI local fijado.
class WindowsRuflo extends DualModeOrchestrator {
  runCommand(command,args,cwd) {
    if(command!=='npx'||args[0]!=='ruflo@latest')throw new Error('Comando no esperado');
    return new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[cli,...args.slice(1)],{cwd,env:this.sharedEnvironment(),stdio:['ignore','pipe','pipe']});
      let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
      child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(new Error(err||out)));
    });
  }
  buildCollaborativePrompt(worker) {
    return `Prueba acotada de configuracion. No uses herramientas ni escribas archivos. Responde exactamente ${worker.prompt}`;
  }
}
const coordinator=new WindowsRuflo({projectPath:project,claudeCommand:path.join(project,'node_modules/@anthropic-ai/claude-code/bin/claude.exe'),codexCommand:codex,maxConcurrent:2,maxWriters:1,worktreeIsolation:true,timeout:90000,sharedNamespace:'installation-smoke'});
coordinator.on('worker:started',x=>console.log('Iniciado:',x.platform));
coordinator.on('worker:completed',x=>console.log('Completado:',x.id));
const result=await coordinator.runCollaboration([
  {id:'claude-check',platform:'claude',role:'reviewer',readOnly:true,prompt:'RUFLO_CLAUDE_TEAM_OK'},
  {id:'codex-check',platform:'codex',role:'reviewer',readOnly:true,prompt:'RUFLO_CODEX_TEAM_OK'}
],'Comprobar ejecucion coordinada de los dos clientes autenticados.');
const passed=result.success&&result.workers.every(w=>w.status==='completed'&&w.output?.includes(w.platform==='claude'?'RUFLO_CLAUDE_TEAM_OK':'RUFLO_CODEX_TEAM_OK'));
await fs.mkdir(path.join(project,'docs'),{recursive:true});
await fs.writeFile(path.join(project,'docs/prueba-equipo.json'),JSON.stringify({date:new Date().toISOString(),passed,workers:result.workers.map(w=>({platform:w.platform,status:w.status,output:w.output,error:w.error})),errors:result.errors},null,2));
console.log(passed?'EQUIPO_OK':'EQUIPO_FALLO');
process.exitCode=passed?0:1;
