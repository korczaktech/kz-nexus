from datetime import datetime, timezone

from .connection import get_database, get_accounts_database

APP_NAMES = [
    "Site", "Morok", "IDE", "AI", "ERP", "FLOW", "DOCUMENTS", "VISION", "OPS", "CONNECT", "MOBILE",
    "Vault", "Nexus", "Nexa", "Veya", "Formly", "Korvo", "Chrona", "Meet", "Pulse", "Acta", "Memo", "People", "Web", "Klash"
]
PLAN = {"Free": True, "Hephaestus": False, "Apollo": False, "Athena": False, "Zeus": False, "Veles": False, "Marzanna": False}

async def migrate_accounts() -> None:
    accounts = get_accounts_database()["contas"]
    legacy = get_database()["usuarios"]
    await accounts.create_index("Email", unique=True, name="unique_email")
    await accounts.create_index("id", unique=True, name="unique_account_id")
    async for user in legacy.find({}):
        if await accounts.find_one({"id": user.get("id")}) or await accounts.find_one({"Email": str(user.get("email", "")).lower().strip()}):
            continue
        created = user.get("created_at") or datetime.now(timezone.utc)
        updated = user.get("updated_at") or created
        aplicativos = {name: {"Senha": user.get("password_hash", ""), "Ativo": True} for name in APP_NAMES}
        await accounts.insert_one({
            "id": user.get("id"), "Nome": user.get("name", ""), "Email": str(user.get("email", "")).lower().strip(), "Telefone": user.get("phone"),
            "Aplicativos": aplicativos,
            "Planos": {"KOS": dict(PLAN), "Workspace": dict(PLAN)},
            "Verified": bool(user.get("email_verified") and user.get("phone_verified")),
            "EmailVerified": bool(user.get("email_verified", False)), "PhoneVerified": bool(user.get("phone_verified", False)),
            "Conta": {"Status": user.get("status", "active"), "Role": user.get("role", "user"), "CriadaEm": created, "AtualizadaEm": updated, "UltimoLogin": None},
            "Produtos": {"KOS": True, "Workspace": True, "Site": True},
            "Seguranca": {"TwoFactorEnabled": False, "RecoveryEnabled": True},
            "Preferencias": {"Idioma": "pt-BR", "Tema": "dark"},
            "Metadados": {"OrigemCadastro": "Migracao-KZDocs", "VersaoCadastro": "", "UltimoDispositivo": "", "UltimoIP": None}
        })
