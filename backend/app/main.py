import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from . import ai
from .config import settings
from .db import ping
from .forecast import model_card
from .routes import auth, chat, coordinator, diary, patients, trials
from .seed import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await seed_if_empty()
    except Exception as e:
        print(f"[startup] seed skipped: {e}")
    # Train the population forecasting model and probe the AI gateway in the background
    # so the first requests are fast.
    asyncio.create_task(run_in_threadpool(model_card))
    asyncio.create_task(run_in_threadpool(ai.warm_up))
    if settings.in_memory:
        print("[startup] MONGODB_URI not set, so running on an in-memory database (data resets on restart)")
    yield


app = FastAPI(title="PainBridge API", version="0.1.0", lifespan=lifespan)
for r in (auth.router, patients.router, diary.router, trials.router, coordinator.router, chat.router):
    app.include_router(r)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    try:
        await ping()
        return {"status": "ok", "db": "memory" if settings.in_memory else "connected", "ai": bool(settings.LITELLM_TOKEN)}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "degraded", "db": "disconnected", "error": str(e)})
