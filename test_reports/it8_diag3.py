import io, json, requests
from dotenv import dotenv_values
BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
s.headers.update({"Authorization": "Bearer " + s.post(f"{BASE}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60).json()["token"]})
blob = open("/app/test_reports/statement_qa.csv", "rb").read()
d = s.post(f"{BASE}/documents/upload", files={"file": ("TEST_it8e_bank_statement.csv", io.BytesIO(blob), "text/csv")}, data={"category": "auto"}, timeout=240).json()
print("uploaded", d["document_id"], d["category"], json.dumps(d.get("metadata", {}))[:300])

def ask(q):
    cid = s.post(f"{BASE}/chat/conversations", json={"title": "TEST_it8e"}, timeout=60).json()["conversation_id"]
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
    print(f"\n=== run{i} sources={[x['filename'] for x in srcs]}\n{c[:900]}")
s.delete(f"{BASE}/documents/{d['document_id']}", timeout=60)
print("cleaned")
