"""
AI integration module — Yolo-Auto (OpenAI-compatible Chat Completions API).

Provider: Yolo-Auto
Base URL:  https://yolo-auto.com/v1
Model:     qwen3.8-27b (131072 context window)
API key:   YOLO_AUTO_API_KEY env var

This replaces the previous emergentintegrations-based integration. All public
function signatures (make_chat, stream_message, complete, complete_with_files,
make_file_content, parse_json, MODELS, TASK_MODEL) are preserved so routes.py
works unchanged.
"""

import os
import json
import re
import base64
import tempfile
from typing import Optional, List

from openai import OpenAI

# ── Configuration ────────────────────────────────────────────────────────────

YOLO_AUTO_API_KEY = os.environ.get("YOLO_AUTO_API_KEY", "")
YOLO_AUTO_BASE_URL = os.environ.get("YOLO_AUTO_BASE_URL", "https://yolo-auto.com/v1")
DEFAULT_MODEL = os.environ.get("YOLO_AUTO_MODEL", "qwen3.8-27b")

# MODELS maps user-facing keys to actual model names.
# All routes now go through Yolo-Auto with the same model.
MODELS = {
    "claude": DEFAULT_MODEL,
    "gemini": DEFAULT_MODEL,
    "yolo": DEFAULT_MODEL,
}

# Smart routing: pick the model best suited to the task.
# All tasks use the same Yolo-Auto model.
TASK_MODEL = {
    "chat": "yolo",
    "extract": "yolo",
    "form": "yolo",
    "bundle": "yolo",
}

# ── Client ───────────────────────────────────────────────────────────────────

_client: Optional[OpenAI] = None

def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not YOLO_AUTO_API_KEY:
            raise RuntimeError(
                "YOLO_AUTO_API_KEY is not set. "
                "Add it to backend/.env or your environment."
            )
        _client = OpenAI(
            api_key=YOLO_AUTO_API_KEY,
            base_url=YOLO_AUTO_BASE_URL,
        )
    return _client


# ── Chat session object (preserves the LlmChat interface) ─────────────────────

class ChatSession:
    """Wraps an OpenAI-style chat session with a system message and model."""

    def __init__(self, session_id: str, system_message: str, model: str = DEFAULT_MODEL):
        self.session_id = session_id
        self.system_message = system_message
        self.model = model
        self.messages: list = []
        if system_message:
            self.messages.append({"role": "system", "content": system_message})
        self.client = _get_client()

    def _build_content(self, text: str, file_contents=None) -> list:
        """Build multimodal content list for the OpenAI API.

        For images, we use the image_url content type with base64 data URIs.
        For file attachments, we include them as text content (extracted text).
        """
        if not file_contents:
            return text

        parts = []
        if text:
            parts.append({"type": "text", "text": text})

        for fc in file_contents:
            if fc is None:
                continue
            if hasattr(fc, "image_base64") and fc.image_base64:
                # Image content
                mime = getattr(fc, "media_type", "image/png")
                parts.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime};base64,{fc.image_base64}",
                    },
                })
            elif hasattr(fc, "file_path") and fc.file_path:
                # File content — read text if possible, include as text part
                try:
                    with open(fc.file_path, "r", errors="replace") as f:
                        file_text = f.read()
                    parts.append({
                        "type": "text",
                        "text": f"[File: {os.path.basename(fc.file_path)}]\n{file_text[:50000]}",
                    })
                except Exception:
                    pass  # Skip binary files we can't read as text

        return parts if parts else text


# ── Public API (signatures preserved from emergentintegrations version) ───────

def make_chat(session_id: str, system_message: str, model_key: str = "yolo") -> ChatSession:
    """Create a chat session. model_key maps to a model name via MODELS."""
    model = MODELS.get(model_key, DEFAULT_MODEL)
    return ChatSession(
        session_id=session_id,
        system_message=system_message,
        model=model,
    )


def make_file_content(content_type: str, data: bytes, filename: str):
    """Build a file content object for multimodal chat. Returns (obj, temp_path)."""
    try:
        if content_type and content_type.startswith("image/"):
            return _ImageContent(
                image_base64=base64.b64encode(data).decode(),
                media_type=content_type,
            ), None
        suffix = os.path.splitext(filename or "")[1] or ".bin"
        tf = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tf.write(data)
        tf.close()
        return _FileContent(
            mime_type=content_type or "application/octet-stream",
            file_path=tf.name,
        ), tf.name
    except Exception:
        return None, None


class _ImageContent:
    def __init__(self, image_base64, media_type="image/png"):
        self.image_base64 = image_base64
        self.media_type = media_type


class _FileContent:
    def __init__(self, mime_type=None, file_path=None):
        self.mime_type = mime_type
        self.file_path = file_path


async def stream_message(chat: ChatSession, user_message):
    """Stream chat completions as an async generator yielding text deltas."""
    text = getattr(user_message, "text", "") or ""
    file_contents = getattr(user_message, "file_contents", None)
    content = chat._build_content(text, file_contents)

    chat.messages.append({"role": "user", "content": content})

    try:
        stream = chat.client.chat.completions.create(
            model=chat.model,
            messages=chat.messages,
            stream=True,
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        yield f"⚠️ AI connection error: {e}"


async def complete(chat: ChatSession, text: str) -> str:
    """Send a message and return the complete response text."""
    chat.messages.append({"role": "user", "content": text})
    try:
        resp = chat.client.chat.completions.create(
            model=chat.model,
            messages=chat.messages,
        )
        return resp.choices[0].message.content or ""
    except Exception as e:
        return f"⚠️ AI connection error: {e}"


async def complete_with_files(chat: ChatSession, text: str, file_contents=None) -> str:
    """Send a message with file attachments and return the complete response."""
    content = chat._build_content(text, file_contents)
    chat.messages.append({"role": "user", "content": content})
    try:
        resp = chat.client.chat.completions.create(
            model=chat.model,
            messages=chat.messages,
        )
        return resp.choices[0].message.content or ""
    except Exception as e:
        return f"⚠️ AI connection error: {e}"


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


# ── Compatibility shims (so routes.py imports don't break) ────────────────────

class UserMessage:
    """Preserves the emergentintegrations UserMessage interface."""
    def __init__(self, text=None, images=None, files=None, file_contents=None):
        self.text = text
        self.images = images or []
        self.files = files or []
        self.file_contents = file_contents or []


class TextDelta:
    def __init__(self, content=""):
        self.content = content


class StreamDone:
    pass


class ImageContent:
    def __init__(self, image_base64=None, media_type="image/png"):
        self.image_base64 = image_base64
        self.media_type = media_type


class FileContentWithMimeType:
    def __init__(self, mime_type=None, file_path=None):
        self.mime_type = mime_type
        self.file_path = file_path