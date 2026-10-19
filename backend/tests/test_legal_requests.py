from datetime import datetime

from tests._money_app import make_client
from app.routers.money_models import LegalRequest


def _removal(**over):
    body = {
        "listing_url": "https://motormila.vercel.app/listing/123",
        "reason": "personal_data",
        "requester_role": "seller",
        "email": "seller@example.com",
        "confirm_accurate": True,
    }
    body.update(over)
    return body


def test_removal_request_has_72h_sla():
    client, Session = make_client()
    res = client.post("/api/v1/legal/removal", json=_removal())
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["reference"].startswith("MM-R")
    row = Session().query(LegalRequest).one()
    created = row.created_at.replace(tzinfo=None)
    assert round((row.due_at.replace(tzinfo=None) - created).total_seconds() / 3600) == 72
    assert datetime.fromisoformat(data["dueAt"])


def test_removal_validation_and_honeypot():
    client, Session = make_client()
    assert client.post("/api/v1/legal/removal", json=_removal(listing_url="not a url")).status_code == 422
    assert client.post("/api/v1/legal/removal", json=_removal(confirm_accurate=False)).status_code == 422
    assert client.post("/api/v1/legal/removal", json=_removal(email="nope")).status_code == 422
    assert client.post("/api/v1/legal/removal", json=_removal(website="x")).status_code == 201
    assert Session().query(LegalRequest).count() == 0


def test_account_deletion_request():
    client, Session = make_client()
    assert client.post("/api/v1/legal/account-deletion", json={"email": "a@b.lk", "confirm": False}).status_code == 422
    res = client.post("/api/v1/legal/account-deletion", json={"email": "A@B.lk", "confirm": True})
    assert res.status_code == 201 and res.json()["reference"].startswith("MM-D")
    assert Session().query(LegalRequest).one().email == "a@b.lk"


def test_admin_list_and_resolve():
    client, _ = make_client(role="admin")
    client.post("/api/v1/legal/removal", json=_removal())
    items = client.get("/api/v1/legal/admin/requests").json()["items"]
    assert items[0]["status"] == "open"
    done = client.patch(f"/api/v1/legal/admin/requests/{items[0]['id']}", json={"status": "actioned", "note": "hidden"})
    assert done.json()["status"] == "actioned" and done.json()["resolvedAt"]


def test_admin_endpoints_forbidden_for_users():
    client, _ = make_client(role="user")
    assert client.get("/api/v1/legal/admin/requests").status_code == 403
