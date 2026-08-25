import requests
from dotenv import dotenv_values
BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
s = requests.Session()
t = s.post(f"{API}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60).json()["token"]
s.headers.update({"Authorization": f"Bearer {t}"})
for i in s.get(f"{API}/investments", timeout=60).json():
    if i["name"].startswith(("QA ", "TEST_")):
        print("deleting", i["name"], s.delete(f"{API}/investments/{i['investment_id']}", timeout=60).status_code)
print("remaining:", s.get(f"{API}/investments/summary", timeout=60).json())
