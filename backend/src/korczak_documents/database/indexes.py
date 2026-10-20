import asyncio

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
    "storage_nodes": [("user_id", ASCENDING), ("created_at", DESCENDING)],
    "storage_node_pairing_codes": [("user_id", ASCENDING), ("expires_at", DESCENDING)],
}


async def _read_indexes(collection) -> list[dict]:
    cursor = await collection.list_indexes()
    return await cursor.to_list(length=None)


async def _ensure_index(
    collection,
    keys,
    *,
    name: str,
    unique: bool = False,
    expire_after_seconds: int | None = None,
    sparse: bool = False,
    existing_indexes: list[dict] | None = None,
) -> None:
    """Ensure an index, reusing the caller's current index snapshot when available."""
    requested_keys = dict(keys if isinstance(keys, list) else [(keys, ASCENDING)])
    if existing_indexes is None:
        existing_indexes = await _read_indexes(collection)

    for index in list(existing_indexes):
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
        existing_indexes.remove(index)

    options = {"name": name, "unique": unique, "sparse": sparse}
    if expire_after_seconds is not None:
        options["expireAfterSeconds"] = expire_after_seconds
    await collection.create_index(keys, **options)
    existing_indexes.append({
        "name": name,
        "key": requested_keys,
        "unique": unique,
        "sparse": sparse,
        **({"expireAfterSeconds": expire_after_seconds} if expire_after_seconds is not None else {}),
    })


async def ensure_indexes(database) -> None:
    """Create all required indexes with one parallel metadata read per collection."""
    collections = {name: database[name] for name in COLLECTIONS}
    snapshots = await asyncio.gather(*(_read_indexes(collections[name]) for name in COLLECTIONS))
    existing_by_collection = dict(zip(COLLECTIONS, snapshots, strict=True))

    # Reuse each snapshot and update it as indexes are created or replaced.
    for collection_name in COLLECTIONS:
        await _ensure_index(
            collections[collection_name],
            INDEX_DEFINITIONS[collection_name],
            name=f"{collection_name}_lookup",
            existing_indexes=existing_by_collection[collection_name],
        )

    await _ensure_index(
        collections["etiquetas"],
        [("owner_id", ASCENDING), ("name", ASCENDING)],
        name="tag_owner_name_unique",
        unique=True,
        existing_indexes=existing_by_collection["etiquetas"],
    )

    # IDs are application-generated UUIDs and must remain unique at the database layer.
    for collection_name in COLLECTIONS:
        await _ensure_index(
            collections[collection_name],
            "id",
            name="id_unique",
            unique=True,
            sparse=True,
            existing_indexes=existing_by_collection[collection_name],
        )

    # Session records are looked up by the SHA-256 token hash.
    await _ensure_index(
        collections["sessoes"],
        "token_hash",
        name="session_token_hash_unique",
        unique=True,
        existing_indexes=existing_by_collection["sessoes"],
    )
    await _ensure_index(
        collections["sessoes"],
        "expires_at",
        name="session_expiry",
        expire_after_seconds=0,
        existing_indexes=existing_by_collection["sessoes"],
    )

    # Full-text search used by /api/v1/search.
    await _ensure_index(
        collections["documentos"],
        [("name", "text"), ("description", "text"), ("document_type", "text")],
        name="document_search_text",
        existing_indexes=existing_by_collection["documentos"],
    )
    await _ensure_index(
        collections["versoes"],
        [("content", "text")],
        name="version_content_search_text",
        existing_indexes=existing_by_collection["versoes"],
    )

    # Audit queries by actor/resource and chronological order.
    await _ensure_index(
        collections["eventos"],
        [("actor_id", ASCENDING), ("created_at", DESCENDING)],
        name="audit_actor_created_at",
        existing_indexes=existing_by_collection["eventos"],
    )
    await _ensure_index(
        collections["eventos"],
        [("resource", ASCENDING), ("created_at", DESCENDING)],
        name="audit_resource_created_at",
        existing_indexes=existing_by_collection["eventos"],
    )


    # Storage-node credentials are stored only as digests and indexed for fast
    # lookup. Pairing codes are short-lived; TTL cleanup is asynchronous, while
    # endpoint queries enforce expires_at independently.
    await _ensure_index(
        collections["storage_nodes"],
        "token_hash",
        name="storage_node_token_hash_unique",
        unique=True,
        existing_indexes=existing_by_collection["storage_nodes"],
    )
    await _ensure_index(
        collections["storage_node_pairing_codes"],
        "code_hash",
        name="storage_node_pairing_code_hash_unique",
        unique=True,
        existing_indexes=existing_by_collection["storage_node_pairing_codes"],
    )
    await _ensure_index(
        collections["storage_node_pairing_codes"],
        "expires_at",
        name="storage_node_pairing_code_expiry",
        expire_after_seconds=0,
        existing_indexes=existing_by_collection["storage_node_pairing_codes"],
    )
