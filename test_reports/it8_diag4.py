import requests, json
from dotenv import dotenv_values
BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
s.headers.update({"Authorization": "Bearer " + s.post(f"{BASE}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60).json()["token"]})
docs = s.get(f"{BASE}/documents", timeout=60).json()
print("docs:", len(docs))
for d in docs:
    r = s.get(f"{BASE}/documents/{d['document_id']}/download", timeout=60)
    print(d["document_id"], d["original_filename"], d.get("content_type"), d.get("size"), "-> download", r.status_code, r.text[:120] if r.status_code != 200 else "")
convs = s.get(f"{BASE}/chat/conversations", timeout=60).json()
print("\nconversations:", [(c["conversation_id"], c.get("title")) for c in convs])
for c in convs:
    msgs = s.get(f"{BASE}/chat/conversations/{c['conversation_id']}/messages", timeout=60).json()
    for m in msgs:
        print(f"  [{c.get('title')[:25]}] {m['role']}: sources={[x['filename'] for x in (m.get('sources') or [])]} :: {m['content'][:90]!r}")
