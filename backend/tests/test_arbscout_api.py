"""ArbScout backend API tests - all critical flows"""
import uuid
import time
import pytest
import requests


# ---------------- Health & Public ----------------
class TestHealth:
    def test_health(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "time" in body


# ---------------- Auth ----------------
class TestAuth:
    def test_register_creates_user_with_jwt(self, base_url, api_client):
        email = f"TEST_{uuid.uuid4().hex[:10]}@arbscout.io"
        r = api_client.post(
            f"{base_url}/api/auth/register",
            json={"email": email, "password": "test1234", "display_name": "TU"},
        )
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["token_type"] == "bearer"
        assert d["access_token"]
        # Backend lowercases emails
        assert d["user"]["email"] == email.lower()
        assert d["user"]["balance_usd"] == 10000.0
        assert d["user"]["total_pnl"] == 0.0
        assert d["user"]["id"]

    def test_register_duplicate_returns_409(self, base_url, api_client, test_user):
        r = api_client.post(
            f"{base_url}/api/auth/register",
            json={"email": test_user["email"], "password": "test1234"},
        )
        assert r.status_code == 409

    def test_register_short_password_422(self, base_url, api_client):
        r = api_client.post(
            f"{base_url}/api/auth/register",
            json={"email": f"TEST_{uuid.uuid4().hex[:8]}@arbscout.io", "password": "abc"},
        )
        assert r.status_code == 422

    def test_login_success(self, base_url, api_client, test_user):
        r = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": test_user["email"], "password": test_user["password"]},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["access_token"]
        assert d["user"]["email"] == test_user["email"].lower()

    def test_login_invalid_returns_401(self, base_url, api_client, test_user):
        r = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": test_user["email"], "password": "wrongpass"},
        )
        assert r.status_code == 401

    def test_me_requires_bearer(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_me_returns_user(self, base_url, api_client, auth_headers, test_user):
        r = requests.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == test_user["email"]
        assert d["balance_usd"] == 10000.0


# ---------------- Market data ----------------
class TestMarket:
    def test_market_overview_returns_tokens_with_prices(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/market/overview", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "tokens" in d and isinstance(d["tokens"], list)
        assert len(d["tokens"]) > 0, "Expected at least one token (CoinGecko may be rate limited)"
        first = d["tokens"][0]
        for k in ("id", "symbol", "name", "price", "image"):
            assert k in first
        assert first["price"] and first["price"] > 0
        assert d["total_market_cap"] > 0

    def test_market_overview_requires_auth(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/market/overview")
        assert r.status_code == 401


# ---------------- Scanner opportunities ----------------
class TestScanner:
    def test_opportunities_returns_list(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "opportunities" in d and "count" in d and "fetched_at" in d
        assert d["count"] == len(d["opportunities"])
        if d["opportunities"]:
            o = d["opportunities"][0]
            for k in ("id", "pair", "spread_pct", "buy_dex", "sell_dex", "buy_price", "sell_price"):
                assert k in o
            assert o["spread_pct"] >= 0.15
            assert "id" in o["buy_dex"] and "chain" in o["buy_dex"]
            assert o["sell_price"] > o["buy_price"]

    def test_opportunities_min_spread_filter(self, base_url, auth_headers):
        r = requests.get(
            f"{base_url}/api/scanner/opportunities?min_spread=1.0",
            headers=auth_headers,
        )
        assert r.status_code == 200
        d = r.json()
        for o in d["opportunities"]:
            assert o["spread_pct"] >= 1.0

    def test_opportunities_chain_filter(self, base_url, auth_headers):
        r = requests.get(
            f"{base_url}/api/scanner/opportunities?chain=Ethereum",
            headers=auth_headers,
        )
        assert r.status_code == 200
        d = r.json()
        for o in d["opportunities"]:
            assert (
                o["buy_dex"]["chain"] == "Ethereum"
                or o["sell_dex"]["chain"] == "Ethereum"
            )

    def test_opportunity_detail_returns_route(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        opps = r.json()["opportunities"]
        if not opps:
            pytest.skip("no opportunities available")
        opp_id = opps[0]["id"]
        r2 = requests.get(
            f"{base_url}/api/scanner/opportunity/{opp_id}", headers=auth_headers
        )
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["id"] == opp_id
        assert d.get("route") and len(d["route"]) == 3
        assert d["route"][0]["step"] == 1
        assert "slippage_pct" in d

    def test_opportunity_detail_not_found(self, base_url, auth_headers):
        r = requests.get(
            f"{base_url}/api/scanner/opportunity/nonexistent-id-xyz",
            headers=auth_headers,
        )
        assert r.status_code == 404


# ---------------- Trade execution + history ----------------
class TestTrades:
    def test_execute_trade_and_verify_persistence(self, base_url, auth_headers, test_user):
        # get an opp
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        opps = r.json()["opportunities"]
        if not opps:
            pytest.skip("no opportunities available")
        opp = opps[0]

        # get pre-balance
        me1 = requests.get(f"{base_url}/api/auth/me", headers=auth_headers).json()
        pre_balance = me1["balance_usd"]

        # execute
        r2 = requests.post(
            f"{base_url}/api/trades/execute",
            headers=auth_headers,
            json={"opportunity_id": opp["id"], "amount_usd": 500.0},
        )
        assert r2.status_code == 200, r2.text
        trade = r2.json()
        assert trade["mode"] == "SIMULATED"
        assert trade["amount_usd"] == 500.0
        assert trade["pair"] == opp["pair"]
        assert trade["status"] in ("completed", "completed_loss")
        assert "net_profit" in trade
        assert "gas_fee" in trade
        assert "gross_profit" in trade

        # verify balance changed
        me2 = requests.get(f"{base_url}/api/auth/me", headers=auth_headers).json()
        # balance should be pre + net_profit (approx)
        assert abs((me2["balance_usd"] - pre_balance) - trade["net_profit"]) < 0.01

        # verify trade in history
        h = requests.get(f"{base_url}/api/trades/history", headers=auth_headers).json()
        assert h["total_trades"] >= 1
        ids = [t["id"] for t in h["trades"]]
        assert trade["id"] in ids

    def test_execute_trade_insufficient_balance(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/scanner/opportunities", headers=auth_headers)
        opps = r.json()["opportunities"]
        if not opps:
            pytest.skip("no opportunities available")
        r2 = requests.post(
            f"{base_url}/api/trades/execute",
            headers=auth_headers,
            json={"opportunity_id": opps[0]["id"], "amount_usd": 9_999_999.0},
        )
        assert r2.status_code == 400

    def test_execute_trade_invalid_opp(self, base_url, auth_headers):
        r = requests.post(
            f"{base_url}/api/trades/execute",
            headers=auth_headers,
            json={"opportunity_id": "invalid-opp-id", "amount_usd": 100},
        )
        assert r.status_code == 404

    def test_execute_trade_requires_auth(self, base_url, api_client):
        r = api_client.post(
            f"{base_url}/api/trades/execute",
            json={"opportunity_id": "x", "amount_usd": 100},
        )
        assert r.status_code == 401

    def test_history_returns_trades_and_stats(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/trades/history", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("trades", "total_trades", "total_profit", "win_rate"):
            assert k in d
        assert isinstance(d["trades"], list)


# ---------------- Portfolio ----------------
class TestPortfolio:
    def test_portfolio_summary(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/portfolio/summary", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("balance_usd", "total_pnl", "total_trades", "win_rate", "pnl_24h", "trades_24h", "recent_trades"):
            assert k in d
        assert isinstance(d["recent_trades"], list)
        assert isinstance(d["win_rate"], (int, float))

    def test_portfolio_requires_auth(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/portfolio/summary")
        assert r.status_code == 401
