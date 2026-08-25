import os
import uuid
import secrets
from datetime import datetime, timezone, timedelta

import bcrypt
import requests
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel, EmailStr

from deps import db, get_current_user

router = APIRouter(prefix="/api/auth")

SESSION_DAYS = 7
COOKIE_MAX_AGE = SESSION_DAYS * 24 * 60 * 60


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key="session_token", value=token, httponly=True, secure=True,
        samesite="none", max_age=COOKIE_MAX_AGE, path="/",
    )


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(48)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        "created_at": datetime.now(timezone.utc),
    })
    return token


def public_user(user: dict) -> dict:
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name", ""),
        "picture": user.get("picture"),
        "auth_provider": user.get("auth_provider", "email"),
    }


class RegisterBody(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginBody(BaseModel):
    email: EmailStr
    password: str


@router.post("/register")
async def register(body: RegisterBody, response: Response):
    email = body.email.lower().strip()
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "picture": None,
        "auth_provider": "email",
        "profile": {},
        "created_at": datetime.now(timezone.utc),
    })
    token = await create_session(user_id)
    set_session_cookie(response, token)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": public_user(user), "token": token}


@router.post("/login")
async def login(body: LoginBody, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    now = datetime.now(timezone.utc)

    if user:
        locked_until = user.get("locked_until")
        if locked_until:
            if isinstance(locked_until, str):
                locked_until = datetime.fromisoformat(locked_until)
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if locked_until > now:
                raise HTTPException(status_code=423, detail="Account temporarily locked due to failed attempts. Try again later.")

    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        if user:
            attempts = user.get("failed_attempts", 0) + 1
            update = {"failed_attempts": attempts}
            if attempts >= 5:
                update["locked_until"] = now + timedelta(minutes=15)
                update["failed_attempts"] = 0
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"failed_attempts": 0, "locked_until": None}})
    token = await create_session(user["user_id"])
    set_session_cookie(response, token)
    return {"user": public_user(user), "token": token}


@router.post("/google/session")
async def google_session(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        body = {}
        try:
            body = await request.json()
        except Exception:
            pass
        session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")

    resp = requests.get(
        "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
        headers={"X-Session-ID": session_id}, timeout=30,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Failed to verify Google session")
    data = resp.json()
    email = data["email"].lower().strip()

    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing.get("name")), "picture": data.get("picture")}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", ""),
            "picture": data.get("picture"),
            "password_hash": None,
            "auth_provider": "google",
            "profile": {},
            "created_at": datetime.now(timezone.utc),
        })

    token = data.get("session_token") or secrets.token_urlsafe(48)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        "created_at": datetime.now(timezone.utc),
    })
    set_session_cookie(response, token)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": public_user(user), "token": token}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}
