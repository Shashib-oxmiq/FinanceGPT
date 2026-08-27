import { useState, useRef, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Globe, CaretDown, Check } from "@phosphor-icons/react";

export default function LanguageSwitcher({ compact = false }) {
  const { lang, changeLang, currentLang, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-secondary"
        data-testid="lang-switcher"
      >
        <Globe size={14} weight="duotone" />
        <span className="font-medium">{currentLang.flag}</span>
        {!compact && <span>{currentLang.native}</span>}
        <CaretDown size={10} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-64 max-h-80 overflow-y-auto bg-card border border-border rounded-2xl shadow-xl z-50 p-1.5" data-testid="lang-dropdown">
          {/* Indian languages section */}
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 sticky top-0 bg-card">Indian Languages</p>
          {languages.slice(0, 11).map((l) => (
            <LangRow key={l.code} l={l} active={lang === l.code} onClick={() => { changeLang(l.code); setOpen(false); }} />
          ))}
          <div className="border-t border-border my-1" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 sticky top-0 bg-card">World Languages</p>
          {languages.slice(11).map((l) => (
            <LangRow key={l.code} l={l} active={lang === l.code} onClick={() => { changeLang(l.code); setOpen(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function LangRow({ l, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm transition-colors ${
        active ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary text-foreground"
      }`}
      data-testid={`lang-option-${l.code}`}
    >
      <span className="text-base">{l.flag}</span>
      <span className="flex-1 text-left">
        <span className="block">{l.native}</span>
        <span className="block text-[10px] text-muted-foreground">{l.name}</span>
      </span>
      {active && <Check size={14} weight="bold" className="text-primary" />}
    </button>
  );
}