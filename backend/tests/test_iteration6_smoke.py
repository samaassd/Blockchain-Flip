"""Iteration 6 smoke tests — regression for scanner, opportunity detail,
bridge quote, trade execute + on-chain trade creation for explorer link tests."""
import uuid
import requests


# ---------------- Scanner opportunities regression ----------------
class TestScannerRegression:
    def test_opportunities_ok(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("opportunities"), list)
        assert len(d["opportunities"]) > 0

    def test_opportunity_detail_ok(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        opps = r.json().get("opportunities", [])
        assert opps
        oid = opps[0]["id"]
        r2 = requests.get(
            f"{base_url}/api/scanner/opportunity/{oid}", headers=auth_headers
        )
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["id"] == oid
        assert d.get("route") and len(d["route"]) >= 1


# ---------------- Bridge quote regression ----------------
class TestBridgeQuote:
    def test_bridge_quote_returns_valid_response(self, base_url, auth_headers):
        """Emulate the frontend's LI.FI call — small native-token amount, cross-chain."""
        params = {
            "fromChain": 137,
            "toChain": 42161,
            "fromToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            "toToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            "fromAmount": str(1 * 10**15),  # 0.001 MATIC
            "fromAddress": "0x1234567890123456789012345678901234567890",
        }
        r = requests.get(
            f"{base_url}/api/bridge/quote", headers=auth_headers, params=params
        )
        # Any of 200/400 is acceptable (LI.FI may reject small amounts) — no 5xx crash
        assert r.status_code in (200, 400), r.text
        d = r.json()
        assert isinstance(d, dict)
        if r.status_code == 200:
            # Frontend expects one of these fields
            has_any = any(k in d for k in (
                "bridge_name", "tool", "from_amount_usd", "to_amount_usd",
                "gas_cost_usd", "execution_seconds"
            ))
            assert has_any, f"expected bridge fields: {list(d.keys())}"


# ---------------- Trade execute (simulated) regression ----------------
class TestTradeExecute:
    def test_execute_simulated_trade(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        opps = r.json().get("opportunities", [])
        assert opps
        rt = requests.post(
            f"{base_url}/api/trades/execute",
            headers=auth_headers,
            json={"opportunity_id": opps[0]["id"], "amount_usd": 100.0},
        )
        assert rt.status_code == 200, rt.text
        d = rt.json()
        assert "id" in d
        assert d.get("mode") in ("SIMULATED", None) or "net_profit" in d


# ---------------- On-chain trade for explorer link testing ----------------
class TestOnChainTradeSeed:
    """Create an ONCHAIN trade row for the frontend explorer-link test."""

    def test_create_onchain_trade_row(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        opps = r.json().get("opportunities", [])
        # Prefer an EVM (non-Solana) opp
        evm = next(
            (o for o in opps if o["buy_dex"]["chain"] != "Solana"), None
        )
        assert evm, "expected at least one EVM opportunity"
        tx_hash = "0xabc0000000000000000000000000000000000000000000000000000000000001"
        payload = {
            "opportunity_id": evm["id"],
            "amount_usd": 100.0,
            "tx_hash": tx_hash,
            "chain_id": 137,
            "wallet_address": "0x0000000000000000000000000000000000000000",
            "explorer_url": f"https://polygonscan.com/tx/{tx_hash}",
        }
        r2 = requests.post(
            f"{base_url}/api/trades/onchain", headers=auth_headers, json=payload
        )
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert "id" in d
        assert d.get("tx_hash") == tx_hash or "tx_hash" in d
        # Verify via GET /api/trades/history
        rh = requests.get(
            f"{base_url}/api/trades/history?limit=200", headers=auth_headers
        )
        assert rh.status_code == 200
        history = rh.json()
        trades = history.get("trades", [])
        onchain_row = next((t for t in trades if t.get("tx_hash") == tx_hash), None)
        assert onchain_row, "created ONCHAIN trade should appear in /trades/history"
        assert onchain_row.get("mode") == "ONCHAIN"
        assert onchain_row.get("chain_id") == 137
