"""Cleanup all test artifacts (documents, shares, conversations, chat_files) for demo user."""
import asyncio
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

be = dotenv_values("/app/backend/.env")


async def main():
    cli = AsyncIOMotorClient(be["MONGO_URL"])
    db = cli[be["DB_NAME"]]
    u = await db.users.find_one({"email": "demo@example.com"}, {"_id": 0, "user_id": 1})
    uid = u["user_id"]
    for coll, q in [
        ("documents", {"user_id": uid}),
        ("shares", {"user_id": uid}),
        ("chat_files", {"user_id": uid}),
        ("conversations", {"user_id": uid}),
        ("messages", {"user_id": uid}),
        ("insights", {"user_id": uid}),
    ]:
        r = await db[coll].delete_many(q)
        print(coll, "deleted", r.deleted_count)
    # reset profile fields added by autofill tests
    await db.users.update_one({"user_id": uid}, {"$set": {"profile": {}}})
    print("profile reset")


asyncio.run(main())
