import httpx
import respx

DMS_ITEMS = {
    "items": [
        {
            "docId": 101,
            "fileName": "incident-report.pdf",
            "mimeType": "application/pdf",
            "sizeBytes": "20480",
            "createdAt": "2026-11-01T10:00:00Z",
        },
        {
            "docId": 102,
            "fileName": "macro.exe",
            "mimeType": "application/x-msdownload",
            "sizeBytes": "999",
            "createdAt": "2026-11-01T10:05:00Z",
        },
    ]
}


@respx.mock
def test_normalizes_and_filters_documents(client, auth_headers):
    respx.get("http://dms.test/cases/REQ-1/documents").mock(
        return_value=httpx.Response(200, json=DMS_ITEMS)
    )

    r = client.get("/v1/requests/REQ-1/documents", headers=auth_headers)

    assert r.status_code == 200
    data = r.json()
    assert data["rejected_count"] == 1
    assert data["documents"] == [
        {
            "document_id": "101",
            "filename": "incident-report.pdf",
            "content_type": "application/pdf",
            "size_bytes": 20480,
            "created_at": "2026-11-01T10:00:00Z",
        }
    ]


@respx.mock
def test_upstream_404_passes_through(client, auth_headers):
    respx.get("http://dms.test/cases/REQ-404/documents").mock(return_value=httpx.Response(404))
    r = client.get("/v1/requests/REQ-404/documents", headers=auth_headers)
    assert r.status_code == 404


def test_rejects_path_traversal_ids(client, auth_headers):
    r = client.get("/v1/requests/..%2F..%2Fetc/documents", headers=auth_headers)
    assert r.status_code in (404, 422)
