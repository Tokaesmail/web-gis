"use client";
import { useState } from "react";
import { useLang } from "./translations";

// ─── Data ─────────────────────────────────────────────────────────────────────
const tabs = [
  {
    id: "analysis",
    labelEn: "Analysis",
    labelAr: "التحليل",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
      </svg>
    ),
    headingEn: "Powerful spatial analysis, the smart way",
    headingAr: "تحليل مكاني متقدم بطريقة ذكية",
    pointsEn: [
      "Detect land cover changes from satellite imagery instantly",
      "Classify terrain types with AI-powered spectral analysis",
      "Extract geospatial insights at scale with deep learning",
    ],
    pointsAr: [
      "رصد التغيرات في الغطاء الأرضي من صور الأقمار الصناعية فوراً",
      "تصنيف أنواع التضاريس بتحليل طيفي مدعوم بالذكاء الاصطناعي",
      "استخراج بيانات جيومكانية واسعة النطاق بتعلم عميق",
    ],
    // Decorative SVG mock
    visual: "analysis",
  },
  {
    id: "map",
    labelEn: "Interactive Map",
    labelAr: "الخريطة التفاعلية",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
        <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
      </svg>
    ),
    headingEn: "Draw, measure, and explore in real time",
    headingAr: "ارسم، قِس، واستكشف في الوقت الفعلي",
    pointsEn: [
      "Upload GeoJSON files and render them instantly on the map",
      "Draw polygons and measure areas or distances precisely",
      "Switch to 3D terrain view for immersive spatial exploration",
    ],
    pointsAr: [
      "ارفع ملفات GeoJSON وشوفها فوراً على الخريطة",
      "ارسم مضلعات وقِس المساحات والمسافات بدقة عالية",
      "حوّل العرض لـ 3D لاستكشاف التضاريس بشكل غامر",
    ],
    visual: "map",
  },
  {
    id: "ndvi",
    labelEn: "NDVI & Weather",
    labelAr: "NDVI والطقس",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
      </svg>
    ),
    headingEn: "Live vegetation & weather intelligence",
    headingAr: "بيانات حية عن النباتات والطقس",
    pointsEn: [
      "Real-time NDVI index from live open-meteo satellite data",
      "7-day weather forecast tied to your selected map area",
      "Soil moisture, temperature, and evapotranspiration metrics",
    ],
    pointsAr: [
      "مؤشر NDVI الحي من بيانات الأقمار الصناعية المفتوحة",
      "توقعات طقس 7 أيام مرتبطة بالمنطقة المحددة على الخريطة",
      "قياسات رطوبة التربة ودرجة الحرارة والتبخر",
    ],
    visual: "ndvi",
  },
];

// ─── Visual mocks ─────────────────────────────────────────────────────────────
function AnalysisMock() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Bar chart rows */}
      {[
        { label: "Healthy Vegetation", pct: 78, color: "#22c55e" },
        { label: "Urban / Built-up",   pct: 54, color: "#00d4ff" },
        { label: "Bare Soil",          pct: 31, color: "#f59e0b" },
        { label: "Water Bodies",       pct: 19, color: "#3b82f6" },
        { label: "Stressed Crops",     pct: 12, color: "#ef4444" },
      ].map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 130, fontSize: 11, color: "#64748b", flexShrink: 0 }}>{r.label}</span>
          <div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.05)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${r.pct}%`, height: "100%", background: r.color, borderRadius: 6, transition: "width .6s ease" }} />
          </div>
          <span style={{ width: 32, fontSize: 11, color: "#94a3b8", textAlign: "right" }}>{r.pct}%</span>
        </div>
      ))}
      {/* Confidence badge */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>AI Confidence: <span style={{ color: "#00d4ff", fontWeight: 600 }}>94.2%</span></span>
      </div>
    </div>
  );
}

function MapMock() {
  // Simple grid representing a map with drawn polygon
  const dots = Array.from({ length: 80 });
  return (
    <div style={{ position: "relative", width: "100%", height: 220, background: "#0a1628", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(0,212,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,.04) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
      {/* Random dots representing data points */}
      {[
        [18,30],[42,55],[70,22],[90,60],[55,80],[30,70],[65,45],[80,15],[20,85],[50,35],
        [75,65],[35,20],[60,75],[25,50],[88,40],[45,90],[15,60],[72,30],[38,78],[62,18],
      ].map(([x,y], i) => (
        <div key={i} style={{ position:"absolute", left:`${x}%`, top:`${y}%`, width: i%3===0?6:4, height:i%3===0?6:4, borderRadius:"50%", background: i%5===0?"#00d4ff":i%3===0?"#22c55e":"rgba(0,212,255,0.3)", boxShadow: i%5===0?"0 0 8px #00d4ff":undefined, transform:"translate(-50%,-50%)" }} />
      ))}
      {/* Polygon overlay */}
      <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.7 }}>
        <polygon points="140,60 200,40 240,90 220,140 160,150 120,110" fill="rgba(0,212,255,0.08)" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="5,3"/>
      </svg>
      {/* Toolbar pill */}
      <div style={{ position:"absolute", bottom:12, left:"50%", transform:"translateX(-50%)", display:"flex", gap:6, background:"rgba(7,15,30,0.92)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"6px 10px" }}>
        {["✏️","📐","⬆️","📷"].map((ic,i)=>(
          <div key={i} style={{ width:28,height:28,borderRadius:7,background:i===0?"rgba(0,212,255,0.15)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13, cursor:"pointer" }}>{ic}</div>
        ))}
      </div>
    </div>
  );
}

function NDVIMock() {
  const bars = [0.51,0.58,0.61,0.67,0.70,0.69,0.72,0.74,0.72,0.76];
  const max = Math.max(...bars);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
        {[
          { label:"NDVI Index", value:"0.76", color:"#22c55e" },
          { label:"Soil Moisture", value:"42.1%", color:"#3b82f6" },
          { label:"UV Index", value:"6.4", color:"#f59e0b" },
        ].map(k=>(
          <div key={k.label} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"10px 12px" }}>
            <div style={{ fontSize:18, fontWeight:600, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:10, color:"#64748b", marginTop:2 }}>{k.label}</div>
          </div>
        ))}
      </div>
      {/* Bar sparkline */}
      <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:60, padding:"0 4px" }}>
        {bars.map((v,i)=>(
          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
            <div style={{ width:"100%", borderRadius:4, background: i===bars.length-1?"#00d4ff":"rgba(34,197,94,0.5)", height:`${(v/max)*56}px`, transition:"height .5s ease" }}/>
          </div>
        ))}
      </div>
      {/* NDVI scale */}
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#64748b", marginBottom:4 }}><span>Low</span><span>NDVI Scale</span><span>High</span></div>
        <div style={{ height:8, borderRadius:99, background:"linear-gradient(to right,#8B0000,#FF4500,#FFD700,#ADFF2F,#006400)" }}/>
      </div>
    </div>
  );
}

const visuals: Record<string, React.ReactNode> = {
  analysis: <AnalysisMock />,
  map:      <MapMock />,
  ndvi:     <NDVIMock />,
};

// ─── Stats strip ──────────────────────────────────────────────────────────────
const stats = [
  { valueEn: "100+",  valueAr: "+100",   labelEn: "Satellite datasets",   labelAr: "مجموعة بيانات فضائية" },
  { valueEn: "3D",    valueAr: "3D",     labelEn: "Terrain visualization", labelAr: "تصور التضاريس" },
  { valueEn: "Live",  valueAr: "مباشر",  labelEn: "NDVI & weather data",  labelAr: "بيانات NDVI والطقس" },
  { valueEn: "Open",  valueAr: "مفتوح",  labelEn: "Source on GitHub",     labelAr: "المصدر على GitHub" },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function AboutSection() {
  const { isRTL, lang } = useLang();
  const [active, setActive] = useState("analysis");
  const tab = tabs.find((t) => t.id === active)!;

  return (
    <section
      id="about"
      dir={isRTL ? "rtl" : "ltr"}
      style={{
        background: "#040d1a",
        padding: "100px 0 80px",
        fontFamily: isRTL ? "'Noto Sans Arabic', sans-serif" : "'DM Sans', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Noto+Sans+Arabic:wght@300;400;500;600&display=swap');
        .about-tab-btn { background: none; border: none; cursor: pointer; transition: all .2s; }
        .about-tab-btn:hover { color: #e2e8f0 !important; }
        .about-point { display: flex; align-items: flex-start; gap: 10px; }
        .about-stat:hover { border-color: rgba(0,212,255,0.3) !important; background: rgba(0,212,255,0.04) !important; }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .anim-fiu { animation: fadeInUp .4s ease both; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>

        {/* ── Section label ── */}
        <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(0,212,255,0.07)", border:"1px solid rgba(0,212,255,0.18)", color:"#00d4ff", fontSize:11, letterSpacing:"0.14em", textTransform:"uppercase", padding:"6px 16px", borderRadius:999 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#00d4ff", boxShadow:"0 0 8px #00d4ff", display:"inline-block" }}/>
            {isRTL ? "كيف يعمل المنصة" : "How it works"}
          </div>
        </div>

        {/* ── Heading ── */}
        <h2 style={{ textAlign:"center", fontSize:"clamp(1.7rem,3.5vw,2.6rem)", fontWeight:600, color:"#f1f5f9", margin:"0 0 14px", lineHeight:1.2 }}>
          {isRTL
            ? <>منصة واحدة لكل <span style={{ background:"linear-gradient(130deg,#00d4ff,#3b82f6)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", fontStyle:"italic" }}>احتياجاتك الجيومكانية</span></>
            : <>One platform for all your <span style={{ background:"linear-gradient(130deg,#00d4ff,#3b82f6)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", fontStyle:"italic" }}>geospatial needs</span></>
          }
        </h2>
        <p style={{ textAlign:"center", color:"#64748b", fontSize:14, maxWidth:560, margin:"0 auto 56px", lineHeight:1.7 }}>
          {isRTL
            ? "من تحليل صور الأقمار الصناعية إلى عرض التضاريس ثلاثي الأبعاد — GeoSense AI بيديك كل الأدوات في مكان واحد."
            : "From satellite imagery analysis to 3D terrain visualization — GeoSense AI puts every tool you need in one place."
          }
        </p>

        {/* ── Tab switcher ── */}
        <div style={{ display:"flex", justifyContent:"center", gap:4, marginBottom:48, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:5, width:"fit-content", margin:"0 auto 48px" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className="about-tab-btn"
              onClick={() => setActive(t.id)}
              style={{
                display:"flex", alignItems:"center", gap:7,
                padding:"9px 18px", borderRadius:10,
                fontSize:13, fontWeight:500,
                color: active===t.id ? "#040d1a" : "#64748b",
                background: active===t.id ? "linear-gradient(130deg,#00d4ff,#3b82f6)" : "transparent",
                boxShadow: active===t.id ? "0 0 20px rgba(0,212,255,0.25)" : "none",
                fontFamily: "inherit",
              }}
            >
              {t.icon}
              {isRTL ? t.labelAr : t.labelEn}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div
          key={active}
          className="anim-fiu"
          style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:48, alignItems:"center" }}
        >
          {/* Left: text */}
          <div style={isRTL ? { order:2 } : {}}>
            <h3 style={{ fontSize:"clamp(1.2rem,2.5vw,1.7rem)", fontWeight:600, color:"#f1f5f9", margin:"0 0 20px", lineHeight:1.3 }}>
              {isRTL ? tab.headingAr : tab.headingEn}
            </h3>
            <ul style={{ listStyle:"none", padding:0, margin:"0 0 28px", display:"flex", flexDirection:"column", gap:14 }}>
              {(isRTL ? tab.pointsAr : tab.pointsEn).map((p, i) => (
                <li key={i} className="about-point">
                  <span style={{ width:20, height:20, borderRadius:6, background:"rgba(0,212,255,0.12)", border:"1px solid rgba(0,212,255,0.25)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  <span style={{ fontSize:14, color:"#94a3b8", lineHeight:1.6 }}>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: visual mock */}
          <div style={{
            background:"rgba(7,15,30,0.8)",
            border:"1px solid rgba(255,255,255,0.07)",
            borderRadius:18,
            padding:24,
            boxShadow:"0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
            ...(isRTL ? { order:1 } : {}),
          }}>
            {/* Mock header bar */}
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:18 }}>
              {["#ef4444","#f59e0b","#22c55e"].map(c=>(
                <div key={c} style={{ width:9, height:9, borderRadius:"50%", background:c, opacity:0.7 }}/>
              ))}
              <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.05)", marginLeft:8 }}/>
              <div style={{ fontSize:10, color:"#334155", fontFamily:"monospace" }}>GeoSense AI</div>
            </div>
            {visuals[tab.visual]}
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginTop:72 }}>
          {stats.map((s) => (
            <div
              key={s.labelEn}
              className="about-stat"
              style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:"20px 16px", textAlign:"center", transition:"all .2s", cursor:"default" }}
            >
              <div style={{ fontSize:28, fontWeight:700, background:"linear-gradient(130deg,#00d4ff,#3b82f6)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:6 }}>
                {isRTL ? s.valueAr : s.valueEn}
              </div>
              <div style={{ fontSize:12, color:"#64748b", lineHeight:1.4 }}>
                {isRTL ? s.labelAr : s.labelEn}
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
