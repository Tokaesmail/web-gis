import type { ReportConfig } from './types';
import { LightweightPDFGenerator } from './LightweightPDFGenerator';

export interface FastExportOptions {
  filename?: string;
  onStart?: () => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

/**
 * ⚡ سريع جداً: تصدير PDF بدون html2canvas
 * - بدون تحويل الويب لصورة
 * - رسم مباشر للنصوص والجداول
 * - تحميل فوري عند الضغط على الزر
 * - دعم كامل للصور والخرائط
 */
export async function exportReportFast(
  data: Record<string, any>,
  config: ReportConfig,
  options: FastExportOptions = {},
): Promise<Blob> {
  const {
    filename = `GIS_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
    onStart,
    onComplete,
    onError,
  } = options;

  try {
    onStart?.();

    const pdf = new LightweightPDFGenerator('portrait');

    // Header
    pdf.addHeader(config.logoUrl || '', config.title, config.organization);

    // Selected Area Section
    if (data.areaData) {
      pdf.addSection('Selected Area Data', 'Geographic Information');
      pdf.addDataCards([
        { label: 'Latitude', value: data.areaData.lat?.toFixed(4) || 'N/A' },
        { label: 'Longitude', value: data.areaData.lng?.toFixed(4) || 'N/A' },
        { label: 'Area Size (km²)', value: data.areaData.area?.toFixed(2) || 'N/A' },
      ]);
    }

    // Map Screenshot (if available)
    if (data.mapScreenshot) {
      pdf.addSection('Location Map', 'Geographic Overview');
      pdf.addImage(data.mapScreenshot, 'خريطة الموقع', 180, 120);
    }

    // NDVI Section
    if (data.ndviData) {
      pdf.addSection('NDVI Vegetation Index', 'Sentinel-2 Analysis');

      pdf.addDataCards([
        { label: 'Current NDVI', value: data.ndviData.value?.toFixed(3) || '0' },
        { label: 'Minimum', value: data.ndviData.min?.toFixed(3) || '0' },
        { label: 'Maximum', value: data.ndviData.max?.toFixed(3) || '0' },
        { label: 'Average', value: data.ndviData.mean?.toFixed(3) || '0' },
      ]);

      // NDVI Scale Visualization
      if (data.ndviData.colorScale) {
        pdf.addColorScale(
          'NDVI Scale (Index -1 to +1)',
          ['#d73027', '#fee090', '#1a9850'],
          ['Stressed', 'Moderate', 'Healthy'],
        );
      }

      // NDVI Map Image
      if (data.ndviMap) {
        pdf.addImage(data.ndviMap, 'خريطة NDVI', 180, 100);
      }

      // If there's trend data
      if (data.ndviData.trend) {
        pdf.addText(`Trend: ${data.ndviData.trend}`, 9, false);
      }
    }

    // Weather Section
    if (data.weatherData) {
      pdf.addSection('Weather Conditions', 'Current & Forecast');

      pdf.addDataCards([
        { label: 'Temperature', value: `${data.weatherData.temp}°C` },
        { label: 'Humidity', value: `${data.weatherData.humidity}%` },
        { label: 'Precipitation', value: `${data.weatherData.rainfall}mm` },
      ]);

      // Weather Forecast Table
      if (data.weatherData.forecast && data.weatherData.forecast.length > 0) {
        pdf.addText('7-Day Forecast', 9, true);
        const forecastRows = data.weatherData.forecast.map((day: any) => [
          day.day || 'N/A',
          `${day.temp}°C`,
          day.condition || 'N/A',
        ]);

        pdf.addSimpleTable(
          ['Day', 'Temp', 'Condition'],
          forecastRows,
          [30, 30, 90],
        );
      }
    }

    // Crop Health Section
    if (data.cropData) {
      pdf.addSection('Crop Health Analysis', 'Field Assessment');

      pdf.addDataCards([
        { label: 'Health Status', value: data.cropData.health || 'Good' },
        { label: 'Moisture', value: `${data.cropData.moisture}%` || 'N/A' },
        { label: 'Coverage', value: `${data.cropData.coverage}%` || 'N/A' },
      ]);

      // Crop analysis image
      if (data.cropImage) {
        pdf.addImage(data.cropImage, 'صورة تحليل المحصول', 180, 100);
      }

      if (data.cropData.recommendations) {
        pdf.addText('Recommendations:', 9, true);
        pdf.addText(data.cropData.recommendations, 8, false);
      }
    }

    // Statistics Section
    if (data.statistics && Object.keys(data.statistics).length > 0) {
      pdf.addSection('Key Statistics', 'Summary Metrics');

      const statsRows = Object.entries(data.statistics).map(
        ([key, value]) => [key, String(value)],
      );

      pdf.addSimpleTable(['Metric', 'Value'], statsRows);
    }

    // Satellite Images
    if (data.satelliteImages && data.satelliteImages.length > 0) {
      pdf.addSection('Satellite Images', 'Multi-temporal Analysis');
      pdf.addImageGallery(data.satelliteImages, 2);
    }

    // Analysis Summary Section
    if (data.summary) {
      pdf.addSection('Analysis Summary', 'Conclusions & Insights');
      pdf.addText(data.summary, 9, false);
    }

    // Recommendations Section
    if (data.recommendations && data.recommendations.length > 0) {
      pdf.addSection('Recommendations', 'Action Items');

      for (const rec of data.recommendations) {
        pdf.addText(`• ${rec}`, 8, false);
      }
    }

    // Additional Images Gallery
    if (data.images && data.images.length > 0) {
      pdf.addSection('Additional Images', 'Field Documentation');
      pdf.addImageGallery(data.images, 2);
    }

    // Add footer to all pages
    pdf.addFooter(config.organization);

    // Generate blob
    const blob = pdf.getBlob();

    // Trigger download
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    onComplete?.();

    return blob;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
    throw err;
  }
}

/**
 * ⚡ تصدير فوري بدون تأخير
 * استخدم هذه للتحميل المباشر
 */
export async function quickExport(
  data: Record<string, any>,
  config: ReportConfig,
): Promise<void> {
  await exportReportFast(data, config, {
    filename: `Report_${Date.now()}.pdf`,
    onStart: () => console.log('📄 Generating PDF...'),
    onComplete: () => console.log('✅ PDF ready!'),
    onError: (error) => console.error('❌ Error:', error.message),
  });
}
