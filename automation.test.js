import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Automation,defaultPolicy,disconnectedBroker,planPurchases,validatePolicy} from './automation.js';
import {openStore} from './automation-store.mjs';
const now=Date.parse('2026-10-23T16:00:00Z');
const policy=()=>({...defaultPolicy,reserveBRL:100,maxOrderBRL:100,maxDailyBRL:150,targets:[{symbol:'BOVA11',weight:20},{symbol:'DIVO11',weight:20}]});
const snapshot=()=>({currency:'BRL',complete:true,marketOpen:true,timestamp:now,equity:1000,cash:500,positions:[],openOrders:[],quotes:Object.fromEntries(['BOVA11','DIVO11'].map(symbol=>[symbol,{ask:10,timestamp:now,currency:'BRL',assetType:'etf',canBuy:true,lot:1,tickSize:0.01}]))});
function fixture(submit=async()=>({status:'accepted',brokerOrderId:'broker-1'})){
  const state={enabled:true,policy:policy(),orders:[],lastRun:null};const persisted=[];
  const broker={ready:true,snapshot:async()=>snapshot(),submit};
  const motor=new Automation({state,broker,now:()=>now,persist:async s=>persisted.push(structuredClone(s))});return {state,broker,motor,persisted};
}
test('orçamento combinado, reserva e lotes são respeitados',()=>{const orders=planPurchases(snapshot(),policy(),0,now);assert.equal(orders.length,2);assert.equal(orders.reduce((s,o)=>s+o.notional,0),150);const s=snapshot();s.cash=110;assert.equal(planPurchases(s,policy(),0,now)[0].notional,10);s.quotes.BOVA11.lot=100;s.quotes.DIVO11.lot=100;assert.equal(planPurchases(s,policy(),0,now).length,0);});
test('limite diário já utilizado reduz a compra',()=>{assert.equal(planPurchases(snapshot(),policy(),130,now)[0].notional,20);assert.equal(planPurchases(snapshot(),policy(),150,now).length,0);});
test('bloqueia dados vencidos, sessão fechada e ordens abertas',()=>{for(const mutate of [s=>s.marketOpen=false,s=>s.complete=false,s=>s.timestamp=now-61000,s=>s.quotes.BOVA11.timestamp=now-61000,s=>s.openOrders=[{}],s=>s.quotes.BOVA11.assetType='future']){const s=snapshot();mutate(s);assert.throws(()=>planPurchases(s,policy(),0,now));}});
test('valida limite por ativo, soma e tickers',()=>{assert.throws(()=>validatePolicy({...policy(),targets:[{symbol:'BOVA11',weight:21}]}));assert.throws(()=>validatePolicy({...policy(),targets:[{symbol:'BOVA11',weight:10},{symbol:'BOVA11',weight:10}]}));});
test('adaptador desconectado impede ativação',async()=>{const f=fixture();f.motor.broker=disconnectedBroker;await assert.rejects(()=>f.motor.activate(),/não conectada/);});
test('persiste antes do envio e não reenvia ordem aceita',async()=>{const f=fixture(async order=>{assert.equal(f.persisted.at(-1).orders[0].status,'submitting');assert.equal(order.clientOrderId,f.state.orders[0].id);return {status:'accepted',brokerOrderId:'b1'};});await f.motor.tick();assert.equal(f.state.orders.length,1);assert.equal(f.state.orders[0].status,'accepted');assert.equal(f.state.enabled,false);await assert.rejects(()=>f.motor.activate(),/reconciliação/);await f.motor.tick();assert.equal(f.state.orders.length,1);});
test('timeout mantém estado desconhecido e bloqueia repetição',async()=>{const f=fixture(async()=>{throw Error('timeout');});await f.motor.tick();assert.equal(f.state.orders[0].status,'unknown');assert.equal(f.state.enabled,false);await assert.rejects(()=>f.motor.activate());});
test('ciclos simultâneos não enviam duplicatas',async()=>{let calls=0;const f=fixture(async()=>{calls++;return {status:'accepted',brokerOrderId:'b1'};});await Promise.all([f.motor.tick(),f.motor.tick()]);assert.equal(calls,1);});
test('pausar durante consulta impede envio',async()=>{const f=fixture(async()=>assert.fail('Não deve enviar'));f.broker.snapshot=async()=>{await f.motor.pause();return snapshot();};await f.motor.tick();assert.equal(f.state.orders.length,0);});
test('reinício conserva histórico e desativa; corrupção não zera histórico',async()=>{const dir=await mkdtemp(join(tmpdir(),'investai-test-'));let store=await openStore(dir);store.state.enabled=true;store.state.orders.push({status:'unknown',id:'a'});await store.persist(store.state);store=await openStore(dir);assert.equal(store.state.enabled,false);assert.equal(store.state.orders[0].id,'a');assert.ok((await readFile(join(dir,'automation.json'),'utf8')).includes('unknown'));await writeFile(join(dir,'automation.json'),'{broken');await assert.rejects(()=>openStore(dir),/ilegível/);});
