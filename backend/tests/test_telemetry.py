from fastapi.testclient import TestClient

from korczak_documents.main import app
from korczak_documents.telemetry import request_finished, request_started, snapshot

client = TestClient(app)


def test_telemetry_dashboard_is_server_rendered_without_javascript(monkeypatch) -> None:
    import korczak_documents.main as main_module

    async def fake_ci():
        return {"state": "success", "label": "ÚLTIMA VALIDAÇÃO OK", "updated_at": "2026-10-15T00:00:00Z", "url": "https://github.com/korczaktech/kz-nexus/actions"}

    monkeypatch.setattr(main_module, "get_engine_ci_status", fake_ci)
    response = client.get("/telemetry")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "meta http-equiv=\"refresh\"" in response.text.lower()
    assert "<script" not in response.text.lower()
    assert "Telemetria Kortex" in response.text


def test_telemetry_metrics_are_aggregated_and_do_not_keep_query_strings() -> None:
    request_started()
    request_finished("GET", "/api/v1/documents/123?secret=not-retained", 500, 42.5)
    metrics = snapshot()
    assert metrics["requests_total_since_start"] >= 1
    assert metrics["errors_last_5m"] >= 1
    assert any(item["path"] == "/api/v1/documents/:id" for item in metrics["recent_errors"])
    assert all("secret" not in item["path"] for item in metrics["recent_errors"])


def test_telemetry_metrics_endpoint_is_json() -> None:
    response = client.get("/telemetry/metrics")
    assert response.status_code == 200
    assert response.json()["service"] == "Korczak Nexus API"
    assert "recent_errors" in response.json()
