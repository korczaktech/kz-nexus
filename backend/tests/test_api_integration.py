import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from korczak_documents.database.bootstrap import bootstrap_database
from korczak_documents.database.connection import get_database, get_accounts_database
from korczak_documents.main import app
from korczak_documents.repositories import api as repo


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_end_to_end() -> None:
    if not os.getenv("MONGODB_URI"):
        pytest.skip("MONGODB_URI não configurado")

    await bootstrap_database()
    database = get_database()
    for collection in ("documentos", "versoes", "pastas", "etiquetas", "sessoes", "eventos", "notificacoes", "grupos"):
        await database[collection].delete_many({})

    client = TestClient(app)
    email = f"phase4-{uuid4().hex}@example.com"
    password = "Korczak-Fase4-2026!"

    response = client.post("/api/v1/auth/register", json={"name": "Fase 4", "email": email, "password": password})
    assert response.status_code == 201
    token = response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/users/me", headers=headers).status_code == 200
    assert client.patch("/api/v1/users/me", headers=headers, json={"name": "Fase 4 Atualizada", "phone": "11999999999"}).status_code == 200

    folder = client.post("/api/v1/folders", headers=headers, json={"name": "Projetos"}).json()
    assert client.patch(f"/api/v1/folders/{folder['id']}", headers=headers, json={"name": "Projetos 2026"}).status_code == 200
    assert client.get("/api/v1/folders", headers=headers).json()[0]["name"] == "Projetos 2026"

    document = client.post(
        "/api/v1/documents",
        headers=headers,
        json={"name": "Documento de teste", "document_type": "txt", "folder_id": folder["id"], "content": "v1"},
    ).json()
    document_id = document["id"]
    assert document["current_version_id"]
    base_version_id = document["current_version_id"]
    saved = client.post(f"/api/v1/documents/{document_id}/save", headers=headers, json={"name":"Documento de teste","document_type":"txt","content":"conteúdo pequeno salvo","base_version_id":base_version_id})
    assert saved.status_code == 200
    fresh = saved.json()
    assert fresh["content"] == "conteúdo pequeno salvo"
    stale = client.post(f"/api/v1/documents/{document_id}/save", headers=headers, json={"name":"Conflito","document_type":"txt","content":"alteração concorrente","base_version_id":base_version_id})
    assert stale.status_code == 409
    large_content = ("Korczak Documents " * 12000).strip()
    current_version = fresh["current_version_id"]
    large = client.post(f"/api/v1/documents/{document_id}/save", headers=headers, json={"name":"Documento grande","document_type":"txt","content":large_content,"base_version_id":current_version})
    assert large.status_code == 200
    assert len(large.json()["content"]) == len(large_content)

    assert client.get(f"/api/v1/documents/{document_id}", headers=headers).status_code == 200
    assert client.get("/api/v1/documents", headers=headers).status_code == 200
    moved = client.patch(f"/api/v1/documents/{document_id}", headers=headers, json={"name": "Documento atualizado", "folder_id": None})
    assert moved.status_code == 200 and moved.json()["folder_id"] is None
    moved_back = client.patch(f"/api/v1/documents/{document_id}", headers=headers, json={"folder_id": folder["id"]})
    assert moved_back.status_code == 200 and moved_back.json()["folder_id"] == folder["id"]
    assert client.post(f"/api/v1/documents/{document_id}/versions", headers=headers, json={"content": "v2"}).status_code == 201
    assert client.get(f"/api/v1/documents/{document_id}/versions", headers=headers).status_code == 200
    versions = client.get(f"/api/v1/documents/{document_id}/versions", headers=headers).json()
    assert client.post(f"/api/v1/documents/{document_id}/versions/{versions[0]['id' ]}/restore", headers=headers, json={}).status_code == 200

    assert client.post(f"/api/v1/documents/{document_id}/open", headers=headers).status_code == 200
    assert client.get("/api/v1/recent", headers=headers).status_code == 200
    assert client.post(f"/api/v1/documents/{document_id}/favorite", headers=headers).status_code == 200
    assert client.get("/api/v1/favorites", headers=headers).status_code == 200
    assert client.delete(f"/api/v1/documents/{document_id}/favorite", headers=headers).status_code == 200

    assert client.post("/api/v1/tags", headers=headers, json={"name": "importante"}).status_code == 201
    assert client.post("/api/v1/tags", headers=headers, json={"name": "importante"}).status_code == 409
    assert client.post(f"/api/v1/documents/{document_id}/tags/importante", headers=headers).status_code == 200
    tagged = client.get(f"/api/v1/documents/{document_id}", headers=headers).json()
    assert "importante" in tagged["tag_names"]
    assert client.get("/api/v1/tags", headers=headers).status_code == 200
    assert client.delete(f"/api/v1/documents/{document_id}/tags/importante", headers=headers).status_code == 200
    assert client.post(f"/api/v1/documents/{document_id}/tags/importante", headers=headers).status_code == 200
    assert client.delete("/api/v1/tags/importante", headers=headers).status_code == 200
    assert "importante" not in client.get(f"/api/v1/documents/{document_id}", headers=headers).json()["tag_names"]

    group_denied = client.post("/api/v1/groups", headers=headers, json={"name": "Equipe"})
    assert group_denied.status_code == 403
    user_id = client.get("/api/v1/users/me", headers=headers).json()["id"]

    assert client.get(f"/api/v1/permissions/{document_id}", headers=headers).status_code == 200

    assert client.patch(f"/api/v1/documents/{document_id}", headers=headers, json={"description": "manual de pesquisa combinado"}).status_code == 200
    assert client.post("/api/v1/tags", headers=headers, json={"name": "busca"}).status_code == 201
    assert client.post(f"/api/v1/documents/{document_id}/tags/busca", headers=headers, json={}).status_code == 200
    assert client.get("/api/v1/search", headers=headers, params={"q": "manual", "folder_id": folder["id"], "tag": "busca"}).json()["total"] >= 1
    assert client.get("/api/v1/search", headers=headers, params={"q": "Documento", "sort": "name_asc"}).status_code == 200
    search_result = client.get("/api/v1/search", headers=headers, params={"q": "conteúdo pequeno salvo", "sort": "name_asc", "page": 1, "page_size": 10})
    assert search_result.status_code == 200
    assert search_result.json()["page_size"] == 10
    assert any(x["id"] == document_id for x in search_result.json()["items"])
    assert client.get("/api/v1/search", headers=headers, params={"folder_id": folder["id"]}).status_code == 200
    assert client.get("/api/v1/search", headers=headers, params={"tag": "inexistente"}).json()["total"] == 0
    assert client.get("/api/v1/search", headers=headers, params={"owner_id": user_id}).status_code == 200
    assert client.get("/api/v1/search", headers=headers, params={"owner_id": "outro"}).status_code == 403
    assert client.get("/api/v1/search", headers=headers, params={"status_filter": "active", "date_from": "2026-01-01", "date_to": "2026-12-31"}).status_code == 200
    assert client.get("/api/v1/search", headers=headers, params={"sort": "name_asc", "page": 2, "page_size": 1}).status_code == 200
    bulk = [{"id": str(uuid4()), "owner_id": user_id, "name": f"Grande {n}", "document_type": "txt", "description": "lote grande", "folder_id": folder["id"], "current_version_id": None, "status": "active", "favorite_user_ids": [], "tag_names": [], "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc), "updated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)} for n in range(120)]
    await database["documentos"].insert_many(bulk)
    large = client.get("/api/v1/search", headers=headers, params={"q": "lote grande", "page": 5, "page_size": 25})
    assert large.status_code == 200 and large.json()["total"] == 120 and len(large.json()["items"]) == 20
    assert client.get("/api/v1/search", headers=headers, params={"status_filter": "active", "date_from": "2026-01-01", "date_to": "2026-12-31"}).status_code == 200
    assert client.get("/api/v1/audit", headers=headers).status_code == 200
    assert client.get("/api/v1/notifications", headers=headers).status_code == 200

    await database["notificacoes"].insert_one({
        "id": str(uuid4()),
        "user_id": user_id,
        "type": "test",
        "message": "Teste",
        "read": False,
        "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc),
    })
    notification = client.get("/api/v1/notifications", headers=headers).json()[0]
    assert client.post(f"/api/v1/notifications/{notification['id']}/read", headers=headers).status_code == 200

    await get_accounts_database()["contas"].update_one({"id": user_id}, {"$set": {"Conta.Role": "admin"}})
    assert client.get("/api/v1/users", headers=headers).status_code == 200
    assert client.put(
        f"/api/v1/permissions/{document_id}",
        headers=headers,
        json={"role": "editor", "actions": ["read", "write"], "user_ids": [], "group_ids": []},
    ).status_code == 200
    bad_login = client.post("/api/v1/auth/login", json={"email": email, "password": "senha-incorreta"})
    assert bad_login.status_code == 401

    audit_all = client.get("/api/v1/audit", headers=headers, params={"page": 1, "page_size": 100})
    assert audit_all.status_code == 200
    audit_items = audit_all.json()["items"]
    assert audit_all.json()["total"] >= 1
    assert all(item["integrity_valid"] is True for item in audit_items if item.get("integrity_hash"))
    assert any(item["type"] == "document.created" for item in audit_items)
    assert any(item["type"] == "permission.changed" for item in audit_items)
    assert any(item["type"] == "auth.login_failed" for item in audit_items)
    filtered = client.get("/api/v1/audit", headers=headers, params={"event_type": "permission.changed", "resource": "document"})
    assert filtered.status_code == 200
    assert all(item["type"] == "permission.changed" for item in filtered.json()["items"])

    event = await database["eventos"].find_one({"type": "document.created", "user_id": user_id})
    assert event and event.get("integrity_hash")
    original_hash = event["integrity_hash"]
    await database["eventos"].update_one({"id": event["id"]}, {"$set": {"payload.document_id": "tampered"}})
    tampered = await database["eventos"].find_one({"id": event["id"]})
    assert tampered["integrity_hash"] == original_hash
    assert repo.event_integrity_valid(tampered) is False
    await database["eventos"].update_one({"id": event["id"]}, {"$set": {"payload.document_id": document_id}})
    await database["eventos"].update_one({"id": event["id"]}, {"$set": {"actor_id": "tampered-actor"}})
    tampered_actor = await database["eventos"].find_one({"id": event["id"]})
    assert repo.event_integrity_valid(tampered_actor) is False
    await database["eventos"].update_one({"id": event["id"]}, {"$set": {"actor_id": user_id}})

    created_user = client.post("/api/v1/users", headers=headers, json={"name": "Usuário Fase 11", "email": f"fase11-{uuid4().hex}@example.com", "password": "Korczak-Fase11-2026!", "role": "manager"})
    assert created_user.status_code == 201
    managed_user = created_user.json()
    assert managed_user["role"] == "manager" and managed_user["status"] == "active"
    assert client.patch(f"/api/v1/users/{managed_user['id']}", headers=headers, json={"name": "Gestor Editado"}).status_code == 200
    assert client.patch(f"/api/v1/users/{managed_user['id']}", headers=headers, json={"status": "inactive"}).status_code == 200
    blocked_login = client.post("/api/v1/auth/login", json={"email": managed_user["email"], "password": "Korczak-Fase11-2026!"})
    assert blocked_login.status_code == 403
    assert client.patch(f"/api/v1/users/{managed_user['id']}", headers=headers, json={"status": "active"}).status_code == 200
    group11 = client.post("/api/v1/groups", headers=headers, json={"name": "Grupo Fase 11"}).json()
    assert client.post(f"/api/v1/groups/{group11['id']}/members/{managed_user['id']}", headers=headers).status_code == 200
    assert client.put(
        f"/api/v1/permissions/{document_id}",
        headers=headers,
        json={"role": "editor", "actions": ["read", "write"], "user_ids": [], "group_ids": [group11["id"]]},
    ).status_code == 200
    login11 = client.post("/api/v1/auth/login", json={"email": managed_user["email"], "password": "Korczak-Fase11-2026!"})
    assert login11.status_code == 200
    manager_headers = {"Authorization": f"Bearer {login11.json()['token']}"}
    manager_users = client.get("/api/v1/users", headers=manager_headers)
    assert manager_users.status_code == 200
    assert all(u["role"] != "admin" for u in manager_users.json())
    manager_created = client.post("/api/v1/users", headers=manager_headers, json={"name":"Usuário criado pelo gestor","email":f"gestor-{uuid4().hex}@example.com","password":"Korczak-Gestor-2026!","role":"user"})
    assert manager_created.status_code == 201
    manager_target = manager_created.json()
    assert client.patch(f"/api/v1/users/{manager_target['id']}", headers=manager_headers, json={"name":"Usuário editado pelo gestor"}).status_code == 200
    assert client.patch(f"/api/v1/users/{manager_target['id']}", headers=manager_headers, json={"status":"inactive"}).status_code == 200
    assert client.post("/api/v1/groups", headers=manager_headers, json={"name":"Grupo do gestor"}).status_code == 201
    assert client.get(f"/api/v1/documents/{document_id}", headers=manager_headers).status_code == 200
    manager_admin_attempt = client.post("/api/v1/users", headers=manager_headers, json={"name":"Não permitido","email":f"nao-admin-{uuid4().hex}@example.com","password":"Korczak-Fase11-2026!","role":"admin"})
    assert manager_admin_attempt.status_code == 403
    assert client.put(f"/api/v1/permissions/{document_id}", headers=manager_headers, json={"role":"manager","actions":["read","write"],"user_ids":[],"group_ids":[]}).status_code == 200
    assert client.post(f"/api/v1/documents/{document_id}/save", headers=manager_headers, json={"name": "Documento atualizado pelo gestor", "document_type": "txt", "content": "ACL escrita", "base_version_id": client.get(f"/api/v1/documents/{document_id}", headers=manager_headers).json()["current_version_id"]}).status_code == 200
    assert client.delete(f"/api/v1/groups/{group11['id']}", headers=headers).status_code == 200
    assert client.get(f"/api/v1/documents/{document_id}", headers=manager_headers).status_code == 200
    folder_acl = client.put(f"/api/v1/folder-permissions/{folder['id']}", headers=headers, json={"role": "viewer", "actions": ["read"], "user_ids": [managed_user["id"]], "group_ids": []})
    assert folder_acl.status_code == 200
    folder_view = client.get(f"/api/v1/folders/{folder['id']}", headers=manager_headers)
    assert folder_view.status_code == 200

    assert client.post("/api/v1/auth/recovery", json={"email": email}).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/v1/users/me", headers=headers).status_code == 401

    second_email = f"phase4-other-{uuid4().hex}@example.com"
    second = client.post("/api/v1/auth/register", json={"name": "Outro", "email": second_email, "password": password})
    second_headers = {"Authorization": f"Bearer {second.json()['token']}"}
    assert client.post("/api/v1/groups", headers=second_headers, json={"name":"Grupo não autorizado"}).status_code == 403
    manager_admin_edit = client.patch(f"/api/v1/users/{user_id}", headers=manager_headers, json={"status":"inactive"})
    assert manager_admin_edit.status_code == 403
    group_acl = client.post("/api/v1/groups", headers=manager_headers, json={"name":"ACL direta"})
    assert group_acl.status_code == 201
    group_acl_id = group_acl.json()["id"]
    assert client.post(f"/api/v1/groups/{group_acl_id}/members/{second.json()['user']['id']}", headers=manager_headers).status_code == 200
    acl_doc = client.post("/api/v1/documents", headers=manager_headers, json={"name":"Documento ACL grupo","document_type":"txt","content":"grupo pode ler"}).json()
    assert client.put(f"/api/v1/permissions/{acl_doc['id']}", headers=manager_headers, json={"role":"viewer","actions":["read"],"user_ids":[],"group_ids":[group_acl_id]}).status_code == 200
    assert client.get(f"/api/v1/documents/{acl_doc['id']}", headers=second_headers).status_code == 200
    assert client.delete(f"/api/v1/groups/{group_acl_id}/members/{second.json()['user']['id']}", headers=manager_headers).status_code == 200
    assert client.get(f"/api/v1/documents/{acl_doc['id']}", headers=second_headers).status_code == 404
    assert client.get("/api/v1/users", headers=second_headers).status_code == 403
    assert client.get(f"/api/v1/documents/{document_id}", headers=second_headers).status_code == 404
    denied = client.get(f"/api/v1/permissions/{document_id}", headers=second_headers)
    assert denied.status_code == 404
    assert denied.status_code == 404
    folder_acl_for_second = client.put(f"/api/v1/folder-permissions/{folder['id']}", headers=manager_headers, json={"role":"viewer","actions":["read"],"user_ids":[second.json()["user"]["id"]],"group_ids":[]})
    assert folder_acl_for_second.status_code == 200
    assert client.get(f"/api/v1/folders/{folder['id']}", headers=second_headers).status_code == 200
    second_folder = client.post("/api/v1/folders", headers=second_headers, json={"name": "Pasta privada"}).json()
    cross_owner_move = client.patch(f"/api/v1/documents/{document_id}", headers=second_headers, json={"folder_id": second_folder["id"]})
    assert cross_owner_move.status_code == 404

    client.delete(f"/api/v1/documents/{document_id}", headers=second_headers)
    own = client.post("/api/v1/documents", headers=second_headers, json={"name": "Lixeira", "document_type": "txt"}).json()
    assert client.delete(f"/api/v1/documents/{own['id']}/permanent", headers=second_headers).status_code == 409
    assert client.delete(f"/api/v1/documents/{own['id']}", headers=second_headers).status_code == 200
    assert client.get("/api/v1/trash", headers=second_headers).status_code == 200
    assert client.post(f"/api/v1/documents/{own['id']}/restore", headers=second_headers).status_code == 200
    assert client.delete(f"/api/v1/documents/{own['id']}", headers=second_headers).status_code == 200
    assert client.delete(f"/api/v1/documents/{own['id']}/permanent", headers=second_headers).status_code == 200
    folder_two = client.post("/api/v1/folders", headers=second_headers, json={"name": "Pasta para restaurar"}).json()
    assert client.delete(f"/api/v1/folders/{folder_two['id']}", headers=second_headers).status_code == 200
    assert folder_two['id'] in [f['id'] for f in client.get("/api/v1/folders/trash", headers=second_headers).json()]
    assert client.post(f"/api/v1/folders/{folder_two['id']}/restore", headers=second_headers, json={}).status_code == 200
    assert folder_two['id'] in [f['id'] for f in client.get("/api/v1/folders", headers=second_headers).json()]

    final_audit = client.get("/api/v1/audit", headers=manager_headers, params={"page": 1, "page_size": 100})
    assert final_audit.status_code == 200
    final_items = final_audit.json()["items"]
    required_events = {
        "document.created", "document.updated", "document.deleted", "document.restored",
        "permission.changed", "folder.permission.changed", "admin.user_created",
        "admin.user_updated", "auth.register", "auth.login", "auth.login_failed",
        "auth.recovery_requested", "auth.logout",
    }
    present = {item["type"] for item in final_items}
    assert required_events.issubset(present)
    assert all(item["integrity_valid"] is True for item in final_items if item.get("integrity_hash"))
    def sensitive_keys(value):
        if isinstance(value, dict):
            keys = set(value)
            found = {k for k in keys if any(term in k.casefold() for term in ("password", "token", "secret", "authorization", "cookie", "api_key", "content"))}
            return found | {nested for v in value.values() for nested in sensitive_keys(v)}
        if isinstance(value, list):
            return {nested for v in value for nested in sensitive_keys(v)}
        return set()
    assert all(not sensitive_keys(item.get("payload", {})) for item in final_items)

    await database["documentos"].delete_many({})
    await database["versoes"].delete_many({})
    await database["pastas"].delete_many({})
    await database["etiquetas"].delete_many({})
    await database["sessoes"].delete_many({})
    await database["eventos"].delete_many({})
    await database["notificacoes"].delete_many({})
    await database["grupos"].delete_many({})
