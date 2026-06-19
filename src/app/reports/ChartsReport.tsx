import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ReportTemplate } from './ReportTemplate';
import type { ReportConfig, ChartSeries } from './types';

interface ChartsReportProps {
  config: ReportConfig;
  charts: ChartSeries[];
  pageNumber: number;
  totalPages: number;
}

const COLORS = ['#1a5f4a', '#2d8a6e', '#e8a838', '#3498db', '#9b59b6'];

function renderChart(series: ChartSeries, index: number) {
  const data = series.data.map((d) => ({ name: d.label, value: d.value }));
  const color = series.color ?? COLORS[index % COLORS.length];

  if (index % 3 === 0) {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (index % 3 === 1) {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ChartsReport({ config, charts, pageNumber, totalPages }: ChartsReportProps) {
  const isAr = config.locale === 'ar';

  return (
    <ReportTemplate
      config={config}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionTitle={isAr ? 'الرسوم البيانية والتحليلات' : 'Charts & Analytics'}
      sectionSubtitle={isAr ? 'اتجاهات البيانات والمؤشرات عبر الزمن' : 'Data trends and temporal indicators'}
    >
      {charts.map((series, i) => (
        <div key={series.name} className="report-chart-wrap">
          <h3 style={{ fontSize: 13, color: 'var(--report-primary)', margin: '0 0 8px' }}>
            {series.name}
          </h3>
          {renderChart(series, i)}
        </div>
      ))}

      {charts.length === 0 && (
        <p style={{ color: 'var(--report-muted)', fontSize: 13 }}>
          {isAr ? 'لا توجد بيانات رسوم بيانية' : 'No chart data available'}
        </p>
      )}
    </ReportTemplate>
  );
}
