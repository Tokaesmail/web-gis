'use client';

import { useEffect } from 'react';
import { ReportTemplate } from './ReportTemplate';
import type { ReportConfig } from './types';
import type { PanelValue } from './panelExport';

interface PanelReportPageProps {
  config: ReportConfig;
  sectionTitle: string;
  sectionSubtitle?: string;
  panelScreenshot: string;
  mapScreenshot?: string;
  values: PanelValue[];
  onReady?: () => void;
}

export function PanelReportPage({
  config,
  sectionTitle,
  sectionSubtitle,
  panelScreenshot,
  mapScreenshot,
  values,
  onReady,
}: PanelReportPageProps) {
  const isAr = config.locale === 'ar';

  useEffect(() => {
    const imgs = document.querySelectorAll('[data-panel-report] img');
    if (imgs.length === 0) {
      onReady?.();
      return;
    }
    let loaded = 0;
    const check = () => {
      loaded += 1;
      if (loaded >= imgs.length) onReady?.();
    };
    imgs.forEach((img) => {
      const el = img as HTMLImageElement;
      if (el.complete) check();
      else {
        el.onload = check;
        el.onerror = check;
      }
    });
  }, [panelScreenshot, mapScreenshot, onReady]);

  return (
    <div className={`report-root ${isAr ? 'ar' : 'en'}`} data-panel-report>
      <ReportTemplate
        config={config}
        pageNumber={1}
        totalPages={1}
        sectionTitle={sectionTitle}
        sectionSubtitle={sectionSubtitle}
      >
        {mapScreenshot && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, color: 'var(--report-primary)', marginBottom: 8 }}>
              {isAr ? 'لقطة الخريطة' : 'Map Snapshot'}
            </h3>
            <div className="report-map-container">
              <img src={mapScreenshot} alt="Map" style={{ width: '100%', borderRadius: 8 }} />
            </div>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, color: 'var(--report-primary)', marginBottom: 8 }}>
            {isAr ? 'لقطة شاشة التحليل' : 'Analysis Panel Snapshot'}
          </h3>
          <div
            style={{
              border: '1px solid var(--report-border)',
              borderRadius: 10,
              overflow: 'hidden',
              background: '#070f1e',
            }}
          >
            <img src={panelScreenshot} alt="Panel" style={{ width: '100%', display: 'block' }} />
          </div>
        </div>

        {values.length > 0 && (
          <div>
            <h3 style={{ fontSize: 13, color: 'var(--report-primary)', marginBottom: 8 }}>
              {isAr ? 'القيم المعروضة في الواجهة' : 'Values from UI'}
            </h3>
            <table className="report-table">
              <thead>
                <tr>
                  <th>{isAr ? 'البند' : 'Field'}</th>
                  <th>{isAr ? 'القيمة' : 'Value'}</th>
                </tr>
              </thead>
              <tbody>
                {values.map((row, i) => (
                  <tr key={`${row.label}-${i}`}>
                    <td>{row.label}</td>
                    <td><strong>{row.value}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportTemplate>
    </div>
  );
}
