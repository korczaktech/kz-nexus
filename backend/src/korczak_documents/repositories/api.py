from datetime import datetime, timezone
from uuid import uuid4
import hashlib
import json

from ..database.connection import get_database


def now() -> datetime:
    return datetime.now(timezone.utc)


def _redact_payload(payload: dict) -> dict:
    sensitive = ("password", "token", "secret", "authorization", "cookie", "api_key", "content")
    def redact(value):
        if isinstance(value, dict):
            return {k: ("[REDACTED]" if any(term in k.casefold() for term in sensitive) else redact(v)) for k, v in value.items()}
        if isinstance(value, list):
            return [redact(v) for v in value]
        return value
    return redact(payload)


def _canonical_event(event: dict) -> str:
    canonical = {
        "id": event.get("id"),
        "user_id": event.get("user_id"),
        "actor_id": event.get("actor_id"),
        "type": event.get("type"),
        "action": event.get("action"),
        "resource": event.get("resource"),
        "resource_id": event.get("resource_id"),
        "result": event.get("result", "success"),
        "payload": event.get("payload", {}),
        "created_at": (
            event.get("created_at").replace(tzinfo=None).isoformat()
            if hasattr(event.get("created_at"), "replace")
            else str(event.get("created_at"))
        ),
    }
    return json.dumps(canonical, sort_keys=True, default=str, separators=(",", ":"))


async def find_user_by_email(email: str):
    return await get_accounts_database()["contas"].find_one({"Email": email.lower().strip()})


async def find_user(user_id: str):
    return await get_accounts_database()["contas"].find_one({"id": user_id})


def _account_to_user(account: dict | None):
    if not account:
        return None
    conta = account.get("Conta", {})
    return {
        "id": account.get("id"),
        "name": account.get("Nome", ""),
        "email": account.get("Email", ""),
        "phone": account.get("Telefone"),
        "password_hash": account.get("Aplicativos", {}).get("Nexus", {}).get("Senha", ""),
        "email_verified": account.get("EmailVerified", False),
        "phone_verified": account.get("PhoneVerified", False),
        "role": conta.get("Role", "user"),
        "status": conta.get("Status", "active"),
        "created_at": conta.get("CriadaEm"),
        "updated_at": conta.get("AtualizadaEm"),
        "_account": account,
    }


async def create_user(data: dict):
    timestamp = now()
    password_hash = data["password_hash"]
    app_names = [
        "Site", "Morok", "IDE", "AI", "ERP", "FLOW", "DOCUMENTS", "VISION", "OPS", "CONNECT", "MOBILE",
        "Vault", "Nexus", "Nexa", "Veya", "Formly", "Korvo", "Chrona", "Meet", "Pulse", "Acta", "Memo", "People", "Web", "Klash"
    ]
    aplicativos = {}
    for name in app_names:
        aplicativos[name] = {"Senha": password_hash, "Ativo": True}
    document = {
        "id": str(uuid4()),
        "Nome": data["name"].strip(),
        "Email": data["email"].lower().strip(),
        "Telefone": data.get("phone"),
        "Aplicativos": aplicativos,
        "Planos": {
            "KOS": {"Free": True, "Hephaestus": False, "Apollo": False, "Athena": False, "Zeus": False, "Veles": False, "Marzanna": False},
            "Workspace": {"Free": True, "Hephaestus": False, "Apollo": False, "Athena": False, "Zeus": False, "Veles": False, "Marzanna": False}
        },
        "Verified": False,
        "EmailVerified": False,
        "PhoneVerified": False,
        "Conta": {"Status": data.get("status", "active"), "Role": data.get("role", "user"), "CriadaEm": timestamp, "AtualizadaEm": timestamp, "UltimoLogin": None},
        "Produtos": {"KOS": True, "Workspace": True, "Site": True},
        "Seguranca": {"TwoFactorEnabled": False, "RecoveryEnabled": True},
        "Preferencias": {"Idioma": "pt-BR", "Tema": "dark"},
        "Metadados": {"OrigemCadastro": "Nexus", "VersaoCadastro": "", "UltimoDispositivo": "", "UltimoIP": None}
    }
    await get_accounts_database()["contas"].insert_one(document)
    return _account_to_user(document)


async def update_user(user_id: str, changes: dict):
    mapped = {}
    if "name" in changes: mapped["Nome"] = changes["name"]
    if "phone" in changes: mapped["Telefone"] = changes["phone"]
    if "email_verified" in changes: mapped["EmailVerified"] = changes["email_verified"]
    if "phone_verified" in changes: mapped["PhoneVerified"] = changes["phone_verified"]
    if "role" in changes: mapped["Conta.Role"] = changes["role"]
    if "status" in changes: mapped["Conta.Status"] = changes["status"]
    mapped["Conta.AtualizadaEm"] = now()
    await get_accounts_database()["contas"].update_one({"id": user_id}, {"$set": mapped})
    return _account_to_user(await get_accounts_database()["contas"].find_one({"id": user_id}))


async def create_document(owner_id: str, data: dict):
    document = {
        "id": str(uuid4()), "owner_id": owner_id, "name": data["name"].strip(),
        "document_type": data["document_type"].strip(), "description": data.get("description", "").strip(), "folder_id": data.get("folder_id"),
        "current_version_id": None, "status": "active", "favorite_user_ids": [], "permissions": {"role": "private", "actions": [], "user_ids": [], "group_ids": []},
        "created_at": now(), "updated_at": now(),
    }
    await get_database()["documentos"].insert_one(document)
    return document


async def get_document(document_id: str):
    return await get_database()["documentos"].find_one({"id": document_id})


async def list_documents(owner_id: str, query: dict, skip: int, limit: int):
    collection = get_database()["documentos"]
    filters = {"owner_id": owner_id, **query}
    total = await collection.count_documents(filters)
    cursor = collection.find(filters).sort("updated_at", -1).skip(skip).limit(limit)
    return await cursor.to_list(length=limit), total


async def update_document(document_id: str, changes: dict):
    changes["updated_at"] = now()
    await get_database()["documentos"].update_one({"id": document_id}, {"$set": changes})
    return await get_document(document_id)


async def create_version(document_id: str, author_id: str, content: str | None, number: int):
    version = {"id": str(uuid4()), "document_id": document_id, "version_number": number, "author_id": author_id, "content": content, "created_at": now()}
    await get_database()["versoes"].insert_one(version)
    await update_document(document_id, {"current_version_id": version["id"]})
    return version

async def save_document(document_id: str, author_id: str, data: dict, base_version_id: str | None):
    database=get_database(); documents=database["documentos"]; versions=database["versoes"]
    current=await documents.find_one({"id":document_id})
    if not current or current.get("current_version_id") != base_version_id:
        return None
    version_number=await _next_version_number(document_id)
    version={"id":str(uuid4()),"document_id":document_id,"version_number":version_number,"author_id":author_id,"content":data.get("content"),"created_at":now()}
    await versions.insert_one(version)
    result=await documents.update_one({"id":document_id,"current_version_id":base_version_id},{"$set":{"name":data["name"].strip(),"document_type":data["document_type"].strip(),"current_version_id":version["id"],"updated_at":now()}})
    if result.modified_count != 1:
        await versions.delete_one({"id":version["id"]})
        return None
    return await documents.find_one({"id":document_id}),version

async def _next_version_number(document_id: str) -> int:
    last=await get_database()["versoes"].find_one({"document_id":document_id},sort=[("version_number",-1)])
    return int(last["version_number"])+1 if last else 1


async def get_version(version_id: str):
    return await get_database()["versoes"].find_one({"id": version_id})


async def list_versions(document_id: str):
    return await get_database()["versoes"].find({"document_id": document_id}).sort("version_number", -1).to_list(length=500)


async def create_folder(owner_id: str, data: dict):
    folder = {"id": str(uuid4()), "owner_id": owner_id, "parent_id": data.get("parent_id"), "name": data["name"].strip(), "status": "active", "created_at": now(), "updated_at": now()}
    await get_database()["pastas"].insert_one(folder)
    return folder


async def list_folders(owner_id: str):
    return await get_database()["pastas"].find({"owner_id": owner_id, "status": {"$ne": "deleted"}}).sort("name", 1).to_list(length=1000)


async def get_folder(folder_id: str):
    return await get_database()["pastas"].find_one({"id": folder_id})


async def update_folder(folder_id: str, changes: dict):
    changes["updated_at"] = now()
    await get_database()["pastas"].update_one({"id": folder_id}, {"$set": changes})
    return await get_folder(folder_id)


async def delete_folder(folder_id: str):
    await get_database()["pastas"].update_one({"id": folder_id}, {"$set": {"status": "deleted", "updated_at": now()}})

async def list_deleted_folders(owner_id: str):
    return await get_database()["pastas"].find({"owner_id": owner_id, "status": "deleted"}).sort("updated_at", -1).to_list(length=1000)


async def log_event(user_id: str | None, event_type: str, payload: dict):
    event_id = str(uuid4())
    created = now().replace(microsecond=(now().microsecond // 1000) * 1000)
    safe_payload = _redact_payload(payload)
    resource = str(safe_payload.get("resource") or ("document" if "document_id" in safe_payload else "folder" if "folder_id" in safe_payload else "user" if "target_user_id" in safe_payload else "group" if "group_id" in safe_payload else "system"))
    resource_id = safe_payload.get("resource_id") or safe_payload.get("document_id") or safe_payload.get("folder_id") or safe_payload.get("target_user_id") or safe_payload.get("group_id")
    result = str(safe_payload.get("result") or "success")
    event_record = {"id": event_id, "user_id": user_id, "actor_id": user_id, "type": event_type, "action": event_type, "resource": resource, "resource_id": resource_id, "result": result, "payload": safe_payload, "created_at": created}
    integrity_hash = hashlib.sha256(_canonical_event(event_record).encode("utf-8")).hexdigest()
    await get_database()["eventos"].insert_one({
        "id": event_id, "user_id": user_id, "actor_id": user_id, "type": event_type,
        "action": event_type, "resource": resource, "resource_id": resource_id, "result": result,
        "payload": safe_payload, "created_at": created, "integrity_hash": integrity_hash
    })


async def list_events(user_id: str, filters: dict, skip: int, limit: int):
    collection = get_database()["eventos"]
    query = {"user_id": user_id, **filters}
    total = await collection.count_documents(query)
    items = await collection.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(length=limit)
    return items, total


def event_integrity_valid(event: dict) -> bool:
    if not event.get("integrity_hash"):
        return False
    return hashlib.sha256(_canonical_event(event).encode("utf-8")).hexdigest() == event["integrity_hash"]


async def list_audit_events(actor_id: str, filters: dict, skip: int, limit: int, global_view: bool = False):
    collection = get_database()["eventos"]
    query = {} if global_view else {"user_id": actor_id}
    query.update(filters)
    total = await collection.count_documents(query)
    items = await collection.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(length=limit)
    return items, total
