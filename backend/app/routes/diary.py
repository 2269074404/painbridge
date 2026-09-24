from datetime import date, timedelta
import numpy as np
from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool
from .. import ai, forecast
from ..db import get_db
from ..deps import PatientUser
from ..models import DiaryEntryIn
from . import now
from .patients import load_profile

router = APIRouter(prefix="/api/v1/diary", tags=["diary"])


async def entries_for(user_id, limit: int = 120) -> list[dict]:
    cur = get_db().diary.find({"userId": user_id}, {"_id": 0, "userId": 0}).sort("date", -1).limit(limit)
    return list(reversed([e async for e in cur]))


@router.get("")
async def list_entries(user: PatientUser):
    return await entries_for(user["_id"])


@router.post("")
async def upsert_entry(body: DiaryEntryIn, user: PatientUser):
    if date.fromisoformat(body.date) > date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Can't log a future day")
    doc = {**body.model_dump(), "userId": user["_id"], "updatedAt": now()}
    await get_db().diary.update_one({"userId": user["_id"], "date": body.date}, {"$set": doc}, upsert=True)
    return {"ok": True}


@router.delete("/{day}")
async def delete_entry(day: str, user: PatientUser):
    await get_db().diary.delete_one({"userId": user["_id"], "date": day})
    return {"ok": True}


@router.post("/demo-fill")
async def demo_fill(user: PatientUser):
    """Fill the last 45 days with a synthetic diary so the forecast can be explored immediately."""
    profile = await load_profile(user["_id"])
    rng = np.random.default_rng(int(str(user["_id"]), 16) % 2**32)
    baseline = float(profile.get("avgPain")) if profile else None
    fake = forecast.simulate_patient(rng, days=45, start=date.today() - timedelta(days=45), baseline=baseline)
    db = get_db()
    for e in fake:
        await db.diary.update_one(
            {"userId": user["_id"], "date": e["date"]},
            {"$setOnInsert": {**e, "userId": user["_id"], "updatedAt": now(), "synthetic": True}},
            upsert=True,
        )
    return {"ok": True, "added": len(fake)}


@router.get("/forecast")
async def get_forecast(user: PatientUser):
    return await run_in_threadpool(forecast.forecast, await entries_for(user["_id"]))


@router.get("/model-card")
async def get_model_card():
    return await run_in_threadpool(forecast.model_card)


@router.get("/plan")
async def get_plan(user: PatientUser, refresh: bool = False):
    db = get_db()
    entries = await entries_for(user["_id"])
    fc = await run_in_threadpool(forecast.forecast, entries)
    if not fc.get("ready"):
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"Log {fc['entriesNeeded']} more day(s) to unlock your plan")
    version = entries[-1]["date"]
    cached = await db.plans.find_one({"userId": user["_id"]})
    if cached and cached.get("version") == version and not refresh:
        return {"markdown": cached["markdown"], "version": version}
    profile = await load_profile(user["_id"]) or {}
    md = await run_in_threadpool(ai.management_plan, profile, fc)
    await db.plans.update_one(
        {"userId": user["_id"]},
        {"$set": {"userId": user["_id"], "markdown": md, "version": version, "createdAt": now()}},
        upsert=True,
    )
    return {"markdown": md, "version": version}
