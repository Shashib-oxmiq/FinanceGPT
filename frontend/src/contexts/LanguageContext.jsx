import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { LANGUAGES, DEFAULT_LANG, translate, getLang, getAILangName, UI_KEYS } from "../lib/i18n";
import { api } from "../lib/api";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem("app_lang") || DEFAULT_LANG;
  });
  const [aiTranslations, setAiTranslations] = useState({});
  const fetchedRef = useRef({});

  // Persist language choice
  useEffect(() => {
    localStorage.setItem("app_lang", lang);
  }, [lang]);

  // Fetch AI translations when language changes (skip English — it's the base)
  useEffect(() => {
    if (lang === DEFAULT_LANG) {
      setAiTranslations({});
      return;
    }
    // Skip if already fetched for this language
    if (fetchedRef.current[lang]) {
      setAiTranslations(fetchedRef.current[lang]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const langInfo = getLang(lang);
        const { data } = await api.post("/i18n/translate", {
          language: lang,
          language_name: langInfo.name,
          keys: UI_KEYS,
        });
        if (!cancelled && data.translations) {
          fetchedRef.current[lang] = data.translations;
          setAiTranslations(data.translations);
        }
      } catch (e) {
        // Silent fail — fallback to English / built-in translations
        console.warn("AI translation fetch failed, using fallback:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [lang]);

  // t() — try AI translation first, then built-in, then English
  const t = useCallback((key) => {
    // AI translation takes priority (covers all 40 languages)
    if (aiTranslations[key]) return aiTranslations[key];
    // Built-in translation (10 languages have manual translations)
    return translate(lang, key);
  }, [lang, aiTranslations]);

  const changeLang = useCallback((code) => {
    setLang(code);
    localStorage.setItem("app_lang", code);
  }, []);

  const value = {
    lang,
    changeLang,
    t,
    currentLang: getLang(lang),
    languages: LANGUAGES,
    aiLangName: getAILangName(lang),
    translationsLoading: lang !== DEFAULT_LANG && !fetchedRef.current[lang],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback if used outside provider — return English defaults
    return {
      lang: DEFAULT_LANG,
      changeLang: () => {},
      t: (k) => translate(DEFAULT_LANG, k),
      currentLang: getLang(DEFAULT_LANG),
      languages: LANGUAGES,
      aiLangName: "English",
      translationsLoading: false,
    };
  }
  return ctx;
}