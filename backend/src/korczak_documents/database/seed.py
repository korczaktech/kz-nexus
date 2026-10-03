from datetime import datetime, timezone

from .collections import COLLECTIONS
from .connection import get_database


TEST_ACCOUNT = {
    "id": "nexus-test-account",
    "name": "Korczak Teste",
    "email": "teste@korczak.tech",
    "phone": None,
    "password_hash": "pbkdf2_sha256$310000$a29yY3phay10ZXN0LXNhbHQ=$zOSPZPJHVUoorpBNKLrfA_iEwKOgHKWEe9dPAYin8Lo=",
    "email_verified": True,
    "phone_verified": False,
    "role": "admin",
    "status": "active",
}


async def seed_initial_data() -> None:
    """Cria marcadores de infraestrutura e a conta fixa de teste do Nexus."""
    database = get_database()
    now = datetime.now(timezone.utc)

    await database["eventos"].update_one(
        {"type": "system.bootstrap"},
        {"$setOnInsert": {"type": "system.bootstrap", "created_at": now, "collections": list(COLLECTIONS)}},
        upsert=True,
    )

    existing = await database["usuarios"].find_one({"id": TEST_ACCOUNT["id"]})
    if not existing:
        account = {**TEST_ACCOUNT, "created_at": now, "updated_at": now}
        await database["usuarios"].insert_one(account)
