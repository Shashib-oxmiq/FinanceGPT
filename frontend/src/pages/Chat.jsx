import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { useTts } from "../lib/audio";
import {
  PaperPlaneRight, Plus, Trash, Sparkle, User, Robot, Paperclip, X, ListBullets,
  File as FileIcon, Eye, DownloadSimple, SpeakerHigh, Stop,
} from "@phosphor-icons/react";
import Modal from "../components/Modal";

export default function Chat() {
  const { activeId: audioId, loadingId: audioLoading, speak } = useTts();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("claude");
  const [streaming, setStreaming] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  const openPreview = async (src) => {
    setPreview({ ...src, loading: true, url: null });
    try {
      const token = localStorage.getItem("vault_token");
      const res = await fetch(`${API}/documents/${src.document_id}/download`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ct = src.content_type || blob.type || "";
      let text = null;
      if (ct.startsWith("text/") || ct.includes("csv") || ct.includes("json") || /\.(txt|csv|json|md)$/i.test(src.filename || "")) {
        try { text = await blob.text(); } catch {}
      }
      setPreview({ ...src, loading: false, url, text });
    } catch {
      toast.error("Could not load document");
      setPreview(null);
    }
  };

  const downloadPreview = () => {
    if (!preview?.url) return;
    const a = document.createElement("a");
    a.href = preview.url;
    a.download = preview.filename || "document";
    a.click();
  };

  const speakMessage = (id, text) => {
    const clean = (text || "").replace(/\[doc:[^\]]+\]/g, "");
    speak(id, clean);
  };

  const loadConvos = async () => {
    const { data } = await api.get("/chat/conversations");
    setConversations(data);
    if (!activeId && data.length) selectConvo(data[0].conversation_id);
  };

  useEffect(() => { loadConvos(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [messages]);

  const selectConvo = async (id) => {
    setActiveId(id);
    setDrawerOpen(false);
    const { data } = await api.get(`/chat/conversations/${id}/messages`);
    setMessages(data);
  };

  const newConvo = async () => {
    const { data } = await api.post("/chat/conversations", { title: "New conversation" });
    setConversations((c) => [data, ...c]);
    setActiveId(data.conversation_id);
    setMessages([]);
    setDrawerOpen(false);
  };

  const deleteConvo = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/chat/conversations/${id}`);
    setConversations((c) => c.filter((x) => x.conversation_id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
  };

  const attachFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/chat/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setAttachments((a) => [...a, data]);
    } catch { toast.error("Attachment upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const removeAttachment = (id) => setAttachments((a) => a.filter((x) => x.attachment_id !== id));

  const send = async () => {
    if ((!input.trim() && attachments.length === 0) || streaming) return;
    let convId = activeId;
    if (!convId) {
      const { data } = await api.post("/chat/conversations", { title: input.slice(0, 40) || "New conversation" });
      setConversations((c) => [data, ...c]);
      convId = data.conversation_id;
      setActiveId(convId);
    }
    const sentAttachments = attachments;
    const assistantId = `a-${Date.now()}`;
    const userMsg = { role: "user", content: input, attachments: sentAttachments, message_id: `u-${Date.now()}` };
    const text = input;
    setInput("");
    setAttachments([]);
    setMessages((m) => [...m, userMsg, { role: "assistant", content: "", message_id: assistantId }]);
    setStreaming(true);

    const patchAssistant = (patch) =>
      setMessages((m) => m.map((msg) => (msg.message_id === assistantId ? { ...msg, ...patch(msg) } : msg)));

    try {
      const token = localStorage.getItem("vault_token");
      const useModel = sentAttachments.length ? "gemini" : model;
      const res = await fetch(`${API}/chat/conversations/${convId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({
          content: text, model: useModel,
          attachments: sentAttachments.map((a) => ({ attachment_id: a.attachment_id, filename: a.filename, content_type: a.content_type })),
        }),
      });
      if (!res.ok) {
        toast.error(`Request failed (${res.status})`);
        patchAssistant(() => ({ content: "Sorry — I couldn't generate a reply. Please try again." }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let errored = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const p of parts) {
          const line = p.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.delta) {
              patchAssistant((msg) => ({ content: msg.content + evt.delta }));
            } else if (evt.sources) {
              patchAssistant(() => ({ sources: evt.sources }));
            } else if (evt.error) {
              errored = true;
              toast.error("AI error: " + evt.error);
            }
          } catch {}
        }
      }
      // Replace an empty assistant bubble (e.g. on stream error) with an inline notice.
      if (errored) patchAssistant((msg) => ({ content: msg.content || "Sorry — I couldn't process that. Please try again." }));
      loadConvos();
    } catch (e) {
      toast.error("Streaming failed");
      patchAssistant((msg) => ({ content: msg.content || "Sorry — the connection dropped. Please try again." }));
    } finally {
      setStreaming(false);
    }
  };

  const extractProfile = async () => {
    if (!activeId) return toast.error("Start a conversation first");
    setExtracting(true);
    try {
      const { data } = await api.post("/profile/extract", { conversation_id: activeId });
      toast.success(`Profile updated (${data.completeness}% complete)`);
    } catch { toast.error("Could not extract profile"); }
    finally { setExtracting(false); }
  };

  const convoList = (suffix = "") => (
    <>
      <div className="p-4 border-b border-border">
        <button onClick={newConvo} data-testid={`new-conversation${suffix}`} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus size={16} weight="bold" /> New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {conversations.map((c) => (
          <button key={c.conversation_id} onClick={() => selectConvo(c.conversation_id)} data-testid={`convo-${c.conversation_id}${suffix}`}
            className={`w-full text-left px-4 py-3 text-sm border-b border-border/60 flex items-center justify-between group transition-colors ${activeId === c.conversation_id ? "bg-secondary" : "hover:bg-secondary/50"}`}>
            <span className="truncate">{c.title}</span>
            <Trash size={15} onClick={(e) => deleteConvo(c.conversation_id, e)} className="opacity-60 lg:opacity-0 group-hover:opacity-100 text-destructive shrink-0 ml-2" />
          </button>
        ))}
        {conversations.length === 0 && <p className="p-4 text-xs text-muted-foreground">No conversations yet.</p>}
      </div>
    </>
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-screen">
      <div className="hidden lg:flex w-72 shrink-0 border-r border-border flex-col bg-card">{convoList("")}</div>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-72 bg-card border-r border-border flex flex-col">{convoList("-m")}</div>
          <div className="flex-1 bg-black/60" onClick={() => setDrawerOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 md:px-6 h-16 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-10">
          <button onClick={() => setDrawerOpen(true)} data-testid="open-convos" className="lg:hidden p-2 -ml-2"><ListBullets size={20} /></button>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading font-bold text-base md:text-lg leading-tight">Advisor</h1>
            <p className="text-[10px] md:text-[11px] text-muted-foreground truncate">Financial · Insurance · Legacy</p>
          </div>
          <select value={model} onChange={(e) => setModel(e.target.value)} data-testid="model-select"
            className="text-xs bg-background border border-input rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="claude">Claude 4.6</option>
            <option value="gemini">Gemini 3.1</option>
          </select>
          <button onClick={extractProfile} disabled={extracting} data-testid="extract-profile" className="flex items-center gap-1 text-xs border border-border px-2 md:px-3 py-1.5 rounded-md hover:bg-secondary transition-colors disabled:opacity-60">
            <Sparkle size={14} weight="duotone" className={extracting ? "animate-spin" : ""} /> <span className="hidden sm:inline">{extracting ? "Saving…" : "Save to profile"}</span>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin px-4 md:px-8 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="max-w-lg mx-auto text-center mt-10 md:mt-16">
              <Robot size={40} weight="duotone" className="text-primary mx-auto mb-4" />
              <h2 className="font-heading text-2xl font-bold">How can I help today?</h2>
              <p className="text-muted-foreground text-sm mt-2">Ask a financial question, attach a statement to review, or tell me about your insurance and next-of-kin.</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.message_id} className={`flex gap-3 max-w-3xl ${m.role === "user" ? "ml-auto flex-row-reverse" : ""}`} data-testid={`message-${m.role}`}>
              <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
                {m.role === "user" ? <User size={16} weight="fill" /> : <Robot size={16} weight="duotone" />}
              </div>
              <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                {(m.attachments || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {m.attachments.map((a) => (
                      <span key={a.attachment_id} className="flex items-center gap-1 text-[11px] bg-black/20 rounded px-2 py-1">
                        <FileIcon size={12} /> {a.filename}
                      </span>
                    ))}
                  </div>
                )}
                {(() => {
                  const clean = (m.content || "").replace(/\[doc:[^\]]+\]/g, "").replace(/[ \t]{2,}/g, " ");
                  return clean || (streaming ? <span className="animate-pulse">▊</span> : "");
                })()}
                {(m.sources || []).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/60" data-testid="message-sources">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Sources</p>
                    <div className="flex flex-wrap gap-1.5">
                      {m.sources.map((sdoc) => (
                        <button key={sdoc.document_id} onClick={() => openPreview(sdoc)} data-testid={`source-${sdoc.document_id}`}
                          className="flex items-center gap-1 text-[11px] bg-secondary hover:bg-primary/15 hover:text-primary rounded-full px-2.5 py-1 transition-colors">
                          <Eye size={12} weight="duotone" /> {sdoc.filename}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {m.role !== "user" && m.content && !streaming && (() => {
                  const playing = audioId === m.message_id;
                  const loading = audioLoading === m.message_id;
                  return (
                    <button onClick={() => speakMessage(m.message_id, m.content)} data-testid="listen-message"
                      className={`mt-2 flex items-center gap-1 text-[11px] transition-colors ${playing ? "text-primary" : "text-muted-foreground hover:text-primary"}`}>
                      {playing ? <Stop size={13} weight="fill" /> : <SpeakerHigh size={13} weight="duotone" className={loading ? "animate-pulse" : ""} />}
                      {loading ? "Preparing…" : playing ? "Stop" : "Listen"}
                    </button>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border p-3 md:p-4 bg-card">
          <div className="max-w-3xl mx-auto">
            {attachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-2" data-testid="attachment-chips">
                {attachments.map((a) => (
                  <span key={a.attachment_id} className="flex items-center gap-1 text-xs bg-secondary rounded-full px-3 py-1.5">
                    <FileIcon size={13} /> <span className="max-w-[140px] truncate">{a.filename}</span>
                    <X size={13} className="cursor-pointer text-muted-foreground hover:text-destructive" onClick={() => removeAttachment(a.attachment_id)} />
                  </span>
                ))}
                <span className="text-[10px] text-muted-foreground">Attachments are analyzed with Gemini</span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" onChange={attachFile} className="hidden" data-testid="chat-file-input" />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="chat-attach" className="p-3 rounded-md border border-border hover:bg-secondary transition-colors disabled:opacity-60">
                <Paperclip size={18} weight={uploading ? "fill" : "regular"} className={uploading ? "animate-pulse" : ""} />
              </button>
              <textarea
                value={input}
                data-testid="chat-input"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1}
                placeholder="Message Everkin…"
                className="flex-1 resize-none bg-background border border-input rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring max-h-40"
              />
              <button onClick={send} disabled={streaming} data-testid="chat-send" className="bg-primary text-primary-foreground p-3 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50">
                <PaperPlaneRight size={18} weight="fill" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.filename || "Document"} testid="doc-preview">
        {preview?.loading && <p className="text-sm text-muted-foreground py-8 text-center">Loading document…</p>}
        {preview && !preview.loading && (
          <div>
            <div className="rounded-md overflow-hidden border border-border bg-background mb-4" style={{ minHeight: 200 }}>
              {(preview.content_type || "").startsWith("image/") ? (
                <img src={preview.url} alt={preview.filename} className="w-full object-contain max-h-[60vh]" />
              ) : (preview.content_type || "").includes("pdf") ? (
                <iframe title="preview" src={preview.url} className="w-full" style={{ height: "60vh" }} />
              ) : preview.text != null ? (
                <pre className="p-4 text-xs whitespace-pre-wrap overflow-auto max-h-[60vh] font-mono" data-testid="preview-text">{preview.text}</pre>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Preview not available for this file type. Use download to open it.
                </div>
              )}
            </div>
            <button onClick={downloadPreview} data-testid="preview-download" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
              <DownloadSimple size={16} weight="bold" /> Download
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
