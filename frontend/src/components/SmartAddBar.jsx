import { useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Sparkle, PaperPlaneTilt, Spinner } from "@phosphor-icons/react";

/**
 * SmartAddBar — a chat-style input that lets users describe their data in natural
 * language instead of filling out forms. AI extracts structured data and either:
 *  - saves it to the DB (investment, insurance, contact, profile, life_event), or
 *  - returns extracted params to the parent via onResult (loan_prep, bundle, form_fill)
 *
 * Props:
 *   target: "investment" | "insurance" | "contact" | "profile" | "life_event" | "auto"
 *         | "loan_prep" | "bundle" | "form_fill"   (action targets — return params, don't save)
 *   placeholder: custom placeholder text
 *   onAdded: callback when a record is successfully saved to DB
 *   onResult: callback when an action target returns extracted params (for loan_prep, etc.)
 */
const ACTION_TARGETS = new Set(["loan_prep", "bundle", "form_fill"]);

export default function SmartAddBar({ target = "auto", placeholder, onAdded, onResult }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const isAction = ACTION_TARGETS.has(target);

  const defaultPlaceholder = (() => {
    switch (target) {
      case "investment":
        return 'e.g. "I bought 50 shares of AAPL at $150 last March, now worth $9,200"';
      case "insurance":
        return 'e.g. "I have a term life insurance from LIC, policy LZ123456, sum assured 1 crore, premium 25000 yearly, nominee is my wife Priya"';
      case "contact":
        return 'e.g. "My brother Rajesh is my emergency contact, phone +91 98765 43210, email rajesh@email.com"';
      case "profile":
        return 'e.g. "My name is Shashib, born 15 Aug 1990, work as a hardware engineer at Oxmiq, salary 40L, live in Delhi"';
      case "life_event":
        return 'e.g. "I\'m getting married next month"';
      case "loan_prep":
        return 'e.g. "I need a home loan from HDFC for a new apartment, I\'m salaried"';
      case "bundle":
        return 'e.g. "I need a document bundle for my visa application to the US"';
      case "form_fill":
        return 'e.g. "Fill out a DS-160 visa application form for my trip to the US next month"';
      default:
        return "Tell me about your investments, insurance, contacts, life events, or personal details…";
    }
  })();

  const submit = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      const { data } = await api.post("/chat/smart-add", { text: text.trim(), target });
      if (isAction) {
        // Action target — return params to parent
        if (data.params) {
          toast.success("✓ AI extracted the details — review and proceed below");
          setText("");
          if (onResult) onResult(data.params, data.target);
        } else {
          toast.error("Could not extract data — try rephrasing");
        }
      } else if (data.saved) {
        const label = data.target || target;
        toast.success(`✓ Saved as ${label} — AI extracted the details for you`);
        setText("");
        if (onAdded) onAdded(data);
      } else {
        toast.error("Could not extract data — try rephrasing");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const helperText = isAction
    ? "Describe in natural language — AI fills the fields for you"
    : "Describe in natural language — AI extracts and saves the structured fields for you";

  return (
    <div className="mb-4" data-testid="smart-add-bar">
      <div className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-1.5 text-primary text-xs font-semibold mt-2.5 ml-1 shrink-0">
          <Sparkle size={14} weight="fill" />
          <span className="hidden sm:inline">AI</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={placeholder || defaultPlaceholder}
          rows={2}
          disabled={loading}
          className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
          data-testid="smart-add-input"
        />
        <button
          onClick={submit}
          disabled={loading || !text.trim()}
          className="shrink-0 flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          data-testid="smart-add-submit"
        >
          {loading ? <Spinner size={15} className="animate-spin" /> : <PaperPlaneTilt size={15} weight="fill" />}
          <span className="hidden sm:inline">{loading ? (isAction ? "Working…" : "Saving…") : (isAction ? "Fill" : "Save")}</span>
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5 ml-1">{helperText}</p>
    </div>
  );
}