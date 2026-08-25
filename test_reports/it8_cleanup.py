import io, json, requests
from dotenv import dotenv_values
BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
s.headers.update({"Authorization": "Bearer " + s.post(f"{BASE}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60).json()["token"]})

# regression: profile autofill
r = s.post(f"{BASE}/profile/from-documents", json={}, timeout=240)
print("profile/from-documents", r.status_code, json.dumps(r.json())[:500])

# regression: dashboard stats + insights list
for ep in ["/dashboard/stats", "/insights", "/investments/summary", "/documents/categories", "/shares", "/forms", "/bundle/history"]:
    rr = s.get(f"{BASE}{ep}", timeout=90)
    print(ep, rr.status_code, str(rr.json())[:120])

# regression: insights statement analysis
blob = open("/app/test_reports/statement_qa.csv", "rb").read()
ri = s.post(f"{BASE}/insights/statement", files={"file": ("TEST_it8_ins.csv", io.BytesIO(blob), "text/csv")}, timeout=240)
print("insights/statement", ri.status_code, str(ri.json())[:400])

# ---- CLEANUP ----
for sh in s.get(f"{BASE}/shares", timeout=60).json():
    print("del share", sh["share_id"], s.delete(f"{BASE}/shares/{sh['share_id']}", timeout=60).status_code)
for c in s.get(f"{BASE}/chat/conversations", timeout=60).json():
    print("del conv", c.get("title", "")[:25], s.delete(f"{BASE}/chat/conversations/{c['conversation_id']}", timeout=60).status_code)
for d in s.get(f"{BASE}/documents", timeout=60).json():
    if d["original_filename"] != "stmt.csv":
        print("del doc", d["original_filename"], s.delete(f"{BASE}/documents/{d['document_id']}", timeout=60).status_code)
print("remaining docs:", [d["original_filename"] for d in s.get(f"{BASE}/documents", timeout=60).json()])
print("remaining convs:", len(s.get(f"{BASE}/chat/conversations", timeout=60).json()))
print("remaining shares:", len(s.get(f"{BASE}/shares", timeout=60).json()))
