from pymongo import ASCENDING, DESCENDING

from .collections import COLLECTIONS

INDEX_DEFINITIONS = {
    "documentos": [("owner_id", ASCENDING), ("updated_at", DESCENDING)],
    "versoes": [("document_id", ASCENDING), ("version_number", DESCENDING)],
    "pastas": [("owner_id", ASCENDING), ("parent_id", ASCENDING)],
    "etiquetas": [("owner_id", ASCENDING), ("name", ASCENDING)],
    "sessoes": [("user_id", ASCENDING), ("expires_at", ASCENDING)],
    "eventos": [("user_id", ASCENDING), ("created_at", DESCENDING)],
    "notificacoes": [("user_id", ASCENDING), ("read", ASCENDING), ("created_at", DESCENDING)],
    "grupos": [("owner_id", ASCENDING), ("name", ASCENDING)],
}


async def _ensure_index(
    collection,
    keys,
    *,
    name: str,
    unique: bool = False,
    expire_after_seconds: int | None = None,
    sparse: bool = False,
) -> None:
    """Create an index and replace an older incompatible index on the same keys."""
    requested_keys = dict(keys if isinstance(keys, list) else [(keys, ASCENDING)])
    cursor = await collection.list_indexes()
    existing = await cursor.to_list(length=None)

    for index in existing:
        if index.get("name") == "_id_":
            continue
        if dict(index.get("key", {})) != requested_keys:
            continue

        same_options = (
            index.get("name") == name
            and bool(index.get("unique", False)) == unique
            and index.get("expireAfterSeconds") == expire_after_seconds
            and bool(index.get("sparse", False)) == sparse
        )
        if same_options:
            return

        await collection.drop_index(index["name"])

    options = {"name": name, "unique": unique, "sparse": sparse}
    if expire_after_seconds is not None:
        options["expireAfterSeconds"] = expire_after_seconds
    await collection.create_index(keys, **options)


async def ensure_indexes(database) -> None:
    """Create all indexes required by the application, idempotently."""
    for collection_name in COLLECTIONS:
        collection = database[collection_name]
        await _ensure_index(
            collection,
            INDEX_DEFINITIONS[collection_name],
            name=f"{collection_name}_lookup",
        )

    await _ensure_index(
        database["etiquetas"],
        [("owner_id", ASCENDING), ("name", ASCENDING)],
        name="tag_owner_name_unique",
        unique=True,
    )

    # IDs are application-generated UUIDs and must remain unique at the database layer.
    for collection_name in COLLECTIONS:
        await _ensure_index(
            database[collection_name],
            "id",
            name="id_unique",
            unique=True,
            sparse=True,
        )

    # Session records are looked up by the SHA-256 token hash.
    await _ensure_index(
        database["sessoes"],
        "token_hash",
        name="session_token_hash_unique",
        unique=True,
    )
    await _ensure_index(
        database["sessoes"],
        "expires_at",
        name="session_expiry",
        expire_after_seconds=0,
    )

    # Full-text search used by /api/v1/search.
    await _ensure_index(
        database["documentos"],
        [("name", "text"), ("description", "text"), ("document_type", "text")],
        name="document_search_text",
    )
    await _ensure_index(
        database["versoes"],
        [("content", "text")],
        name="version_content_search_text",
    )

    # Audit queries by actor/resource and chronological order.
    await _ensure_index(
        database["eventos"],
        [("actor_id", ASCENDING), ("created_at", DESCENDING)],
        name="audit_actor_created_at",
    )
    await _ensure_index(
        database["eventos"],
        [("resource", ASCENDING), ("created_at", DESCENDING)],
        name="audit_resource_created_at",
    )
