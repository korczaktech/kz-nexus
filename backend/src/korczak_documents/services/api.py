from datetime import datetime, timezone
from uuid import uuid4

from ..errors import AppError, NotFoundError, ValidationError
from ..repositories import api as repo
from ..security import create_session, hash_password, validate_password_policy, verify_password, revoke_session, needs_password_rehash
from ..database.connection import get_database


def clean_user(user: dict) -> dict:
    return {k: user[k] for k in (
        "id", "name", "email", "phone", "email_verified",
        "phone_verified", "role", "status", "created_at", "updated_at"
    )}


def normalize_email(email: str) -> str:
    return email.strip().casefold()


async def register(data):
    email = normalize_email(data.email)
    validate_password_policy(data.password, email, data.name)
    if await repo.find_user_by_email(email):
        raise AppError("E-mail já cadastrado", "email_already_exists", 409)
    user = await repo.create_user({
        "name": data.name.strip(), "email": email, "phone": data.phone,
        "password_hash": hash_password(data.password), "role": "user", "status": "active",
    })
    token, expires_at = await create_session(user["id"])
    await repo.log_event(user["id"], "auth.register", {"user_id": user["id"]})
    return token, expires_at, clean_user(user)


async def login(data):
    email = normalize_email(data.email)
    user = await repo.find_user_by_email(email)
    if not user:
        await repo.log_event(None, "auth.login_failed", {"reason": "unknown_account", "result": "failure"})
        raise AppError("Credenciais inválidas", "invalid_credentials", 401)
    user_id = user.get("id")
    password_hash = user.get("password_hash")
    if not user_id or not password_hash:
        await repo.log_event(None, "auth.login_failed", {"reason": "invalid_account_record", "result": "failure"})
        raise AppError("Credenciais inválidas", "invalid_credentials", 401)
    if user.get("status", "active") != "active":
        await repo.log_event(user_id, "auth.login_failed", {"user_id": user_id, "reason": "account_unavailable", "result": "failure"})
        raise AppError("Conta indisponível", "account_unavailable", 403)
    if not verify_password(data.password, password_hash):
        await repo.log_event(user_id, "auth.login_failed", {"user_id": user_id, "reason": "invalid_password", "result": "failure"})
        raise AppError("Credenciais inválidas", "invalid_credentials", 401)
    # Rehash valid bcrypt credentials when their work factor is below current policy.
    if needs_password_rehash(password_hash):
        await repo.update_user(user_id, {"password_hash": hash_password(data.password)})
    token, expires_at = await create_session(user_id)
    await repo.log_event(user_id, "auth.login", {"user_id": user_id})
    return token, expires_at, clean_user(user)


async def logout(token: str):
    await revoke_session(token)


async def request_recovery(email: str):
    user = await repo.find_user_by_email(normalize_email(email))
    if user:
        await repo.log_event(user["id"], "auth.recovery_requested", {"user_id": user["id"]})
    return {"message": "Se a conta existir, as instruções de recuperação serão encaminhadas."}


async def _group_ids_for_user(user_id: str) -> set[str]:
    groups = await get_database()["grupos"].find({"member_ids": user_id}, {"id": 1}).to_list(length=1000)
    return {g["id"] for g in groups}

async def _allowed_by_acl(resource: dict, user_id: str, action: str) -> bool:
    user = await repo.find_user(user_id)
    if user and user.get("role") in {"admin", "manager"}:
        return True
    if resource.get("owner_id") == user_id:
        return True
    acl = resource.get("permissions") or {}
    if action in acl.get("actions", []):
        if user_id in acl.get("user_ids", []):
            return True
        group_ids = await _group_ids_for_user(user_id)
        if group_ids.intersection(set(acl.get("group_ids", []))):
            return True
    # Folder permissions define an area and can grant access to documents inside it.
    folder_id = resource.get("folder_id")
    if folder_id:
        folder = await repo.get_folder(folder_id)
        if folder:
            return await _allowed_by_acl(folder, user_id, action)
    return False

async def document_or_404(document_id: str, user_id: str, action: str = "read", allow_deleted: bool = False):
    document = await repo.get_document(document_id)
    if not document or (document.get("status") == "deleted" and not allow_deleted) or not await _allowed_by_acl(document, user_id, action):
        raise NotFoundError("Documento não encontrado")
    return document

async def folder_or_404(folder_id: str, user_id: str, action: str = "read", allow_deleted: bool = False):
    folder = await repo.get_folder(folder_id)
    if not folder or (folder.get("status") == "deleted" and not allow_deleted) or not await _allowed_by_acl(folder, user_id, action):
        raise NotFoundError("Pasta não encontrada")
    return folder

async def permission_policy(resource: dict, user_id: str) -> dict:
    acl = resource.get("permissions") or {}
    return {"role": acl.get("role", "private"), "actions": acl.get("actions", []), "user_ids": acl.get("user_ids", []), "group_ids": acl.get("group_ids", [])}


async def tag_or_404(tag_name: str, user_id: str):
    tag = await get_database()["etiquetas"].find_one({"name": tag_name, "owner_id": user_id})
    if not tag:
        raise NotFoundError("Etiqueta não encontrada")
    return tag


def page_values(page: int, page_size: int):
    if page < 1 or page_size < 1 or page_size > 100:
        raise ValidationError("Paginação inválida")
    return (page - 1) * page_size, page_size


async def version_number(document_id: str) -> int:
    last = await get_database()["versoes"].find_one({"document_id": document_id}, sort=[("version_number", -1)])
    return int(last["version_number"]) + 1 if last else 1
