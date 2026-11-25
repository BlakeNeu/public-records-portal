import json

import httpx
import respx

URL = "http://notify.test/messages"
BODY = {
    "request_id": "REQ-2026-0001",
    "recipient_email": "pat.citizen@example.com",
    "recipient_name": "Pat Citizen",
    "new_status": "in_review",
    "due_at": "2026-12-10T17:00:00Z",
}


@respx.mock
def test_transforms_event_into_gateway_payload(client, auth_headers):
    route = respx.post(URL).mock(return_value=httpx.Response(200, json={"message_id": "m-1"}))

    r = client.post("/v1/notifications/status-change", json=BODY, headers=auth_headers)

    assert r.status_code == 202
    assert r.json() == {"delivery_id": "m-1", "channel": "email"}
    sent = json.loads(route.calls.last.request.content)
    assert sent["template"] == "records_request_status"
    assert sent["variables"]["status_label"] == "In review"
    assert sent["variables"]["due_date"] == "2026-12-10"


@respx.mock
def test_retries_transient_failures(client, auth_headers):
    route = respx.post(URL).mock(
        side_effect=[
            httpx.Response(503),
            httpx.Response(503),
            httpx.Response(200, json={"message_id": "m-2"}),
        ]
    )

    r = client.post("/v1/notifications/status-change", json=BODY, headers=auth_headers)

    assert r.status_code == 202
    assert route.call_count == 3


@respx.mock
def test_gives_up_with_502_after_max_attempts(client, auth_headers):
    route = respx.post(URL).mock(return_value=httpx.Response(503))

    r = client.post("/v1/notifications/status-change", json=BODY, headers=auth_headers)

    assert r.status_code == 502
    assert r.json() == {"detail": "notify unavailable"}
    assert route.call_count == 3


@respx.mock
def test_does_not_retry_client_errors(client, auth_headers):
    route = respx.post(URL).mock(return_value=httpx.Response(400))

    client.post("/v1/notifications/status-change", json=BODY, headers=auth_headers)

    assert route.call_count == 1


def test_rejects_unknown_fields_and_bad_status(client, auth_headers):
    bad = {**BODY, "new_status": "deleted", "is_admin": True}
    r = client.post("/v1/notifications/status-change", json=bad, headers=auth_headers)
    assert r.status_code == 422
