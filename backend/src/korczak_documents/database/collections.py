COLLECTIONS = (
    "documentos",
    "versoes",
    "pastas",
    "etiquetas",
    "sessoes",
    "eventos",
    "notificacoes",
    "grupos",
)


async def ensure_collections(database) -> None:
    """Create only collections owned by the Nexus document service."""
    existing = set(await database.list_collection_names())
    for name in COLLECTIONS:
        if name not in existing:
            await database.create_collection(name)
