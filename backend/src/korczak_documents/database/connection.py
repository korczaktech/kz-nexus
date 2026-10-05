import asyncio
import weakref

from pymongo import AsyncMongoClient

from ..config.settings import Settings, get_settings

# AsyncMongoClient is bound to the event loop that first uses it. The API tests
# use both pytest's loop and FastAPI TestClient's portal loop, so each active
# loop receives its own client while still reusing that client inside the loop.
_clients: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, AsyncMongoClient]" = (
    weakref.WeakKeyDictionary()
)


def get_client() -> AsyncMongoClient:
    settings = get_settings()
    loop = asyncio.get_running_loop()
    client = _clients.get(loop)
    if client is None:
        client = AsyncMongoClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=settings.mongodb_server_selection_timeout_ms,
        )
        _clients[loop] = client
    return client


def get_database(settings: Settings | None = None):
    current = settings or get_settings()
    return get_client()[current.mongodb_database]


def get_accounts_database(settings: Settings | None = None):
    current = settings or get_settings()
    return get_client()[current.mongodb_accounts_database]


def close_client() -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    client = _clients.pop(loop, None)
    if client is not None:
        client.close()
