import json, requests
from dotenv import dotenv_values
BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
s.headers.update({"Authorization": "Bearer " + s.post(f"{BASE}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60).json()["token"]})
docs = s.get(f"{BASE}/documents", timeout=60).json()
print("vault docs:", [(d["original_filename"], d["category"]) for d in docs])
r = s.post(f"{BASE}/loans/checklist", json={"bank": "HDFC Bank", "loan_type": "Home Loan"}, timeout=240).json()
have = [(i["name"], [m["filename"] for m in i["matched"]]) for i in r["items"] if i["status"] == "have"]
print(f"items={len(r['items'])} have={len(have)}")
for n, m in have:
    print("  HAVE:", n, "->", m)
sh = s.post(f"{BASE}/shares", json={"name": "TEST_it8 ui share", "document_ids": [d["document_id"] for d in docs]}, timeout=60).json()
print("SHARE", json.dumps({k: sh[k] for k in ("share_id", "token", "password", "expires_at", "count")}))
