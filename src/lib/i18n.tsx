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
    "search.placeholder": "Search services…",
    "search.aria": "Search services",
    "sort.aria": "Sort services",
    "sort.status": "Status",
    "sort.name": "Name",
    "sort.latency": "Latency",
    "view.aria": "Switch view",
    "view.grid": "Card grid view",
    "view.table": "Table view",
    "table.service": "Service",
    "table.category": "Category",
    "table.status": "Status",
    "table.latency": "Latency",
    "table.open": "Open service",
    "category.all": "All",
    "category.citizen": "Citizen",
    "category.education": "Education",
    "category.finance": "Finance",
    "category.business": "Business",
    "category.ministry": "Ministry",
    "category.province": "Province",
    "category.palika": "Palika",
    "category.core": "Core",
    "category.infrastructure": "Infrastructure",
    "empty.title": "No services found",
    "empty.body": "Try a different search term or category.",
    "error.title": "Couldn't load status",
    "error.body":
      "The status service didn't respond. Check your connection and try again.",
    "error.retry": "Try again",
    "legend.title": "What the statuses mean",
    "legend.operational.desc":
      "Responding quickly and normally (HTTP 200–399 under 3.5s).",
    "legend.degraded.desc":
      "Responding, but slowly (>3.5s), blocked by a firewall (403), or rate-limited (429).",
    "legend.down.desc":
      "Not reachable: server error (5xx), connection refused, or no response at all.",
    "legend.note":
      'Status is measured from our probe\'s vantage point in Nepal. A portal may show "Down" here while it works from your ISP, or vice versa.',
    "metric.total": "Total Monitored",
    "metric.systemStatus": "System Status",
    "metric.avgResponse": "Avg Response Time",
    "metric.portals": "Government portals & public services",
    "status.normal": "All Systems Normal",
    "status.issues": "Service(s) Experiencing Issues",
    "provenance.vantage": "Checked by our own probe",
    "provenance.simulated": " · showing simulated history (database off)",
    "provenance.stale": " · last real check {min} min ago",
    "provenance.justNow": " · updated just now",
    "provenance.updated": " · updated {min} min ago",
    "provenance.note":
      "🇳🇵 Down may mean unreachable from the probe, not from your ISP.",
    "simulated.title": "Simulated history.",
    "simulated.body":
      "Live probing is working, but status history is fabricated because the database is not connected.",
    "detail.lastChecked": "Last checked",
    "detail.statusPage": "Status page",
    "detail.open": "Open",
    "detail.tlsUnknown": "TLS certificate expiry unknown",
    "detail.tlsExpires": "TLS certificate expires",
    "detail.expired": "expired",
    "detail.daysLeft": "{days}d left",
    "footer.tagline":
      "IsGovOnline — an independent uptime tracker for Nepal's digital public services. Not affiliated with any government body.",
    "footer.about": "About",
    "footer.methodology": "Methodology",
    "footer.privacy": "Privacy",
    "footer.terms": "Terms",
    "footer.probes": "🇳🇵 Live status · probes every 5 min",
    "about.eyebrow": "About · IsGovOnline",
    "about.title": "Why this exists",
    "about.intro":
      "Digital government services are becoming essential infrastructure in Nepal — but when one stops working, there's no public record of it. This project makes that invisible failure visible.",
    "about.problem.title": "The problem",
    "about.problem.p1":
      "Passport booking, tax filing, driving licenses, exam results, land records — these aren't optional extras, they're how citizens interact with the state. When the passport portal is down, people don't have a convenient alternative; they wait.",
    "about.problem.p2":
      "Yet there's no public, neutral record of whether these systems are up, how often they fail, or which ones are chronically unreliable. Government bodies publish their own notices, but an independent, continuously-measured view helps citizens plan around outages and helps agencies see their own reliability honestly.",
    "about.does.title": "What this project does",
    "about.does.p1":
      "We check {count} government portals and public services — ministries, citizen services, banks, universities, municipalities, provinces — and record whether each one is operational, degraded, or down. The dashboard fetches the latest reading live in your browser.",
    "about.does.p2":
      "Each result is measured by our own probe, and a \"down\" reading is confirmed with a second probe before it is shown — so a single flaky request doesn't read as an outage.",
    "about.does.p3":
      "It's an independent tracker. We're not affiliated with any government body, and we don't host any of the services we monitor.",
    "about.measure.title": "🇳🇵 How status is measured",
    "about.measure.intro":
      "Status is measured directly by our own probe:",
    "about.measure.operational": "responding normally under 3.5s.",
    "about.measure.degraded":
      "responding slowly, blocked by a firewall (403), or rate-limited (429).",
    "about.measure.down":
      "unreachable — server error, connection refused, or no response.",
    "about.measure.note":
      "A service that works from your network may show as down from our probe (or the reverse) — many .np portals filter traffic by region. We report what we measure, honestly.",
    "about.honesty.title": "Data honesty",
    "about.honesty.body":
      'We never fabricate a status. Every reading comes from a real probe of the service, and a "down" result is confirmed before it is displayed. If we can\'t measure a service, we say so rather than guessing.',
    "about.bigger.title": "The bigger question",
    "about.bigger.body":
      "Reliability data has a purpose beyond reporting: if it's public and continuous, the people running these services can see their own record, and citizens can hold the systems they depend on to a standard. A government whose portals are chronically down is a government that's harder to reach — and the first step toward fixing that is being able to see it clearly.",
    "meth.eyebrow": "Methodology · IsGovOnline",
    "meth.title": "How status is measured",
    "meth.intro":
      "Status is measured by our own probe and shown live — never scraped, cached from a third party, or estimated.",
    "meth.probing.title": "Probing",
    "meth.probing.p1":
      "Each service is fetched over HTTPS and classified as operational (responds normally under 3.5s), degraded (slow, blocked by a firewall with 403, or rate-limited with 429), or down (5xx, connection refused, or no response). Readings refresh about every 5 minutes.",
    "meth.probing.p2":
      'A "down" result is confirmed with a second probe before it is shown, which cuts false alarms on flaky .np infrastructure. Deep checks — a key API or login page, where configured — are probed too, and the worse result wins.',
    "meth.recording.title": "Reporting",
    "meth.recording.p1":
      'The dashboard shows each service\'s current status, response time, and HTTP code, measured by our own probe. A "down" result is confirmed with a second probe before it is reported, which cuts false alarms on flaky .np infrastructure.',
    "meth.recording.p2":
      "We never fabricate a status: if a probe fails, the service is re-checked, and only a repeated failure is shown as down. When a service can't be measured at all, it's flagged rather than assumed to be up.",
    "meth.caveats.title": "Caveats",
    "meth.caveats.body":
      "Status is vantage-relative. A service that works from your network may look down from our probe (or the reverse) — many .np portals filter traffic by region or reject non-browser clients. We report what we measure, from where we measure it.",
  },
  ne: {
    "nav.about": "बारेमा",
    "search.placeholder": "सेवाहरू खोज्नुहोस्…",
    "search.aria": "सेवाहरू खोज्नुहोस्",
    "sort.aria": "सेवाहरू क्रमबद्ध गर्नुहोस्",
    "sort.status": "स्थिति",
    "sort.name": "नाम",
    "sort.latency": "लेटेन्सी",
    "view.aria": "दृश्य परिवर्तन गर्नुहोस्",
    "view.grid": "कार्ड ग्रिड दृश्य",
    "view.table": "तालिका दृश्य",
    "table.service": "सेवा",
    "table.category": "श्रेणी",
    "table.status": "स्थिति",
    "table.latency": "लेटेन्सी",
    "table.open": "सेवा खोल्नुहोस्",
    "category.all": "सबै",
    "category.citizen": "नागरिक",
    "category.education": "शिक्षा",
    "category.finance": "वित्त",
    "category.business": "व्यापार",
    "category.ministry": "मन्त्रालय",
    "category.province": "प्रदेश",
    "category.palika": "पालिका",
    "category.core": "मुख्य",
    "category.infrastructure": "पूर्वाधार",
    "empty.title": "कुनै सेवा भेटिएन",
    "empty.body": "अर्को खोज शब्द वा श्रेणी प्रयास गर्नुहोस्।",
    "error.title": "स्थिति लोड गर्न सकिएन",
    "error.body":
      "स्थिति सेवाले प्रतिक्रिया दिएन। जडान जाँच गरी पुनः प्रयास गर्नुहोस्।",
    "error.retry": "पुनः प्रयास गर्नुहोस्",
    "legend.title": "स्थितिको अर्थ",
    "legend.operational.desc":
      "सामान्य रूपमा छिटो प्रतिक्रिया दिँदै (HTTP 200–399, 3.5 सेकेन्डभित्र)।",
    "legend.degraded.desc":
      "प्रतिक्रिया दिन्छ, तर ढिलो (>3.5s), फायरवालले रोकेको (403), वा दर-सीमित (429)।",
    "legend.down.desc":
      "पुग्न नसकिने: सर्भर त्रुटि (5xx), जडान अस्वीकृत, वा कुनै प्रतिक्रिया छैन।",
    "legend.note":
      "स्थिति हाम्रो नेपालस्थित प्रोबबाट मापन गरिएको हो। कुनै पोर्टल यहाँ \"अनुपलब्ध\" देखिए पनि तपाईंको ISP बाट काम गर्न सक्छ, वा उल्टो।",
    "metric.total": "निगरानीमा रहेका",
    "metric.systemStatus": "प्रणाली स्थिति",
    "metric.avgResponse": "औसत प्रतिक्रिया समय",
    "metric.portals": "सरकारी पोर्टल र सार्वजनिक सेवाहरू",
    "status.normal": "सबै प्रणाली सामान्य",
    "status.issues": "सेवा(हरू)मा समस्या",
    "provenance.vantage": "हाम्रो आफ्नै प्रोबबाट जाँच",
    "provenance.simulated": " · नक्कली इतिहास देखाइँदै (डाटाबेस बन्द)",
    "provenance.stale": " · अन्तिम वास्तविक जाँच {min} मिनेट अघि",
    "provenance.justNow": " · भर्खरै अद्यावधिक",
    "provenance.updated": " · {min} मिनेट अघि अद्यावधिक",
    "provenance.note":
      "🇳🇵 यहाँ \"अनुपलब्ध\" भन्नाले प्रोबबाट पुग्न नसकेको हो, तपाईंको ISP बाट होइन।",
    "simulated.title": "नक्कली इतिहास।",
    "simulated.body":
      "प्रत्यक्ष प्रोबिङ चलिरहेको छ, तर डाटाबेस जडान नभएकाले स्थिति इतिहास नक्कली हो।",
    "detail.lastChecked": "अन्तिम जाँच",
    "detail.statusPage": "स्थिति पृष्ठ",
    "detail.open": "खोल्नुहोस्",
    "detail.tlsUnknown": "TLS प्रमाणपत्रको म्याद थाहा छैन",
    "detail.tlsExpires": "TLS प्रमाणपत्रको म्याद सकिन्छ",
    "detail.expired": "म्याद सकियो",
    "detail.daysLeft": "{days} दिन बाँकी",
    "footer.tagline":
      "IsGovOnline — नेपालका डिजिटल सार्वजनिक सेवाहरूको स्वतन्त्र अपटाइम ट्र्याकर। कुनै सरकारी निकायसँग सम्बद्ध छैन।",
    "footer.about": "बारेमा",
    "footer.methodology": "कार्यविधि",
    "footer.privacy": "गोपनीयता",
    "footer.terms": "सर्तहरू",
    "footer.probes": "🇳🇵 प्रत्यक्ष स्थिति · प्रोब हरेक ५ मिनेट",
    "about.eyebrow": "बारेमा · IsGovOnline",
    "about.title": "यो किन छ",
    "about.intro":
      "नेपालमा डिजिटल सरकारी सेवाहरू आवश्यक पूर्वाधार बन्दैछन् — तर कुनै सेवा बन्द हुँदा त्यसको सार्वजनिक अभिलेख हुँदैन। यो परियोजनाले त्यो अदृश्य असफलता देखिने बनाउँछ।",
    "about.problem.title": "समस्या",
    "about.problem.p1":
      "राहदानी बुकिङ, कर फाइलिङ, चालक अनुमति, परीक्षा नतिजा, जग्गा अभिलेख — यी वैकल्पिक होइनन्, नागरिकले राज्यसँग अन्तरक्रिया गर्ने माध्यम हुन्। राहदानी पोर्टल बन्द हुँदा मानिससँग सजिलो विकल्प हुँदैन; उनीहरू पर्खन्छन्।",
    "about.problem.p2":
      "तैपनि यी प्रणाली चालु छन् कि छैनन्, कति पटक असफल हुन्छन्, वा कुन भरपर्दो छैनन् भन्ने सार्वजनिक, तटस्थ अभिलेख छैन। यो स्वतन्त्र, निरन्तर मापनले नागरिकलाई योजना बनाउन र निकायहरूलाई आफ्नै विश्वसनीयता इमानदारीपूर्वक देख्न मद्दत गर्छ।",
    "about.does.title": "यो परियोजनाले के गर्छ",
    "about.does.p1":
      "हामी {count} सरकारी पोर्टल र सार्वजनिक सेवाहरू जाँच्छौं — मन्त्रालय, नागरिक सेवा, बैंक, विश्वविद्यालय, नगरपालिका, प्रदेश — र प्रत्येक सञ्चालनमा, कमजोर, वा बन्द छ कि छैन अभिलेख गर्छौं। ड्यासबोर्डले तपाईंको ब्राउजरमै प्रत्यक्ष नवीनतम पठन देखाउँछ।",
    "about.does.p2":
      "प्रत्येक नतिजा हाम्रो आफ्नै प्रोबले मापन गर्छ, र \"बन्द\" नतिजा देखाउनुअघि दोस्रो प्रोबले पुष्टि गर्छ — त्यसैले एउटा अस्थिर अनुरोधलाई आउटेज मानिँदैन।",
    "about.does.p3":
      "यो स्वतन्त्र ट्र्याकर हो। हामी कुनै सरकारी निकायसँग सम्बद्ध छैनौं, र हामीले निगरानी गर्ने सेवाहरू होस्ट गर्दैनौं।",
    "about.measure.title": "🇳🇵 स्थिति कसरी मापन गरिन्छ",
    "about.measure.intro":
      "स्थिति हाम्रो आफ्नै प्रोबले सिधै मापन गर्छ:",
    "about.measure.operational": "३.५ सेकेन्डभित्र सामान्य रूपमा प्रतिक्रिया दिँदै।",
    "about.measure.degraded":
      "ढिलो प्रतिक्रिया, फायरवालले रोकेको (403), वा दर-सीमित (429)।",
    "about.measure.down":
      "पुग्न नसकिने — सर्भर त्रुटि, जडान अस्वीकृत, वा प्रतिक्रिया छैन।",
    "about.measure.note":
      "तपाईंको नेटवर्कबाट चल्ने सेवा हाम्रो प्रोबबाट बन्द देखिन सक्छ (वा उल्टो) — धेरै .np पोर्टलले क्षेत्रअनुसार ट्राफिक फिल्टर गर्छन्। हामी इमानदारीपूर्वक जे मापन गर्छौं त्यही रिपोर्ट गर्छौं।",
    "about.honesty.title": "डाटा इमानदारी",
    "about.honesty.body":
      "हामी कहिल्यै स्थिति बनाउँदैनौं। प्रत्येक पठन सेवाको वास्तविक प्रोबबाट आउँछ, र \"बन्द\" नतिजा देखाउनुअघि पुष्टि गरिन्छ। कुनै सेवा मापन गर्न नसके त्यो भनिन्छ, अनुमान गरिँदैन।",
    "about.bigger.title": "ठूलो प्रश्न",
    "about.bigger.body":
      "विश्वसनीयता डाटाको उद्देश्य रिपोर्टिङभन्दा पर छ: यदि यो सार्वजनिक र निरन्तर छ भने, सेवा चलाउनेहरूले आफ्नै अभिलेख देख्न सक्छन्, र नागरिकले भर पर्ने प्रणालीलाई जवाफदेह बनाउन सक्छन्। पोर्टल निरन्तर बन्द हुने सरकार पुग्न कठिन हुन्छ — र सुधारको पहिलो कदम यसलाई स्पष्ट देख्नु हो।",
    "meth.eyebrow": "कार्यविधि · IsGovOnline",
    "meth.title": "स्थिति कसरी मापन गरिन्छ",
    "meth.intro":
      "स्थिति हाम्रो आफ्नै प्रोबले मापन गरी प्रत्यक्ष देखाइन्छ — कहिल्यै स्क्र्याप, तेस्रो पक्षबाट क्यास, वा अनुमान गरिँदैन।",
    "meth.probing.title": "प्रोबिङ",
    "meth.probing.p1":
      "प्रत्येक सेवा HTTPS मार्फत फेच गरी सञ्चालनमा (३.५ सेकेन्डभित्र सामान्य), कमजोर (ढिलो, 403 फायरवाल, वा 429 दर-सीमित), वा बन्द (5xx, जडान अस्वीकृत, वा प्रतिक्रिया छैन) वर्गीकृत गरिन्छ। पठनहरू करिब हरेक ५ मिनेटमा नविकरण हुन्छन्।",
    "meth.probing.p2":
      "\"बन्द\" नतिजा देखाउनुअघि दोस्रो प्रोबले पुष्टि गर्छ, जसले अस्थिर .np पूर्वाधारमा झुटा अलार्म घटाउँछ। गहिरो जाँच — कन्फिगर गरिएको मुख्य API वा लगइन पृष्ठ — पनि प्रोब गरिन्छ, र नराम्रो नतिजा लागू हुन्छ।",
    "meth.recording.title": "रिपोर्टिङ",
    "meth.recording.p1":
      "ड्यासबोर्डले प्रत्येक सेवाको हालको स्थिति, प्रतिक्रिया समय, र HTTP कोड हाम्रो आफ्नै प्रोबले मापन गरी देखाउँछ। \"बन्द\" नतिजा रिपोर्ट गर्नुअघि दोस्रो प्रोबले पुष्टि गर्छ, जसले अस्थिर .np पूर्वाधारमा झुटा अलार्म घटाउँछ।",
    "meth.recording.p2":
      "हामी कहिल्यै स्थिति बनाउँदैनौं: प्रोब असफल भए सेवा पुनः जाँचिन्छ, र दोहोरिएको असफलता मात्र बन्द देखाइन्छ। सेवा मापन गर्नै नसके त्यो चिन्ह लगाइन्छ, चालु मानिँदैन।",
    "meth.caveats.title": "सावधानी",
    "meth.caveats.body":
      "स्थिति बिन्दु-सापेक्ष हुन्छ। तपाईंको नेटवर्कबाट चल्ने सेवा हाम्रो प्रोबबाट बन्द देखिन सक्छ (वा उल्टो) — धेरै .np पोर्टलले क्षेत्रअनुसार ट्राफिक फिल्टर गर्छन् वा गैर-ब्राउजर क्लाइन्ट अस्वीकार गर्छन्। हामी जहाँबाट मापन गर्छौं, त्यहीँको मापन रिपोर्ट गर्छौं।",
  },
} as const;

export type TranslationKey = keyof (typeof STRINGS)["en"];

type TranslationVars = Record<string, string | number>;

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
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

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`
  );
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

  const t = (key: TranslationKey, vars?: TranslationVars) =>
    interpolate(STRINGS[lang][key], vars);

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
