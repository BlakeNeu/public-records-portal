import logging
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel

from ..auth import require_service_token
from ..config import Settings, get_settings
from ..upstream import call_upstream, get_http_client

log = logging.getLogger("documents")

router = APIRouter(prefix="/v1/requests", dependencies=[Depends(require_service_token)])

# Only these file types are ever passed back to the portal for release.
ALLOWED_CONTENT_TYPES = {"application/pdf", "image/png", "image/jpeg", "text/plain"}


class Document(BaseModel):
    document_id: str
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class DocumentList(BaseModel):
    request_id: str
    documents: list[Document]
    rejected_count: int


@router.get("/{request_id}/documents", response_model=DocumentList)
async def list_documents(
    request_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9-]{1,64}$")],
    client: httpx.AsyncClient = Depends(get_http_client),
    settings: Settings = Depends(get_settings),
) -> DocumentList:
    response = await call_upstream(
        client, "GET", f"{settings.dms_base_url}/cases/{request_id}/documents", upstream="dms"
    )

    documents: list[Document] = []
    rejected = 0
    # The legacy DMS uses camelCase and loose types; normalize and filter here
    # so the portal only ever sees one clean shape.
    for item in response.json().get("items", []):
        if item.get("mimeType") not in ALLOWED_CONTENT_TYPES:
            rejected += 1
            log.warning(
                "rejected document type",
                extra={"fields": {"doc_id": item.get("docId"), "mime": item.get("mimeType")}},
            )
            continue
        documents.append(
            Document(
                document_id=str(item["docId"]),
                filename=item["fileName"],
                content_type=item["mimeType"],
                size_bytes=int(item["sizeBytes"]),
                created_at=item["createdAt"],
            )
        )

    return DocumentList(request_id=request_id, documents=documents, rejected_count=rejected)
