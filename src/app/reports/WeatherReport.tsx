import { ReportTemplate } from './ReportTemplate';
import type { ReportConfig, WeatherData } from './types';

interface WeatherReportProps {
  config: ReportConfig;
  weather: WeatherData;
  pageNumber: number;
  totalPages: number;
}

export function WeatherReport({ config, weather, pageNumber, totalPages }: WeatherReportProps) {
  const isAr = config.locale === 'ar';

  return (
    <ReportTemplate
      config={config}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionTitle={isAr ? 'تقرير الطقس' : 'Weather Report'}
      sectionSubtitle={isAr ? 'الظروف الجوية الحالية والتنبؤات' : 'Current conditions and forecast analysis'}
    >
      <div className="report-grid-4" style={{ marginBottom: 20 }}>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'الحرارة الحالية' : 'Current Temp'}</div>
          <div className="report-card-value">{weather.temperature.current}°<small>{weather.temperature.unit}</small></div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'الحد الأدنى / الأقصى' : 'Min / Max'}</div>
          <div className="report-card-value" style={{ fontSize: 16 }}>
            {weather.temperature.min}° / {weather.temperature.max}°
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'الرطوبة' : 'Humidity'}</div>
          <div className="report-card-value">{weather.humidity}%</div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'سرعة الرياح' : 'Wind'}</div>
          <div className="report-card-value">{weather.windSpeed} <small>km/h</small></div>
        </div>
      </div>

      <h3 style={{ fontSize: 14, color: 'var(--report-primary)', marginBottom: 8 }}>
        {isAr ? 'هطول الأمطار' : 'Precipitation'}
      </h3>
      <div className="report-grid-3" style={{ marginBottom: 20 }}>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'يومي' : 'Daily'}</div>
          <div className="report-card-value">{weather.rainfall.daily} <small>{weather.rainfall.unit}</small></div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'أسبوعي' : 'Weekly'}</div>
          <div className="report-card-value">{weather.rainfall.weekly} <small>{weather.rainfall.unit}</small></div>
        </div>
        <div className="report-card">
          <div className="report-card-label">{isAr ? 'شهري' : 'Monthly'}</div>
          <div className="report-card-value">{weather.rainfall.monthly} <small>{weather.rainfall.unit}</small></div>
        </div>
      </div>

      <h3 style={{ fontSize: 14, color: 'var(--report-primary)', marginBottom: 8 }}>
        {isAr ? 'التنبؤ (7 أيام)' : '7-Day Forecast'}
      </h3>
      <table className="report-table">
        <thead>
          <tr>
            <th>{isAr ? 'التاريخ' : 'Date'}</th>
            <th>{isAr ? 'الحرارة' : 'Temp'} (°C)</th>
            <th>{isAr ? 'الأمطار' : 'Rain'} (mm)</th>
            <th>{isAr ? 'الحالة' : 'Condition'}</th>
          </tr>
        </thead>
        <tbody>
          {weather.forecast.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{day.temp}</td>
              <td>{day.rain}</td>
              <td>{day.condition}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {weather.alerts.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, color: 'var(--report-danger)', marginBottom: 8 }}>
            {isAr ? 'تنبيهات جوية' : 'Weather Alerts'}
          </h3>
          {weather.alerts.map((alert, i) => (
            <div key={i} style={{ background: '#fdecea', border: '1px solid #e74c3c', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 12 }}>
              ⚠ {alert}
            </div>
          ))}
        </div>
      )}
    </ReportTemplate>
  );
}
