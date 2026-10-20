from datetime import datetime, timezone

import pytest

from korczak_documents.routes import storage_nodes


class FakeCollection:
    def __init__(self):
        self.documents = []

    async def insert_one(self, document):
        self.documents.append(dict(document))
        return type("InsertResult", (), {"inserted_id": document.get("id")})()

    async def find_one_and_update(self, query, update, return_document=True):
        now = query["expires_at"]["$gt"]
        for document in self.documents:
            if (
                document.get("code_hash") == query["code_hash"]
                and document.get("expires_at") > now
                and document.get("consumed_at") is None
            ):
                document.update(update["$set"])
                return dict(document)
        return None

    async def update_one(self, query, update):
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                document.update(update["$set"])
                return type("UpdateResult", (), {"matched_count": 1})()
        return type("UpdateResult", (), {"matched_count": 0})()


class FakeDatabase:
    def __init__(self):
        self.collections = {
            "storage_node_pairing_codes": FakeCollection(),
            "storage_nodes": FakeCollection(),
        }

    def __getitem__(self, name):
        return self.collections[name]


@pytest.mark.asyncio
async def test_pairing_code_is_single_use_and_only_digest_is_persisted(monkeypatch):
    database = FakeDatabase()
    monkeypatch.setattr(storage_nodes, "get_database", lambda: database)

    issued = await storage_nodes.create_pairing_code({"id": "user-a"})
    raw_code = issued["pairing_code"]
    pairing_docs = database["storage_node_pairing_codes"].documents
    assert pairing_docs[0]["code_hash"] == storage_nodes._digest(raw_code)
    assert raw_code not in str(pairing_docs[0])

    request = storage_nodes.PairNodeRequest(pairing_code=raw_code, device_name=" Note20 Ultra ")
    paired = await storage_nodes.pair_node(request)
    assert paired["device_name"] == "Note20 Ultra"
    assert paired["node_token"].startswith(storage_nodes.NODE_TOKEN_PREFIX)

    node_doc = database["storage_nodes"].documents[0]
    assert node_doc["user_id"] == "user-a"
    assert node_doc["token_hash"] == storage_nodes._digest(paired["node_token"])
    assert paired["node_token"] not in str(node_doc)

    with pytest.raises(Exception):
        await storage_nodes.pair_node(request)


@pytest.mark.asyncio
async def test_heartbeat_accepts_only_matching_active_node_credential(monkeypatch):
    database = FakeDatabase()
    monkeypatch.setattr(storage_nodes, "get_database", lambda: database)
    now = datetime.now(timezone.utc)
    token = "knode_" + "A" * 64
    await database["storage_nodes"].insert_one({
        "id": "node-1",
        "user_id": "user-a",
        "token_hash": storage_nodes._digest(token),
        "created_at": now,
        "last_seen_at": None,
        "revoked_at": None,
    })

    result = await storage_nodes.node_heartbeat("node-1", f"Bearer {token}")
    assert result["status"] == "online"
    assert database["storage_nodes"].documents[0]["last_seen_at"] is not None

    with pytest.raises(Exception):
        await storage_nodes.node_heartbeat("node-1", "Bearer knode_wrong")


@pytest.mark.asyncio
async def test_revoked_node_cannot_send_heartbeat(monkeypatch):
    database = FakeDatabase()
    monkeypatch.setattr(storage_nodes, "get_database", lambda: database)
    token = "knode_" + "A" * 64
    await database["storage_nodes"].insert_one({
        "id": "node-1",
        "user_id": "user-a",
        "token_hash": storage_nodes._digest(token),
        "created_at": datetime.now(timezone.utc),
        "last_seen_at": None,
        "revoked_at": datetime.now(timezone.utc),
    })

    with pytest.raises(Exception):
        await storage_nodes.node_heartbeat("node-1", f"Bearer {token}")


def test_node_status_handles_naive_mongodb_timestamps_and_revocation():
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    assert storage_nodes._node_status({"last_seen_at": now}, now) == "online"
    assert storage_nodes._node_status({"last_seen_at": now.replace(tzinfo=None)}, now) == "online"
    assert storage_nodes._node_status({"last_seen_at": now - timedelta(minutes=5)}, now) == "offline"
    assert storage_nodes._node_status({"last_seen_at": now, "revoked_at": now}, now) == "revoked"
    assert storage_nodes._node_status({"last_seen_at": None}, now) == "offline"


def test_storage_node_roles_match_server_order_without_repairing_credentials():
    assert storage_nodes._node_role("Servidor I") == "server_i"
    assert storage_nodes._node_role("Samsung Note20 Ultra") == "server_i"
    assert storage_nodes._node_role("Servidor II") == "server_ii"
    assert storage_nodes._node_role("Samsung Galaxy J8") == "server_ii"
    assert storage_nodes._node_role("Unknown device") is None


def test_storage_node_selection_requires_fresh_heartbeat_internet_and_capacity():
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    base = {
        "last_seen_at": now,
        "revoked_at": None,
        "internet_connected": True,
        "free_bytes": 1024,
    }
    assert storage_nodes._node_can_store(base, 1024, now)
    assert not storage_nodes._node_can_store(base, 1025, now)
    assert not storage_nodes._node_can_store({**base, "internet_connected": False}, 1, now)
    assert not storage_nodes._node_can_store({**base, "last_seen_at": now - timedelta(minutes=4)}, 1, now)
    assert not storage_nodes._node_can_store({**base, "revoked_at": now}, 1, now)
