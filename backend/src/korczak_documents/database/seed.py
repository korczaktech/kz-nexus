from datetime import datetime, timezone

from .collections import COLLECTIONS
from .connection import get_database


async def seed_initial_data() -> None:
    """Create only non-identity infrastructure markers."""
    database = get_database()
    now = datetime.now(timezone.utc)
    await database["eventos"].update_one(
        {"type": "system.bootstrap"},
        {"$setOnInsert": {
            "type": "system.bootstrap",
            "created_at": now,
            "collections": list(COLLECTIONS),
        }},
        upsert=True,
    )
