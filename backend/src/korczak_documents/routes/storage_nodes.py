from datetime import datetime, timedelta, timezone
from hashlib import sha256
import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..database.connection import get_database
from ..dependencies import current_user
from ..errors import AppError

router = APIRouter(prefix="/storage/nodes", tags=["storage-nodes"])

PAIRING_CODE_MINUTES = 5
NODE_TOKEN_PREFIX = "knode_"


class PairNodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pairing_code: str = Field(min_length=32, max_length=128)
    device_name: str = Field(min_length=1, max_length=80)

    @field_validator("device_name")
    @classmethod
    def normalize_device_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("O nome do dispositivo não pode ficar vazio")
        return value


def _digest(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _node_status(node: dict, now: datetime | None = None) -> str:
    if node.get("revoked_at") is not None:
        return "revoked"
    last_seen = node.get("last_seen_at")
    if not last_seen:
        return "offline"
    # PyMongo returns naive UTC datetimes unless tz_aware is enabled.
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    now = now or _now()
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return "online" if now - last_seen <= timedelta(seconds=180) else "offline"


@router.post("/pairing-codes", status_code=201)
async def create_pairing_code(user: dict = Depends(current_user)) -> dict:
    """Create a short-lived, single-use code for pairing a trusted storage node."""
    now = _now()
    code = secrets.token_urlsafe(32)
    await get_database()["storage_node_pairing_codes"].insert_one({
        "id": str(uuid4()),
        "code_hash": _digest(code),
        "user_id": user["id"],
        "created_at": now,
        "expires_at": now + timedelta(minutes=PAIRING_CODE_MINUTES),
        "consumed_at": None,
    })
    # The raw code is returned once. Only its digest is persisted.
    return {
        "pairing_code": code,
        "expires_at": (now + timedelta(minutes=PAIRING_CODE_MINUTES)).isoformat(),
        "expires_in_seconds": PAIRING_CODE_MINUTES * 60,
    }


@router.post("/pair", status_code=201)
async def pair_node(payload: PairNodeRequest) -> dict:
    """Exchange a single-use pairing code for a revocable device credential."""
    now = _now()
    database = get_database()
    code = await database["storage_node_pairing_codes"].find_one_and_update(
        {
            "code_hash": _digest(payload.pairing_code),
            "expires_at": {"$gt": now},
            "consumed_at": None,
        },
        {"$set": {"consumed_at": now}},
        return_document=True,
    )
    if not code:
        raise AppError("Código de pareamento inválido, expirado ou já utilizado.", "invalid_pairing_code", 401)

    node_id = str(uuid4())
    token = NODE_TOKEN_PREFIX + secrets.token_urlsafe(48)
    try:
        await database["storage_nodes"].insert_one({
            "id": node_id,
            "user_id": code["user_id"],
            "device_name": payload.device_name.strip(),
            "token_hash": _digest(token),
            "created_at": now,
            "last_seen_at": None,
            "revoked_at": None,
        })
    except Exception:
        # The code stays consumed on failure to prevent replay; the user can
        # create a fresh code and retry safely.
        raise AppError("Não foi possível registrar o dispositivo. Gere um novo código e tente novamente.", "node_pairing_failed", 503)

    return {
        "node_id": node_id,
        "device_name": payload.device_name.strip(),
        "node_token": token,
        "created_at": now.isoformat(),
        "warning": "Guarde o token com segurança; ele não poderá ser recuperado.",
    }


@router.post("/{node_id}/heartbeat")
async def node_heartbeat(
    node_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    """Record liveness using the node credential, never a user session token."""
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token.startswith(NODE_TOKEN_PREFIX):
        raise AppError("Credencial de nó obrigatória.", "node_authentication_required", 401)

    now = _now()
    result = await get_database()["storage_nodes"].update_one(
        {
            "id": node_id,
            "token_hash": _digest(token),
            "revoked_at": None,
        },
        {"$set": {"last_seen_at": now}},
    )
    if not result.matched_count:
        raise AppError("Credencial de nó inválida ou revogada.", "invalid_node_credential", 401)
    return {"node_id": node_id, "status": "online", "last_seen_at": now.isoformat()}


@router.get("")
async def list_nodes(user: dict = Depends(current_user)) -> dict:
    """List only the authenticated user's storage nodes."""
    cursor = get_database()["storage_nodes"].find(
        {"user_id": user["id"]},
        {"_id": 0, "id": 1, "device_name": 1, "created_at": 1, "last_seen_at": 1, "revoked_at": 1},
    )
    nodes = await cursor.to_list(length=100)
    now = _now()
    for node in nodes:
        # Serialize MongoDB's naive UTC datetimes as explicitly UTC timestamps
        # so browsers do not reinterpret them as local wall-clock times.
        for field in ("created_at", "last_seen_at", "revoked_at"):
            value = node.get(field)
            if isinstance(value, datetime) and value.tzinfo is None:
                node[field] = value.replace(tzinfo=timezone.utc)
        node["status"] = _node_status(node, now)
    return {"nodes": nodes}


@router.delete("/{node_id}", status_code=204)
async def revoke_node(node_id: str, user: dict = Depends(current_user)) -> None:
    """Revoke a node credential without revoking the user's web session."""
    result = await get_database()["storage_nodes"].update_one(
        {"id": node_id, "user_id": user["id"], "revoked_at": None},
        {"$set": {"revoked_at": _now()}},
    )
    if not result.matched_count:
        raise AppError("Dispositivo não encontrado.", "node_not_found", 404)
