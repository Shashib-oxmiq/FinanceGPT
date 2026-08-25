import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import dotenv_values
env = dotenv_values("/app/backend/.env")
cli = AsyncIOMotorClient(env["MONGO_URL"])
db = cli[env["DB_NAME"]]

async def main():
    for did in ["e75acaa6-7482-4edd-a737-f18a36b5f304", "3f6d054d-939d-4e7a-8758-c0f9f6c3e74d"]:
        d = await db.documents.find_one({"document_id": did}, {"_id": 0, "storage_path": 0})
        print(did, "->", d)
    print("--- passport docs ---")
    async for d in db.documents.find({"original_filename": {"$regex": "passport", "$options": "i"}}, {"_id": 0}):
        print(d.get("document_id"), d.get("original_filename"), d.get("is_deleted"), d.get("category"), d.get("content_type"))
    print("--- recent assistant msgs w/ sources ---")
    async for m in db.messages.find({"role": "assistant", "sources": {"$ne": []}}, {"_id": 0, "sources": 1, "created_at": 1}).sort("created_at", -1).limit(5):
        print(m.get("created_at"), m.get("sources"))

asyncio.run(main())
