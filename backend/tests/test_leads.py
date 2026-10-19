import json

import pytest

from tests._money_app import make_client
from app.routers.money_models import Lead


def _lead(**over):
    body = {
        "kind": "finance",
        "name": "Nimal Silva",
        "phone": "077 123 4567",
        "budget_lkr": 6500000,
        "vehicle": "Toyota Aqua 2014",
        "listing_id": 42,
        "consent": True,
        "consent_version": "finance-v1",
    }
    body.update(over)
    return body


@pytest.fixture(autouse=True)
def _partners(monkeypatch):
    monkeypatch.setenv(
        "LEADS_PARTNERS_JSON",
        json.dumps({"finance": [{"id": "leasing-a", "name": "Leasing A PLC"}], "insurance": [
            {"id": "broker-x", "name": "Broker X (Pvt) Ltd", "licence": "IRCSL reg. no. TBC"}]}),
    )
    monkeypatch.setenv("LEADS_DELIVERY_ENABLED", "false")


def test_create_finance_lead_stores_consent_and_routing():
    client, Session = make_client()
    res = client.post("/api/v1/leads", json=_lead())
    assert res.status_code == 201, res.text
    assert res.json()["routedTo"] == ["leasing-a"]
    lead = Session().query(Lead).one()
    assert lead.phone == "0771234567"
    assert lead.consent_at is not None
    assert "leasing or finance partner" in lead.consent_text
    assert lead.ip_hash and "127" not in lead.ip_hash


def test_consent_required_and_version_must_match_kind():
    client, Session = make_client()
    assert client.post("/api/v1/leads", json=_lead(consent=False)).status_code == 422
    assert client.post("/api/v1/leads", json=_lead(consent_version="insurance-v1")).status_code == 422
    assert Session().query(Lead).count() == 0


def test_honeypot_pretends_success_but_stores_nothing():
    client, Session = make_client()
    res = client.post("/api/v1/leads", json=_lead(website="http://spam"))
    assert res.status_code == 201
    assert Session().query(Lead).count() == 0


def test_invalid_phone_rejected():
    client, _ = make_client()
    assert client.post("/api/v1/leads", json=_lead(phone="12345")).status_code == 422


def test_duplicate_within_24h_returns_same_reference():
    client, Session = make_client()
    a = client.post("/api/v1/leads", json=_lead()).json()
    b = client.post("/api/v1/leads", json=_lead()).json()
    assert a["reference"] == b["reference"]
    assert Session().query(Lead).count() == 1


def test_rate_limited():
    client, _ = make_client()
    codes = [client.post("/api/v1/leads", json=_lead(listing_id=i + 1)).status_code for i in range(7)]
    assert codes[:5] == [201] * 5
    assert 429 in codes[5:]


def test_inspection_and_insurance_kinds():
    client, _ = make_client()
    r1 = client.post("/api/v1/leads", json=_lead(kind="inspection", consent_version="inspection-v1", preferred_date="2026-11-02"))
    r2 = client.post("/api/v1/leads", json=_lead(kind="insurance", consent_version="insurance-v1"))
    assert r1.status_code == 201 and r2.status_code == 201
    assert r2.json()["routedTo"] == ["broker-x"]
    partners = client.get("/api/v1/leads/partners", params={"kind": "insurance"}).json()
    assert partners["partners"][0]["licence"] == "IRCSL reg. no. TBC"
    assert "insurance-v1" in partners["consent"]


def test_admin_list_and_export_require_admin():
    client, _ = make_client(role="user")
    client.post("/api/v1/leads", json=_lead())
    assert client.get("/api/v1/leads/admin").status_code == 403
    assert client.get("/api/v1/leads/admin/export.csv").status_code == 403


def test_admin_list_export_and_status_update():
    client, _ = make_client(role="admin")
    client.post("/api/v1/leads", json=_lead(name="=HYPERLINK(evil)"))
    listed = client.get("/api/v1/leads/admin").json()
    assert listed["count"] == 1
    csv_text = client.get("/api/v1/leads/admin/export.csv").text
    assert csv_text.splitlines()[0].startswith("id,created_at,kind")
    assert "'=HYPERLINK" in csv_text  # formula injection neutralised
    lead_id = listed["items"][0]["id"]
    assert client.patch(f"/api/v1/leads/admin/{lead_id}", json={"status": "contacted"}).json()["status"] == "contacted"
