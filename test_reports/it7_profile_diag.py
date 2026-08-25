"""Diagnose profile/from-documents extraction quality."""
import json, os
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE = fe["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
r = s.post(f"{BASE}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60)
s.headers["Authorization"] = f"Bearer {r.json()['token']}"

me = s.get(f"{BASE}/auth/me", timeout=60).json()
prof = me.get("user", me).get("profile", {}) or me.get("profile", {}) or {}
print("CURRENT PROFILE (non-empty fields):")
for sec, f in prof.items():
    if isinstance(f, dict):
        ne = {k: v for k, v in f.items() if v}
        if ne:
            print(" ", sec, ne)

docs = s.get(f"{BASE}/documents", timeout=60).json()
print("\nDOCS:", [(d["original_filename"], d["category"]) for d in docs][:20])

r = s.post(f"{BASE}/profile/from-documents", timeout=240)
print("\nstatus", r.status_code)
d = r.json()
print("filled:", d.get("filled"), "completeness:", d.get("completeness"))
print("extracted:", json.dumps(d.get("extracted"), indent=1)[:1500])
