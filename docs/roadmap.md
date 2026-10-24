# InvestAI: implementação e evolução

## Avaliação da plataforma — 23/10/2026

**Situação:** aplicação local para carteira manual e base de automação. O repositório agora contém um conector MT5, modos de observação/envio, reconciliação e trava de instância. Isso não comprova conexão com uma conta XP, cobertura completa da custódia nem comportamento correto em produção. Não há preços históricos, análise estatística de risco ou escolha preditiva de ativos. Os perfis e pesos são parâmetros ilustrativos ou definidos pelo usuário.

| Área | Estado | Consequência |
|---|---|---|
| Carteira e cálculos | Cadastro/importação, concentração por nome, metas ilustrativas por classe e projeção com taxa fornecida pelo usuário | Não há preços ao vivo, séries históricas nem avaliação de risco estatística; perfis não são recomendações personalizadas |
| Dados da corretora | Adaptador e ponte local XP/MT5 implementados, ainda sem conta conectada nesta avaliação | Cobertura e equivalência com a custódia precisam ser verificadas diretamente com a XP e comparadas no terminal |
| Estratégia operacional | Planejador de compras à vista para tickers e pesos definidos pelo usuário | Não escolhe ativos por retorno esperado, não vende/reinveste e custos não são considerados no orçamento |
| Ordens | Modos observação e envio real, limites e reconciliação por MT5 | MT5 define volume de ordem em lotes; a ponte o converte para inteiro usando `volume_min`, enquanto o motor trata quantidade como unidade inteira. Validar contrato, incremento de volume (`volume_step`) e valor financeiro para cada ativo antes de operar; custos não entram no orçamento |
| Persistência e segurança | JSON local ignorado pelo Git, servidor em loopback, token ponte, trava de instância | Sem autenticação multiusuário, criptografia de dados da carteira, diário transacional imutável ou monitoramento externo |
| Custos | Aplicação sem dependências e sem serviços pagos contratados | Custos de negociação, dados/licenças, terminal e operação contínua ainda precisam ser confirmados |

### Parecer e prioridade

O risco dominante agora é confirmar que o terminal representa sua conta XP corretamente e que o mapeamento de ordens e posições é fiel. A ponte já possui um caminho de envio real; portanto, iniciar os processos com `INVESTAI_BROKER=mt5` e ativar modo live pode enviar ordens financeiras. A próxima etapa deve ser apenas configuração local e **modo observação**, sem ativar envio real.

1. Com o usuário, confirmar no terminal/canal oficial da XP habilitação MT5, ativos e tipos de ordem, cobertura da custódia, saldo liquidado, fuso, permissões, custos e especificações de lote/tick.
2. Configurar `.env` local sem senha da corretora, iniciar terminal autenticado manualmente, ponte e servidor; validar conta esperada e manter ativação desabilitada.
3. Rodar modo observação por um pregão representativo e comparar conta, saldo, cada posição, ordens abertas, cotações/horários e propostas do motor contra o MT5 e XP. Verificar feriados, leilões e reconexão.
4. Corrigir limitações antes do live: orçamento incluindo taxas, confirmação do significado de saldo/margem/equity, classificação de instrumentos e mapeamento confiável de volume, preço e estados do MT5. A [documentação oficial do MetaTrader `order_send`](https://www.mql5.com/en/docs/python_metatrader5/mt5ordersend_py) descreve `volume` como lotes; os valores e incrementos de cada símbolo XP precisam ser verificados no terminal. Fazer testes de recuperação e indisponibilidade sem enviar ordem.
5. Se tudo estiver validado, decidir os limites e o nível de autorização. Fazer primeira operação somente após confirmação explícita na tela e acompanhar manualmente na XP; não habilitar automação contínua até comprovar reconciliação/cancelamento e alertas.
6. Depois de dados confiáveis, adicionar fontes históricas e métricas transparentes; ampliar renda fixa, fundos ou internacional somente com cobertura e custos verificados.

**Critério para avançar:** modo observação consistente com os dados oficiais durante um pregão, sem lacunas em posição, saldo, ordens e cotação; custos e permissões conhecidos; nenhum segredo no Git; erros e dados incompletos bloqueiam propostas. Antes de dinheiro real, provar com ensaios e acompanhamento manual que reiniciar ou perder uma resposta não duplica ordens e que ordens aceitas, parciais, executadas, canceladas e rejeitadas são conciliadas corretamente.

**Decisão sobre navegador:** podemos consultar pelo navegador integrado páginas oficiais da XP e localizar as instruções. Login e credenciais permanecem no terminal MT5 oficial; não usar automação por cliques para autenticar ou operar. O conector já inclui envio real, portanto qualquer teste da conexão deve iniciar com modo observação e envio live inativo.

## Decisão de arquitetura para a fase inicial

O prompt master representa a visão de longo prazo, não funcionalidades já entregues. Começar com microsserviços, Kubernetes, Kafka, Keycloak e múltiplos bancos acrescentaria operação e infraestrutura antes de existir demanda. Esta primeira versão é uma aplicação estática modular, sem dependências, com motor matemático separado da interface. Execução local não exige conta, cartão ou assinatura. Nenhum serviço pago foi contratado.

Fluxo atual: cadastro ou CSV → validação → carteira local → análise de concentração e metas por classe → ajuste teórico → decisão do usuário. Planejamento usa juros compostos com taxa escolhida pelo usuário. Dados de demonstração são identificados como fictícios.

## Estrutura

- `index.html`, `style.css`: interface responsiva.
- `app.js`: eventos, persistência local, backup e apresentação.
- `engine.js`: validação, importação, concentração, rebalanceamento e projeção.
- `engine.test.js`: verificações dos cálculos e entradas.
- `server.mjs`: servidor local limitado aos arquivos da aplicação.
- `.github/workflows/check.yml`: testes em push e pull request.

## Fases

1. **Entregue nesta versão:** múltiplas posições, classes de ativos, CSV, backups, concentração, alocações ilustrativas por perfil, aporte e projeção nominal. Armazenamento exclusivamente local. Sem autenticação multiusuário.
2. **Dados históricos:** adaptador de provedor com data, origem, atraso e licença; cache; comparação com benchmarks. Volatilidade, drawdown, Sharpe, Sortino, beta, VaR e CVaR exigem séries e metodologia documentada. Ausência de dados não deve virar indicador fictício.
3. **Backend modular único:** autenticação, PostgreSQL, isolamento por usuário, migrações, backups e auditoria de eventos. Primeiro consolidar domínio e limites; separar serviços somente com necessidade observada.
4. **Open Finance:** escolher provedor e comprovar cobertura, consentimento, revogação, custo e condições contratuais. Não confundir compartilhamento de dados com permissão de negociar ativos.
5. **Pesquisa quantitativa e IA:** validação temporal fora da amostra, custos, comparação com estratégia simples, rastreabilidade de versões e limites de uso. Modelos preditivos e textos de IA não garantem retorno.
6. **Execução:** conector XP/MT5 e reconciliação implementados; validar conta, cobertura, custos e recuperação operacional antes de usar dinheiro real. Adaptadores autorizados, controle explícito do usuário, credenciais protegidas, idempotência, validade de ordens, controle de risco e trilha auditável continuam necessários. Tributos dependem de dados completos e regras vigentes.
7. **SaaS:** pagamentos, administração, MFA, RBAC, proteção e retenção de dados; revisão jurídica e de segurança antes de receber dados de clientes. Metas de escala e latência precisam de testes de carga.

## Modelo de domínio futuro (não implementado)

Usuário possui objetivos, perfil versionado, carteiras e consentimentos. Carteira possui contas, posições e transações. Instrumento possui emissor, classe, moeda e preços datados. Proposta de rebalanceamento referencia uma fotografia da carteira, parâmetros e justificativas; aprovação referencia a proposta; ordem referencia aprovação e chave de idempotência; evento de auditoria referencia ator, operação, instante e correlação. Identificadores de usuário devem estar em cada registro privado e ser verificados no servidor.

## Contrato de API futuro (não implementado)

`GET /portfolios`, `POST /positions/import`, `GET /portfolios/:id/analysis`, `POST /rebalance-proposals`, `POST /rebalance-proposals/:id/approvals`, `POST /orders`, `GET /orders/:id`, `POST /consents`, `DELETE /consents/:id`. Endpoints privados exigem autenticação, autorização e validação; escritas financeiras exigem idempotência e reconciliação. Não expor APIs de execução antes de implementar esses controles.

## Custo e limites

O aplicativo atual funciona sem chamadas de rede e sem dependências de terceiros. Hospedagem estática é opcional; verificar cotas e preços vigentes antes de escolher fornecedor. CI pode consumir cota de minutos do GitHub; o teste local dispensa esse serviço. Versões futuras só devem adicionar provedores após orçamento explícito, limite de consumo e bloqueio ao atingir a cota. Não prometer custo zero para Open Finance, cotações licenciadas, IA, armazenamento multiusuário ou execução em corretoras.

## Privacidade atual

LocalStorage não oferece criptografia implementada pelo aplicativo e não deve guardar senhas de corretoras, tokens, CPF ou chaves de API. Backups JSON contêm posições em texto claro. Limpar dados do navegador pode removê-los. Use um dispositivo confiável. Não há sincronização entre dispositivos, logs imutáveis ou conformidade LGPD certificada nesta versão.
