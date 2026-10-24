# InvestAI

Aplicativo de acompanhamento e automação de investimentos, com prioridade para o mercado brasileiro e a conta XP. O objetivo é consultar a carteira e executar operações dentro de regras previamente configuradas, reduzindo intervenções recorrentes. A expansão internacional fica para uma etapa posterior.

**Estado atual:** painel local, motor de automação, ponte local com o MetaTrader 5 e reconciliação de ordens implementados. Com o MT5 da XP conectado e a conta conferida, o motor pode enviar ordens reais de compra dentro dos limites configurados. A ponte foi testada com um terminal simulado; a validação na conta XP real é o próximo passo, seguindo [operação com a XP](docs/operacao-xp-mt5.md). Dados fictícios só aparecem quando o usuário escolhe a demonstração do painel; não alimentam o motor operacional.

Última atualização: 23/10/2026.

## Executar

Requisito: Node.js 22.9 ou superior. Para a conexão com a XP: Windows, MetaTrader 5 e Python 3.

```sh
npm start
```

Abra http://127.0.0.1:4173 para a carteira ou http://127.0.0.1:4173/automation para a automação. Não é necessário executar `npm install`: esta versão usa apenas recursos nativos do Node.js e do navegador. A porta padrão é 4173 e pode ser alterada pela variável de ambiente `PORT`.

`npm test` verifica os cálculos e o motor de automação. O painel de carteira pode ser servido estaticamente; a página de automação exige o servidor Node local.

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

Vendas, resgates, transferências, derivativos, seleção preditiva de ativos, feriados da B3 e cálculo de custos no orçamento não estão implementados.

## Integração XP pelo MetaTrader 5

O caminho escolhido é um **conector local para o terminal MetaTrader 5**: o usuário faz login no terminal, a ponte Python conversa com ele pela API oficial e o servidor do InvestAI conversa com a ponte em `127.0.0.1`, autenticado por um token local. Não há automação de cliques no site da XP.

Ainda é preciso confirmar com a XP a cobertura de ativos, se posições mantidas entre pregões aparecem no MT5, permissões para automação e custos. Até essa confirmação, `INVESTAI_MT5_CUSTODY_CONFIRMED=0` mantém a carteira como incompleta e o motor não compra. Não se presume acesso a CDBs, fundos ou Tesouro pelo MetaTrader.

Referências oficiais: [plataformas XP](https://www.xpi.com.br/plataformas/), [conexão de programas ao terminal MetaTrader](https://www.mql5.com/en/docs/python_metatrader5/mt5initialize_py) e [custos operacionais XP](https://www.xpi.com.br/custos-operacionais/).

Senhas, assinatura eletrônica e tokens da XP não devem ser enviados pelo chat, gravados no código, no `.env`, no armazenamento do navegador ou no GitHub. O `.env` guarda apenas o número da conta esperada e o token entre a ponte e o servidor.

## Custo inicial e disponibilidade

A implementação atual não exige assinatura, API paga ou servidor contratado. O conector futuro pode acrescentar dependências locais. Gratuidade de plataforma ou integração não significa isenção de corretagem, taxas, impostos ou infraestrutura.

Para ciclos automáticos, o processo do InvestAI precisa permanecer em execução; a integração pelo terminal também exigirá terminal e conexão disponíveis. Suspensão do computador, queda de internet ou expiração da sessão podem interromper o funcionamento. Inicialização automática com o Windows e recuperação operacional completa ainda não estão implementadas.

## Uso

Cadastre suas posições ou importe CSV com cabeçalho `nome;classe;valor`. Classes aceitas: Renda fixa, Ações, FIIs, Exterior e Caixa. Use valores sem separador de milhar (ex.: `1500,50`). Escolha um perfil de referência e um aporte para calcular ajustes por classe. Exporte backups JSON para preservar os dados.

As metas são ilustrativas; o sistema não possui cotações ao vivo, previsão de ganhos, Open Finance ou ordens reais. A projeção usa a taxa inserida pelo usuário. Leia [arquitetura, limites e roteiro de evolução](docs/roadmap.md).

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
