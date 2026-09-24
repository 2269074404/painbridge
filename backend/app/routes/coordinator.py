from collections import Counter
from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool
from .. import ai, forecast
from ..db import get_db
from ..deps import CoordinatorUser, oid
from ..domain import REFERRAL_STATUSES, evaluate_eligibility
from ..models import NoteIn, ReferralPatch
from . import now, ser
from .diary import entries_for
from .patients import load_profile

router = APIRouter(prefix="/api/v1/coordinator", tags=["coordinator"])


def _initials(name: str) -> str:
    return "".join(p[0].upper() for p in (name or "?").split()[:2]) or "?"


def _age_band(age: int | None) -> str:
    if not age:
        return "Unknown"
    if age < 35:
        return "18-34"
    if age < 50:
        return "35-49"
    if age < 65:
        return "50-64"
    return "65+"


async def _owned_referral(ref_id: str, user: dict) -> dict:
    ref = await get_db().referrals.find_one({"_id": oid(ref_id), "coordinatorId": user["_id"]})
    if not ref:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Referral not found")
    return ref


async def _row(ref: dict) -> dict:
    db = get_db()
    patient = await db.users.find_one({"_id": ref["patientId"]}) or {}
    profile = await load_profile(ref["patientId"]) or {}
    trial = await db.trials.find_one({"_id": oid(ref["trialId"])}) or {}
    diary = None
    if ref.get("shareDiary"):
        diary = forecast.diary_summary(await entries_for(ref["patientId"], limit=60))
    return {
        "id": str(ref["_id"]),
        "status": ref["status"],
        "createdAt": ser(ref)["createdAt"],
        "screeningVisitAt": ref.get("screeningVisitAt"),
        "patient": {
            "initials": _initials(patient.get("legalName", "")),
            "age": profile.get("age"),
            "sex": profile.get("sex"),
            "city": profile.get("city"),
            "primaryCondition": profile.get("primaryCondition"),
            "avgPain": profile.get("avgPain"),
        },
        "trial": {"id": ref["trialId"], "shortTitle": trial.get("shortTitle"), "protocolId": trial.get("protocolId")},
        "eligibilityStatus": (ref.get("eligibility") or {}).get("status"),
        "matchScore": (ref.get("match") or {}).get("score"),
        "barriers": (ref.get("match") or {}).get("barriers", []),
        "diary": diary,
    }


@router.get("/referrals")
async def list_referrals(user: CoordinatorUser):
    cur = get_db().referrals.find({"coordinatorId": user["_id"]}).sort("createdAt", -1)
    return [await _row(r) async for r in cur]


@router.get("/referrals/{ref_id}")
async def referral_detail(ref_id: str, user: CoordinatorUser):
    db = get_db()
    ref = await _owned_referral(ref_id, user)
    row = await _row(ref)
    profile = await load_profile(ref["patientId"]) or {}
    trial = await db.trials.find_one({"_id": oid(ref["trialId"])}) or {}
    patient = await db.users.find_one({"_id": ref["patientId"]}) or {}
    diary_history = []
    if ref.get("shareDiary"):
        diary_history = [{"date": e["date"], "pain": e["pain"]} for e in await entries_for(ref["patientId"], limit=42)]
    profile_out = ser(profile) or {}
    profile_out.pop("userId", None)
    return {
        **row,
        # The patient explicitly consented to share contact info with this study team.
        "contact": {"name": patient.get("legalName"), "email": patient.get("email")},
        "profile": profile_out,
        "eligibility": evaluate_eligibility(profile, trial) if profile and trial else ref.get("eligibility"),
        "match": ref.get("match"),
        "prescreen": ref.get("prescreen"),
        "notes": [{**n, "createdAt": str(n.get("createdAt"))} for n in ref.get("notes", [])],
        "timeline": ref.get("timeline", []),
        "diaryHistory": diary_history,
    }


@router.post("/referrals/{ref_id}/prescreen")
async def run_prescreen(ref_id: str, user: CoordinatorUser):
    db = get_db()
    ref = await _owned_referral(ref_id, user)
    profile = await load_profile(ref["patientId"]) or {}
    trial = await db.trials.find_one({"_id": oid(ref["trialId"])}) or {}
    elig = evaluate_eligibility(profile, trial)
    diary = forecast.diary_summary(await entries_for(ref["patientId"], limit=60)) if ref.get("shareDiary") else None
    brief = await run_in_threadpool(ai.prescreen_brief, profile, trial, elig, diary)
    await db.referrals.update_one({"_id": ref["_id"]}, {"$set": {"prescreen": brief}})
    return brief


@router.patch("/referrals/{ref_id}")
async def update_referral(ref_id: str, body: ReferralPatch, user: CoordinatorUser):
    db = get_db()
    ref = await _owned_referral(ref_id, user)
    changes: dict = {}
    push = None
    if body.status and body.status != ref["status"]:
        if body.status not in REFERRAL_STATUSES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown status")
        changes["status"] = body.status
        push = {"timeline": {"status": body.status, "at": now().isoformat(), "by": user["email"]}}
        was_enrolled, now_enrolled = ref["status"] == "Enrolled", body.status == "Enrolled"
        if was_enrolled != now_enrolled:
            await db.trials.update_one({"_id": oid(ref["trialId"])}, {"$inc": {"enrolled": 1 if now_enrolled else -1}})
    if body.screeningVisitAt is not None:
        changes["screeningVisitAt"] = body.screeningVisitAt or None
    update: dict = {}
    if changes:
        update["$set"] = changes
    if push:
        update["$push"] = push
    if update:
        await db.referrals.update_one({"_id": ref["_id"]}, update)
    return await referral_detail(ref_id, user)


@router.post("/referrals/{ref_id}/notes")
async def add_note(ref_id: str, body: NoteIn, user: CoordinatorUser):
    ref = await _owned_referral(ref_id, user)
    note = {"text": body.text.strip(), "authorEmail": user["email"], "createdAt": now().isoformat()}
    await get_db().referrals.update_one({"_id": ref["_id"]}, {"$push": {"notes": note}})
    return note


@router.post("/referrals/{ref_id}/notes/summary")
async def notes_summary(ref_id: str, user: CoordinatorUser):
    ref = await _owned_referral(ref_id, user)
    return {"markdown": await run_in_threadpool(ai.summarize_notes, ref.get("notes", []))}


@router.get("/overview")
async def overview(user: CoordinatorUser):
    """Per-trial funnel plus a representation snapshot (referred vs. enrolled)."""
    db = get_db()
    trials = [t async for t in db.trials.find({"coordinatorId": user["_id"]})]
    refs = [r async for r in db.referrals.find({"coordinatorId": user["_id"]})]
    profiles = {p["userId"]: p async for p in db.profiles.find({"userId": {"$in": [r["patientId"] for r in refs]}})}

    funnel = []
    for t in trials:
        mine = [r for r in refs if r["trialId"] == str(t["_id"])]
        counts = Counter(r["status"] for r in mine)
        funnel.append({
            "trialId": str(t["_id"]),
            "shortTitle": t.get("shortTitle"),
            "protocolId": t.get("protocolId"),
            "status": t.get("status"),
            "enrolled": t.get("enrolled", 0),
            "target": t.get("targetEnrollment", 0),
            "counts": {s: counts.get(s, 0) for s in REFERRAL_STATUSES},
            "referrals": len(mine),
        })

    def breakdown(group: list[dict], key) -> dict:
        return dict(Counter(key(profiles.get(r["patientId"]) or {}) for r in group))

    enrolled = [r for r in refs if r["status"] == "Enrolled"]
    return {
        "funnel": funnel,
        "representation": {
            "sex": {"referred": breakdown(refs, lambda p: p.get("sex", "Unknown")),
                    "enrolled": breakdown(enrolled, lambda p: p.get("sex", "Unknown"))},
            "age": {"referred": breakdown(refs, lambda p: _age_band(p.get("age"))),
                    "enrolled": breakdown(enrolled, lambda p: _age_band(p.get("age")))},
            "travel": {"referred": breakdown(refs, lambda p: "Remote/long-distance" if (p.get("travelMiles") or 0) >= 50 else "Local"),
                       "enrolled": breakdown(enrolled, lambda p: "Remote/long-distance" if (p.get("travelMiles") or 0) >= 50 else "Local")},
        },
    }
