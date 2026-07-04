from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_categories():
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    values = [c["value"] for c in resp.json()]
    assert "transport" in values
    assert len(values) == 12
