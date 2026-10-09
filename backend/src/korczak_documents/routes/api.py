from fastapi import APIRouter, Body, Depends, Header, Query, status
import httpx
from datetime import datetime, timezone, timedelta

from ..dependencies import current_user
from ..errors import AppError, NotFoundError, ValidationError
from ..models.api import *
from ..repositories import api as repo
from ..security import create_session, token_hash, hash_password, require_role, role_allows
from ..services import api as service
from ..database.connection import get_database, get_accounts_database

router = APIRouter()


@router.post("/oauth/google/token")
async def exchange_google_oauth_code(payload: dict = Body(...)):
    """Troca o código OAuth no servidor, mantendo o client secret privado."""
    from ..config.settings import get_settings
    settings = get_settings()
    client_id = settings.google_client_id.strip()
    client_secret = settings.google_client_secret.strip()
    if not client_id or not client_secret:
        raise AppError("Google Drive não está configurado no servidor. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Render.", "google_oauth_not_configured", 503)
    code = str(payload.get("code") or "").strip()
    redirect_uri = str(payload.get("redirect_uri") or "").strip()
    code_verifier = str(payload.get("code_verifier") or "").strip()
    if not code or not redirect_uri or not code_verifier:
        raise ValidationError("Código OAuth, redirect_uri e code_verifier são obrigatórios.")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post("https://oauth2.googleapis.com/token", data={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            })
    except httpx.HTTPError:
        raise AppError("Não foi possível comunicar com o serviço OAuth do Google.", "google_oauth_unavailable", 502)
    if response.is_error:
        try:
            detail = response.json()
        except ValueError:
            detail = {}
        raise AppError("O Google recusou a autorização: " + str(detail.get("error_description") or detail.get("error") or "erro desconhecido"), "google_oauth_exchange_failed", 400)
    return response.json()


@router.post("/oauth/google/refresh")
async def refresh_google_oauth_token(payload: dict = Body(...)):
    """Renova tokens do Google Drive sem expor o client secret."""
    from ..config.settings import get_settings
    settings = get_settings()
    client_id = settings.google_client_id.strip()
    client_secret = settings.google_client_secret.strip()
    refresh_token = str(payload.get("refresh_token") or "").strip()
    if not client_id or not client_secret:
        raise AppError("Google Drive não está configurado no servidor. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Render.", "google_oauth_not_configured", 503)
    if not refresh_token:
        raise ValidationError("refresh_token é obrigatório.")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post("https://oauth2.googleapis.com/token", data={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            })
    except httpx.HTTPError:
        raise AppError("Não foi possível comunicar com o serviço OAuth do Google.", "google_oauth_unavailable", 502)
    if response.is_error:
        try:
            detail = response.json()
        except ValueError:
            detail = {}
        raise AppError("A renovação do Google Drive falhou: " + str(detail.get("error_description") or detail.get("error") or "erro desconhecido"), "google_oauth_refresh_failed", 400)
    return response.json()


@router.get("/config/public")
async def public_config():
    from ..config.settings import get_settings
    return {"google_client_id": get_settings().google_client_id.strip()}


def without_mongo_id(item: dict) -> dict:
    cleaned = dict(item)
    cleaned.pop("_id", None)
    return cleaned


@router.post("/auth/register", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest):
    token, expires_at, user = await service.register(payload)
    return SessionResponse(token=token, expires_at=expires_at, user=user)


@router.post("/auth/login", response_model=SessionResponse)
async def login(payload: LoginRequest):
    token, expires_at, user = await service.login(payload)
    return SessionResponse(token=token, expires_at=expires_at, user=user)


@router.post("/auth/logout")
async def logout(authorization: str | None = Header(default=None), user=Depends(current_user)):
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    await service.logout(token)
    await repo.log_event(user["id"], "auth.logout", {"user_id": user["id"]})
    return {"message": "Sessão encerrada"}


@router.post("/auth/recovery")
async def recovery(payload: RecoveryRequest):
    return await service.request_recovery(payload.email)


@router.post("/feedback", status_code=status.HTTP_201_CREATED)
async def submit_feedback(payload: FeedbackRequest, user=Depends(current_user)):
    feedback = {
        "id": __import__("uuid").uuid4().hex,
        "user_id": user["id"],
        "category": payload.category.strip(),
        "message": payload.message.strip(),
        "rating": payload.rating,
        "created_at": service.repo.now(),
    }
    await get_database()["feedbacks"].insert_one(feedback)
    await repo.log_event(user["id"], "feedback.created", {"feedback_id": feedback["id"], "category": feedback["category"]})
    return {"message": "Feedback enviado com sucesso"}

@router.get("/users/me", response_model=UserResponse)
async def me(user=Depends(current_user)):
    return service.clean_user(user)


@router.patch("/users/me", response_model=UserResponse)
async def update_me(payload: UserUpdateRequest, user=Depends(current_user)):
    changes = payload.model_dump(exclude_unset=True)
    updated = await repo.update_user(user["id"], changes)
    await repo.log_event(user["id"], "user.updated", {"fields": list(changes)})
    return service.clean_user(updated)


@router.post("/users", response_model=UserResponse, status_code=201)
async def admin_create_user(payload: AdminUserCreateRequest, user=Depends(current_user)):
    require_role(user, "manager")
    if user["role"] == "manager" and payload.role == "admin":
        raise AppError("Gestores não podem criar administradores", "forbidden", 403)
    if await repo.find_user_by_email(payload.email):
        raise AppError("E-mail já cadastrado", "email_already_exists", 409)
    created = await repo.create_user({"name": payload.name, "email": payload.email, "phone": payload.phone, "password_hash": hash_password(payload.password), "role": payload.role})
    await repo.log_event(user["id"], "admin.user_created", {"target_user_id": created["id"]})
    return service.clean_user(created)


@router.get("/users", response_model=list[UserResponse])
async def users(user=Depends(current_user)):
    require_role(user, "manager")
    query = {} if user["role"] == "admin" else {"Conta.Role": {"$ne": "admin"}}
    accounts = get_accounts_database()["contas"]
    items = await accounts.find(query, {"Aplicativos": 0}).sort("Nome", 1).limit(1000).to_list(length=1000)
    return [service.clean_user(repo._account_to_user(item)) for item in items]


@router.patch("/users/{user_id}", response_model=UserResponse)
async def admin_update_user(user_id: str, payload: AdminUserUpdateRequest, user=Depends(current_user)):
    require_role(user, "manager")
    target = await repo.find_user(user_id)
    if not target:
        raise NotFoundError("Usuário não encontrado")
    changes = payload.model_dump(exclude_unset=True)
    if user["role"] == "manager" and (target.get("role") == "admin" or changes.get("role") == "admin" or changes.get("status") == "inactive" and target.get("role") == "admin"):
        raise AppError("Gestores não podem alterar administradores", "forbidden", 403)
    if not changes:
        return service.clean_user(target)
    updated = await repo.update_user(user_id, changes)
    await repo.log_event(user["id"], "admin.user_updated", {"target_user_id": user_id, "fields": list(changes)})
    return service.clean_user(updated)


@router.get("/documents", response_model=list[DocumentResponse])
async def documents(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100), user=Depends(current_user)):
    skip, limit = service.page_values(page, page_size)
    items, _ = await repo.list_documents(user["id"], {"status": {"$ne": "deleted"}}, skip, limit)
    return [DocumentResponse(**item, favorite=user["id"] in item.get("favorite_user_ids", [])) for item in items]


@router.post("/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(payload: DocumentCreateRequest, user=Depends(current_user)):
    document = await repo.create_document(user["id"], payload.model_dump())
    if payload.content is not None:
        version = await repo.create_version(document["id"], user["id"], payload.content, 1)
        document = await repo.get_document(document["id"])
    await repo.log_event(user["id"], "document.created", {"document_id": document["id"]})
    return DocumentResponse(**document, favorite=False)


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: str, user=Depends(current_user)):
    document = await service.document_or_404(document_id, user["id"], "read")
    version = await get_database()["versoes"].find_one({"id": document.get("current_version_id")}) if document.get("current_version_id") else None
    return DocumentResponse(**document, content=version.get("content") if version else None, favorite=user["id"] in document.get("favorite_user_ids", []))


@router.post("/documents/{document_id}/save", response_model=DocumentResponse)
async def save_document(document_id: str, payload: DocumentSaveRequest, user=Depends(current_user)):
    document=await service.document_or_404(document_id,user["id"],"write")
    result=await repo.save_document(document_id,user["id"],payload.model_dump(),payload.base_version_id)
    if not result:
        raise AppError("O documento foi alterado em outra sessão. Recarregue a versão atual antes de salvar.", "document_conflict", 409)
    updated,version=result
    await repo.log_event(user["id"],"document.saved",{"document_id":document_id,"version_id":version["id"]})
    return DocumentResponse(**updated,favorite=user["id"] in updated.get("favorite_user_ids",[]),content=version.get("content"))


@router.patch("/documents/{document_id}", response_model=DocumentResponse)
async def update_document(document_id: str, payload: DocumentUpdateRequest, user=Depends(current_user)):
    await service.document_or_404(document_id, user["id"], "write")
    changes = payload.model_dump(exclude_unset=True)
    if "folder_id" in changes and changes["folder_id"] is not None:
        target_folder = await service.folder_or_404(changes["folder_id"], user["id"])
        if target_folder.get("status") == "deleted":
            raise AppError("A pasta de destino está na lixeira.", "folder_deleted", 409)
    document = await repo.update_document(document_id, changes)
    await repo.log_event(user["id"], "document.updated", {"document_id": document_id, "fields": list(changes)})
    return DocumentResponse(**document, favorite=user["id"] in document.get("favorite_user_ids", []))


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, user=Depends(current_user)):
    await service.document_or_404(document_id, user["id"], "delete")
    await repo.update_document(document_id, {"status": "deleted"})
    await repo.log_event(user["id"], "document.deleted", {"document_id": document_id})
    return {"message": "Documento movido para a lixeira"}


@router.post("/documents/{document_id}/restore")
async def restore_document(document_id: str, user=Depends(current_user)):
    await service.document_or_404(document_id, user["id"], "delete", allow_deleted=True)
    await repo.update_document(document_id, {"status": "active"})
    await repo.log_event(user["id"], "document.restored", {"document_id": document_id})
    return {"message": "Documento restaurado"}


@router.delete("/documents/{document_id}/permanent")
async def permanent_delete_document(document_id: str, user=Depends(current_user)):
    document = await service.document_or_404(document_id, user["id"], "delete", allow_deleted=True)
    if document.get("status") != "deleted":
        raise AppError("Somente documentos na lixeira podem ser excluídos definitivamente.", "document_not_in_trash", 409)
    await get_database()["versoes"].delete_many({"document_id": document_id})
    await get_database()["documentos"].delete_one({"id": document_id})
    await repo.log_event(user["id"], "document.permanent_deleted", {"document_id": document_id})
    return {"message": "Documento excluído definitivamente"}


@router.get("/documents/{document_id}/versions", response_model=list[VersionResponse])
async def versions(document_id: str, user=Depends(current_user)):
    await service.document_or_404(document_id, user["id"])
    return await repo.list_versions(document_id)


@router.post("/documents/{document_id}/versions", response_model=VersionResponse, status_code=201)
async def create_version(document_id: str, payload: VersionCreateRequest, user=Depends(current_user)):
    await service.document_or_404(document_id, user["id"], "write")
    version = await repo.create_version(document_id, user["id"], payload.content, await service.version_number(document_id))
    await repo.log_event(user["id"], "document.version_created", {"document_id": document_id, "version_id": version["id"]})
    return version


@router.post("/documents/{document_id}/versions/{version_id}/restore")
async def restore_version(document_id: str, version_id: str, user=Depends(current_user)):
    await service.document_or_404(document_id, user["id"], "write")
    version = await get_database()["versoes"].find_one({"id": version_id, "document_id": document_id})
    if not version:
        raise NotFoundError("Versão não encontrada")
    new_version = await repo.create_version(document_id, user["id"], version.get("content"), await service.version_number(document_id))
    await repo.update_document(document_id, {"current_version_id": new_version["id"]})
    await repo.log_event(user["id"], "document.version_restored", {"document_id": document_id, "source_version_id": version_id, "new_version_id": new_version["id"]})
    return without_mongo_id(new_version)


@router.get("/folders", response_model=list[FolderResponse])
async def folders(user=Depends(current_user)):
    return await repo.list_folders(user["id"])

@router.get("/folders/trash", response_model=list[FolderResponse])
async def deleted_folders(user=Depends(current_user)):
    return await repo.list_deleted_folders(user["id"])

@router.get("/folders/{folder_id}", response_model=FolderResponse)
async def get_folder(folder_id: str, user=Depends(current_user)):
    return await service.folder_or_404(folder_id, user["id"])


@router.post("/folders/{folder_id}/restore")
async def restore_folder(folder_id: str, user=Depends(current_user)):
    folder = await service.folder_or_404(folder_id, user["id"], "delete", allow_deleted=True)
    if folder.get("status") != "deleted":
        raise AppError("A pasta não está na lixeira.", "folder_not_deleted", 409)
    if folder.get("parent_id"):
        parent = await service.folder_or_404(folder["parent_id"], user["id"])
        if parent.get("status") == "deleted":
            raise AppError("A pasta pai está na lixeira. Restaure-a primeiro.", "parent_folder_deleted", 409)
    await repo.update_folder(folder_id, {"status": "active"})
    await repo.log_event(user["id"], "folder.restored", {"folder_id": folder_id})
    return {"message": "Pasta restaurada"}


@router.post("/folders", response_model=FolderResponse, status_code=201)
async def create_folder(payload: FolderCreateRequest, user=Depends(current_user)):
    if payload.parent_id:
        parent = await service.folder_or_404(payload.parent_id, user["id"])
        if parent.get("status") == "deleted":
            raise AppError("A pasta pai está na lixeira.", "parent_folder_deleted", 409)
    folder = await repo.create_folder(user["id"], payload.model_dump())
    await repo.log_event(user["id"], "folder.created", {"folder_id": folder["id"]})
    return folder


@router.patch("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(folder_id: str, payload: FolderUpdateRequest, user=Depends(current_user)):
    await service.folder_or_404(folder_id, user["id"], "write")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("parent_id"):
        parent = await service.folder_or_404(changes["parent_id"], user["id"])
        if parent.get("status") == "deleted":
            raise AppError("A pasta pai está na lixeira.", "parent_folder_deleted", 409)
    folder = await repo.update_folder(folder_id, changes)
    await repo.log_event(user["id"], "folder.updated", {"folder_id": folder_id})
    return folder


@router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, user=Depends(current_user)):
    await service.folder_or_404(folder_id, user["id"], "delete")
    await repo.delete_folder(folder_id)
    await repo.log_event(user["id"], "folder.deleted", {"folder_id": folder_id})
    return {"message": "Pasta excluída"}


@router.get("/tags")
async def tags(user=Depends(current_user)):
    items = await get_database()["etiquetas"].find({"owner_id": user["id"]}).sort("name", 1).to_list(length=1000)
    return [without_mongo_id(item) for item in items]


@router.post("/tags", status_code=201)
async def create_tag(payload: TagCreateRequest, user=Depends(current_user)):
    collection = get_database()["etiquetas"]
    existing = await collection.find_one({"owner_id": user["id"], "name": payload.name.strip()})
    if existing:
        raise AppError("Etiqueta já existe", "tag_already_exists", 409)
    tag = {"id": __import__("uuid").uuid4().hex, "owner_id": user["id"], "name": payload.name.strip(), "created_at": service.repo.now(), "updated_at": service.repo.now()}
    await collection.insert_one(tag)
    tag.pop("_id", None)
    await repo.log_event(user["id"], "tag.created", {"tag_id": tag["id"]})
    return tag


@router.delete("/tags/{tag_name}")
async def delete_tag(tag_name: str, user=Depends(current_user)):
    tag = await service.tag_or_404(tag_name, user["id"])
    await get_database()["etiquetas"].delete_one({"id": tag["id"]})
    await get_database()["documentos"].update_many({"owner_id": user["id"]}, {"$pull": {"tag_names": tag_name}})
    await repo.log_event(user["id"], "tag.deleted", {"tag_id": tag["id"]})
    return {"message": "Etiqueta removida"}


@router.post("/documents/{document_id}/tags/{tag_name}")
async def apply_tag(document_id: str, tag_name: str, user=Depends(current_user)):
    document = await service.document_or_404(document_id, user["id"], "write")
    await service.tag_or_404(tag_name, user["id"])
    await get_database()["documentos"].update_one({"id": document_id}, {"$addToSet": {"tag_names": tag_name}})
    await repo.log_event(user["id"], "tag.applied", {"document_id": document_id, "tag": tag_name})
    return {"message": "Etiqueta aplicada"}


@router.delete("/documents/{document_id}/tags/{tag_name}")
async def remove_tag(document_id: str, tag_name: str, user=Depends(current_user)):
    await service.document_or_404(document_id, user["id"], "write")
    await get_database()["documentos"].update_one({"id": document_id}, {"$pull": {"tag_names": tag_name}})
    await repo.log_event(user["id"], "tag.removed", {"document_id": document_id, "tag": tag_name})
    return {"message": "Etiqueta removida"}


@router.post("/documents/{document_id}/favorite")
async def favorite(document_id: str, user=Depends(current_user)):
    await service.document_or_404(document_id, user["id"], "write")
    await get_database()["documentos"].update_one({"id": document_id}, {"$addToSet": {"favorite_user_ids": user["id"]}})
    await repo.log_event(user["id"], "favorite.added", {"document_id": document_id})
    return {"message": "Adicionado aos favoritos"}


@router.delete("/documents/{document_id}/favorite")
async def unfavorite(document_id: str, user=Depends(current_user)):
    await service.document_or_404(document_id, user["id"], "write")
    await get_database()["documentos"].update_one({"id": document_id}, {"$pull": {"favorite_user_ids": user["id"]}})
    await repo.log_event(user["id"], "favorite.removed", {"document_id": document_id})
    return {"message": "Removido dos favoritos"}


@router.get("/favorites", response_model=list[DocumentResponse])
async def favorites(user=Depends(current_user)):
    items = await get_database()["documentos"].find({"owner_id": user["id"], "favorite_user_ids": user["id"]}).sort("updated_at", -1).to_list(length=1000)
    return [DocumentResponse(**item, favorite=True) for item in items]


@router.get("/recent", response_model=list[DocumentResponse])
async def recent(user=Depends(current_user)):
    events = await get_database()["eventos"].find({"user_id": user["id"], "type": "document.opened"}).sort("created_at", -1).limit(50).to_list(length=50)
    ids=[]
    for event in events:
        doc_id=event.get("payload",{}).get("document_id")
        if doc_id and doc_id not in ids: ids.append(doc_id)
    docs=await get_database()["documentos"].find({"id":{"$in":ids},"owner_id":user["id"],"status":{"$ne":"deleted"}}).to_list(length=50)
    by_id={d["id"]:d for d in docs}
    return [DocumentResponse(**by_id[i], favorite=user["id"] in by_id[i].get("favorite_user_ids",[])) for i in ids if i in by_id]


@router.get("/trash", response_model=list[DocumentResponse])
async def trash(user=Depends(current_user)):
    items = await get_database()["documentos"].find({"owner_id": user["id"], "status": "deleted"}).sort("updated_at", -1).to_list(length=1000)
    return [DocumentResponse(**item, favorite=user["id"] in item.get("favorite_user_ids", [])) for item in items]


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query("", max_length=255),
    folder_id: str | None = None,
    tag: str | None = None,
    owner_id: str | None = None,
    status_filter: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    sort: str = "updated_desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user=Depends(current_user),
):
    if owner_id and owner_id != user["id"]:
        raise AppError("Pesquisa restrita aos seus documentos.", "forbidden", 403)
    filters = {"owner_id": user["id"], "status": status_filter or {"$ne": "deleted"}}
    term = q.strip()
    if term:
        doc_matches = await get_database()["documentos"].find(
            {"owner_id": user["id"], "$text": {"$search": term}}, {"id": 1}
        ).to_list(length=10000)
        version_matches = await get_database()["versoes"].find(
            {"$text": {"$search": term}}, {"document_id": 1}
        ).to_list(length=10000)
        ids = {x["id"] for x in doc_matches} | {x["document_id"] for x in version_matches}
        filters["id"] = {"$in": list(ids)}
    if folder_id:
        filters["folder_id"] = folder_id
    if tag:
        filters["tag_names"] = tag
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        if date_to:
            date_filter["$lt"] = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc) + timedelta(days=1)
        filters["updated_at"] = date_filter
    sort_field = "name" if sort.startswith("name_") else "updated_at"
    sort_dir = 1 if sort.endswith("_asc") else -1
    collection = get_database()["documentos"]
    total = await collection.count_documents(filters)
    skip = (page - 1) * page_size
    items = await collection.find(filters).sort(sort_field, sort_dir).skip(skip).limit(page_size).to_list(length=page_size)
    documents = [DocumentResponse(**item, favorite=user["id"] in item.get("favorite_user_ids", [])) for item in items]
    return SearchResponse(items=documents, total=total, page=page, page_size=page_size)


@router.post("/documents/{document_id}/open")
async def open_document(document_id: str, user=Depends(current_user)):
    await service.document_or_404(document_id, user["id"])
    await repo.log_event(user["id"], "document.opened", {"document_id": document_id})
    return {"message": "Documento registrado como recente"}


@router.get("/groups")
async def groups(user=Depends(current_user)):
    group_filter = {} if role_allows(user, "manager") else {"owner_id": user["id"]}
    items = await get_database()["grupos"].find(group_filter).sort("name", 1).to_list(length=1000)
    return [without_mongo_id(item) for item in items]


@router.post("/groups", status_code=201)
async def create_group(payload: GroupCreateRequest, user=Depends(current_user)):
    require_role(user, "manager")
    group = {"id": __import__("uuid").uuid4().hex, "owner_id": user["id"], "name": payload.name.strip(), "member_ids": [], "created_at": service.repo.now(), "updated_at": service.repo.now()}
    await get_database()["grupos"].insert_one(group)
    group.pop("_id", None)
    await repo.log_event(user["id"], "group.created", {"group_id": group["id"]})
    return group


@router.delete("/groups/{group_id}")
async def delete_group(group_id: str, user=Depends(current_user)):
    require_role(user, "manager")
    result=await get_database()["grupos"].delete_one({"id":group_id,"owner_id":user["id"]})
    if result.deleted_count==0: raise NotFoundError("Grupo não encontrado")
    await repo.log_event(user["id"],"group.deleted",{"group_id":group_id})
    return {"message":"Grupo removido"}

@router.post("/groups/{group_id}/members/{member_id}")
async def add_group_member(group_id: str, member_id: str, user=Depends(current_user)):
    require_role(user, "manager")
    group = await get_database()["grupos"].find_one({"id": group_id, "owner_id": user["id"]})
    if not group and role_allows(user, "manager"):
        group = await get_database()["grupos"].find_one({"id": group_id})
    if not group and role_allows(user, "manager"):
        group = await get_database()["grupos"].find_one({"id": group_id})
    if not group:
        raise NotFoundError("Grupo não encontrado")
    member = await repo.find_user(member_id)
    if not member:
        raise NotFoundError("Usuário não encontrado")
    await get_database()["grupos"].update_one({"id": group_id}, {"$addToSet": {"member_ids": member_id}})
    await repo.log_event(user["id"], "group.member_added", {"group_id": group_id, "member_id": member_id})
    return {"message": "Usuário adicionado ao grupo"}


@router.delete("/groups/{group_id}/members/{member_id}")
async def remove_group_member(group_id: str, member_id: str, user=Depends(current_user)):
    require_role(user, "manager")
    group = await get_database()["grupos"].find_one({"id": group_id, "owner_id": user["id"]})
    if not group:
        raise NotFoundError("Grupo não encontrado")
    await get_database()["grupos"].update_one({"id": group_id}, {"$pull": {"member_ids": member_id}})
    await repo.log_event(user["id"], "group.member_removed", {"group_id": group_id, "member_id": member_id})
    return {"message": "Usuário removido do grupo"}


@router.get("/permissions/{document_id}")
async def permissions(document_id: str, user=Depends(current_user)):
    document = await service.document_or_404(document_id, user["id"], "read")
    policy = await service.permission_policy(document, user["id"])
    return {"document_id": document_id, "owner_id": document["owner_id"], **policy}

@router.put("/permissions/{document_id}")
async def set_permissions(document_id: str, payload: PermissionRequest, user=Depends(current_user)):
    document = await service.document_or_404(document_id, user["id"], "share")
    if not role_allows(user, "manager") and document["owner_id"] != user["id"]:
        raise AppError("Somente o proprietário, gestor ou administrador pode alterar permissões", "forbidden", 403)
    valid_actions={"read","write","delete","share"}
    if not set(payload.actions).issubset(valid_actions):
        raise ValidationError("Permissão inválida")
    for uid in payload.user_ids:
        if not await repo.find_user(uid): raise NotFoundError("Usuário de permissão não encontrado")
    for gid in payload.group_ids:
        if not await get_database()["grupos"].find_one({"id":gid}): raise NotFoundError("Grupo de permissão não encontrado")
    policy={"role":payload.role,"actions":payload.actions,"user_ids":payload.user_ids,"group_ids":payload.group_ids}
    await get_database()["documentos"].update_one({"id":document_id},{"$set":{"permissions":policy}})
    await repo.log_event(user["id"], "permission.changed", {"document_id":document_id,"role":payload.role,"user_ids":payload.user_ids,"group_ids":payload.group_ids})
    return {"document_id":document_id,"owner_id":document["owner_id"],**policy}

@router.get("/folder-permissions/{folder_id}")
async def folder_permissions(folder_id: str, user=Depends(current_user)):
    folder=await service.folder_or_404(folder_id,user["id"],"read")
    return {"folder_id":folder_id,"owner_id":folder["owner_id"],**await service.permission_policy(folder,user["id"])}

@router.put("/folder-permissions/{folder_id}")
async def set_folder_permissions(folder_id: str, payload: PermissionRequest, user=Depends(current_user)):
    folder=await service.folder_or_404(folder_id,user["id"],"share")
    if not role_allows(user, "manager") and folder["owner_id"] != user["id"]:
        raise AppError("Somente o proprietário, gestor ou administrador pode alterar permissões","forbidden",403)
    valid_actions={"read","write","delete","share"}
    if not set(payload.actions).issubset(valid_actions): raise ValidationError("Permissão inválida")
    for uid in payload.user_ids:
        if not await repo.find_user(uid): raise NotFoundError("Usuário de permissão não encontrado")
    for gid in payload.group_ids:
        if not await get_database()["grupos"].find_one({"id":gid}): raise NotFoundError("Grupo de permissão não encontrado")
    policy={"role":payload.role,"actions":payload.actions,"user_ids":payload.user_ids,"group_ids":payload.group_ids}
    await get_database()["pastas"].update_one({"id":folder_id},{"$set":{"permissions":policy}})
    await repo.log_event(user["id"],"folder.permission.changed",{"folder_id":folder_id})
    return {"folder_id":folder_id,"owner_id":folder["owner_id"],**policy}

@router.get("/audit")
async def audit(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    event_type: str | None = None,
    document_id: str | None = None,
    actor_id: str | None = None,
    resource: str | None = None,
    result: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    user=Depends(current_user),
):
    skip, limit = service.page_values(page, page_size)
    global_view = role_allows(user, "manager")
    if actor_id and not global_view and actor_id != user["id"]:
        raise AppError("Sem permissão para consultar a auditoria de outro usuário.", "forbidden", 403)
    filters = {}
    if event_type: filters["type"] = event_type
    if document_id: filters["payload.document_id"] = document_id
    if actor_id: filters["actor_id"] = actor_id
    if resource: filters["resource"] = resource
    if result: filters["result"] = result
    if date_from or date_to:
        date_filter = {}
        if date_from: date_filter["$gte"] = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        if date_to: date_filter["$lt"] = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc) + timedelta(days=1)
        filters["created_at"] = date_filter
    items, total = await repo.list_audit_events(user["id"], filters, skip, limit, global_view=global_view)
    cleaned = []
    for item in items:
        event = without_mongo_id(item)
        event["integrity_valid"] = repo.event_integrity_valid(item)
        cleaned.append(event)
    return {"items": cleaned, "total": total, "page": page, "page_size": page_size}


@router.get("/notifications", response_model=list[NotificationResponse])
async def notifications(user=Depends(current_user)):
    items = await get_database()["notificacoes"].find({"user_id": user["id"]}).sort("created_at", -1).limit(100).to_list(length=100)
    return [without_mongo_id(item) for item in items]


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user=Depends(current_user)):
    result = await get_database()["notificacoes"].update_one({"id": notification_id, "user_id": user["id"]}, {"$set": {"read": True}})
    if result.matched_count == 0:
        raise NotFoundError("Notificação não encontrada")
    return {"message": "Notificação marcada como lida"}
