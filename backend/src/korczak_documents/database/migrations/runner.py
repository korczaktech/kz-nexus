from datetime import datetime, timezone

from . import MIGRATION_VERSION
from ..connection import get_database


async def run_migrations() -> None:
    """Run only migrations for data owned by KZDocs.

    User identity is owned by Contas.contas and is intentionally not
    migrated or created in KZDocs.
    """
    database = get_database()
    await database["migrations"].update_one(
        {"version": MIGRATION_VERSION},
        {"$setOnInsert": {"version": MIGRATION_VERSION, "applied_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
