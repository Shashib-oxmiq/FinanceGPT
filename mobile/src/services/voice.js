// ── Voice Input Service ───────────────────────────────────────────────────────
// Web Speech API Recognition on web (no dependency needed).
// On native, requires `npx expo install expo-voice` + permissions.

import { Platform } from "react-native";

let recognition = null;
let isListening = false;

export function isVoiceSupported() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  }
  return false; // Native needs expo-voice installed
}

export function startListening(onResult, onError, lang) {
  if (Platform.OS !== "web") {
    if (onError) onError("Voice input requires expo-voice on native. Coming soon.");
    return;
  }

  if (typeof window === "undefined") return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (onError) onError("Voice recognition not supported in this browser.");
    return;
  }

  // Stop existing
  if (recognition) { try { recognition.stop(); } catch { /* */ } }

  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = lang || "en-US";

  let finalTranscript = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interim += transcript;
      }
    }
    if (onResult) onResult(finalTranscript || interim, !interim);
  };

  recognition.onerror = (event) => {
    isListening = false;
    if (onError) onError(event.error || "Voice recognition error");
  };

  recognition.onend = () => {
    isListening = false;
    if (onResult) onResult(finalTranscript, true);
  };

  try {
    recognition.start();
    isListening = true;
  } catch (e) {
    isListening = false;
    if (onError) onError(e.message);
  }
}

export function stopListening() {
  if (recognition) {
    try { recognition.stop(); } catch { /* */ }
  }
  isListening = false;
}

export function getIsListening() {
  return isListening;
}