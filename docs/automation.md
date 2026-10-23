# Motor de automação Brasil — estágio de desenvolvimento

## O que funciona

Abra `/automation` no servidor local. É possível salvar uma política com ativos permitidos, pesos, intervalo, reserva de saldo, orçamento diário e máximo por compra. A política e o histórico são gravados em `.investai/automation.json`, fora do Git. O servidor local verifica o agendamento a cada 15 segundos enquanto estiver aberto. Não há infraestrutura contratada ou dependências pagas.

O planejador calcula compras para reduzir desvios das metas usando o patrimônio completo fornecido pelo adaptador. Ele exige moeda BRL, sessão aberta informada pela corretora, carteira e cotações recentes, lotes e tick válidos. Recusa posições vendidas e ordens abertas. Não usa o cadastro manual nem dados de demonstração para operar. São permitidos apenas instrumentos classificados pelo adaptador como ação, ETF ou FII à vista.

## Limite desta entrega

O único adaptador instalado é `disconnectedBroker`; ele sempre recusa consultas e envios. Não há conexão com XP/MetaTrader, nem sincronização real, análise preditiva, escolha automática de ativos ou ordens reais. A tela mostra a conexão pendente e desabilita ativação. A API também recusa ativar. Não há modo de execução fictícia no produto de automação; adaptadores substitutos existem apenas nos testes.

O motor prepara uma compra limitada por ciclo. Aceitação é diferente de execução: após resposta da corretora, pausa até que a reconciliação seja implementada. Timeout fica registrado como `unknown`, sem tentativa automática de reenvio. Reiniciar sempre desativa a automação. Isso é uma base de desenvolvimento, ainda não um serviço de operação autônoma pronto para produção.

## Contrato do adaptador futuro

- `ready`: conta conectada, identidade e permissões verificadas no servidor.
- `snapshot()`: `{currency:'BRL',complete:true,marketOpen,timestamp,equity,cash,positions,openOrders,quotes}`. `cash` deve ser dinheiro liquidado utilizável, `equity` o patrimônio completo da conta; timestamps em milissegundos UTC. `positions` contém ticker canônico, quantidade e valor atual; `quotes` contém ask, timestamp, moeda, tipo stock/etf/fii, canBuy, lot e tickSize. O adaptador resolve ticker fracionário, leilões, calendário de sessão e diferenças de custódia.
- `submit(order)`: usa `clientOrderId` persistido, devolvendo `{status:'accepted'|'rejected',brokerOrderId}`. Nenhum endpoint externo está implementado nesta versão.
- Ainda necessário: consulta por ID, preenchimentos parciais, cancelamentos, rejeições, custo efetivo e recuperação após reinício. Sem isso, o ciclo não pode retomar automaticamente após a primeira ordem.

## Antes de habilitar dinheiro real

Implementar e validar conector XP, conta-alvo, permissões e cobertura; reconciliação; limites incluindo taxas e reserva de custos; trava de instância única e persistência transacional resistente a queda; estratégia de proteção de credenciais; horários e leilões; circuito de emergência e observabilidade. O JSON atual usa substituição por arquivo temporário para evitar sobrescrita parcial, mas não é um diário transacional com fsync nem um registro imutável. Não iniciar dois processos sobre o mesmo diretório de dados.

O servidor só escuta loopback e as escritas exigem Origin local e JSON. Isso não é autenticação multiusuário: não expor o servidor à internet ou usar encaminhamento de porta. Segredos da corretora não devem ser colocados em formulário, localStorage ou Git. A reserva por ordem atualmente considera valor nominal, sem cálculo de corretagem ou tributos.

## Verificação

`npm test` cobre limites, vencimento de dados, sessão, lotes, bloqueio de envio desconectado, persistência antes do envio, timeout, pausa e concorrência dentro de um processo. Esses testes não certificam compatibilidade com a XP nem execução em bolsa.
