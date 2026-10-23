import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Automation,validatePolicy,disconnectedBroker} from './automation.js';
import {openStore} from './automation-store.mjs';
import {mt5Broker} from './mt5-broker.mjs';
const {state,persist,release}=await openStore(fileURLToPath(new URL('./.investai/',import.meta.url))).catch(e=>{console.error(e.message);process.exit(1);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>release().finally(()=>process.exit(0)));
const env=process.env;
const broker=env.INVESTAI_BROKER==='mt5'?mt5Broker({url:env.INVESTAI_BRIDGE_URL,token:env.INVESTAI_BRIDGE_TOKEN,account:env.INVESTAI_MT5_ACCOUNT}):disconnectedBroker;
const automation=new Automation({state,persist,broker});
const port=Number(process.env.PORT||4173);
const files=new Map([['/',['index.html','text/html']],['/app.js',['app.js','text/javascript']],['/engine.js',['engine.js','text/javascript']],['/style.css',['style.css','text/css']],['/automation',['automation.html','text/html']],['/automation-ui.js',['automation-ui.js','text/javascript']]]);
const headers={'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"};
const json=(res,status,body)=>res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(body));
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>16384)throw Error('Requisição excede 16 KB.');}return JSON.parse(text||'{}');}
const server=http.createServer(async(req,res)=>{
  const host=req.headers.host;
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return json(res,403,{error:'Host não permitido.'});
  const path=new URL(req.url,`http://${host}`).pathname;
  try{
    if(path.startsWith('/api/')){
      if(req.method==='GET'&&path==='/api/automation')return json(res,200,{...state,observations:state.observations.slice(-20),connected:broker.ready,broker:broker.name,brokerStatus:broker.status});
      if(req.method!=='POST'||req.headers.origin!==`http://${host}`||req.headers['content-type']!=='application/json')return json(res,403,{error:'Requisição local JSON obrigatória.'});
      if(path==='/api/automation/policy'){if(automation.busy||state.enabled)return json(res,409,{error:'Pause a automação antes de alterar regras.'});state.policy=validatePolicy(await body(req));state.lastRun=null;await persist(state);return json(res,200,{ok:true});}
      if(path==='/api/automation/activate'){await automation.activate((await body(req)).mode);return json(res,200,{ok:true});}
      if(path==='/api/automation/resolve'){await automation.resolveUnknown((await body(req)).id);return json(res,200,{ok:true});}
      if(path==='/api/automation/pause'){await automation.pause();return json(res,200,{ok:true});}
      return json(res,404,{error:'Operação inexistente.'});
    }
    const entry=files.get(path);if(!entry||req.method!=='GET')return json(res,404,{error:'Não encontrado.'});
    const content=await readFile(new URL(entry[0],import.meta.url));res.writeHead(200,{...headers,'Content-Type':`${entry[1]}; charset=utf-8`}).end(content);
  }catch(e){json(res,400,{error:e.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(`InvestAI: http://127.0.0.1:${port}`));
async function cycle(){await broker.check();await automation.tick();}
cycle().catch(()=>{});
const timer=setInterval(()=>cycle().catch(()=>{state.enabled=false;}),15000);timer.unref();
server.on('error',e=>{clearInterval(timer);console.error(e.message);process.exitCode=1;release();});
