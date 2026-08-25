"""Cleanup of QA-created data (docs, investments, conversations)."""
import os, requests
from dotenv import dotenv_values
BASE = (dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"
s = requests.Session()
r = s.post(f"{BASE}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=30)
s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})

for d in s.get(f"{BASE}/documents", timeout=30).json():
    if d["original_filename"] in ("passport_qa.txt", "statement_qa.csv") or d["original_filename"].startswith("TEST_"):
        print("del doc", d["original_filename"], s.delete(f"{BASE}/documents/{d['document_id']}", timeout=30).status_code)

for i in s.get(f"{BASE}/investments", timeout=30).json():
    if i["name"].startswith("TEST_"):
        print("del inv", i["name"], s.delete(f"{BASE}/investments/{i['investment_id']}", timeout=30).status_code)

QA_TITLES = ("How many visas", "Briefly, what is compound interest", "Show me all expenses", "TEST_", "New conversation",
             "Say OK in one word", "In one short sentence", "What policy number is in the attach")
for c in s.get(f"{BASE}/chat/conversations", timeout=30).json():
    if any(c["title"].startswith(t) for t in QA_TITLES):
        print("del conv", c["title"][:40], s.delete(f"{BASE}/chat/conversations/{c['conversation_id']}", timeout=30).status_code)

print("docs left:", len(s.get(f"{BASE}/documents", timeout=30).json()),
      "| invs left:", len(s.get(f"{BASE}/investments", timeout=30).json()),
      "| convs left:", len(s.get(f"{BASE}/chat/conversations", timeout=30).json()))
