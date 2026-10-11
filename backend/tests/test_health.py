from fastapi.testclient import TestClient
from korczak_documents.main import app

client = TestClient(app)

def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"



def test_readiness_requires_database(monkeypatch) -> None:
    import asyncio
    import korczak_documents.main as main_module

    class HealthyDatabase:
        async def command(self, command):
            assert command == {"ping": 1}
            return {"ok": 1}

    monkeypatch.setattr(main_module, "get_database", lambda: HealthyDatabase())
    response = TestClient(main_module.app).get("/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_readiness_returns_503_when_database_unavailable(monkeypatch) -> None:
    import korczak_documents.main as main_module

    class UnhealthyDatabase:
        async def command(self, command):
            raise RuntimeError("private connection details")

    monkeypatch.setattr(main_module, "get_database", lambda: UnhealthyDatabase())
    response = TestClient(main_module.app).get("/ready")
    assert response.status_code == 503
    assert response.json()["status"] == "unavailable"
    assert "private connection details" not in response.text
