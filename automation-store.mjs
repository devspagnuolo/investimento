import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {defaultPolicy} from './automation.js';
export async function openStore(directory){
  await mkdir(directory,{recursive:true});const path=join(directory,'automation.json');let state;
  try{state=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(state.orders)||!state.policy)throw Error('Estado inválido.');}
  catch(e){if(e.code!=='ENOENT')throw Error('Estado de automação ilegível. Preserve o arquivo e restaure um backup antes de iniciar.');state={enabled:false,policy:structuredClone(defaultPolicy),orders:[],lastRun:null,reason:'Aguardando configuração.'};}
  state.enabled=false;state.reason='Execução desativada. Conexão XP pendente de configuração.';
  let queue=Promise.resolve();const persist=data=>{const content=JSON.stringify(data,null,2);const next=queue.then(async()=>{await writeFile(`${path}.tmp`,content,{mode:0o600});await rename(`${path}.tmp`,path);});queue=next.catch(()=>{});return next;};
  await persist(state);return {state,persist};
}
