from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ResponseModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class RegisterRequest(APIModel):
    name: str = Field(min_length=1, max_length=160)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=128)
    phone: str | None = Field(default=None, max_length=40)


class LoginRequest(APIModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class RecoveryRequest(APIModel):
    email: str = Field(min_length=3, max_length=320)


class UserUpdateRequest(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    phone: str | None = Field(default=None, max_length=40)


class AdminUserCreateRequest(APIModel):
    name: str = Field(min_length=1, max_length=160)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=128)
    phone: str | None = Field(default=None, max_length=40)
    role: str = Field(default="user", min_length=1, max_length=40)

class AdminUserUpdateRequest(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    role: str | None = Field(default=None, min_length=1, max_length=40)
    status: str | None = Field(default=None, min_length=1, max_length=40)


class UserResponse(ResponseModel):
    id: str
    name: str
    email: str
    phone: str | None
    email_verified: bool
    phone_verified: bool
    role: str
    status: str = 'active'
    created_at: datetime
    updated_at: datetime


class SessionResponse(ResponseModel):
    token: str
    expires_at: datetime
    user: UserResponse


class DocumentCreateRequest(APIModel):
    name: str = Field(min_length=1, max_length=255)
    document_type: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=2000)
    folder_id: str | None = None
    content: str | None = None


class DocumentSaveRequest(APIModel):
    name: str = Field(min_length=1, max_length=255)
    document_type: str = Field(min_length=1, max_length=80)
    content: str | None = Field(default=None, max_length=2000000)
    base_version_id: str | None = None


class DocumentUpdateRequest(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    document_type: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    folder_id: str | None = None
    status: str | None = Field(default=None, min_length=1, max_length=40)


class DocumentResponse(ResponseModel):
    id: str
    owner_id: str
    name: str
    document_type: str
    description: str = ""
    folder_id: str | None
    current_version_id: str | None
    status: str
    favorite: bool = False
    tag_names: list[str] = []
    created_at: datetime
    updated_at: datetime
    content: str | None = None


class VersionCreateRequest(APIModel):
    content: str | None = None


class VersionResponse(ResponseModel):
    id: str
    document_id: str
    version_number: int
    author_id: str
    content: str | None
    created_at: datetime


class FolderCreateRequest(APIModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: str | None = None


class FolderUpdateRequest(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: str | None = None


class FolderResponse(ResponseModel):
    id: str
    owner_id: str
    parent_id: str | None
    name: str
    status: str = "active"
    created_at: datetime
    updated_at: datetime


class TagCreateRequest(APIModel):
    name: str = Field(min_length=1, max_length=100)


class GroupCreateRequest(APIModel):
    name: str = Field(min_length=1, max_length=120)


class PermissionRequest(APIModel):
    role: str = Field(min_length=1, max_length=40)
    actions: list[str] = Field(default_factory=list)
    user_ids: list[str] = Field(default_factory=list)
    group_ids: list[str] = Field(default_factory=list)


class NotificationResponse(ResponseModel):
    id: str
    user_id: str
    type: str
    message: str
    read: bool
    created_at: datetime


class SearchResponse(ResponseModel):
    items: list[DocumentResponse]
    total: int
    page: int
    page_size: int


class PaginatedResponse(ResponseModel):
    items: list[dict]
    total: int
    page: int
    page_size: int


class FeedbackRequest(APIModel):
    category: str = Field(default="Geral", min_length=1, max_length=80)
    message: str = Field(min_length=3, max_length=5000)
    rating: int | None = Field(default=None, ge=1, le=5)
