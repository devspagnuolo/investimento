"""Ponte local entre o InvestAI e o terminal MetaTrader 5 da XP.

Executar no Windows, no mesmo computador do terminal MT5 já logado pelo usuário:

    py -m pip install MetaTrader5
    py connectors\\mt5_bridge.py

A ponte não recebe senha: usa a sessão aberta no terminal. Escuta apenas em 127.0.0.1
e exige o token INVESTAI_BRIDGE_TOKEN em todas as chamadas. Configuração por variáveis
de ambiente ou pelo arquivo .env na raiz do projeto (veja .env.example).
"""
import hmac
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# Valores das enumerações do MetaTrader 5 (estáveis na API Python oficial).
TRADE_ACTION_PENDING = 5
ORDER_TYPE_BUY_LIMIT = 2
ORDER_TIME_DAY = 1
ORDER_FILLING_RETURN = 2
POSITION_TYPE_BUY = 0
SYMBOL_TRADE_MODE_LONGONLY = 1
SYMBOL_TRADE_MODE_FULL = 4
ORDER_STATE_CANCELED, ORDER_STATE_PARTIAL, ORDER_STATE_FILLED, ORDER_STATE_REJECTED, ORDER_STATE_EXPIRED = 2, 3, 4, 5, 6
RETCODE_ACCEPTED = {10008, 10009, 10010}  # PLACED, DONE, DONE_PARTIAL
# Recusas definitivas: a ordem não existe na corretora. Demais códigos ficam como resultado desconhecido.
RETCODE_REJECTED = {10006, 10013, 10014, 10015, 10016, 10017, 10018, 10019, 10022, 10026, 10027, 10030, 10032, 10033, 10034, 10035}
BRT = timezone(timedelta(hours=-3))


class BridgeError(Exception):
    pass


def load_env(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"'))


def config():
    start, end = os.environ.get("INVESTAI_SESSION", "10:10-16:50").split("-")
    return {
        "token": os.environ.get("INVESTAI_BRIDGE_TOKEN", ""),
        "port": int(os.environ.get("INVESTAI_BRIDGE_PORT", "4174")),
        "terminal": os.environ.get("INVESTAI_MT5_PATH") or None,
        "custody_confirmed": os.environ.get("INVESTAI_MT5_CUSTODY_CONFIRMED") == "1",
        "server_offset_hours": float(os.environ.get("INVESTAI_MT5_SERVER_UTC_OFFSET", "-3")),
        "session": (start.strip(), end.strip()),
        "magic": int(os.environ.get("INVESTAI_MT5_MAGIC", "240623")),
    }


def client_ref(client_order_id):
    """Identificador gravado no comentário da ordem (limite de 31 caracteres do MT5)."""
    return "IA" + client_order_id.replace("-", "")[:29]


def in_session(now, session):
    local = now.astimezone(BRT)
    if local.weekday() >= 5:
        return False
    hhmm = local.strftime("%H:%M")
    return session[0] <= hhmm < session[1]


def classify(symbol, path):
    path = (path or "").upper()
    if "FII" in path or "IMOB" in path:
        return "fii"
    if "ETF" in path:
        return "etf"
    return "stock"


def health(mt5):
    account, terminal = mt5.account_info(), mt5.terminal_info()
    if account is None or terminal is None:
        return {"connected": False, "error": str(mt5.last_error())}
    return {
        "connected": bool(terminal.connected),
        "login": account.login,
        "server": account.server,
        "currency": account.currency,
        "tradeAllowed": bool(terminal.trade_allowed and account.trade_allowed and account.trade_expert),
    }


def snapshot(mt5, symbols, cfg, now):
    account, terminal = mt5.account_info(), mt5.terminal_info()
    if account is None or terminal is None:
        raise BridgeError(f"Conta MT5 indisponível: {mt5.last_error()}")
    positions = {}
    for p in mt5.positions_get() or ():
        quantity = int(p.volume) if p.type == POSITION_TYPE_BUY else -int(p.volume)
        current = positions.setdefault(p.symbol, {"symbol": p.symbol, "quantity": 0, "value": 0.0})
        current["quantity"] += quantity
        current["value"] += quantity * p.price_current
    offset_ms = cfg["server_offset_hours"] * 3600000
    quotes = {}
    for symbol in symbols:
        mt5.symbol_select(symbol, True)
        info, tick = mt5.symbol_info(symbol), mt5.symbol_info_tick(symbol)
        if info is None or tick is None:
            continue
        quotes[symbol] = {
            "ask": tick.ask,
            # Horário do servidor MT5 convertido para UTC.
            "timestamp": int(tick.time_msc - offset_ms),
            "currency": info.currency_profit,
            "assetType": classify(symbol, info.path),
            "canBuy": info.trade_mode in (SYMBOL_TRADE_MODE_FULL, SYMBOL_TRADE_MODE_LONGONLY),
            "lot": int(info.volume_min),
            "tickSize": info.trade_tick_size,
        }
    return {
        "currency": account.currency,
        # Só é completa se o usuário confirmou que o MT5 mostra toda a custódia da conta XP.
        "complete": cfg["custody_confirmed"],
        "marketOpen": bool(terminal.connected and in_session(now, cfg["session"])),
        "timestamp": int(now.timestamp() * 1000),
        "equity": account.equity,
        "cash": max(0.0, min(account.balance, account.margin_free)),
        "positions": [{**p, "value": round(p["value"], 2)} for p in positions.values()],
        "openOrders": [{"ticket": o.ticket, "symbol": o.symbol} for o in mt5.orders_get() or ()],
        "quotes": quotes,
    }


def submit(mt5, body, cfg):
    symbol, quantity, price = body.get("symbol"), body.get("quantity"), body.get("limitPrice")
    client_id = body.get("clientOrderId")
    if not isinstance(symbol, str) or not isinstance(quantity, int) or quantity <= 0 or not isinstance(price, (int, float)) or price <= 0 or not isinstance(client_id, str):
        raise BridgeError("Ordem inválida.")
    request = {
        "action": TRADE_ACTION_PENDING,
        "symbol": symbol,
        "volume": float(quantity),
        "type": ORDER_TYPE_BUY_LIMIT,
        "price": float(price),
        "type_time": ORDER_TIME_DAY,
        "type_filling": ORDER_FILLING_RETURN,
        "magic": cfg["magic"],
        "comment": client_ref(client_id),
    }
    result = mt5.order_send(request)
    if result is None:
        raise BridgeError(f"Envio sem resposta do terminal: {mt5.last_error()}")
    if result.retcode in RETCODE_ACCEPTED and result.order:
        return {"status": "accepted", "brokerOrderId": str(result.order)}
    if result.retcode in RETCODE_REJECTED:
        return {"status": "rejected", "brokerOrderId": str(result.order or ""), "message": f"{result.retcode} {result.comment}"}
    raise BridgeError(f"Resultado inconclusivo do MT5: {result.retcode} {result.comment}")


def lookup(mt5, ticket, client_id, now):
    since = now - timedelta(days=7)
    if ticket:
        found = list(mt5.orders_get(ticket=int(ticket)) or ()) or list(mt5.history_orders_get(ticket=int(ticket)) or ())
    else:
        ref = client_ref(client_id)
        found = [o for o in mt5.orders_get() or () if o.comment == ref]
        found = found or [o for o in mt5.history_orders_get(since, now + timedelta(days=1)) or () if o.comment == ref]
    if not found:
        return None
    order = found[0]
    active = bool(mt5.orders_get(ticket=order.ticket))
    deals = [d for d in mt5.history_deals_get(since, now + timedelta(days=1)) or () if d.order == order.ticket]
    filled = int(sum(d.volume for d in deals)) if deals else int(order.volume_initial - order.volume_current)
    average = sum(d.volume * d.price for d in deals) / sum(d.volume for d in deals) if deals else None
    fees = -sum(d.commission + d.fee for d in deals) if deals else None
    if active:
        status = "partial" if filled > 0 or order.state == ORDER_STATE_PARTIAL else "open"
    elif order.state == ORDER_STATE_FILLED:
        status = "filled"
    elif order.state in (ORDER_STATE_CANCELED, ORDER_STATE_EXPIRED):
        status = "cancelled"
    elif order.state == ORDER_STATE_REJECTED:
        status = "rejected"
    else:
        status = "open"
    return {"brokerOrderId": str(order.ticket), "status": status, "filledQuantity": filled, "averagePrice": average, "fees": fees}


def make_handler(mt5, cfg, clock=lambda: datetime.now(timezone.utc)):
    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, payload):
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            supplied = self.headers.get("Authorization", "")
            return bool(cfg["token"]) and hmac.compare_digest(supplied.encode(), f"Bearer {cfg['token']}".encode())

        def handle_request(self, method):
            if not self.authorized():
                return self.reply(401, {"error": "Token da ponte inválido."})
            url = urlparse(self.path)
            query = {k: v[0] for k, v in parse_qs(url.query).items()}
            try:
                if method == "GET" and url.path == "/health":
                    return self.reply(200, health(mt5))
                if method == "GET" and url.path == "/snapshot":
                    symbols = [s for s in query.get("symbols", "").split(",") if s][:30]
                    return self.reply(200, snapshot(mt5, symbols, cfg, clock()))
                if method == "GET" and url.path == "/orders/lookup":
                    return self.reply(200, {"order": lookup(mt5, query.get("ticket"), query.get("clientOrderId", ""), clock())})
                if method == "POST" and url.path == "/orders":
                    length = int(self.headers.get("Content-Length", "0"))
                    if length > 4096:
                        return self.reply(413, {"error": "Requisição muito grande."})
                    return self.reply(200, submit(mt5, json.loads(self.rfile.read(length) or b"{}"), cfg))
                return self.reply(404, {"error": "Operação inexistente."})
            except BridgeError as e:
                return self.reply(503, {"error": str(e)})
            except (ValueError, KeyError) as e:
                return self.reply(400, {"error": f"Requisição inválida: {e}"})

        def do_GET(self):
            self.handle_request("GET")

        def do_POST(self):
            self.handle_request("POST")

        def log_message(self, fmt, *args):
            sys.stderr.write("%s %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    return Handler


def main():
    load_env(Path(__file__).resolve().parent.parent / ".env")
    cfg = config()
    if len(cfg["token"]) < 24:
        sys.exit("Defina INVESTAI_BRIDGE_TOKEN com pelo menos 24 caracteres aleatórios.")
    import MetaTrader5 as mt5

    connected = mt5.initialize(path=cfg["terminal"]) if cfg["terminal"] else mt5.initialize()
    if not connected:
        sys.exit(f"Não foi possível conectar ao terminal MT5: {mt5.last_error()}")
    # Servidor de uma única thread: a API Python do MT5 não deve ser chamada em paralelo.
    server = HTTPServer(("127.0.0.1", cfg["port"]), make_handler(mt5, cfg))
    print(f"Ponte MT5 do InvestAI em http://127.0.0.1:{cfg['port']}")
    try:
        server.serve_forever()
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
