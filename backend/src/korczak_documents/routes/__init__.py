from .api import router as api_router
from .health import router as health_router
from .storage_nodes import router as storage_nodes_router
from .subscriptions import router as subscriptions_router

router = api_router
router.include_router(health_router)
router.include_router(storage_nodes_router)
router.include_router(subscriptions_router)
__all__ = ["router"]
