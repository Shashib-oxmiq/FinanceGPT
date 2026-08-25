import requests
from dotenv import dotenv_values
BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
s.headers.update({"Authorization": "Bearer " + s.post(f"{BASE}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60).json()["token"]})
doc = s.get(f"{BASE}/documents", timeout=60).json()[0]
r = s.post(f"{BASE}/insights/statement", json={"document_id": doc["document_id"]}, timeout=240)
print("insights/statement", r.status_code, str(r.json())[:400])
print("insights list count:", len(s.get(f"{BASE}/insights", timeout=60).json()))
shares = s.get(f"{BASE}/shares", timeout=60).json()
for sh in shares:
    pub = requests.post(f"{BASE}/shares/{sh['token']}/access", json={"password": sh["password"]}, timeout=60)
    print("share", sh["name"][:20], "revoked=", sh["revoked"], "public access ->", pub.status_code)
