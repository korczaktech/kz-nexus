from datetime import datetime, timedelta, timezone
from hashlib import sha256
import secrets
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, Header
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


# Capacity and durable file-routing queue. Node liveness is based on heartbeats;
# capacity is reported by the agent and is never inferred from a stale heartbeat.
class NodeHeartbeatMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")
    free_bytes: int = Field(default=0, ge=0)
    total_bytes: int = Field(default=0, ge=0)
    internet_connected: bool = False


class RouteSaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=240)
    content: str = Field(max_length=3_000_000)
    mime_type: str = Field(default="text/html", max_length=120)


class JobCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str = Field(pattern="^(completed|failed)$")
    error: str | None = Field(default=None, max_length=500)
    stored_path: str | None = Field(default=None, max_length=1000)


def _node_role(name: str) -> str | None:
    normalized = " ".join(name.strip().lower().replace("-", " ").split())
    if normalized in {"servidor i", "server i", "servidor 1", "server 1", "note20", "samsung note20 ultra"}:
        return "server_i"
    if normalized in {"servidor ii", "server ii", "servidor 2", "server 2", "galaxy j8", "samsung galaxy j8"}:
        return "server_ii"
    return None


def _node_can_store(node: dict, size: int, now: datetime) -> bool:
    if _node_status(node, now) != "online" or node.get("internet_connected") is not True:
        return False
    free_bytes = node.get("free_bytes")
    if not isinstance(free_bytes, int) or free_bytes < size:
        return False
    return True


@router.post("/{node_id}/heartbeat")
async def node_heartbeat(
    node_id: str,
    authorization: str | None = Header(default=None),
    payload: NodeHeartbeatMetrics = Body(default=NodeHeartbeatMetrics()),
) -> dict:
    """Record liveness and measured capacity using the node credential."""
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token.startswith(NODE_TOKEN_PREFIX):
        raise AppError("Credencial de nó obrigatória.", "node_authentication_required", 401)

    now = _now()
    metrics = payload if isinstance(payload, NodeHeartbeatMetrics) else NodeHeartbeatMetrics()
    result = await get_database()["storage_nodes"].update_one(
        {
            "id": node_id,
            "token_hash": _digest(token),
            "revoked_at": None,
        },
        {"$set": {
            "last_seen_at": now,
            "free_bytes": metrics.free_bytes,
            "total_bytes": metrics.total_bytes,
            "internet_connected": metrics.internet_connected,
        }},
    )
    if not result.matched_count:
        raise AppError("Credencial de nó inválida ou revogada.", "invalid_node_credential", 401)
    return {"node_id": node_id, "status": "online", "last_seen_at": now.isoformat()}


@router.post("/route-save")
async def route_saved_file(payload: RouteSaveRequest, user: dict = Depends(current_user)) -> dict:
    """Queue a saved file on Server I, then Server II; report fallback when neither qualifies."""
    database = get_database()
    now = _now()
    size = len(payload.content.encode("utf-8"))
    nodes = await database["storage_nodes"].find(
        {"user_id": user["id"], "revoked_at": None},
        {"_id": 0},
    ).to_list(length=100)
    by_role = {_node_role(node.get("device_name", "")): node for node in nodes if _node_role(node.get("device_name", ""))}
    selected = None
    selected_role = None
    for role in ("server_i", "server_ii"):
        candidate = by_role.get(role)
        if candidate and _node_can_store(candidate, size, now):
            selected, selected_role = candidate, role
            break
    if selected is None:
        return {
            "status": "fallback_required",
            "destination": None,
            "reason": "Nenhum servidor configurado está online, conectado e com espaço suficiente.",
            "size_bytes": size,
        }

    job_id = str(uuid4())
    await database["storage_node_jobs"].insert_one({
        "id": job_id,
        "user_id": user["id"],
        "node_id": selected["id"],
        "name": payload.name.strip(),
        "mime_type": payload.mime_type,
        "content": payload.content,
        "size_bytes": size,
        "status": "pending",
        "created_at": now,
        "claimed_at": None,
        "completed_at": None,
        "error": None,
        "stored_path": None,
    })
    return {
        "status": "queued",
        "destination": selected_role,
        "device_name": selected.get("device_name"),
        "job_id": job_id,
        "size_bytes": size,
    }


@router.get("/jobs/{job_id}")
async def get_storage_job_status(job_id: str, user: dict = Depends(current_user)) -> dict:
    """Let the saving browser verify that the selected node actually wrote the file."""
    job = await get_database()["storage_node_jobs"].find_one(
        {"id": job_id, "user_id": user["id"]},
        {"_id": 0, "id": 1, "status": 1, "error": 1, "stored_path": 1, "node_id": 1, "created_at": 1, "completed_at": 1},
    )
    if not job:
        raise AppError("Tarefa de armazenamento não encontrada.", "storage_job_not_found", 404)
    return {
        "job_id": job["id"],
        "status": job["status"],
        "error": job.get("error"),
        "stored": job.get("status") == "completed",
    }


@router.post("/{node_id}/jobs/claim")
async def claim_storage_job(
    node_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    """Claim one pending job for this authenticated node."""
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    if not token.startswith(NODE_TOKEN_PREFIX):
        raise AppError("Credencial de nó obrigatória.", "node_authentication_required", 401)
    database = get_database()
    node = await database["storage_nodes"].find_one({
        "id": node_id, "token_hash": _digest(token), "revoked_at": None,
    })
    if not node:
        raise AppError("Credencial de nó inválida ou revogada.", "invalid_node_credential", 401)
    job = await database["storage_node_jobs"].find_one_and_update(
        {"node_id": node_id, "status": "pending"},
        {"$set": {"status": "processing", "claimed_at": _now()}},
        sort=[("created_at", 1)],
        return_document=True,
    )
    if not job:
        return {"job": None}
    return {"job": {
        "id": job["id"], "name": job["name"], "mime_type": job["mime_type"],
        "content": job["content"], "size_bytes": job["size_bytes"],
    }}


@router.post("/{node_id}/jobs/{job_id}/complete")
async def complete_storage_job(
    node_id: str,
    job_id: str,
    payload: JobCompletionRequest,
    authorization: str | None = Header(default=None),
) -> dict:
    """Record a node's durable-write result; never mark a job complete on mere dispatch."""
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    if not token.startswith(NODE_TOKEN_PREFIX):
        raise AppError("Credencial de nó obrigatória.", "node_authentication_required", 401)
    now = _now()
    result = await get_database()["storage_nodes"].find_one({
        "id": node_id, "token_hash": _digest(token), "revoked_at": None,
    })
    if not result:
        raise AppError("Credencial de nó inválida ou revogada.", "invalid_node_credential", 401)
    update = {
        "status": payload.status,
        "completed_at": now,
        "error": payload.error if payload.status == "failed" else None,
        "stored_path": payload.stored_path if payload.status == "completed" else None,
        "content": None,
    }
    changed = await get_database()["storage_node_jobs"].update_one(
        {"id": job_id, "node_id": node_id, "status": "processing"},
        {"$set": update},
    )
    if not changed.matched_count:
        raise AppError("Tarefa não encontrada ou já finalizada.", "storage_job_not_found", 404)
    return {"job_id": job_id, "status": payload.status}
