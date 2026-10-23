# InvestAI

Aplicativo local de carteira, concentração, rebalanceamento por classe e projeção de objetivos. Sem dependências externas ou API paga. Dados de exemplo só aparecem ao escolher a demonstração.

## Executar

Instale Node.js 22 ou superior e rode `npm start`. Abra http://127.0.0.1:4173. Não é necessário executar `npm install`.

`npm test` verifica os cálculos e o motor de automação. O painel de carteira pode ser servido estaticamente; a página de automação exige o servidor Node local.

## Automação Brasil

Abra http://127.0.0.1:4173/automation para configurar regras de compras, limites e reserva de saldo. A conexão XP está pendente; a ativação e o envio real permanecem bloqueados. O motor e seu contrato de integração estão descritos em [automação](docs/automation.md). Nenhuma conta externa foi conectada ou operação financeira enviada.

## Uso

Cadastre suas posições ou importe CSV com cabeçalho `nome;classe;valor`. Classes aceitas: Renda fixa, Ações, FIIs, Exterior e Caixa. Use valores sem separador de milhar (ex.: `1500,50`). Escolha um perfil de referência e um aporte para calcular ajustes por classe. Exporte backups JSON para preservar os dados.

As metas são ilustrativas; o sistema não possui cotações ao vivo, previsão de ganhos, Open Finance ou ordens reais. A projeção usa a taxa inserida pelo usuário. Leia [arquitetura, limites e roteiro de evolução](docs/roadmap.md).

## Controle de alterações

Todas as mudanças do projeto devem ser registradas em commits Git antes de serem consideradas concluídas.
