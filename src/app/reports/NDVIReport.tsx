import { ReportTemplate } from './ReportTemplate';
import type { ReportConfig, NDVIData } from './types';

interface NDVIReportProps {
  config: ReportConfig;
  ndvi: NDVIData;
  mapScreenshot?: string;
  pageNumber: number;
  totalPages: number;
}

const NDVI_COLORS = ['#8b0000', '#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850', '#006837'];

function getNdviStatus(value: number, isAr: boolean): string {
  if (value < 0.2) return isAr ? 'تربة عارية / لا نباتات' : 'Bare Soil / No Vegetation';
  if (value < 0.4) return isAr ? 'نباتات ضعيفة' : 'Sparse Vegetation';
  if (value < 0.6) return isAr ? 'غطاء متوسط' : 'Moderate Cover';
  if (value < 0.8) return isAr ? 'غطاء كثيف' : 'Dense Vegetation';
  return isAr ? 'غطاء كثيف جداً' : 'Very Dense Vegetation';
}

export function NDVIReport({ config, ndvi, mapScreenshot, pageNumber, totalPages }: NDVIReportProps) {
  const isAr = config.locale === 'ar';
  const trendLabel = {
    improving: isAr ? '↑ تحسن' : '↑ Improving',
    stable: isAr ? '→ مستقر' : '→ Stable',
    declining: isAr ? '↓ تراجع' : '↓ Declining',
  }[ndvi.trend];

  return (
    <ReportTemplate
      config={config}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionTitle={isAr ? 'تقرير مؤشر NDVI' : 'NDVI Analysis Report'}
      sectionSubtitle={isAr ? 'تحليل الغطاء النباتي باستخدام الفهرس الطيفي للغضروة' : 'Vegetation cover analysis using Normalized Difference Vegetation Index'}
    >
      <div className="report-grid-4" style={{ marginBottom: 16 }}>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'القيمة الحالية' : 'Current'}</div>
          <div className="report-card-value">{ndvi.current.toFixed(3)}</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'المتوسط' : 'Average'}</div>
          <div className="report-card-value">{ndvi.average.toFixed(3)}</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'الحد الأدنى / الأقصى' : 'Min / Max'}</div>
          <div className="report-card-value" style={{ fontSize: 16 }}>{ndvi.min.toFixed(2)} / {ndvi.max.toFixed(2)}</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'الاتجاه' : 'Trend'}</div>
          <div className="report-card-value" style={{ fontSize: 16 }}>{trendLabel}</div>
        </div>
      </div>

      <div style={{ marginBottom: 8, fontSize: 12 }}>
        <strong>{isAr ? 'مقياس NDVI:' : 'NDVI Scale:'}</strong> {getNdviStatus(ndvi.current, isAr)}
      </div>
      <div className="report-ndvi-scale">
        {NDVI_COLORS.map((color, i) => (
          <span key={i} style={{ background: color }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--report-muted)', marginBottom: 16 }}>
        <span>-1.0</span>
        <span>0.0</span>
        <span>0.5</span>
        <span>1.0</span>
      </div>

      {mapScreenshot && (
        <div className="report-map-container">
          <img src={mapScreenshot} alt="NDVI Map" />
          <div className="report-map-legend">
            {NDVI_COLORS.map((color, i) => (
              <div key={i} className="report-legend-item">
                <span className="report-legend-color" style={{ background: color }} />
                <span>{(i * 0.25 - 0.5).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ndvi.anomalyDetected && (
        <div style={{ background: '#fdecea', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12 }}>
          ⚠ {isAr ? 'تم رصد شذوذ في قيم NDVI — يُنصح بفحص ميداني' : 'NDVI anomaly detected — field inspection recommended'}
        </div>
      )}

      <h3 style={{ fontSize: 14, color: 'var(--report-primary)', marginBottom: 8 }}>
        {isAr ? 'توزيع المناطق' : 'Zone Distribution'}
      </h3>
      <table className="report-table">
        <thead>
          <tr>
            <th>{isAr ? 'المنطقة' : 'Zone'}</th>
            <th>{isAr ? 'المساحة (هكتار)' : 'Area (ha)'}</th>
            <th>NDVI</th>
            <th>{isAr ? 'الحالة' : 'Status'}</th>
          </tr>
        </thead>
        <tbody>
          {ndvi.zones.map((zone) => (
            <tr key={zone.label}>
              <td>{zone.label}</td>
              <td>{zone.areaHa}</td>
              <td><strong>{zone.ndvi.toFixed(3)}</strong></td>
              <td>{zone.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: 14, color: 'var(--report-primary)', margin: '20px 0 8px' }}>
        {isAr ? 'السجل التاريخي' : 'Historical Record'}
      </h3>
      <table className="report-table">
        <thead>
          <tr>
            <th>{isAr ? 'التاريخ' : 'Date'}</th>
            <th>NDVI</th>
            <th>{isAr ? 'التصنيف' : 'Classification'}</th>
          </tr>
        </thead>
        <tbody>
          {ndvi.history.map((h) => (
            <tr key={h.date}>
              <td>{h.date}</td>
              <td>{h.value.toFixed(3)}</td>
              <td>{getNdviStatus(h.value, isAr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTemplate>
  );
}
