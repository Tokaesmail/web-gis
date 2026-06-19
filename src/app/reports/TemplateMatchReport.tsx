import { ReportTemplate } from './ReportTemplate';
import type { ReportConfig, TemplateMatchData } from './types';

interface TemplateMatchReportProps {
  config: ReportConfig;
  templateMatch: TemplateMatchData;
  pageNumber: number;
  totalPages: number;
}

export function TemplateMatchReport({ config, templateMatch, pageNumber, totalPages }: TemplateMatchReportProps) {
  const isAr = config.locale === 'ar';
  const confidencePct = (templateMatch.confidence * 100).toFixed(1);

  return (
    <ReportTemplate
      config={config}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionTitle={isAr ? 'تقرير مطابقة القوالب' : 'Template Matching Report'}
      sectionSubtitle={isAr ? 'تحليل مطابقة الأنماط المكانية' : 'Spatial pattern matching analysis'}
    >
      <div className="report-grid-3" style={{ marginBottom: 20 }}>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'القالب' : 'Template'}</div>
          <div className="report-card-value" style={{ fontSize: 16 }}>{templateMatch.templateName}</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'درجة المطابقة' : 'Match Score'}</div>
          <div className="report-card-value">{(templateMatch.matchScore * 100).toFixed(1)}%</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'الثقة' : 'Confidence'}</div>
          <div className="report-card-value">{confidencePct}%</div>
        </div>
      </div>

      <div className="report-card" style={{ marginBottom: 20 }}>
        <div className="report-card-label">{isAr ? 'المساحة المطابقة' : 'Matched Area'}</div>
        <div className="report-card-value">{templateMatch.matchedAreaHa} <small>ha</small></div>
      </div>

      <h3 style={{ fontSize: 14, color: 'var(--report-primary)', marginBottom: 8 }}>
        {isAr ? 'الأنماط المكتشفة' : 'Detected Patterns'}
      </h3>
      <table className="report-table">
        <thead>
          <tr>
            <th>{isAr ? 'النمط' : 'Pattern'}</th>
            <th>{isAr ? 'الدرجة' : 'Score'}</th>
            <th>{isAr ? 'الموقع' : 'Location'}</th>
          </tr>
        </thead>
        <tbody>
          {templateMatch.patterns.map((pattern) => (
            <tr key={pattern.name}>
              <td><strong>{pattern.name}</strong></td>
              <td>{(pattern.score * 100).toFixed(1)}%</td>
              <td>{pattern.location}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTemplate>
  );
}
