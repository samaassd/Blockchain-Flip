"""Iteration 8 backend tests — profile fields + trades/execute regression.

Covers:
- GET /api/auth/me returns picture (null for email) and auth_provider ('email').
- POST /api/trades/execute still works (simulated) and balance/pnl are decremented/incremented by net_profit.
"""
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


# ---------- profile fields on /auth/me ----------
class TestAuthMeProfileFields:
    def test_me_returns_picture_and_auth_provider_for_email_user(self, auth_headers, test_user):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == test_user["email"].lower()
        # New iter_8 fields
        assert "picture" in data, "picture field missing on /auth/me"
        assert data["picture"] is None, f"email user should have picture=null, got {data['picture']!r}"
        assert "auth_provider" in data, "auth_provider field missing on /auth/me"
        assert data["auth_provider"] == "email", f"email user should have auth_provider='email', got {data['auth_provider']!r}"
        # Sanity — untouched fields still present
        assert isinstance(data.get("balance_usd"), (int, float))
        assert isinstance(data.get("total_pnl"), (int, float))

    def test_register_response_includes_picture_and_auth_provider(self):
        email = f"TEST_{uuid.uuid4().hex[:10]}@arbscout.io"
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "test1234", "display_name": "Iter8 Trader"},
        )
        assert r.status_code == 201, r.text
        user = r.json()["user"]
        assert user["picture"] is None
        assert user["auth_provider"] == "email"


# ---------- trades/execute simulated regression ----------
class TestSimulatedTradeExecution:
    def _get_opp(self, headers):
        r = requests.get(f"{BASE_URL}/api/scanner/opportunities?min_spread=0.15", headers=headers)
        assert r.status_code == 200, r.text
        opps = r.json()["opportunities"]
        assert opps, "no opportunities available"
        return opps[0]

    def test_execute_simulated_decrements_or_increments_balance_by_net_profit(self, auth_headers):
        # baseline balance
        me0 = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers).json()
        opp = self._get_opp(auth_headers)
        amount = 1000.0
        r = requests.post(
            f"{BASE_URL}/api/trades/execute",
            headers=auth_headers,
            json={"opportunity_id": opp["id"], "amount_usd": amount},
        )
        assert r.status_code == 200, r.text
        trade = r.json()
        assert trade["mode"] == "SIMULATED"
        assert trade["amount_usd"] == amount
        assert trade["pair"] == opp["pair"]
        assert isinstance(trade["net_profit"], (int, float))
        # balance should shift by net_profit exactly
        me1 = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers).json()
        delta = round(me1["balance_usd"] - me0["balance_usd"], 4)
        assert delta == round(trade["net_profit"], 4), f"balance delta {delta} != net_profit {trade['net_profit']}"
        # trade shows up in history
        hist = requests.get(f"{BASE_URL}/api/trades/history", headers=auth_headers).json()
        assert any(t["id"] == trade["id"] for t in hist["trades"])
        assert any(t["mode"] == "SIMULATED" for t in hist["trades"])

    def test_execute_rejects_over_balance(self, auth_headers):
        opp = self._get_opp(auth_headers)
        r = requests.post(
            f"{BASE_URL}/api/trades/execute",
            headers=auth_headers,
            json={"opportunity_id": opp["id"], "amount_usd": 1_000_000.0},
        )
        assert r.status_code == 400
        assert "Insufficient" in r.json().get("detail", "")

    def test_execute_rejects_unknown_opportunity(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/trades/execute",
            headers=auth_headers,
            json={"opportunity_id": "nonexistent-opp-id", "amount_usd": 100.0},
        )
        assert r.status_code == 404


# ---------- auth guard sanity ----------
class TestAuthGuard:
    def test_me_requires_bearer(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_execute_requires_bearer(self):
        r = requests.post(
            f"{BASE_URL}/api/trades/execute",
            json={"opportunity_id": "x", "amount_usd": 100.0},
        )
        assert r.status_code == 401
