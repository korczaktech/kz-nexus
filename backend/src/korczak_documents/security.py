from datetime import datetime, timedelta, timezone
from hashlib import sha256
import secrets
from uuid import uuid4

from .database.connection import get_database, get_accounts_database

try:
    import bcrypt
except ImportError:  # pragma: no cover - dependência instalada em produção
    bcrypt = None
from .errors import AppError, NotFoundError, ValidationError

SESSION_HOURS = 24
_PASSWORD_MIN_LENGTH = 12
ROLE_LEVELS = {"user": 10, "manager": 20, "admin": 30}


def validate_password_policy(password: str, email: str | None = None, name: str | None = None) -> None:
    if len(password) < _PASSWORD_MIN_LENGTH:
        raise ValidationError("A senha deve possuir pelo menos 12 caracteres")
    if not any(c.islower() for c in password):
        raise ValidationError("A senha deve conter letra minúscula")
    if not any(c.isupper() for c in password):
        raise ValidationError("A senha deve conter letra maiúscula")
    if not any(c.isdigit() for c in password):
        raise ValidationError("A senha deve conter número")
    if not any(not c.isalnum() for c in password):
        raise ValidationError("A senha deve conter caractere especial")
    lowered = password.casefold()
    for value in (email, name):
        if value and value.split("@", 1)[0].casefold() in lowered:
            raise ValidationError("A senha não deve conter identificadores da conta")


def hash_password(password: str) -> str:
    if bcrypt is None:
        raise RuntimeError("bcrypt não está disponível")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, encoded: str) -> bool:
    if not isinstance(encoded, str) or not encoded:
        return False
    encoded = encoded.strip()
    if not encoded.startswith(("$2a$", "$2b$", "$2y$")) or bcrypt is None:
        return False
    try:
        return bool(bcrypt.checkpw(password.encode("utf-8"), encoded.encode("utf-8")))
    except (ValueError, TypeError):
        return False


def needs_password_rehash(encoded: str) -> bool:
    # O único formato aceito é bcrypt. A aplicação não migra para outro algoritmo.
    return False

def create_token() -> str:
    return secrets.token_urlsafe(48)


def token_hash(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


async def create_session(user_id: str) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    token = create_token()
    expires_at = now + timedelta(hours=SESSION_HOURS)
    await get_database()["sessoes"].insert_one({
        "id": str(uuid4()),
        "user_id": user_id,
        "token_hash": token_hash(token),
        "expires_at": expires_at,
        "created_at": now,
        "revoked_at": None,
    })
    return token, expires_at


async def revoke_session(token: str) -> None:
    if token:
        await get_database()["sessoes"].update_one(
            {"token_hash": token_hash(token), "revoked_at": None},
            {"$set": {"revoked_at": datetime.now(timezone.utc)}},
        )


async def require_user_from_token(token: str) -> dict:
    if not token:
        raise AppError("Autenticação obrigatória", "authentication_required", 401)
    session = await get_database()["sessoes"].find_one({
        "token_hash": token_hash(token),
        "expires_at": {"$gt": datetime.now(timezone.utc)},
        "revoked_at": None,
    })
    if not session:
        raise AppError("Sessão inválida ou expirada", "invalid_session", 401)
    user = await get_accounts_database()["contas"].find_one({"id": session["user_id"]})
    if not user:
        raise NotFoundError("Usuário da sessão não encontrado")
    if user.get("Conta", {}).get("Status", "active") != "active":
        raise AppError("Conta indisponível", "account_unavailable", 403)
    return {
        "id": user.get("id"), "name": user.get("Nome", ""), "email": user.get("Autenticacao", {}).get("Email", user.get("Email", "")),
        "phone": user.get("Telefone"), "password_hash": user.get("Autenticacao", {}).get("SenhaHash", ""),
        "email_verified": user.get("Autenticacao", {}).get("EmailVerificado", user.get("EmailVerified", False)), "phone_verified": user.get("PhoneVerified", False),
        "role": user.get("Conta", {}).get("Role", "user"), "status": user.get("Conta", {}).get("Status", "active"),
        "created_at": user.get("Conta", {}).get("CriadaEm"), "updated_at": user.get("Conta", {}).get("AtualizadaEm"), "_account": user
    }


def role_allows(user: dict, required_role: str) -> bool:
    return ROLE_LEVELS.get(user.get("role", "user"), 0) >= ROLE_LEVELS.get(required_role, 999)


def require_role(user: dict, required_role: str) -> None:
    if not role_allows(user, required_role):
        raise AppError("Permissão insuficiente", "forbidden", 403)
