import * as XLSX from 'xlsx';
import type { ReportConfig, ReportData } from './types';

export interface ExportExcelOptions {
  filename?: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportReportToExcel(
  data: ReportData,
  config: ReportConfig,
  options: ExportExcelOptions = {},
): Blob {
  const {
    filename = `${data.field.name.replace(/\s+/g, '_')}_GIS_Report.xlsx`,
  } = options;

  const isAr = config.locale === 'ar';
  const wb = XLSX.utils.book_new();

  const fieldRows = [
    [isAr ? 'معلومات الحقل' : 'Field Information', ''],
    [isAr ? 'الاسم' : 'Name', data.field.name],
    [isAr ? 'المعرف' : 'ID', data.field.id],
    [isAr ? 'المساحة (هكتار)' : 'Area (ha)', data.field.areaHa],
    [isAr ? 'المحصول' : 'Crop', data.field.cropType],
    [isAr ? 'تاريخ الزراعة' : 'Planting Date', data.field.plantingDate],
    [isAr ? 'خط العرض' : 'Latitude', data.field.coordinates.lat],
    [isAr ? 'خط الطول' : 'Longitude', data.field.coordinates.lng],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fieldRows), isAr ? 'الحقل' : 'Field');

  const ndviRows = [
    [isAr ? 'مؤشر NDVI' : 'NDVI Index', ''],
    [isAr ? 'القيمة الحالية' : 'Current', data.ndvi.current],
    [isAr ? 'المتوسط' : 'Average', data.ndvi.average],
    [isAr ? 'الحد الأدنى' : 'Min', data.ndvi.min],
    [isAr ? 'الحد الأقصى' : 'Max', data.ndvi.max],
    [isAr ? 'الاتجاه' : 'Trend', data.ndvi.trend],
    [],
    [isAr ? 'التاريخ' : 'Date', isAr ? 'القيمة' : 'Value'],
    ...data.ndvi.history.map((h) => [h.date, h.value]),
    [],
    [isAr ? 'المنطقة' : 'Zone', isAr ? 'المساحة' : 'Area (ha)', 'NDVI', isAr ? 'الحالة' : 'Status'],
    ...data.ndvi.zones.map((z) => [z.label, z.areaHa, z.ndvi, z.status]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ndviRows), 'NDVI');

  const cropRows = [
    [isAr ? 'تقرير المحصول' : 'Crop Report', ''],
    [isAr ? 'درجة الصحة' : 'Health Score', data.crop.healthScore],
    [isAr ? 'مرحلة النمو' : 'Growth Stage', data.crop.growthStage],
    [isAr ? 'الإنتاج المتوقع' : 'Estimated Yield', `${data.crop.estimatedYield.value} ${data.crop.estimatedYield.unit}`],
    [isAr ? 'رطوبة التربة %' : 'Soil Moisture %', data.crop.soilMoisture],
    [isAr ? 'خطر الآفات' : 'Pest Risk', data.crop.pestRisk],
    [],
    [isAr ? 'عامل الإجهاد' : 'Stress Factor', isAr ? 'الشدة' : 'Severity', isAr ? 'الوصف' : 'Description'],
    ...data.crop.stressFactors.map((s) => [s.name, s.severity, s.description]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cropRows), isAr ? 'المحصول' : 'Crop');

  const weatherRows = [
    [isAr ? 'تقرير الطقس' : 'Weather Report', ''],
    [isAr ? 'الحرارة الحالية' : 'Current Temp', `${data.weather.temperature.current}${data.weather.temperature.unit}`],
    [isAr ? 'الحد الأدنى' : 'Min', `${data.weather.temperature.min}${data.weather.temperature.unit}`],
    [isAr ? 'الحد الأقصى' : 'Max', `${data.weather.temperature.max}${data.weather.temperature.unit}`],
    [isAr ? 'الرطوبة %' : 'Humidity %', data.weather.humidity],
    [isAr ? 'سرعة الرياح' : 'Wind Speed', data.weather.windSpeed],
    [isAr ? 'المطر اليومي' : 'Daily Rain', `${data.weather.rainfall.daily} ${data.weather.rainfall.unit}`],
    [],
    [isAr ? 'التاريخ' : 'Date', isAr ? 'الحرارة' : 'Temp', isAr ? 'المطر' : 'Rain', isAr ? 'الحالة' : 'Condition'],
    ...data.weather.forecast.map((f) => [f.date, f.temp, f.rain, f.condition]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(weatherRows), isAr ? 'الطقس' : 'Weather');

  const recRows = [
    [isAr ? 'الأولوية' : 'Priority', isAr ? 'الفئة' : 'Category', isAr ? 'العنوان' : 'Title', isAr ? 'الوصف' : 'Description', isAr ? 'الإجراء' : 'Action'],
    ...data.recommendations.map((r) => [r.priority, r.category, r.title, r.description, r.action]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recRows), isAr ? 'التوصيات' : 'Recommendations');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  downloadBlob(blob, filename);
  return blob;
}
