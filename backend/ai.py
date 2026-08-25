import os
import json
import re
import base64
import tempfile
from emergentintegrations.llm.chat import (
    LlmChat, UserMessage, TextDelta, StreamDone, ImageContent, FileContentWithMimeType,
)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

MODELS = {
    "claude": ("anthropic", "claude-sonnet-4-6"),
    "gemini": ("gemini", "gemini-3.1-pro-preview"),
}

# Smart routing: pick the model best suited to the task.
TASK_MODEL = {
    "chat": "claude",       # conversational data gathering
    "extract": "gemini",    # structured extraction
    "form": "gemini",       # form field mapping
    "bundle": "claude",     # reasoning about document requirements
}


def make_chat(session_id: str, system_message: str, model_key: str = "claude") -> LlmChat:
    provider, model = MODELS.get(model_key, MODELS["claude"])
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
    ).with_model(provider, model)


def make_file_content(content_type: str, data: bytes, filename: str):
    """Build a FileContent object for multimodal chat. Returns (obj, temp_path)."""
    try:
        if content_type and content_type.startswith("image/"):
            return ImageContent(image_base64=base64.b64encode(data).decode()), None
        suffix = os.path.splitext(filename or "")[1] or ".bin"
        tf = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tf.write(data)
        tf.close()
        return FileContentWithMimeType(mime_type=content_type or "application/octet-stream", file_path=tf.name), tf.name
    except Exception:
        return None, None


async def stream_message(chat: LlmChat, user_message: UserMessage):
    async for ev in chat.stream_message(user_message):
        if isinstance(ev, TextDelta):
            yield ev.content
        elif isinstance(ev, StreamDone):
            break


async def complete(chat: LlmChat, text: str) -> str:
    resp = await chat.send_message(UserMessage(text=text))
    if isinstance(resp, str):
        return resp
    return getattr(resp, "content", str(resp))


async def complete_with_files(chat: LlmChat, text: str, file_contents=None) -> str:
    resp = await chat.send_message(UserMessage(text=text, file_contents=file_contents or None))
    if isinstance(resp, str):
        return resp
    return getattr(resp, "content", str(resp))


def parse_json(text: str):
    """Extract a JSON object/array from a possibly fenced LLM response."""
    if not text:
        return None
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            return None
    return None
