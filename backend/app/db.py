from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from .config import settings

_client = None
_db: AsyncIOMotorDatabase | None = None


def get_client():
    global _client
    if _client is None:
        if settings.in_memory:
            # Demo mode: no Atlas URI configured, so keep everything in process memory.
            from mongomock_motor import AsyncMongoMockClient

            _client = AsyncMongoMockClient()
        else:
            _client = AsyncIOMotorClient(settings.MONGODB_URI, serverSelectionTimeoutMS=10000)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    global _db
    if _db is None:
        _db = get_client()[settings.MONGODB_DB]
    return _db


async def ping() -> bool:
    if settings.in_memory:
        return True
    await get_client().admin.command("ping")
    return True
