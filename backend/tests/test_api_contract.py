import json
from fastapi.testclient import TestClient

from korczak_documents.main import app
from korczak_documents.models.api import DocumentSaveRequest, RegisterRequest
from korczak_documents.routes import router as api_router


EXPECTED = {
    ("POST", "/api/v1/auth/register"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/logout"),
    ("POST", "/api/v1/auth/recovery"),
    ("GET", "/api/v1/users/me"),
    ("PATCH", "/api/v1/users/me"),
    ("GET", "/api/v1/users"),
    ("GET", "/api/v1/documents"),
    ("POST", "/api/v1/documents"),
    ("GET", "/api/v1/documents/{document_id}"),
    ("PATCH", "/api/v1/documents/{document_id}"),
    ("DELETE", "/api/v1/documents/{document_id}"),
    ("POST", "/api/v1/documents/{document_id}/restore"),
    ("DELETE", "/api/v1/documents/{document_id}/permanent"),
    ("GET", "/api/v1/documents/{document_id}/versions"),
    ("POST", "/api/v1/documents/{document_id}/versions"),
    ("GET", "/api/v1/folders"),
    ("POST", "/api/v1/folders"),
    ("PATCH", "/api/v1/folders/{folder_id}"),
    ("DELETE", "/api/v1/folders/{folder_id}"),
    ("GET", "/api/v1/tags"),
    ("POST", "/api/v1/tags"),
    ("DELETE", "/api/v1/tags/{tag_name}"),
    ("POST", "/api/v1/documents/{document_id}/tags/{tag_name}"),
    ("DELETE", "/api/v1/documents/{document_id}/tags/{tag_name}"),
    ("POST", "/api/v1/documents/{document_id}/favorite"),
    ("DELETE", "/api/v1/documents/{document_id}/favorite"),
    ("GET", "/api/v1/favorites"),
    ("GET", "/api/v1/recent"),
    ("GET", "/api/v1/trash"),
    ("GET", "/api/v1/search"),
    ("POST", "/api/v1/documents/{document_id}/open"),
    ("GET", "/api/v1/groups"),
    ("POST", "/api/v1/groups"),
    ("POST", "/api/v1/groups/{group_id}/members/{member_id}"),
    ("DELETE", "/api/v1/groups/{group_id}/members/{member_id}"),
    ("GET", "/api/v1/permissions/{document_id}"),
    ("PUT", "/api/v1/permissions/{document_id}"),
    ("GET", "/api/v1/audit"),
    ("GET", "/api/v1/notifications"),
    ("POST", "/api/v1/notifications/{notification_id}/read"),
}


def test_api_route_inventory() -> None:
    # O prefixo /api/v1 é aplicado pelo aplicativo na montagem do router.
    # O inventário é validado na fonte do router para manter o contrato
    # independente da forma interna de montagem do FastAPI.
    routes = {
        (method, f"/api/v1{route.path}")
        for route in api_router.routes
        for method in getattr(route, "methods", set())
        if method != "HEAD"
    }
    assert EXPECTED <= routes


def test_health_is_available() -> None:
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200


def test_request_validation_is_strict() -> None:
    try:
        RegisterRequest(name="A", email="a@example.com", password="12345678", extra="x")
    except Exception as exc:
        assert "extra" in str(exc)
    else:
        raise AssertionError("Campos desconhecidos deveriam ser rejeitados")


def test_validation_error_uses_standard_contract() -> None:
    response = TestClient(app).post("/api/v1/auth/register", json={"name": "", "email": "bad", "password": "x"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"



def test_native_kortex_payload_requires_a_valid_nsx_envelope() -> None:
    payload = json.dumps({
        "format": "korczak-nexus",
        "formatVersion": 1,
        "document": {"id": "doc-test", "schemaVersion": 1},
    })
    request = DocumentSaveRequest(
        name="Teste Kortex",
        document_type="nsx",
        content="<p>Projeção</p>",
        native_content=payload,
        base_version_id=None,
    )
    assert request.native_content == payload

    try:
        DocumentSaveRequest(
            name="Teste inválido",
            document_type="nsx",
            content="<p>Projeção</p>",
            native_content="<p>não é NSX</p>",
            base_version_id=None,
        )
    except Exception as exc:
        assert "native_content" in str(exc)
    else:
        raise AssertionError("Payload HTML não pode ser aceito como documento NSX")
