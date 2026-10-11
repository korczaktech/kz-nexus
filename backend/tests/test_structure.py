from fastapi.testclient import TestClient

from korczak_documents.config.settings import Settings
from korczak_documents.errors import AppError, NotFoundError, ValidationError
from korczak_documents.main import app
from korczak_documents.models.health import HealthResponse
from korczak_documents.repositories.health import HealthRepository
from korczak_documents.services.health import HealthService
from korczak_documents.validators.health import validate_health_service


def test_development_settings() -> None:
    settings = Settings()
    assert settings.app_env == "development"
    assert settings.api_host == "127.0.0.1"
    assert settings.api_port == 8000
    assert settings.is_production is False


def test_production_settings() -> None:
    settings = Settings(app_env="production")
    assert settings.is_production is True


def test_validation_rejects_empty_service_name() -> None:
    try:
        validate_health_service("   ")
    except ValidationError as exc:
        assert exc.code == "validation_error"
        assert exc.status_code == 422
    else:
        raise AssertionError("ValidationError esperado")


def test_validation_normalizes_service_name() -> None:
    assert validate_health_service("  Korczak Documents  ") == "Korczak Documents"


def test_repository_returns_health_status() -> None:
    assert HealthRepository().status() == "ok"


def test_service_uses_repository() -> None:
    class FakeRepository:
        def status(self) -> str:
            return "healthy"

    assert HealthService(FakeRepository()).check() == "healthy"


def test_health_model() -> None:
    response = HealthResponse(status="ok", service="korczak-documents-api")
    assert response.status == "ok"


def test_application_error_contract() -> None:
    error = AppError("Falha", "failure", 409)
    assert error.message == "Falha"
    assert error.code == "failure"
    assert error.status_code == 409


def test_not_found_error_contract() -> None:
    error = NotFoundError()
    assert error.code == "not_found"
    assert error.status_code == 404


def test_health_route_uses_layered_structure() -> None:
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "korczak-documents-api",
    }


def test_app_error_handler_returns_standard_json() -> None:
    from fastapi import APIRouter

    test_app = app
    router = APIRouter()

    @router.get("/test-app-error")
    def raise_error() -> None:
        raise NotFoundError("Documento não encontrado")

    test_app.include_router(router)
    response = TestClient(test_app).get("/test-app-error")
    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "not_found",
            "message": "Documento não encontrado",
        }
    }


def test_custom_production_web_origin_is_allowed_by_cors() -> None:
    response = TestClient(app).options(
        "/api/v1/health",
        headers={
            "Origin": "https://nexus.korczaktech.com.br",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://nexus.korczaktech.com.br"

