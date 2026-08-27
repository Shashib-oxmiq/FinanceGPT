import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { useTts } from "../lib/audio";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { getAILangName } from "../lib/i18n";
import {
  PaperPlaneRight, Plus, Trash, Sparkle, User, Robot, Paperclip, X, ListBullets,
  File as FileIcon, Eye, DownloadSimple, SpeakerHigh, Stop, SignOut, Sun, MoonStars,
  House, Bell, ChartLineUp, TrendUp, Bank, Confetti, IdentificationCard, ShieldCheck,
  Vault as VaultIcon, EnvelopeSimple, FileText, Package, HandHeart, List, ChatCircleText,
  CloudArrowUp, CloudCheck, CloudSlash, Spinner,
} from "@phosphor-icons/react";
import Modal from "../components/Modal";
import LanguageSwitcher from "../components/LanguageSwitcher";

// ── Tools nav (secondary links in the sidebar) ────────────────────────────
const TOOLS = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: House },
  { to: "/reminders", labelKey: "nav.reminders", icon: Bell, badge: true },
  { to: "/insights", labelKey: "nav.insights", icon: ChartLineUp },
  { to: "/investments", labelKey: "nav.investments", icon: TrendUp },
  { to: "/loans", labelKey: "nav.loan_prep", icon: Bank },
  { to: "/life-events", labelKey: "nav.life_events", icon: Confetti },
  { to: "/profile", labelKey: "nav.profile", icon: IdentificationCard },
  { to: "/insurance", labelKey: "nav.insurance", icon: ShieldCheck },
  { to: "/vault", labelKey: "nav.vault", icon: VaultIcon },
  { to: "/gmail", labelKey: "nav.gmail", icon: EnvelopeSimple },
  { to: "/forms", labelKey: "nav.form_filler", icon: FileText },
  { to: "/bundler", labelKey: "nav.bundler", icon: Package },
  { to: "/legacy", labelKey: "nav.legacy", icon: HandHeart },
];

const TPL_NAMES = {
  rental_agreement: "Rental Agreement",
  nda: "Non-Disclosure Agreement",
  will: "Last Will and Testament",
  employment_contract: "Employment Agreement",
  loan_agreement: "Loan Agreement",
  power_of_attorney: "Power of Attorney",
  partnership_deed: "Partnership Deed",
  sale_deed: "Sale Deed",
};

export default function Chat() {
  const { user, logout } = useAuth();
  const { lang, changeLang, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeId: audioId, loadingId: audioLoading, speak } = useTts();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("yolo");
  const [streaming, setStreaming] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  const [reminderCount, setReminderCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState(null);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  // ── Theme + reminders + sync ──────────────────────────────────────────────
  useEffect(() => {
    api.get("/reminders").then(({ data }) => setReminderCount(data.count || 0)).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    let timer;
    const checkSync = () => {
      api.get("/sync/status").then(({ data }) => setSyncStatus(data)).catch(() => {});
    };
    checkSync();
    timer = setInterval(checkSync, 30000);
    return () => clearInterval(timer);
  }, []);

  const triggerSync = async () => {
    try {
      await api.post("/sync/now");
      toast.success("Cloud sync triggered");
      api.get("/sync/status").then(({ data }) => setSyncStatus(data)).catch(() => {});
    } catch {
      toast.error("Sync failed");
    }
  };

  const toggleTheme = () => {
    const el = document.documentElement;
    if (el.classList.contains("dark")) {
      el.classList.remove("dark");
      localStorage.setItem("vault_theme", "light");
      setDark(false);
    } else {
      el.classList.add("dark");
      localStorage.setItem("vault_theme", "dark");
      setDark(true);
    }
  };

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  // ── Chat functions ─────────────────────────────────────────────────────────
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

  // ── File attachment: store locally (instant), upload on Send ────────────────
  // Pending files are held as { file, id } objects — no network call on selection.
  const [pendingFiles, setPendingFiles] = useState([]);

  const attachFile = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    // Instantly add to the attachment chips — no upload, no delay
    const pending = files.map((f) => ({ id: `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file: f }));
    setPendingFiles((p) => [...p, ...pending]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePendingFile = (id) => setPendingFiles((p) => p.filter((f) => f.id !== id));
  const removeAttachment = (id) => setAttachments((a) => a.filter((x) => x.attachment_id !== id));

  const send = async () => {
    if ((!input.trim() && pendingFiles.length === 0 && attachments.length === 0) || streaming) return;

    // Upload pending files now (on Send, not on selection)
    let uploadedAttachments = [...attachments];
    if (pendingFiles.length > 0) {
      setUploading(true);
      for (const pf of pendingFiles) {
        const fd = new FormData();
        fd.append("file", pf.file);
        try {
          const { data } = await api.post("/chat/upload", fd);
          if (data.duplicate) {
            toast.warning(`⚠ "${data.existing_filename}" is already in your Vault — duplicate skipped`);
          } else {
            uploadedAttachments.push(data);
          }
        } catch { toast.error(`Failed to upload ${pf.file.name}`); }
      }
      setUploading(false);
      setPendingFiles([]);
    }

    let convId = activeId;
    if (!convId) {
      const { data } = await api.post("/chat/conversations", { title: input.slice(0, 40) || "New conversation" });
      setConversations((c) => [data, ...c]);
      convId = data.conversation_id;
      setActiveId(convId);
    }
    const sentAttachments = uploadedAttachments;
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
      const res = await fetch(`${API}/chat/conversations/${convId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          content: text,
          model,
          language: lang,
          attachments: sentAttachments.map((a) => ({
            attachment_id: a.attachment_id,
            filename: a.filename,
            content_type: a.content_type,
          })),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let errored = false;
      let buf = "";
      let fullText = "";
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
              fullText += evt.delta;
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
      // ── Detect [LANG_CHANGE:xx] marker from AI response ──
      const langMatch = fullText.match(/\[LANG_CHANGE:([a-z]{2})\]/i);
      if (langMatch) {
        const newLang = langMatch[1].toLowerCase();
        changeLang(newLang);
        // Strip the marker from the displayed message
        const cleanText = fullText.replace(/\[LANG_CHANGE:[a-z]{2}\]/gi, "").trim();
        patchAssistant(() => ({ content: cleanText }));
        const langMap = {
          en: "English", hi: "हिन्दी", bn: "বাংলা", ta: "தமிழ்", te: "తెలుగు",
          mr: "मराठी", gu: "ગુજરાતી", kn: "ಕನ್ನಡ", ml: "മലയാളം", pa: "ਪੰਜਾਬੀ",
          or: "ଓଡ଼ିଆ", es: "Español", fr: "Français", de: "Deutsch", zh: "中文",
          ja: "日本語", ko: "한국어", pt: "Português", ru: "Русский", ar: "العربية",
          it: "Italiano", nl: "Nederlands", tr: "Türkçe", pl: "Polski", sv: "Svenska",
          id: "Bahasa Indonesia", th: "ไทย", vi: "Tiếng Việt", fa: "فارسی", he: "עברית",
          uk: "Українська", el: "Ελληνικά", cs: "Čeština", ro: "Română", hu: "Magyar",
          fi: "Suomi", da: "Dansk", no: "Norsk", ms: "Bahasa Melayu", fil: "Filipino",
          sw: "Kiswahili",
        };
        toast.success(`App language changed to ${langMap[newLang] || newLang}`);
      }

      // ── Detect [INV_ADD:...], [INV_EDIT:...], [INV_DELETE:...] markers ──
      const invAddMatches = [...fullText.matchAll(/\[INV_ADD:(\{[^}]+\})\]/g)];
      const invEditMatches = [...fullText.matchAll(/\[INV_EDIT:(\{[^}]+\})\]/g)];
      const invDeleteMatches = [...fullText.matchAll(/\[INV_DELETE:([^\]]+)\]/g)];
      let cleanInvText = fullText;
      let invActionCount = 0;

      for (const m of invAddMatches) {
        try {
          const data = JSON.parse(m[1]);
          await api.post("/investments/chat-action", { action: "add", data });
          invActionCount++;
        } catch (e) { console.warn("INV_ADD failed:", e); }
        cleanInvText = cleanInvText.replace(m[0], "");
      }
      for (const m of invEditMatches) {
        try {
          const parsed = JSON.parse(m[1]);
          await api.post("/investments/chat-action", { action: "edit", name: parsed.name, updates: parsed.updates || parsed });
          invActionCount++;
        } catch (e) { console.warn("INV_EDIT failed:", e); }
        cleanInvText = cleanInvText.replace(m[0], "");
      }
      for (const m of invDeleteMatches) {
        try {
          const name = m[1].trim();
          await api.post("/investments/chat-action", { action: "delete", name });
          invActionCount++;
        } catch (e) { console.warn("INV_DELETE failed:", e); }
        cleanInvText = cleanInvText.replace(m[0], "");
      }
      if (invActionCount > 0) {
        // Strip markers from displayed message
        patchAssistant(() => ({ content: cleanInvText.replace(/\[LANG_CHANGE:[a-z]{2}\]/gi, "").trim() }));
        toast.success(`${invActionCount} investment ${invActionCount === 1 ? "change" : "changes"} applied`);
      }

      // ── Detect [DOC_GEN:...] marker for document generation ──
      const docGenMatches = [...fullText.matchAll(/\[DOC_GEN:(\{[^}]*(?:\{[^}]*\}[^}]*)*\})\]/g)];
      let cleanDocText = fullText;
      let docGenCount = 0;
      for (const m of docGenMatches) {
        try {
          const parsed = JSON.parse(m[1]);
          const fmt = parsed.format || "pdf";
          const tplId = parsed.template_id;
          const tplData = parsed.data || {};
          // Call generate endpoint and download the file
          const response = await api.post(
            "/documents/generate",
            { template_id: tplId, format: fmt, data: tplData },
            { responseType: "blob" }
          );
          // Download the file
          const tplName = TPL_NAMES[tplId] || tplId;
          const ext = fmt === "pdf" ? "pdf" : "docx";
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const a = document.createElement("a");
          a.href = url;
          a.download = `${tplName.replace(/\s+/g, "_")}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          docGenCount++;
        } catch (e) { console.warn("DOC_GEN failed:", e); }
        cleanDocText = cleanDocText.replace(m[0], "");
      }
      if (docGenCount > 0) {
        patchAssistant(() => ({ content: cleanDocText.replace(/\[LANG_CHANGE:[a-z]{2}\]/gi, "").replace(/\[INV_[A-Z]+:[^\]]*\]/g, "").trim() }));
        toast.success(`${docGenCount} document${docGenCount > 1 ? "s" : ""} generated and downloaded`);
      }

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

  // ── Sidebar (ChatGPT-style) ────────────────────────────────────────────────
  const SidebarContent = (suffix = "") => (
    <div className="flex flex-col h-full">
      {/* Brand + New Chat */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2 px-2 mb-3">
          <Robot size={22} weight="duotone" className="text-primary" />
          <span className="font-heading font-black text-base tracking-tight">EVERKIN</span>
          <span className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground ml-auto">{t("chat.title")}</span>
        </div>
        <button onClick={newConvo} data-testid={`new-conversation${suffix}`} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border transition-all hover:shadow-sm">
          <Plus size={16} weight="bold" /> {t("chat.new_conversation")}
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto scroll-thin">
        {conversations.map((c) => (
          <button key={c.conversation_id} onClick={() => selectConvo(c.conversation_id)} data-testid={`convo-${c.conversation_id}${suffix}`}
            className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between group transition-all rounded-xl mx-1 ${activeId === c.conversation_id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"}`}>
            <span className="truncate flex items-center gap-2">
              <ChatCircleText size={14} weight="duotone" className="shrink-0 opacity-50" />
              {c.title}
            </span>
            <Trash size={14} onClick={(e) => deleteConvo(c.conversation_id, e)} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-destructive shrink-0 ml-2" />
          </button>
        ))}
        {conversations.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">No conversations yet.</p>}
      </div>

      {/* Tools section (collapsible) */}
      <div className="border-t border-border">
        <button onClick={() => setToolsOpen(!toolsOpen)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors rounded-xl mx-1">
          <List size={16} weight="duotone" />
          <span>{t("chat.tools")}</span>
          <ChevronIcon open={toolsOpen} />
        </button>
        {toolsOpen && (
          <div className="pb-1">
            {TOOLS.map((item) => {
              const Active = location.pathname === item.to;
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to} data-testid={`nav-${item.to.slice(1)}${suffix}`}
                  className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-all rounded-xl mx-1 ${Active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"}`}>
                  <Icon size={16} weight={Active ? "fill" : "duotone"} />
                  <span className="flex-1">{t(item.labelKey)}</span>
                  {item.badge && reminderCount > 0 && (
                    <span data-testid={`reminder-badge${suffix}`} className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center">
                      {reminderCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* User profile + controls */}
      {/* Sync status + user profile */}
      <div className="border-t border-border p-3">
        {/* Cloud sync indicator */}
        {syncStatus && (
          <button
            onClick={triggerSync}
            data-testid={`sync-button${suffix}`}
            className="w-full flex items-center gap-2 px-2.5 py-2 mb-2 rounded-xl text-xs hover:bg-secondary transition-colors"
            title={syncStatus.enabled ? `Last sync: ${syncStatus.last_sync || "never"}` : "Cloud sync not configured"}
          >
            {syncStatus.syncing ? (
              <Spinner size={14} weight="duotone" className="animate-spin text-primary shrink-0" />
            ) : !syncStatus.enabled ? (
              <CloudSlash size={14} weight="duotone" className="text-muted-foreground shrink-0" />
            ) : syncStatus.online ? (
              <CloudCheck size={14} weight="duotone" className="text-accent shrink-0" />
            ) : (
              <CloudArrowUp size={14} weight="duotone" className="text-muted-foreground shrink-0" />
            )}
            <span className={syncStatus.enabled && syncStatus.online ? "text-foreground font-medium" : "text-muted-foreground"}>
              {!syncStatus.enabled
                ? t("sync.off")
                : syncStatus.syncing
                ? t("sync.syncing")
                : syncStatus.online
                ? t("sync.cloud_synced")
                : t("sync.offline")}
            </span>
            {syncStatus.last_sync && syncStatus.enabled && (
              <span className="ml-auto text-[9px] text-muted-foreground">
                {new Date(syncStatus.last_sync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </button>
        )}
        {/* Language switcher */}
        <div className="mb-2">
          <LanguageSwitcher />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{user?.name || "User"}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button onClick={toggleTheme} data-testid={`theme-toggle${suffix}`} className="p-2 rounded-xl hover:bg-secondary transition-colors shrink-0">
            {dark ? <Sun size={16} weight="duotone" /> : <MoonStars size={16} weight="duotone" />}
          </button>
          <button onClick={doLogout} data-testid={`logout-button${suffix}`} className="p-2 rounded-xl hover:bg-secondary text-destructive transition-colors shrink-0">
            <SignOut size={16} weight="duotone" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-72 shrink-0 border-r border-border flex-col bg-card z-30">
        {SidebarContent("")}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-72 bg-card border-r border-border">{SidebarContent("-m")}</div>
          <div className="flex-1 bg-black/60" onClick={() => setDrawerOpen(false)} />
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border bg-card/80 backdrop-blur-xl">
          <button onClick={() => setDrawerOpen(true)} data-testid="open-convos" className="md:hidden p-2 -ml-2">
            <ListBullets size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading font-bold text-sm md:text-base leading-tight">AI Advisor</h1>
            <p className="text-[10px] text-muted-foreground truncate">Financial · Insurance · Legacy</p>
          </div>
          <select value={model} onChange={(e) => setModel(e.target.value)} data-testid="model-select"
            className="text-xs bg-background border border-input rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
            <option value="yolo">Yolo-Auto · qwen3.8-27b</option>
            <option value="claude">Claude 4.6</option>
            <option value="gemini">Gemini 3.1</option>
          </select>
          <button onClick={extractProfile} disabled={extracting} data-testid="extract-profile" className="flex items-center gap-1 text-xs border border-border px-2 md:px-3 py-1.5 rounded-xl hover:bg-secondary transition-colors disabled:opacity-60">
            <Sparkle size={14} weight="duotone" className={extracting ? "animate-spin" : ""} /> <span className="hidden sm:inline">{extracting ? "Saving…" : "Save to profile"}</span>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="max-w-lg mx-auto text-center mt-10 md:mt-20">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                  <Robot size={32} weight="duotone" />
                </div>
                <h2 className="font-heading text-xl font-bold mb-2">{t("chat.empty.state")}</h2>
                <p className="text-muted-foreground text-sm">Ask a financial question, attach a statement to review, or tell me about your insurance and next-of-kin.</p>
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    "What insurance do I need for my family?",
                    "Analyze my investment portfolio",
                    "Help me plan for a home loan",
                    "What should my next-of-kin know?",
                  ].map((s) => (
                    <button key={s} onClick={() => { setInput(s); }} className="text-left text-xs px-4 py-3 rounded-2xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground hover:shadow-sm">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.message_id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""} animate-[msg-in_0.3s_ease-out]`} data-testid={`message-${m.role}`}>
                {m.role === "assistant" && (
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-sm">
                    <Robot size={18} weight="duotone" />
                  </div>
                )}
                <div className={`rounded-3xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-w-[85%] shadow-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                  {(m.attachments || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {m.attachments.map((a) => (
                        <span key={a.attachment_id} className="flex items-center gap-1 text-[11px] bg-black/20 rounded-2xl px-2 py-1">
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
                {m.role === "user" && (
                  <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
                    <User size={18} weight="fill" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-border p-3 md:p-4 bg-card">
          <div className="max-w-3xl mx-auto">
            {/* Pending files (not yet uploaded — uploaded on Send) */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-2" data-testid="pending-chips">
                {pendingFiles.map((pf) => (
                  <span key={pf.id} className="flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1.5">
                    <FileIcon size={13} /> <span className="max-w-[140px] truncate">{pf.file.name}</span>
                    <span className="text-[10px] text-muted-foreground">{(pf.file.size / 1024).toFixed(0)}KB</span>
                    <X size={13} className="cursor-pointer text-muted-foreground hover:text-destructive" onClick={() => removePendingFile(pf.id)} />
                  </span>
                ))}
                <span className="text-[10px] text-muted-foreground">{t("chat.upload_on_send")}</span>
              </div>
            )}
            {/* Already-uploaded attachments (from history) */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-2" data-testid="attachment-chips">
                {attachments.map((a) => (
                  <span key={a.attachment_id} className="flex items-center gap-1 text-xs bg-secondary rounded-full px-3 py-1.5">
                    <FileIcon size={13} /> <span className="max-w-[140px] truncate">{a.filename}</span>
                    <X size={13} className="cursor-pointer text-muted-foreground hover:text-destructive" onClick={() => removeAttachment(a.attachment_id)} />
                  </span>
                ))}
                <span className="text-[10px] text-muted-foreground">Analyzed with AI</span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" onChange={attachFile} className="hidden" data-testid="chat-file-input" />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="chat-attach" className="p-3 rounded-2xl border border-border hover:bg-secondary transition-colors disabled:opacity-60">
                <Paperclip size={18} weight={uploading ? "fill" : "regular"} className={uploading ? "animate-pulse" : ""} />
              </button>
              <textarea
                value={input}
                data-testid="chat-input"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1}
                placeholder={t("chat.placeholder")}
                className="flex-1 resize-none bg-background border border-input rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring max-h-40"
              />
              <button onClick={send} disabled={streaming} data-testid="chat-send" className="bg-primary text-primary-foreground p-3 rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-50">
                <PaperPlaneRight size={18} weight="fill" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Document preview modal */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.filename || "Document"} testid="doc-preview">
        {preview?.loading && <p className="text-sm text-muted-foreground py-8 text-center">Loading document…</p>}
        {preview && !preview.loading && (
          <div>
            <div className="rounded-xl overflow-hidden border border-border bg-background mb-4" style={{ minHeight: 200 }}>
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
            <button onClick={downloadPreview} data-testid="preview-download" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
              <DownloadSimple size={16} weight="bold" /> Download
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// Small chevron icon for collapsible Tools section
function ChevronIcon({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} fill="currentColor">
      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}