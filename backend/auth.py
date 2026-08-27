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
        key="session_token", value=token, httponly=True, secure=False,
        samesite="lax", max_age=COOKIE_MAX_AGE, path="/",
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


@router.post("/demo")
async def demo_login(response: Response):
    """Create or login demo user with pre-seeded financial data.
    Always re-seeds to ensure demo data is fresh and complete."""
    email = "demo@everkin.app"
    now = datetime.now(timezone.utc)

    # Delete existing demo user and all associated data for a clean re-seed
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        # Wipe all existing demo data
        for col in ["investments", "insurance_policies", "loans", "bills", "goals", "expenses",
                     "properties", "reminders", "documents", "contacts", "family_members"]:
            try:
                await db[col].delete_many({"user_id": user_id})
            except Exception:
                pass
        await db.users.delete_one({"user_id": user_id})

    # Create fresh demo user
    user_id = f"user_demo_{uuid.uuid4().hex[:8]}"
    await db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": "Raj Sharma (Demo)",
        "password_hash": hash_password("demo123"),
        "picture": None,
        "auth_provider": "email",
        "profile": {
            "personal": {"full_name": "Raj Sharma", "marital_status": "married"},
            "contact": {"email": email, "city": "Gurugram", "state": "Haryana"},
            "financial": {"annual_income": 1200000, "occupation": "Software Engineering Manager"},
        },
        "created_at": now,
    })

    # ── Seed investments (6) ──
    for inv in [
        {"name": "Reliance Industries", "asset_type": "stock", "amount_invested": 150000, "current_value": 185000, "ticker": "RELIANCE.NS"},
        {"name": "HDFC Mid-Cap Fund", "asset_type": "mutual_fund", "amount_invested": 300000, "current_value": 380000, "ticker": "HDFCMIDCAP"},
        {"name": "Nifty 50 ETF", "asset_type": "etf", "amount_invested": 200000, "current_value": 245000, "ticker": "NIFTYBEES.NS"},
        {"name": "SBI Fixed Deposit", "asset_type": "bond", "amount_invested": 500000, "current_value": 530000, "ticker": ""},
        {"name": "Gold Sovereign Bond", "asset_type": "gold", "amount_invested": 100000, "current_value": 128000, "ticker": "SGB"},
        {"name": "Bitcoin", "asset_type": "crypto", "amount_invested": 50000, "current_value": 72000, "ticker": "BTC"},
    ]:
        await db.investments.insert_one({"user_id": user_id, **inv, "created_at": now})

    # ── Seed insurance (4) ──
    for ins in [
        {"policy_type": "Term Life", "provider": "LIC", "policy_number": "LIC-TERM-987654", "sum_assured": 10000000, "premium_amount": 18000, "premium_frequency": "annual", "start_date": "2023-06-15", "maturity_date": "2053-06-15", "nominee_name": "Priya Sharma", "notes": "Term plan 30 years"},
        {"policy_type": "Health Insurance", "provider": "Star Health", "policy_number": "STAR-HEALTH-456789", "sum_assured": 1000000, "premium_amount": 25000, "premium_frequency": "annual", "start_date": "2024-01-10", "maturity_date": "2025-01-10", "nominee_name": "Family Floater", "notes": "₹10L cover"},
        {"policy_type": "Car Insurance", "provider": "Bajaj Allianz", "policy_number": "BAJAJ-CAR-123456", "sum_assured": 800000, "premium_amount": 12000, "premium_frequency": "annual", "start_date": "2024-03-01", "maturity_date": "2025-03-01", "nominee_name": "Self", "notes": "Hyundai Creta"},
        {"policy_type": "Home Loan Insurance", "provider": "ICICI Lombard", "policy_number": "ICICI-HOME-789012", "sum_assured": 5000000, "premium_amount": 35000, "premium_frequency": "annual", "start_date": "2022-09-15", "maturity_date": "2032-09-15", "nominee_name": "Priya Sharma", "notes": "Covers home loan"},
    ]:
        await db.insurance_policies.insert_one({"user_id": user_id, **ins, "created_at": now})

    # ── Seed loans (3) ──
    for loan in [
        {"loan_type": "home", "lender": "SBI", "principal": 4200000, "interest_rate": 8.5, "tenure_months": 240, "emi_amount": 38000, "remaining_amount": 3800000, "start_date": "2022-09-15", "end_date": "2042-09-15"},
        {"loan_type": "car", "lender": "HDFC", "principal": 800000, "interest_rate": 9.2, "tenure_months": 60, "emi_amount": 16500, "remaining_amount": 580000, "start_date": "2024-01-20", "end_date": "2029-01-20"},
        {"loan_type": "personal", "lender": "Axis", "principal": 300000, "interest_rate": 13.5, "tenure_months": 36, "emi_amount": 10200, "remaining_amount": 210000, "start_date": "2024-06-01", "end_date": "2027-06-01"},
    ]:
        await db.loans.insert_one({"user_id": user_id, **loan, "created_at": now})

    # ── Seed bills (5) ──
    for bill in [
        {"bill_type": "electricity", "provider": "BSES", "amount": 3500, "due_date": "2026-09-05", "paid": False, "recurrence": "monthly"},
        {"bill_type": "phone", "provider": "Airtel", "amount": 1199, "due_date": "2026-09-10", "paid": False, "recurrence": "monthly"},
        {"bill_type": "internet", "provider": "Jio", "amount": 999, "due_date": "2026-09-08", "paid": False, "recurrence": "monthly"},
        {"bill_type": "water", "provider": "DJB", "amount": 800, "due_date": "2026-09-15", "paid": False, "recurrence": "quarterly"},
        {"bill_type": "gas", "provider": "Indane", "amount": 1100, "due_date": "2026-09-20", "paid": True, "recurrence": "monthly"},
    ]:
        await db.bills.insert_one({"user_id": user_id, **bill, "created_at": now})

    # ── Seed goals (4) ──
    for goal in [
        {"title": "Emergency Fund", "target_amount": 300000, "current_amount": 150000, "monthly_contribution": 10000, "target_date": "2026-12-31", "category": "emergency"},
        {"title": "Daughter's Wedding", "target_amount": 1500000, "current_amount": 400000, "monthly_contribution": 15000, "target_date": "2032-06-01", "category": "wedding"},
        {"title": "Home Down Payment", "target_amount": 2000000, "current_amount": 800000, "monthly_contribution": 25000, "target_date": "2028-03-01", "category": "property"},
        {"title": "International Trip", "target_amount": 300000, "current_amount": 75000, "monthly_contribution": 8000, "target_date": "2027-12-01", "category": "travel"},
    ]:
        await db.goals.insert_one({"user_id": user_id, **goal, "created_at": now})

    # ── Seed expenses (8) ──
    for exp in [
        {"category": "Groceries", "merchant": "Big Bazaar", "amount": 4500, "date": "2026-08-25"},
        {"category": "Fuel", "merchant": "Indian Oil", "amount": 3200, "date": "2026-08-24"},
        {"category": "Dining", "merchant": "Zomato", "amount": 1800, "date": "2026-08-23"},
        {"category": "Shopping", "merchant": "Amazon", "amount": 5200, "date": "2026-08-22"},
        {"category": "Healthcare", "merchant": "Apollo Pharmacy", "amount": 1200, "date": "2026-08-20"},
        {"category": "Transport", "merchant": "Uber", "amount": 650, "date": "2026-08-26"},
        {"category": "Entertainment", "merchant": "Netflix", "amount": 649, "date": "2026-08-15"},
        {"category": "Utilities", "merchant": "BSES", "amount": 3500, "date": "2026-08-05"},
    ]:
        await db.expenses.insert_one({"user_id": user_id, **exp, "created_at": now})

    # ── Seed properties (2) ──
    for prop in [
        {"property_type": "residential", "address": "DLF Phase 4, Gurugram", "city": "Gurugram", "state": "Haryana", "purchase_price": 8500000, "current_value": 12000000, "purchase_date": "2021-03-15", "area_sqft": 1650, "ownership": "owned", "property_tax_amount": 45000, "property_tax_due": "2026-12-31"},
        {"property_type": "vehicle", "address": "", "city": "Gurugram", "state": "Haryana", "purchase_price": 1400000, "current_value": 1100000, "purchase_date": "2024-01-20", "area_sqft": 0, "ownership": "owned", "property_tax_amount": 8000, "property_tax_due": "2026-09-30"},
    ]:
        await db.properties.insert_one({"user_id": user_id, **prop, "created_at": now})

    # ── Seed reminders (5) ──
    for rem in [
        {"title": "Pay LIC Term Insurance Premium", "due_date": "2026-09-15", "category": "insurance", "priority": "high", "completed": False},
        {"title": "File ITR for FY 2025-26", "due_date": "2026-07-31", "category": "tax", "priority": "high", "completed": False},
        {"title": "Renew Car Insurance", "due_date": "2026-03-01", "category": "insurance", "priority": "medium", "completed": True},
        {"title": "Pay BSES Electricity Bill", "due_date": "2026-09-05", "category": "bills", "priority": "medium", "completed": False},
        {"title": "Review Investment Portfolio", "due_date": "2026-09-01", "category": "investments", "priority": "low", "completed": False},
    ]:
        await db.reminders.insert_one({"user_id": user_id, **rem, "created_at": now})

    # ── Seed documents (5) ──
    for doc in [
        {"original_filename": "PAN_Card.pdf", "category": "identity", "content_type": "application/pdf", "size": 245000},
        {"original_filename": "Aadhaar_Card.pdf", "category": "identity", "content_type": "application/pdf", "size": 180000},
        {"original_filename": "LIC_Term_Policy.pdf", "category": "insurance", "content_type": "application/pdf", "size": 420000},
        {"original_filename": "Home_Loan_Agreement.pdf", "category": "property", "content_type": "application/pdf", "size": 1500000},
        {"original_filename": "Salary_Slip_Aug2026.pdf", "category": "financial", "content_type": "application/pdf", "size": 95000},
    ]:
        await db.documents.insert_one({"user_id": user_id, **doc, "storage_path": "", "content_hash": "", "tags": "[]", "is_deleted": False, "created_at": now})

    # ── Seed family members (3) ──
    for fam in [
        {"name": "Priya Sharma", "relationship": "spouse", "email": "priya@example.com", "phone": "+91-98765-43210", "access_scope": "investments,insurance,vault"},
        {"name": "Aarav Sharma", "relationship": "son", "email": "", "phone": "", "access_scope": "none"},
        {"name": "Suresh Sharma", "relationship": "father", "email": "suresh@example.com", "phone": "+91-98765-43211", "access_scope": "insurance"},
    ]:
        await db.family_members.insert_one({"user_id": user_id, **fam, "created_at": now})

    token = await create_session(user_id)
    set_session_cookie(response, token)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": public_user(user), "token": token}
