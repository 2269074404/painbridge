from fastapi import APIRouter, HTTPException, status
from ..db import get_db
from ..deps import CurrentUser
from ..models import LoginIn, SignupIn
from ..security import create_token, hash_password, verify_password
from . import now, public_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/signup")
async def signup(body: SignupIn):
    db = get_db()
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="An account with this email already exists")
    doc = {
        "email": email,
        "passwordHash": hash_password(body.password),
        "role": body.role,
        "legalName": body.legalName.strip(),
        "createdAt": now(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {"token": create_token(str(res.inserted_id), body.role), "user": public_user(doc)}


@router.post("/login")
async def login(body: LoginIn):
    user = await get_db().users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["passwordHash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return {"token": create_token(str(user["_id"]), user["role"]), "user": public_user(user)}


@router.get("/me")
async def me(user: CurrentUser):
    return public_user(user)


@router.post("/logout")
async def logout():
    return {"ok": True}
