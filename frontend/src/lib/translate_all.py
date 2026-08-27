#!/usr/bin/env python3
"""
Pre-translate all 399 UI keys for 30 non-manual languages via Yolo-Auto API.
Saves results to translations_cache.json for instant frontend loading.
"""
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI

# ── Config ───────────────────────────────────────────────────────────────────
API_KEY = os.environ.get("YOLO_AUTO_API_KEY", "")
BASE_URL = "https://yolo-auto.com/v1"
MODEL = "qwen3.8-27b"
CHUNK_SIZE = 20  # keys per API call
MAX_WORKERS = 5  # parallel requests

# Languages with manual translations (skip these)
MANUAL_LANGS = {"en", "hi", "bn", "ta", "te", "es", "fr", "de", "ar", "zh", "ja"}

# 30 non-manual languages: code → full language name (for AI prompt)
LANGUAGES = {
    "mr": "Marathi", "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam",
    "pa": "Punjabi", "or": "Odia", "ko": "Korean", "pt": "Portuguese",
    "ru": "Russian", "it": "Italian", "nl": "Dutch", "tr": "Turkish",
    "pl": "Polish", "sv": "Swedish", "id": "Indonesian", "th": "Thai",
    "vi": "Vietnamese", "fa": "Persian", "he": "Hebrew", "uk": "Ukrainian",
    "el": "Greek", "cs": "Czech", "ro": "Romanian", "hu": "Hungarian",
    "fi": "Finnish", "da": "Danish", "no": "Norwegian", "ms": "Malay",
    "fil": "Filipino", "sw": "Swahili",
}

# ── Load UI keys from i18n.js ────────────────────────────────────────────────
def load_ui_keys():
    with open("i18n.js") as f:
        content = f.read()
    ui_keys_section = content.split("const TRANSLATIONS")[0]
    keys = re.findall(r'"([\w.]+)":\s*"([^"]*)"', ui_keys_section)
    return {k: v for k, v in keys}

# ── Translate a chunk of keys ───────────────────────────────────────────────
client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

def translate_chunk(lang_name, chunk):
    """Translate a chunk of {key: english_value} pairs. Returns {key: translated_value}."""
    keys_list = list(chunk.items())
    prompt_lines = [f'  "{k}": "{v}"' for k, v in keys_list]
    prompt = f"""You are a professional UI translator. Translate the following JSON values from English to {lang_name}.
Return ONLY a valid JSON object with the same keys, values translated to {lang_name}.
Do NOT include any explanation, markdown, or code fences. Return raw JSON only.

```json
{{
{",\n".join(prompt_lines)}
}}
```"""
    
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=2000,
        )
        text = resp.choices[0].message.content.strip()
        # Strip code fences if present
        if text.startswith("```"):
            text = re.sub(r'^```(?:json)?\s*', '', text)
            text = re.sub(r'\s*```$', '', text)
        result = json.loads(text)
        # Validate: all keys present
        translated = {}
        for k, v in keys_list:
            if k in result and result[k]:
                translated[k] = str(result[k])
            else:
                translated[k] = v  # fallback to English
        return translated
    except Exception as e:
        sys.stderr.write(f"  ERROR ({lang_name}): {e}\n")
        return {k: v for k, v in keys_list}  # fallback to English

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    ui_keys = load_ui_keys()
    print(f"Total UI keys: {len(ui_keys)}")
    
    # Split into chunks
    items = list(ui_keys.items())
    chunks = [dict(items[i:i+CHUNK_SIZE]) for i in range(0, len(items), CHUNK_SIZE)]
    print(f"Chunks per language: {len(chunks)}")
    print(f"Total API calls: {len(chunks) * len(LANGUAGES)}")
    print(f"Parallel workers: {MAX_WORKERS}")
    print()
    
    cache = {}
    
    for lang_code, lang_name in LANGUAGES.items():
        print(f"[{lang_code}] {lang_name} — translating {len(ui_keys)} keys...", end=" ", flush=True)
        start = time.time()
        
        # Submit all chunks for this language in parallel
        all_translations = {}
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {
                executor.submit(translate_chunk, lang_name, chunk): i
                for i, chunk in enumerate(chunks)
            }
            for future in as_completed(futures):
                result = future.result()
                all_translations.update(result)
        
        elapsed = time.time() - start
        cache[lang_code] = all_translations
        coverage = sum(1 for k in ui_keys if k in all_translations and all_translations[k] != ui_keys[k])
        print(f"done in {elapsed:.1f}s ({coverage}/{len(ui_keys)} translated)")
    
    # Save to JSON
    output_path = "translations_cache.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    
    file_size = os.path.getsize(output_path) / 1024
    print(f"\nSaved {len(cache)} languages to {output_path} ({file_size:.0f} KB)")
    
    # Summary
    total_translations = sum(sum(1 for k in ui_keys if lang_data.get(k, "") != ui_keys[k]) for lang_code, lang_data in cache.items())
    print(f"Total translated key-value pairs: {total_translations}")

if __name__ == "__main__":
    main()