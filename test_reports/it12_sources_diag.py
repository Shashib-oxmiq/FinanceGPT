import json, requests
from dotenv import dotenv_values
BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
s = requests.Session()
t = s.post(f"{API}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60).json()["token"]
s.headers.update({"Authorization": f"Bearer {t}", "Content-Type": "application/json"})
print("docs:", [(d["original_filename"], d["category"]) for d in s.get(f"{API}/documents", timeout=60).json()])
cid = s.post(f"{API}/chat/conversations", json={}, timeout=60).json()["conversation_id"]
q = "What does my bank statement show about my spending? Use my documents."
r = s.post(f"{API}/chat/conversations/{cid}/message", json={"content": q, "model": "claude"}, timeout=180, stream=True)
print("status", r.status_code)
srcs = None
chunks = 0
for line in r.iter_lines():
    if not line:
        continue
    ln = line.decode()
    if ln.startswith("data:"):
        try:
            evt = json.loads(ln[5:].strip())
        except Exception:
            continue
        if "sources" in evt:
            srcs = evt["sources"]
        chunks += 1
print("chunks:", chunks, "sources event:", srcs)
