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
export class Automation{
  constructor({state,broker,persist,now=()=>Date.now()}){this.state=state;this.broker=broker;this.persist=persist;this.now=now;this.busy=false;}
  async pause(reason='Pausado pelo usuário'){this.state.enabled=false;this.state.reason=reason;await this.persist(this.state);}
  async activate(){validatePolicy(this.state.policy);if(!this.broker.ready)throw Error('XP ainda não conectada. Configure o adaptador e valide a conta antes de ativar.');if(this.state.orders.some(o=>['submitting','unknown','accepted'].includes(o.status)))throw Error('Há ordens que exigem reconciliação.');this.state.enabled=true;this.state.reason='Ativo';await this.persist(this.state);}
  async tick(){
    if(this.busy||!this.state.enabled)return;
    if(this.state.lastRun&&this.now()-this.state.lastRun<this.state.policy.intervalMinutes*60000)return;
    this.busy=true;
    try{
      if(!this.broker.ready)throw Error('Conexão com a corretora indisponível.');
      if(this.state.orders.some(o=>['submitting','unknown','accepted'].includes(o.status)))throw Error('Reconciliação de ordem pendente.');
      this.state.lastRun=this.now();await this.persist(this.state);
      const snapshot=await this.broker.snapshot();
      const used=this.state.orders.filter(o=>o.day===dayKey(this.now())&&o.status!=='rejected').reduce((sum,o)=>sum+o.notional,0);
      const planned=planPurchases(snapshot,this.state.policy,used,this.now());
      // Uma ordem por ciclo; nova compra exige posição atualizada e reconciliação.
      const proposal=planned[0];
      if(proposal&&this.state.enabled){
        const order={...proposal,id:randomUUID(),day:dayKey(this.now()),createdAt:this.now(),status:'submitting'};
        this.state.orders.push(order);await this.persist(this.state);
        if(!this.state.enabled){order.status='cancelled-local';await this.persist(this.state);return;}
        // Registro anterior ao envio impede repetição após reinício ou timeout.
        try{const result=await this.broker.submit({...proposal,clientOrderId:order.id});if(!result||!['accepted','rejected'].includes(result.status)||typeof result.brokerOrderId!=='string')throw Error('Resposta inconclusiva.');order.status=result.status;order.brokerOrderId=result.brokerOrderId;}
        catch{order.status='unknown';throw Error('Envio inconclusivo. Reconciliar na corretora antes de tentar novamente.');}
        this.state.enabled=false;this.state.reason=order.status==='accepted'?'Ordem aceita; aguardando integração de reconciliação.':'Ordem rejeitada; revisar retorno da corretora.';
      }else this.state.reason='Ciclo concluído: nenhuma compra elegível.';
      await this.persist(this.state);
    }catch(e){await this.pause(e.message);}finally{this.busy=false;}
  }
}
export const disconnectedBroker={ready:false,name:'XP / MetaTrader 5',async snapshot(){throw Error('XP não conectada.');},async submit(){throw Error('XP não conectada.');}};
