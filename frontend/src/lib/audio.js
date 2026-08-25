import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, API } from "./api";

const AUDIO_BASE = API.replace(/\/api$/, "");

// Single shared audio element so only one voice can ever play at a time.
let currentAudio = null;
let token = 0;
let state = { activeId: null, loadingId: null };
const listeners = new Set();

function setState(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
}

function stop() {
  token++;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  setState({ activeId: null, loadingId: null });
}

async function speak(id, text, opts = {}) {
  // Toggle: clicking the active item stops playback.
  if (state.activeId === id && currentAudio) {
    stop();
    return;
  }
  // Cancel anything already playing / loading.
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  const mine = ++token;
  const clean = (text || "").trim();
  if (!clean) return;
  setState({ activeId: null, loadingId: id });
  try {
    const { data } = await api.post("/tts", { text: clean, ...(opts.voice ? { voice: opts.voice } : {}) });
    if (mine !== token) return; // superseded by a newer request
    const audio = new Audio(`${AUDIO_BASE}${data.url}`);
    currentAudio = audio;
    const clear = () => {
      if (currentAudio === audio) {
        currentAudio = null;
        setState({ activeId: null, loadingId: null });
      }
    };
    audio.onended = clear;
    audio.onerror = clear;
    await audio.play();
    if (mine !== token) {
      audio.pause();
      return;
    }
    setState({ activeId: id, loadingId: null });
  } catch {
    if (mine === token) setState({ activeId: null, loadingId: null });
    toast.error("Voice generation failed");
  }
}

export function useTts() {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
      if (listeners.size === 0) stop(); // stop playback when leaving the page
    };
  }, []);
  const speakCb = useCallback((id, text, opts) => speak(id, text, opts), []);
  return { activeId: s.activeId, loadingId: s.loadingId, speak: speakCb, stop };
}
