import re
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from typing import Optional

from deps import get_current_user
from emergentintegrations.llm.openai import OpenAITextToSpeech
import os

router = APIRouter(prefix="/api")

_tts = OpenAITextToSpeech(api_key=os.environ.get("EMERGENT_LLM_KEY"))
_CACHE = {}  # key -> mp3 bytes


def clean_for_tts(text: str) -> str:
    text = re.sub(r"https?://\S+", "", text or "")
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"[*_#>~|`]", "", text)
    return re.sub(r"\s+", " ", text).strip()[:4000]


class TTSBody(BaseModel):
    text: str
    voice: Optional[str] = "sage"


@router.post("/tts")
async def synthesize(body: TTSBody, user: dict = Depends(get_current_user)):
    text = clean_for_tts(body.text)
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to read")
    voice = body.voice or "sage"
    key = hashlib.sha256(f"{text}|{voice}|tts-1|mp3".encode()).hexdigest()[:24]
    if key not in _CACHE:
        try:
            _CACHE[key] = await _tts.generate_speech(text=text, model="tts-1", voice=voice)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Voice generation failed: {e}")
        # Bound the in-memory cache to avoid unbounded growth.
        if len(_CACHE) > 200:
            for old in list(_CACHE.keys())[:50]:
                _CACHE.pop(old, None)
    return {"url": f"/api/tts/{key}.mp3"}


@router.get("/tts/{key}.mp3")
async def get_tts(key: str):
    audio = _CACHE.get(key)
    if not audio:
        raise HTTPException(status_code=404, detail="Audio expired, regenerate")
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})
