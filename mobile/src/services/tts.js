// ── Text-to-Speech Service ───────────────────────────────────────────────────
// Uses Web Speech API on web (no dependency needed).
// On native, requires `npx expo install expo-speech` — TTS will silently
// no-op until then. Critical for less-educated users who prefer listening.

import { Platform } from "react-native";

let speaking = false;

export async function speak(text, lang) {
  if (!text) return;

  // Strip action markers from spoken text
  const clean = text
    .replace(/\[(?:INV_ADD|INV_EDIT|INV_DELETE|DOC_GEN|LANG_CHANGE|FORM_REC|INS_ADD|REM_ADD)[^\]]*\]/g, "")
    .replace(/\*+/g, "")
    .replace(/[\u2705\u274C\u{1F4CC}\u{1F310}]/gu, "")
    .trim();

  if (!clean) return;
  if (Platform.OS !== "web") return; // Native needs expo-speech installed

  speaking = true;

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    if (lang) utterance.lang = lang;
    utterance.onend = () => { speaking = false; };
    utterance.onerror = () => { speaking = false; };
    window.speechSynthesis.speak(utterance);
  } else {
    speaking = false;
  }
}

export function stopSpeaking() {
  speaking = false;
  if (Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeaking() {
  return speaking;
}