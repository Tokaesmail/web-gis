import { captureElementAsDataUrl, safeHtml2Canvas } from './canvasCapture';
import { buildPanelPdf } from './buildPanelPdf';
import type { ReportConfig } from './types';

export type PanelReportType = 'ndvi' | 'overview' | 'weather' | 'crops' | 'general';

export interface PanelValue {
  label: string;
  value: string;
}

export interface PanelExportOptions {
  panelElement: HTMLElement;
  reportType: PanelReportType;
  title: string;
  subtitle?: string;
  locale: 'ar' | 'en';
  organization?: string;
  fieldMeta?: PanelValue[];
  structuredRows?: PanelValue[];
  filename?: string;
  captureMap?: boolean;
}

const REPORT_TITLES: Record<PanelReportType, { en: string; ar: string }> = {
  ndvi: { en: 'NDVI Vegetation Analysis', ar: 'تحليل الغطاء النباتي NDVI' },
  overview: { en: 'Area Overview Report', ar: 'تقرير نظرة عامة على المنطقة' },
  weather: { en: 'Weather Analysis Report', ar: 'تقرير تحليل الطقس' },
  crops: { en: 'Crop Health Report', ar: 'تقرير صحة المحصول' },
  general: { en: 'GIS Analysis Report', ar: 'تقرير التحليل الجغرافي' },
};

export function extractVisibleValues(root: HTMLElement): PanelValue[] {
  const results: PanelValue[] = [];
  const seen = new Set<string>();

  const add = (label: string, value: string) => {
    const key = `${label}::${value}`;
    if (!label || !value || seen.has(key)) return;
    seen.add(key);
    results.push({ label, value });
  };

  root.querySelectorAll('[class*="rounded-lg"], [class*="rounded-xl"]').forEach((el) => {
    const directPs = Array.from(el.querySelectorAll(':scope > p, :scope > div > p'))
      .map((p) => p.textContent?.trim())
      .filter(Boolean) as string[];

    if (directPs.length >= 2) {
      const isKpi = directPs.some((t) => t.length < 30 && /^[\d.\-%°]+/.test(t));
      if (isKpi && directPs.length === 2) {
        const [first, second] = directPs;
        if (/^[\d.\-%°]/.test(first)) add(second, first);
        else add(first, second);
      }
    }

    el.querySelectorAll(':scope > div[class*="grid"] > div, :scope > div[class*="flex"] > div').forEach((card) => {
      const ps = Array.from(card.querySelectorAll('p'))
        .map((p) => p.textContent?.trim())
        .filter(Boolean) as string[];
      if (ps.length >= 2) {
        const value = ps[0];
        const label = ps[ps.length - 1];
        if (label.length < 40) add(label, value);
      }
    });
  });

  root.querySelectorAll('table tr').forEach((row) => {
    const cells = Array.from(row.querySelectorAll('th, td'))
      .map((c) => c.textContent?.trim())
      .filter(Boolean) as string[];
    if (cells.length >= 2) add(cells[0], cells.slice(1).join(' · '));
  });

  return results;
}

export function findMapElement(): HTMLElement | null {
  const leaflet = document.querySelector('.leaflet-container') as HTMLElement | null;
  if (leaflet) return leaflet;
  const mapbox = document.querySelector('.mapboxgl-map') as HTMLElement | null;
  if (mapbox) return mapbox;
  return document.querySelector('.maplibregl-map') as HTMLElement | null;
}

function buildConfig(opts: PanelExportOptions): ReportConfig {
  const isAr = opts.locale === 'ar';
  const typeTitle = REPORT_TITLES[opts.reportType][isAr ? 'ar' : 'en'];
  return {
    title: opts.title || typeTitle,
    subtitle: opts.subtitle ?? (isAr ? 'تقرير تحليل ميداني' : 'Field Analysis Report'),
    organization: opts.organization ?? 'GeoSense AI',
    locale: opts.locale,
    generatedAt: new Date().toISOString(),
    author: 'GeoSense AI Platform',
    includeSections: {
      cover: false,
      overview: false,
      ndvi: false,
      crop: false,
      weather: false,
      satellite: false,
      templateMatch: false,
      charts: false,
      recommendations: false,
    },
  };
}

export async function exportPanelReport(opts: PanelExportOptions): Promise<Blob> {
  const {
    panelElement,
    locale,
    fieldMeta = [],
    structuredRows = [],
    filename,
    captureMap = true,
  } = opts;

  const extracted = extractVisibleValues(panelElement);
  const allValues = [...fieldMeta, ...structuredRows, ...extracted];

  const deduped: PanelValue[] = [];
  const seen = new Set<string>();
  for (const row of allValues) {
    const key = `${row.label}::${row.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }

  let panelScreenshot: string | undefined;
  let mapScreenshot: string | undefined;

  try {
    panelScreenshot = await captureElementAsDataUrl(panelElement, {
      scale: 1,
      maxWidth: 640,
      backgroundColor: '#070f1e',
      timeoutMs: 15000,
    });
  } catch (err) {
    console.warn('[export] Panel screenshot failed:', err);
  }

  if (captureMap) {
    try {
      const mapEl = findMapElement();
      if (mapEl) {
        mapScreenshot = await captureElementAsDataUrl(mapEl, {
          scale: 0.75,
          maxWidth: 800,
          backgroundColor: '#040d1a',
          timeoutMs: 12000,
          ignoreControls: true,
        });
      }
    } catch (err) {
      console.warn('[export] Map screenshot failed:', err);
    }
  }

  if (!panelScreenshot && !mapScreenshot && deduped.length === 0) {
    throw new Error(locale === 'ar' ? 'فشل التقاط البيانات للتصدير' : 'Failed to capture data for export');
  }

  const config = buildConfig(opts);
  const isAr = locale === 'ar';
  const typeTitle = REPORT_TITLES[opts.reportType][isAr ? 'ar' : 'en'];
  const safeName =
    filename ?? `GeoSense_${opts.reportType}_${new Date().toISOString().slice(0, 10)}.pdf`;

  return buildPanelPdf({
    title: opts.title || typeTitle,
    subtitle: opts.subtitle ?? config.subtitle,
    organization: config.organization,
    locale,
    panelScreenshot,
    mapScreenshot,
    values: deduped,
    filename: safeName,
  });
}

export { safeHtml2Canvas, captureElementAsDataUrl };
