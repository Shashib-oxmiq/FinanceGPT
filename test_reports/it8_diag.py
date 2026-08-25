import asyncio, json, os, sys
sys.path.insert(0, "/app/backend")
from deps import db  # noqa
import routes  # noqa


async def main():
    u = await db.users.find_one({"email": "demo@example.com"})
    uid = u["user_id"]
    docs = await db.documents.find({"user_id": uid, "is_deleted": False}, {"_id": 0, "storage_path": 0}).to_list(50)
    for d in docs:
        print("DOC", d["original_filename"], "| cat:", d.get("category"))
        print("   metadata:", json.dumps(d.get("metadata", {}))[:600])
    for q in ["List the expenses in my bank statement",
              "How many visas are in my passport?",
              "Tell me a fun fact about the ocean.",
              "show me my bank statement transactions"]:
        sel = await routes.select_relevant_docs(uid, q)
        print(f"\nQ: {q}\n -> {[s['original_filename'] for s in sel]}")

asyncio.run(main())
