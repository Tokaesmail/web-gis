import { ReportTemplate } from './ReportTemplate';
import type { ReportConfig, ReportData } from './types';

interface OverviewReportProps {
  config: ReportConfig;
  data: ReportData;
  pageNumber: number;
  totalPages: number;
}

export function OverviewReport({ config, data, pageNumber, totalPages }: OverviewReportProps) {
  const isAr = config.locale === 'ar';
  const { field, ndvi, crop, weather, satellite } = data;

  const healthLabel =
    crop.healthScore >= 80
      ? isAr ? 'ممتاز' : 'Excellent'
      : crop.healthScore >= 60
        ? isAr ? 'جيد' : 'Good'
        : isAr ? 'يحتاج اهتمام' : 'Needs Attention';

  return (
    <ReportTemplate
      config={config}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionTitle={isAr ? 'نظرة عامة تنفيذية' : 'Executive Overview'}
      sectionSubtitle={isAr ? 'ملخص شامل لحالة الحقل والمؤشرات الرئيسية' : 'Comprehensive summary of field status and key indicators'}
    >
      <div className="report-grid-4" style={{ marginBottom: 20 }}>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'NDVI الحالي' : 'Current NDVI'}</div>
          <div className="report-card-value">{ndvi.current.toFixed(3)}</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'صحة المحصول' : 'Crop Health'}</div>
          <div className="report-card-value">{crop.healthScore}% <small>{healthLabel}</small></div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'المساحة' : 'Area'}</div>
          <div className="report-card-value">{field.areaHa} <small>ha</small></div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'غطاء السحب' : 'Cloud Cover'}</div>
          <div className="report-card-value">{satellite.cloudCover}%</div>
        </div>
      </div>

      {data.mapScreenshot && (
        <div className="report-map-container">
          <img src={data.mapScreenshot} alt={isAr ? 'خريطة الحقل' : 'Field Map'} />
          <div className="report-map-legend">
            <span>{isAr ? 'لقطة الخريطة التلقائية' : 'Auto-captured Map Screenshot'}</span>
            <span>|</span>
            <span>{field.coordinates.lat.toFixed(5)}°N, {field.coordinates.lng.toFixed(5)}°E</span>
          </div>
        </div>
      )}

      <div className="report-grid-2">
        <div>
          <h3 style={{ fontSize: 14, color: 'var(--report-primary)', marginBottom: 8 }}>
            {isAr ? 'معلومات الحقل' : 'Field Information'}
          </h3>
          <table className="report-table">
            <tbody>
              <tr><td>{isAr ? 'نوع المحصول' : 'Crop Type'}</td><td><strong>{field.cropType}</strong></td></tr>
              <tr><td>{isAr ? 'مرحلة النمو' : 'Growth Stage'}</td><td>{crop.growthStage}</td></tr>
              <tr><td>{isAr ? 'تاريخ الزراعة' : 'Planting Date'}</td><td>{field.plantingDate}</td></tr>
              <tr><td>{isAr ? 'رطوبة التربة' : 'Soil Moisture'}</td><td>{crop.soilMoisture}%</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3 style={{ fontSize: 14, color: 'var(--report-primary)', marginBottom: 8 }}>
            {isAr ? 'الظروف الجوية' : 'Weather Conditions'}
          </h3>
          <table className="report-table">
            <tbody>
              <tr><td>{isAr ? 'درجة الحرارة' : 'Temperature'}</td><td>{weather.temperature.current}°{weather.temperature.unit}</td></tr>
              <tr><td>{isAr ? 'الرطوبة' : 'Humidity'}</td><td>{weather.humidity}%</td></tr>
              <tr><td>{isAr ? 'أمطار أسبوعية' : 'Weekly Rain'}</td><td>{weather.rainfall.weekly} {weather.rainfall.unit}</td></tr>
              <tr><td>{isAr ? 'سرعة الرياح' : 'Wind Speed'}</td><td>{weather.windSpeed} km/h</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {data.recommendations.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, color: 'var(--report-primary)', marginBottom: 8 }}>
            {isAr ? 'أهم التوصيات' : 'Top Recommendations'}
          </h3>
          {data.recommendations.slice(0, 2).map((rec, i) => (
            <div key={i} className="report-recommendation">
              <h4>
                <span className={`report-badge ${rec.priority}`}>{rec.priority}</span>
                {' '}{rec.title}
              </h4>
              <p>{rec.description}</p>
            </div>
          ))}
        </div>
      )}
    </ReportTemplate>
  );
}
