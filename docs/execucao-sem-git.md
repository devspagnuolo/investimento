# Executar InvestAI no Windows sem Git

O código continua versionado no GitHub. Para executar localmente ao lado do MetaTrader 5, não é necessário clonar o repositório nem criar um repositório Git local: baixe o ZIP do projeto em **Code → Download ZIP** e extraia-o em uma pasta sua.

## Primeira inicialização

Pré-requisitos gratuitos: Node.js 22.9 ou superior, Python 3 para Windows e MetaTrader 5 instalado e conectado à conta XP **XPMT5-PRD**.

1. Abra o MetaTrader 5 e confira que o título mostra o servidor XP de produção.
2. Abra PowerShell na pasta extraída do ZIP.
3. Execute:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
   ```

4. O script verifica Node, Python e MT5; se necessário, pede autorização para instalar o pacote gratuito MetaTrader5. Informe o login numérico mostrado no título do MT5.
5. O script gera um token aleatório local, grava a configuração em `.env` (ignorado pelo Git), encontra portas livres para evitar conflito com outros aplicativos e abre a ponte e o servidor em janelas separadas.
6. Abra o endereço de painel exibido pelo script, normalmente `http://127.0.0.1:4173/automation`. Se a porta 4173 estiver ocupada, o script escolhe outra.

A configuração é local e não contém senha da XP. Nunca envie o `.env`, token, senha, assinatura eletrônica ou código de autenticação pelo chat ou ao GitHub.

## Primeiro uso: somente observação

- O script fixa `INVESTAI_LIVE_TRADING_ENABLED=0`: nenhuma ordem real pode ser enviada.
- Também mantém `INVESTAI_MT5_CUSTODY_CONFIRMED=0`. Antes de observar propostas, confirme com a XP se o MT5 representa a carteira/custódia e o saldo que o motor precisa considerar.
- Mantenha **Algotrading desligado**. A observação não precisa desse botão.
- Na página de automação, configure regras com tickers e pesos escolhidos por você, salve-as e use **Ativar observação**. A primeira tela principal do InvestAI não alimenta o motor.

Não altere a variável de envio real ou habilite Algotrading nesta etapa. A conexão do terminal valida o transporte; não valida estratégia, cobertura de custódia, custos, liquidação ou suitability.

## Inicializações seguintes

O script de primeira configuração não sobrescreve um `.env` existente. Para iniciar depois de reiniciar o computador, abra dois terminais PowerShell na pasta extraída:

Terminal 1:

```powershell
py -3 connectors\mt5_bridge.py
```

Terminal 2:

```powershell
node --env-file-if-exists=.env server.mjs
```

Use a porta gravada em `.env` para abrir `http://127.0.0.1:<PORT>/automation`. Mantenha o MT5, a ponte e o servidor abertos durante a observação. Feche as janelas da ponte e do servidor para encerrá-los; o motor volta desativado quando reiniciado.

## Se algo falhar

- **Conta divergente:** o número informado deve ser o login MT5, não CPF, número de conta bancária ou senha do portal.
- **Servidor incorreto:** conecte o terminal a `XPMT5-PRD`, não ao servidor genérico MetaQuotes nem ao XPMT5-DEMO.
- **Ponte sem resposta:** confira a janela Python, o pacote MetaTrader5, a conexão do terminal e o token local em `.env`.
- **Porta ocupada:** use a URL e as portas gravadas em `.env`; não apague configuração existente antes de guardar cópia segura.
- **Painel diferente:** confirme que está abrindo o caminho `/automation` do servidor InvestAI recém-iniciado e a porta que o terminal Node exibiu.

O processo local é necessário porque a API Python do MT5 precisa acessar o terminal instalado no mesmo Windows. GitHub hospeda o código; ele não mantém esse terminal nem a ponte ativos.
