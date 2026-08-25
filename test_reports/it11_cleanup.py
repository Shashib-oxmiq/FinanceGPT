"""Cleanup iteration-11 test artifacts: test conversations, insights & policy_analyses created during QA."""
import os, asyncio, datetime
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

env = dotenv_values("/app/backend/.env")
MONGO_URL = env["MONGO_URL"]
DB_NAME = env["DB_NAME"]

TITLES = ["Give me one quick budgeting tip", "List the expenses in my bank statement", "TEST_it11 voice", "New conversation"]


async def main():
    db = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=3)
    convos = await db.conversations.find({"title": {"$in": TITLES}}).to_list(200)
    ids = [c["conversation_id"] for c in convos]
    m = await db.messages.delete_many({"conversation_id": {"$in": ids}})
    c = await db.conversations.delete_many({"conversation_id": {"$in": ids}})
    print("deleted conversations", c.deleted_count, "messages", m.deleted_count)
    for coll in ("insights", "policy_analyses"):
        try:
            r = await db[coll].delete_many({"created_at": {"$gte": since}})
            print(coll, "deleted", r.deleted_count)
        except Exception as e:
            print(coll, "skip", e)
    print("remaining docs", await db.documents.count_documents({}))
    print("remaining conversations", await db.conversations.count_documents({}))


asyncio.run(main())
