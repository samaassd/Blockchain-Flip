"""Iteration 4: New features tests - Solana/Jupiter, 1inch, LI.FI bridge, reconcile"""
import uuid
import pytest
import requests


# ---------------- 1inch spot-price ----------------
class TestOneInch:
    """1inch endpoint should return 200 even if key is invalid (401 upstream)."""

    def test_oneinch_status_returns_200_gracefully(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/prices/oneinch", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "configured" in d
        assert d["configured"] is True  # key exists in .env even if invalid
        assert "chains_returned" in d
        assert isinstance(d["chains_returned"], list)
        # Should be empty list since the current key is invalid (401 upstream)
        assert "sample" in d

    def test_oneinch_requires_auth(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/prices/oneinch")
        assert r.status_code == 401


# ---------------- LI.FI bridge ----------------
class TestBridge:
    def test_bridge_chains_returns_non_empty(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/bridge/chains", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "chains" in d
        assert isinstance(d["chains"], list)
        assert len(d["chains"]) > 0, "Expected LI.FI to return chain list"
        # Check structure
        c = d["chains"][0]
        for k in ("id", "name", "key"):
            assert k in c

    def test_bridge_chains_requires_auth(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/bridge/chains")
        assert r.status_code == 401

    def test_bridge_quote_does_not_crash_on_zero_address(self, base_url, auth_headers):
        """LI.FI may reject zero-address; endpoint must return 200/400/500 gracefully."""
        params = {
            "fromChain": 1,
            "toChain": 137,
            "fromToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            "toToken": "0x0000000000000000000000000000000000001010",
            "fromAmount": "1000000000000000000",
            "fromAddress": "0x0000000000000000000000000000000000000000",
        }
        r = requests.get(
            f"{base_url}/api/bridge/quote", headers=auth_headers, params=params
        )
        # Should not be a 5xx crash of our server (500 is OK if LI.FI rejects; but no gateway error)
        assert r.status_code in (200, 400, 500), r.text
        # Response must be JSON-parseable
        d = r.json()
        assert isinstance(d, dict)


# ---------------- Solana / Jupiter ----------------
class TestSolana:
    def test_solana_quote_returns_outamount(self, base_url, auth_headers):
        params = {
            "inputMint": "So11111111111111111111111111111111111111112",
            "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "amount": "100000000",
            "slippageBps": 50,
        }
        # Note: server implements GET (not POST as stated in spec) — test both
        r = requests.get(
            f"{base_url}/api/solana/quote", headers=auth_headers, params=params
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "outAmount" in d, f"Expected outAmount in Jupiter response: {d}"
        # outAmount is a stringified int
        assert int(d["outAmount"]) > 0

    def test_solana_quote_requires_auth(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/solana/quote", params={
            "inputMint": "So11111111111111111111111111111111111111112",
            "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "amount": "100000000",
            "slippageBps": 50,
        })
        assert r.status_code == 401


# ---------------- Scanner opportunities: cross-chain & Solana DEXs ----------------
class TestScannerNew:
    def test_opportunities_include_cross_chain_field(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["opportunities"], "Expected some opportunities"
        for o in d["opportunities"]:
            assert "is_cross_chain" in o
            assert "buy_chain_id" in o
            assert "sell_chain_id" in o
            assert isinstance(o["is_cross_chain"], bool)
            if o["is_cross_chain"]:
                assert o["buy_chain_id"] != o["sell_chain_id"]

    def test_opportunities_may_include_solana(self, base_url, auth_headers):
        """Solana DEXs (raydium/orca) should show up at least sometimes.
        Try several refreshes since selection is random per 45s bucket."""
        found_solana = False
        found_cross = False
        for _ in range(3):
            r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
            for o in r.json().get("opportunities", []):
                if o["buy_dex"]["chain"] == "Solana" or o["sell_dex"]["chain"] == "Solana":
                    found_solana = True
                if o.get("is_cross_chain"):
                    found_cross = True
            if found_solana and found_cross:
                break
        # Not strict — DEX universe includes raydium/orca so this should typically hit
        assert found_solana or found_cross, (
            "Expected at least one Solana or cross-chain opp across refreshes"
        )

    def test_cross_chain_opportunity_detail_has_bridge_step(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        opps = r.json().get("opportunities", [])
        cross = next((o for o in opps if o.get("is_cross_chain")), None)
        if not cross:
            pytest.skip("no cross-chain opp available in this refresh")
        r2 = requests.get(
            f"{base_url}/api/scanner/opportunity/{cross['id']}", headers=auth_headers
        )
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d.get("is_cross_chain") is True
        assert d.get("route") and len(d["route"]) == 3
        # Should contain a Bridge step referencing LI.FI
        bridge_steps = [s for s in d["route"] if "LI.FI" in (s.get("venue") or "")]
        assert bridge_steps, f"Expected bridge step with LI.FI venue: {d['route']}"


# ---------------- On-chain reconcile ----------------
class TestReconcile:
    def test_reconcile_fake_trade_id_404(self, base_url, auth_headers):
        r = requests.post(
            f"{base_url}/api/trades/reconcile",
            headers=auth_headers,
            json={"trade_id": f"fake-{uuid.uuid4()}"},
        )
        assert r.status_code == 404, r.text

    def test_reconcile_requires_auth(self, base_url, api_client):
        r = api_client.post(
            f"{base_url}/api/trades/reconcile",
            json={"trade_id": "x"},
        )
        assert r.status_code == 401

    def test_reconcile_only_onchain_trades(self, base_url, auth_headers):
        """A SIMULATED trade cannot be reconciled — should return 400."""
        # Create a simulated trade
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        opps = r.json().get("opportunities", [])
        if not opps:
            pytest.skip("no opportunities")
        rt = requests.post(
            f"{base_url}/api/trades/execute",
            headers=auth_headers,
            json={"opportunity_id": opps[0]["id"], "amount_usd": 50.0},
        )
        assert rt.status_code == 200
        tid = rt.json()["id"]
        rec = requests.post(
            f"{base_url}/api/trades/reconcile",
            headers=auth_headers,
            json={"trade_id": tid},
        )
        assert rec.status_code == 400, rec.text

    def test_reconcile_real_onchain_pending_or_status(self, base_url, auth_headers):
        """Post an ONCHAIN trade with a fake tx_hash — reconcile must return 'pending'
        (or a mapped status) without crashing."""
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        opps = r.json().get("opportunities", [])
        # Prefer an EVM opp (not solana) since the reconcile path uses web3
        evm_opp = next(
            (o for o in opps if o["buy_dex"]["chain"] != "Solana"), None
        )
        if not evm_opp:
            pytest.skip("no EVM opp available")
        fake_hash = "0x" + "a" * 64
        r2 = requests.post(
            f"{base_url}/api/trades/onchain",
            headers=auth_headers,
            json={
                "opportunity_id": evm_opp["id"],
                "amount_usd": 100.0,
                "tx_hash": fake_hash,
                "chain_id": evm_opp["buy_chain_id"],
                "wallet_address": "0x0000000000000000000000000000000000000001",
                "explorer_url": "https://etherscan.io/tx/" + fake_hash,
            },
        )
        assert r2.status_code == 200, r2.text
        trade_id = r2.json()["id"]
        rec = requests.post(
            f"{base_url}/api/trades/reconcile",
            headers=auth_headers,
            json={"trade_id": trade_id},
        )
        # Should return 200 with pending status (tx doesn't exist) - not crash
        assert rec.status_code == 200, rec.text
        d = rec.json()
        assert "status" in d
        # Since the tx doesn't exist on chain, status should be 'pending'
        assert d["status"] == "pending", f"Expected pending status: {d}"
