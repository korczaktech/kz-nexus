from datetime import datetime, timedelta, timezone
from hashlib import sha256
import secrets
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, Header
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..database.connection import get_database, get_accounts_database
from ..dependencies import current_user
from ..errors import AppError

router = APIRouter(prefix="/storage/nodes", tags=["storage-nodes"])

PAIRING_CODE_MINUTES = 5
NODE_TOKEN_PREFIX = "knode_"


class SetNodeSavingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


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
            "saving_enabled": True,
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
        {"_id": 0, "id": 1, "device_name": 1, "created_at": 1, "last_seen_at": 1, "revoked_at": 1, "saving_enabled": 1},
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


@router.patch("/{node_id}/saving")
async def set_node_saving(
    node_id: str,
    payload: SetNodeSavingRequest,
    user: dict = Depends(current_user),
) -> dict:
    """Pause or resume file writes for one node without stopping its heartbeat."""
    database = get_database()
    result = await database["storage_nodes"].update_one(
        {"id": node_id, "user_id": user["id"], "revoked_at": None},
        {"$set": {"saving_enabled": payload.enabled, "saving_updated_at": _now()}},
    )
    if not result.matched_count:
        raise AppError("Dispositivo não encontrado.", "node_not_found", 404)

    # Unclaimed jobs must not unexpectedly write after a later resume.
    if not payload.enabled:
        await database["storage_node_jobs"].update_many(
            {"node_id": node_id, "status": "pending"},
            {"$set": {
                "status": "failed",
                "completed_at": _now(),
                "error": "Gravação pausada pelo usuário antes do início da gravação.",
                "content": None,
            }},
        )
    return {"node_id": node_id, "saving_enabled": payload.enabled}


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


VAULT_PRODUCTS = {"Nexus", "Nexa", "Veya", "Korvo", "Klash", "Acta", "Web", "People", "Memo", "Meet", "Pulse", "Chrona", "Formly"}


class RouteSaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=240)
    content: str = Field(max_length=3_000_000)
    mime_type: str = Field(default="text/html", max_length=120)
    product: str = Field(default="Nexus", min_length=1, max_length=32)

    @field_validator("product")
    @classmethod
    def validate_product(cls, value: str) -> str:
        if value not in VAULT_PRODUCTS:
            raise ValueError("Produto inválido para o Korczak Vault")
        return value


class JobCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str = Field(pattern="^(completed|failed)$")
    error: str | None = Field(default=None, max_length=500)
    stored_path: str | None = Field(default=None, min_length=1, max_length=1000)

    @field_validator("stored_path")
    @classmethod
    def normalize_stored_path(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("stored_path não pode ficar vazio")
        if not value.startswith("/"):
            raise ValueError("stored_path deve ser um caminho absoluto do dispositivo")
        allowed_prefixes = (
            "/storage/emulated/0/.vault/",
            "/storage/self/primary/.vault/",
        )
        prefix = next((candidate for candidate in allowed_prefixes if value.startswith(candidate)), None)
        if prefix is None:
            raise ValueError("stored_path deve apontar para a pasta compartilhada .vault")
        if "\x00" in value or "\\" in value:
            raise ValueError("stored_path contém caracteres inválidos")
        parts = value[len(prefix):].split("/")
        if (
            len(parts) != 4
            or parts[0] != "usuarios"
            or not parts[1]
            or parts[1] in {".", ".."}
            or not all(char.isascii() and (char.isalnum() or char in "_-") for char in parts[1])
            or parts[2] not in VAULT_PRODUCTS
            or not parts[3]
            or parts[3] in {".", ".."}
            or any(part in {"", ".", ".."} for part in parts)
        ):
            raise ValueError("stored_path deve apontar para um arquivo de usuário dentro de .vault")
        return value

    @model_validator(mode="after")
    def require_path_for_completed_write(self):
        if self.status == "completed" and not self.stored_path:
            raise ValueError("stored_path é obrigatório para confirmar uma gravação concluída")
        if self.status == "failed" and self.stored_path is not None:
            raise ValueError("stored_path não deve ser informado quando a gravação falha")
        return self


def _node_role(name: str) -> str | None:
    normalized = " ".join(name.strip().lower().replace("-", " ").split())
    if normalized in {
        "servidor i", "server i", "servidor 1", "server 1",
        "note20", "note20 ultra", "note 20 ultra",
        "samsung note20 ultra", "samsung note 20 ultra",
        "galaxy note20 ultra", "galaxy note 20 ultra",
    }:
        return "server_i"
    if normalized in {"servidor ii", "server ii", "servidor 2", "server 2", "galaxy j8", "samsung galaxy j8"}:
        return "server_ii"
    return None


def _node_can_store(node: dict, size: int, now: datetime) -> bool:
    if _node_status(node, now) != "online" or node.get("internet_connected") is not True:
        return False
    if node.get("saving_enabled", True) is False:
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


STORAGE_PLAN_LIMITS = {
    "free": 5 * 1024**3,
    "zagryd": 10 * 1024**3,
    "hermes": 30 * 1024**3,
    "apollo": 40 * 1024**3,
    "veles": 50 * 1024**3,
    "dimitri": 75 * 1024**3,
    "zeus": 100 * 1024**3,
    "morok": 512 * 1024**3,
}


def _active_storage_plan(value) -> str | None:
    """Find the highest explicitly enabled storage plan in nested account plan data."""
    enabled_plans: set[str] = set()
    def visit(item):
        if isinstance(item, dict):
            for key, enabled in item.items():
                normalized = str(key).strip().casefold()
                if normalized in {*STORAGE_PLAN_LIMITS.keys(), "marzanna"} and enabled is True:
                    enabled_plans.add(normalized)
                else:
                    visit(enabled)
        elif isinstance(item, list):
            for child in item:
                visit(child)
    visit(value)
    priority = ["marzanna", "morok", "zeus", "dimitri", "veles", "apollo", "hermes", "zagryd", "free"]
    return next((plan for plan in priority if plan in enabled_plans), None)


def _custom_storage_limit(account: dict) -> int | None:
    """Accept an explicitly configured Marzanna quota, in bytes or GB."""
    candidates = [
        account.get("Limites", {}).get("ArmazenamentoBytes") if isinstance(account.get("Limites"), dict) else None,
        account.get("Limites", {}).get("ArmazenamentoGB") if isinstance(account.get("Limites"), dict) else None,
        account.get("Planos", {}).get("Marzanna", {}).get("storage_limit_bytes") if isinstance(account.get("Planos", {}).get("Marzanna"), dict) else None,
        account.get("Planos", {}).get("Marzanna", {}).get("storage_limit_gb") if isinstance(account.get("Planos", {}).get("Marzanna"), dict) else None,
    ]
    for index, value in enumerate(candidates):
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0:
            return int(value if index in (0, 2) else value * 1024**3)
    return None


async def _storage_quota(user_id: str) -> tuple[int | None, int, str]:
    """Return (limit_bytes, logical_used_bytes, plan) without double-counting duplicate replicas."""
    accounts = get_accounts_database()
    account = await accounts["contas"].find_one({"id": user_id})
    if not account:
        # Fail closed: a missing account must not receive unlimited storage.
        raise AppError("Não foi possível confirmar o plano desta conta.", "storage_plan_unavailable", 503)
    plan = _active_storage_plan(account.get("Planos", {}))
    if not plan:
        # Existing accounts may keep the plan at a top-level field.
        for field in ("Plano", "plano", "Plan", "plan"):
            candidate = account.get(field)
            if isinstance(candidate, str) and candidate.strip().casefold() in {*STORAGE_PLAN_LIMITS, "marzanna"}:
                plan = candidate.strip().casefold()
                break
    if not plan:
        raise AppError("A conta não possui um plano de armazenamento reconhecido.", "storage_plan_unavailable", 403)
    limit_bytes = _custom_storage_limit(account) if plan == "marzanna" else STORAGE_PLAN_LIMITS.get(plan)
    if limit_bytes is None:
        raise AppError("O plano Marzanna exige um limite de armazenamento personalizado na conta.", "storage_custom_quota_required", 403)

    jobs = await get_database()["storage_node_jobs"].find(
        {"user_id": user_id},
        {"_id": 0, "name": 1, "product": 1, "stored_path": 1, "size_bytes": 1, "status": 1, "created_at": 1},
    ).to_list(length=100000)
    # Logical document key avoids counting replicas twice. Latest queued/completed
    # write for a given product + stable filename reserves its new size.
    latest: dict[tuple[str, str], dict] = {}
    for job in jobs:
        if job.get("status") not in {"pending", "processing", "completed"}:
            continue
        key = (str(job.get("product") or "Nexus"), str(job.get("name") or job.get("stored_path") or job.get("id") or ""))
        prior = latest.get(key)
        if prior is None or (job.get("created_at") or datetime.min.replace(tzinfo=timezone.utc)) >= (prior.get("created_at") or datetime.min.replace(tzinfo=timezone.utc)):
            latest[key] = job
    used_bytes = sum(max(0, int(job.get("size_bytes") or 0)) for job in latest.values())
    return limit_bytes, used_bytes, plan


@router.post("/route-save")
async def route_saved_file(payload: RouteSaveRequest, user: dict = Depends(current_user)) -> dict:
    """Queue a physical save only when the account's plan quota permits it."""
    database = get_database()
    now = _now()
    size = len(payload.content.encode("utf-8"))
    limit_bytes, used_bytes, plan = await _storage_quota(str(user["id"]))
    key = (payload.product, payload.name.strip())
    prior_jobs = await database["storage_node_jobs"].find(
        {"user_id": user["id"], "product": payload.product, "name": payload.name.strip()},
        {"_id": 0, "size_bytes": 1, "status": 1},
    ).to_list(length=1000)
    previous_size = max((int(job.get("size_bytes") or 0) for job in prior_jobs if job.get("status") in {"pending", "processing", "completed"}), default=0)
    projected_usage = max(0, used_bytes - previous_size) + size
    if projected_usage > limit_bytes:
        raise AppError(
            f"Limite de armazenamento do plano {plan.capitalize()} excedido. "
            f"Uso atual: {used_bytes} bytes; esta gravação levaria a {projected_usage} bytes "
            f"de um máximo de {limit_bytes} bytes.",
            "storage_quota_exceeded",
            413,
        )
    nodes = await database["storage_nodes"].find(
        {"user_id": user["id"], "revoked_at": None},
        {"_id": 0},
    ).to_list(length=100)
    by_role = {_node_role(node.get("device_name", "")): node for node in nodes if _node_role(node.get("device_name", ""))}
    eligible = [
        (role, by_role[role])
        for role in ("server_i", "server_ii")
        if role in by_role and _node_can_store(by_role[role], size, now)
    ]
    # Distributed placement: each save is written to exactly one physical node.
    # Prefer the node with the lower used-capacity ratio; use Server I as a
    # deterministic tie-breaker. A paused/offline/full node is excluded above.
    def utilization(item):
        _, node = item
        total = node.get("total_bytes", 0)
        free = node.get("free_bytes", 0)
        if not isinstance(total, int) or total <= 0 or not isinstance(free, int):
            return 1.0
        return max(0.0, min(1.0, (total - free) / total))

    eligible.sort(key=lambda item: (utilization(item), 0 if item[0] == "server_i" else 1))
    eligible = eligible[:1]
    if not eligible:
        return {
            "status": "fallback_required",
            "destination": None,
            "destinations": [],
            "jobs": [],
            "reason": "Nenhum servidor configurado está online, conectado, autorizado a gravar e com espaço suficiente.",
            "size_bytes": size,
        }

    jobs = []
    for role, node in eligible:
        job_id = str(uuid4())
        await database["storage_node_jobs"].insert_one({
            "id": job_id,
            "user_id": user["id"],
            "node_id": node["id"],
            "destination": role,
            "name": payload.name.strip(),
            "product": payload.product,
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
        jobs.append({
            "job_id": job_id,
            "destination": role,
            "device_name": node.get("device_name"),
        })
    # Backwards-compatible top-level fields refer to the first destination.
    return {
        "status": "queued",
        "destination": eligible[0][0],
        "destinations": [role for role, _ in eligible],
        "device_name": eligible[0][1].get("device_name"),
        "job_id": jobs[0]["job_id"],
        "jobs": jobs,
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


@router.get("/{node_id}/vault-users")
async def list_vault_user_ids(
    node_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    """Return registered account IDs to a paired storage node for folder provisioning."""
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    if not token.startswith(NODE_TOKEN_PREFIX):
        raise AppError("Credencial de nó obrigatória.", "node_authentication_required", 401)
    node = await get_database()["storage_nodes"].find_one({
        "id": node_id, "token_hash": _digest(token), "revoked_at": None,
    }, {"_id": 0, "id": 1})
    if not node:
        raise AppError("Credencial de nó inválida ou revogada.", "invalid_node_credential", 401)

    # The accounts database is the same source of truth used by login/session validation.
    from ..database.connection import get_accounts_database
    cursor = get_accounts_database()["contas"].find(
        {"Conta.Status": {"$ne": "deleted"}},
        {"_id": 0, "id": 1},
    )
    users = await cursor.to_list(length=None)
    user_ids = sorted({str(item.get("id", "")).strip() for item in users if item.get("id")})
    return {"user_ids": user_ids, "count": len(user_ids)}


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
    if node.get("saving_enabled", True) is False:
        return {"job": None}
    claim_time = _now()
    stale_before = claim_time - timedelta(minutes=5)
    job = await database["storage_node_jobs"].find_one_and_update(
        {
            "node_id": node_id,
            "$or": [
                {"status": "pending"},
                {"status": "processing", "claimed_at": {"$lt": stale_before}},
                {"status": "processing", "claimed_at": None},
            ],
        },
        {"$set": {"status": "processing", "claimed_at": claim_time}},
        sort=[("created_at", 1)],
        return_document=True,
    )
    if not job:
        return {"job": None}
    return {"job": {
        "id": job["id"], "user_id": job["user_id"], "name": job["name"],
        "mime_type": job["mime_type"], "content": job["content"], "size_bytes": job["size_bytes"],
        "product": job.get("product", "Nexus"),
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
    jobs = get_database()["storage_node_jobs"]
    changed = await jobs.update_one(
        {"id": job_id, "node_id": node_id, "status": "processing"},
        {"$set": update},
    )
    if not changed.matched_count:
        # The API response may be lost after MongoDB commits. Treat an identical
        # repeated completion as success so the agent can safely retry.
        existing = await jobs.find_one({"id": job_id, "node_id": node_id})
        if existing and existing.get("status") == payload.status:
            if payload.status == "completed" and existing.get("stored_path") == payload.stored_path:
                return {"job_id": job_id, "status": payload.status}
            if payload.status == "failed" and existing.get("error") == payload.error:
                return {"job_id": job_id, "status": payload.status}
        raise AppError("Tarefa não encontrada ou já finalizada.", "storage_job_not_found", 404)
    return {"job_id": job_id, "status": payload.status}
