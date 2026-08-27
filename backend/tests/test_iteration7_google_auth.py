"""Iteration 7 focused tests:
- New: POST /api/auth/session (Emergent Google session exchange)
- Regression: existing email/password auth + protected endpoints still work
  after the current_user() change that accepts either JWT or Google session token.
"""
import uuid
import requests
import pytest


# ---------- 1) NEW endpoint: /api/auth/session ----------
class TestGoogleSessionEndpoint:
    def test_session_missing_body_returns_422(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/auth/session", json={})
        # Pydantic body validation
        assert r.status_code == 422, r.text

    def test_session_invalid_session_id_returns_401(self, base_url, api_client):
        # A random UUID cannot be a valid Emergent session; the upstream must reject it.
        bad = f"nonexistent-session-{uuid.uuid4().hex}"
        r = api_client.post(
            f"{base_url}/api/auth/session", json={"session_id": bad}
        )
        assert r.status_code == 401, r.text
        detail = (r.json() or {}).get("detail", "")
        # server returns one of: 'Invalid or expired session', 'Could not verify session', 'Invalid session data'
        assert isinstance(detail, str) and len(detail) > 0

    def test_session_empty_session_id_returns_401(self, base_url, api_client):
        r = api_client.post(
            f"{base_url}/api/auth/session", json={"session_id": ""}
        )
        # empty string is accepted by pydantic (min_length not set) but rejected upstream
        assert r.status_code in (401, 422), r.text


# ---------- 2) Regression: email/password auth still works ----------
class TestEmailPasswordAuthRegression:
    def test_register_login_me_flow(self, base_url, api_client):
        email = f"TEST_{uuid.uuid4().hex[:10]}@arbscout.io"
        password = "test1234"
        # register
        r = api_client.post(
            f"{base_url}/api/auth/register",
            json={"email": email, "password": password, "display_name": "Iter7"},
        )
        assert r.status_code == 201, r.text
        token = r.json()["access_token"]
        assert token
        # login
        r2 = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": email, "password": password},
        )
        assert r2.status_code == 200, r2.text
        login_token = r2.json()["access_token"]
        assert login_token
        # /auth/me with Bearer JWT
        r3 = requests.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": f"Bearer {login_token}"},
        )
        assert r3.status_code == 200, r3.text
        me = r3.json()
        assert me["email"] == email.lower()
        assert me["balance_usd"] == 10000.0

    def test_me_with_invalid_bearer_returns_401(self, base_url, api_client):
        r = requests.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": "Bearer definitely.not.a.valid.jwt"},
        )
        assert r.status_code == 401


# ---------- 3) Regression: protected endpoints accept JWT after current_user change ----------
class TestProtectedEndpointsWithJwt:
    def test_scanner_opportunities_with_jwt(self, base_url, auth_headers):
        r = requests.get(
            f"{base_url}/api/scanner/opportunities", headers=auth_headers
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "opportunities" in d and "count" in d

    def test_scanner_opportunities_missing_auth_returns_401(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/scanner/opportunities")
        assert r.status_code == 401

    def test_scanner_opportunities_bad_token_returns_401(self, base_url):
        r = requests.get(
            f"{base_url}/api/scanner/opportunities",
            headers={"Authorization": "Bearer garbage-token-xyz"},
        )
        assert r.status_code == 401

    def test_portfolio_summary_with_jwt(self, base_url, auth_headers):
        r = requests.get(
            f"{base_url}/api/portfolio/summary", headers=auth_headers
        )
        assert r.status_code == 200, r.text

    def test_market_overview_with_jwt(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/market/overview", headers=auth_headers)
        assert r.status_code == 200, r.text

    def test_trades_history_with_jwt(self, base_url, auth_headers):
        r = requests.get(f"{base_url}/api/trades/history", headers=auth_headers)
        assert r.status_code == 200, r.text
