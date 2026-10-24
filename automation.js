import {randomUUID} from 'node:crypto';
export const defaultPolicy={intervalMinutes:60,maxOrderBRL:100,maxDailyBRL:300,reserveBRL:1000,maxWeightPercent:20,maxQuoteAgeSeconds:60,driftPercent:3,targets:[]};
export function validatePolicy(p){
  const bounds={intervalMinutes:[1,1440],maxOrderBRL:[1,100000],maxDailyBRL:[1,1000000],reserveBRL:[0,100000000],maxWeightPercent:[1,100],maxQuoteAgeSeconds:[1,300],driftPercent:[0.1,50]};
  for(const [k,[min,max]] of Object.entries(bounds))if(!Number.isFinite(p?.[k])||p[k]<min||p[k]>max)throw Error(`Parâmetro inválido: ${k}`);
  if(p.maxDailyBRL<p.maxOrderBRL)throw Error('Limite diário deve ser maior ou igual ao limite por ordem.');
  if(!Array.isArray(p.targets)||!p.targets.length||p.targets.length>30)throw Error('Cadastre entre 1 e 30 ativos permitidos.');
  const seen=new Set();let sum=0;
  const targets=p.targets.map(t=>{if(!/^[A-Z]{4}[0-9]{1,2}$/.test(t.symbol)||seen.has(t.symbol))throw Error('Ticker inválido ou duplicado. Use o ticker-base B3.');if(!Number.isFinite(t.weight)||t.weight<=0||t.weight>p.maxWeightPercent)throw Error('Peso inválido ou acima do limite por ativo.');seen.add(t.symbol);sum+=t.weight;return {symbol:t.symbol,weight:t.weight};});
  if(sum>100)throw Error('A soma dos pesos não pode superar 100%.');
  return {...Object.fromEntries(Object.keys(bounds).map(k=>[k,p[k]])),targets};
}
const positive=n=>Number.isFinite(n)&&n>0;
export function planPurchases(s,policy,dailyUsed,now=Date.now()){
  const p=validatePolicy(policy);
  if(!s||s.currency!=='BRL'||s.complete!==true||s.marketOpen!==true)throw Error('Conta BRL, carteira completa e sessão aberta são obrigatórias.');
  if(!Number.isFinite(s.timestamp)||now-s.timestamp>p.maxQuoteAgeSeconds*1000||s.timestamp>now+5000)throw Error('Posição desatualizada.');
  if(!positive(s.equity)||!Number.isFinite(s.cash)||s.cash<0||s.cash>s.equity)throw Error('Patrimônio ou saldo inválido.');
  if(!Array.isArray(s.positions)||!Array.isArray(s.openOrders)||s.openOrders.length)throw Error('Ordens abertas ou não reconciliadas impedem novas compras.');
  if(!Number.isFinite(dailyUsed)||dailyUsed<0)throw Error('Consumo diário inválido.');
  const positions=new Map();
  for(const position of s.positions){if(positions.has(position.symbol)||!Number.isInteger(position.quantity)||position.quantity<0||!Number.isFinite(position.value)||position.value<0)throw Error('Posição inválida, duplicada ou vendida.');positions.set(position.symbol,position);}
  let cash=Math.max(0,s.cash-p.reserveBRL),available=Math.max(0,p.maxDailyBRL-dailyUsed);const orders=[];
  for(const target of p.targets){
    const q=s.quotes?.[target.symbol];
    if(!q||!positive(q.ask)||!Number.isFinite(q.timestamp)||now-q.timestamp>p.maxQuoteAgeSeconds*1000||q.timestamp>now+5000)throw Error(`Cotação inválida ou vencida: ${target.symbol}`);
    if(q.currency!=='BRL'||!['stock','etf','fii'].includes(q.assetType)||q.canBuy!==true||!Number.isInteger(q.lot)||q.lot<1||!positive(q.tickSize))throw Error(`Instrumento sem habilitação de compra à vista: ${target.symbol}`);
    const current=positions.get(target.symbol)?.value||0,gap=s.equity*target.weight/100-current;
    if(gap/s.equity*100<p.driftPercent)continue;
    const price=Number((Math.ceil((q.ask-1e-9)/q.tickSize)*q.tickSize).toFixed(6));
    const budget=Math.min(gap,p.maxOrderBRL,cash,available,s.equity*p.maxWeightPercent/100-current);
    const quantity=Math.floor((budget+1e-8)/(price*q.lot))*q.lot;
    if(quantity<q.lot)continue;
    const notional=Number((quantity*price).toFixed(2));
    orders.push({symbol:target.symbol,side:'buy',type:'limit',quantity,limitPrice:price,notional,currency:'BRL'});cash-=notional;available-=notional;
  }
  return orders;
}
function dayKey(now){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
const unknownGraceMs=120000;
export const pendingStatuses=['submitting','unknown','accepted','partial'];
const brokerStatus={open:'accepted',partial:'partial',filled:'filled',cancelled:'cancelled',rejected:'rejected'};
// Valor comprometido no limite diário: ordens canceladas contam apenas a parte executada.
export function committed(o){if(['rejected','cancelled-local','not-sent'].includes(o.status))return 0;if(o.status==='cancelled')return Number(((o.filledQuantity||0)*(o.averagePrice||o.limitPrice)).toFixed(2));return o.notional;}
export class Automation{
  constructor({state,broker,persist,liveTradingEnabled=false,now=()=>Date.now()}){this.state=state;this.broker=broker;this.persist=persist;this.liveTradingEnabled=liveTradingEnabled;this.now=now;this.busy=false;state.mode??='live';state.observations??=[];}
  async pause(reason='Pausado pelo usuário'){this.state.enabled=false;this.state.reason=reason;await this.persist(this.state);}
  async activate(mode='live'){if(!['live','observe'].includes(mode))throw Error('Modo inválido.');validatePolicy(this.state.policy);if(!this.broker.ready)throw Error('XP ainda não conectada. Configure o adaptador e valide a conta antes de ativar.');if(mode==='live'&&!this.liveTradingEnabled)throw Error('Envio real bloqueado. Habilite INVESTAI_LIVE_TRADING_ENABLED somente após validar a conta, os ativos e os custos.');if(mode==='live'&&this.broker.tradeAllowed!==true)throw Error('Algo Trading não está habilitado na conta/terminal.');this.state.mode=mode;this.state.enabled=true;this.state.lastRun=null;this.state.reason=mode==='live'?'Ativo: envio real.':'Ativo: observação, sem envio de ordens.';await this.persist(this.state);}
  // Confirmação manual, após conferência na XP, de que uma ordem desconhecida não chegou à corretora.
  async resolveUnknown(id){const order=this.state.orders.find(o=>o.id===id);if(!order||!['unknown','submitting'].includes(order.status)||this.busy)throw Error('Somente ordens com resultado desconhecido podem ser resolvidas manualmente.');order.status='not-sent';order.resolvedAt=this.now();await this.persist(this.state);}
  async reconcile(){
    for(const order of this.state.orders.filter(o=>pendingStatuses.includes(o.status))){
      const found=await this.broker.order({brokerOrderId:order.brokerOrderId,clientOrderId:order.id});
      if(!found){if(order.brokerOrderId)throw Error(`Ordem ${order.brokerOrderId} não localizada na corretora.`);order.status='unknown';continue;}
      if(!brokerStatus[found.status]||typeof found.brokerOrderId!=='string'||!Number.isInteger(found.filledQuantity)||found.filledQuantity<0||found.filledQuantity>order.quantity)throw Error('Resposta de reconciliação inválida.');
      Object.assign(order,{status:brokerStatus[found.status],brokerOrderId:found.brokerOrderId,filledQuantity:found.filledQuantity,averagePrice:Number.isFinite(found.averagePrice)?found.averagePrice:null,fees:Number.isFinite(found.fees)?found.fees:null,reconciledAt:this.now()});
    }
    await this.persist(this.state);
    return this.state.orders.filter(o=>pendingStatuses.includes(o.status));
  }
  observe(entry){this.state.observations.push({at:this.now(),...entry});this.state.observations=this.state.observations.slice(-200);}
  async tick(){
    if(this.busy||!this.state.enabled)return;
    const live=this.state.mode==='live',due=!this.state.lastRun||this.now()-this.state.lastRun>=this.state.policy.intervalMinutes*60000;
    // Ordens pendentes são reconciliadas a cada verificação; novas compras respeitam o intervalo.
    if(!due&&!(live&&this.state.orders.some(o=>pendingStatuses.includes(o.status))))return;
    this.busy=true;
    try{
      if(!this.broker.ready)throw Error('Conexão com a corretora indisponível.');
      if(live){
        if(!this.liveTradingEnabled)throw Error('Envio real bloqueado por configuração.');
        if(this.broker.tradeAllowed!==true)throw Error('Negociação automática não está habilitada no terminal.');
        const pending=await this.reconcile();
        if(pending.some(o=>o.status==='unknown'&&this.now()-o.createdAt>unknownGraceMs))throw Error('Envio inconclusivo não localizado na corretora. Confira na XP e resolva a ordem antes de continuar.');
        if(pending.length){this.state.reason=`Acompanhando ordem ${pending[0].symbol} (${pending[0].status}); novas compras aguardam a execução.`;await this.persist(this.state);return;}
        if(!due)return;
      }
      this.state.lastRun=this.now();await this.persist(this.state);
      const snapshot=await this.broker.snapshot(this.state.policy.targets.map(t=>t.symbol));
      const used=this.state.orders.filter(o=>o.day===dayKey(this.now())).reduce((sum,o)=>sum+committed(o),0);
      let planned;
      try{planned=planPurchases(snapshot,this.state.policy,used,this.now());}
      catch(e){if(live)throw e;this.observe({error:e.message});this.state.reason=`Observação: ${e.message}`;await this.persist(this.state);return;}
      if(!live){this.observe({proposals:planned});this.state.reason=planned.length?`Observação: compraria ${planned.map(o=>`${o.quantity} ${o.symbol}`).join(', ')}.`:'Observação: nenhuma compra elegível.';await this.persist(this.state);return;}
      // Uma ordem por ciclo; a próxima só após reconciliação e posição atualizada.
      const proposal=planned[0];
      if(proposal&&this.state.enabled){
        const order={...proposal,id:randomUUID(),day:dayKey(this.now()),createdAt:this.now(),status:'submitting'};
        this.state.orders.push(order);await this.persist(this.state);
        if(!this.state.enabled){order.status='cancelled-local';await this.persist(this.state);return;}
        // Registro anterior ao envio impede repetição após reinício ou timeout.
        try{const result=await this.broker.submit({...proposal,clientOrderId:order.id});if(!result||!['accepted','rejected'].includes(result.status)||typeof result.brokerOrderId!=='string')throw Error('Resposta inconclusiva.');order.status=result.status;order.brokerOrderId=result.brokerOrderId;if(result.message)order.message=String(result.message).slice(0,200);}
        catch{order.status='unknown';this.state.reason='Envio inconclusivo. O próximo ciclo procura a ordem na corretora antes de qualquer nova compra.';await this.persist(this.state);return;}
        if(order.status==='rejected'){this.state.enabled=false;this.state.reason=`Ordem rejeitada pela corretora${order.message?`: ${order.message}`:''}. Revise antes de reativar.`;}
        else this.state.reason=`Ordem aceita: ${order.quantity} ${order.symbol} a ${order.limitPrice}; acompanhando execução.`;
      }else this.state.reason='Ciclo concluído: nenhuma compra elegível.';
      await this.persist(this.state);
    }catch(e){await this.pause(e.message);}finally{this.busy=false;}
  }
}
export const disconnectedBroker={ready:false,tradeAllowed:false,name:'XP / MetaTrader 5',status:'Adaptador não configurado.',async check(){},async snapshot(){throw Error('XP não conectada.');},async submit(){throw Error('XP não conectada.');},async order(){throw Error('XP não conectada.');}};
