import jsPDF from 'jspdf';
import type { ReportConfig } from './types';
import { safeHtml2Canvas } from './canvasCapture';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_SELECTOR = '[data-report-page]';

export interface ExportPDFOptions {
  filename?: string;
  quality?: number;
  scale?: number;
}

export async function captureMapScreenshot(
  mapElement: HTMLElement,
  scale = 1,
): Promise<string> {
  const canvas = await safeHtml2Canvas(mapElement, {
    scale,
    backgroundColor: '#e8ede9',
    maxWidth: 900,
    timeoutMs: 15000,
  });
  return canvas.toDataURL('image/png', 0.92);
}

export async function exportReportToPDF(
  container: HTMLElement,
  config: ReportConfig,
  options: ExportPDFOptions = {},
): Promise<Blob> {
  const {
    filename = `GIS_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
    quality = 0.92,
  } = options;

  const pages = container.querySelectorAll<HTMLElement>(PAGE_SELECTOR);
  if (pages.length === 0) {
    throw new Error('No report pages found for export');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    const canvas = await safeHtml2Canvas(page, {
      scale: 1.5,
      backgroundColor: '#ffffff',
      maxWidth: 794,
      timeoutMs: 20000,
    });

    const imgData = canvas.toDataURL('image/jpeg', quality);
    const imgWidth = A4_WIDTH_MM;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (i > 0) pdf.addPage();

    if (imgHeight <= A4_HEIGHT_MM) {
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
    } else {
      let position = 0;
      const pageHeightPx = (A4_HEIGHT_MM * canvas.width) / A4_WIDTH_MM;
      while (position < canvas.height) {
        if (position > 0) pdf.addPage();
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(pageHeightPx, canvas.height - position);
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.drawImage(
          canvas,
          0, position, canvas.width, sliceCanvas.height,
          0, 0, canvas.width, sliceCanvas.height,
        );
        const sliceData = sliceCanvas.toDataURL('image/jpeg', quality);
        const sliceHeight = (sliceCanvas.height * imgWidth) / canvas.width;
        pdf.addImage(sliceData, 'JPEG', 0, 0, imgWidth, sliceHeight);
        position += pageHeightPx;
      }
    }

    pdf.setFontSize(8);
    pdf.setTextColor(150);
    const footerText = `${config.organization} — ${config.title}`;
    pdf.text(footerText, A4_WIDTH_MM / 2, A4_HEIGHT_MM - 5, { align: 'center' });
  }

  pdf.setProperties({
    title: config.title,
    subject: config.subtitle ?? 'GIS Agricultural Report',
    author: config.author ?? config.organization,
    creator: 'AgriGIS Report Engine',
  });

  const blob = pdf.output('blob');

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);

  return blob;
}

export async function exportSinglePageToPDF(
  pageElement: HTMLElement,
  filename: string,
): Promise<Blob> {
  const canvas = await safeHtml2Canvas(pageElement, {
    scale: 1.5,
    backgroundColor: '#ffffff',
    maxWidth: 794,
    timeoutMs: 20000,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const imgWidth = A4_WIDTH_MM;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgWidth, imgHeight);

  const blob = pdf.output('blob');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);

  return blob;
}
