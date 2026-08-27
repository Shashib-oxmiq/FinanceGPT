import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { getAILangName } from "../lib/i18n";
import { ChatCircleText, X, PaperPlaneRight, Robot, User, Spinner } from "@phosphor-icons/react";

/**
 * PanelChat — an embeddable, collapsible chat panel for any page.
 *
 * Props:
 *   contextLabel: string   — what this chat is about (e.g. "Document Vault")
 *   systemHint: string     — extra system prompt context for the AI
 *   storageKey: string     — localStorage key to persist messages
 */
export default function PanelChat({ contextLabel, systemHint, storageKey }) {
  const { lang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
  }, [messages, storageKey]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const userMsg = { role: "user", content: text, ts: Date.now() };
    const aiMsg = { role: "assistant", content: "", ts: Date.now() };
    setMessages((m) => [...m, userMsg, aiMsg]);
    setStreaming(true);

    // Build a one-off conversation — include prior messages for context
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

    // ── Save conversation to backend DB so it appears in the Chat page ──
    let convId = null;
    try {
      const token = localStorage.getItem("vault_token");
      const convRes = await api.post("/chat/conversations", { title: `[${contextLabel}] ${text.slice(0, 40)}` });
      convId = convRes.data?.conversation_id;
      if (convId) {
        await api.post(`/chat/conversations/${convId}/messages`, { role: "user", content: text });
      }
    } catch (e) { console.warn("PanelChat: save conversation failed:", e.message); }

    try {
      const token = localStorage.getItem("vault_token");
      const systemPrompt = `You are the AI assistant inside the "${contextLabel}" panel of the Everkin app. ${systemHint}\n\nCurrent conversation history:\n${history.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\nThe user is currently viewing the ${contextLabel} page. Respond concisely and helpfully with reference to their actual financial data if available. Current language: ${getAILangName(lang)}.`;

      const res = await fetch(`${API}/chat/panel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, system_prompt: systemPrompt, language: lang }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.delta) {
              full += evt.delta;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { ...copy[copy.length - 1], content: full };
                return copy;
              });
            } else if (evt.error) {
              toast.error("AI error: " + evt.error);
            }
          } catch {}
        }
      }
      if (!full) {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: "Sorry — I couldn't process that. Please try again." };
          return copy;
        });
      }
      // Save assistant response to DB so it appears in the Chat page
      if (convId && full) {
        try { await api.post(`/chat/conversations/${convId}/messages`, { role: "assistant", content: full }); } catch (e) { console.warn("PanelChat: save assistant msg failed:", e.message); }
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: "Sorry — the connection dropped. Please try again." };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages, lang, contextLabel, systemHint, storageKey]);

  const clear = () => { setMessages([]); localStorage.removeItem(storageKey); };

  return (
    <div className="mb-4" data-testid="panel-chat">
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-primary/20 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors"
        data-testid="panel-chat-toggle"
      >
        <ChatCircleText size={16} weight="duotone" />
        <span>{t("panel.chat.title")} {contextLabel}</span>
        <span className="ml-auto text-xs text-muted-foreground">{open ? t("panel.chat.hide") : messages.length > 0 ? `${messages.length} msgs` : t("panel.chat.empty")}</span>
      </button>

      {open && (
        <div className="mt-2 border border-border rounded-2xl bg-card overflow-hidden" data-testid="panel-chat-open">
          {/* Messages */}
          <div ref={scrollRef} className="max-h-80 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Robot size={32} weight="duotone" className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t("panel.chat.empty")} {contextLabel.toLowerCase()}.</p>
                <p className="text-xs mt-1">I can search, summarize, find expiring documents, and more.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {m.role === "user" ? <User size={14} weight="duotone" /> : <Robot size={14} weight="duotone" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.content || (streaming && i === messages.length - 1 ? "…" : "")}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 flex items-center gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t("panel.chat.placeholder")}
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none bg-background text-sm outline-none px-3 py-2 rounded-xl border border-input focus:ring-2 focus:ring-ring disabled:opacity-60"
              data-testid="panel-chat-input"
            />
            <button
              onClick={send}
              disabled={streaming || !input.trim()}
              className="shrink-0 p-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              data-testid="panel-chat-send"
            >
              {streaming ? <Spinner size={16} className="animate-spin" /> : <PaperPlaneRight size={16} weight="fill" />}
            </button>
            {messages.length > 0 && (
              <button onClick={clear} className="shrink-0 p-2.5 rounded-xl hover:bg-secondary text-muted-foreground" title={t("panel.chat.clear")}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}