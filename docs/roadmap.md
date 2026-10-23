# InvestAI: implementação e evolução

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
6. **Execução:** adaptadores autorizados, aprovação explícita por operação, credenciais no servidor, idempotência, reconciliação, validade de ordens, controle de risco e trilha auditável. Tributos dependem de dados completos e regras vigentes. Não há execução nesta versão.
7. **SaaS:** pagamentos, administração, MFA, RBAC, proteção e retenção de dados; revisão jurídica e de segurança antes de receber dados de clientes. Metas de escala e latência precisam de testes de carga.

## Modelo de domínio futuro (não implementado)

Usuário possui objetivos, perfil versionado, carteiras e consentimentos. Carteira possui contas, posições e transações. Instrumento possui emissor, classe, moeda e preços datados. Proposta de rebalanceamento referencia uma fotografia da carteira, parâmetros e justificativas; aprovação referencia a proposta; ordem referencia aprovação e chave de idempotência; evento de auditoria referencia ator, operação, instante e correlação. Identificadores de usuário devem estar em cada registro privado e ser verificados no servidor.

## Contrato de API futuro (não implementado)

`GET /portfolios`, `POST /positions/import`, `GET /portfolios/:id/analysis`, `POST /rebalance-proposals`, `POST /rebalance-proposals/:id/approvals`, `POST /orders`, `GET /orders/:id`, `POST /consents`, `DELETE /consents/:id`. Endpoints privados exigem autenticação, autorização e validação; escritas financeiras exigem idempotência e reconciliação. Não expor APIs de execução antes de implementar esses controles.

## Custo e limites

O aplicativo atual funciona sem chamadas de rede e sem dependências de terceiros. Hospedagem estática é opcional; verificar cotas e preços vigentes antes de escolher fornecedor. CI pode consumir cota de minutos do GitHub; o teste local dispensa esse serviço. Versões futuras só devem adicionar provedores após orçamento explícito, limite de consumo e bloqueio ao atingir a cota. Não prometer custo zero para Open Finance, cotações licenciadas, IA, armazenamento multiusuário ou execução em corretoras.

## Privacidade atual

LocalStorage não oferece criptografia implementada pelo aplicativo e não deve guardar senhas de corretoras, tokens, CPF ou chaves de API. Backups JSON contêm posições em texto claro. Limpar dados do navegador pode removê-los. Use um dispositivo confiável. Não há sincronização entre dispositivos, logs imutáveis ou conformidade LGPD certificada nesta versão.
