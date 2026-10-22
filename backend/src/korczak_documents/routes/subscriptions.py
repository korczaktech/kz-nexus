from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, Query

from ..database.connection import get_database
from ..dependencies import current_user
from ..errors import AppError, ValidationError
from ..repositories import api as repo
from ..security import require_role

router = APIRouter()

# Preços mensais por usuário, mantidos no servidor. Não aceitar valores enviados pelo cliente.
PLAN_PRICES = {
    "Zagryd": 25,
    "Hermes": 50,
    "Apollo": 75,
    "Veles": 100,
    "Dimitri": 125,
    "Zeus": 150,
    "Morok": 200,
}
COLLECTION = "subscription_requests"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _public(item: dict) -> dict:
    result = {key: value for key, value in item.items() if key != "_id"}
    return result


@router.post("/subscriptions/requests", status_code=201)
async def create_subscription_request(payload: dict = Body(...), user=Depends(current_user)):
    """Cria uma solicitação pendente; nunca ativa benefícios pagos por conta própria."""
    plan = str(payload.get("plan") or "").strip()
    if plan not in PLAN_PRICES:
        raise ValidationError("Plano inválido ou não disponível para contratação automática.")
    try:
        quantity = int(payload.get("quantity", 1))
    except (TypeError, ValueError):
        raise ValidationError("A quantidade de usuários deve ser um número inteiro.")
    if quantity < 1 or quantity > 1000:
        raise ValidationError("A quantidade deve estar entre 1 e 1.000 usuários.")

    database = get_database()
    collection = database[COLLECTION]
    existing = await collection.find_one(
        {"user_id": user["id"], "plan": plan, "status": "pending_confirmation"}
    )
    if existing:
        return _public(existing)

    now = _now()
    item = {
        "id": uuid4().hex,
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "plan": plan,
        "quantity": quantity,
        "unit_price_brl": PLAN_PRICES[plan],
        "total_monthly_brl": PLAN_PRICES[plan] * quantity,
        "currency": "BRL",
        "billing_period": "monthly",
        "status": "pending_confirmation",
        "payment_method": "manual_transfer",
        "payment_reference": None,
        "review_note": None,
        "created_at": now,
        "updated_at": now,
        "confirmed_at": None,
        "confirmed_by": None,
    }
    await collection.insert_one(item)
    await repo.log_event(user["id"], "subscription.requested", {
        "subscription_request_id": item["id"],
        "plan": plan,
        "quantity": quantity,
        "total_monthly_brl": item["total_monthly_brl"],
    })
    return item


@router.get("/subscriptions/me")
async def my_subscription(user=Depends(current_user)):
    """Retorna assinaturas do usuário; pendência nunca equivale a acesso premium."""
    cursor = (
        get_database()[COLLECTION]
        .find({"user_id": user["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .limit(20)
    )
    items = await cursor.to_list(length=20)
    active = next((item for item in items if item.get("status") == "active"), None)
    pending = next((item for item in items if item.get("status") == "pending_confirmation"), None)
    return {
        "items": items,
        "active_subscription": active,
        "pending_request": pending,
        "premium_access": bool(active),
    }


@router.get("/admin/subscription-requests")
async def list_subscription_requests(
    status_filter: str = Query("pending_confirmation", alias="status", pattern="^(pending_confirmation|active|rejected|all)$"),
    limit: int = Query(100, ge=1, le=500),
    user=Depends(current_user),
):
    require_role(user, "manager")
    query = {} if status_filter == "all" else {"status": status_filter}
    cursor = get_database()[COLLECTION].find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    return {"items": await cursor.to_list(length=limit)}


@router.patch("/admin/subscription-requests/{request_id}")
async def review_subscription_request(
    request_id: str,
    payload: dict = Body(...),
    user=Depends(current_user),
):
    """Aprovação administrativa exige referência da transação; o cliente não pode autoaprovar."""
    require_role(user, "manager")
    target_status = str(payload.get("status") or "").strip()
    if target_status not in {"active", "rejected"}:
        raise ValidationError("Status deve ser active ou rejected.")
    payment_reference = str(payload.get("payment_reference") or "").strip()
    review_note = str(payload.get("review_note") or "").strip()[:1000]
    if target_status == "active" and len(payment_reference) < 4:
        raise ValidationError("Informe a referência verificável da transação antes de ativar a assinatura.")
    if target_status == "rejected" and not review_note:
        raise ValidationError("Informe o motivo da rejeição.")

    collection = get_database()[COLLECTION]
    item = await collection.find_one({"id": request_id})
    if not item:
        raise AppError("Solicitação de assinatura não encontrada.", "subscription_request_not_found", 404)
    if item.get("status") != "pending_confirmation":
        raise AppError("A solicitação já foi analisada e não pode ser alterada novamente.", "subscription_request_already_reviewed", 409)

    now = _now()
    changes = {
        "status": target_status,
        "payment_reference": payment_reference or None,
        "review_note": review_note or None,
        "updated_at": now,
        "confirmed_at": now if target_status == "active" else None,
        "confirmed_by": user["id"],
    }
    result = await collection.update_one(
        {"id": request_id, "status": "pending_confirmation"},
        {"$set": changes},
    )
    if result.modified_count != 1:
        raise AppError("A solicitação foi alterada por outro administrador. Atualize a lista.", "subscription_request_conflict", 409)
    await repo.log_event(user["id"], "subscription.reviewed", {
        "subscription_request_id": request_id,
        "target_user_id": item["user_id"],
        "status": target_status,
        "payment_reference_present": bool(payment_reference),
    })
    return {**_public(item), **changes}
