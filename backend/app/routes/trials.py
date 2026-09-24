from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool
from .. import ai
from ..db import get_db
from ..deps import CoordinatorUser, oid
from ..domain import BARRIERS, CITIES, COMORBIDITIES, CONDITIONS, INTERVENTION_TYPES, REFERRAL_STATUSES, TREATMENTS, TRIGGERS
from ..models import LaySummaryIn, TrialIn, TrialPatch
from . import now, ser

router = APIRouter(prefix="/api/v1", tags=["trials"])


@router.get("/meta")
async def meta():
    return {
        "conditions": CONDITIONS,
        "treatments": TREATMENTS,
        "comorbidities": COMORBIDITIES,
        "interventionTypes": INTERVENTION_TYPES,
        "barriers": BARRIERS,
        "triggers": TRIGGERS,
        "cities": list(CITIES),
        "referralStatuses": REFERRAL_STATUSES,
    }


@router.get("/trials")
async def list_trials():
    return [ser(t) async for t in get_db().trials.find().sort("createdAt", 1)]


@router.get("/trials/{trial_id}")
async def get_trial(trial_id: str):
    t = await get_db().trials.find_one({"_id": oid(trial_id)})
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Trial not found")
    return ser(t)


@router.post("/trials")
async def create_trial(body: TrialIn, user: CoordinatorUser):
    for s in body.sites:
        if s.city not in CITIES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown site city: {s.city}")
    count = await get_db().trials.count_documents({})
    doc = {
        **body.model_dump(),
        "protocolId": f"PB-DEMO-{count + 1:03d}",
        "enrolled": 0,
        "coordinatorId": user["_id"],
        "createdAt": now(),
    }
    res = await get_db().trials.insert_one(doc)
    doc["_id"] = res.inserted_id
    return ser(doc)


@router.patch("/trials/{trial_id}")
async def patch_trial(trial_id: str, body: TrialPatch, user: CoordinatorUser):
    db = get_db()
    t = await db.trials.find_one({"_id": oid(trial_id), "coordinatorId": user["_id"]})
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Trial not found")
    changes = body.model_dump(exclude_none=True)
    if changes:
        await db.trials.update_one({"_id": t["_id"]}, {"$set": changes})
    return ser(await db.trials.find_one({"_id": t["_id"]}))


@router.post("/trials/lay-summary")
async def lay_summary(body: LaySummaryIn, user: CoordinatorUser):
    return await run_in_threadpool(ai.generate_lay_summary, body.protocolNotes, body.trial)
