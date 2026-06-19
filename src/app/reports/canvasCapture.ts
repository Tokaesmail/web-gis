import html2canvas from 'html2canvas';

const INLINE_PROPS = [
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'font-size',
  'font-weight',
  'font-family',
  'font-style',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border-width',
  'border-style',
  'border-radius',
  'display',
  'flex-direction',
  'align-items',
  'justify-content',
  'gap',
  'width',
  'height',
  'min-width',
  'min-height',
  'opacity',
  'text-align',
  'line-height',
  'box-shadow',
  'background-image',
  'background-size',
  'background-position',
  'overflow',
  'position',
  'grid-template-columns',
] as const;

const UNSUPPORTED_COLOR_RE = /\b(lab|oklch|lch|color-mix)\(/i;

function sanitizeDocumentForCanvas(
  clonedDoc: Document,
  originalRoot: HTMLElement,
  clonedRoot: HTMLElement,
): void {
  clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove());

  const sources = [originalRoot, ...Array.from(originalRoot.querySelectorAll('*'))];
  const clones = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll('*'))];
  const len = Math.min(sources.length, clones.length);

  for (let i = 0; i < len; i++) {
    const src = sources[i] as HTMLElement;
    const clone = clones[i] as HTMLElement;
    if (!src?.style || !clone?.style) continue;

    clone.removeAttribute('class');

    const computed = window.getComputedStyle(src);
    for (const prop of INLINE_PROPS) {
      try {
        const val = computed.getPropertyValue(prop);
        if (!val || val === 'none' || val === 'normal' || val === 'auto') continue;
        if (UNSUPPORTED_COLOR_RE.test(val)) continue;
        clone.style.setProperty(prop, val);
      } catch {
        /* ignore */
      }
    }

    if (src instanceof SVGElement && clone instanceof SVGElement) {
      const fill = computed.fill;
      const stroke = computed.stroke;
      if (fill && !UNSUPPORTED_COLOR_RE.test(fill)) clone.setAttribute('fill', fill);
      if (stroke && !UNSUPPORTED_COLOR_RE.test(stroke)) clone.setAttribute('stroke', stroke);
    }
  }
}

export interface SafeCaptureOptions {
  scale?: number;
  backgroundColor?: string;
  timeoutMs?: number;
  maxWidth?: number;
  ignoreControls?: boolean;
}

export async function safeHtml2Canvas(
  element: HTMLElement,
  options: SafeCaptureOptions = {},
): Promise<HTMLCanvasElement> {
  const {
    scale = 1,
    backgroundColor = '#070f1e',
    timeoutMs = 20000,
    maxWidth = 720,
    ignoreControls = true,
  } = options;

  const capture = html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor,
    scrollX: 0,
    scrollY: 0,
    ignoreElements: (el) => {
      if (!ignoreControls) return false;
      const cls = el.className;
      if (typeof cls === 'string') {
        if (cls.includes('leaflet-control')) return true;
        if (cls.includes('mapboxgl-control')) return true;
        if (cls.includes('maplibregl-control')) return true;
      }
      return false;
    },
    onclone: (clonedDoc, clonedEl) => {
      sanitizeDocumentForCanvas(clonedDoc, element, clonedEl as HTMLElement);
    },
  });

  const canvas = await Promise.race<HTMLCanvasElement>([
    capture,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Capture timeout')), timeoutMs);
    }),
  ]);

  if (maxWidth > 0 && canvas.width > maxWidth * scale) {
    const ratio = (maxWidth * scale) / canvas.width;
    const resized = document.createElement('canvas');
    resized.width = Math.round(canvas.width * ratio);
    resized.height = Math.round(canvas.height * ratio);
    const ctx = resized.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0, resized.width, resized.height);
      return resized;
    }
  }

  return canvas;
}

export async function captureElementAsDataUrl(
  el: HTMLElement,
  options: SafeCaptureOptions = {},
  quality = 0.85,
): Promise<string> {
  const canvas = await safeHtml2Canvas(el, options);
  return canvas.toDataURL('image/jpeg', quality);
}
