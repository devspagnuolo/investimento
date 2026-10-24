# Operação com a XP pelo MetaTrader 5

Roteiro para colocar o motor de compras em operação real com limites baixos. Tudo roda no seu computador Windows; não há servidor contratado.

## 1. Pré-requisitos na XP

- MetaTrader 5 habilitado na sua conta XP e terminal instalado, com login feito por você.
- Confirme com a XP: se as posições mantidas em custódia (não apenas day trade) aparecem no MT5, se o saldo exibido é dinheiro liquidado, o fuso do horário do servidor e os custos por ordem. Essas respostas definem as variáveis `INVESTAI_MT5_CUSTODY_CONFIRMED` e `INVESTAI_MT5_SERVER_UTC_OFFSET`.
- No terminal, habilite **Algo Trading** (botão na barra de ferramentas). Sem isso a ponte informa que a negociação automática está desabilitada.

## 2. Instalação

1. Node.js 22.9 ou superior e Python 3 para Windows.
2. `py -m pip install MetaTrader5`
3. Copie `.env.example` para `.env` e preencha `INVESTAI_MT5_ACCOUNT` e `INVESTAI_BRIDGE_TOKEN`. O `.env` fica fora do Git. Não coloque a senha da XP nele.

## 3. Execução

Em dois terminais, na pasta do projeto:

```sh
py connectors\mt5_bridge.py
npm start
```

Abra http://127.0.0.1:4173/automation. O quadro "MetaTrader 5" deve mostrar "Conta … conectada". Se aparecer outra mensagem, ela indica o que falta: ponte parada, token incorreto, conta diferente da configurada ou Algo Trading desligado.

## 4. Primeira operação

1. Salve as regras com limites baixos (padrão: R$ 100 por ordem e R$ 300 por dia) e poucos ativos conhecidos.
2. Opcional: clique em **Ativar observação** por um pregão. O motor lê a conta real e registra em "Observações recentes" o que compraria, sem enviar ordens. Mensagens "Bloqueado" mostram o que ainda não confere (por exemplo, custódia não confirmada ou cotação vencida).
3. Clique em **Ativar envio real** e confirme. O motor envia uma ordem limitada de compra por ciclo, com validade no dia, e acompanha cada ordem a cada 15 segundos até ser executada, cancelada ou expirada. Só então avalia a próxima compra.
4. Confira as ordens na XP no primeiro dia e compare com o histórico da tela.

## Situações de atenção

- **Estado "desconhecido":** o envio não teve resposta conclusiva. O motor procura a ordem pelo identificador gravado no comentário da ordem. Se ela não aparecer em 2 minutos, a automação pausa. Confira na XP; se a ordem não existir, use "Não existe na XP" no histórico e reative. Se existir, aguarde: a reconciliação a localiza pelo número.
- **Rejeição:** a automação pausa e mostra o código do MT5 (por exemplo, 10019 = saldo insuficiente).
- **Reinício do computador ou do processo:** a automação volta desativada; reative pela tela. Ordens interrompidas no envio ficam como "desconhecido" até a reconciliação.
- **Pausar** impede novos envios, mas não cancela ordens abertas na XP. Cancele pela XP se necessário.
- Apenas uma instância pode usar a pasta `.investai/` por vez.

## Limites conhecidos

- A janela de envio (`INVESTAI_SESSION`, padrão 10:10–16:50 de Brasília) evita leilões, mas não considera feriados da B3; nesses dias, a ausência de cotações recentes bloqueia as compras.
- A classificação ação/ETF/FII vem do caminho do símbolo no MT5 e é aproximada; o motor só aceita tickers à vista no formato `ABCD3`, `ABCD4` ou `ABCD11`.
- Custos e tributos não entram no cálculo do orçamento; as taxas executadas ficam registradas na ordem quando o MT5 as informa.
- Se a XP alterar o comentário das ordens, a localização de uma ordem "desconhecida" passa a depender da conferência manual.
