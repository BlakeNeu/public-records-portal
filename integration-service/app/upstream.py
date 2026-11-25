"""Outbound HTTP to third-party systems, with retries and a log line per attempt."""

import logging
import time

import httpx
from fastapi import Request
from tenacity import AsyncRetrying, retry_if_exception, stop_after_attempt, wait_exponential

from .config import get_settings
from .logging_config import request_id_var

log = logging.getLogger("upstream")


class UpstreamError(Exception):
    def __init__(self, upstream: str, status_code: int | None, message: str):
        super().__init__(message)
        self.upstream = upstream
        self.status_code = status_code


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):  # timeouts, connection refused, etc.
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code == 429 or code >= 500
    return False


def get_http_client(request: Request) -> httpx.AsyncClient:
    return request.app.state.http_client


async def call_upstream(
    client: httpx.AsyncClient, method: str, url: str, *, upstream: str, **kwargs
) -> httpx.Response:
    settings = get_settings()
    headers = {"X-Request-ID": request_id_var.get(), **kwargs.pop("headers", {})}
    attempt_no = 0

    try:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(settings.max_attempts),
            wait=wait_exponential(multiplier=settings.retry_backoff_seconds, max=5),
            retry=retry_if_exception(_is_retryable),
            reraise=True,
        ):
            with attempt:
                attempt_no += 1
                started = time.perf_counter()
                status_code = None
                try:
                    response = await client.request(method, url, headers=headers, **kwargs)
                    status_code = response.status_code
                    response.raise_for_status()
                    return response
                finally:
                    log.info(
                        "upstream call",
                        extra={
                            "fields": {
                                "upstream": upstream,
                                "method": method,
                                "url": url,
                                "attempt": attempt_no,
                                "status": status_code,
                                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                            }
                        },
                    )
    except httpx.HTTPStatusError as exc:
        raise UpstreamError(upstream, exc.response.status_code, str(exc)) from exc
    except httpx.TransportError as exc:
        raise UpstreamError(upstream, None, str(exc)) from exc
    raise AssertionError("unreachable")
