import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from korczak_documents.database.bootstrap import bootstrap_database
from korczak_documents.database.connection import get_database, get_accounts_database
from korczak_documents.main import app
from korczak_documents.rate_limit import enforce_rate_limit, reset_rate_limits
from korczak_documents.security import hash_password, validate_password_policy, verify_password


def test_rate_limit_blocks_after_threshold():
    reset_rate_limits()
    for _ in range(10):
        enforce_rate_limit("unit-test-client", "login")
    with pytest.raises(Exception) as exc_info:
        enforce_rate_limit("unit-test-client", "login")
    assert getattr(exc_info.value, "code", None) == "rate_limited"
    reset_rate_limits()


def test_password_hash_is_salted_and_not_plaintext():
    raw = "Senha-Segura-2026!"
    encoded = hash_password(raw)
    assert encoded != raw
    assert encoded.startswith(("$2a$", "$2b$", "$2y$"))
    assert verify_password(raw, encoded)
    assert not verify_password("outra-senha", encoded)
    assert hash_password(raw) != encoded


@pytest.mark.parametrize("password", ["12345678", "sem-maiuscula-123!", "SEM-MINUSCULA-123!", "SemNumero-aaaa!", "SemEspecial1234"])
def test_password_policy_rejects_weak_passwords(password):
    with pytest.raises(Exception):
        validate_password_policy(password, "user@example.com", "User")


def test_password_policy_accepts_strong_password():
    validate_password_policy("Korczak-Seguro-2026!", "user@example.com", "User")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_security_end_to_end():
    if not os.getenv("MONGODB_URI"):
        pytest.skip("MONGODB_URI não configurado")
    reset_rate_limits()
    await bootstrap_database()
    database = get_database()
    for collection in ("documentos", "versoes", "pastas", "etiquetas", "sessoes", "notificacoes", "grupos", "eventos"):
        await database[collection].delete_many({})

    client = TestClient(app)
    email = f"security-{uuid4().hex}@example.com"
    password = "Korczak-Seguro-2026!"
    register = client.post("/api/v1/auth/register", json={"name": "Security", "email": email, "password": password})
    assert register.status_code == 201
    token = register.json()["token"]
    user_id = register.json()["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/users/me", headers=headers).status_code == 200
    assert "password" not in register.text.lower()

    logout = client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 200
    assert client.get("/api/v1/users/me", headers=headers).status_code == 401

    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    other = client.post("/api/v1/auth/register", json={"name": "Other", "email": f"other-{uuid4().hex}@example.com", "password": password})
    assert other.status_code == 201
    other_headers = {"Authorization": f"Bearer {other.json()['token']}"}
    document = client.post("/api/v1/documents", headers=headers, json={"name": "Privado", "document_type": "txt"}).json()
    assert client.get(f"/api/v1/documents/{document['id']}", headers=other_headers).status_code == 404
    assert client.delete(f"/api/v1/documents/{document['id']}", headers=other_headers).status_code == 404
    assert client.get("/api/v1/users", headers=other_headers).status_code == 403

    await get_accounts_database()["contas"].update_one({"id": user_id}, {"$set": {"Conta.Role": "manager"}})
    manager_token = client.post("/api/v1/auth/login", json={"email": email, "password": password}).json()["token"]
    manager_headers = {"Authorization": f"Bearer {manager_token}"}
    manager_users = client.get("/api/v1/users", headers=manager_headers)
    assert manager_users.status_code == 200
    assert all(item["role"] != "admin" for item in manager_users.json())

    events = await database["eventos"].find({"user_id": user_id}).to_list(length=100)
    assert all("@" not in str(event.get("payload")) for event in events)

    await get_accounts_database()["contas"].delete_many({"id": {"$in": [user_id, other.json()["user"]["id"]]}})
    await database["documentos"].delete_many({})
    await database["versoes"].delete_many({})
    await database["pastas"].delete_many({})
    await database["etiquetas"].delete_many({})
    await database["sessoes"].delete_many({})
    await database["eventos"].delete_many({})
    await database["notificacoes"].delete_many({})
    await database["grupos"].delete_many({})


def test_security_headers_and_cors_contract():
    reset_rate_limits()
    response = TestClient(app).get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "access-control-allow-origin" in response.headers
