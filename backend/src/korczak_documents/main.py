from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config.settings import get_settings
from .database.bootstrap import bootstrap_database
from .database.connection import close_client, get_database
from .errors import AppError, register_exception_handlers
from .logging import configure_logging, get_logger
from .rate_limit import enforce_rate_limit
from .routes import router

settings = get_settings()
configure_logging(settings)
logger = get_logger(__name__)

app = FastAPI(title=settings.app_name, version="0.3.0", description="API do Korczak Nexus.")

# Produção: o frontend é publicado no GitHub Pages. Mantemos também a
# origem configurada por ambiente para permitir mudanças de domínio sem
# quebrar a autenticação no navegador.
configured_origin = settings.frontend_url.rstrip("/") if settings.frontend_url else ""
allowed_origin_set = {
    "https://korczaktech.github.io",
    "https://nexus.korczaktech.com.br",
}
# Em produção não mantenha localhost como origem permitida só porque é o
# valor padrão de desenvolvimento. Origens adicionais devem ser configuradas
# explicitamente pelo ambiente de implantação.
if configured_origin and (
    not settings.is_production
    or configured_origin not in {"http://localhost:5173", "http://127.0.0.1:5173"}
):
    allowed_origin_set.add(configured_origin)
allowed_origins = sorted(allowed_origin_set)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.middleware("http")
async def security_middleware(request: Request, call_next):
    path = request.url.path
    response = None
    if path in {"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/recovery"}:
        client = request.client.host if request.client else "unknown"
        try:
            enforce_rate_limit(client, path)
        except AppError as exc:
            response = JSONResponse(
                status_code=exc.status_code,
                content={"error": {"code": exc.code, "message": exc.message}},
            )
    if response is None:
        response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

register_exception_handlers(app)
app.include_router(router, prefix="/api/v1")


@app.on_event("startup")
async def initialize_mongodb() -> None:
    """Prepare the complete MongoDB structure before serving requests."""
    await bootstrap_database()
    logger.info("MongoDB inicializado: coleções, índices e bootstrap verificados")


@app.on_event("shutdown")
async def shutdown_mongodb() -> None:
    close_client()

@app.get("/health", include_in_schema=False)
def root_health() -> dict[str, str]:
    """Liveness endpoint: confirms the API process is responding."""
    logger.debug("Health check executado")
    return {"status": "ok", "service": "korczak-nexus-api"}


@app.get("/ready", include_in_schema=False)
async def readiness_health():
    """Readiness endpoint: only returns ready when MongoDB answers ping."""
    try:
        await get_database().command({"ping": 1})
    except Exception:
        logger.warning("Readiness check failed: database unavailable")
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "service": "korczak-nexus-api"},
        )
    return {"status": "ready", "service": "korczak-nexus-api"}
