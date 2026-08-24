import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load frontend env to get public backend URL (what the user accesses)
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def test_user(base_url, api_client):
    """Register a fresh test user and yield {email, password, token, user}"""
    email = f"TEST_{uuid.uuid4().hex[:12]}@arbscout.io"
    password = "test1234"
    r = api_client.post(
        f"{base_url}/api/auth/register",
        json={"email": email, "password": password, "display_name": "Test Trader"},
    )
    assert r.status_code == 201, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "email": email,
        "password": password,
        "token": data["access_token"],
        "user": data["user"],
    }


@pytest.fixture(scope="session")
def auth_headers(test_user):
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {test_user['token']}",
    }
