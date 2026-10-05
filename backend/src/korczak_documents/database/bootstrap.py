from .connection import get_database, get_accounts_database
from .indexes import ensure_indexes
from .migrations.runner import run_migrations
from .seed import seed_initial_data
from .collections import ensure_collections
from .accounts_migration import migrate_accounts


async def bootstrap_database() -> None:
    database = get_database()
    await database.command({"ping": 1})
    await run_migrations()
    await migrate_accounts()

    await ensure_collections(database)
    await ensure_indexes(database)
    await seed_initial_data()
