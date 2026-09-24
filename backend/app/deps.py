from typing import Annotated
from fastapi import Depends, Header, HTTPException, status
from bson import ObjectId
from bson.errors import InvalidId
from .db import get_db
from .security import decode_token


async def get_current_user(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(None, 1)[1].strip() if " " in authorization else ""
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    try:
        payload = decode_token(token)
        user_id = ObjectId(payload.get("sub"))
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await get_db().users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]


def require_role(role: str):
    async def _dep(user: CurrentUser) -> dict:
        if user.get("role") != role:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"Requires {role} role")
        return user

    return _dep


PatientUser = Annotated[dict, Depends(require_role("patient"))]
CoordinatorUser = Annotated[dict, Depends(require_role("coordinator"))]


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
