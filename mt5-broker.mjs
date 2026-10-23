// Adaptador XP via MetaTrader 5: conversa com a ponte local connectors/mt5_bridge.py.
// A ponte roda no mesmo computador do terminal; o login é feito pelo usuário no próprio MT5.
export function mt5Broker({url='http://127.0.0.1:4174',token,account,fetch=globalThis.fetch,timeoutMs=10000}){
  const base=new URL(url);
  if(!['127.0.0.1','localhost'].includes(base.hostname))throw Error('A ponte MT5 deve escutar apenas em 127.0.0.1.');
  async function call(path,body){
    const response=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeoutMs)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||`Ponte MT5 respondeu ${response.status}.`);
    return data;
  }
  const broker={
    name:'XP / MetaTrader 5',ready:false,status:'Verificando a ponte MT5…',
    // Identidade: só fica pronto se a conta logada no terminal for exatamente a configurada.
    async check(){
      try{
        if(!token||!account)throw Error('Defina INVESTAI_BRIDGE_TOKEN e INVESTAI_MT5_ACCOUNT.');
        const h=await call('/health');
        if(!h.connected)throw Error('Terminal MT5 sem conexão com a corretora.');
        if(String(h.login)!==String(account))throw Error(`Conta logada no MT5 (${h.login}) difere da configurada.`);
        if(h.currency!=='BRL')throw Error('A conta MT5 precisa operar em BRL.');
        if(!h.tradeAllowed)throw Error('Negociação automática desabilitada no terminal ou na conta (habilite "Algo Trading").');
        broker.ready=true;broker.status=`Conta ${h.login} conectada (${h.server}).`;
      }catch(e){broker.ready=false;broker.status=e.name==='TimeoutError'?'Ponte MT5 sem resposta.':e.cause?.code==='ECONNREFUSED'?'Ponte MT5 não está em execução.':e.message;}
    },
    snapshot:symbols=>call(`/snapshot?symbols=${encodeURIComponent(symbols.join(','))}`),
    submit:order=>call('/orders',{clientOrderId:order.clientOrderId,symbol:order.symbol,quantity:order.quantity,limitPrice:order.limitPrice}),
    async order({brokerOrderId,clientOrderId}){
      const query=new URLSearchParams(brokerOrderId?{ticket:brokerOrderId}:{clientOrderId});
      const {order}=await call(`/orders/lookup?${query}`);return order||null;
    },
  };
  return broker;
}
