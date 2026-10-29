from datetime import datetime, timezone, timedelta
from uuid import uuid4
import base64
import secrets
from email.mime.text import MIMEText
import httpx

from ..errors import AppError, NotFoundError, ValidationError
from ..repositories import api as repo
from ..security import create_session, hash_password, validate_password_policy, verify_password, revoke_session, needs_password_rehash
from ..database.connection import get_database, get_accounts_database
from ..config.settings import get_settings
from ..security import token_hash


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


async def _send_recovery_email(recipient: str, name: str, token: str) -> None:
    settings = get_settings()
    credentials = (settings.gmail_client_id.strip(), settings.gmail_client_secret.strip(), settings.gmail_refresh_token.strip(), settings.gmail_sender_email.strip())
    if not all(credentials):
        raise AppError("O envio de recuperação ainda não está configurado no serviço Nexus.", "recovery_email_not_configured", 503)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            oauth = await client.post("https://oauth2.googleapis.com/token", data={"client_id": credentials[0], "client_secret": credentials[1], "refresh_token": credentials[2], "grant_type": "refresh_token"})
            oauth.raise_for_status()
            access_token = oauth.json().get("access_token")
            if not access_token:
                raise ValueError("OAuth response omitted access token")
            configured_frontend = (settings.frontend_url or "").strip().rstrip("/")
            if not configured_frontend or "localhost" in configured_frontend or "127.0.0.1" in configured_frontend:
                configured_frontend = "https://nexus.korczaktech.com.br"
            base_url = configured_frontend
            link = f"{base_url}/#/redefinir-senha?token={token}"
            message = MIMEText(f"Olá, {name or 'usuário'}!\n\nPara definir uma nova senha do Korczak Nexus, abra este link:\n{link}\n\nO link expira em 30 minutos e só pode ser usado uma vez. Se você não solicitou esta ação, ignore esta mensagem.\n\nKorczak Technologies", "plain", "utf-8")
            message["To"] = recipient
            message["From"] = f"Korczak Technologies <{credentials[3]}>"
            message["Subject"] = "Recuperação de acesso — Korczak Nexus"
            raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii").rstrip("=")
            sent = await client.post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}, json={"raw": raw})
            sent.raise_for_status()
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise AppError("Não foi possível enviar o e-mail de recuperação. Confira a configuração OAuth do Gmail no Render.", "recovery_email_send_failed", 502) from exc


async def request_recovery(email: str):
    normalized = normalize_email(email)
    user = await repo.find_user_by_email(normalized)
    if user:
        raw_token = secrets.token_urlsafe(48)
        account = user.get("_account") or {}
        account_id = account.get("_id")
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        await get_accounts_database()["contas"].update_one({"_id": account_id}, {"$set": {"PasswordResetTokenHash": token_hash(raw_token), "PasswordResetExpires": expires_at}})
        try:
            await _send_recovery_email(user.get("email", normalized), user.get("name", ""), raw_token)
        except AppError:
            await get_accounts_database()["contas"].update_one({"_id": account_id}, {"$unset": {"PasswordResetTokenHash": "", "PasswordResetExpires": ""}})
            raise
        await repo.log_event(user["id"], "auth.recovery_requested", {"user_id": user["id"]})
    return {"message": "Se a conta existir, as instruções de recuperação serão encaminhadas."}


async def confirm_recovery(token: str, password: str):
    if len(password.encode("utf-8")) > 72:
        raise ValidationError("A senha não pode exceder 72 bytes em UTF-8.")
    validate_password_policy(password)
    accounts = get_accounts_database()["contas"]
    now = datetime.now(timezone.utc)
    account = await accounts.find_one({"PasswordResetTokenHash": token_hash(token), "PasswordResetExpires": {"$gt": now}})
    if not account:
        raise AppError("Link de recuperação inválido ou expirado. Solicite outro.", "recovery_token_invalid", 400)
    result = await accounts.update_one({"_id": account["_id"], "PasswordResetTokenHash": token_hash(token), "PasswordResetExpires": {"$gt": now}}, {"$set": {"Autenticacao.SenhaHash": hash_password(password), "Conta.AtualizadaEm": now}, "$unset": {"PasswordResetTokenHash": "", "PasswordResetExpires": ""}})
    if result.modified_count != 1:
        raise AppError("Link de recuperação inválido ou já utilizado. Solicite outro.", "recovery_token_invalid", 400)
    await get_database()["sessoes"].update_many({"user_id": account.get("id"), "revoked_at": None}, {"$set": {"revoked_at": now}})
    await repo.log_event(account.get("id"), "auth.password_reset", {"user_id": account.get("id")})
    return {"message": "Senha alterada com sucesso. Você já pode entrar."}


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
