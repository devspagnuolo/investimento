# InvestAI

Aplicativo de acompanhamento e automação de investimentos, com prioridade para o mercado brasileiro e a conta XP. O objetivo é consultar a carteira e executar operações dentro de regras previamente configuradas, reduzindo intervenções recorrentes. A expansão internacional fica para uma etapa posterior.

**Estado atual:** painel local, motor de automação, ponte local com MetaTrader 5, modo observação, envio real e reconciliação estão implementados. O envio real fica bloqueado por padrão (`INVESTAI_LIVE_TRADING_ENABLED=0`) e também recusa ativos sem contrato de volume unitário validado. A ponte foi testada com terminal simulado, mas **não está validada na conta XP do usuário**. Comece pelo [guia para executar pelo ZIP, sem Git local](docs/execucao-sem-git.md) e compare os dados em modo observação; não ative envio real antes de confirmar com a XP cobertura, custos e condições operacionais. Veja [avaliação](docs/roadmap.md#avaliação-da-plataforma--23102026) e [guia XP/MT5](docs/operacao-xp-mt5.md). Dados fictícios do painel manual não alimentam o motor.

Última atualização: 24/10/2026.

**Painel web:** [abrir InvestAI](https://devspagnuolo.github.io/investimento/). A versão pública é estática: dados ficam no navegador e não há sincronização entre dispositivos. A automação MT5 continua local no Windows, requer o terminal aberto e não é controlada pelo site. O envio de ordens permanece desativado por padrão.

## Executar

Requisito: Node.js 22.9 ou superior. Para a conexão com a XP: Windows, MetaTrader 5 e Python 3.

Para configurar e iniciar a ponte XP/MT5 sem clonar um repositório Git, siga o [guia de execução sem Git](docs/execucao-sem-git.md). O script de primeira configuração cria o `.env` local e mantém o envio real desativado. O guia também explica como instalar uma tarefa opcional do Windows para iniciar e recuperar a ponte e o servidor na sessão do usuário, sem reativar ordens.

```sh
npm start
```

Abra http://127.0.0.1:4173 para a carteira ou http://127.0.0.1:4173/automation para a automação. Não é necessário executar `npm install`: esta versão usa apenas recursos nativos do Node.js e do navegador. A porta padrão é 4173 e pode ser alterada pela variável de ambiente `PORT`.

`npm test` verifica os cálculos e o motor de automação. `npm run test:bridge` verifica a ponte com um terminal simulado e requer Python disponível. O painel de carteira pode ser servido estaticamente; a página de automação exige o servidor Node local.

## Automação Brasil

Abra http://127.0.0.1:4173/automation para configurar regras de compras, limites e reserva de saldo. Para conectar a XP, siga [operação com a XP pelo MetaTrader 5](docs/operacao-xp-mt5.md). O motor e o contrato do adaptador estão em [automação](docs/automation.md).

Implementado:

- Política com tickers permitidos, pesos, intervalo, reserva e limites por compra e por dia.
- Planejamento de compras à vista para ações, ETFs e FIIs, com validação de carteira, saldo, sessão, idade das cotações, lotes e preços limite.
- Ponte local `connectors/mt5_bridge.py` (pacote oficial MetaTrader5) e adaptador `mt5-broker.mjs`: a ativação só é liberada quando a conta logada no terminal é a configurada.
- Reconciliação: ordens abertas, parciais, executadas, canceladas e rejeitadas são acompanhadas a cada 15 segundos; a próxima compra só ocorre depois da anterior terminar.
- Envio sem resposta fica "desconhecido", é procurado na corretora pelo identificador da ordem e nunca é reenviado automaticamente.
- Modo observação opcional: lê a conta real e registra o que compraria, sem enviar ordens.
- Trava de instância única, histórico persistente e desativação ao reiniciar.

Vendas, resgates, transferências, derivativos, seleção preditiva de ativos, feriados da B3 e cálculo de custos no orçamento não estão implementados. Envio real requer opt-in local explícito e permanece inadequado até validar conta, custódia, custos e cada contrato MT5.

## Integração XP pelo MetaTrader 5

O caminho escolhido é um **conector local para o terminal MetaTrader 5**: o usuário faz login no terminal, a ponte Python conversa com ele pela API oficial e o servidor do InvestAI conversa com a ponte em `127.0.0.1`, autenticado por um token local. Essa integração já inclui envio real, portanto o modo live pode transmitir ordens à conta; use primeiro apenas observação. Não há automação de cliques no site da XP.

Ainda é preciso confirmar com a XP a cobertura de ativos, se posições mantidas entre pregões aparecem no MT5, permissões para automação e custos. Até essa confirmação, `INVESTAI_MT5_CUSTODY_CONFIRMED=0` mantém a carteira como incompleta e o motor não compra. Não se presume acesso a CDBs, fundos ou Tesouro pelo MetaTrader.

Referências oficiais: [plataformas XP](https://www.xpi.com.br/plataformas/), [conexão de programas ao terminal MetaTrader](https://www.mql5.com/en/docs/python_metatrader5/mt5initialize_py) e [custos operacionais XP](https://www.xpi.com.br/custos-operacionais/).

Senha, assinatura eletrônica e códigos de autenticação da XP não devem ser enviados pelo chat nem gravados no código ou no `.env`. O `.env` local guarda o número da conta esperada e um token aleatório exclusivo para a ponte entre os processos; não reutilize credenciais da XP como esse token.

## Custo inicial e disponibilidade

A implementação atual não exige assinatura, API paga ou servidor contratado. A ponte requer pacote Python oficial MetaTrader5 e terminal MT5. Gratuidade da plataforma ou integração não significa isenção de corretagem, taxas, impostos ou infraestrutura.

Para ciclos automáticos, o processo do InvestAI precisa permanecer em execução; a integração pelo terminal também exigirá terminal e conexão disponíveis. Suspensão do computador, queda de internet ou expiração da sessão podem interromper o funcionamento. Inicialização automática com o Windows e recuperação operacional completa ainda não estão implementadas.

## Uso

Cadastre suas posições ou importe CSV com cabeçalho `nome;classe;valor`. Classes aceitas: Renda fixa, Ações, FIIs, Exterior e Caixa. Use valores sem separador de milhar (ex.: `1500,50`). Escolha um perfil de referência e um aporte para calcular ajustes por classe. Exporte backups JSON para preservar os dados.

As metas são ilustrativas; a análise manual não possui cotações ao vivo, histórico, métricas de risco nem previsão de ganhos. O motor MT5 usa cotações em tempo real para o fluxo restrito de execução, mas não seleciona ativos preditivamente. A projeção usa a taxa inserida pelo usuário. Leia [arquitetura, limites e roteiro de evolução](docs/roadmap.md).

## Dados e armazenamento

- Carteira manual: `localStorage` do navegador. Use a exportação JSON para manter backups; limpar os dados do navegador pode remover a carteira.
- Política e histórico do motor: `.investai/automation.json`, ignorado pelo Git. Esse arquivo não está incluído no backup JSON da carteira e precisa de backup separado.
- Dados locais e backups não possuem criptografia implementada pelo aplicativo. Não guarde credenciais nesses arquivos.
- O servidor escuta apenas em `127.0.0.1`; não o exponha à internet. Não há autenticação multiusuário nesta versão.

## Próximas etapas

1. Validar a ponte na conta XP real: custódia no MT5, saldo liquidado, fuso do servidor e custos.
2. Incluir custos estimados no orçamento e calendário de feriados da B3.
3. Inicialização automática com o Windows, alertas (e-mail ou celular) e persistência transacional.
4. Vendas e rebalanceamento completo; depois, outros produtos brasileiros e integrações internacionais.

## Verificação

```sh
npm test
```

`npm run test:bridge` verifica a ponte MT5 com um terminal simulado. São 21 testes do motor e 4 da ponte, cobrindo cálculos, limites, reconciliação, envio inconclusivo, observação e trava de instância. Eles não comprovam o funcionamento na conta XP real.

## Controle de alterações

Todas as mudanças do projeto devem ser registradas em commits Git antes de serem consideradas concluídas.

Repositório: [devspagnuolo/investimento](https://github.com/devspagnuolo/investimento), branch `main`. Dados operacionais e credenciais ficam fora do versionamento.
