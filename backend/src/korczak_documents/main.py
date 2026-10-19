import asyncio
import os
from time import perf_counter

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from .config.settings import get_settings
from .database.bootstrap import bootstrap_database
from .database.connection import close_client, get_database
from .errors import AppError, register_exception_handlers
from .logging import configure_logging, get_logger
from .rate_limit import enforce_rate_limit
from .routes import router
from .telemetry import persist_snapshot, request_finished, request_started, snapshot
from .telemetry_dashboard import get_engine_ci_status, render_dashboard

settings = get_settings()
configure_logging(settings)
logger = get_logger(__name__)

app = FastAPI(title=settings.app_name, version="0.3.0", description="API do Korczak Nexus.")
_telemetry_task: asyncio.Task | None = None


async def _persist_telemetry_periodically() -> None:
    """Write one privacy-safe aggregate sample per minute, with bounded retention."""
    while True:
        await asyncio.sleep(60)
        try:
            instance_id = os.getenv("RENDER_INSTANCE_ID") or os.getenv("HOSTNAME") or "default"
            await persist_snapshot(get_database(), instance_id)
        except Exception:
            logger.warning("Telemetria: não foi possível persistir a amostra histórica")

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
async def collect_telemetry(request: Request, call_next):
    """Record aggregate request timings without collecting user-identifying data."""
    path = request.url.path
    if path.startswith("/telemetry"):
        return await call_next(request)

    started = perf_counter()
    request_started()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        matched_route = request.scope.get("route")
        metric_path = getattr(matched_route, "path", None) or path
        request_finished(
            request.method,
            metric_path,
            status_code,
            (perf_counter() - started) * 1000,
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
    """Prepare MongoDB and initialize historical telemetry collection."""
    global _telemetry_task
    await bootstrap_database()
    try:
        database = get_database()
        await database["kortex_telemetry_snapshots"].create_index(
            "captured_at", expireAfterSeconds=30 * 24 * 60 * 60
        )
        instance_id = os.getenv("RENDER_INSTANCE_ID") or os.getenv("HOSTNAME") or "default"
        await persist_snapshot(database, instance_id)
    except Exception:
        logger.warning("Telemetria: persistência histórica indisponível; métricas locais continuam ativas")
    _telemetry_task = asyncio.create_task(_persist_telemetry_periodically())
    logger.info("MongoDB inicializado: coleções, índices e bootstrap verificados")


@app.on_event("shutdown")
async def shutdown_mongodb() -> None:
    global _telemetry_task
    if _telemetry_task is not None:
        _telemetry_task.cancel()
        try:
            await _telemetry_task
        except asyncio.CancelledError:
            pass
        _telemetry_task = None
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


@app.get("/telemetry/metrics", include_in_schema=False)
async def telemetry_metrics() -> dict:
    """Public aggregate telemetry; deliberately excludes sensitive request data."""
    database_status = "indisponível"
    database_latency_ms = None
    history = []
    started = perf_counter()
    try:
        database = get_database()
        await database.command({"ping": 1})
        database_latency_ms = round((perf_counter() - started) * 1000, 2)
        database_status = "operacional"
        cursor = (
            database["kortex_telemetry_snapshots"]
            .find(
                {},
                {
                    "_id": 0,
                    "captured_at": 1,
                    "requests_last_5m": 1,
                    "errors_last_5m": 1,
                    "error_rate_last_5m_percent": 1,
                    "latency_avg_ms_last_5m": 1,
                    "latency_p95_ms_last_5m": 1,
                },
            )
            .sort("captured_at", -1)
            .limit(24)
        )
        history = await cursor.to_list(length=24)
    except Exception:
        logger.warning("Telemetry metrics: database ping or history query failed")
    metrics = snapshot()
    return {
        # Keep aggregate metrics available at the root for existing clients,
        # while retaining the grouped shape used by the current dashboard.
        **metrics,
        "metrics": metrics,
        "database_status": database_status,
        "database_latency_ms": database_latency_ms,
        "engine_ci": await get_engine_ci_status(),
        "history": history,
    }


@app.get("/telemetry", response_class=HTMLResponse, include_in_schema=False)
async def telemetry_dashboard():
    """Server-rendered telemetry dashboard; no client-side JavaScript required."""
    database_status = "indisponível"
    database_latency_ms = None
    started = perf_counter()
    history = []
    try:
        database = get_database()
        await database.command({"ping": 1})
        database_latency_ms = round((perf_counter() - started) * 1000, 2)
        database_status = "operacional"
        cursor = (
            database["kortex_telemetry_snapshots"]
            .find(
                {},
                {
                    "_id": 0,
                    "captured_at": 1,
                    "requests_last_5m": 1,
                    "errors_last_5m": 1,
                    "error_rate_last_5m_percent": 1,
                    "latency_avg_ms_last_5m": 1,
                    "latency_p95_ms_last_5m": 1,
                },
            )
            .sort("captured_at", -1)
            .limit(24)
        )
        history = await cursor.to_list(length=24)
    except Exception:
        logger.warning("Telemetry dashboard: MongoDB ping or historical query failed")
    return HTMLResponse(
        content=render_dashboard(snapshot(), database_status, database_latency_ms, await get_engine_ci_status(), history),
        headers={
            "Cache-Control": "no-store, max-age=0",
            "X-Robots-Tag": "noindex, nofollow",
        },
    )
