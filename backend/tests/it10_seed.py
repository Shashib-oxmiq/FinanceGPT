"""Helper: seed/delete an insurance document for UI testing of guide-doc."""
import io
import sys

import requests
from dotenv import dotenv_values

BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
s = requests.Session()
s.headers.update({"Authorization": "Bearer " + s.post(f"{API}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60).json()["token"]})

if sys.argv[1] == "seed":
    content = (
        "STAR HEALTH POLICY TEST_it10ui\nPolicy No TEST-IT10-UI. Sum insured Rs 5,00,000. Room rent 1% cap.\n"
        "Covered: hospitalisation >24h, day-care, pre-hosp 30 days, post-hosp 60 days.\n"
        "Exclusions: cosmetic surgery, dental unless accidental, PED 36 months.\nHelpline 1800-425-2255.\n"
    )
    files = {"file": ("TEST_it10ui_policy.txt", io.BytesIO(content.encode()), "text/plain")}
    r = s.post(f"{API}/documents/upload", files=files, data={"category": "insurance", "auto_classify": "false"}, timeout=180)
    print(r.status_code, r.json().get("document_id"))
elif sys.argv[1] == "clean":
    docs = s.get(f"{API}/documents", timeout=60).json()
    for d in docs:
        if "TEST_it10" in (d.get("original_filename") or ""):
            print("delete", d["document_id"], s.delete(f"{API}/documents/{d['document_id']}", timeout=60).status_code)
    print("remaining:", [d.get("original_filename") for d in s.get(f"{API}/documents", timeout=60).json()])
