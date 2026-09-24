from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool
from .. import ai
from ..db import get_db
from ..deps import PatientUser, oid
from ..domain import CITIES, evaluate_eligibility
from ..models import PatientProfileIn, ReferralIn, SwipeIn
from . import now, ser

router = APIRouter(prefix="/api/v1/patients", tags=["patients"])

_STATUS_RANK = {"likely": 0, "possible": 1, "unlikely": 2}


async def load_profile(user_id) -> dict | None:
    return await get_db().profiles.find_one({"userId": user_id})


async def _require_profile(user: dict) -> dict:
    profile = await load_profile(user["_id"])
    if not profile:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Complete your health profile first")
    return profile


@router.get("/me/profile")
async def get_profile(user: PatientUser):
    return ser(await load_profile(user["_id"]))


@router.put("/me/profile")
async def put_profile(body: PatientProfileIn, user: PatientUser):
    if body.city not in CITIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown city")
    if body.primaryCondition not in body.painConditions:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Primary condition must be one of your conditions")
    doc = {**body.model_dump(), "userId": user["_id"], "updatedAt": now()}
    await get_db().profiles.update_one({"userId": user["_id"]}, {"$set": doc}, upsert=True)
    # Answers changed, so cached AI match scores are stale.
    await get_db().matches.delete_many({"patientId": user["_id"]})
    return ser(await load_profile(user["_id"]))


@router.get("/me/trials")
async def trial_deck(user: PatientUser):
    """Recruiting trials the patient hasn't swiped on yet, ranked by rule-based fit.

    Uses the instant rule-based score; the card fetches the AI score lazily via /match.
    """
    db = get_db()
    profile = await _require_profile(user)
    swiped = {s["trialId"] async for s in db.swipes.find({"patientId": user["_id"]})}
    out = []
    async for t in db.trials.find({"status": "Recruiting"}):
        if str(t["_id"]) in swiped:
            continue
        elig = evaluate_eligibility(profile, t)
        out.append({"trial": ser(t), "eligibility": elig, "match": ai._heuristic_match(profile, t, elig)})
    out.sort(key=lambda r: (_STATUS_RANK[r["eligibility"]["status"]], -r["match"]["score"]))
    return out


async def cached_match(profile: dict, trial: dict) -> dict:
    db = get_db()
    key = {"patientId": profile["userId"], "trialId": str(trial["_id"])}
    hit = await db.matches.find_one(key)
    if hit:
        return hit["result"]
    elig = evaluate_eligibility(profile, trial)
    result = await run_in_threadpool(ai.score_trial_match, profile, trial, elig)
    # Only cache real AI scores so rule-based fallbacks get upgraded once the gateway is back.
    if result.get("source") == "ai":
        await db.matches.update_one(key, {"$set": {**key, "result": result, "createdAt": now()}}, upsert=True)
    return result


@router.get("/me/trials/{trial_id}/match")
async def trial_match(trial_id: str, user: PatientUser):
    profile = await _require_profile(user)
    trial = await get_db().trials.find_one({"_id": oid(trial_id)})
    if not trial:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Trial not found")
    return {"eligibility": evaluate_eligibility(profile, trial), "match": await cached_match(profile, trial)}


@router.post("/me/swipes")
async def swipe(body: SwipeIn, user: PatientUser):
    db = get_db()
    if not await db.trials.find_one({"_id": oid(body.trialId)}):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Trial not found")
    key = {"patientId": user["_id"], "trialId": body.trialId}
    await db.swipes.update_one(key, {"$set": {**key, "decision": body.decision, "createdAt": now()}}, upsert=True)
    return {"ok": True}


@router.delete("/me/swipes")
async def reset_swipes(user: PatientUser):
    await get_db().swipes.delete_many({"patientId": user["_id"]})
    return {"ok": True}


@router.get("/me/saved")
async def saved_trials(user: PatientUser):
    db = get_db()
    profile = await _require_profile(user)
    referrals = {r["trialId"]: r async for r in db.referrals.find({"patientId": user["_id"]})}
    out = []
    async for s in db.swipes.find({"patientId": user["_id"], "decision": "interested"}):
        t = await db.trials.find_one({"_id": oid(s["trialId"])})
        if not t:
            continue
        ref = referrals.get(s["trialId"])
        out.append({
            "trial": ser(t),
            "eligibility": evaluate_eligibility(profile, t),
            "match": await cached_match(profile, t),
            "referral": ser(ref) if ref else None,
        })
    out.sort(key=lambda r: -r["match"]["score"])
    return out


@router.post("/me/referrals")
async def create_referral(body: ReferralIn, user: PatientUser):
    if not body.consentToShare:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Consent to share is required")
    db = get_db()
    profile = await _require_profile(user)
    trial = await db.trials.find_one({"_id": oid(body.trialId)})
    if not trial:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Trial not found")
    if await db.referrals.find_one({"patientId": user["_id"], "trialId": body.trialId}):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="You've already shared your profile with this study")
    elig = evaluate_eligibility(profile, trial)
    match = await cached_match(profile, trial)
    doc = {
        "patientId": user["_id"],
        "trialId": body.trialId,
        "coordinatorId": trial.get("coordinatorId"),
        "status": "New",
        "shareDiary": body.shareDiary,
        "eligibility": elig,
        "match": match,
        "notes": [],
        "timeline": [{"status": "New", "at": now().isoformat(), "by": "patient"}],
        "createdAt": now(),
    }
    res = await db.referrals.insert_one(doc)
    doc["_id"] = res.inserted_id
    return ser(doc)


@router.get("/me/referrals")
async def my_referrals(user: PatientUser):
    db = get_db()
    out = []
    async for r in db.referrals.find({"patientId": user["_id"]}).sort("createdAt", -1):
        t = await db.trials.find_one({"_id": oid(r["trialId"])})
        item = ser(r)
        item.pop("notes", None)  # internal coordinator notes stay internal
        item.pop("prescreen", None)
        item["trial"] = ser(t)
        out.append(item)
    return out
