"use client";

// ─── LeafletMap.tsx ───────────────────────────────────────────────────────────
// ① OSM/Esri tiles
// ② Polygon بكليك واحد للإنهاء — زر "Close Shape" أو كليك على النقطة الأولى
// ③ Double-click zoom متوقف تماماً
// ④ الألوان للعرض بس — مش بتتبعت للباك
// ⑤ AOI Editor: تعديل الرؤوس + Validation
// ⑥ persistData: true = "Create Project" (بيحفظ في IndexedDB) | false = مفيش حفظ
//    • كل شكل (polygon/rectangle/circle/marker/measure) بيتسيف ويتسترجع بنوعه الصح
//    • Delete (🗑️) بيمسح الشكل من الـ UI + IndexedDB
//    • Delete All بيمسح كل حاجة من الـ UI + IndexedDB
// ⑦ Save (💾) بيحفظ شكل واحد | saveAllRef بيحفظ كل الأشكال الـ pending
// ⑧ ✅ التحليل بقى PER-SHAPE (كل شكل ليه تحليل مستقل بالـ ownerId):
//    • رسمتين وتحليلين = الاتنين بيظهروا مع بعض (تحليل شكل ما بيمسحش تحليل شكل تاني)
//    • مسح شكل = بيمسح تحليله بس (خريطة + IndexedDB + البروجكت عن طريق onAnalysisCleared(ownerId))
//    • Delete Analysis = بيمسح تحليل الشكل الحالي بس | Delete All = بيمسح الكل (ownerId=null)
// ⑨ التحليل بيتسيف (IndexedDB + onAnalysisSaved للأب) بس لو الشكل صاحبه متسيف
//    • من غير Save: لا الشكل ولا التحليل بيتكتبوا في أي مكان
//    • Save / Save All: الشكل + تحليله بيتكتبوا مع بعض
//    • بعد الريفريش: بيرجع تحليل كل شكل متسيف، وأي تحليل يتيم بيتمسح من الـ DB
// ⑩ كل حاجة كانت في localStorage اتنقلت لـ IndexedDB (مع migration تلقائي)
// ⑪ تحقق بعد كل Save / Delete: بنقرا الـ DB ونتأكد إن الشكل اتكتب / اتمسح فعلاً
import { saveAOI, getAllAOIs, deleteAOI, clearAllAOIs } from "./indexeddB";
import {
  kvGet,
  kvSet,
  imageOverlaysGetAll,
  imageOverlaysReplaceAll,
  imageOverlaysClear,
  analysisGet,
  analysisClear,
  deletedIdsGetAll,
  deletedIdsAdd,
  type StoredAnalysis,
} from "./projects/leafletStore";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { useMapCanvas } from "./useMapCanvas";
import { useLang } from "../_components/translations";
import turfBbox from "@turf/bbox";
import turfArea from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import {
  DrawTool,
  SAT_LAYERS,
  SatKey,
  LatLngPoint,
  CaptureMetadata,
  CaptureResult,
  CaptureTarget,
} from "./mapTypes_proxy";
import { validateAOI, MAX_AOI_SIZE_HA } from "./aoiValidation";
import {
  AOIRegistry,
  newAoiId,
  type AOIControl,
  type AOIEntry,
  type AOIListItem,
} from "./AOIRegistry";

type ExtrusionConfig = {
  enabled: boolean;
  /** property name in feature.properties containing height in meters */
  heightProperty?: string;
  /** fallback height (meters) if property missing */
  defaultHeightM?: number;
  color?: string;
  opacity?: number;
};

interface GeoJSONStyle {
  color?: string;
  weight?: number;
  opacity?: number;
  fillColor?: string;
  fillOpacity?: number;
  dashArray?: string;
}

type Bounds2 = [[number, number], [number, number]];

type RasterOverlayConfig = {
  name: string;
  indexKey: string;
  expression: string;
  date: string;
  dataUrl: string;
  tileUrl?: string;
  bounds: Bounds2;
  opacity: number;
  colorRamp: string;
  coords: { lat: number; lng: number };
};

type SwipeOverlayConfig = {
  beforeUrl: string;
  afterUrl: string;
  bounds: Bounds2;
  beforeLabel?: string;
  afterLabel?: string;
};

type SuperResOverlayConfig = {
  dataUrl: string;
  bounds: Bounds2;
  coords: { lat: number; lng: number };
};

type PointsOverlayConfig = {
  name: string;
  indexKey: string;
  date: string;
  points: { lat: number; lng: number; value: number; color: string }[];
  opacity: number;
};

interface Props {
  onDrawnFeaturesChange?: (features: GeoJSON.Feature[]) => void;

  activeTool: DrawTool;
  captureTarget: CaptureTarget;
  /** true = المستخدم داس "Create Project" → الأشكال بتتحفظ (IndexedDB).
   *  false = "Create without project" → مفيش أي حفظ ولا استرجاع. */
  persistData?: boolean;
  onAreaSelected: (
    name: string,
    area: number,
    feature?: GeoJSON.Feature,
  ) => void;
  onCoordsUpdate: (lat: number, lng: number) => void;
  flyToRef: React.MutableRefObject<((lat: number, lng: number) => void) | null>;
  clearRef: React.MutableRefObject<(() => void) | null>;
  /** clears ONLY the analysis of the CURRENT shape (raster / points /
   * super-resolution / swipe) — leaves the drawn AOI shapes untouched. */
  clearAnalysisRef?: React.MutableRefObject<(() => void) | null>;
  /** Captures whatever shape is currently drawn WITHOUT requiring a new one. */
  captureCurrentRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  /** زرار "Save All" اللي فوق — بيحفظ كل الأشكال الـ pending */
  saveAllRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  /** بتتنادى أي مرة تحليل يتمسح.
   *  ownerId = id الشكل صاحب التحليل | null = اتمسحت كل التحليلات (Delete All).
   *  → الأب لازم يمسح التحليل (أو الكل لو null) من savedAnalyses بتاع البروجكت */
  onAnalysisCleared?: (ownerId: string | null) => void;
  /** بتتنادى لما تحليل يتسيف (وصاحبه متسيف) — الأب يضيفه في savedAnalyses
   *  (تحليل واحد لكل ownerId: استبدل القديم لو موجود) */
  onAnalysisSaved?: (
    ownerId: string,
    kind: StoredAnalysis["kind"],
    config: any,
  ) => void;
  onSatChange: (handler: (sat: SatKey) => void) => void;
  onOpacityChangeRegister?: (handler: (o: number) => void) => void;
  /** register an image placement workflow (2 clicks to place image) */
  onImagePlacerRegister?: (handler: (file: File) => void) => void;
  onRasterOverlayRegister?: (
    handler: (config: RasterOverlayConfig | null) => void,
  ) => void;
  onSwipeOverlayRegister?: (
    handler: (config: SwipeOverlayConfig | null) => void,
  ) => void;
  onSuperResOverlayRegister?: (
    handler: (config: SuperResOverlayConfig | null) => void,
  ) => void;
  onPointsOverlayRegister?: (
    handler: (config: PointsOverlayConfig | null) => void,
  ) => void;
  onCapture?: (capture: CaptureResult) => void;
  /** callback لما يضغط على GeoJSON feature */
  onFeatureClick?: (feature: GeoJSON.Feature) => void;
  /** GeoJSON data لعرضها على الخريطة */
  geoJsonData?: GeoJSON.FeatureCollection | GeoJSON.Feature | null;
  /** GeoJSON إضافي (مثلاً شيكات الجامعات) يُعرض فوق الـ layer الأول */
  extraGeoJsonData?: GeoJSON.FeatureCollection | GeoJSON.Feature | null;
  /** Newly added GeoJSON to fly to */
  latestGeoJson?: GeoJSON.FeatureCollection | GeoJSON.Feature | null;
  /** optionally render pseudo-3D extrusion for a GeoJSON FeatureCollection */
  extrusionGeoJson?: GeoJSON.FeatureCollection | null;
  extrusionConfig?: ExtrusionConfig;
  /** تنسيق مخصص للـ GeoJSON layer */
  geoJsonStyle?: GeoJSONStyle;
  /** هل نزوم على الـ GeoJSON بعد التحميل؟ */
  geoJsonFitBounds?: boolean;
  /** features محفوظة في البروجيكت — بترسمهم تاني لما نفتح البروجيكت */
  initialFeatures?: GeoJSON.Feature[];
  /** واجهة للتحكم في الـ AOIs المرسومة (activate / focus / remove) من بره */
  aoiControlRef?: React.MutableRefObject<AOIControl | null>;
  /** بتتنادى كل ما قائمة الـ AOIs أو الـ AOI النشط يتغيّر */
  onAOIListChange?: (items: AOIListItem[], activeId: string | null) => void;
  /** بتتنادى لما AOI يتمسح من الخريطة */
  onAOIRemove?: (id: string) => void;
}

// ── ألوان كل أداة — للعرض فقط، مش بتتبعت للباك ──────────────────────────────
const TOOL_COLORS = {
  polygon: { stroke: "#00c8ff", fill: "transparent" },
  rectangle: { stroke: "#a78bfa", fill: "transparent" },
  circle: { stroke: "#34d399", fill: "transparent" },
  measure: { stroke: "#fbbf24", fill: "rgba(251,191,36,0.1)" },
  marker: { stroke: "#f97316", fill: "rgba(249,115,22,0.85)" },
};

// ── مفاتيح IndexedDB / legacy localStorage ──────────────────────────────────
const VIEW_KEY = "last_map_view"; // داخل store "kv"
const ANALYSES_KEY = "analyses_v2"; // داخل store "kv": Record<ownerId, StoredAnalysis>
const LEGACY_VIEW_KEY = "geosense_last_map_view";
const LEGACY_DELETED_IDS_KEY = "leaflet_deleted_aoi_ids_v1";
const LEGACY_IMAGE_OVERLAYS_KEY = "leaflet_image_overlays_v1";

// ── ألوان نطاقات الجامعات (service area breaks) ──────────────────────────────
function getUniversityColor(
  from: number,
  to: number,
): { fill: string; stroke: string } {
  if (to <= 5) return { fill: "#22c55e", stroke: "#16a34a" };
  if (to <= 10) return { fill: "#f59e0b", stroke: "#d97706" };
  return { fill: "#ef4444", stroke: "#dc2626" };
}

function makePolygonFeature(
  name: string,
  points: [number, number][],
  area: number,
  meta?: { id: string; kind: "polygon" | "rectangle" | "circle" },
): GeoJSON.Feature {
  const ring = points.map(([lat, lng]) => [lng, lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closedRing =
    first && last && (first[0] !== last[0] || first[1] !== last[1])
      ? [...ring, first]
      : ring;

  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [closedRing] },
    properties: { name, areaHa: area, _drawn: true, ...(meta ?? {}) },
  };
}

// دالة تحويل الدائرة لـ Polygon حقيقي
function circleToPolygonLatLng(
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  points = 64,
): [number, number][] {
  const EARTH_RADIUS = 6371008.8;
  const latRad = (centerLat * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const bearing = (i / points) * 2 * Math.PI;
    const dLat = (radiusMeters * Math.cos(bearing)) / EARTH_RADIUS;
    const dLng =
      (radiusMeters * Math.sin(bearing)) / (EARTH_RADIUS * Math.cos(latRad));
    ring.push([
      centerLat + (dLat * 180) / Math.PI, // lat
      centerLng + (dLng * 180) / Math.PI, // lng
    ]);
  }
  return ring;
}

export default function LeafletMap({
  activeTool,
  captureTarget,
  persistData = false,
  onAreaSelected,
  onCoordsUpdate,
  flyToRef,
  clearRef,
  clearAnalysisRef,
  captureCurrentRef,
  saveAllRef,
  onAnalysisCleared,
  onAnalysisSaved,
  onSatChange,
  onOpacityChangeRegister,
  onCapture,
  geoJsonData,
  extraGeoJsonData,
  latestGeoJson,
  geoJsonStyle,
  geoJsonFitBounds = true,
  onFeatureClick,
  onImagePlacerRegister,
  onDrawnFeaturesChange,
  onRasterOverlayRegister,
  onSwipeOverlayRegister,
  onSuperResOverlayRegister,
  onPointsOverlayRegister,
  extrusionGeoJson,
  extrusionConfig,
  initialFeatures,
  aoiControlRef,
  onAOIListChange,
  onAOIRemove,
}: Props) {
  const { t, isRTL } = useLang();

  // ── التحكم في الحفظ: Create Project = true | Create without project = false ──
  const persistDataRef = useRef(persistData);
  persistDataRef.current = persistData;

  const [, setDrawnFeatures] = useState<GeoJSON.Feature[]>([]);
  const drawnFeaturesRef = useRef<GeoJSON.Feature[]>([]);

  // ✅ ref للـ callback عشان الـ closures القديمة تفضل تنادي آخر نسخة
  const onDrawnFeaturesChangeRef = useRef(onDrawnFeaturesChange);
  onDrawnFeaturesChangeRef.current = onDrawnFeaturesChange;

  const onAnalysisClearedRef = useRef(onAnalysisCleared);
  onAnalysisClearedRef.current = onAnalysisCleared;

  const onAnalysisSavedRef = useRef(onAnalysisSaved);
  onAnalysisSavedRef.current = onAnalysisSaved;

  /** نقطة واحدة لتحديث قائمة الرسومات (ref + state + الأب) */
  const setDrawn = (next: GeoJSON.Feature[]) => {
    drawnFeaturesRef.current = next;
    setDrawnFeatures([...next]);
    onDrawnFeaturesChangeRef.current?.([...next]);
  };

  // wrappers: مابتعملش أي حاجة لو الحفظ مقفول (Create without project)
  const saveAOIIfAllowed = (aoi: Parameters<typeof saveAOI>[0]) => {
    if (!persistDataRef.current) return Promise.resolve();
    return saveAOI(aoi);
  };

  // ═══ تحقق من الـ IndexedDB (circle / line / marker / polygon / rectangle بنفس المسار) ═══
  /** يرجّع الـ ids اللي مش لاقيها في الـ DB (يعني الحفظ ماشتغلش فعلاً) */
  const findMissingInDb = async (ids: string[]): Promise<string[]> => {
    if (!persistDataRef.current) return [];
    try {
      const all = (await getAllAOIs()) as any[];
      const have = new Set((all ?? []).map((a) => String(a?.id)));
      return ids.filter((id) => !have.has(String(id)));
    } catch (e) {
      console.warn("DB verify failed", e);
      return []; // لو القراءة نفسها فشلت ما نحكمش
    }
  };

  /** يمسح id من الـ DB ويتأكد إنه فعلاً اتمسح (محاولتين) — من غير gating بـ persistData */
  const deleteFromDbVerified = async (id: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await deleteAOI(id);
      } catch (e) {
        console.error(`❌ deleteAOI failed (attempt ${attempt + 1}):`, id, e);
        continue;
      }
      try {
        const all = (await getAllAOIs()) as any[];
        if (!(all ?? []).some((a) => String(a?.id) === String(id))) return true;
        console.warn(`⚠️ ${id} still in IndexedDB after delete — retrying`);
      } catch (_) {
        return true;
      }
    }
    toast.error(
      isRTL
        ? "فشل الحذف من قاعدة البيانات"
        : "Failed to delete from database",
    );
    return false;
  };

  // ═══ Save workflow: الشكل مش بيتحفظ إلا لما المستخدم يدوس Save / Save All ═══
  const pendingShapesRef = useRef<
    Map<
      string,
      { feature: GeoJSON.Feature; aoi: Parameters<typeof saveAOI>[0] }
    >
  >(new Map());
  const savedIdsRef = useRef<Set<string>>(new Set());
  /** ids اللي المستخدم مسحها — عشان ما يتعادش رسمها من initialFeatures / الـ DB */
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const deletedLoadedRef = useRef(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // 🛰️ التحليلات: PER-SHAPE (كل شكل ليه تحليل مستقل بالـ ownerId)
  // ═══════════════════════════════════════════════════════════════════════════
  /** آخر شكل بقى "الحالي" (اتعمل / اتفعّل / اتعدّل) — ده اللي البانلز بتحلله */
  const currentShapeIdRef = useRef<string | null>(null);

  type LiveAnalysis = {
    kind: StoredAnalysis["kind"];
    config: any;
    cleanup: () => void; // بيشيل الـ layers من الخريطة
  };
  /** ownerId → التحليل الظاهر على الخريطة دلوقتي */
  const analysesRef = useRef<Map<string, LiveAnalysis>>(new Map());

  /** توقيع تحليل — عشان نعرف لو الأب رجّع نفس التحليل بعد المسح مباشرة */
  const analysisSig = (kind: string, c: any): string => {
    try {
      if (kind === "swipe")
        return `${kind}|${String(c.beforeUrl).length}|${String(c.afterUrl).length}|${JSON.stringify(c.bounds)}`;
      if (kind === "points")
        return `${kind}|${c.indexKey}|${c.date}|${c.points?.length ?? 0}`;
      return `${kind}|${c.indexKey ?? ""}|${c.date ?? ""}|${String(c.dataUrl ?? c.tileUrl ?? "").length}|${JSON.stringify(c.bounds)}`;
    } catch (_) {
      return kind;
    }
  };
  /** آخر تحليل اتمسح بإيد المستخدم (لمنع "echo" من الأب بيرجّعه تاني) */
  const clearedAnalysisRef = useRef<{ sig: string; at: number } | null>(null);
  const isEchoAfterClear = (kind: string, config: any): boolean => {
    const c = clearedAnalysisRef.current;
    if (!c) return false;
    if (Date.now() - c.at > 1500) {
      clearedAnalysisRef.current = null;
      return false;
    }
    return c.sig === analysisSig(kind, config);
  };

  // طابور لتسلسل القراءة/الكتابة في الـ DB (عشان ما يحصلش race بين تحليلين)
  const dbQueueRef = useRef<Promise<any>>(Promise.resolve());
  const enqueue = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = dbQueueRef.current.catch(() => {}).then(fn);
    dbQueueRef.current = next;
    return next;
  };

  const readAnalyses = async (): Promise<Record<string, any>> =>
    (await kvGet<Record<string, any>>(ANALYSES_KEY)) ?? {};

  /** يشيل overlay تحليل شكل معيّن من الخريطة (من غير DB / الأب) */
  const removeOverlayFor = (owner: string) => {
    const a = analysesRef.current.get(owner);
    if (!a) return;
    try {
      a.cleanup();
    } catch (_) {}
    analysesRef.current.delete(owner);
  };

  /** بيتسيف في الـ DB + الأب بس لو Create Project والشكل صاحبه متسيف */
  const persistAnalysisFor = (owner: string) => {
    const a = analysesRef.current.get(owner);
    if (!persistDataRef.current || !a || !savedIdsRef.current.has(owner))
      return;
    enqueue(async () => {
      const all = await readAnalyses();
      all[owner] = {
        kind: a.kind,
        config: a.config,
        savedAt: Date.now(),
        ownerId: owner,
      };
      await kvSet(ANALYSES_KEY, all);
    }).catch((e) => console.warn("analysis save failed", e));
    onAnalysisSavedRef.current?.(owner, a.kind, a.config);
  };

  /** بعد Save / Save All: اكتب تحليلات كل الأشكال اللي بقت متسيفة */
  const flushAllAnalyses = () => {
    analysesRef.current.forEach((_, owner) => persistAnalysisFor(owner));
  };

  /** يسجّل تحليل شكل معيّن (بيستبدل تحليل نفس الشكل بس، مش بتاع غيره) */
  const registerAnalysis = (
    owner: string,
    kind: StoredAnalysis["kind"],
    config: any,
    cleanup: () => void,
    persist: boolean,
  ) => {
    removeOverlayFor(owner);
    analysesRef.current.set(owner, { kind, config, cleanup });
    if (persist) persistAnalysisFor(owner);
  };

  /** مسح تحليل شكل واحد: خريطة + IndexedDB + بروجكت (عن طريق الأب) */
  const deleteAnalysisFor = (owner: string, notify = true) => {
    const a = analysesRef.current.get(owner);
    if (a) {
      clearedAnalysisRef.current = {
        sig: analysisSig(a.kind, a.config),
        at: Date.now(),
      };
    }
    removeOverlayFor(owner);
    // ✅ دايماً (من غير gating بـ persistData) عشان مفيش تحليل يتيم يفضل في الـ DB
    enqueue(async () => {
      const all = await readAnalyses();
      if (owner in all) {
        delete all[owner];
        await kvSet(ANALYSES_KEY, all);
      }
    }).catch((e) => console.warn("analysis delete failed", e));
    if (notify) onAnalysisClearedRef.current?.(owner);
  };

  /** مسح كل التحليلات: خريطة + IndexedDB + بروجكت (ownerId = null) */
  const clearAllAnalyses = (notify = true) => {
    Array.from(analysesRef.current.keys()).forEach((o) => removeOverlayFor(o));

    // تنظيف احتياطي: أي layer في imagePane مش بتاع صور المستخدم = تحليل يتيم → يتشال
    const map = mapInstanceRef.current;
    if (map) {
      const userLayers = new Set(imageOverlaysRef.current.map((o) => o.layer));
      const orphans: any[] = [];
      map.eachLayer((l: any) => {
        if (l?.options?.pane === "imagePane" && !userLayers.has(l))
          orphans.push(l);
      });
      orphans.forEach((l) => {
        try {
          map.removeLayer(l);
        } catch (_) {}
      });
      try {
        map
          .getContainer()
          .querySelectorAll(".swipe-compare-ui")
          .forEach((el: Element) => el.remove());
      } catch (_) {}
    }
    swipeOverlayRef.current = null;

    enqueue(() => kvSet(ANALYSES_KEY, {})).catch((e) =>
      console.warn("analyses clear failed", e),
    );
    analysisClear().catch(() => {}); // السجل القديم (legacy single record)
    if (notify) onAnalysisClearedRef.current?.(null);
  };

  // ✅ "قبر" دائم في IndexedDB (store: deletedIds): أي id اتمسح ما يرجعش تاني
  const loadDeletedIds = async () => {
    if (deletedLoadedRef.current) return;
    try {
      const ids = await deletedIdsGetAll();
      ids.forEach((x) => deletedIdsRef.current.add(String(x)));
    } catch (e) {
      console.warn("deletedIds load failed", e);
    }
    try {
      const raw = localStorage.getItem(LEGACY_DELETED_IDS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
          const clean = arr.map(String);
          clean.forEach((x) => deletedIdsRef.current.add(x));
          await deletedIdsAdd(clean);
        }
        localStorage.removeItem(LEGACY_DELETED_IDS_KEY);
      }
    } catch (_) {}
    deletedLoadedRef.current = true;
  };
  const markDeleted = (ids: string[]) => {
    const clean = ids.filter(Boolean).map(String);
    if (!clean.length) return;
    clean.forEach((i) => deletedIdsRef.current.add(i));
    deletedIdsAdd(clean).catch((e) => console.warn("deletedIds save failed", e));
  };
  const isDeleted = (id: string) => deletedIdsRef.current.has(String(id));

  /** يشيل علامة _unsaved من الـ feature بعد ما يتحفظ فعلاً */
  const markFeatureSaved = (feature: GeoJSON.Feature) => {
    if (feature.properties && "_unsaved" in feature.properties) {
      const { _unsaved, ...rest } = feature.properties as any;
      feature.properties = rest;
    }
  };

  /** جديد → pending (مفيش حفظ) | متسيف قبل كده → يتحدّث في الـ DB والقائمة */
  const upsertShape = (
    id: string,
    feature: GeoJSON.Feature,
    aoi: Parameters<typeof saveAOI>[0],
  ) => {
    if (savedIdsRef.current.has(id)) {
      saveAOIIfAllowed(aoi).catch((e) =>
        console.error("Update save failed", e),
      );
      setDrawn(
        drawnFeaturesRef.current.map((f) =>
          f.properties?.id === id ? feature : f,
        ),
      );
    } else {
      // علامة للأب: الشكل ده لسه ماتحفظش → ما تحفظوش في البروجكت
      feature.properties = { ...(feature.properties ?? {}), _unsaved: true };
      pendingShapesRef.current.set(id, { feature, aoi });
    }
  };

  /** زرار Save (شكل واحد) */
  const saveShape = async (id: string) => {
    const p = pendingShapesRef.current.get(id);
    if (!p) return;
    try {
      await saveAOIIfAllowed(p.aoi);
    } catch (e) {
      console.error("Save failed", e);
      toast.error(isRTL ? "فشل الحفظ" : "Save failed");
      return; // ما نعلّمهوش saved لو الـ DB فشلت
    }
    // ✅ لو الشكل اتمسح أثناء الحفظ (race) → ما نرجّعوش
    if (isDeleted(id)) {
      deleteFromDbVerified(id);
      return;
    }
    // ✅ تأكد إنه اتكتب فعلاً في الـ DB (circle / line / marker زي الباقي)
    const missing = await findMissingInDb([id]);
    if (missing.length) {
      console.error("❌ Shape not found in IndexedDB after save:", p.aoi);
      toast.error(
        isRTL
          ? "الشكل ماتكتبش في قاعدة البيانات"
          : "Shape was not written to the database",
      );
      return;
    }
    pendingShapesRef.current.delete(id);
    savedIdsRef.current.add(id);
    markFeatureSaved(p.feature);
    setDrawn([
      ...drawnFeaturesRef.current.filter((f) => f.properties?.id !== id),
      p.feature,
    ]);
    flushAllAnalyses();
    try {
      mapInstanceRef.current?.closePopup();
    } catch (_) {}
    toast.success(isRTL ? "تم الحفظ" : "Saved");
  };

  /** زرار Save All اللي فوق — بيحفظ كل الأشكال الـ pending */
  const saveAllShapes = async () => {
    const entries = Array.from(pendingShapesRef.current.entries());
    if (!entries.length) {
      toast.info(isRTL ? "مفيش رسومات جديدة للحفظ" : "Nothing new to save");
      return;
    }
    const written: { id: string; p: (typeof entries)[number][1] }[] = [];
    let failed = 0;
    for (const [id, p] of entries) {
      // ✅ اتمسح بعد ما الـ snapshot اتاخدت؟ تجاهله
      if (!pendingShapesRef.current.has(id) || isDeleted(id)) continue;
      try {
        await saveAOIIfAllowed(p.aoi);
        if (isDeleted(id)) {
          deleteFromDbVerified(id);
          continue;
        }
        written.push({ id, p });
      } catch (e) {
        failed++;
        console.error("Save failed for", id, e);
      }
    }

    // ✅ تحقق إن كل اللي اتكتب موجود فعلاً في الـ DB
    const missing = new Set(await findMissingInDb(written.map((w) => w.id)));
    const saved: GeoJSON.Feature[] = [];
    for (const { id, p } of written) {
      if (missing.has(id)) {
        failed++;
        console.error("❌ Shape not found in IndexedDB after save:", p.aoi);
        continue;
      }
      pendingShapesRef.current.delete(id);
      savedIdsRef.current.add(id);
      markFeatureSaved(p.feature);
      saved.push(p.feature);
    }

    if (saved.length) {
      flushAllAnalyses();
      const ids = new Set(saved.map((f) => f.properties?.id));
      setDrawn([
        ...drawnFeaturesRef.current.filter((f) => !ids.has(f.properties?.id)),
        ...saved,
      ]);
    }
    try {
      mapInstanceRef.current?.closePopup();
    } catch (_) {}
    if (failed) {
      toast.error(
        isRTL ? `فشل حفظ ${failed} شكل` : `${failed} shape(s) failed to save`,
      );
    } else {
      toast.success(
        isRTL ? `تم حفظ ${saved.length} شكل` : `Saved ${saved.length} shape(s)`,
      );
    }
  };

  /** للأشكال المسترجعة (متسيفة أصلاً) من غير ما نبلّغ الأب تاني */
  const markSavedSilently = (id: string, feature: GeoJSON.Feature) => {
    savedIdsRef.current.add(id);
    drawnFeaturesRef.current = [
      ...drawnFeaturesRef.current.filter((f) => f.properties?.id !== id),
      feature,
    ];
  };

  const projectStateRef = useRef<any>({
    aoi_polygons: [],
    analyses: [],
  });
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const restoredRef = useRef(false);
  const aoiRegistryRef = useRef<AOIRegistry | null>(null);
  const editSessionRef = useRef<{
    id: string;
    handles: any[];
    dirty: boolean;
  } | null>(null);
  const activeToolRef = useRef<DrawTool>(activeTool);
  const drawLayersRef = useRef<any[]>([]);
  const draftLayersRef = useRef<any[]>([]);
  const tempLayerRef = useRef<any>(null);
  const drawPointsRef = useRef<[number, number][]>([]);
  const baseTileRef = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);
  const currentSatKeyRef = useRef<SatKey>("Default");
  const applyResolutionCapRef = useRef<(() => void) | null>(null);
  const tileErrorAtCurrentZoomRef = useRef(false);
  const zoomRevertTimeoutRef = useRef<any>(null);
  const lastStableZoomRef = useRef<number>(11);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const extrudeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastCoordsRef = useRef<LatLngPoint[]>([]);
  const lastToolRef = useRef<DrawTool>("pointer");
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const mapObjRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const geoJsonLayerRef = useRef<any>(null);
  const searchMarkerRef = useRef<any>(null);
  const extraGeoJsonLayerRef = useRef<any>(null);
  const initialFeaturesLayerRef = useRef<any[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastMoveRef = useRef<any>(null);
  const lastVirtualClickRef = useRef<{
    lat: number;
    lng: number;
    time: number;
  } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const imagePaneReadyRef = useRef(false);
  const imageOverlaysRef = useRef<
    {
      id: string;
      name: string;
      src: string;
      bounds: [[number, number], [number, number]];
      layer: any;
    }[]
  >([]);
  /** الـ swipe UI واحد بس على الخريطة كلها (بيتحط على الـ container) */
  const swipeOverlayRef = useRef<{ cleanup: () => void } | null>(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // 🛰️ Apply analysis overlays (بتتنادى من الـ register handlers ومن الاسترجاع)
  //    persist=false وقت الاسترجاع عشان ما نعيدش الكتابة في الـ DB
  //    ownerId = الشكل صاحب التحليل (الافتراضي: الشكل الحالي)
  // ═══════════════════════════════════════════════════════════════════════════
  const needShapeToast = () =>
    toast.error(
      isRTL
        ? "ارسم شكل الأول قبل التحليل"
        : "Draw a shape before running analysis",
    );

  const applyRasterOverlay = (
    config: RasterOverlayConfig,
    persist = true,
    ownerId: string | null = currentShapeIdRef.current,
  ) => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    if (!ownerId) {
      needShapeToast();
      return;
    }

    const hasTemplate = !!config.tileUrl && config.tileUrl.includes("{z}");
    if (!config.dataUrl && !hasTemplate) {
      console.warn(
        "Raster overlay skipped: no dataUrl and tileUrl is not an XYZ template",
        config,
      );
      toast.error(
        isRTL
          ? "مفيش صورة صالحة للعرض على الخريطة"
          : "No displayable raster image for the map",
      );
      return;
    }

    // ✅ بيشيل تحليل نفس الشكل بس — تحليل الأشكال التانية بيفضل
    removeOverlayFor(ownerId);

    const bounds = L.latLngBounds(config.bounds[0], config.bounds[1]);
    const hasTileTemplate = !!config.tileUrl && config.tileUrl.includes("{z}");
    const isSceneImage =
      config.colorRamp === "Scene preview" ||
      String(config.indexKey).toUpperCase() === "RGB";
    const layer = hasTileTemplate
      ? L.tileLayer(config.tileUrl!, {
          opacity: config.opacity,
          pane: "imagePane",
          crossOrigin: "anonymous",
          maxZoom: 22,
          bounds,
          noWrap: true,
        }).addTo(map)
      : L.imageOverlay(config.dataUrl, bounds, {
          opacity: config.opacity,
          pane: "imagePane",
          className: isSceneImage
            ? "scene-preview-raster-overlay"
            : "change-detection-raster-overlay",
        }).addTo(map);

    registerAnalysis(
      ownerId,
      "raster",
      config,
      () => {
        try {
          map.removeLayer(layer);
        } catch (_) {}
      },
      persist,
    );

    if (!hasTileTemplate && config.dataUrl) {
      const probe = new Image();
      probe.onload = () => {
        try {
          const nw = map.project(bounds.getNorthWest(), 0);
          const se = map.project(bounds.getSouthEast(), 0);
          const boundsAspect =
            Math.abs(se.x - nw.x) / Math.max(1e-9, Math.abs(se.y - nw.y));
          const imgAspect =
            probe.naturalWidth / Math.max(1, probe.naturalHeight);
          const ratio = imgAspect / boundsAspect;
          if (ratio < 0.85 || ratio > 1.15) {
            console.warn(
              `⚠️ Raster preview aspect mismatch: image ${probe.naturalWidth}x${probe.naturalHeight} (${imgAspect.toFixed(2)}) vs bounds (${boundsAspect.toFixed(2)}) → الصورة هتتمط. لازم البانل تجيب الـ preview بنفس الـ bbox.`,
              { bounds: config.bounds },
            );
          }
        } catch (_) {}
      };
      probe.src = config.dataUrl;
    }
  };

  const applyPointsOverlay = (
    config: PointsOverlayConfig,
    persist = true,
    ownerId: string | null = currentShapeIdRef.current,
  ) => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    if (!ownerId) {
      needShapeToast();
      return;
    }

    removeOverlayFor(ownerId);
    if (!config.points?.length) return;

    const group = L.layerGroup(
      config.points.map((p) =>
        L.circleMarker([p.lat, p.lng], {
          radius: 4,
          color: p.color,
          fillColor: p.color,
          fillOpacity: config.opacity,
          opacity: config.opacity,
          weight: 1,
        }).bindPopup(
          `<b>${config.name}</b><br/>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}<br/>value: ${p.value.toFixed(3)}`,
        ),
      ),
    ).addTo(map);

    registerAnalysis(
      ownerId,
      "points",
      config,
      () => {
        try {
          map.removeLayer(group);
        } catch (_) {}
      },
      persist,
    );
  };

  const applySuperResOverlay = (
    config: SuperResOverlayConfig,
    persist = true,
    ownerId: string | null = currentShapeIdRef.current,
  ) => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    if (!ownerId) {
      needShapeToast();
      return;
    }

    removeOverlayFor(ownerId);
    if (!config.dataUrl) return;

    const bounds = L.latLngBounds(config.bounds[0], config.bounds[1]);
    const layer = L.imageOverlay(config.dataUrl, bounds, {
      opacity: 1,
      pane: "imagePane",
      className: "change-detection-raster-overlay",
    }).addTo(map);

    const marker = L.circleMarker([config.coords.lat, config.coords.lng], {
      radius: 6,
      color: "#f97316",
      fillColor: "#f97316",
      fillOpacity: 0.75,
      weight: 2,
    })
      .addTo(map)
      .bindPopup("Super Resolution result");

    registerAnalysis(
      ownerId,
      "superRes",
      config,
      () => {
        try {
          map.removeLayer(layer);
        } catch (_) {}
        try {
          map.removeLayer(marker);
        } catch (_) {}
      },
      persist,
    );

    // الـ fly بس لما التحليل جديد (مش وقت الاسترجاع)
    if (persist) {
      map.flyToBounds(bounds, {
        padding: [42, 42],
        maxZoom: 16,
        duration: 0.8,
      });
    }
  };

  const applySwipeOverlay = (
    config: SwipeOverlayConfig,
    persist = true,
    ownerId: string | null = currentShapeIdRef.current,
  ) => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    if (!ownerId) {
      needShapeToast();
      return;
    }

    // ⚠️ الـ swipe UI واحد بس على الخريطة → أي swipe تاني (لأي شكل) يتشال من الخريطة
    analysesRef.current.forEach((a, o) => {
      if (a.kind === "swipe") removeOverlayFor(o);
    });
    removeOverlayFor(ownerId);

    const bounds = L.latLngBounds(config.bounds[0], config.bounds[1]);
    const beforeLayer = L.imageOverlay(config.beforeUrl, bounds, {
      pane: "imagePane",
      opacity: 1,
    }).addTo(map);
    const afterLayer = L.imageOverlay(config.afterUrl, bounds, {
      pane: "imagePane",
      opacity: 1,
    }).addTo(map);

    const ui = L.DomUtil.create(
      "div",
      "swipe-compare-ui",
      map.getContainer(),
    ) as HTMLDivElement;
    ui.style.cssText =
      "position:absolute; inset:0; z-index:610; pointer-events:none; overflow:hidden;";

    const line = document.createElement("div");
    line.style.cssText =
      "position:absolute; width:2px; background:#22d3ee; box-shadow:0 0 10px rgba(34,211,238,.8); pointer-events:none;";
    ui.appendChild(line);

    const handle = document.createElement("div");
    handle.style.cssText =
      "position:absolute; width:34px; height:34px; margin-left:-17px; margin-top:-17px; border-radius:9999px; background:#020817ee; border:2px solid #22d3ee; color:#22d3ee; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; cursor:ew-resize; pointer-events:all; box-shadow:0 4px 16px rgba(0,0,0,.55);";
    handle.textContent = "↔";
    ui.appendChild(handle);

    L.DomEvent.disableClickPropagation(handle);
    L.DomEvent.disableClickPropagation(ui);

    const beforeLabel = document.createElement("div");
    beforeLabel.textContent = config.beforeLabel ?? "Before";
    beforeLabel.style.cssText =
      "position:absolute; background:rgba(0,0,0,.7); color:#7dd3fc; font-size:11px; font-weight:700; letter-spacing:.03em; padding:4px 10px; border-radius:6px; pointer-events:none; white-space:nowrap;";
    ui.appendChild(beforeLabel);

    const afterLabel = document.createElement("div");
    afterLabel.textContent = config.afterLabel ?? "After";
    afterLabel.style.cssText =
      "position:absolute; background:rgba(0,0,0,.7); color:#fdba74; font-size:11px; font-weight:700; letter-spacing:.03em; padding:4px 10px; border-radius:6px; pointer-events:none; white-space:nowrap;";
    ui.appendChild(afterLabel);

    let position = 0.5;

    const applyClip = () => {
      const afterEl = (afterLayer as any).getElement?.() as
        | HTMLElement
        | undefined;
      if (afterEl) afterEl.style.clipPath = `inset(0 0 0 ${position * 100}%)`;
    };

    const reposition = () => {
      const nw = map.latLngToContainerPoint(bounds.getNorthWest());
      const se = map.latLngToContainerPoint(bounds.getSouthEast());
      const left = Math.min(nw.x, se.x),
        right = Math.max(nw.x, se.x);
      const top = Math.min(nw.y, se.y),
        bottom = Math.max(nw.y, se.y);
      const x = left + (right - left) * position;
      line.style.left = `${x}px`;
      line.style.top = `${top}px`;
      line.style.height = `${Math.max(0, bottom - top)}px`;
      handle.style.left = `${x}px`;
      handle.style.top = `${(top + bottom) / 2}px`;
      beforeLabel.style.left = `${left + 10}px`;
      beforeLabel.style.top = `${top + 10}px`;
      afterLabel.style.left = `${Math.max(left + 10, right - 10 - afterLabel.offsetWidth)}px`;
      afterLabel.style.top = `${top + 10}px`;
    };

    afterLayer.on("load", () => {
      applyClip();
      reposition();
    });
    beforeLayer.on("load", reposition);
    applyClip();
    reposition();

    const onMapMove = () => reposition();
    map.on("move", onMapMove);
    map.on("zoom", onMapMove);

    let dragging = false;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
      map.dragging.disable();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const nw = map.latLngToContainerPoint(bounds.getNorthWest());
      const se = map.latLngToContainerPoint(bounds.getSouthEast());
      const left = Math.min(nw.x, se.x),
        right = Math.max(nw.x, se.x);
      const rect = map.getContainer().getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const frac = (clientX - left) / Math.max(1, right - left);
      position = Math.max(0, Math.min(1, frac));
      applyClip();
      reposition();
    };
    const onPointerUp = () => {
      dragging = false;
      map.dragging.enable();
    };

    handle.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const swipeHandle = {
      cleanup: () => {
        map.off("move", onMapMove);
        map.off("zoom", onMapMove);
        handle.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        try {
          map.dragging.enable();
        } catch {}
        try {
          map.removeLayer(beforeLayer);
        } catch {}
        try {
          map.removeLayer(afterLayer);
        } catch {}
        try {
          ui.remove();
        } catch {}
        if (swipeOverlayRef.current === swipeHandle)
          swipeOverlayRef.current = null;
      },
    };
    swipeOverlayRef.current = swipeHandle;

    registerAnalysis(ownerId, "swipe", config, swipeHandle.cleanup, persist);
  };

  /** يرجّع تحليلات كل الأشكال المتسيفة من IndexedDB — بس لو صاحبها (الشكل) متسيف وموجود */
  const restoreAnalysis = async () => {
    if (!persistDataRef.current) return;
    try {
      const all = await readAnalyses();
      let changed = false;

      // migration من السجل القديم (single record) لو موجود
      try {
        const legacy: any = await analysisGet();
        if (legacy?.ownerId && !all[legacy.ownerId]) {
          all[legacy.ownerId] = legacy;
          changed = true;
        }
        if (legacy) analysisClear().catch(() => {});
      } catch (_) {}

      if (!mapInstanceRef.current) return;

      for (const [owner, rec] of Object.entries<any>(all)) {
        const ownerOk = savedIdsRef.current.has(owner) && !isDeleted(owner);
        if (!ownerOk) {
          // صاحب التحليل مش موجود (اتمسح / ماتحفظش) → امسح التحليل اليتيم من الـ DB
          console.warn("🧹 Stale analysis in IndexedDB (owner missing):", owner);
          delete all[owner];
          changed = true;
          continue;
        }
        switch (rec.kind) {
          case "raster":
            applyRasterOverlay(rec.config, false, owner);
            break;
          case "points":
            applyPointsOverlay(rec.config, false, owner);
            break;
          case "superRes":
            applySuperResOverlay(rec.config, false, owner);
            break;
          case "swipe":
            applySwipeOverlay(rec.config, false, owner);
            break;
        }
      }

      if (changed) await enqueue(() => kvSet(ANALYSES_KEY, all));
    } catch (e) {
      console.warn("Analysis restore failed", e);
    }
  };

  const placingImageRef = useRef<{
    file: File;
    src: string; // data URL (persistent across refresh)
    ready: boolean;
    clicks: { lat: number; lng: number }[];
    hintEl?: HTMLDivElement | null;
  } | null>(null);
  const overlaysUiRef = useRef<HTMLDivElement | null>(null);

  const {
    drawPolygon,
    drawRect,
    drawCircle,
    drawMeasure,
    drawMarker,
    clearCanvas,
    capture,
    captureCircle,
    sendToBackend,
  } = useMapCanvas();

  // ⚠️ أي تغيير للأداة يمسح الرسم الناقص الحالي أولاً.
  useEffect(() => {
    if (activeToolRef.current !== activeTool) {
      if (drawPointsRef.current.length > 0) cancelCurrentDrawing();
    }
    activeToolRef.current = activeTool;
  }, [activeTool]);

  const clearImagePlacementHint = () => {
    const st = placingImageRef.current;
    if (st?.hintEl) {
      st.hintEl.remove();
      st.hintEl = null;
    }
  };

  const stopImagePlacement = () => {
    const st = placingImageRef.current;
    if (!st) return;
    clearImagePlacementHint();
    placingImageRef.current = null;
  };

  /** يشيل نقط الرسم المؤقتة (vertices) من الخريطة — بتتنادى لما الشكل يخلص */
  const clearDraftMarkers = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    draftLayersRef.current.forEach((layer) => {
      try {
        map.removeLayer(layer);
      } catch (_) {}
    });
    drawLayersRef.current = drawLayersRef.current.filter(
      (layer) => !draftLayersRef.current.includes(layer),
    );
    draftLayersRef.current = [];
  };

  const cancelCurrentDrawing = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    clearDraftMarkers();

    if (tempLayerRef.current) {
      try {
        map.removeLayer(tempLayerRef.current);
      } catch (_) {}
      tempLayerRef.current = null;
    }
    drawPointsRef.current = [];
    if (closeBtnRef.current) closeBtnRef.current.style.display = "none";
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ✏️ AOI shape editing
  // ═══════════════════════════════════════════════════════════════════════════
  const teardownEditHandles = () => {
    const s = editSessionRef.current;
    if (!s) return;
    const map = mapInstanceRef.current;
    s.handles.forEach((h) => {
      try {
        map?.removeLayer(h);
      } catch (_) {}
    });
    editSessionRef.current = null;
  };

  const makeEditIcon = (L: any, size: number, solid: boolean) =>
    L.divIcon({
      className: "",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div style="width:${size}px;height:${size}px;box-sizing:border-box;border-radius:50%;background:${solid ? "#ffffff" : "rgba(255,255,255,0.45)"};border:2px solid #00c8ff;box-shadow:0 0 0 3px rgba(0,200,255,0.25);cursor:grab"></div>`,
    });

  /** بعد أي تعديل ناجح: حدّث الـ canvas / lastCoordsRef / الـ popup / الـ DB / الـ panels */
  const applyEditedAoi = (id: string) => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    const e = aoiRegistryRef.current?.get(id);
    if (!map || !L || !e) return;

    currentShapeIdRef.current = id;
    lastCoordsRef.current = e.coords;
    lastToolRef.current = e.tool;
    if (canvasRef.current) {
      clearCanvas(canvasRef.current);
      redrawCurrent(canvasRef.current, map, L);
    }

    const icon =
      e.kind === "circle" ? "🟢" : e.kind === "rectangle" ? "📐" : "🔵";
    const radiusTxt =
      e.kind === "circle" && e.coords.length === 2
        ? ` · R: ${map
            .distance(
              [e.coords[0].lat, e.coords[0].lng],
              [e.coords[1].lat, e.coords[1].lng],
            )
            .toFixed(0)} m`
        : "";

    try {
      e.layer.unbindPopup();
    } catch (_) {}
    e.layer.bindPopup(() => {
      const div = document.createElement("div");
      const label = document.createElement("div");
      label.innerHTML = `${icon} ${e.name} · ≈ ${e.areaHa} ha${radiusTxt}`;
      div.appendChild(label);
      div.appendChild(buildShapePopupActions(e.layer, e.kind, id));
      return div;
    });

    // 💾 متسيف قبل كده → يتحدّث في الـ DB | جديد → pending لحد Save
    upsertShape(id, e.feature, {
      id,
      name: e.name,
      tool: e.tool as any,
      coords: e.coords as any,
      areaHa: e.areaHa,
      createdAt: new Date().toISOString(),
    });

    if (editSessionRef.current) editSessionRef.current.dirty = true;
    onAreaSelected(e.name, e.areaHa, e.feature);
    onFeatureClick?.(e.feature);
  };

  const commitPolygonEdit = (id: string, pts: [number, number][]) => {
    const reg = aoiRegistryRef.current;
    const e = reg?.get(id);
    if (!reg || !e) return;
    const ringXY = [...pts, pts[0]].map(([lat, lng]) => [lng, lat]);
    const area = parseFloat(
      (turfArea(turfPolygon([ringXY])) / 10000).toFixed(1),
    );
    const feature = makePolygonFeature(e.name, pts, area, {
      id,
      kind: "polygon",
    });
    feature.properties = {
      ...(e.feature.properties ?? {}),
      ...feature.properties,
    };
    // لو كان Rectangle وبقى شكل حر → يبقى Polygon عادي
    reg.update(id, {
      kind: "polygon",
      tool: "polygon",
      areaHa: area,
      feature,
      coords: pts.map(([lat, lng]) => ({ lat, lng })),
    });
    applyEditedAoi(id);
  };

  const buildPolygonEditor = (entry: AOIEntry) => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    const layer = entry.layer;

    const raw: any[] = layer.getLatLngs()?.[0] ?? [];
    let pts: [number, number][] = raw.map(
      (p) => [p.lat, p.lng] as [number, number],
    );
    if (
      pts.length > 3 &&
      pts[0][0] === pts[pts.length - 1][0] &&
      pts[0][1] === pts[pts.length - 1][1]
    )
      pts.pop();
    if (pts.length < 3) return;

    const clone = (a: [number, number][]) =>
      a.map((p) => [p[0], p[1]] as [number, number]);
    let committed = clone(pts);

    const session = { id: entry.id, handles: [] as any[], dirty: false };
    editSessionRef.current = session;

    let vMarkers: any[] = [];
    let mMarkers: any[] = [];
    const mid = (
      a: [number, number],
      b: [number, number],
    ): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const redrawShape = () => layer.setLatLngs([pts]);

    const tryCommit = (): boolean => {
      const v = validateAOI(makePolygonFeature("tmp", pts, 0));
      if (!v.valid) {
        toast.error(
          v.errors?.[0] ??
            (isRTL
              ? "الشكل بعد التعديل غير صالح — تم التراجع"
              : "Invalid shape after edit — reverted"),
        );
        pts = clone(committed);
        redrawShape();
        return false;
      }
      if (v.warnings?.length) toast.warning(v.warnings[0]);
      committed = clone(pts);
      commitPolygonEdit(entry.id, pts);
      return true;
    };

    const rebuild = () => {
      if (editSessionRef.current !== session) return; // التعديل خلص
      session.handles.forEach((h) => {
        try {
          map.removeLayer(h);
        } catch (_) {}
      });
      vMarkers = [];
      mMarkers = [];
      const n = pts.length;

      // ── vertices ──
      pts.forEach((p, i) => {
        const m = L.marker(p, {
          draggable: true,
          icon: makeEditIcon(L, 14, true),
          zIndexOffset: 1000,
          keyboard: false,
        }).addTo(map);
        m.on("drag", (ev: any) => {
          const ll = ev.target.getLatLng();
          pts[i] = [ll.lat, ll.lng];
          redrawShape();
          mMarkers[i]?.setLatLng(mid(pts[i], pts[(i + 1) % n]));
          mMarkers[(i - 1 + n) % n]?.setLatLng(
            mid(pts[(i - 1 + n) % n], pts[i]),
          );
        });
        m.on("dragend", () => {
          tryCommit();
          setTimeout(rebuild, 0);
        });
        const removeVertex = (ev: any) => {
          try {
            L.DomEvent.stop(ev.originalEvent);
          } catch (_) {}
          if (pts.length <= 3) {
            toast.error(
              isRTL
                ? "لازم يفضل 3 نقاط على الأقل"
                : "A polygon needs at least 3 vertices",
            );
            return;
          }
          pts.splice(i, 1);
          redrawShape();
          tryCommit();
          setTimeout(rebuild, 0);
        };
        m.on("contextmenu", removeVertex);
        m.on("dblclick", removeVertex);
        vMarkers.push(m);
      });

      // ── edge midpoints: اسحبها = ضيف نقطة جديدة ──
      pts.forEach((p, i) => {
        const m = L.marker(mid(p, pts[(i + 1) % n]), {
          draggable: true,
          icon: makeEditIcon(L, 10, false),
          zIndexOffset: 900,
          keyboard: false,
        }).addTo(map);
        m.on("dragstart", (ev: any) => {
          const ll = ev.target.getLatLng();
          pts.splice(i + 1, 0, [ll.lat, ll.lng]);
        });
        m.on("drag", (ev: any) => {
          const ll = ev.target.getLatLng();
          pts[i + 1] = [ll.lat, ll.lng];
          redrawShape();
        });
        m.on("dragend", () => {
          tryCommit();
          setTimeout(rebuild, 0);
        });
        mMarkers.push(m);
      });

      session.handles = [...vMarkers, ...mMarkers];
    };

    rebuild();
  };

  const buildCircleEditor = (entry: AOIEntry) => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    const layer = entry.layer;

    let center: [number, number] = [
      layer.getLatLng().lat,
      layer.getLatLng().lng,
    ];
    let radius: number = layer.getRadius();
    let committed = { center: [...center] as [number, number], radius };
    const edgeOf = (c: [number, number], r: number): [number, number] =>
      circleToPolygonLatLng(c[0], c[1], r, 4)[1]; // نقطة الشرق

    const cMarker = L.marker(center, {
      draggable: true,
      icon: makeEditIcon(L, 14, true),
      zIndexOffset: 1000,
      keyboard: false,
    }).addTo(map);
    const eMarker = L.marker(edgeOf(center, radius), {
      draggable: true,
      icon: makeEditIcon(L, 14, true),
      zIndexOffset: 1000,
      keyboard: false,
    }).addTo(map);
    editSessionRef.current = {
      id: entry.id,
      handles: [cMarker, eMarker],
      dirty: false,
    };

    const commit = () => {
      const ring = circleToPolygonLatLng(center[0], center[1], radius, 64);
      const v = validateAOI(makePolygonFeature("tmp", ring, 0));
      if (!v.valid) {
        toast.error(
          v.errors?.[0] ??
            (isRTL
              ? "الشكل بعد التعديل غير صالح — تم التراجع"
              : "Invalid shape after edit — reverted"),
        );
        center = [...committed.center] as [number, number];
        radius = committed.radius;
        layer.setLatLng(center);
        layer.setRadius(radius);
        cMarker.setLatLng(center);
        eMarker.setLatLng(edgeOf(center, radius));
        return;
      }
      if (v.warnings?.length) toast.warning(v.warnings[0]);
      committed = { center: [...center] as [number, number], radius };

      const reg = aoiRegistryRef.current;
      const e = reg?.get(entry.id);
      if (!reg || !e) return;
      const area = parseFloat(
        (Math.PI * Math.pow(radius / 1000, 2) * 100).toFixed(1),
      );
      const edge = eMarker.getLatLng();
      const feature = makePolygonFeature(e.name, ring, area, {
        id: entry.id,
        kind: "circle",
      });
      feature.properties = {
        ...(e.feature.properties ?? {}),
        ...feature.properties,
      };
      reg.update(entry.id, {
        areaHa: area,
        feature,
        coords: [
          { lat: center[0], lng: center[1] },
          { lat: edge.lat, lng: edge.lng },
        ],
      });
      applyEditedAoi(entry.id);
    };

    cMarker.on("drag", (ev: any) => {
      const ll = ev.target.getLatLng();
      center = [ll.lat, ll.lng];
      layer.setLatLng(ll);
      eMarker.setLatLng(edgeOf(center, radius));
    });
    eMarker.on("drag", (ev: any) => {
      const ll = ev.target.getLatLng();
      radius = Math.max(map.distance(center, [ll.lat, ll.lng]), 1);
      layer.setRadius(radius);
    });
    cMarker.on("dragend", commit);
    eMarker.on("dragend", commit);
  };

  const startEditAoi = (id: string) => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    const reg = aoiRegistryRef.current;
    if (!map || !L || !reg || !reg.get(id)) return;

    if (reg.getActiveId() !== id) reg.activate(id); // بس النشط هو اللي يتعدّل
    teardownEditHandles();
    reg.setEditing(id);
    try {
      map.closePopup();
    } catch (_) {}

    const entry = reg.get(id)!;
    try {
      const b = entry.layer.getBounds();
      if (!map.getBounds().contains(b))
        map.flyToBounds(b, { padding: [60, 60], maxZoom: 16, duration: 0.8 });
    } catch (_) {}

    if (entry.kind === "circle") buildCircleEditor(entry);
    else buildPolygonEditor(entry);
  };

  /** "تم": شيل الـ handles، ولو الشكل اتغيّر اعمل capture جديد زي ما بيحصل بعد الرسم */
  const stopEditAoi = async () => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    const reg = aoiRegistryRef.current;
    const dirty = !!editSessionRef.current?.dirty;
    reg?.setEditing(null);
    teardownEditHandles();
    if (!dirty || !map || !L || !reg || !canvasRef.current) return;

    const id = reg.getActiveId();
    const e = id ? reg.get(id) : null;
    if (!e || e.kind === "circle") return; // الدايرة: الـ panels بتعمل capture عند الطلب
    try {
      const coordinates: LatLngPoint[] = e.coords;
      const metadata: CaptureMetadata = {
        areaName: e.name,
        areaSizeHa: e.areaHa,
        zoom: map.getZoom(),
        capturedAt: new Date().toISOString(),
      };
      await handleCapture(canvasRef.current, map, L, coordinates, metadata);
    } catch (err) {
      console.warn("Re-capture after edit failed:", err);
    }
  };

  /** يمسح شكل واحد (أي نوع: polygon / rectangle / circle / marker / line) من:
   *  الخريطة + القائمة + الـ registry + IndexedDB (مع تحقق).
   *  ✅ وبيمسح تحليل الشكل ده بس (خريطة + IndexedDB + بروجكت) — تحليل الأشكال التانية ما بيتأثرش. */
  const deleteSingleShape = (
    layer: any,
    savedAoiId?: string,
    kind?: "polygon" | "rectangle" | "circle" | "marker" | "measure",
  ) => {
    const aoiId: string | undefined = savedAoiId ?? layer?._aoiId;
    const map = mapInstanceRef.current;
    const reg = aoiRegistryRef.current;

    // لو الشكل ده بيتعدّل دلوقتي → اقفل الـ handles الأول
    if (editSessionRef.current && editSessionRef.current.id === aoiId) {
      reg?.setEditing(null);
      teardownEditHandles();
    }

    // 1) القائمة + IndexedDB (بالـ id دايماً، من غير gating — حذف id مش موجود مفيهوش مشكلة)
    if (aoiId) {
      markDeleted([aoiId]);
      pendingShapesRef.current.delete(aoiId);
      savedIdsRef.current.delete(aoiId);
      // ✅ دايماً نبلّغ الأب بالقائمة الجديدة عشان يحدّث البروجكت المتسيف
      setDrawn(
        drawnFeaturesRef.current.filter((f) => f.properties?.id !== aoiId),
      );
      deleteFromDbVerified(aoiId);
      if (currentShapeIdRef.current === aoiId) currentShapeIdRef.current = null;
    }

    // 2) الخريطة
    if (map) {
      try {
        map.closePopup();
      } catch (_) {}
      try {
        map.removeLayer(layer);
      } catch (_) {}
    }

    drawLayersRef.current = drawLayersRef.current.filter((l) => l !== layer);
    draftLayersRef.current = draftLayersRef.current.filter((l) => l !== layer);
    initialFeaturesLayerRef.current = initialFeaturesLayerRef.current.filter(
      (l) => l !== layer,
    );

    // 3) الـ registry (marker / line مش فيه → بنبلّغ الأب بنفسنا)
    const wasInRegistry = !!aoiId && !!reg?.get(aoiId);
    reg?.removeByLayer(layer);
    if (!wasInRegistry && aoiId) onAOIRemove?.(aoiId);

    // 4) نضّف الـ canvas لو مفيش AOI نشط
    const noneLeft = !reg?.getActiveId();
    if (noneLeft && canvasRef.current) {
      lastCoordsRef.current = [];
      lastToolRef.current = "pointer";
      clearCanvas(canvasRef.current);
    }

    // 5) 🧹 تحليل الشكل ده بس (measure مالوش تحليل)
    if (aoiId && kind !== "measure") deleteAnalysisFor(aoiId, true);
  };

  const toLL = (c: any): [number, number] =>
    Array.isArray(c)
      ? [Number(c[0]), Number(c[1])]
      : [Number(c.lat), Number(c.lng)];

  const layerExists = (id: string) =>
    drawLayersRef.current.some((l) => l?._aoiId === id);

  /** يرجّع الأشكال المتسيفة في IndexedDB حسب نوع كل شكل */
  const restoreSavedAois = (map: any, L: any, saved: any[]) => {
    const counts: Record<string, number> = {};
    saved.forEach((item) => {
      try {
        if (!item?.id || layerExists(item.id)) return;
        if (isDeleted(String(item.id))) {
          deleteFromDbVerified(String(item.id)); // نضّف الـ DB من اللي اتمسح قبل كده
          return;
        }
        const id = String(item.id);
        const tool = item.tool ?? "polygon";
        const name = String(item.name ?? "Restored Shape");
        const area = Number(item.areaHa ?? 0);
        const pts: [number, number][] = (item.coords ?? []).map(toLL);
        if (!pts.length) {
          console.warn("Saved AOI has no coords — skipped:", item);
          return;
        }
        savedIdsRef.current.add(id);
        counts[tool] = (counts[tool] ?? 0) + 1;
        const reg = aoiRegistryRef.current;

        // ── Marker ──
        if (tool === "marker") {
          const c = TOOL_COLORS.marker;
          const mk = L.circleMarker(pts[0], {
            radius: 7,
            color: c.stroke,
            fillColor: c.stroke,
            fillOpacity: 0.85,
            weight: 2,
          }).addTo(map);
          (mk as any)._aoiId = id;
          mk.bindPopup(() => {
            const div = document.createElement("div");
            div.innerHTML = `📍 ${pts[0][0].toFixed(6)}°N<br/>${pts[0][1].toFixed(6)}°E`;
            div.appendChild(buildShapePopupActions(mk, "marker", id));
            return div;
          });
          drawLayersRef.current.push(mk);
          setDrawn([
            ...drawnFeaturesRef.current.filter((f) => f.properties?.id !== id),
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [pts[0][1], pts[0][0]] },
              properties: { id, name, _drawn: true, kind: "marker" },
            },
          ]);
          return;
        }

        // ── Measure (line) ──
        if (tool === "measure") {
          if (pts.length < 2) return;
          const c = TOOL_COLORS.measure;
          const line = L.polyline(pts, {
            color: c.stroke,
            weight: 3,
            dashArray: "5, 5",
          }).addTo(map);
          (line as any)._aoiId = id;
          let total = 0;
          for (let i = 0; i < pts.length - 1; i++)
            total += L.latLng(pts[i]).distanceTo(L.latLng(pts[i + 1]));
          const dist =
            total >= 1000
              ? `${(total / 1000).toFixed(2)} km`
              : `${Math.round(total)} m`;
          line.bindPopup(() => {
            const div = document.createElement("div");
            const label = document.createElement("div");
            label.innerHTML = `📏 ${isRTL ? "المسافة" : "Distance"}: <b>${dist}</b>`;
            div.appendChild(label);
            div.appendChild(buildShapePopupActions(line, "measure", id));
            return div;
          });
          drawLayersRef.current.push(line);
          setDrawn([
            ...drawnFeaturesRef.current.filter((f) => f.properties?.id !== id),
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: pts.map(([la, ln]) => [ln, la]),
              },
              properties: { id, name, _drawn: true, kind: "measure" },
            },
          ]);
          return;
        }

        // ── Rectangle / Circle / Polygon ──
        let layer: any;
        let kind: "polygon" | "rectangle" | "circle" = "polygon";
        let regCoords: LatLngPoint[];
        let feature: GeoJSON.Feature;
        let c = TOOL_COLORS.polygon;
        let label = `🔵 ${name} · ≈ ${area} ha`;

        if (tool === "rectangle" && pts.length >= 3) {
          kind = "rectangle";
          c = TOOL_COLORS.rectangle;
          layer = L.rectangle([pts[0], pts[2]], {
            color: c.stroke,
            weight: 2,
            fillColor: c.fill,
            fillOpacity: 0,
          }).addTo(map);
          regCoords = [
            { lat: pts[0][0], lng: pts[0][1] },
            { lat: pts[2][0], lng: pts[2][1] },
          ];
          feature = makePolygonFeature(name, pts, area, { id, kind });
          label = `📐 ${name} · ≈ ${area} ha`;
        } else if (tool === "circle" && pts.length >= 2) {
          kind = "circle";
          c = TOOL_COLORS.circle;
          const radius = map.distance(pts[0], pts[1]);
          layer = L.circle(pts[0], {
            radius,
            color: c.stroke,
            weight: 2,
            fillColor: c.fill,
            fillOpacity: 0,
          }).addTo(map);
          regCoords = [
            { lat: pts[0][0], lng: pts[0][1] },
            { lat: pts[1][0], lng: pts[1][1] },
          ];
          feature = makePolygonFeature(
            name,
            circleToPolygonLatLng(pts[0][0], pts[0][1], radius, 64),
            area,
            { id, kind },
          );
          label = `🟢 ${name} · R: ${radius.toFixed(0)} m · ≈ ${area} ha`;
        } else {
          layer = L.polygon(pts, {
            color: c.stroke,
            weight: 2,
            fillColor: c.fill,
            fillOpacity: 0,
          }).addTo(map);
          regCoords = pts.map(([lat, lng]) => ({ lat, lng }));
          feature = makePolygonFeature(name, pts, area, { id, kind });
        }

        (layer as any)._aoiId = id;
        layer.bindPopup(() => {
          const div = document.createElement("div");
          const lbl = document.createElement("div");
          lbl.innerHTML = label;
          div.appendChild(lbl);
          div.appendChild(buildShapePopupActions(layer, kind, id));
          return div;
        });
        drawLayersRef.current.push(layer);

        reg?.add({
          id,
          name,
          kind,
          tool: kind === "polygon" ? "polygon" : kind,
          layer,
          feature,
          areaHa: area,
          coords: regCoords,
          stroke: c.stroke,
        });
        markSavedSilently(id, feature);
      } catch (err) {
        console.warn("Failed to restore saved AOI:", item, err);
      }
    });

    console.log("✅ Restored saved AOIs by tool:", counts);

    // الشكل النشط بعد الاسترجاع = الشكل الحالي
    const activeId = aoiRegistryRef.current?.getActiveId();
    if (activeId) currentShapeIdRef.current = activeId;
  };

  const buildShapePopupActions = (
    layer: any,
    kind: "polygon" | "rectangle" | "circle" | "marker" | "measure",
    aoiId?: string,
  ) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;margin-top:6px;";
    const id: string | undefined = aoiId ?? layer?._aoiId;

    // 💾 Save
    const isSaved = !!id && savedIdsRef.current.has(id);
    const saveBtn = document.createElement("button");
    saveBtn.textContent = isSaved
      ? isRTL
        ? "✅ تم الحفظ"
        : "✅ Saved"
      : isRTL
        ? "💾 حفظ"
        : "💾 Save";
    saveBtn.disabled = isSaved;
    saveBtn.style.cssText = isSaved
      ? "background:#22c55e22;border:1px solid #22c55e55;color:#4ade80;padding:4px 10px;border-radius:8px;font-size:11px;cursor:default"
      : "background:#00c8ff22;border:1px solid #00c8ff55;color:#00c8ff;padding:4px 10px;border-radius:8px;font-size:11px;cursor:pointer";
    saveBtn.onclick = () => {
      if (id) saveShape(id);
    };

    // 🗑️ Delete
    const delBtn = document.createElement("button");
    delBtn.textContent = isRTL ? "🗑️ حذف" : "🗑️ Delete";
    delBtn.style.cssText =
      "background:#ef444422;border:1px solid #ef444455;color:#f87171;padding:4px 10px;border-radius:8px;font-size:11px;cursor:pointer";
    delBtn.onclick = () => {
      deleteSingleShape(layer, id, kind);
    };

    row.appendChild(saveBtn);
    row.appendChild(delBtn);
    return row;
  };

  // ═══ الصور الثابتة (Image overlays) — IndexedDB store "imageOverlays" ═══════
  const persistImageOverlays = () => {
    if (!persistDataRef.current) return;
    const payload = imageOverlaysRef.current.map((o) => ({
      id: o.id,
      name: o.name,
      src: o.src,
      bounds: o.bounds,
    }));
    imageOverlaysReplaceAll(payload).catch((e) =>
      console.warn("imageOverlays save failed", e),
    );
  };

  const restoreImageOverlays = async () => {
    if (!persistDataRef.current) return;
    try {
      let arr: any[] = await imageOverlaysGetAll();

      // migration مرة واحدة من localStorage القديم
      if (!arr.length) {
        try {
          const raw = localStorage.getItem(LEGACY_IMAGE_OVERLAYS_KEY);
          if (raw) {
            const legacy = JSON.parse(raw);
            if (Array.isArray(legacy) && legacy.length) {
              arr = legacy;
              await imageOverlaysReplaceAll(legacy);
            }
          }
        } catch (_) {}
      }
      try {
        localStorage.removeItem(LEGACY_IMAGE_OVERLAYS_KEY);
      } catch (_) {}

      const map = mapInstanceRef.current;
      const L = LRef.current;
      if (!map || !L || !arr.length) return;

      for (const it of arr) {
        if (!it?.src || !it?.bounds) continue;
        if (imageOverlaysRef.current.some((o) => o.id === String(it.id)))
          continue;
        const b = it.bounds as [[number, number], [number, number]];
        const bounds = L.latLngBounds([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        const layer = L.imageOverlay(it.src, bounds, {
          opacity: 0.85,
          pane: "imagePane",
        }).addTo(map);
        imageOverlaysRef.current.push({
          id: String(
            it.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          ),
          name: String(it.name ?? "overlay"),
          src: it.src,
          bounds: b,
          layer,
        });
      }
      refreshOverlaysUi();
    } catch (e) {
      console.warn("Image overlays restore failed", e);
    }
  };

  const refreshOverlaysUi = () => {
    const root = overlaysUiRef.current;
    if (!root) return;
    const list = imageOverlaysRef.current;

    root.innerHTML = "";
    if (!list.length) {
      root.style.display = "none";
      return;
    }

    root.style.display = "block";
    const title = document.createElement("div");
    title.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";
    title.innerHTML = `<span style="color:#94a3b8;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Image overlays</span>`;

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.style.cssText =
      "background:transparent;border:1px solid rgba(255,255,255,0.12);color:#e2e8f0;font-size:11px;padding:4px 8px;border-radius:10px;cursor:pointer";
    clearBtn.onclick = () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      imageOverlaysRef.current.forEach((ov) => {
        try {
          map.removeLayer(ov.layer);
        } catch (_) {}
      });
      imageOverlaysRef.current = [];
      if (persistDataRef.current) {
        imageOverlaysClear().catch((e) =>
          console.warn("imageOverlays clear failed", e),
        );
      }
      refreshOverlaysUi();
    };
    title.appendChild(clearBtn);
    root.appendChild(title);

    for (const ov of list) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);padding:8px 10px;border-radius:12px;margin-bottom:6px;";
      const name = document.createElement("div");
      name.textContent = ov.name;
      name.style.cssText =
        "flex:1;min-width:0;color:#e2e8f0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.style.cssText =
        "background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.22);color:#f87171;font-size:11px;padding:5px 8px;border-radius:10px;cursor:pointer";
      del.onclick = () => {
        const map = mapInstanceRef.current;
        if (!map) return;
        try {
          map.removeLayer(ov.layer);
        } catch (_) {}
        imageOverlaysRef.current = imageOverlaysRef.current.filter(
          (x) => x.id !== ov.id,
        );
        // replaceAll بقائمة فاضية = مسح الـ store كله (فمفيش حاجة تترجع بعد الريفريش)
        persistImageOverlays();
        refreshOverlaysUi();
      };
      row.appendChild(name);
      row.appendChild(del);
      root.appendChild(row);
    }
  };

  const startImagePlacement = (file: File) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    stopImagePlacement();

    const hint = document.createElement("div");
    hint.style.cssText = `
      position:absolute;top:14px;left:50%;transform:translateX(-50%);
      z-index:1200;pointer-events:none;
      background:rgba(10,22,40,0.92);backdrop-filter:blur(10px);
      border:1px solid rgba(0,212,255,0.25);color:#e2e8f0;
      padding:8px 12px;border-radius:999px;
      font-family:DM Sans, sans-serif;font-size:12px;
      box-shadow:0 10px 28px rgba(0,0,0,0.45);
    `;
    hint.textContent = `Preparing image…`;
    mapRef.current?.appendChild(hint);

    placingImageRef.current = {
      file,
      src: "",
      ready: false,
      clicks: [],
      hintEl: hint,
    };

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src.startsWith("data:")) return;
      const st = placingImageRef.current;
      if (!st) return;
      st.src = src;
      st.ready = true;
      if (st.hintEl)
        st.hintEl.textContent = `Place image: click TOP-LEFT corner ثم click BOTTOM-RIGHT (Esc لإلغاء)`;
    };
    reader.readAsDataURL(file);
  };

  // Register image placer handler for external UI (upload modal)
  useEffect(() => {
    if (!onImagePlacerRegister) return;
    onImagePlacerRegister((file: File) => startImagePlacement(file));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onImagePlacerRegister, mapReady]);

  // ── Raster overlay (config === null → "Remove from map": تحليل الشكل الحالي بس) ──
  useEffect(() => {
    if (!onRasterOverlayRegister) return;
    onRasterOverlayRegister((config) => {
      if (config === null) {
        const owner = currentShapeIdRef.current;
        if (owner) deleteAnalysisFor(owner);
        return;
      }
      if (isEchoAfterClear("raster", config)) return;
      applyRasterOverlay(config);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRasterOverlayRegister, mapReady]);

  // ── Points render style (Palm Trees "points" mode) ──────────────────────────
  useEffect(() => {
    if (!onPointsOverlayRegister) return;
    onPointsOverlayRegister((config) => {
      if (!config) {
        const owner = currentShapeIdRef.current;
        if (owner) deleteAnalysisFor(owner);
        return;
      }
      if (isEchoAfterClear("points", config)) return;
      applyPointsOverlay(config);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPointsOverlayRegister, mapReady]);

  // ── Super Resolution overlay ────────────────────────────────────────────────
  useEffect(() => {
    if (!onSuperResOverlayRegister) return;
    onSuperResOverlayRegister((config) => {
      if (!config) {
        const owner = currentShapeIdRef.current;
        if (owner) deleteAnalysisFor(owner);
        return;
      }
      if (isEchoAfterClear("superRes", config)) return;
      applySuperResOverlay(config);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSuperResOverlayRegister, mapReady]);

  // ── Change Detection: real, georeferenced Before/After swipe on the map ────
  useEffect(() => {
    if (!onSwipeOverlayRegister) return;
    onSwipeOverlayRegister((config) => {
      if (!config) {
        const owner = currentShapeIdRef.current;
        if (owner) deleteAnalysisFor(owner);
        return;
      }
      if (isEchoAfterClear("swipe", config)) return;
      applySwipeOverlay(config);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSwipeOverlayRegister, mapReady]);

  // Escape cancels only the in-progress interaction.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();

      if (placingImageRef.current) {
        stopImagePlacement();
        return;
      }

      if (drawPointsRef.current.length > 0) {
        cancelCurrentDrawing();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const drawExtrusions = () => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    const canvas = extrudeCanvasRef.current;
    const fc = extrusionGeoJson;
    const cfg = extrusionConfig;
    if (!map || !L || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!cfg?.enabled || !fc?.features?.length) return;

    const heightProp = cfg.heightProperty ?? "height";
    const fallbackH = cfg.defaultHeightM ?? 30;
    const color = cfg.color ?? "#22d3ee";
    const opacity = cfg.opacity ?? 0.55;

    const center = map.getCenter();
    const lat = center?.lat ?? 0;
    const zoom = map.getZoom();
    const mpp =
      (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);

    const toPx = (latlng: any) => map.latLngToContainerPoint(latlng);
    const clamp = (n: number, a: number, b: number) =>
      Math.max(a, Math.min(b, n));

    const walkRings = (coords: any): any[] => {
      if (!coords) return [];
      if (
        Array.isArray(coords) &&
        Array.isArray(coords[0]) &&
        typeof coords[0][0] === "number"
      )
        return [coords];
      if (
        Array.isArray(coords) &&
        Array.isArray(coords[0]) &&
        Array.isArray(coords[0][0])
      )
        return coords.flatMap((poly: any) => poly);
      return [];
    };

    for (const f of fc.features) {
      const g: any = f.geometry as any;
      if (!g) continue;
      if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;

      const rawH = (f.properties as any)?.[heightProp];
      const hM = Number.isFinite(Number(rawH)) ? Number(rawH) : fallbackH;
      const hPx = clamp(hM / Math.max(mpp, 0.0001), 6, 90);
      const dx = 0.7 * hPx;
      const dy = 1.0 * hPx;

      const rings = walkRings(g.coordinates);
      for (const ring of rings) {
        const pts = ring.map((c: any) => toPx(L.latLng(c[1], c[0])));
        if (pts.length < 3) continue;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pts[0].x - dx, pts[0].y - dy);
        for (let i = 1; i < pts.length; i++)
          ctx.lineTo(pts[i].x - dx, pts[i].y - dy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.globalAlpha = Math.max(0.18, opacity - 0.18);
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i],
            b = pts[i + 1];
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(b.x - dx, b.y - dy);
          ctx.lineTo(a.x - dx, a.y - dy);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
  };

  // ── GeoJSON layer useEffect ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L || !geoJsonData) return;

    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    const styleFn = (feature: any) => {
      const p = feature?.properties ?? {};

      if (p._layerType === "university" || p.FromBreak !== undefined) {
        const uc = p._fillColor
          ? { fill: p._fillColor, stroke: p._strokeColor ?? p._fillColor }
          : getUniversityColor(p.FromBreak ?? 0, p.ToBreak ?? 15);
        return {
          color: geoJsonStyle?.color ?? uc.stroke,
          weight: geoJsonStyle?.weight ?? 1.5,
          opacity: geoJsonStyle?.opacity ?? 0.9,
          fillColor: geoJsonStyle?.fillColor ?? uc.fill,
          fillOpacity: geoJsonStyle?.fillOpacity ?? 0.25,
          dashArray: geoJsonStyle?.dashArray,
        };
      }

      return {
        color: geoJsonStyle?.color ?? "#00c8ff",
        weight: geoJsonStyle?.weight ?? 1.5,
        opacity: geoJsonStyle?.opacity ?? 0.85,
        fillColor: geoJsonStyle?.fillColor ?? "#00c8ff",
        fillOpacity: geoJsonStyle?.fillOpacity ?? 0.08,
        dashArray: geoJsonStyle?.dashArray,
      };
    };

    const pointToLayerFn = (_: any, latlng: any) =>
      L.circleMarker(latlng, {
        radius: 4,
        color: "#22d3ee",
        fillColor: "#22d3ee",
        fillOpacity: 0.8,
        weight: 2,
      });

    const onEachFeatureFn = (feature: any, lyr: any) => {
      if (!feature.properties) return;
      const p = feature.properties;

      if (p._layerType === "university" || p.FromBreak !== undefined) {
        const uc = p._fillColor
          ? { fill: p._fillColor }
          : getUniversityColor(p.FromBreak ?? 0, p.ToBreak ?? 15);
        const rangeLabel =
          p.ToBreak <= 5
            ? "0 – 5 دقائق  (الأقرب)"
            : p.ToBreak <= 10
              ? "5 – 10 دقائق"
              : "10 – 15 دقيقة (الأبعد)";
        lyr.bindTooltip(
          `<div style="font-size:.75rem;line-height:1.5;direction:rtl">
            <span style="color:${uc.fill};font-weight:700">${p.Name?.split(" : ")[0] ?? ""}</span><br/>
            <span style="color:#cbd5e1">${rangeLabel}</span>
          </div>`,
          { sticky: true, className: "ndvi-tooltip" },
        );
        lyr.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          if (onFeatureClick) onFeatureClick(feature as GeoJSON.Feature);
          if (geoJsonLayerRef.current) geoJsonLayerRef.current.resetStyle();
          lyr.setStyle({ weight: 3, opacity: 1, fillOpacity: 0.45 });
        });
        return;
      }

      lyr.on("click", (e: any) => {
        L.DomEvent.stopPropagation(e);
        if (onFeatureClick) onFeatureClick(feature as GeoJSON.Feature);
        if (geoJsonLayerRef.current) geoJsonLayerRef.current.resetStyle();
        lyr.setStyle({
          weight: 3,
          opacity: 1,
          color: "#22d3ee",
          fillOpacity: 0.25,
        });
      });
    };

    const layer = L.geoJSON(undefined, {
      renderer: L.canvas({ padding: 0.5 }),
      style: styleFn,
      pointToLayer: pointToLayerFn,
      onEachFeature: onEachFeatureFn,
    });

    layer.addTo(map);
    geoJsonLayerRef.current = layer;

    const allFeatures: any[] =
      geoJsonData.type === "FeatureCollection"
        ? (geoJsonData.features ?? [])
        : geoJsonData.type === "Feature"
          ? [geoJsonData]
          : [];

    if (geoJsonFitBounds && allFeatures.length) {
      try {
        const [minX, minY, maxX, maxY] = turfBbox(geoJsonData as any);
        const bounds = L.latLngBounds([minY, minX], [maxY, maxX]);
        if (bounds.isValid()) {
          map.flyToBounds(bounds, {
            padding: [40, 40],
            maxZoom: 16,
            duration: 1.2,
          });
        }
      } catch (_) {}
    }

    let cancelled = false;
    let rafId: number | null = null;
    const BATCH_SIZE = 50;
    const FRAME_BUDGET_MS = 8;
    let cursor = 0;

    const processBatches = () => {
      if (cancelled) return;
      const frameStart = performance.now();
      while (
        cursor < allFeatures.length &&
        performance.now() - frameStart < FRAME_BUDGET_MS
      ) {
        const batch = allFeatures.slice(cursor, cursor + BATCH_SIZE);
        layer.addData({ type: "FeatureCollection", features: batch } as any);
        cursor += BATCH_SIZE;
      }
      if (cursor < allFeatures.length) {
        rafId = requestAnimationFrame(processBatches);
      } else {
        console.log("✅ GeoJSON layer added");
      }
    };

    if (allFeatures.length) {
      rafId = requestAnimationFrame(processBatches);
    }

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (geoJsonLayerRef.current) {
        map.removeLayer(geoJsonLayerRef.current);
        geoJsonLayerRef.current = null;
      }
    };
  }, [geoJsonData, mapReady, geoJsonFitBounds, geoJsonStyle, onFeatureClick]);

  // ── Extra GeoJSON layer (شيكات الجامعات) ─────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    if (extraGeoJsonLayerRef.current) {
      map.removeLayer(extraGeoJsonLayerRef.current);
      extraGeoJsonLayerRef.current = null;
    }
    if (!extraGeoJsonData) return;

    const layer = L.geoJSON(extraGeoJsonData, {
      renderer: L.canvas({ padding: 0.5 }),
      style: (feature: any) => {
        const p = feature?.properties ?? {};
        const layerOpacity =
          typeof p._opacity === "number"
            ? Math.max(0, Math.min(1, p._opacity))
            : 1;

        if (p._layerType === "university" || p.FromBreak !== undefined) {
          const uc = p._fillColor
            ? { fill: p._fillColor, stroke: p._strokeColor ?? p._fillColor }
            : getUniversityColor(p.FromBreak ?? 0, p.ToBreak ?? 15);
          return {
            color: uc.stroke,
            weight: 1.8,
            opacity: 0.9 * layerOpacity,
            fillColor: uc.fill,
            fillOpacity: 0.22 * layerOpacity,
          };
        }

        const customColor = p._color ?? p.color ?? p.stroke ?? "#00c8ff";
        const customFill = p._fillColor ?? p.fillColor ?? p.fill ?? "#00c8ff";
        const isLine = feature?.geometry?.type === "LineString" || feature?.geometry?.type === "MultiLineString";
        return {
          color: customColor,
          weight: isLine ? 2.5 : 2, // never 0 → lines always have a visible width
          opacity: 0.9 * layerOpacity,
          fillColor: customFill,
          fillOpacity: 0.2 * layerOpacity,
        };
      },
      onEachFeature: (feature: any, lyr: any) => {
        const p = feature?.properties ?? {};

        if (p._layerType === "university" || p.FromBreak !== undefined) {
          const uc = p._fillColor
            ? { fill: p._fillColor }
            : getUniversityColor(p.FromBreak ?? 0, p.ToBreak ?? 15);
          const uniName = (p.Name ?? "").split(" : ")[0];
          const rangeLabel =
            p.ToBreak <= 5
              ? "0 – 5 دقائق  🟢"
              : p.ToBreak <= 10
                ? "5 – 10 دقائق 🟡"
                : "10 – 15 دقيقة 🔴";
          lyr.bindTooltip(
            `<div style="font-size:.75rem;line-height:1.6;direction:rtl;padding:2px 4px">
              <strong style="color:${uc.fill}">${uniName}</strong><br/>
              <span style="color:#cbd5e1">${rangeLabel}</span>
            </div>`,
            { sticky: true, className: "ndvi-tooltip" },
          );
          lyr.on("click", (e: any) => {
            L.DomEvent.stopPropagation(e);
            if (onFeatureClick) onFeatureClick(feature as GeoJSON.Feature);
            if (extraGeoJsonLayerRef.current)
              extraGeoJsonLayerRef.current.resetStyle();
            lyr.setStyle({ weight: 3, fillOpacity: 0.45 });
          });
          return;
        }

        const propKeys = Object.keys(p).filter((k) => !k.startsWith("_"));
        if (propKeys.length > 0) {
          const preview = propKeys
            .slice(0, 3)
            .map(
              (k) =>
                `<span style="color:#94a3b8">${k}:</span> <span style="color:#e2e8f0">${p[k]}</span>`,
            )
            .join("<br/>");
          lyr.bindTooltip(
            `<div style="font-size:.72rem;line-height:1.6;padding:2px 4px">${preview}</div>`,
            { sticky: true, className: "ndvi-tooltip" },
          );
          const allProps = propKeys
            .map(
              (k) =>
                `<tr><td style="color:#64748b;padding:2px 6px 2px 0;font-size:.68rem">${k}</td><td style="color:#e2e8f0;font-size:.68rem">${p[k] ?? "—"}</td></tr>`,
            )
            .join("");
          lyr.bindPopup(
            `<div style="min-width:180px"><table style="border-collapse:collapse;width:100%">${allProps}</table></div>`,
            { maxWidth: 280 },
          );
        }
        lyr.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          if (onFeatureClick) onFeatureClick(feature as GeoJSON.Feature);
          if (extraGeoJsonLayerRef.current)
            extraGeoJsonLayerRef.current.resetStyle();
          lyr.setStyle({ weight: 3, fillOpacity: 0.45 });
        });
      },
    });

    layer.addTo(map);
    extraGeoJsonLayerRef.current = layer;

    console.log("✅ University polygons layer added");

    // ── DEBUG: why aren't lines drawn? ────────────────────────────────────
    try {
      const feats: any[] = (extraGeoJsonData as any).features ?? [extraGeoJsonData];
      const lineFeats = feats.filter((f) => /LineString/.test(f?.geometry?.type ?? ""));
      const first = lineFeats[0];
      const lb = (layer as any).getBounds?.();
      const dbg = () => {
        const r: any = (layer as any).options?.renderer;
        const cv: HTMLCanvasElement | undefined = r?._container;
        const cs = cv ? getComputedStyle(cv) : null;
        const sz = map.getSize();
        let firstLayerOpts: any = null;
        layer.eachLayer((l: any) => {
          if (!firstLayerOpts && /LineString|Polyline/i.test(l?.feature?.geometry?.type ?? "")) {
            firstLayerOpts = {
              weight: l.options?.weight, opacity: l.options?.opacity, color: l.options?.color,
              stroke: l.options?.stroke, parts: l._parts?.length ?? null,
            };
          }
        });
        console.log(
          "[CONTOURS-DEBUG:map]",
          JSON.stringify({
            totalFeatures: feats.length,
            lineFeatures: lineFeats.length,
            firstLineProps: first?.properties ?? null,
            firstLineStyle: firstLayerOpts,
            layerBounds: lb?.isValid?.() ? lb.toBBoxString() : null,
            mapBounds: map.getBounds().toBBoxString(),
            intersects: lb?.isValid?.() ? map.getBounds().intersects(lb) : null,
            mapSize: { w: sz.x, h: sz.y },
            canvas: cv
              ? {
                  attrW: cv.width, attrH: cv.height,
                  cssW: cs?.width, cssH: cs?.height,
                  display: cs?.display, opacity: cs?.opacity,
                  visibility: cs?.visibility, zoom: map.getZoom(),
                }
              : "no canvas created",
          })
        );
      };
      // Leaflet creates the canvas lazily → read it a bit after adding
      setTimeout(dbg, 400);
      // zero-size canvas fix: make Leaflet re-measure the container
      setTimeout(() => map.invalidateSize(false), 50);
    } catch (e) {
      console.warn("[CONTOURS-DEBUG:map] failed", e);
    }

    return () => {
      if (extraGeoJsonLayerRef.current) {
        map.removeLayer(extraGeoJsonLayerRef.current);
        extraGeoJsonLayerRef.current = null;
      }
    };
  }, [extraGeoJsonData, mapReady]);

  // ── 🆕 Fly to latestGeoJson when it's uploaded ──────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L || !latestGeoJson) return;

    try {
      const tempLayer = L.geoJSON(latestGeoJson);
      const bounds = tempLayer.getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, {
          padding: [50, 50],
          maxZoom: 16,
          duration: 1.2,
        });
      }
    } catch (err) {
      console.error("Fly to latestGeoJson failed:", err);
    }
  }, [latestGeoJson]);

  // ── Restore drawn features from project snapshot ─────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = LRef.current;

    if (!map || !L || !initialFeatures?.length) return;

    // شيل بس الـ layers اللي اتشال id بتاعها من initialFeatures (مش كلهم) — عشان ما نعيدش رسم اللي المستخدم مسحه
    const incomingIds = new Set(
      initialFeatures
        .map((f) => f.properties?.id)
        .filter(Boolean)
        .map(String),
    );
    initialFeaturesLayerRef.current = initialFeaturesLayerRef.current.filter(
      (layer) => {
        const lid = (layer as any)?._aoiId;
        if (lid && incomingIds.has(String(lid))) return true;
        try {
          map.removeLayer(layer);
        } catch (_) {}
        drawLayersRef.current = drawLayersRef.current.filter(
          (l) => l !== layer,
        );
        aoiRegistryRef.current?.removeByLayer(layer);
        return false;
      },
    );

    const c = TOOL_COLORS.polygon;
    const bounds: any[] = [];

    initialFeatures.forEach((feature) => {
      try {
        const pid = feature.properties?.id;
        if (pid && layerExists(String(pid))) return; // اتسترجع قبل كده من الـ DB
        if (pid && isDeleted(String(pid))) return; // المستخدم مسحه

        const geom = feature.geometry;
        const props = feature.properties ?? {};
        const name = String(props.name ?? "Restored Shape");
        const area = Number(props.areaHa ?? 0);

        // ── Polygon / Rectangle ───────────────────────────────────────────────
        if (geom.type === "Polygon") {
          const ring = geom.coordinates[0].map(([lng, lat]: number[]) => [
            lat,
            lng,
          ]);
          const poly = L.polygon(ring, {
            color: c.stroke,
            weight: 2,
            fillColor: c.fill,
            fillOpacity: 0,
          }).addTo(map);

          const aoiId = String(props.id ?? newAoiId());
          (poly as any)._aoiId = aoiId;

          markSavedSilently(aoiId, {
            ...feature,
            properties: { ...props, id: aoiId },
          });

          // بيترسم كـ polygon عادي → نسجّله كـ polygon عشان الـ editor يشتغل صح
          poly.bindPopup(() => {
            const div = document.createElement("div");
            div.innerHTML = `🔵 ${name}${area ? ` · ≈ ${area} ha` : ""}`;
            div.appendChild(buildShapePopupActions(poly, "polygon", aoiId));
            return div;
          });

          drawLayersRef.current.push(poly);
          initialFeaturesLayerRef.current.push(poly);

          aoiRegistryRef.current?.add({
            id: aoiId,
            name,
            kind: "polygon",
            tool: "polygon",
            layer: poly,
            feature: {
              ...feature,
              properties: { ...props, id: aoiId, kind: "polygon" },
            },
            areaHa: area,
            coords: ring.map(([lat, lng]: number[]) => ({ lat, lng })),
            stroke: c.stroke,
          });

          try {
            bounds.push(poly.getBounds());
          } catch (_) {}
        }

        // ── Point ─────────────────────────────────────────────────────────────
        if (geom.type === "Point") {
          const [lng, lat] = geom.coordinates as number[];
          const marker = L.circleMarker([lat, lng], {
            radius: 8,
            color: TOOL_COLORS.marker.stroke,
            fillColor: TOOL_COLORS.marker.fill,
            fillOpacity: 0.85,
            weight: 2,
          }).addTo(map);
          (marker as any)._aoiId = String(props.id ?? newAoiId());

          markSavedSilently((marker as any)._aoiId, {
            ...feature,
            properties: { ...props, id: (marker as any)._aoiId },
          });
          marker.bindPopup(() => {
            const div = document.createElement("div");
            div.innerHTML = `📍 ${name}`;
            div.appendChild(
              buildShapePopupActions(
                marker,
                "marker",
                (marker as any)._aoiId,
              ),
            );
            return div;
          });
          drawLayersRef.current.push(marker);
          initialFeaturesLayerRef.current.push(marker);
        }

        // ── LineString (measure) ──────────────────────────────────────────────
        if (geom.type === "LineString") {
          const latlngs = geom.coordinates.map(([lng, lat]: number[]) => [
            lat,
            lng,
          ]);
          const line = L.polyline(latlngs, {
            color: TOOL_COLORS.measure.stroke,
            weight: 2.5,
          }).addTo(map);
          (line as any)._aoiId = String(props.id ?? newAoiId());
          markSavedSilently((line as any)._aoiId, {
            ...feature,
            properties: { ...props, id: (line as any)._aoiId },
          });
          line.bindPopup(() => {
            const div = document.createElement("div");
            div.innerHTML = `📏 ${name}`;
            div.appendChild(
              buildShapePopupActions(line, "measure", (line as any)._aoiId),
            );
            return div;
          });
          drawLayersRef.current.push(line);
          initialFeaturesLayerRef.current.push(line);
          try {
            bounds.push(line.getBounds());
          } catch (_) {}
        }
      } catch (err) {
        console.warn("Failed to restore feature:", err);
      }
    });

    const reg = aoiRegistryRef.current;
    const activeId = reg?.getActiveId();
    const activeEntry = activeId ? reg?.get(activeId) : null;
    if (activeEntry) {
      lastCoordsRef.current = activeEntry.coords;
      lastToolRef.current = "polygon";
      currentShapeIdRef.current = activeEntry.id;
    }

    if (bounds.length) {
      try {
        const combined = bounds.reduce(
          (acc, b) => acc.extend(b),
          L.latLngBounds(bounds[0].getSouthWest(), bounds[0].getNorthEast()),
        );
        if (combined.isValid()) {
          map.flyToBounds(combined, {
            padding: [60, 60],
            maxZoom: 15,
            duration: 1.2,
          });
        }
      } catch (_) {}
    }
  }, [initialFeatures, mapReady]);

  // ── Extrusion canvas redraw on map moves ──────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const redraw = () => {
      const canvas = extrudeCanvasRef.current;
      if (!canvas) return;
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      drawExtrusions();
    };
    redraw();
    map.on("moveend zoomend viewreset resize", redraw);
    return () => {
      map.off("moveend zoomend viewreset resize", redraw);
    };
  }, [
    mapReady,
    extrusionGeoJson,
    extrusionConfig?.enabled,
    extrusionConfig?.heightProperty,
    extrusionConfig?.defaultHeightM,
    extrusionConfig?.color,
    extrusionConfig?.opacity,
  ]);

  const redrawCurrent = (canvas: HTMLCanvasElement, map: any, L: any) => {
    const coords = lastCoordsRef.current;
    const tool = lastToolRef.current;
    if (!coords.length) return;
    const px = coords.map((p) =>
      map.latLngToContainerPoint(L.latLng(p.lat, p.lng)),
    );
    if (tool === "polygon") drawPolygon(canvas, px);
    if (tool === "measure") drawMeasure(canvas, px);
    if (tool === "rectangle" && px.length === 2) drawRect(canvas, px[0], px[1]);
    if (tool === "circle" && px.length === 2) {
      const rPx = Math.sqrt(
        (px[1].x - px[0].x) ** 2 + (px[1].y - px[0].y) ** 2,
      );
      drawCircle(canvas, px[0], rPx);
    }
    if (tool === "marker") {
      clearCanvas(canvas);
      px.forEach((p) => drawMarker(canvas, p));
    }
  };

  const validatePolygonBeforeSave = (pts: [number, number][]) => {
    if (pts.length < 3) return { ok: false, msg: "Not enough points" };

    const feature = makePolygonFeature("temp", pts, 0);
    const result = validateAOI(feature);

    if (!result.valid) {
      return { ok: false, msg: result.errors?.[0] || "Invalid polygon" };
    }

    return { ok: true, msg: "" };
  };

  const handleCapture = async (
    canvas: HTMLCanvasElement,
    map: any,
    L: any,
    coordinates: LatLngPoint[],
    metadata: CaptureMetadata,
  ) => {
    // ── AOI validation: no self-intersection + within max size ────────────────
    if (coordinates.length >= 3) {
      const feature = makePolygonFeature(
        metadata.areaName,
        coordinates.map((p) => [p.lat, p.lng]),
        metadata.areaSizeHa,
      );
      const validation = validateAOI(feature);
      if (!validation.valid) {
        toast.error(
          validation.errors[0] ??
            (isRTL ? "شكل المنطقة غير صالح" : "Invalid AOI geometry"),
        );
        return;
      }
      if (validation.warnings.length) {
        toast.warning(validation.warnings[0]);
      }
    }

    try {
      const captureResult = await capture(
        canvas,
        map,
        L,
        coordinates,
        metadata,
        captureTarget,
      );
      const {
        smallBlob,
        largeBlob,
        viewportCoordinates,
        selectedBounds,
        viewportBounds,
      } = captureResult;
      onCapture?.(captureResult);
      const res = await sendToBackend(
        smallBlob,
        captureTarget === "large" ? largeBlob : undefined,
        coordinates,
        metadata,
        { viewportCoordinates, selectedBounds, viewportBounds },
        captureTarget,
      );
      if (res.ok) console.log("✅ Backend:", await res.json());
    } catch (err) {
      console.error("❌ Capture error:", err);
    }
  };

  const finishPolygon = async (map: any, L: any) => {
    const pts: [number, number][] = [...drawPointsRef.current];

    const check = validatePolygonBeforeSave(pts);
    if (!check.ok) {
      toast.error(check.msg);
      return;
    }
    if (tempLayerRef.current) {
      map.removeLayer(tempLayerRef.current);
      tempLayerRef.current = null;
    }
    if (closeBtnRef.current) closeBtnRef.current.style.display = "none";

    // الشكل خلص → شيل نقط الرسم المؤقتة وصفّر الحالة فوراً
    clearDraftMarkers();
    drawPointsRef.current = [];

    const c = TOOL_COLORS.polygon;
    const poly = L.polygon(pts, {
      color: c.stroke,
      weight: 2,
      fillColor: c.fill,
      fillOpacity: 0,
    }).addTo(map);
    drawLayersRef.current.push(poly);
    const coords = [...pts, pts[0]].map(([lat, lng]) => [lng, lat]);

    const polygon = turfPolygon([coords]);
    const area = parseFloat((turfArea(polygon) / 10000).toFixed(1));

    const reg = aoiRegistryRef.current;
    const aoiId = newAoiId();
    (poly as any)._aoiId = aoiId;
    const aoiName = reg?.nextName("Drawn Polygon") ?? "Drawn Polygon";

    poly
      .bindPopup(() => {
        const div = document.createElement("div");
        const label = document.createElement("div");
        label.innerHTML = `🔵 ${t.polygon} · ≈ ${area} ${t.ha}`;
        div.appendChild(label);
        div.appendChild(buildShapePopupActions(poly, "polygon", aoiId));
        return div;
      })
      .openPopup();

    const feature = makePolygonFeature(aoiName, pts, area, {
      id: aoiId,
      kind: "polygon",
    });

    // 1. pending لحد ما المستخدم يدوس Save / Save All
    upsertShape(aoiId, feature, {
      id: aoiId,
      name: aoiName,
      tool: "polygon" as any,
      coords: pts.map(([lat, lng]: [number, number]) => ({ lat, lng })) as any,
      areaHa: area,
      createdAt: new Date().toISOString(),
    });

    // 2. التحديث في الـ Registry للواجهة
    reg?.add({
      id: aoiId,
      name: aoiName,
      kind: "polygon",
      tool: "polygon",
      layer: poly,
      feature,
      areaHa: area,
      coords: pts.map(([lat, lng]: [number, number]) => ({ lat, lng })),
      stroke: c.stroke,
    });
    currentShapeIdRef.current = aoiId;

    onAreaSelected(aoiName, area, feature);
    onFeatureClick?.(feature);

    const coordinates: LatLngPoint[] = pts.map(
      ([lat, lng]: [number, number]) => ({ lat, lng }),
    );
    lastCoordsRef.current = coordinates;
    lastToolRef.current = "polygon";

    if (canvasRef.current) {
      drawPolygon(
        canvasRef.current,
        coordinates.map((p) =>
          map.latLngToContainerPoint(L.latLng(p.lat, p.lng)),
        ),
      );
      const metadata: CaptureMetadata = {
        areaName: aoiName,
        areaSizeHa: area,
        zoom: map.getZoom(),
        capturedAt: new Date().toISOString(),
      };
      await handleCapture(canvasRef.current, map, L, coordinates, metadata);
    }
  };

  const finishMeasure = (map: any, L: any) => {
    const pts: [number, number][] = [...drawPointsRef.current];

    if (pts.length < 2) return;

    if (tempLayerRef.current) {
      map.removeLayer(tempLayerRef.current);
      tempLayerRef.current = null;
    }

    if (closeBtnRef.current) {
      closeBtnRef.current.style.display = "none";
    }

    clearDraftMarkers();
    drawPointsRef.current = [];

    const c = TOOL_COLORS.measure;

    const line = L.polyline(pts, {
      color: c.stroke,
      weight: 3,
      dashArray: "5, 5",
    }).addTo(map);

    drawLayersRef.current.push(line);

    let totalMeters = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      totalMeters += L.latLng(pts[i]).distanceTo(L.latLng(pts[i + 1]));
    }

    const distanceFormatted =
      totalMeters >= 1000
        ? `${(totalMeters / 1000).toFixed(2)} km`
        : `${Math.round(totalMeters)} m`;

    const aoiId = newAoiId();
    (line as any)._aoiId = aoiId;
    (line as any).__savedAoiId = aoiId;

    const lineFeature: GeoJSON.Feature = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: pts.map(([lat, lng]) => [lng, lat]),
      },
      properties: {
        id: aoiId,
        name: `Measurement (${distanceFormatted})`,
        _drawn: true,
        kind: "measure",
      },
    };

    line
      .bindPopup(() => {
        const div = document.createElement("div");

        const label = document.createElement("div");
        label.innerHTML = `📏 ${
          isRTL ? "المسافة" : "Distance"
        }: <b>${distanceFormatted}</b>`;
        div.appendChild(label);

        div.appendChild(buildShapePopupActions(line, "measure", aoiId));
        return div;
      })
      .openPopup();

    // pending لحد Save — الإحداثيات بنحفظها {lat,lng} زي باقي الأشكال
    upsertShape(aoiId, lineFeature, {
      id: aoiId,
      name: `Measurement (${distanceFormatted})`,
      tool: "measure" as any,
      coords: pts.map(([lat, lng]) => ({ lat, lng })) as any,
      areaHa: 0,
      createdAt: new Date().toISOString(),
    });

    lastCoordsRef.current = pts.map(([lat, lng]) => ({
      lat,
      lng,
    }));
    lastToolRef.current = "measure";
  };

  useEffect(() => {
    if (typeof window === "undefined" || mapInstanceRef.current) return;

    import("leaflet").then(async (L) => {
      // ✅ حمّل الـ deleted ids + آخر view من IndexedDB قبل ما نبني الخريطة
      //    (restore بيعتمد على isDeleted بشكل synchronous)
      await loadDeletedIds();

      const DEFAULT_VIEW = { lat: 21.54, lng: 39.19, zoom: 11 };
      const validView = (p: any) =>
        Number.isFinite(p?.lat) &&
        Number.isFinite(p?.lng) &&
        Number.isFinite(p?.zoom);
      let initialView = DEFAULT_VIEW;
      try {
        const v = await kvGet<{ lat: number; lng: number; zoom: number }>(
          VIEW_KEY,
        );
        if (validView(v)) {
          initialView = v!;
        } else {
          // legacy localStorage (مرة واحدة)
          const rawView = localStorage.getItem(LEGACY_VIEW_KEY);
          if (rawView) {
            const parsed = JSON.parse(rawView);
            if (validView(parsed)) initialView = parsed;
            localStorage.removeItem(LEGACY_VIEW_KEY);
          }
        }
      } catch (_) {}

      if (!mapRef.current || mapInstanceRef.current) return;
      LRef.current = L;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [initialView.lat, initialView.lng],
        zoom: initialView.zoom,
        zoomControl: false,
        minZoom: 2,
        maxZoom: 22,
        worldCopyJump: false,
        maxBounds: [
          [-90, -180],
          [90, 180],
        ],
        maxBoundsViscosity: 1.0,
        doubleClickZoom: false, // ← وقف dblclick zoom
      });
      mapInstanceRef.current = map;
      mapObjRef.current = map;

      map.on("moveend zoomend", () => {
        try {
          const c = map.getCenter();
          kvSet(VIEW_KEY, {
            lat: c.lat,
            lng: c.lng,
            zoom: map.getZoom(),
          }).catch(() => {});
        } catch (_) {}
      });

      // ── Zoom guard ──
      lastStableZoomRef.current = map.getZoom();

      const attachTileErrorGuard = (layer: any) => {
        layer.on("tileerror", () => {
          tileErrorAtCurrentZoomRef.current = true;
        });
        layer.on("tileload", () => {});
      };

      map.on("zoomstart", () => {
        tileErrorAtCurrentZoomRef.current = false;
        if (zoomRevertTimeoutRef.current)
          clearTimeout(zoomRevertTimeoutRef.current);
      });

      map.on("zoomend", () => {
        if (zoomRevertTimeoutRef.current)
          clearTimeout(zoomRevertTimeoutRef.current);
        zoomRevertTimeoutRef.current = setTimeout(() => {
          const cz = map.getZoom();
          if (tileErrorAtCurrentZoomRef.current) {
            const target = Math.min(lastStableZoomRef.current, cz - 1);
            if (target >= map.getMinZoom() && target < cz) {
              map.setZoom(target);
              toast.error(
                isRTL
                  ? "وصلت لأقصى دقة متاحة في المكان ده"
                  : "Max available resolution reached for this area",
              );
            }
          } else {
            lastStableZoomRef.current = cz;
          }
        }, 450);
      });

      // ── Scale Bar ──
      L.control
        .scale({
          position: "bottomleft",
          metric: true,
          imperial: false,
          maxWidth: 150,
          updateWhenIdle: false,
        })
        .addTo(map);

      map.createPane("satellitePane");
      map.getPane("satellitePane")!.style.zIndex = "201";
      map.createPane("labelsPane");
      Object.assign(map.getPane("labelsPane")!.style, {
        zIndex: "203",
        pointerEvents: "none",
      });
      map.createPane("imagePane");
      Object.assign(map.getPane("imagePane")!.style, { zIndex: "350" });
      imagePaneReadyRef.current = true;

      // ── AOI registry (لازم يتعمل قبل الاسترجاع) ──
      aoiRegistryRef.current = new AOIRegistry({
        onListChange: (items, activeId) => onAOIListChange?.(items, activeId),
        onRemove: (e) => onAOIRemove?.(e.id),
        onEditingChange: (id) => {
          if (!id) teardownEditHandles();
        },
        onActivate: (e) => {
          if (!e) {
            currentShapeIdRef.current = null;
            lastCoordsRef.current = [];
            lastToolRef.current = "pointer";
            if (canvasRef.current) clearCanvas(canvasRef.current);
            return;
          }
          currentShapeIdRef.current = e.id;
          lastCoordsRef.current = e.coords;
          lastToolRef.current = e.tool;
          if (canvasRef.current) {
            clearCanvas(canvasRef.current);
            redrawCurrent(canvasRef.current, map, L);
          }
          onAreaSelected(e.name, e.areaHa, e.feature);
          onFeatureClick?.(e.feature);
        },
      });

      // ── 🆕 RESTORE AOI + ANALYSES AFTER REFRESH (بس لو Create Project) ───────
      if (!restoredRef.current) {
        restoredRef.current = true;
        if (persistDataRef.current) {
          getAllAOIs()
            .then(async (saved) => {
              if (!mapInstanceRef.current) return;
              restoreSavedAois(map, L, saved as any[]);
              // تحليل كل شكل بيترجع بس لو صاحبه (ownerId) اتسترجع — وإلا بيتمسح من الـ DB
              await restoreAnalysis();
            })
            .catch((e) => console.error("AOI restore failed", e));
        }
      }

      // ① Esri WorldImagery — مباشر بدون proxy
      baseTileRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles © Esri",
          maxZoom: 18,
          maxNativeZoom: 18,
          pane: "satellitePane",
          crossOrigin: "anonymous",
        },
      ).addTo(map);

      labelsLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "",
          maxZoom: 19,
          maxNativeZoom: 19,
          opacity: 0.7,
          pane: "labelsPane",
          crossOrigin: "anonymous",
        },
      );

      // ── Canvas Layer ──────────────────────────────────────────────────────
      const CanvasLayer = (L.Layer as any).extend({
        onAdd(this: any, lmap: any) {
          const canvas = document.createElement("canvas");
          Object.assign(canvas.style, {
            position: "absolute",
            top: "0",
            left: "0",
            pointerEvents: "none",
            zIndex: "400",
          });
          lmap.getPane("overlayPane")!.appendChild(canvas);
          this._canvas = canvas;
          canvasRef.current = canvas;
          lmap.on("moveend zoomend viewreset resize", this._update, this);
          this._update();
        },
        onRemove(this: any, lmap: any) {
          this._canvas?.remove();
          canvasRef.current = null;
          lmap.off("moveend zoomend viewreset resize", this._update, this);
        },
        _update(this: any) {
          const lmap = this._map,
            size = lmap.getSize();
          L.DomUtil.setPosition(
            this._canvas,
            lmap.containerPointToLayerPoint([0, 0]),
          );
          if (this._canvas.width !== size.x || this._canvas.height !== size.y) {
            this._canvas.width = size.x;
            this._canvas.height = size.y;
          }
          redrawCurrent(this._canvas, lmap, L);
        },
      });
      new CanvasLayer().addTo(map);

      // ── Extrusion Canvas ──────────────────────────────────────────────────
      const ExtrudeCanvasLayer = (L.Layer as any).extend({
        onAdd(this: any, lmap: any) {
          const canvas = document.createElement("canvas");
          Object.assign(canvas.style, {
            position: "absolute",
            top: "0",
            left: "0",
            pointerEvents: "none",
            zIndex: "345",
          });
          lmap.getPane("overlayPane")!.appendChild(canvas);
          this._canvas = canvas;
          extrudeCanvasRef.current = canvas;
          lmap.on("moveend zoomend viewreset resize", this._update, this);
          this._update();
        },
        onRemove(this: any, lmap: any) {
          this._canvas?.remove();
          extrudeCanvasRef.current = null;
          lmap.off("moveend zoomend viewreset resize", this._update, this);
        },
        _update(this: any) {
          const lmap = this._map,
            size = lmap.getSize();
          L.DomUtil.setPosition(
            this._canvas,
            lmap.containerPointToLayerPoint([0, 0]),
          );
          if (this._canvas.width !== size.x || this._canvas.height !== size.y) {
            this._canvas.width = size.x;
            this._canvas.height = size.y;
          }
          drawExtrusions();
        },
      });
      new ExtrudeCanvasLayer().addTo(map);

      // ── Close Shape button ────────────────────────────────────────────────
      const closeBtn = document.createElement("button");
      closeBtnRef.current = closeBtn;
      Object.assign(closeBtn.style, {
        display: "none",
        position: "absolute",
        bottom: "80px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "1000",
        background: "#0a1628cc",
        border: "1px solid rgba(0,200,255,0.5)",
        color: "#00c8ff",
        padding: "7px 20px",
        borderRadius: "20px",
        fontSize: "12px",
        cursor: "pointer",
        pointerEvents: "auto",
        backdropFilter: "blur(10px)",
        boxShadow: "0 4px 20px rgba(0,212,255,0.25)",
        fontFamily: "DM Sans, sans-serif",
        letterSpacing: "0.3px",
      });
      closeBtn.textContent = "✓ Close Shape";
      closeBtn.addEventListener(
        "mouseenter",
        () => (closeBtn.style.background = "#0a1628"),
      );
      closeBtn.addEventListener(
        "mouseleave",
        () => (closeBtn.style.background = "#0a1628cc"),
      );
      closeBtn.addEventListener("click", () => {
        const tool = activeToolRef.current;
        if (tool === "polygon") finishPolygon(map, L);
        if (tool === "measure") finishMeasure(map, L);
      });
      mapRef.current!.appendChild(closeBtn);

      // ── Image overlays manager UI ─────────────────────────────────────────
      const overlaysUi = document.createElement("div");
      overlaysUiRef.current = overlaysUi;
      overlaysUi.style.cssText = `
        display:none; position:absolute; top:64px; left:14px; z-index:1200;
        width:240px; max-height:220px; overflow:auto;
        background:rgba(10,22,40,0.92); backdrop-filter:blur(12px);
        border:1px solid rgba(255,255,255,0.10); border-radius:16px;
        padding:10px; box-shadow:0 18px 56px rgba(0,0,0,0.55);
        pointer-events:auto;
        font-family:DM Sans, sans-serif;
      `;
      mapRef.current!.appendChild(overlaysUi);
      restoreImageOverlays(); // async — بيرجع من IndexedDB

      // ── Sat / Index ───────────────────────────────────────────────────────
      onSatChange((satKey: SatKey) => {
        const def = SAT_LAYERS[satKey];
        if (baseTileRef.current) map.removeLayer(baseTileRef.current);
        if (!def?.url) return;
        currentSatKeyRef.current = satKey;
        baseTileRef.current = L.tileLayer(def.url, {
          attribution: def.attribution,
          maxZoom: def.maxZoom,
          maxNativeZoom: def.maxNativeZoom,
          tileSize: 256,
          pane: "satellitePane",
          crossOrigin: "anonymous",
        }).addTo(map);
        attachTileErrorGuard(baseTileRef.current);
        tileErrorAtCurrentZoomRef.current = false;
        lastStableZoomRef.current = map.getZoom();
        if (satKey === "Default") {
          applyResolutionCapRef.current?.();
        } else {
          map.setMaxZoom(def.maxZoom ?? 22);
        }
      });

      onOpacityChangeRegister?.((o: number) => {
        if (labelsLayerRef.current)
          labelsLayerRef.current.setOpacity(o * 0.8 + 0.1);
      });

      // ── Scale-bar zoom cap ──
      const TARGET_SCALE_LABEL_M = 30;
      const SCALE_BAR_MAX_WIDTH_PX = 150;
      const resolutionCapNotifiedRef = { current: false };

      const computeMaxZoomForResolution = (
        lat: number,
        targetScaleLabelM: number,
      ) => {
        const targetMpp = targetScaleLabelM / SCALE_BAR_MAX_WIDTH_PX;
        const raw = Math.log2(
          (156543.03392 * Math.cos((lat * Math.PI) / 180)) / targetMpp,
        );
        return Math.min(
          map.options.maxZoom ?? 22,
          Math.max(map.getMinZoom(), Math.round(raw)),
        );
      };

      const notifyResolutionCap = () => {
        if (resolutionCapNotifiedRef.current) return;
        resolutionCapNotifiedRef.current = true;
        toast.error("Reached max zoom for this area");
      };

      const applyResolutionCap = () => {
        if (currentSatKeyRef.current !== "Default") return;
        const lat = map.getCenter().lat;
        const capZoom = computeMaxZoomForResolution(lat, TARGET_SCALE_LABEL_M);
        map.setMaxZoom(capZoom);
        resolutionCapNotifiedRef.current = false;
      };
      applyResolutionCapRef.current = applyResolutionCap;

      applyResolutionCap();
      map.on("moveend", applyResolutionCap);
      map.on("zoomend", () => {
        if (map.getZoom() >= map.getMaxZoom()) notifyResolutionCap();
      });

      document.getElementById("map-zoom-in")?.addEventListener("click", () => {
        if (map.getZoom() >= map.getMaxZoom()) {
          notifyResolutionCap();
          return;
        }
        map.zoomIn();
      });
      document
        .getElementById("map-zoom-out")
        ?.addEventListener("click", () => map.zoomOut());

      flyToRef.current = (lat, lng) => {
        const safeLat = Number(lat);
        const safeLng = Number(lng);
        if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) return;

        map.flyTo([safeLat, safeLng], 13, { duration: 1.6 });
        setTimeout(() => {
          const searchMarker = L.circleMarker([safeLat, safeLng], {
            radius: 9,
            color: "#00d4ff",
            fillColor: "#00d4ff",
            fillOpacity: 0.7,
            weight: 2,
          })
            .addTo(map)
            .bindPopup(
              `<b>📍 Location</b><br/>${safeLat.toFixed(5)}°N, ${safeLng.toFixed(5)}°E`,
            )
            .openPopup();
          drawLayersRef.current.push(searchMarker);
        }, 1700);
      };

      const focusAoi = (id: string) => {
        const e = aoiRegistryRef.current?.get(id);
        if (!e) return;
        try {
          map.flyToBounds(e.layer.getBounds(), {
            padding: [60, 60],
            maxZoom: 16,
            duration: 0.8,
          });
        } catch (_) {}
      };
      if (aoiControlRef) {
        aoiControlRef.current = {
          activate: (id) => {
            aoiRegistryRef.current?.activate(id);
            focusAoi(id);
          },
          focus: focusAoi,
          remove: (id) => {
            const e = aoiRegistryRef.current?.get(id);
            if (e) deleteSingleShape(e.layer, id, e.kind);
          },
          startEdit: (id) => startEditAoi(id),
          stopEdit: () => {
            stopEditAoi();
          },
        };
      }

      // ── 💾 Save All: يحفظ كل الأشكال الـ pending ──
      if (saveAllRef) {
        saveAllRef.current = saveAllShapes;
      }

      // ── Delete All: يمسح كل حاجة من الـ UI + IndexedDB (الأشكال + كل التحليلات + الصور) ──
      clearRef.current = () => {
        // سجّل كل الـ ids عشان ما يتعادش رسمها من initialFeatures / الـ DB
        const allIds: string[] = [];
        drawLayersRef.current.forEach((l) => {
          if (l?._aoiId) allIds.push(String(l._aoiId));
        });
        savedIdsRef.current.forEach((id) => allIds.push(id));
        pendingShapesRef.current.forEach((_, id) => allIds.push(id));
        drawnFeaturesRef.current.forEach((f) => {
          if (f.properties?.id) allIds.push(String(f.properties.id));
        });
        markDeleted(allIds);
        teardownEditHandles();
        drawLayersRef.current.forEach((l) => {
          try {
            map.removeLayer(l);
          } catch (_) {}
        });
        aoiRegistryRef.current?.clear();
        drawLayersRef.current = [];
        draftLayersRef.current = [];
        initialFeaturesLayerRef.current = [];
        drawPointsRef.current = [];
        lastCoordsRef.current = [];
        lastToolRef.current = "pointer";
        currentShapeIdRef.current = null;
        if (tempLayerRef.current) {
          map.removeLayer(tempLayerRef.current);
          tempLayerRef.current = null;
        }
        if (canvasRef.current) clearCanvas(canvasRef.current);
        if (closeBtnRef.current) closeBtnRef.current.style.display = "none";
        try {
          map.closePopup();
        } catch (_) {}

        imageOverlaysRef.current.forEach((ov) => {
          try {
            map.removeLayer(ov.layer);
          } catch (_) {}
        });
        imageOverlaysRef.current = [];

        setDrawn([]);
        pendingShapesRef.current.clear();
        savedIdsRef.current.clear();

        // ✅ دايماً امسح الـ DB كله (حتى لو persist مقفول) + سجّل كل الـ ids الموجودة فيه
        getAllAOIs()
          .then((all: any[]) =>
            markDeleted((all ?? []).map((a) => String(a?.id)).filter(Boolean)),
          )
          .catch(() => {})
          .then(() => clearAllAOIs())
          .then(() => {
            toast.success(
              isRTL
                ? "تم مسح جميع الرسومات بنجاح"
                : "All shapes cleared successfully",
            );
          })
          .catch((err) => {
            console.error("Failed to clear IndexedDB:", err);
            toast.error(
              isRTL
                ? "حدث خطأ أثناء مسح قاعدة البيانات"
                : "Failed to clear database",
            );
          });

        // ✅ امسح كل التحليلات من الخريطة + IndexedDB + بلّغ الأب (ownerId = null → امسح الكل)
        clearAllAnalyses(true);
        imageOverlaysClear().catch(() => {});
        refreshOverlaysUi();
        stopImagePlacement();
      };

      // ✅ زرار "Delete Analysis" المستقل: بيمسح تحليل الشكل الحالي بس
      //    (خريطة + IndexedDB + بروجكت) — تحليل الأشكال التانية بيفضل
      if (clearAnalysisRef) {
        clearAnalysisRef.current = () => {
          const owner = currentShapeIdRef.current;
          if (owner) deleteAnalysisFor(owner, true);
        };
      }

      // ── Capture the shape that's ALREADY drawn ──
      if (captureCurrentRef) {
        captureCurrentRef.current = async () => {
          const coords = lastCoordsRef.current;
          const tool = lastToolRef.current;
          if (!coords.length || !canvasRef.current) return false;

          const metadata: CaptureMetadata = {
            areaName: "Current Selection",
            areaSizeHa: 0,
            zoom: map.getZoom(),
            capturedAt: new Date().toISOString(),
          };

          try {
            if (tool === "circle" && coords.length === 2) {
              const center = coords[0];
              const radiusMeters = map.distance(
                L.latLng(center.lat, center.lng),
                L.latLng(coords[1].lat, coords[1].lng),
              );
              const captureResult = await captureCircle(
                canvasRef.current,
                map,
                L,
                center,
                radiusMeters,
                metadata,
                captureTarget,
              );
              onCapture?.(captureResult);
            } else if (tool === "rectangle" && coords.length === 2) {
              const [p1, p2] = coords;
              const rectCoords: LatLngPoint[] = [
                { lat: p1.lat, lng: p1.lng },
                { lat: p2.lat, lng: p1.lng },
                { lat: p2.lat, lng: p2.lng },
                { lat: p1.lat, lng: p2.lng },
              ];
              await handleCapture(
                canvasRef.current,
                map,
                L,
                rectCoords,
                metadata,
              );
            } else {
              await handleCapture(canvasRef.current, map, L, coords, metadata);
            }
            return true;
          } catch (err) {
            console.error("❌ captureCurrentRef error:", err);
            return false;
          }
        };
      }

      // ── Click ─────────────────────────────────────────────────────────────
      map.on("click", async (e: any) => {
        const tool = activeToolRef.current;
        const { lat, lng } = e.latlng;
        requestAnimationFrame(() => onCoordsUpdate(lat, lng));

        // Virtual feature click (pointer tool) مع throttle
        if (tool === "pointer") {
          const MIN_DISTANCE_M = 15;
          const MIN_INTERVAL_MS = 250;
          const now = Date.now();
          const last = lastVirtualClickRef.current;
          const isTooClose =
            !!last &&
            now - last.time < MIN_INTERVAL_MS &&
            map.distance([lat, lng], [last.lat, last.lng]) < MIN_DISTANCE_M;

          if (!isTooClose) {
            lastVirtualClickRef.current = { lat, lng, time: now };
            onFeatureClick?.({
              type: "Feature",
              geometry: { type: "Point", coordinates: [lng, lat] },
              properties: { _virtual: true },
            });
          }
        }

        // ── Image placement mode (always takes precedence) ───────────────────
        if (placingImageRef.current) {
          const st = placingImageRef.current;
          if (!st.ready) {
            if (st.hintEl)
              st.hintEl.textContent = `Preparing image… please wait`;
            return;
          }
          st.clicks.push({ lat, lng });
          if (st.clicks.length === 1) {
            clearImagePlacementHint();
            const hint = document.createElement("div");
            hint.style.cssText = `
              position:absolute;top:14px;left:50%;transform:translateX(-50%);
              z-index:1200;pointer-events:none;
              background:rgba(10,22,40,0.92);backdrop-filter:blur(10px);
              border:1px solid rgba(167,139,250,0.25);color:#e2e8f0;
              padding:8px 12px;border-radius:999px;
              font-family:DM Sans, sans-serif;font-size:12px;
              box-shadow:0 10px 28px rgba(0,0,0,0.45);
            `;
            hint.textContent = `Now click BOTTOM-RIGHT corner`;
            mapRef.current?.appendChild(hint);
            st.hintEl = hint;
            return;
          }
          if (st.clicks.length >= 2) {
            const a = st.clicks[0];
            const b = st.clicks[1];
            const north = Math.max(a.lat, b.lat);
            const south = Math.min(a.lat, b.lat);
            const east = Math.max(a.lng, b.lng);
            const west = Math.min(a.lng, b.lng);
            const minDelta = 0.00015;
            const n2 = north === south ? north + minDelta : north;
            const s2 = north === south ? south - minDelta : south;
            const e2 = east === west ? east + minDelta : east;
            const w2 = east === west ? west - minDelta : west;
            try {
              const bounds = L.latLngBounds([s2, w2], [n2, e2]);
              const ov = L.imageOverlay(st.src, bounds, {
                opacity: 0.85,
                pane: "imagePane",
              }).addTo(map);
              imageOverlaysRef.current.push({
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: st.file.name,
                src: st.src,
                bounds: [
                  [s2, w2],
                  [n2, e2],
                ],
                layer: ov,
              });
              persistImageOverlays();
              refreshOverlaysUi();
              map.flyToBounds(bounds, {
                padding: [40, 40],
                maxZoom: 16,
                duration: 0.8,
              });
              clearImagePlacementHint();
              placingImageRef.current = null;
            } catch (err) {
              console.error("❌ imageOverlay failed:", err);
              stopImagePlacement();
            }
          }
          return;
        }

        if (tool === "pointer") return;

        // ── Marker ──────────────────────────────────────────────────────────
        if (tool === "marker") {
          const c = TOOL_COLORS.marker;
          const mk = L.circleMarker([lat, lng], {
            radius: 7,
            color: c.stroke,
            fillColor: c.stroke,
            fillOpacity: 0.85,
            weight: 2,
          }).addTo(map);
          const aoiId = newAoiId();
          (mk as any)._aoiId = aoiId;

          const markerFeature: GeoJSON.Feature = {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [lng, lat],
            },
            properties: {
              id: aoiId,
              name: "Marker",
              _drawn: true,
              kind: "marker",
            },
          };

          upsertShape(aoiId, markerFeature, {
            id: aoiId,
            name: "Marker",
            tool: "marker" as any,
            coords: [{ lat, lng }] as any,
            areaHa: 0,
            createdAt: new Date().toISOString(),
          });
          // الـ marker هو الشكل الحالي (البانلز بتحلله) → أي تحليل بعد كده تابع له
          currentShapeIdRef.current = aoiId;

          mk.bindPopup(() => {
            const div = document.createElement("div");
            div.innerHTML = `📍 ${lat.toFixed(6)}°N<br/>${lng.toFixed(6)}°E`;
            div.appendChild(buildShapePopupActions(mk, "marker", aoiId));
            return div;
          }).openPopup();
          drawLayersRef.current.push(mk);
          if (canvasRef.current) {
            const px = map.latLngToContainerPoint(L.latLng(lat, lng));
            drawMarker(canvasRef.current, px);
            lastCoordsRef.current = [...lastCoordsRef.current, { lat, lng }];
            lastToolRef.current = "marker";
            const metadata: CaptureMetadata = {
              areaName: "Marker",
              areaSizeHa: 0,
              zoom: map.getZoom(),
              capturedAt: new Date().toISOString(),
            };
            await handleCapture(
              canvasRef.current,
              map,
              L,
              [{ lat, lng }],
              metadata,
            );
          }
          return;
        }

        // ── Polygon ──────────────────────────────────────────────────────────
        if (tool === "polygon") {
          const pts = drawPointsRef.current;
          const c = TOOL_COLORS.polygon;

          if (pts.length === 0) {
            toast(
              isRTL
                ? "اضغط Esc لإلغاء الرسم الحالي"
                : "Press Esc to cancel the current drawing",
              {
                icon: "⌨️",
                duration: 5000,
              },
            );
          }

          if (pts.length >= 3) {
            const firstPx = map.latLngToContainerPoint(
              L.latLng(pts[0][0], pts[0][1]),
            );
            const clickPx = map.latLngToContainerPoint(L.latLng(lat, lng));
            const dist = Math.sqrt(
              (clickPx.x - firstPx.x) ** 2 + (clickPx.y - firstPx.y) ** 2,
            );
            if (dist < 15) {
              finishPolygon(map, L);
              return;
            }
          }
          pts.push([lat, lng]);
          const marker = L.circleMarker([lat, lng], {
            radius: pts.length === 1 ? 6 : 4,
            color: c.stroke,
            fillColor: pts.length === 1 ? c.stroke : "#fff",
            fillOpacity: 1,
            weight: 2,
          }).addTo(map);
          drawLayersRef.current.push(marker);
          draftLayersRef.current.push(marker);
          if (pts.length >= 3 && closeBtnRef.current)
            closeBtnRef.current.style.display = "block";
          return;
        }

        // ── Measure ──────────────────────────────────────────────────────────
        if (tool === "measure") {
          const pts = drawPointsRef.current;
          if (pts.length === 0) {
            toast(
              isRTL
                ? "اضغط Esc لإلغاء القياس الحالي"
                : "Press Esc to cancel the current measurement",
              {
                icon: "📏",
                duration: 5000,
              },
            );
          }
          pts.push([lat, lng]);
          const marker = L.circleMarker([lat, lng], {
            radius: 4,
            color: TOOL_COLORS.measure.stroke,
            fillColor: "#fff",
            fillOpacity: 1,
            weight: 2,
          }).addTo(map);
          drawLayersRef.current.push(marker);
          draftLayersRef.current.push(marker);
          if (pts.length >= 2 && closeBtnRef.current)
            closeBtnRef.current.style.display = "block";
          return;
        }

        // ── Rectangle ────────────────────────────────────────────────────────
        if (tool === "rectangle") {
          const c = TOOL_COLORS.rectangle;
          if (!drawPointsRef.current.length) {
            toast(
              isRTL
                ? "اضغط Esc لإلغاء الرسم الحالي"
                : "Press Esc to cancel the current drawing",
              {
                icon: "⌨️",
                duration: 5000,
              },
            );
            drawPointsRef.current.push([lat, lng]);
            const marker = L.circleMarker([lat, lng], {
              radius: 4,
              color: c.stroke,
              fillColor: "#fff",
              fillOpacity: 1,
              weight: 2,
            }).addTo(map);
            drawLayersRef.current.push(marker);
            draftLayersRef.current.push(marker);
          } else {
            const p1 = drawPointsRef.current[0];
            // الشكل خلص → شيل النقطة المؤقتة وصفّر الحالة فوراً
            clearDraftMarkers();
            drawPointsRef.current = [];
            if (tempLayerRef.current) {
              map.removeLayer(tempLayerRef.current);
              tempLayerRef.current = null;
            }

            const rect = L.rectangle([p1, [lat, lng]], {
              color: c.stroke,
              weight: 2,
              fillColor: c.fill,
              fillOpacity: 0,
            }).addTo(map);

            const rectCoords = [
              [p1[1], p1[0]],
              [lng, p1[0]],
              [lng, lat],
              [p1[1], lat],
              [p1[1], p1[0]],
            ];

            const polygon = turfPolygon([rectCoords]);
            const area = parseFloat((turfArea(polygon) / 10000).toFixed(1));

            const aoiiId = newAoiId();
            (rect as any)._aoiId = aoiiId;

            const rectPoints = [
              { lat: p1[0], lng: p1[1] },
              { lat: p1[0], lng },
              { lat, lng },
              { lat, lng: p1[1] },
            ];

            rect
              .bindPopup(() => {
                const div = document.createElement("div");
                const label = document.createElement("div");
                label.innerHTML = `📐 ${t.rectangle} · ≈ ${area} ${t.ha}`;
                div.appendChild(label);
                div.appendChild(
                  buildShapePopupActions(rect, "rectangle", aoiiId),
                );
                return div;
              })
              .openPopup();

            drawLayersRef.current.push(rect);
            const coordinates: LatLngPoint[] = [
              { lat: p1[0], lng: p1[1] },
              { lat, lng: p1[1] },
              { lat, lng },
              { lat: p1[0], lng },
            ];
            const reg = aoiRegistryRef.current;
            const aoiName =
              reg?.nextName("Drawn Rectangle") ?? "Drawn Rectangle";
            const feature = makePolygonFeature(
              aoiName,
              coordinates.map((point) => [point.lat, point.lng]),
              area,
              { id: aoiiId, kind: "rectangle" },
            );

            upsertShape(aoiiId, feature, {
              id: aoiiId,
              name: aoiName,
              tool: "rectangle",
              coords: rectPoints as any,
              areaHa: area,
              createdAt: new Date().toISOString(),
            });
            reg?.add({
              id: aoiiId,
              name: aoiName,
              kind: "rectangle",
              tool: "rectangle",
              layer: rect,
              feature,
              areaHa: area,
              coords: [
                { lat: p1[0], lng: p1[1] },
                { lat, lng },
              ],
              stroke: c.stroke,
            });
            currentShapeIdRef.current = aoiiId;
            onAreaSelected(aoiName, area, feature);
            onFeatureClick?.(feature);
            if (canvasRef.current) {
              const px1 = map.latLngToContainerPoint(L.latLng(p1[0], p1[1]));
              const px2 = map.latLngToContainerPoint(L.latLng(lat, lng));
              drawRect(canvasRef.current, px1, px2);
              lastCoordsRef.current = [
                { lat: p1[0], lng: p1[1] },
                { lat, lng },
              ];
              lastToolRef.current = "rectangle";
              const metadata: CaptureMetadata = {
                areaName: aoiName,
                areaSizeHa: area,
                zoom: map.getZoom(),
                capturedAt: new Date().toISOString(),
              };
              await handleCapture(
                canvasRef.current,
                map,
                L,
                coordinates,
                metadata,
              );
            }
          }
          return;
        }

        // ── Circle ───────────────────────────────────────────────────────────
        if (tool === "circle") {
          const c = TOOL_COLORS.circle;
          if (!drawPointsRef.current.length) {
            toast(
              isRTL
                ? "اضغط Esc لإلغاء الرسم الحالي"
                : "Press Esc to cancel the current drawing",
              {
                icon: "⌨️",
                duration: 5000,
              },
            );
            drawPointsRef.current.push([lat, lng]);
          } else {
            const center = drawPointsRef.current[0];
            // الشكل خلص → صفّر الحالة فوراً (قبل أي await)
            drawPointsRef.current = [];
            if (tempLayerRef.current) {
              map.removeLayer(tempLayerRef.current);
              tempLayerRef.current = null;
            }

            const radius = map.distance(center, [lat, lng]);
            const circ = L.circle(center, {
              radius,
              color: c.stroke,
              weight: 2,
              fillColor: c.fill,
              fillOpacity: 0,
            }).addTo(map);

            const area = parseFloat(
              (Math.PI * Math.pow(radius / 1000, 2) * 100).toFixed(1),
            );

            const aoiId = newAoiId();
            (circ as any)._aoiId = aoiId;

            circ
              .bindPopup(() => {
                const div = document.createElement("div");
                const label = document.createElement("div");
                label.innerHTML = `🟢 ${t.circle} · R: ${radius.toFixed(0)} m · ≈ ${area} ${t.ha}`;
                div.appendChild(label);
                div.appendChild(buildShapePopupActions(circ, "circle", aoiId));
                return div;
              })
              .openPopup();

            drawLayersRef.current.push(circ);

            const circleRing = circleToPolygonLatLng(
              center[0],
              center[1],
              radius,
              64,
            );
            const reg = aoiRegistryRef.current;
            const aoiName = reg?.nextName("Drawn Circle") ?? "Drawn Circle";
            const feature = makePolygonFeature(aoiName, circleRing, area, {
              id: aoiId,
              kind: "circle",
            });

            upsertShape(aoiId, feature, {
              id: aoiId,
              name: aoiName,
              tool: "circle",
              coords: [
                { lat: center[0], lng: center[1] },
                { lat, lng },
              ] as any,
              areaHa: area,
              createdAt: new Date().toISOString(),
            });

            reg?.add({
              id: aoiId,
              name: aoiName,
              kind: "circle",
              tool: "circle",
              layer: circ,
              feature,
              areaHa: area,
              coords: [
                { lat: center[0], lng: center[1] },
                { lat, lng },
              ],
              stroke: c.stroke,
            });
            currentShapeIdRef.current = aoiId;

            onAreaSelected(aoiName, area, feature);
            onFeatureClick?.(feature);

            if (canvasRef.current) {
              const cPx = map.latLngToContainerPoint(
                L.latLng(center[0], center[1]),
              );
              const ePx = map.latLngToContainerPoint(L.latLng(lat, lng));
              const rPx = Math.sqrt(
                (ePx.x - cPx.x) ** 2 + (ePx.y - cPx.y) ** 2,
              );
              drawCircle(canvasRef.current, cPx, rPx);
              const centerCoord: LatLngPoint = {
                lat: center[0],
                lng: center[1],
              };
              lastCoordsRef.current = [centerCoord, { lat, lng }];
              lastToolRef.current = "circle";
              const metadata: CaptureMetadata = {
                areaName: aoiName,
                areaSizeHa: area,
                zoom: map.getZoom(),
                capturedAt: new Date().toISOString(),
              };
              const captureResult = await captureCircle(
                canvasRef.current,
                map,
                L,
                centerCoord,
                radius,
                metadata,
                captureTarget,
              );
              const {
                smallBlob,
                largeBlob,
                selectedCoordinates,
                viewportCoordinates,
                selectedBounds,
                viewportBounds,
              } = captureResult;
              onCapture?.(captureResult);

              const res = await sendToBackend(
                smallBlob,
                captureTarget === "large" ? largeBlob : undefined,
                selectedCoordinates,
                metadata,
                { viewportCoordinates, selectedBounds, viewportBounds },
                captureTarget,
              );
              if (res.ok) console.log("✅ Backend:", await res.json());
            }
          }
          return;
        }
      });

      // ── Mousemove (throttled via rAF) ────────────────────────────────────
      map.on("mousemove", (e: any) => {
        lastMoveRef.current = e;
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const ev = lastMoveRef.current;
          if (!ev) return;
          const tool = activeToolRef.current,
            pts = drawPointsRef.current;
          if (tool === "pointer" || !pts.length) return;
          if (tempLayerRef.current) map.removeLayer(tempLayerRef.current);
          const cur: [number, number] = [ev.latlng.lat, ev.latlng.lng];
          const cp = TOOL_COLORS;
          if (tool === "polygon" || tool === "measure")
            tempLayerRef.current = L.polyline([...pts, cur], {
              color: cp[tool].stroke,
              weight: 1.5,
              dashArray: "4 4",
              opacity: 0.7,
            }).addTo(map);
          if (tool === "rectangle")
            tempLayerRef.current = L.rectangle([pts[0], cur], {
              color: cp.rectangle.stroke,
              weight: 1.5,
              dashArray: "4 4",
              fillColor: cp.rectangle.fill,
              fillOpacity: 0,
            }).addTo(map);
          if (tool === "circle") {
            const r = map.distance(pts[0], cur);
            tempLayerRef.current = L.circle(pts[0], {
              radius: r,
              color: cp.circle.stroke,
              weight: 1.5,
              dashArray: "4 4",
              fillColor: cp.circle.fill,
              fillOpacity: 0,
            }).addTo(map);
          }
        });
      });

      // ✅ الخريطة جهزت — الـ effects اللي معتمدة على mapReady تشتغل
      setMapReady(true);
    });

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (overlaysUiRef.current) {
        overlaysUiRef.current.remove();
        overlaysUiRef.current = null;
      }
      // ✅ نضّف overlays كل التحليلات (من الذاكرة بس — الـ DB ما بيتلمسش)
      analysesRef.current.forEach((a) => {
        try {
          a.cleanup();
        } catch (_) {}
      });
      analysesRef.current.clear();
      if (swipeOverlayRef.current) {
        swipeOverlayRef.current.cleanup();
        swipeOverlayRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      // ✅ لو الكومبوننت اتعمله unmount/remount (React StrictMode) نرجّع الاسترجاع من الأول
      restoredRef.current = false;
      drawLayersRef.current = [];
      draftLayersRef.current = [];
      initialFeaturesLayerRef.current = [];
    };
  }, []);

  useEffect(() => {
    const c = mapInstanceRef.current?.getContainer();
    if (c) c.style.cursor = activeTool === "pointer" ? "grab" : "crosshair";
    if (
      closeBtnRef.current &&
      activeTool !== "polygon" &&
      activeTool !== "measure"
    ) {
      closeBtnRef.current.style.display = "none";
    }
  }, [activeTool]);

  return (
    <>
      <style>{`
.leaflet-control-scale-line{background:rgba(4,13,26,.85)!important;border:1px solid rgba(0,200,255,.4)!important;border-top:2px solid rgba(0,200,255,.8)!important;color:#e2e8f0!important;font-size:10px!important;font-weight:600!important;letter-spacing:.05em!important;padding:2px 6px!important;border-radius:0 0 4px 4px!important;backdrop-filter:blur(4px)!important;box-shadow:0 2px 8px rgba(0,0,0,.5)!important;white-space:nowrap!important}
.leaflet-control-scale{margin-bottom:8px!important;margin-left:12px!important}
        .leaflet-container{background:#040d1a!important}
        /* Global CSS (e.g. canvas{max-width:100%}) resolves against Leaflet's 0px-wide pane → canvas width 0 → vector lines invisible */
        .leaflet-container .leaflet-pane canvas,.leaflet-container canvas.leaflet-zoom-animated,.leaflet-container canvas.leaflet-zoom-hide{max-width:none!important;max-height:none!important}
        .leaflet-container::before{content:'';position:absolute;inset:0;background-image:radial-gradient(1px 1px at 10% 20%,rgba(255,255,255,.6) 0%,transparent 100%),radial-gradient(1px 1px at 30% 60%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 50% 10%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 70% 80%,rgba(255,255,255,.3) 0%,transparent 100%),radial-gradient(1px 1px at 85% 35%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 20% 85%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 60% 45%,rgba(255,255,255,.3) 0%,transparent 100%),radial-gradient(1px 1px at 90% 65%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 40% 30%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 75% 15%,rgba(255,255,255,.6) 0%,transparent 100%);pointer-events:none;z-index:-1}
        .ndvi-tooltip{background:#0a1628!important;border:1px solid rgba(0,212,255,.3)!important;color:#e2e8f0!important;font-size:.72rem!important;border-radius:6px!important}
        .ndvi-tooltip::before{border-top-color:rgba(0,212,255,.3)!important}
        .leaflet-popup-content-wrapper{background:#0a1628!important;border:1px solid rgba(255,255,255,.1)!important;color:#e2e8f0!important;border-radius:10px!important;box-shadow:0 8px 32px rgba(0,0,0,.6)!important;font-size:.82rem!important}
        .leaflet-popup-tip{background:#0a1628!important}
        .leaflet-popup-close-button{color:#64748b!important}
        .leaflet-control-attribution{background:rgba(4,13,26,.8)!important;color:#475569!important;font-size:.55rem!important}
        .aoi-vertex-handle{cursor:grab!important}
        .scene-preview-raster-overlay{image-rendering:auto}
        .change-detection-raster-overlay{image-rendering:pixelated;image-rendering:crisp-edges;image-rendering:-moz-crisp-edges}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .animate-fadeUp{animation:fadeUp .25s ease both}
      `}</style>
      <div
        ref={mapRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 0 }}
      />
    </>
  );
}