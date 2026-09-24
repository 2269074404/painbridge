from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool
from .. import ai, forecast
from ..db import get_db
from ..deps import PatientUser, oid
from ..models import ChatIn
from .diary import entries_for
from .patients import load_profile

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


def _trim(messages: list[dict]) -> list[dict]:
    return [m for m in messages if isinstance(m, dict)][-12:]


@router.post("/trial-guide")
async def trial_guide(body: ChatIn, user: PatientUser):
    ctx = None
    if body.trialId:
        t = await get_db().trials.find_one({"_id": oid(body.trialId)})
        if t:
            ctx = {k: t.get(k) for k in ("shortTitle", "phase", "interventionType", "intervention", "placebo",
                                          "durationWeeks", "visits", "remoteVisits", "travelSupport",
                                          "compensation", "summary", "whatToExpect")}
    return {"reply": await run_in_threadpool(ai.chat_trial_guide, _trim(body.messages), ctx)}


@router.post("/pain-coach")
async def pain_coach(body: ChatIn, user: PatientUser):
    profile = await load_profile(user["_id"]) or {}
    fc = await run_in_threadpool(forecast.forecast, await entries_for(user["_id"]))
    ctx = {
        "primaryCondition": profile.get("primaryCondition"),
        "avgPain": profile.get("avgPain"),
        "currentTreatments": profile.get("currentTreatments"),
    }
    if fc.get("ready"):
        ctx["forecastNext7Days"] = [round(d["mean"], 1) for d in fc["forecast"]]
        ctx["flareRisk7d"] = fc["flareRisk7d"]
        ctx["topDiaryFactors"] = [f"{d['label']} {d['direction']} pain" for d in fc["drivers"][:3]]
    return {"reply": await run_in_threadpool(ai.chat_pain_coach, _trim(body.messages), ctx)}
