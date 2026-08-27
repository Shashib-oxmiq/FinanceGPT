// ── Text-to-Speech Service (Humanized) ─────────────────────────────────────────
// Uses Web Speech API on web with intelligent voice selection:
// - Picks the best available voice by language (Indian English, Hindi, etc.)
// - Selects voice by gender/age based on user profile
// - Natural rate, pitch, and pause tuning for human-like delivery
// - On native, requires `npx expo install expo-speech`

import { Platform } from "react-native";

let speaking = false;

// ── Voice preference profiles ──
const VOICE_PROFILES = {
  default: { gender: "female", age: "adult", rate: 0.92, pitch: 1.0 },
  young: { gender: "female", age: "young", rate: 0.95, pitch: 1.1 },
  senior: { gender: "male", age: "adult", rate: 0.82, pitch: 0.85 },
  hindi: { gender: "female", age: "adult", rate: 0.88, pitch: 1.0, lang: "hi-IN" },
};

// ── Map app language code to BCP-47 tag for TTS ──
const LANG_TO_TTS = {
  en: "en-IN", hi: "hi-IN", ta: "ta-IN", te: "te-IN", bn: "bn-IN",
  mr: "mr-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN",
  ur: "ur-IN", or: "or-IN", as: "as-IN",
  es: "es-ES", fr: "fr-FR", de: "de-DE", ar: "ar-SA", zh: "zh-CN",
  ja: "ja-JP", ko: "ko-KR", pt: "pt-BR", ru: "ru-RU",
};

// ── Pick the best available TTS voice ──
function pickVoice(langTag, gender) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // 1. Try exact match on lang tag (e.g. "en-IN")
  let candidates = voices.filter(v => v.lang === langTag);
  // 2. Try prefix match (e.g. "en-IN" matches "en")
  if (candidates.length === 0) {
    const prefix = langTag.split("-")[0];
    candidates = voices.filter(v => v.lang.startsWith(prefix));
  }
  // 3. Fallback to any voice
  if (candidates.length === 0) candidates = voices;

  // Try to pick by gender from voice name hints
  const femaleHints = ["female", "samantha", "victoria", "karen", "fiona", "tessa", "heera", "kalpana", "veena", "rishi", "google uk english female", "google india english female"];
  const maleHints = ["male", "alex", "daniel", "fred", "tom", "arthur", "google uk english male", "google india english male"];

  if (gender === "female") {
    const f = candidates.find(v => femaleHints.some(h => v.name.toLowerCase().includes(h)));
    if (f) return f;
  } else if (gender === "male") {
    const m = candidates.find(v => maleHints.some(h => v.name.toLowerCase().includes(h)));
    if (m) return m;
  }

  return candidates[0];
}

// ── Strip markers and formatting from text for speech ──
function cleanForSpeech(text) {
  return text
    .replace(/\[(?:INV_ADD|INV_EDIT|INV_DELETE|DOC_GEN|LANG_CHANGE|FORM_REC|INS_ADD|REM_ADD|GOAL_ADD|EXP_ADD|LOAN_ADD|BILL_ADD|EDU_ADD|RETIREMENT_ADD|TAX_CALC|PROP_ADD|SCENARIO|GOAL_OPT|SCHEME_REC|MEMORY|WEB_SEARCH|WEB_RESULT|CHART|TABLE|STAT|COMPARE|PROGRESS|TIMELINE|CALLOUT|MERMAID):[^\]]*\]/g, "")
    .replace(/\*+/g, "")
    .replace(/#+\s*/g, "")
    .replace(/>\s*/g, "")
    .replace(/[\u2705\u274C\u{1F4CC}\u{1F310}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u2600-\u26FF\u2700-\u27BF]/gu, "")
    .replace(/₹/g, "Rupees ")
    .replace(/Rs\./g, "Rupees ")
    .replace(/\.\.\./g, ", ")
    .replace(/\n\n+/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\|/g, " ")
    .replace(/-{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Main speak function with humanized voice ──
export async function speak(text, lang, options = {}) {
  if (!text) return;
  const clean = cleanForSpeech(text);
  if (!clean) return;
  if (Platform.OS !== "web") return;

  speaking = true;

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();

    const langTag = options.langTag || LANG_TO_TTS[lang] || "en-IN";
    const profile = VOICE_PROFILES[lang] || VOICE_PROFILES.default;
    const gender = options.gender || profile.gender;

    const voice = pickVoice(langTag, gender);

    // Split into sentences for natural delivery
    const sentences = clean.match(/[^.!?]+[.!?]+|\S+$/g) || [clean];

    sentences.forEach((sentence, idx) => {
      const utterance = new SpeechSynthesisUtterance(sentence.trim());
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = langTag;
      }
      utterance.rate = profile.rate || 0.92;
      utterance.pitch = profile.pitch || 1.0;
      utterance.volume = 0.95;

      utterance.onend = () => {
        if (idx === sentences.length - 1) speaking = false;
      };
      utterance.onerror = () => { speaking = false; };

      window.speechSynthesis.speak(utterance);
    });
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

// ── Preload voices (Chrome loads them async) ──
export function initVoices() {
  if (Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}