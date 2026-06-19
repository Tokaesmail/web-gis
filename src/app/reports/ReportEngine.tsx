import { useCallback, useMemo, useRef, useState } from 'react';
import { CoverPage, DEFAULT_LOGO } from './ReportTemplate';
import { OverviewReport } from './OverviewReport';
import { NDVIReport } from './NDVIReport';
import { CropReport } from './CropReport';
import { WeatherReport } from './WeatherReport';
import { SatelliteReport } from './SatelliteReport';
import { TemplateMatchReport } from './TemplateMatchReport';
import { ChartsReport } from './ChartsReport';
import { captureMapScreenshot, exportReportToPDF } from './ExportPDF';
import { exportReportToExcel } from './ExportExcel';
import { ExportToolbar, type ExportFormat } from './ExportToolbar';
import type { ReportEngineProps, ReportConfig } from './types';
import './reportStyles.css';

function RecommendationsPage({
  config,
  recommendations,
  pageNumber,
  totalPages,
}: {
  config: ReportConfig;
  recommendations: ReportEngineProps['data']['recommendations'];
  pageNumber: number;
  totalPages: number;
}) {
  const isAr = config.locale === 'ar';

  return (
    <div className={`report-page ${isAr ? 'ar' : 'en'}`} data-report-page={pageNumber}>
      <header className="report-header">
        <div className="report-header-logo">
          <img src={config.logoUrl ?? DEFAULT_LOGO} alt={config.organization} />
        </div>
        <div className="report-header-meta">
          <div><strong>{config.organization}</strong></div>
          <div>{isAr ? 'صفحة' : 'Page'} {pageNumber} / {totalPages}</div>
        </div>
      </header>

      <h1 className="report-section-title">
        {isAr ? 'التوصيات والإجراءات' : 'Recommendations & Actions'}
      </h1>
      <p className="report-section-subtitle">
        {isAr ? 'توصيات مبنية على تحليل البيانات الجغرافية والطيفية' : 'Data-driven recommendations from geospatial and spectral analysis'}
      </p>

      {recommendations.map((rec, i) => (
        <div key={i} className="report-recommendation">
          <h4>
            <span className={`report-badge ${rec.priority}`}>
              {rec.priority === 'high' ? (isAr ? 'عالي' : 'HIGH') :
               rec.priority === 'medium' ? (isAr ? 'متوسط' : 'MED') :
               (isAr ? 'منخفض' : 'LOW')}
            </span>
            {' '}[{rec.category}] {rec.title}
          </h4>
          <p>{rec.description}</p>
          <div className="action">
            {isAr ? 'الإجراء المقترح' : 'Suggested Action'}: {rec.action}
          </div>
        </div>
      ))}

      <footer className="report-footer">
        <span>{config.title}</span>
        <span>{isAr ? 'نهاية التقرير' : 'End of Report'}</span>
        <span>{pageNumber}</span>
      </footer>
    </div>
  );
}

export function ReportEngine({ data, config, mapRef, onExportStart, onExportComplete, onExportError }: ReportEngineProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [mapScreenshot, setMapScreenshot] = useState<string | undefined>(data.mapScreenshot);
  const isAr = config.locale === 'ar';

  const sections = useMemo(() => {
    const list: string[] = [];
    if (config.includeSections.cover) list.push('cover');
    if (config.includeSections.overview) list.push('overview');
    if (config.includeSections.ndvi) list.push('ndvi');
    if (config.includeSections.crop) list.push('crop');
    if (config.includeSections.weather) list.push('weather');
    if (config.includeSections.satellite) list.push('satellite');
    if (config.includeSections.templateMatch) list.push('templateMatch');
    if (config.includeSections.charts) list.push('charts');
    if (config.includeSections.recommendations) list.push('recommendations');
    return list;
  }, [config.includeSections]);

  const totalPages = sections.filter((s) => s !== 'cover').length;

  const pageNumbers = useMemo(() => {
    const nums: Record<string, number> = {};
    let n = 1;
    for (const s of sections) {
      if (s !== 'cover') {
        nums[s] = n++;
      }
    }
    return nums;
  }, [sections]);

  const fieldMeta = [
    { label: isAr ? 'المحصول' : 'Crop', value: data.field.cropType },
    { label: isAr ? 'المساحة' : 'Area', value: `${data.field.areaHa} ha` },
    { label: isAr ? 'الإحداثيات' : 'Coordinates', value: `${data.field.coordinates.lat.toFixed(4)}°N, ${data.field.coordinates.lng.toFixed(4)}°E` },
    { label: isAr ? 'تاريخ الزراعة' : 'Planted', value: data.field.plantingDate },
  ];

  const handleExport = useCallback(async (format: ExportFormat) => {
    setExporting(true);
    setExportFormat(format);
    onExportStart?.();

    try {
      if (format === 'excel') {
        const blob = exportReportToExcel(data, config, {
          filename: `${data.field.name.replace(/\s+/g, '_')}_GIS_Report.xlsx`,
        });
        onExportComplete?.(blob);
        return;
      }

      if (!reportRef.current) {
        throw new Error(isAr ? 'لم يتم العثور على محتوى التقرير' : 'Report content not found');
      }

      if (mapRef?.current && !mapScreenshot) {
        const screenshot = await captureMapScreenshot(mapRef.current);
        setMapScreenshot(screenshot);
        await new Promise((r) => setTimeout(r, 300));
      }

      const blob = await exportReportToPDF(reportRef.current, config, {
        filename: `${data.field.name.replace(/\s+/g, '_')}_GIS_Report.pdf`,
      });
      onExportComplete?.(blob);
    } catch (err) {
      onExportError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setExporting(false);
      setExportFormat(null);
    }
  }, [config, data, isAr, mapRef, mapScreenshot, onExportComplete, onExportError, onExportStart]);

  const screenshot = mapScreenshot ?? data.mapScreenshot;

  return (
    <div className="report-engine">
      <ExportToolbar
        config={config}
        sectionCount={sections.length}
        pageCount={totalPages}
        exporting={exporting}
        exportFormat={exportFormat}
        onExport={handleExport}
      />

      <div className="report-preview-scroll">
        <div ref={reportRef} className="report-root">
          {config.includeSections.cover && (
            <CoverPage config={config} fieldName={data.field.name} fieldMeta={fieldMeta} />
          )}
          {config.includeSections.overview && (
            <OverviewReport config={config} data={{ ...data, mapScreenshot: screenshot }} pageNumber={pageNumbers.overview} totalPages={totalPages} />
          )}
          {config.includeSections.ndvi && (
            <NDVIReport config={config} ndvi={data.ndvi} mapScreenshot={screenshot} pageNumber={pageNumbers.ndvi} totalPages={totalPages} />
          )}
          {config.includeSections.crop && (
            <CropReport config={config} crop={data.crop} cropType={data.field.cropType} pageNumber={pageNumbers.crop} totalPages={totalPages} />
          )}
          {config.includeSections.weather && (
            <WeatherReport config={config} weather={data.weather} pageNumber={pageNumbers.weather} totalPages={totalPages} />
          )}
          {config.includeSections.satellite && (
            <SatelliteReport config={config} satellite={data.satellite} mapScreenshot={screenshot} pageNumber={pageNumbers.satellite} totalPages={totalPages} />
          )}
          {config.includeSections.templateMatch && (
            <TemplateMatchReport config={config} templateMatch={data.templateMatch} pageNumber={pageNumbers.templateMatch} totalPages={totalPages} />
          )}
          {config.includeSections.charts && (
            <ChartsReport config={config} charts={data.charts} pageNumber={pageNumbers.charts} totalPages={totalPages} />
          )}
          {config.includeSections.recommendations && (
            <RecommendationsPage config={config} recommendations={data.recommendations} pageNumber={pageNumbers.recommendations} totalPages={totalPages} />
          )}
        </div>
      </div>
    </div>
  );
}
