"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export type Lang = "en" | "ar";

// ─── All app translations ─────────────────────────────────────────────────────
export const translations = {
  en: {
    // Nav
    projectName: "GeoSense AI",
    navMap: "Map",
    navAbout: "About",
    navLogin: "Sign In",
    navLogout: "Sign Out",
    navDashboard: "Dashboard",
    navSettings: "Settings",
    // Home
    heroBadge: "Powered by AI",
    heroTitle1: "Intelligent",
    heroTitle2: "Remote Sensing",
    heroTitle3: "Analysis",
    heroSubtitle: "Unlock the power of satellite imagery with AI-driven analysis — detect changes, classify land cover, and extract geospatial insights at scale, instantly.",
    heroSub2: "From raw pixels to actionable intelligence: our platform fuses deep learning with cloud-native GIS for faster, smarter decisions.",
    heroBtnMap: "Open Map",
    heroBtnGithub: "View on GitHub",
    heroScrollHint: "Scroll to explore",
    // Map
    mapTitle: "Interactive Map",
    mapSearch: "Search location...",
    mapLayers: "Layers",
    mapAnalyze: "Analyze Area",
    mapDraw: "Draw",
    mapMeasure: "Measure",
    mapExport: "Export",
    mapZoomIn: "Zoom In",
    mapZoomOut: "Zoom Out",
    mapMyLocation: "My Location",
    // Analysis
    analysisTitle: "AI Analysis",
    analysisRunning: "Running analysis...",
    analysisDone: "Analysis complete",
    analysisNoArea: "Please select an area first",
    analysisResults: "Results",
    analysisConfidence: "Confidence",
    // Auth
    authEmail: "Email address",
    authPassword: "Password",
    authSignIn: "Sign In",
    authSignUp: "Create Account",
    authForgot: "Forgot password?",
    // UI
    loading: "Loading...",
    error: "Something went wrong",
    retry: "Try again",
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    back: "Back",
    search: "Search",
    noResults: "No results found",
    clearAll: "Clear All",
    km: "km",
    ha: "ha",
    selectedArea: "Selected Area",
    hectares: "Hectares",
    // Toolbar tools
    pointer: "Select",
    polygon: "Area Tool",
    rectangle: "Rectangle",
    circle: "Circle",
    measure: "Distance Tool",
    marker: "Add Marker",
  },
  ar: {
    // Nav
    projectName: "جيوسنس AI",
    navMap: "الخريطة",
    navAbout: "عن المشروع",
    navLogin: "تسجيل الدخول",
    navLogout: "تسجيل الخروج",
    navDashboard: "لوحة التحكم",
    navSettings: "الإعدادات",
    // Home
    heroBadge: "مدعوم بالذكاء الاصطناعي",
    heroTitle1: "تحليل",
    heroTitle2: "الاستشعار عن بُعد",
    heroTitle3: "بالذكاء الاصطناعي",
    heroSubtitle: "اكتشف قوة الصور الفضائية مع التحليل المدعوم بالذكاء الاصطناعي — رصد التغيرات، تصنيف الغطاء الأرضي، واستخراج البيانات الجغرافية بدقة وسرعة فائقة.",
    heroSub2: "من البيانات الخام إلى معلومات قابلة للتنفيذ: منصتنا تجمع بين التعلم العميق ونظم المعلومات الجغرافية السحابية لقرارات أسرع وأذكى.",
    heroBtnMap: "افتح الخريطة",
    heroBtnGithub: "عرض على GitHub",
    heroScrollHint: "مرر للاستكشاف",
    // Map
    mapTitle: "الخريطة التفاعلية",
    mapSearch: "ابحث عن موقع...",
    mapLayers: "الطبقات",
    mapAnalyze: "تحليل المنطقة",
    mapDraw: "رسم",
    mapMeasure: "قياس",
    mapExport: "تصدير",
    mapZoomIn: "تكبير",
    mapZoomOut: "تصغير",
    mapMyLocation: "موقعي",
    // Analysis
    analysisTitle: "تحليل الذكاء الاصطناعي",
    analysisRunning: "جاري التحليل...",
    analysisDone: "اكتمل التحليل",
    analysisNoArea: "الرجاء تحديد منطقة أولاً",
    analysisResults: "النتائج",
    analysisConfidence: "درجة الثقة",
    // Auth
    authEmail: "البريد الإلكتروني",
    authPassword: "كلمة المرور",
    authSignIn: "تسجيل الدخول",
    authSignUp: "إنشاء حساب",
    authForgot: "نسيت كلمة المرور؟",
    // UI
    loading: "جاري التحميل...",
    error: "حدث خطأ ما",
    retry: "حاول مرة أخرى",
    cancel: "إلغاء",
    save: "حفظ",
    close: "إغلاق",
    back: "رجوع",
    search: "بحث",
    noResults: "لا توجد نتائج",
    clearAll: "إزالة الكل",
    km: "كم",
    ha: "هكتار",
    selectedArea: "المساحة المحددة",
    hectares: "هكتار",
    // Toolbar tools
    pointer: "تحديد",
    polygon: "أداة المساحات",
    rectangle: "رسم مستطيل",
    circle: "رسم دائرة",
    measure: "أداة المسافات",
    marker: "إضافة علامة",
  },
} as const;

export type TranslationDict = typeof translations.en;

// ─── Context type ─────────────────────────────────────────────────────────────
interface LangContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: TranslationDict;
  isRTL: boolean;
  dir: "ltr" | "rtl";
}

const LangContext = createContext<LangContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLang;
      document.documentElement.dir = newLang === "ar" ? "rtl" : "ltr";
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === "en" ? "ar" : "en");
  }, [lang, setLang]);

  const value: LangContextType = {
    lang,
    setLang,
    toggleLang,
    t: translations[lang] as TranslationDict,
    isRTL: lang === "ar",
    dir: lang === "ar" ? "rtl" : "ltr",
  };

  return (
    <LangContext.Provider value={value}>
      <div dir={value.dir} lang={lang}>
        {children}
      </div>
    </LangContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useLang(): LangContextType {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}