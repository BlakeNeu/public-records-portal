import os

# Must be set before the app module is imported.
os.environ.setdefault("SERVICE_TOKEN", "test-token-" + "x" * 32)
os.environ.setdefault("DMS_BASE_URL", "http://dms.test")
os.environ.setdefault("NOTIFY_BASE_URL", "http://notify.test")
os.environ.setdefault("RETRY_BACKOFF_SECONDS", "0")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

TOKEN = os.environ["SERVICE_TOKEN"]


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {TOKEN}"}
