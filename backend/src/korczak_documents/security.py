from datetime import datetime, timedelta, timezone
from hashlib import pbkdf2_hmac, sha256
import base64
import hmac
import secrets
from uuid import uuid4

from .database.connection import get_database

try:
    import bcrypt
except ImportError:  # pragma: no cover - dependência instalada em produção
    bcrypt = None
from .errors import AppError, NotFoundError, ValidationError

SESSION_HOURS = 24
_PASSWORD_ITERATIONS = 310_000
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
    salt = secrets.token_bytes(16)
    digest = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PASSWORD_ITERATIONS)
    return "pbkdf2_sha256$" + str(_PASSWORD_ITERATIONS) + "$" + base64.urlsafe_b64encode(salt).decode("ascii") + "$" + base64.urlsafe_b64encode(digest).decode("ascii")


def verify_password(password: str, encoded: str) -> bool:
    """Verifica o formato atual e formatos PBKDF2 legados comuns."""
    if not isinstance(encoded, str) or not encoded:
        return False
    try:
        encoded = encoded.strip()
        if encoded.startswith(("$2a$", "$2b$", "$2y$")):
            if bcrypt is None:
                return False
            return bool(bcrypt.checkpw(password.encode("utf-8"), encoded.encode("utf-8")))
        parts = encoded.split("$")
        if parts[0] == "pbkdf2_sha256" and len(parts) == 4:
            _, iterations, salt_text, digest_text = parts
            # Formato nativo da aplicação: salt e digest em base64 URL-safe.
            salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
            expected = base64.urlsafe_b64decode(digest_text + "=" * (-len(digest_text) % 4))
        elif parts[0] == "pbkdf2_sha256" and len(parts) == 4:
            return False
        elif parts[0] == "pbkdf2-sha256" and len(parts) == 4:
            _, iterations, salt_text, digest_text = parts
            # Formato Passlib: o salt é textual; o checksum é base64.
            salt = salt_text.encode("utf-8")
            expected = base64.b64decode(digest_text + "=" * (-len(digest_text) % 4))
        elif parts[0] == "" and len(parts) == 5 and parts[1] == "pbkdf2-sha256":
            _, _, iterations, salt_text, digest_text = parts
            salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
            expected = base64.urlsafe_b64decode(digest_text + "=" * (-len(digest_text) % 4))
        else:
            return False
        actual = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def needs_password_rehash(encoded: str) -> bool:
    if not isinstance(encoded, str):
        return False
    encoded = encoded.strip()
    if encoded.startswith(("$2a$", "$2b$", "$2y$")):
        return True
    return not encoded.startswith(
        "pbkdf2_sha256$" + str(_PASSWORD_ITERATIONS) + "$"
    )


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
    user = await get_database()["usuarios"].find_one({"id": session["user_id"]})
    if not user:
        raise NotFoundError("Usuário da sessão não encontrado")
    if user.get("status", "active") != "active":
        raise AppError("Conta indisponível", "account_unavailable", 403)
    return user


def role_allows(user: dict, required_role: str) -> bool:
    return ROLE_LEVELS.get(user.get("role", "user"), 0) >= ROLE_LEVELS.get(required_role, 999)


def require_role(user: dict, required_role: str) -> None:
    if not role_allows(user, required_role):
        raise AppError("Permissão insuficiente", "forbidden", 403)
