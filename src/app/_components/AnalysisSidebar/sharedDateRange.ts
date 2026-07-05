// sharedDateRange.ts
// ─────────────────────────────────────────────────────────────────────────────
// نفس فكرة sharedSceneSelection.ts بالظبط: state بره الكومبوننتات + useSyncExternalStore.
// المشكلة اللي بيحلها: SatelliteDataPanel و PlanetaryRasterPanel كانوا بيحتفظوا
// بـ dateFrom/dateTo كـ local useState بقيمة افتراضية ثابتة. أي مرة الباند يتقفل
// ويترندر تاني (زي لما تتنقلي بين البانلز أو تفتحي تحليل تاني)، الـ state المحلي
// بيتصفر ويرجع للديفولت — فالتاريخ اللي اخترتيه بيضيع رغم إنك متغيرهوش بنفسك.
//
// دلوقتي التاريخ بيتخزن هنا مرة واحدة، وأي باند (Satellite Data / Raster Calculator)
// بيقرا منه ويكتب فيه. لو محدّش اختار تاريخ لسه، بيرجع للديفولت المذكور تحت.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from "react";

export type SharedDateRange = {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
};

const DEFAULT_RANGE: SharedDateRange = {
  dateFrom: "2026-04-01",
  dateTo: "2026-04-28",
};

let currentRange: SharedDateRange = { ...DEFAULT_RANGE };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDateRange(): SharedDateRange {
  return currentRange;
}

/** بيحدّث dateFrom لوحده، من غير ما يلمس dateTo. */
export function setDateFrom(value: string) {
  currentRange = { ...currentRange, dateFrom: value };
  emit();
}

/** بيحدّث dateTo لوحده، من غير ما يلمس dateFrom. */
export function setDateTo(value: string) {
  currentRange = { ...currentRange, dateTo: value };
  emit();
}

export function setDateRange(range: SharedDateRange) {
  currentRange = { ...range };
  emit();
}

/**
 * استخدميها جوه أي باند بدل useState:
 *   const { dateFrom, dateTo, setDateFrom, setDateTo } = useSharedDateRange();
 * التاريخ بيفضل موجود حتى لو الباند اتقفل وترندر تاني.
 */
export function useSharedDateRange() {
  const range = useSyncExternalStore(subscribe, getDateRange, getDateRange);
  return {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    setDateFrom,
    setDateTo,
    setDateRange,
  };
}
