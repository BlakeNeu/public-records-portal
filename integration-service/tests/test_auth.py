def test_health_needs_no_token(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_missing_token_rejected(client):
    assert client.get("/v1/requests/REQ-1/documents").status_code == 401


def test_wrong_token_rejected(client):
    r = client.get("/v1/requests/REQ-1/documents", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_docs_disabled_by_default(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
