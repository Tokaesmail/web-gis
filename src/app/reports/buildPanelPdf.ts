import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PanelValue } from './panelExport';

const PRIMARY = [26, 95, 74] as const;
const MARGIN = 14;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;

export interface BuildPanelPdfOptions {
  title: string;
  subtitle?: string;
  organization: string;
  locale: 'ar' | 'en';
  panelScreenshot?: string;
  mapScreenshot?: string;
  values: PanelValue[];
  filename: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function buildPanelPdf(opts: BuildPanelPdfOptions): Blob {
  const { title, subtitle, organization, locale, values, filename } = opts;
  const isAr = locale === 'ar';

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let y = 0;

  pdf.setFillColor(...PRIMARY);
  pdf.rect(0, 0, PAGE_W, 26, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(14);
  pdf.text(organization, MARGIN, 11);
  pdf.setFontSize(9);
  pdf.text(
    new Date().toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    PAGE_W - MARGIN,
    11,
    { align: 'right' },
  );
  pdf.text('GeoSense AI Platform', MARGIN, 19);

  y = 34;
  pdf.setTextColor(...PRIMARY);
  pdf.setFontSize(16);
  pdf.text(title, MARGIN, y);
  y += 7;

  if (subtitle) {
    pdf.setFontSize(9);
    pdf.setTextColor(92, 111, 102);
    pdf.text(subtitle, MARGIN, y);
    y += 8;
  } else {
    y += 4;
  }

  const addSectionImage = (label: string, dataUrl: string, maxHeight: number) => {
    if (y > 240) {
      pdf.addPage();
      y = 20;
    }
    pdf.setFontSize(10);
    pdf.setTextColor(...PRIMARY);
    pdf.text(label, MARGIN, y);
    y += 3;

    const props = pdf.getImageProperties(dataUrl);
    let imgW = CONTENT_W;
    let imgH = (props.height * imgW) / props.width;
    if (imgH > maxHeight) {
      imgH = maxHeight;
      imgW = (props.width * imgH) / props.height;
    }

    pdf.addImage(dataUrl, 'JPEG', MARGIN, y, imgW, imgH, undefined, 'FAST');
    y += imgH + 8;
  };

  if (opts.mapScreenshot) {
    addSectionImage(isAr ? 'لقطة الخريطة' : 'Map Snapshot', opts.mapScreenshot, 52);
  }
  if (opts.panelScreenshot) {
    addSectionImage(isAr ? 'لقطة شاشة التحليل' : 'Analysis Panel Snapshot', opts.panelScreenshot, 72);
  }

  if (values.length > 0) {
    if (y > 230) {
      pdf.addPage();
      y = 20;
    }

    pdf.setFontSize(10);
    pdf.setTextColor(...PRIMARY);
    pdf.text(isAr ? 'القيم المعروضة في الواجهة' : 'Values from UI', MARGIN, y);
    y += 2;

    autoTable(pdf, {
      startY: y + 2,
      head: [[isAr ? 'البند' : 'Field', isAr ? 'القيمة' : 'Value']],
      body: values.map((row) => [row.label, row.value]),
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [...PRIMARY], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 247, 246] },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 'auto', fontStyle: 'bold' },
      },
    });
  }

  pdf.setFontSize(7);
  pdf.setTextColor(150);
  pdf.text(
    `${organization} — ${isAr ? 'سري — للاستخدام الداخلي' : 'Confidential — Internal Use'}`,
    PAGE_W / 2,
    290,
    { align: 'center' },
  );

  pdf.setProperties({
    title,
    subject: subtitle ?? 'GIS Analysis Report',
    author: organization,
    creator: 'GeoSense AI',
  });

  const blob = pdf.output('blob');
  downloadBlob(blob, filename);
  return blob;
}
