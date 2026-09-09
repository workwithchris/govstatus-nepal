"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "ne";

const STRINGS = {
  en: {
    "nav.about": "About",
    "tab.dashboard": "Dashboard",
    "tab.analytics": "Analytics",
    "tab.incidents": "Incidents",
    "legend.title": "What the statuses mean",
    "legend.operational.desc": "Responding quickly and normally (HTTP 200–399 under 3.5s).",
    "legend.degraded.desc": "Responding, but slowly (>3.5s), blocked by a firewall (403), or rate-limited (429).",
    "legend.down.desc": "Not reachable: server error (5xx), connection refused, or no response at all.",
    "legend.note": "Status is measured from our probe's vantage point in Nepal. A portal may show \"Down\" here while it works from your ISP, or vice versa.",
    "metric.total": "Total Monitored",
    "metric.systemStatus": "System Status",
    "metric.avgResponse": "Avg Response Time",
    "metric.portals": "Government portals & public services",
    "status.normal": "All Systems Normal",
    "status.issues": "Service(s) Experiencing Issues",
    "provenance.vantage": "Checked from a Nepal vantage point",
  },
  ne: {
    "nav.about": "बारेमा",
    "tab.dashboard": "ड्यासबोर्ड",
    "tab.analytics": "विश्लेषण",
    "tab.incidents": "घटनाहरू",
    "legend.title": "स्थितिको अर्थ",
    "legend.operational.desc": "सामान्य रूपमा छिटो प्रतिक्रिया दिँदै (HTTP 200–399, 3.5 सेकेन्डभित्र)।",
    "legend.degraded.desc": "प्रतिक्रिया दिन्छ, तर ढिलो (>3.5s), फायरवालले रोकेको (403), वा दर-सीमित (429)।",
    "legend.down.desc": "पुग्न नसकिने: सर्भर त्रुटि (5xx), जडान अस्वीकृत, वा कुनै प्रतिक्रिया छैन।",
    "legend.note": "स्थिति हाम्रो नेपालस्थित प्रोबबाट मापन गरिएको हो। कुनै पोर्टल यहाँ \"अनुपलब्ध\" देखिए पनि तपाईंको ISP बाट काम गर्न सक्छ, वा उल्टो।",
    "metric.total": "निगरानीमा रहेका",
    "metric.systemStatus": "प्रणाली स्थिति",
    "metric.avgResponse": "औसत प्रतिक्रिया समय",
    "metric.portals": "सरकारी पोर्टल र सार्वजनिक सेवाहरू",
    "status.normal": "सबै प्रणाली सामान्य",
    "status.issues": "सेवा(हरू)मा समस्या",
    "provenance.vantage": "नेपालबाट जाँच गरिएको",
  },
} as const;

export type TranslationKey = keyof (typeof STRINGS)["en"];

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

const STORAGE_KEY = "govstatus-lang";

/** Read the persisted language (client-only; SSR returns "en"). */
function readStoredLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "ne" ? "ne" : "en";
  } catch {
    return "en";
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* no storage */
    }
  };

  const t = (key: TranslationKey) => STRINGS[lang][key];

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}