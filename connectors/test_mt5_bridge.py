import json
import sys
import threading
import unittest
from datetime import datetime, timezone
from http.server import HTTPServer
from pathlib import Path
from types import SimpleNamespace as NS
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).parent))
import mt5_bridge as bridge

NOW = datetime(2026, 10, 23, 16, 0, tzinfo=timezone.utc)  # 13:00 em Brasília, sexta-feira
CFG = {"token": "t" * 32, "port": 0, "terminal": None, "custody_confirmed": True, "server_offset_hours": -3, "session": ("10:10", "16:50"), "magic": 1}


class FakeMT5:
    def __init__(self):
        self.sent, self.retcode, self.active, self.history, self.deals = [], 10008, [], [], []

    def account_info(self):
        return NS(login=123, server="XPMT5-PRD", currency="BRL", equity=1000.0, balance=500.0, margin_free=450.0, trade_allowed=True, trade_expert=True)

    def terminal_info(self):
        return NS(connected=True, trade_allowed=True)

    def last_error(self):
        return (1, "ok")

    def positions_get(self):
        return (NS(symbol="BOVA11", volume=10.0, type=0, price_current=12.5),)

    def symbol_select(self, symbol, enable):
        return True

    def symbol_info(self, symbol):
        return NS(currency_profit="BRL", path="BOVESPA\\ETF\\" + symbol, trade_mode=4, volume_min=1.0, trade_tick_size=0.01)

    def symbol_info_tick(self, symbol):
        # Horário do servidor em Brasília (UTC-3).
        return NS(ask=12.51, time_msc=int(NOW.timestamp() * 1000) - 3 * 3600000)

    def orders_get(self, ticket=None):
        return tuple(o for o in self.active if ticket is None or o.ticket == ticket)

    def history_orders_get(self, *args, ticket=None):
        return tuple(o for o in self.history if ticket is None or o.ticket == ticket)

    def history_deals_get(self, *args):
        return tuple(self.deals)

    def order_send(self, request):
        self.sent.append(request)
        return NS(retcode=self.retcode, order=77 if self.retcode != 10019 else 0, comment="msg")


class BridgeTest(unittest.TestCase):
    def test_snapshot_converte_horario_e_custodia(self):
        s = bridge.snapshot(FakeMT5(), ["BOVA11"], CFG, NOW)
        self.assertTrue(s["marketOpen"] and s["complete"])
        self.assertEqual(s["cash"], 450.0)
        self.assertEqual(s["quotes"]["BOVA11"]["timestamp"], int(NOW.timestamp() * 1000))
        self.assertEqual(s["quotes"]["BOVA11"]["assetType"], "etf")
        self.assertEqual(s["positions"][0], {"symbol": "BOVA11", "quantity": 10, "value": 125.0})
        self.assertFalse(bridge.snapshot(FakeMT5(), [], {**CFG, "custody_confirmed": False}, NOW)["complete"])
        self.assertFalse(bridge.snapshot(FakeMT5(), [], CFG, datetime(2026, 10, 24, 16, tzinfo=timezone.utc))["marketOpen"])

    def test_envio_aceito_recusado_e_inconclusivo(self):
        mt5 = FakeMT5()
        order = {"clientOrderId": "123e4567-e89b-12d3-a456-426614174000", "symbol": "BOVA11", "quantity": 3, "limitPrice": 12.51}
        self.assertEqual(bridge.submit(mt5, order, CFG), {"status": "accepted", "brokerOrderId": "77"})
        self.assertEqual(mt5.sent[0]["type"], bridge.ORDER_TYPE_BUY_LIMIT)
        self.assertLessEqual(len(mt5.sent[0]["comment"]), 31)
        mt5.retcode = 10019
        self.assertEqual(bridge.submit(mt5, order, CFG)["status"], "rejected")
        mt5.retcode = 10012
        with self.assertRaises(bridge.BridgeError):
            bridge.submit(mt5, order, CFG)
        with self.assertRaises(bridge.BridgeError):
            bridge.submit(mt5, {**order, "quantity": 1.5}, CFG)

    def test_reconciliacao(self):
        mt5 = FakeMT5()
        ref = bridge.client_ref("123e4567-e89b-12d3-a456-426614174000")
        self.assertIsNone(bridge.lookup(mt5, None, "123e4567-e89b-12d3-a456-426614174000", NOW))
        mt5.active = [NS(ticket=77, comment=ref, state=1, volume_initial=3.0, volume_current=3.0)]
        self.assertEqual(bridge.lookup(mt5, None, "123e4567-e89b-12d3-a456-426614174000", NOW)["status"], "open")
        mt5.deals = [NS(order=77, volume=1.0, price=12.5, commission=0.0, fee=-0.01)]
        self.assertEqual(bridge.lookup(mt5, "77", "", NOW)["status"], "partial")
        mt5.active, mt5.history = [], [NS(ticket=77, comment=ref, state=4, volume_initial=3.0, volume_current=0.0)]
        mt5.deals.append(NS(order=77, volume=2.0, price=12.51, commission=0.0, fee=-0.02))
        result = bridge.lookup(mt5, "77", "", NOW)
        self.assertEqual((result["status"], result["filledQuantity"]), ("filled", 3))
        self.assertAlmostEqual(result["averagePrice"], 12.5067, places=3)
        self.assertAlmostEqual(result["fees"], 0.03)

    def test_http_exige_token(self):
        server = HTTPServer(("127.0.0.1", 0), bridge.make_handler(FakeMT5(), CFG, lambda: NOW))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        try:
            with self.assertRaises(HTTPError) as error:
                urlopen(f"{base}/health")
            self.assertEqual(error.exception.code, 401)
            response = urlopen(Request(f"{base}/health", headers={"Authorization": "Bearer " + CFG["token"]}))
            self.assertEqual(json.load(response)["login"], 123)
        finally:
            server.shutdown()


if __name__ == "__main__":
    unittest.main()
