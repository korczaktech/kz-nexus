from korczak_documents.config.settings import Settings
from korczak_documents.database.collections import COLLECTIONS
from korczak_documents.database.indexes import INDEX_DEFINITIONS
from korczak_documents.database.seed import seed_initial_data


def test_database_name_is_kzdocs() -> None:
    assert Settings().mongodb_database == "KZDocs"


def test_expected_collections_are_defined() -> None:
    # KZDocs guarda os recursos documentais e as credenciais dos nós de armazenamento;
    # as identidades das contas continuam no banco Contas.
    assert COLLECTIONS == (
        "documentos",
        "versoes",
        "pastas",
        "etiquetas",
        "sessoes",
        "eventos",
        "notificacoes",
        "grupos",
        "storage_nodes",
        "storage_node_pairing_codes",
    )


def test_every_collection_has_indexes() -> None:
    assert set(INDEX_DEFINITIONS) == set(COLLECTIONS)
    for definitions in INDEX_DEFINITIONS.values():
        assert definitions


def test_seed_function_is_available() -> None:
    assert callable(seed_initial_data)
