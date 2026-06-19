import type { RefObject } from 'react';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface FieldInfo {
  id: string;
  name: string;
  areaHa: number;
  cropType: string;
  plantingDate: string;
  coordinates: Coordinates;
  boundary?: string;
}

export interface WeatherData {
  temperature: { current: number; min: number; max: number; unit: string };
  humidity: number;
  rainfall: { daily: number; weekly: number; monthly: number; unit: string };
  windSpeed: number;
  forecast: Array<{ date: string; temp: number; rain: number; condition: string }>;
  alerts: string[];
}

export interface CropData {
  healthScore: number;
  growthStage: string;
  estimatedYield: { value: number; unit: string; change: number };
  stressFactors: Array<{ name: string; severity: 'low' | 'medium' | 'high'; description: string }>;
  soilMoisture: number;
  pestRisk: 'low' | 'medium' | 'high';
}

export interface NDVIData {
  current: number;
  average: number;
  min: number;
  max: number;
  trend: 'improving' | 'stable' | 'declining';
  history: Array<{ date: string; value: number }>;
  zones: Array<{ label: string; areaHa: number; ndvi: number; status: string }>;
  anomalyDetected: boolean;
}

export interface SatelliteData {
  provider: string;
  acquisitionDate: string;
  resolution: string;
  cloudCover: number;
  bands: string[];
  indices: Array<{ name: string; value: number; status: string }>;
  changeDetection: { period: string; changePercent: number; direction: string };
}

export interface TemplateMatchData {
  templateName: string;
  matchScore: number;
  matchedAreaHa: number;
  confidence: number;
  patterns: Array<{ name: string; score: number; location: string }>;
}

export interface ChartSeries {
  name: string;
  data: Array<{ label: string; value: number }>;
  color?: string;
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  action: string;
}

export interface ReportConfig {
  title: string;
  subtitle?: string;
  organization: string;
  logoUrl?: string;
  locale: 'ar' | 'en';
  generatedAt: string;
  author?: string;
  includeSections: {
    cover: boolean;
    overview: boolean;
    ndvi: boolean;
    crop: boolean;
    weather: boolean;
    satellite: boolean;
    templateMatch: boolean;
    charts: boolean;
    recommendations: boolean;
  };
}

export interface ReportData {
  field: FieldInfo;
  weather: WeatherData;
  crop: CropData;
  ndvi: NDVIData;
  satellite: SatelliteData;
  templateMatch: TemplateMatchData;
  charts: ChartSeries[];
  recommendations: Recommendation[];
  mapScreenshot?: string;
}

export interface ReportEngineProps {
  data: ReportData;
  config: ReportConfig;
  mapRef?: RefObject<HTMLElement | null>;
  onExportStart?: () => void;
  onExportComplete?: (blob: Blob) => void;
  onExportError?: (error: Error) => void;
}
