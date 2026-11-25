from datetime import datetime
from enum import StrEnum

import httpx
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from ..auth import require_service_token
from ..config import Settings, get_settings
from ..upstream import call_upstream, get_http_client

router = APIRouter(prefix="/v1/notifications", dependencies=[Depends(require_service_token)])


class RequestStatus(StrEnum):
    SUBMITTED = "submitted"
    IN_REVIEW = "in_review"
    FULFILLED = "fulfilled"
    DENIED = "denied"


STATUS_LABELS = {
    RequestStatus.SUBMITTED: "Submitted",
    RequestStatus.IN_REVIEW: "In review",
    RequestStatus.FULFILLED: "Fulfilled",
    RequestStatus.DENIED: "Denied",
}


class StatusChangeNotification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(pattern=r"^[A-Za-z0-9-]{1,64}$")
    recipient_email: EmailStr
    recipient_name: str = Field(min_length=1, max_length=200)
    new_status: RequestStatus
    due_at: datetime | None = None


class NotificationAccepted(BaseModel):
    delivery_id: str
    channel: str = "email"


@router.post(
    "/status-change",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=NotificationAccepted,
)
async def send_status_change(
    body: StatusChangeNotification,
    client: httpx.AsyncClient = Depends(get_http_client),
    settings: Settings = Depends(get_settings),
) -> NotificationAccepted:
    # Translate the portal's domain event into the gateway's template format.
    gateway_payload = {
        "to": body.recipient_email,
        "template": "records_request_status",
        "variables": {
            "name": body.recipient_name,
            "request_id": body.request_id,
            "status_label": STATUS_LABELS[body.new_status],
            "due_date": body.due_at.date().isoformat() if body.due_at else None,
        },
    }
    response = await call_upstream(
        client,
        "POST",
        f"{settings.notify_base_url}/messages",
        upstream="notify",
        json=gateway_payload,
    )
    return NotificationAccepted(delivery_id=response.json()["message_id"])
