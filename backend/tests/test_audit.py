import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from korczak_documents.database.bootstrap import bootstrap_database
from korczak_documents.database.connection import get_database, get_accounts_database
from korczak_documents.main import app
from korczak_documents.repositories import api as repo


@pytest.mark.integration
@pytest.mark.asyncio
async def test_phase12_audit_contract():
    if not os.getenv("MONGODB_URI"):
        pytest.skip("MONGODB_URI não configurado")

    await bootstrap_database()
    database = get_database()
    for collection in ("documentos", "versoes", "pastas", "etiquetas", "sessoes", "notificacoes", "grupos", "eventos"):
        await database[collection].delete_many({})

    client = TestClient(app)
    email = f"audit-{uuid4().hex}@example.com"
    password = "Korczak-Seguro-2026!"
    register = client.post("/api/v1/auth/register", json={"name": "Auditoria", "email": email, "password": password})
    assert register.status_code == 201
    headers = {"Authorization": f"Bearer {register.json()['token']}"}
    user_id = register.json()["user"]["id"]

    document = client.post(
        "/api/v1/documents",
        headers=headers,
        json={"name": "Documento de auditoria", "document_type": "txt", "content": "conteúdo privado"},
    )
    assert document.status_code == 201
    document_id = document.json()["id"]
    assert client.patch(f"/api/v1/documents/{document_id}", headers=headers, json={"name": "Editado"}).status_code == 200
    assert client.delete(f"/api/v1/documents/{document_id}", headers=headers).status_code == 200
    assert client.post(f"/api/v1/documents/{document_id}/restore", headers=headers).status_code == 200

    await get_accounts_database()["contas"].update_one({"id": user_id}, {"$set": {"Conta.Role": "admin"}})
    assert client.put(
        f"/api/v1/permissions/{document_id}",
        headers=headers,
        json={"role": "editor", "actions": ["read", "write"], "user_ids": [], "group_ids": []},
    ).status_code == 200

    assert client.post("/api/v1/auth/login", json={"email": email, "password": "senha-incorreta"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": email, "password": password}).status_code == 200

    audit = client.get("/api/v1/audit", headers=headers, params={"page": 1, "page_size": 10})
    assert audit.status_code == 200
    assert audit.json()["total"] >= 1
    assert all(item["integrity_valid"] for item in audit.json()["items"])

    filtered = client.get(
        "/api/v1/audit",
        headers=headers,
        params={"event_type": "permission.changed", "document_id": document_id, "actor_id": user_id},
    )
    assert filtered.status_code == 200
    assert all(item["type"] == "permission.changed" for item in filtered.json()["items"])

    other = client.post(
        "/api/v1/auth/register",
        json={"name": "Outro", "email": f"other-{uuid4().hex}@example.com", "password": password},
    )
    other_headers = {"Authorization": f"Bearer {other.json()['token']}"}
    assert client.get("/api/v1/audit", headers=other_headers, params={"actor_id": user_id}).status_code == 403

    event = await database["eventos"].find_one({"type": "document.created", "actor_id": user_id})
    assert event and repo.event_integrity_valid(event)
    original_hash = event["integrity_hash"]
    await database["eventos"].update_one({"id": event["id"]}, {"$set": {"actor_id": "adulterado"}})
    tampered = await database["eventos"].find_one({"id": event["id"]})
    assert tampered["integrity_hash"] == original_hash
    assert repo.event_integrity_valid(tampered) is False
    await database["eventos"].update_one({"id": event["id"]}, {"$set": {"actor_id": user_id}})

    def has_sensitive_key(value):
        if isinstance(value, dict):
            return any(
                any(term in key.casefold() for term in ("password", "token", "secret", "authorization", "cookie", "api_key", "content"))
                or has_sensitive_key(nested)
                for key, nested in value.items()
            )
        if isinstance(value, list):
            return any(has_sensitive_key(item) for item in value)
        return False

    events = await database["eventos"].find({"actor_id": user_id}).to_list(length=200)
    assert events
    assert all(not has_sensitive_key(event.get("payload", {})) for event in events)

    for collection in ("usuarios", "documentos", "versoes", "pastas", "etiquetas", "sessoes", "notificacoes", "grupos", "eventos"):
        await database[collection].delete_many({})
