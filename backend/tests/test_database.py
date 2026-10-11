from korczak_documents.config.settings import Settings
from korczak_documents.database.collections import COLLECTIONS
from korczak_documents.database.indexes import INDEX_DEFINITIONS
from korczak_documents.database.seed import seed_initial_data


def test_database_name_is_kzdocs() -> None:
    assert Settings().mongodb_database == "KZDocs"


def test_expected_collections_are_defined() -> None:
    # Identidades e credenciais vivem no banco Contas; KZDocs guarda
    # somente os recursos do serviço documental.
    assert COLLECTIONS == (
        "documentos",
        "versoes",
        "pastas",
        "etiquetas",
        "sessoes",
        "eventos",
        "notificacoes",
        "grupos",
    )


def test_every_collection_has_indexes() -> None:
    assert set(INDEX_DEFINITIONS) == set(COLLECTIONS)
    for definitions in INDEX_DEFINITIONS.values():
        assert definitions


def test_seed_function_is_available() -> None:
    assert callable(seed_initial_data)
