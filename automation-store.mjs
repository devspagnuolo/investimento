import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {defaultPolicy} from './automation.js';
// Trava de instância única: dois processos sobre o mesmo diretório poderiam duplicar ordens.
async function lock(directory){
  const path=join(directory,'instance.lock');
  for(let attempt=0;attempt<2;attempt++){
    try{const handle=await open(path,'wx',0o600);await handle.writeFile(String(process.pid));await handle.close();return async()=>{await unlink(path).catch(()=>{});};}
    catch(e){if(e.code!=='EEXIST')throw e;}
    const pid=Number(await readFile(path,'utf8').catch(()=>''));
    let alive=false;if(Number.isInteger(pid)&&pid>0)try{process.kill(pid,0);alive=true;}catch(e){alive=e.code==='EPERM';}
    if(alive)throw Error(`Outra instância do InvestAI (PID ${pid}) já usa ${directory}. Encerre-a antes de iniciar.`);
    await unlink(path).catch(()=>{});
  }
  throw Error('Não foi possível obter a trava de instância única.');
}
export async function openStore(directory){
  await mkdir(directory,{recursive:true});const release=await lock(directory);const path=join(directory,'automation.json');let state;
  try{state=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(state.orders)||!state.policy)throw Error('Estado inválido.');}
  catch(e){if(e.code!=='ENOENT'){await release();throw Error('Estado de automação ilegível. Preserve o arquivo e restaure um backup antes de iniciar.');}state={enabled:false,policy:structuredClone(defaultPolicy),orders:[],lastRun:null,reason:'Aguardando configuração.'};}
  state.enabled=false;state.mode??='live';state.observations??=[];state.reason='Execução desativada após reinício. Confira a conexão e reative.';
  // Envio interrompido por queda do processo: resultado desconhecido até a reconciliação.
  for(const order of state.orders)if(order.status==='submitting')order.status='unknown';
  let queue=Promise.resolve();const persist=data=>{const content=JSON.stringify(data,null,2);const next=queue.then(async()=>{await writeFile(`${path}.tmp`,content,{mode:0o600});await rename(`${path}.tmp`,path);});queue=next.catch(()=>{});return next;};
  await persist(state);return {state,persist,release};
}
