import { ReportTemplate } from './ReportTemplate';
import type { ReportConfig, SatelliteData } from './types';

interface SatelliteReportProps {
  config: ReportConfig;
  satellite: SatelliteData;
  mapScreenshot?: string;
  pageNumber: number;
  totalPages: number;
}

export function SatelliteReport({ config, satellite, mapScreenshot, pageNumber, totalPages }: SatelliteReportProps) {
  const isAr = config.locale === 'ar';
  const changeColor = satellite.changeDetection.changePercent >= 0 ? 'var(--report-success)' : 'var(--report-danger)';

  return (
    <ReportTemplate
      config={config}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionTitle={isAr ? 'تقرير الأقمار الصناعية' : 'Satellite Imagery Report'}
      sectionSubtitle={isAr ? 'تحليل الصور الفضائية والمؤشرات الطيفية' : 'Satellite image analysis and spectral indices'}
    >
      <div className="report-grid-4" style={{ marginBottom: 16 }}>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'المزود' : 'Provider'}</div>
          <div className="report-card-value" style={{ fontSize: 14 }}>{satellite.provider}</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'تاريخ الالتقاط' : 'Acquisition'}</div>
          <div className="report-card-value" style={{ fontSize: 14 }}>{satellite.acquisitionDate}</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'الدقة' : 'Resolution'}</div>
          <div className="report-card-value" style={{ fontSize: 14 }}>{satellite.resolution}</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'غطاء السحب' : 'Cloud Cover'}</div>
          <div className="report-card-value">{satellite.cloudCover}%</div>
        </div>
      </div>

      {mapScreenshot && (
        <div className="report-map-container">
          <img src={mapScreenshot} alt={isAr ? 'صورة فضائية' : 'Satellite Image'} />
          <div className="report-map-legend">
            <span>{satellite.provider}</span>
            <span>|</span>
            <span>{satellite.resolution}</span>
            <span>|</span>
            <span>{isAr ? 'غيوم' : 'Clouds'}: {satellite.cloudCover}%</span>
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 14, color: 'var(--report-primary)', marginBottom: 8 }}>
        {isAr ? 'الأطياف المتاحة' : 'Available Bands'}
      </h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {satellite.bands.map((band) => (
          <span key={band} style={{ background: 'var(--report-primary)', color: 'white', padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600 }}>
            {band}
          </span>
        ))}
      </div>

      <h3 style={{ fontSize: 14, color: 'var(--report-primary)', marginBottom: 8 }}>
        {isAr ? 'المؤشرات الطيفية' : 'Spectral Indices'}
      </h3>
      <table className="report-table">
        <thead>
          <tr>
            <th>{isAr ? 'المؤشر' : 'Index'}</th>
            <th>{isAr ? 'القيمة' : 'Value'}</th>
            <th>{isAr ? 'الحالة' : 'Status'}</th>
          </tr>
        </thead>
        <tbody>
          {satellite.indices.map((idx) => (
            <tr key={idx.name}>
              <td><strong>{idx.name}</strong></td>
              <td>{idx.value.toFixed(3)}</td>
              <td>{idx.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="report-card" style={{ marginTop: 20 }}>
        <div className="report-card-label">{isAr ? 'كشف التغيير' : 'Change Detection'}</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          {isAr ? 'الفترة' : 'Period'}: <strong>{satellite.changeDetection.period}</strong>
          {' — '}
          {isAr ? 'التغيير' : 'Change'}:{' '}
          <strong style={{ color: changeColor }}>
            {satellite.changeDetection.changePercent > 0 ? '+' : ''}
            {satellite.changeDetection.changePercent}%
          </strong>
          {' '}({satellite.changeDetection.direction})
        </div>
      </div>
    </ReportTemplate>
  );
}
