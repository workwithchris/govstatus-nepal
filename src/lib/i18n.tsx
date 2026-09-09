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
    "nav.services": "Services",
    "nav.metrics": "Metrics",
    "tab.dashboard": "Dashboard",
    "tab.analytics": "Analytics",
    "tab.incidents": "Incidents",
    "status.operational": "Operational",
    "status.degraded": "Degraded",
    "status.down": "Down",
    "metric.total": "Total Monitored",
    "metric.systemStatus": "System Status",
    "metric.avgResponse": "Avg Response Time",
    "metric.portals": "Government portals & public services",
    "status.normal": "All Systems Normal",
    "status.issues": "Service(s) Experiencing Issues",
    "search.placeholder": "Search services…",
    "cat.all": "All",
    "cat.citizen": "Citizen",
    "cat.education": "Education",
    "cat.finance": "Finance",
    "cat.business": "Business",
    "cat.ministry": "Ministry",
    "cat.province": "Province",
    "cat.palika": "Palika",
    "cat.core": "Core",
    "cat.infrastructure": "Infrastructure",
    "sort.label": "Sort",
    "view.grid": "Grid",
    "view.table": "Table",
    "provenance.vantage": "Checked from a Nepal vantage point",
    "incidents.empty": "No incidents recorded",
    "probe.loading": "Checking services…",
  },
  ne: {
    "nav.services": "सेवाहरू",
    "nav.metrics": "तथ्याङ्क",
    "tab.dashboard": "ड्यासबोर्ड",
    "tab.analytics": "विश्लेषण",
    "tab.incidents": "घटनाहरू",
    "status.operational": "सक्रिय",
    "status.degraded": "सुस्त",
    "status.down": "अनुपलब्ध",
    "metric.total": "निगरानीमा रहेका",
    "metric.systemStatus": "प्रणाली स्थिति",
    "metric.avgResponse": "औसत प्रतिक्रिया समय",
    "metric.portals": "सरकारी पोर्टल र सार्वजनिक सेवाहरू",
    "status.normal": "सबै प्रणाली सामान्य",
    "status.issues": "सेवा(हरू)मा समस्या",
    "search.placeholder": "सेवा खोज्नुहोस्…",
    "cat.all": "सबै",
    "cat.citizen": "नागरिक",
    "cat.education": "शिक्षा",
    "cat.finance": "वित्त",
    "cat.business": "व्यापार",
    "cat.ministry": "मन्त्रालय",
    "cat.province": "प्रदेश",
    "cat.palika": "पालिका",
    "cat.core": "मुख्य",
    "cat.infrastructure": "पूर्वाधार",
    "sort.label": "क्रमबद्ध",
    "view.grid": "ग्रिड",
    "view.table": "तालिका",
    "provenance.vantage": "नेपालबाट जाँच गरिएको",
    "incidents.empty": "कुनै घटना अभिलेख छैन",
    "probe.loading": "सेवाहरू जाँच हुँदैछ…",
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