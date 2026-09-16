export type VehicleType =
  | 'Heavy Truck'
  | 'Medium Carrier'
  | 'Refrigerated Van'
  | 'Light Commercial'
  | '4x4 Hill Runner';

export type VehicleStatus = 'active' | 'maintenance' | 'offline';
export type TelemetryStatus = 'LIVE' | 'RECENT' | 'OFFLINE';

export interface Vehicle {
  id: string;
  registration_number: string;
  vehicle_type: VehicleType;
  assigned_driver_id: string | null;
  driver_name?: string | null;
  status: VehicleStatus;
  current_lat: number | null;
  current_lng: number | null;
  current_speed: number;
  current_heading: number;
  current_accuracy: number | null;
  last_ping: string | null;
  created_at: string;
}

export type ShipmentStatus = 'Pending' | 'Dispatched' | 'In Transit' | 'Delivered';

export interface Shipment {
  id: string;
  tracking_id: string;
  origin_name: string;
  origin_lat: number;
  origin_lng: number;
  destination_name: string;
  destination_lat: number;
  destination_lng: number;
  status: ShipmentStatus;
  assigned_vehicle_id: string | null;
  assigned_vehicle?: Vehicle | null;
  estimated_delivery: string | null;
  cargo_description: string | null;
  created_at: string;
}

export interface TelemetryRecord {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  accuracy: number | null;
  altitude: number | null;
  recorded_at: string;
}

export interface LocationSuggestion {
  id: string;
  name: string;
  label: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
}

export interface RouteGeometry {
  engine: string;
  coordinates: [number, number][]; // [lat, lng]
  distanceKm: number;
  durationMins: number;
  bbox: number[] | null;
}

export interface WeatherPoint {
  label: string;
  lat: number;
  lng: number;
  available: boolean;
  temperatureC?: number;
  humidity?: number;
  precipitationMm?: number;
  windSpeedKmh?: number;
  weatherCode?: number;
  condition?: string;
  source?: string;
  lastUpdated?: string;
  error?: string;
}

export interface TrafficIncident {
  id: string;
  lat: number;
  lng: number;
  type: string;
  magnitudeOfDelay: number;
  description: string;
  delaySeconds: number;
  distanceToRouteKm: number;
  relevance: 'Route Impacted' | 'Regional Context' | 'Unable to Verify';
  startTime?: string;
  from?: string;
  to?: string;
}

export type RouteSafetyLevel = 'OPTIMAL' | 'CAUTION' | 'HIGH ATTENTION' | 'INSUFFICIENT_DATA';

export interface RouteSafetyAssessment {
  level: RouteSafetyLevel;
  headline: string;
  reasons: string[];
  lastAssessed: string;
}

export interface SystemStatusCheck {
  status: 'Connected' | 'Unavailable' | 'Checking';
  details: string;
}

export interface SystemDiagnostics {
  supabaseUrlPresent: boolean;
  supabaseAnonPresent: boolean;
  tomtomKeyPresent: boolean;
  openRouteServiceKeyPresent?: boolean;
}

export interface SystemStatusResponse {
  timestamp: string;
  checks: {
    database: SystemStatusCheck;
    routing: SystemStatusCheck;
    geocoding: SystemStatusCheck;
    weather: SystemStatusCheck;
    traffic: SystemStatusCheck;
    telemetry_api: SystemStatusCheck;
    realtime: SystemStatusCheck;
  };
  diagnostics?: SystemDiagnostics;
}

export type UserRole = 'admin' | 'dispatcher' | 'driver';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
}

export type NavigationTab =
  | 'dashboard'
  | 'routes'
  | 'fleet'
  | 'shipments'
  | 'analytics'
  | 'driver'
  | 'status';
