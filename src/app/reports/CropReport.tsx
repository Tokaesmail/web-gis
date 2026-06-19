import { ReportTemplate } from './ReportTemplate';
import type { ReportConfig, CropData } from './types';

interface CropReportProps {
  config: ReportConfig;
  crop: CropData;
  cropType: string;
  pageNumber: number;
  totalPages: number;
}

export function CropReport({ config, crop, cropType, pageNumber, totalPages }: CropReportProps) {
  const isAr = config.locale === 'ar';

  const pestLabel = {
    low: isAr ? 'منخفض' : 'Low',
    medium: isAr ? 'متوسط' : 'Medium',
    high: isAr ? 'مرتفع' : 'High',
  }[crop.pestRisk];

  const yieldChange = crop.estimatedYield.change;
  const yieldArrow = yieldChange >= 0 ? '↑' : '↓';

  return (
    <ReportTemplate
      config={config}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionTitle={isAr ? 'تقرير المحصول' : 'Crop Analysis Report'}
      sectionSubtitle={isAr ? `تحليل صحة ونمو ${cropType}` : `Health and growth analysis for ${cropType}`}
    >
      <div className="report-grid-3" style={{ marginBottom: 20 }}>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'درجة الصحة' : 'Health Score'}</div>
          <div className="report-card-value">{crop.healthScore}%</div>
          <div style={{ marginTop: 8, height: 6, background: '#e0e0e0', borderRadius: 3 }}>
            <div style={{ width: `${crop.healthScore}%`, height: '100%', background: 'var(--report-primary)', borderRadius: 3 }} />
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'مرحلة النمو' : 'Growth Stage'}</div>
          <div className="report-card-value" style={{ fontSize: 18 }}>{crop.growthStage}</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'الإنتاج المتوقع' : 'Est. Yield'}</div>
          <div className="report-card-value">
            {crop.estimatedYield.value} <small>{crop.estimatedYield.unit}</small>
          </div>
          <div style={{ fontSize: 11, color: yieldChange >= 0 ? 'var(--report-success)' : 'var(--report-danger)' }}>
            {yieldArrow} {Math.abs(yieldChange)}% {isAr ? 'عن الموسم السابق' : 'vs last season'}
          </div>
        </div>
      </div>

      <div className="report-grid-2" style={{ marginBottom: 20 }}>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'رطوبة التربة' : 'Soil Moisture'}</div>
          <div className="report-card-value">{crop.soilMoisture}%</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'مخاطر الآفات' : 'Pest Risk'}</div>
          <div className="report-card-value" style={{ fontSize: 18 }}>
            <span className={`report-badge ${crop.pestRisk}`}>{pestLabel}</span>
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: 14, color: 'var(--report-primary)', marginBottom: 8 }}>
        {isAr ? 'عوامل الإجهاد' : 'Stress Factors'}
      </h3>
      <table className="report-table">
        <thead>
          <tr>
            <th>{isAr ? 'العامل' : 'Factor'}</th>
            <th>{isAr ? 'الشدة' : 'Severity'}</th>
            <th>{isAr ? 'الوصف' : 'Description'}</th>
          </tr>
        </thead>
        <tbody>
          {crop.stressFactors.map((factor) => (
            <tr key={factor.name}>
              <td><strong>{factor.name}</strong></td>
              <td><span className={`report-badge ${factor.severity}`}>{factor.severity}</span></td>
              <td>{factor.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTemplate>
  );
}
