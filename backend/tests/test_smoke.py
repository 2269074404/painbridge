"""End-to-end smoke test on the in-memory DB with AI fallbacks (no gateway key).

Run from backend/:  python -m pytest -q tests
"""

import os

os.environ["MONGODB_URI"] = ""
os.environ["LITELLM_TOKEN"] = ""

from datetime import date, timedelta  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402


def _login(c: TestClient, email: str) -> dict:
    r = c.post("/api/v1/auth/login", json={"email": email, "password": "demo1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_end_to_end():
    with TestClient(app) as c:
        assert c.get("/healthz").json()["status"] == "ok"
        meta = c.get("/api/v1/meta").json()
        assert "Fibromyalgia" in meta["conditions"]

        # --- patient: deck, match, swipe, refer
        p = _login(c, "patient@painbridge.demo")
        deck = c.get("/api/v1/patients/me/trials", headers=p).json()
        assert deck and deck[0]["eligibility"]["status"] == "likely"
        statuses = {d["trial"]["shortTitle"]: d["eligibility"]["status"] for d in deck}
        assert statuses["Low-dose naltrexone for fibromyalgia & CRPS"] == "possible"  # hybrid, nearest site ~70 mi
        assert statuses["Digital CBT app for fibromyalgia"] == "likely"  # fully remote
        assert statuses["Anti-CGRP antibody for chronic migraine"] == "unlikely"
        top = deck[0]["trial"]["id"]
        m = c.get(f"/api/v1/patients/me/trials/{top}/match", headers=p).json()
        assert 0 <= m["match"]["score"] <= 100 and m["match"]["reasons"]
        assert c.post("/api/v1/patients/me/swipes", json={"trialId": top, "decision": "interested"}, headers=p).status_code == 200
        saved = c.get("/api/v1/patients/me/saved", headers=p).json()
        assert len(saved) == 1 and saved[0]["referral"] is None
        r = c.post("/api/v1/patients/me/referrals", json={"trialId": top, "consentToShare": True}, headers=p)
        assert r.status_code == 200, r.text
        assert c.post("/api/v1/patients/me/referrals", json={"trialId": top, "consentToShare": True}, headers=p).status_code == 409

        # --- diary, forecast, plan, chat
        today = date.today().isoformat()
        entry = {"date": today, "pain": 7, "sleepHours": 5, "sleepQuality": 3, "mood": 4, "stress": 7,
                 "activityMinutes": 120, "rescueMeds": True, "triggers": ["Overexertion"]}
        assert c.post("/api/v1/diary", json=entry, headers=p).status_code == 200
        future = {**entry, "date": (date.today() + timedelta(days=2)).isoformat()}
        assert c.post("/api/v1/diary", json=future, headers=p).status_code == 422
        fc = c.get("/api/v1/diary/forecast", headers=p).json()
        assert fc["ready"] and fc["model"] == "personalized" and len(fc["forecast"]) == 7
        assert any(s["label"].startswith("Pace activity") for s in fc["scenarios"])
        plan = c.get("/api/v1/diary/plan", headers=p).json()
        assert "## Flare plan" in plan["markdown"]
        reply = c.post("/api/v1/chat/pain-coach", json={"messages": [{"role": "user", "content": "flare today"}]}, headers=p).json()
        assert reply["reply"]
        crisis = c.post("/api/v1/chat/trial-guide", json={"messages": [{"role": "user", "content": "I want to end my life"}]}, headers=p).json()
        assert "988" in crisis["reply"]

        # --- coordinator: pipeline, prescreen, notes, status -> enrollment count
        k = _login(c, "coordinator@painbridge.demo")
        rows = c.get("/api/v1/coordinator/referrals", headers=k).json()
        assert len(rows) == 13
        mine = next(x for x in rows if x["trial"]["id"] == top and x["status"] == "New" and x["patient"]["initials"] == "AM")
        detail = c.get(f"/api/v1/coordinator/referrals/{mine['id']}", headers=k).json()
        assert detail["contact"]["email"] == "patient@painbridge.demo" and detail["diaryHistory"]
        brief = c.post(f"/api/v1/coordinator/referrals/{mine['id']}/prescreen", headers=k).json()
        assert brief["summary"]
        c.post(f"/api/v1/coordinator/referrals/{mine['id']}/notes", json={"text": "Called, interested."}, headers=k)
        assert "## Next step" in c.post(f"/api/v1/coordinator/referrals/{mine['id']}/notes/summary", headers=k).json()["markdown"]
        before = c.get(f"/api/v1/trials/{top}").json()["enrolled"]
        d2 = c.patch(f"/api/v1/coordinator/referrals/{mine['id']}", json={"status": "Enrolled"}, headers=k).json()
        assert d2["status"] == "Enrolled" and d2["timeline"][-1]["status"] == "Enrolled"
        assert c.get(f"/api/v1/trials/{top}").json()["enrolled"] == before + 1
        ov = c.get("/api/v1/coordinator/overview", headers=k).json()
        assert len(ov["funnel"]) == 8 and ov["representation"]["sex"]["referred"]

        # --- role guard
        assert c.get("/api/v1/coordinator/referrals", headers=p).status_code == 403
        assert c.get("/api/v1/diary/forecast", headers=k).status_code == 403
