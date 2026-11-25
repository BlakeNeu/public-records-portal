import uuid
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import get_settings
from .logging_config import configure_logging, request_id_var
from .routers import documents, notifications
from .upstream import UpstreamError


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    app.state.http_client = httpx.AsyncClient(timeout=settings.upstream_timeout_seconds)
    yield
    await app.state.http_client.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    docs = settings.enable_docs
    app = FastAPI(
        title="Records Portal Integration Service",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
    )

    @app.middleware("http")
    async def correlation_id(request: Request, call_next):
        # Reuse the portal's request ID so one user action can be traced across services.
        rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_var.set(rid[:64])
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid[:64]
        return response

    @app.exception_handler(UpstreamError)
    async def upstream_error(_: Request, exc: UpstreamError):
        if exc.status_code == 404:
            return JSONResponse(status_code=404, content={"detail": "not found upstream"})
        # Never leak upstream internals to the caller.
        return JSONResponse(status_code=502, content={"detail": f"{exc.upstream} unavailable"})

    @app.get("/health", include_in_schema=False)
    async def health():
        return {"status": "ok"}

    app.include_router(notifications.router)
    app.include_router(documents.router)
    return app


app = create_app()
