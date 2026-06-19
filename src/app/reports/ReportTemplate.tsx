import type { ReactNode } from 'react';
import type { ReportConfig } from './types';
import './reportStyles.css';

const DEFAULT_LOGO = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60">
  <rect width="200" height="60" rx="8" fill="#1a5f4a"/>
  <circle cx="30" cy="30" r="16" fill="#2d8a6e"/>
  <path d="M22 32 L30 18 L38 32 Z" fill="#e8a838"/>
  <text x="56" y="28" fill="white" font-family="Arial" font-size="16" font-weight="bold">AgriGIS</text>
  <text x="56" y="44" fill="#a8d5c2" font-family="Arial" font-size="9">Precision Agriculture</text>
</svg>
`)}`;

interface ReportTemplateProps {
  config: ReportConfig;
  pageNumber: number;
  totalPages: number;
  sectionTitle: string;
  sectionSubtitle?: string;
  children: ReactNode;
  hideHeader?: boolean;
}

export function ReportTemplate({
  config,
  pageNumber,
  totalPages,
  sectionTitle,
  sectionSubtitle,
  children,
  hideHeader = false,
}: ReportTemplateProps) {
  const isAr = config.locale === 'ar';
  const logo = config.logoUrl ?? DEFAULT_LOGO;
  const dateStr = new Date(config.generatedAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={`report-page ${isAr ? 'ar' : 'en'}`} data-report-page={pageNumber}>
      {!hideHeader && (
        <header className="report-header">
          <div className="report-header-logo">
            <img src={logo} alt={config.organization} />
          </div>
          <div className="report-header-meta">
            <div><strong>{config.organization}</strong></div>
            <div>{isAr ? 'تاريخ التقرير' : 'Report Date'}: {dateStr}</div>
            {config.author && <div>{isAr ? 'المُعِد' : 'Prepared by'}: {config.author}</div>}
            <div>{isAr ? 'صفحة' : 'Page'} {pageNumber} / {totalPages}</div>
          </div>
        </header>
      )}

      {sectionTitle && (
        <>
          <h1 className="report-section-title">{sectionTitle}</h1>
          {sectionSubtitle && <p className="report-section-subtitle">{sectionSubtitle}</p>}
        </>
      )}

      <main>{children}</main>

      <footer className="report-footer">
        <span>{config.title}</span>
        <span>{isAr ? 'سري — للاستخدام الداخلي' : 'Confidential — Internal Use'}</span>
        <span>{pageNumber}</span>
      </footer>
    </div>
  );
}

interface CoverPageProps {
  config: ReportConfig;
  fieldName: string;
  fieldMeta: Array<{ label: string; value: string }>;
}

export function CoverPage({ config, fieldName, fieldMeta }: CoverPageProps) {
  const isAr = config.locale === 'ar';
  const logo = config.logoUrl ?? DEFAULT_LOGO;
  const dateStr = new Date(config.generatedAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={`report-page report-cover ${isAr ? 'ar' : 'en'}`} data-report-page="cover">
      <div className="report-cover-top">
        <div className="report-cover-logo">
          <img src={logo} alt={config.organization} />
        </div>
        <h1 className="report-cover-title">{config.title}</h1>
        {config.subtitle && <p className="report-cover-subtitle">{config.subtitle}</p>}
        <div className="report-cover-divider" />
        <div className="report-cover-field">
          <h2>{fieldName}</h2>
          <div className="report-cover-meta">
            {fieldMeta.map((item) => (
              <div key={item.label}>
                <strong>{item.label}:</strong> {item.value}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="report-cover-bottom">
        <div>{config.organization}</div>
        <div>{isAr ? 'تم الإنشاء في' : 'Generated on'} {dateStr}</div>
        {config.author && <div>{isAr ? 'بواسطة' : 'By'} {config.author}</div>}
      </div>
    </div>
  );
}

export { DEFAULT_LOGO };
