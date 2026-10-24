# Motor de automação Brasil

## O que funciona

Abra `/automation` no servidor local. É possível salvar uma política com ativos permitidos, pesos, intervalo, reserva de saldo, orçamento diário e máximo por compra. A política e o histórico são gravados em `.investai/automation.json`, fora do Git. O servidor local verifica o agendamento a cada 15 segundos enquanto estiver aberto. Não há infraestrutura contratada ou dependências pagas.

O planejador calcula compras para reduzir desvios das metas usando o patrimônio completo fornecido pelo adaptador. Ele exige moeda BRL, sessão aberta informada pela corretora, carteira e cotações recentes, lotes e tick válidos. Recusa posições vendidas e ordens abertas. Não usa o cadastro manual nem dados de demonstração para operar. São permitidos apenas instrumentos classificados pelo adaptador como ação, ETF ou FII à vista.

## Adaptadores

Sem configuração, o servidor usa `disconnectedBroker`, que recusa consultas e envios. Com `INVESTAI_BROKER=mt5`, usa `mt5Broker` (`mt5-broker.mjs`), que conversa com a ponte `connectors/mt5_bridge.py`. O adaptador fica conectado quando a conta logada é a de `INVESTAI_MT5_ACCOUNT` e opera em BRL. Isso permite o modo observação mesmo com Algo Trading desligado; envio real também exige permissão de negociação. Instruções em [operação com a XP](operacao-xp-mt5.md).

## Proteção do envio real

O envio real é bloqueado por padrão. `INVESTAI_LIVE_TRADING_ENABLED=1` é necessário para ativá-lo; o padrão recomendado é `0`. Mesmo com opt-in, a ativação exige `tradeAllowed` verdadeiro no terminal e confirmação na interface. A ponte também bloqueia ordens cujo contrato, volume mínimo ou passo de volume não sejam exatamente uma unidade. Essa restrição evita tratar lotes MT5 como quantidades inteiras sem equivalência confirmada; não valida taxas, custódia ou valor de cada símbolo.

## Ciclo e reconciliação

- Modo `live`: a cada intervalo, o motor planeja e envia uma compra limitada com validade no dia. Ordens `accepted` e `partial` são consultadas a cada 15 segundos até ficarem `filled`, `cancelled` ou `rejected`. Enquanto houver pendência, não há nova compra.
- Envio sem resposta conclusiva fica `unknown` e é procurado pelo `clientOrderId` (gravado no comentário da ordem). Após 2 minutos sem localizá-lo, o motor pausa e exige conferência manual (`not-sent`). Nunca há reenvio automático.
- Rejeição pausa a automação. Ordens canceladas contam no limite diário apenas pela parte executada.
- Modo `observe`: lê a conta real e registra as compras planejadas ou o motivo do bloqueio, sem enviar ordens.
- Reiniciar desativa o motor; ordens interrompidas em `submitting` passam a `unknown`.

## Avaliação e etapa seguinte

Existe agora um conector local XP/MetaTrader 5 com verificação da conta configurada, leitura de posições e cotações, modos de observação e envio real confirmado, além de reconciliação e trava de processo único. Isso é implementação de código; a conexão com sua conta ainda precisa ser configurada e validada neste computador. `INVESTAI_MT5_CUSTODY_CONFIRMED=1` declara que a carteira no terminal é completa, mas o aplicativo não verifica essa afirmação de forma independente. Não ative envio real até conferir os dados do terminal e confirmar com a XP cobertura, saldo liquidado, fuso, permissões e custos.

A autenticação ocorre no terminal oficial controlado pelo usuário. O InvestAI não deve coletar senha, assinatura eletrônica ou código de autenticação no chat, numa página própria ou em `localStorage`. O navegador pode ser usado para consultar instruções oficiais, não para automatizar login ou ordens por cliques. Comece pelo modo **observação** durante um pregão e compare conta, posições, saldo e cotações com o terminal; mantenha envio real desativado até essa validação e revisão dos limites.

O roteiro detalhado e os critérios estão em [avaliação da plataforma](roadmap.md#avaliação-da-plataforma--23102026) e [operação com a XP](operacao-xp-mt5.md).

## Contrato do adaptador

- `ready` e `status`; `check()` atualiza a conexão e a identidade da conta.
- `snapshot(symbols)`: `{currency:'BRL',complete:true,marketOpen,timestamp,equity,cash,positions,openOrders,quotes}`. `cash` deve ser dinheiro liquidado utilizável; timestamps em milissegundos UTC. `quotes` contém ask, timestamp, moeda, tipo stock/etf/fii, canBuy, lot e tickSize.
- `submit(order)`: usa o `clientOrderId` persistido e devolve `{status:'accepted'|'rejected',brokerOrderId,message?}`. Erro ou timeout significa resultado desconhecido.
- `order({brokerOrderId,clientOrderId})`: devolve `null` ou `{brokerOrderId,status:'open'|'partial'|'filled'|'cancelled'|'rejected',filledQuantity,averagePrice,fees}`.

## Antes de habilitar dinheiro real

Validar a ponte na conta XP real (custódia, saldo liquidado, fuso e custos) com limites baixos. Ainda pendentes: custos no orçamento, feriados da B3, persistência transacional resistente a queda, alertas e observabilidade. O JSON atual usa substituição por arquivo temporário para evitar sobrescrita parcial, mas não é um diário transacional com fsync nem um registro imutável. Uma trava (`.investai/instance.lock`) impede dois processos sobre o mesmo diretório de dados.

O servidor só escuta loopback e as escritas exigem Origin local e JSON. Isso não é autenticação multiusuário: não expor o servidor à internet ou usar encaminhamento de porta. Segredos da corretora não devem ser colocados em formulário, localStorage ou Git. A reserva por ordem atualmente considera valor nominal, sem cálculo de corretagem ou tributos.

## Verificação

`npm test` cobre limites, vencimento de dados, sessão, lotes, bloqueio de envio desconectado, persistência antes do envio, timeout, reconciliação, observação, pausa, trava de instância e concorrência. `npm run test:bridge` cobre a ponte com um terminal simulado. Esses testes não certificam compatibilidade com a XP nem execução em bolsa.
