import jsPDF from 'jspdf';
import type { ReportConfig } from './types';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_LEFT = 15;
const MARGIN_RIGHT = 15;
const MARGIN_TOP = 15;
const MARGIN_BOTTOM = 20;

interface PDFGeneratorOptions {
  title: string;
  data: Record<string, any>;
  config: ReportConfig;
}

class LightweightPDFGenerator {
  private pdf: jsPDF;
  private currentY: number = MARGIN_TOP;
  private pageWidth: number;
  private pageHeight: number;

  constructor(orientation: 'portrait' | 'landscape' = 'portrait') {
    this.pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true,
    });
    this.pageWidth = orientation === 'portrait' ? 210 : 297;
    this.pageHeight = orientation === 'portrait' ? 297 : 210;
  }

  private checkPageBreak(height: number = 30): void {
    if (this.currentY + height > this.pageHeight - MARGIN_BOTTOM) {
      this.addNewPage();
    }
  }

  private addNewPage(): void {
    this.pdf.addPage();
    this.currentY = MARGIN_TOP;
  }

  addHeader(logoUrl: string, title: string, organization: string): void {
    this.currentY = MARGIN_TOP;

    // Logo (small and lightweight)
    if (logoUrl) {
      this.pdf.setFontSize(10);
      this.pdf.setTextColor(15, 86, 56);
      this.pdf.text(organization, MARGIN_LEFT, this.currentY);
    }

    // Title
    this.pdf.setFontSize(18);
    this.pdf.setFont('Helvetica', 'bold');
    this.pdf.setTextColor(15, 86, 56);
    this.pdf.text(title, MARGIN_LEFT, this.currentY + 12);

    // Date
    this.pdf.setFontSize(9);
    this.pdf.setFont('Helvetica', 'normal');
    this.pdf.setTextColor(108, 117, 125);
    const date = new Date().toLocaleDateString('ar-SA');
    this.pdf.text(`التاريخ: ${date}`, MARGIN_LEFT, this.currentY + 18);

    this.currentY += 25;

    // Separator line
    this.pdf.setDrawColor(15, 86, 56);
    this.pdf.setLineWidth(0.5);
    this.pdf.line(
      MARGIN_LEFT,
      this.currentY,
      this.pageWidth - MARGIN_RIGHT,
      this.currentY,
    );

    this.currentY += 5;
  }

  addSection(title: string, subtitle?: string): void {
    this.checkPageBreak(15);

    this.pdf.setFontSize(14);
    this.pdf.setFont('Helvetica', 'bold');
    this.pdf.setTextColor(15, 86, 56);
    this.pdf.text(title, MARGIN_LEFT, this.currentY);

    this.currentY += 8;

    if (subtitle) {
      this.pdf.setFontSize(10);
      this.pdf.setFont('Helvetica', 'normal');
      this.pdf.setTextColor(108, 117, 125);
      this.pdf.text(subtitle, MARGIN_LEFT, this.currentY);
      this.currentY += 6;
    }

    this.currentY += 2;
  }

  addDataCards(cards: Array<{ label: string; value: string | number }>): void {
    this.checkPageBreak(20);

    const cardWidth = (this.pageWidth - MARGIN_LEFT - MARGIN_RIGHT) / 2 - 2;
    let cardIndex = 0;

    for (const card of cards) {
      if (cardIndex % 2 === 0 && cardIndex > 0) {
        this.currentY += 16;
      }

      const xPos = MARGIN_LEFT + (cardIndex % 2) * (cardWidth + 4);

      // Card background
      this.pdf.setFillColor(248, 250, 251);
      this.pdf.setDrawColor(224, 228, 232);
      this.pdf.setLineWidth(0.3);
      this.pdf.rect(xPos, this.currentY, cardWidth, 14, 'FD');

      // Label
      this.pdf.setFontSize(8);
      this.pdf.setFont('Helvetica', 'bold');
      this.pdf.setTextColor(108, 117, 125);
      this.pdf.text(card.label.toUpperCase(), xPos + 2, this.currentY + 4);

      // Value
      this.pdf.setFontSize(12);
      this.pdf.setFont('Helvetica', 'bold');
      this.pdf.setTextColor(15, 86, 56);
      this.pdf.text(String(card.value), xPos + 2, this.currentY + 10);

      cardIndex++;
    }

    if (cardIndex % 2 === 1) {
      this.currentY += 16;
    } else {
      this.currentY += 0;
    }
  }

  addSimpleTable(
    headers: string[],
    rows: (string | number)[][],
    columnWidths?: number[],
  ): void {
    this.checkPageBreak(20);

    const availableWidth = this.pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
    const cols = headers.length;
    const colWidths =
      columnWidths ||
      Array(cols).fill(availableWidth / cols);

    const rowHeight = 6;

    // Header
    this.pdf.setFillColor(15, 86, 56);
    this.pdf.setTextColor(255, 255, 255);
    this.pdf.setFont('Helvetica', 'bold');
    this.pdf.setFontSize(9);

    let xPos = MARGIN_LEFT;
    for (let i = 0; i < headers.length; i++) {
      this.pdf.rect(xPos, this.currentY, colWidths[i], rowHeight, 'F');
      this.pdf.text(
        headers[i],
        xPos + 1,
        this.currentY + rowHeight - 1,
      );
      xPos += colWidths[i];
    }

    this.currentY += rowHeight;

    // Rows
    this.pdf.setTextColor(26, 35, 50);
    this.pdf.setFont('Helvetica', 'normal');
    this.pdf.setFontSize(8);

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];

      if (rowIdx % 2 === 0) {
        this.pdf.setFillColor(248, 250, 251);
      } else {
        this.pdf.setFillColor(255, 255, 255);
      }

      xPos = MARGIN_LEFT;
      for (let i = 0; i < row.length; i++) {
        this.pdf.rect(xPos, this.currentY, colWidths[i], rowHeight, 'F');
        this.pdf.text(
          String(row[i]),
          xPos + 1,
          this.currentY + rowHeight - 1,
        );
        xPos += colWidths[i];
      }

      this.currentY += rowHeight;
    }

    this.currentY += 5;
  }

  addText(text: string, fontSize: number = 10, bold: boolean = false): void {
    this.checkPageBreak(8);

    this.pdf.setFontSize(fontSize);
    this.pdf.setFont('Helvetica', bold ? 'bold' : 'normal');
    this.pdf.setTextColor(26, 35, 50);

    const lines = this.pdf.splitTextToSize(
      text,
      this.pageWidth - MARGIN_LEFT - MARGIN_RIGHT,
    );
    this.pdf.text(lines, MARGIN_LEFT, this.currentY);

    this.currentY += (lines.length * fontSize) / 2.5 + 3;
  }

  addChart(
    title: string,
    values: number[],
    labels: string[],
    barColor: [number, number, number] = [15, 86, 56],
  ): void {
    this.checkPageBreak(40);

    // Chart title
    this.pdf.setFontSize(10);
    this.pdf.setFont('Helvetica', 'bold');
    this.pdf.setTextColor(15, 86, 56);
    this.pdf.text(title, MARGIN_LEFT, this.currentY);

    this.currentY += 6;

    const maxValue = Math.max(...values);
    const chartWidth = this.pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
    const barWidth = chartWidth / values.length - 2;
    const chartHeight = 20;

    // Draw bars
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const barHeight = (value / maxValue) * chartHeight;
      const xPos = MARGIN_LEFT + i * (barWidth + 2);
      const yPos = this.currentY + chartHeight - barHeight;

      // Bar
      this.pdf.setFillColor(barColor[0], barColor[1], barColor[2]);
      this.pdf.rect(xPos, yPos, barWidth, barHeight, 'F');

      // Value label
      this.pdf.setFontSize(7);
      this.pdf.setTextColor(15, 86, 56);
      this.pdf.text(
        String(value.toFixed(2)),
        xPos + barWidth / 2 - 2,
        yPos - 1,
      );

      // Category label
      this.pdf.setFontSize(7);
      this.pdf.setTextColor(108, 117, 125);
      this.pdf.text(
        labels[i],
        xPos + barWidth / 2 - 2,
        this.currentY + chartHeight + 3,
      );
    }

    this.currentY += chartHeight + 10;
  }

  addColorScale(
    title: string,
    colors: string[],
    labels: string[],
  ): void {
    this.checkPageBreak(12);

    this.pdf.setFontSize(9);
    this.pdf.setFont('Helvetica', 'bold');
    this.pdf.setTextColor(15, 86, 56);
    this.pdf.text(title, MARGIN_LEFT, this.currentY);

    this.currentY += 5;

    const scaleWidth = this.pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
    const segmentWidth = scaleWidth / colors.length;

    for (let i = 0; i < colors.length; i++) {
      const xPos = MARGIN_LEFT + i * segmentWidth;

      // Color box
      this.pdf.setFillColor(
        parseInt(colors[i].slice(1, 3), 16),
        parseInt(colors[i].slice(3, 5), 16),
        parseInt(colors[i].slice(5, 7), 16),
      );
      this.pdf.rect(xPos, this.currentY, segmentWidth, 6, 'F');

      // Label
      this.pdf.setFontSize(7);
      this.pdf.setTextColor(108, 117, 125);
      this.pdf.text(labels[i], xPos + 1, this.currentY + 8);
    }

    this.currentY += 12;
  }

  /**
   * إضافة صورة للـ PDF
   * @param imageData Base64 string أو URL
   * @param title عنوان الصورة
   * @param width عرض الصورة (mm)
   * @param height ارتفاع الصورة (mm)
   */
  addImage(imageData: string, title?: string, width: number = 180, height: number = 100): void {
    this.checkPageBreak(height + 10);

    if (title) {
      this.pdf.setFontSize(12);
      this.pdf.setFont('Helvetica', 'bold');
      this.pdf.setTextColor(15, 86, 56);
      this.pdf.text(title, MARGIN_LEFT, this.currentY);
      this.currentY += 8;
    }

    try {
      const imageWidth = this.pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
      const scaledWidth = Math.min(width, imageWidth);
      const scaledHeight = (scaledWidth / width) * height;

      // تحديد نوع الصورة
      let imgFormat = 'JPEG';
      if (imageData.includes('data:image/png')) {
        imgFormat = 'PNG';
        imageData = imageData.replace('data:image/png;base64,', '');
      } else if (imageData.includes('data:image')) {
        imageData = imageData.split(',')[1] || imageData;
      }

      this.pdf.addImage(
        imageData,
        imgFormat,
        MARGIN_LEFT,
        this.currentY,
        scaledWidth,
        scaledHeight,
      );

      this.currentY += scaledHeight + 5;
    } catch (error) {
      console.warn('Failed to add image to PDF:', error);
      this.pdf.setFontSize(10);
      this.pdf.setTextColor(220, 53, 69);
      this.pdf.text('[صورة - فشل التحميل]', MARGIN_LEFT, this.currentY);
      this.currentY += 10;
    }
  }

  /**
   * إضافة معرض صور في شبكة
   */
  addImageGallery(images: Array<{ data: string; caption?: string }>, imagesPerRow: number = 2): void {
    const imageWidth = (this.pageWidth - MARGIN_LEFT - MARGIN_RIGHT) / imagesPerRow - 5;
    const imageHeight = imageWidth * 0.75;

    images.forEach((img, index) => {
      const row = Math.floor(index / imagesPerRow);
      const col = index % imagesPerRow;

      if (col === 0 && index > 0) {
        this.checkPageBreak(imageHeight + 15);
      }

      const x = MARGIN_LEFT + col * (imageWidth + 5);
      let y = this.currentY + row * (imageHeight + 8);

      try {
        let imgData = img.data;
        let format = 'JPEG';

        if (imgData.includes('data:image/png')) {
          format = 'PNG';
          imgData = imgData.replace('data:image/png;base64,', '');
        } else if (imgData.includes('data:image')) {
          imgData = imgData.split(',')[1] || imgData;
        }

        this.pdf.addImage(imgData, format, x, y, imageWidth, imageHeight);

        if (img.caption) {
          this.pdf.setFontSize(8);
          this.pdf.setTextColor(108, 117, 125);
          this.pdf.text(img.caption, x, y + imageHeight + 2, { maxWidth: imageWidth });
        }
      } catch (error) {
        console.warn('Failed to add gallery image:', error);
      }
    });

    this.currentY += (Math.ceil(images.length / imagesPerRow)) * (imageHeight + 8) + 5;
  }

  addFooter(text: string): void {
    const pageCount = this.pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      this.pdf.setPage(i);
      this.pdf.setFontSize(8);
      this.pdf.setTextColor(108, 117, 125);
      this.pdf.text(
        text,
        this.pageWidth / 2,
        this.pageHeight - 8,
        { align: 'center' },
      );
      this.pdf.text(
        `صفحة ${i}/${pageCount}`,
        this.pageWidth - MARGIN_RIGHT,
        this.pageHeight - 8,
        { align: 'right' },
      );
    }
  }

  save(filename: string): void {
    this.pdf.save(filename);
  }

  getBlob(): Blob {
    return this.pdf.output('blob');
  }
}

// Export function for use
export async function generateLightweightPDF(
  options: PDFGeneratorOptions,
): Promise<Blob> {
  const { title, data, config } = options;

  const pdf = new LightweightPDFGenerator('portrait');

  // Header
  pdf.addHeader(config.logoUrl || '', title, config.organization);

  // Content sections
  if (data.selectedArea) {
    pdf.addSection('Selected Area Data');
    pdf.addDataCards([
      { label: 'Latitude', value: data.selectedArea.lat?.toFixed(4) || 'N/A' },
      { label: 'Longitude', value: data.selectedArea.lng?.toFixed(4) || 'N/A' },
      { label: 'Area (km²)', value: data.selectedArea.area?.toFixed(2) || 'N/A' },
    ]);
  }

  if (data.ndviData) {
    pdf.addSection('NDVI Analysis', 'Vegetation Index (Sentinel-2)');

    pdf.addDataCards([
      { label: 'Current Value', value: data.ndviData.value?.toFixed(3) || '0' },
      { label: 'Min', value: data.ndviData.min?.toFixed(3) || '0' },
      { label: 'Max', value: data.ndviData.max?.toFixed(3) || '0' },
      { label: 'Mean', value: data.ndviData.mean?.toFixed(3) || '0' },
    ]);

    // Color scale
    if (data.ndviData.colorScale) {
      pdf.addColorScale(
        'NDVI Scale',
        ['#d73027', '#fee090', '#1a9850'],
        ['Low', 'Medium', 'High'],
      );
    }
  }

  if (data.weatherData) {
    pdf.addSection('Weather Data', 'Current Conditions');

    pdf.addDataCards([
      { label: 'Temperature', value: `${data.weatherData.temp}°C` },
      { label: 'Humidity', value: `${data.weatherData.humidity}%` },
      { label: 'Rainfall', value: `${data.weatherData.rainfall}mm` },
    ]);

    if (data.weatherData.forecast) {
      pdf.addText('7-Day Forecast', 10, true);
      const forecast = data.weatherData.forecast;
      pdf.addSimpleTable(
        ['Day', 'Temp', 'Condition'],
        forecast.map((day: any) => [
          day.day,
          `${day.temp}°C`,
          day.condition,
        ]),
      );
    }
  }

  if (data.statisticsData) {
    pdf.addSection('Statistics', 'Analysis Summary');
    pdf.addSimpleTable(
      ['Metric', 'Value'],
      Object.entries(data.statisticsData).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
  }

  // Footer
  pdf.addFooter(config.title);

  return pdf.getBlob();
}

export { LightweightPDFGenerator };
