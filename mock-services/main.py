"""Fake third-party systems for local development.

/dms     - a legacy document-management system (camelCase, string numbers)
/notify  - an email/SMS gateway

MOCK_FAILURE_RATE makes a share of calls return 503 so the integration
service's retry logic gets exercised. All data is fake.
"""

import hashlib
import logging
import os
import random
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI, HTTPException, Request

FAILURE_RATE = float(os.getenv("MOCK_FAILURE_RATE", "0.2"))
log = logging.getLogger("uvicorn.error")

app = FastAPI(title="Mock upstream systems")

SAMPLE_FILES = [
    ("incident-report.pdf", "application/pdf"),
    ("site-photo.jpg", "image/jpeg"),
    ("email-export.txt", "text/plain"),
    ("budget-sheet.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"),  # gets filtered
]


def maybe_fail() -> None:
    if random.random() < FAILURE_RATE:  # noqa: S311 - not security sensitive
        raise HTTPException(status_code=503, detail="simulated outage")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/dms/cases/{case_id}/documents")
def dms_documents(case_id: str):
    maybe_fail()
    if case_id.upper().startswith("MISSING"):
        raise HTTPException(status_code=404)

    # Deterministic per case so repeated calls return the same documents.
    seed = int(hashlib.sha256(case_id.encode()).hexdigest(), 16)
    rng = random.Random(seed)  # noqa: S311
    count = rng.randint(1, len(SAMPLE_FILES))
    base = datetime(2026, 1, 1, tzinfo=UTC)
    items = [
        {
            "docId": 1000 + i,
            "fileName": name,
            "mimeType": mime,
            "sizeBytes": str(rng.randint(2_000, 900_000)),
            "createdAt": (base + timedelta(days=rng.randint(0, 300))).isoformat(),
        }
        for i, (name, mime) in enumerate(rng.sample(SAMPLE_FILES, count))
    ]
    return {"caseId": case_id, "items": items}


@app.post("/notify/messages")
async def notify(request: Request):
    maybe_fail()
    payload = await request.json()
    message_id = str(uuid.uuid4())
    log.info("mock notify: to=%s template=%s id=%s", payload.get("to"), payload.get("template"), message_id)
    return {"message_id": message_id, "queued_at": datetime.now(UTC).isoformat()}
