# InvestAI

Aplicativo de acompanhamento e automação de investimentos, com prioridade para o mercado brasileiro e a conta XP. O objetivo é consultar a carteira e executar operações dentro de regras previamente configuradas, reduzindo intervenções recorrentes. A expansão internacional fica para uma etapa posterior.

**Estado atual:** painel local e base do motor de automação implementados. O conector XP/MetaTrader e a reconciliação das execuções ainda não estão implementados. A versão atual não está conectada a corretoras e não envia ordens reais. Dados fictícios só aparecem quando o usuário escolhe a demonstração do painel; não alimentam o motor operacional.

Última atualização: 23/10/2026.

## Executar

Requisito: Node.js 22 ou superior.

```sh
npm start
```

Abra http://127.0.0.1:4173 para a carteira ou http://127.0.0.1:4173/automation para a automação. Não é necessário executar `npm install`: esta versão usa apenas recursos nativos do Node.js e do navegador. A porta padrão é 4173 e pode ser alterada pela variável de ambiente `PORT`.

`npm test` verifica os cálculos e o motor de automação. O painel de carteira pode ser servido estaticamente; a página de automação exige o servidor Node local.

## Automação Brasil

Abra http://127.0.0.1:4173/automation para configurar regras de compras, limites e reserva de saldo. A conexão XP está pendente; a ativação e o envio real permanecem bloqueados. O motor e seu contrato de integração estão descritos em [automação](docs/automation.md). Nenhuma conta externa foi conectada ou operação financeira enviada.

Implementado:

- Política com tickers permitidos, pesos, intervalo, reserva e limites por compra e por dia.
- Planejamento de compras à vista para ações, ETFs e FIIs, sujeito à classificação e habilitação fornecidas pelo futuro adaptador.
- Validação de carteira, saldo, sessão de negociação, idade das cotações, lotes e preços limite.
- Histórico persistente e bloqueio de reenvio quando o resultado de uma ordem é desconhecido.
- Pausa de novos envios; reinício do processo desativa o motor.

O motor ainda pausa após uma resposta de ordem aceita ou rejeitada. A operação contínua dependerá da reconciliação com a corretora: aceitação de uma ordem não significa execução. Vendas, resgates, transferências, derivativos, seleção preditiva de ativos e cálculo dos custos efetivos não estão implementados.

## Integração planejada: XP pelo MetaTrader 5

A primeira alternativa a validar é um **conector local para o terminal MetaTrader 5**, evitando depender de uma API web diretamente disponibilizada pela XP ao cliente.

Fluxo pretendido:

1. O usuário habilita o MetaTrader na XP e realiza o login no terminal com as credenciais fornecidas para essa plataforma.
2. O conector local do InvestAI acessa o terminal configurado, verifica a conta e consulta posições, cotações e ordens disponíveis.
3. O motor aplica as regras autorizadas, envia ordens e acompanha seus resultados pela reconciliação.

Esse fluxo é planejado, não uma integração já disponível. Ainda será necessário confirmar com a XP a cobertura de ativos, posições mantidas entre pregões, permissões para automação, autenticação e custos. Não se presume acesso a toda a custódia XP, CDBs, fundos ou Tesouro pelo MetaTrader.

Referências oficiais: [plataformas XP](https://www.xpi.com.br/plataformas/), [conexão de programas ao terminal MetaTrader](https://www.mql5.com/en/docs/python_metatrader5/mt5initialize_py) e [custos operacionais XP](https://www.xpi.com.br/custos-operacionais/). Condições precisam ser verificadas na contratação.

O login será feito pelo usuário no terminal. Senhas, assinatura eletrônica, tokens e chaves não devem ser enviados pelo chat, gravados no código, no armazenamento do navegador ou no GitHub. Automação de cliques no site da XP não está implementada e não é o caminho principal escolhido.

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

1. Implementar o conector local do MetaTrader e validar conta, cobertura e custos na XP.
2. Implementar reconciliação de ordens, execuções parciais, taxas e recuperação de falhas.
3. Adicionar persistência transacional, proteção de credenciais, trava de instância única e monitoramento.
4. Habilitar operação real após configuração e validação da integração e dos limites do usuário.
5. Avaliar outros produtos brasileiros e, posteriormente, integrações internacionais.

## Verificação

```sh
npm test
```

A suíte atual possui 16 testes de cálculos, limites, dados vencidos, persistência e bloqueios de execução. Esses testes não comprovam integração com a XP nem funcionamento em bolsa.

## Controle de alterações

Todas as mudanças do projeto devem ser registradas em commits Git antes de serem consideradas concluídas.

Repositório: [devspagnuolo/investimento](https://github.com/devspagnuolo/investimento), branch `main`. Dados operacionais e credenciais ficam fora do versionamento.
