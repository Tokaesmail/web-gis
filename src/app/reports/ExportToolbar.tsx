import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportConfig } from './types';

export type ExportFormat = 'pdf' | 'excel';

interface ExportToolbarProps {
  config: ReportConfig;
  sectionCount: number;
  pageCount: number;
  exporting: boolean;
  exportFormat: ExportFormat | null;
  onExport: (format: ExportFormat) => void;
}

export function ExportToolbar({
  config,
  sectionCount,
  pageCount,
  exporting,
  exportFormat,
  onExport,
}: ExportToolbarProps) {
  const isAr = config.locale === 'ar';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const handleSelect = useCallback(
    (format: ExportFormat) => {
      setMenuOpen(false);
      onExport(format);
    },
    [onExport],
  );

  const isBusy = exporting;

  return (
    <div className="report-toolbar" ref={menuRef}>
      <div className="report-toolbar-inner">
        <div className="report-toolbar-actions">
          <div className="report-export-dropdown">
            <button
              type="button"
              className="report-export-btn"
              onClick={() => setMenuOpen((open) => !open)}
              disabled={isBusy}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="report-export-btn-icon" aria-hidden="true">⬇</span>
              {isBusy
                ? exportFormat === 'excel'
                  ? (isAr ? 'جاري تصدير Excel...' : 'Exporting Excel...')
                  : (isAr ? 'جاري تصدير PDF...' : 'Exporting PDF...')
                : (isAr ? 'تصدير التقرير' : 'Export Report')}
              <span className={`report-export-chevron ${menuOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
            </button>

            {menuOpen && (
              <div className="report-export-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="report-export-menu-item"
                  onClick={() => handleSelect('pdf')}
                >
                  <span className="report-export-menu-icon pdf">PDF</span>
                  <span>
                    <strong>{isAr ? 'تصدير PDF' : 'Export PDF'}</strong>
                    <small>{isAr ? 'تقرير متعدد الصفحات مع الخريطة' : 'Multi-page report with map'}</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="report-export-menu-item"
                  onClick={() => handleSelect('excel')}
                >
                  <span className="report-export-menu-icon excel">XLS</span>
                  <span>
                    <strong>{isAr ? 'تصدير Excel' : 'Export Excel'}</strong>
                    <small>{isAr ? 'جداول بيانات لكل قسم' : 'Spreadsheet data for each section'}</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        <span className="report-toolbar-meta">
          {sectionCount} {isAr ? 'أقسام' : 'sections'} · {pageCount} {isAr ? 'صفحات' : 'pages'}
        </span>
      </div>
    </div>
  );
}
