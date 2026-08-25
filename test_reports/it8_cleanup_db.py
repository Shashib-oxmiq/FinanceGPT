"""Iteration 8 DB cleanup: remove test shares/conversations/messages/insights and reset
the demo profile. Keeps the pre-existing seed document (stmt.csv)."""
import asyncio
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

be = dotenv_values("/app/backend/.env")


async def main():
    cli = AsyncIOMotorClient(be["MONGO_URL"])
    db = cli[be["DB_NAME"]]
    u = await db.users.find_one({"email": "demo@example.com"}, {"_id": 0, "user_id": 1})
    uid = u["user_id"]
    print("docs before:", [d["original_filename"] for d in await db.documents.find({"user_id": uid, "is_deleted": False}, {"_id": 0}).to_list(50)])
    for coll, q in [
        ("shares", {"user_id": uid}),
        ("chat_files", {"user_id": uid}),
        ("conversations", {"user_id": uid}),
        ("messages", {"user_id": uid}),
        ("insights", {"user_id": uid}),
        ("documents", {"user_id": uid, "is_deleted": True}),
    ]:
        r = await db[coll].delete_many(q)
        print(coll, "deleted", r.deleted_count)
    await db.users.update_one({"user_id": uid}, {"$set": {"profile": {}}})
    print("profile reset")
    print("docs after:", [d["original_filename"] for d in await db.documents.find({"user_id": uid, "is_deleted": False}, {"_id": 0}).to_list(50)])


asyncio.run(main())
