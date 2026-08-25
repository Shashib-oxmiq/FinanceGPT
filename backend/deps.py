from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import Request, HTTPException
from datetime import datetime, timezone

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

APP_NAME = "secure-doc-vault"

# Canonical profile schema used for completeness scoring & extraction.
PROFILE_SCHEMA = {
    "personal": ["full_name", "date_of_birth", "gender", "nationality", "marital_status"],
    "contact": ["email", "phone", "address_line", "city", "state", "postal_code", "country"],
    "identity": ["ssn", "passport_number", "passport_expiry", "drivers_license", "national_id"],
    "financial": ["annual_income", "employer", "occupation", "bank_name", "account_number"],
    "education": ["highest_degree", "institution", "field_of_study", "graduation_year"],
    "immigration": ["visa_status", "visa_type", "i94_number", "alien_number"],
    "family": ["spouse_name", "children", "emergency_contact_name", "emergency_contact_phone"],
}

DOC_CATEGORIES = [
    "financial", "tax", "bank_statement", "credit_card_statement", "investment",
    "insurance", "education", "identity", "medical", "property", "vehicle",
    "legal_estate", "warranty", "subscription", "employment", "immigration",
    "travel", "purchase", "personal", "other",
]

# Fields captured per insurance policy (covers common corner cases).
INSURANCE_FIELDS = [
    "policy_type", "provider", "policy_number", "sum_assured", "premium_amount",
    "premium_frequency", "start_date", "maturity_date", "nominee_name",
    "nominee_relationship", "riders", "claim_contact", "agent_contact", "notes",
]

INSURANCE_TYPES = [
    "life_term", "life_whole", "ulip", "health", "critical_illness", "disability",
    "personal_accident", "vehicle", "home", "travel", "pension_annuity", "other",
]


def profile_completeness(profile: dict) -> int:
    if not profile:
        return 0
    total = sum(len(v) for v in PROFILE_SCHEMA.values())
    filled = 0
    for section, fields in PROFILE_SCHEMA.items():
        sec = profile.get(section, {}) or {}
        for f in fields:
            val = sec.get(f)
            if val not in (None, "", []):
                filled += 1
    return round((filled / total) * 100) if total else 0


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one(
        {"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
