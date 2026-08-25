import io, json, os, re, requests
from dotenv import dotenv_values
BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
s.headers.update({"Authorization": "Bearer " + s.post(f"{BASE}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60).json()["token"]})

blob = open("/app/test_reports/passport_qa.txt", "rb").read()
r = s.post(f"{BASE}/documents/upload", files={"file": ("TEST_it8d_passport.txt", io.BytesIO(blob), "text/plain")}, data={"category": "auto"}, timeout=240)
d = r.json()
print("uploaded", d["document_id"], d["category"])
print("metadata:", json.dumps(d.get("metadata", {}))[:1500])

r = s.post(f"{BASE}/loans/checklist", json={"bank": "HDFC Bank", "loan_type": "Home Loan"}, timeout=240)
data = r.json()
for it in data["items"]:
    print(f"{it['status']:8} | {it['name'][:70]:70} | {[m['filename'] for m in it['matched']]}")
print("have:", sum(1 for i in data['items'] if i['status'] == 'have'), "/", len(data['items']))

# chat grounding repeat x2 for statement question
def ask(q):
    cid = s.post(f"{BASE}/chat/conversations", json={"title": "TEST_it8d"}, timeout=60).json()["conversation_id"]
    content, srcs = "", []
    with s.post(f"{BASE}/chat/conversations/{cid}/message", json={"content": q}, stream=True, timeout=240) as m:
        for line in m.iter_lines(decode_unicode=True):
            if line and line.startswith("data: "):
                e = json.loads(line[6:])
                content += e.get("delta", "")
                if "sources" in e: srcs = e["sources"]
    s.delete(f"{BASE}/chat/conversations/{cid}", timeout=60)
    return content, srcs

for i in range(2):
    c, srcs = ask("List the expenses in my bank statement")
    print(f"\n--- run{i} sources={[x['filename'] for x in srcs]}\n{c[:700]}")

s.delete(f"{BASE}/documents/{d['document_id']}", timeout=60)
print("cleaned")
