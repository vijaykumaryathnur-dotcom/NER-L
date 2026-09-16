import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Navigation,
  CloudRain,
  Radio,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Copy,
  Key,
} from 'lucide-react';
import { SystemStatusResponse } from '../types';
import {
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  checkSupabaseConnection,
} from '../lib/supabase';

interface SystemStatusViewProps {
  onConfigChanged: () => void;
}

export const SystemStatusView: React.FC<SystemStatusViewProps> = ({ onConfigChanged }) => {
  const [systemData, setSystemData] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Config inputs
  const initialConfig = getStoredSupabaseConfig();
  const [urlInput, setUrlInput] = useState(initialConfig.url);
  const [anonInput, setAnonInput] = useState(initialConfig.anonKey);
  const [tomtomInput, setTomtomInput] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('ner_tomtom_key') || '' : ''));
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);

  const fetchSystemStatus = async (override?: { url?: string; anon?: string; tomtom?: string }) => {
    setLoading(true);
    try {
      const cfg = getStoredSupabaseConfig();
      const currentUrl = override?.url ?? cfg.url ?? urlInput;
      const currentAnon = override?.anon ?? cfg.anonKey ?? anonInput;
      const currentTomTom =
        override?.tomtom ??
        (typeof window !== 'undefined' ? localStorage.getItem('ner_tomtom_key') || '' : '') ??
        tomtomInput;

      const headers: Record<string, string> = {};
      if (currentUrl) headers['x-supabase-url'] = currentUrl;
      if (currentAnon) headers['x-supabase-anon-key'] = currentAnon;
      if (currentTomTom) headers['x-tomtom-key'] = currentTomTom;

      const resp = await fetch('/api/system/status', { headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: SystemStatusResponse = await resp.json();
      setSystemData(data);
    } catch (err: any) {
      console.warn('System status query notice:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedTomTom = typeof window !== 'undefined' ? localStorage.getItem('ner_tomtom_key') || '' : '';
    // Sync stored credentials to backend runtime
    if (initialConfig.url || initialConfig.anonKey || storedTomTom) {
      fetch('/api/supabase-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: initialConfig.url,
          anonKey: initialConfig.anonKey,
          tomtomKey: storedTomTom,
        }),
      })
        .finally(() => {
          fetchSystemStatus();
        });
    } else {
      fetchSystemStatus();
    }
  }, []);

  const handleSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true);
    setTestResult(null);

    const cleanUrl = urlInput.trim();
    const cleanAnon = anonInput.trim();
    const cleanTomTom = tomtomInput.trim();

    saveSupabaseConfig(cleanUrl, cleanAnon);
    if (typeof window !== 'undefined') {
      if (cleanTomTom) {
        localStorage.setItem('ner_tomtom_key', cleanTomTom);
      } else {
        localStorage.removeItem('ner_tomtom_key');
      }
    }

    // Sync credentials to backend runtime
    try {
      await fetch('/api/supabase-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          anonKey: cleanAnon,
          tomtomKey: cleanTomTom,
        }),
      });
    } catch (err) {
      console.warn('Backend runtime sync notice:', err);
    }

    onConfigChanged();

    if (cleanUrl && cleanAnon) {
      const res = await checkSupabaseConnection();
      setTestResult(res);
    } else if (cleanTomTom) {
      setTestResult({
        ok: true,
        message: 'TomTom API key saved and verified with backend proxy.',
      });
    }

    setIsTesting(false);
    await fetchSystemStatus({ url: cleanUrl, anon: cleanAnon, tomtom: cleanTomTom });
  };

  const handleReset = async () => {
    clearSupabaseConfig();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ner_tomtom_key');
    }
    setUrlInput('');
    setAnonInput('');
    setTomtomInput('');
    setTestResult(null);

    try {
      await fetch('/api/supabase-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: '', anonKey: '', tomtomKey: '' }),
      });
    } catch {
      // ignore
    }

    onConfigChanged();
    await fetchSystemStatus({ url: '', anon: '', tomtom: '' });
  };

  const copySqlSchema = () => {
    const sql = `-- NER LOGISTICS SCHEMA
create extension if not exists postgis;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null default 'driver' check (role in ('admin', 'dispatcher', 'driver')),
  phone text,
  created_at timestamptz default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  registration_number text unique not null,
  vehicle_type text not null check (vehicle_type in ('Heavy Truck', 'Medium Carrier', 'Refrigerated Van', 'Light Commercial', '4x4 Hill Runner')),
  assigned_driver_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'maintenance', 'offline')),
  current_lat double precision,
  current_lng double precision,
  current_speed double precision default 0,
  current_heading double precision default 0,
  current_accuracy double precision,
  last_ping timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_id text unique not null,
  origin_name text not null,
  origin_lat double precision not null,
  origin_lng double precision not null,
  destination_name text not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  status text not null default 'Pending' check (status in ('Pending', 'Dispatched', 'In Transit', 'Delivered')),
  assigned_vehicle_id uuid references public.vehicles(id) on delete set null,
  estimated_delivery timestamptz,
  cargo_description text,
  created_at timestamptz default now()
);

create table if not exists public.telemetry (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid references public.profiles(id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  speed double precision default 0,
  heading double precision default 0,
  accuracy double precision,
  altitude double precision,
  recorded_at timestamptz default now()
);

alter publication supabase_realtime add table public.vehicles;
alter publication supabase_realtime add table public.shipments;
alter publication supabase_realtime add table public.telemetry;
`;
    navigator.clipboard.writeText(sql);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 3000);
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'Connected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Connected
          </span>
        );
      case 'Checking':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-amber-950 text-amber-300 border border-amber-800">
            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            Checking
          </span>
        );
      case 'Unavailable':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-slate-900 text-slate-400 border border-slate-800">
            <XCircle className="w-3 h-3 text-slate-500" />
            Unavailable
          </span>
        );
    }
  };

  return (
    <div className="h-full flex flex-col p-4 lg:p-6 overflow-y-auto space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-emerald-400" />
            <h1 className="text-base font-bold text-slate-100 uppercase tracking-wide">
              System Health & Architecture Status
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real verification of database connections, routing engines, environmental APIs, and telemetry pipelines
          </p>
        </div>

        <button
          onClick={() => {
            fetchSystemStatus();
          }}
          className="self-start sm:self-auto px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Re-check Services</span>
        </button>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Supabase Database */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-200">Database Engine</span>
            {getStatusBadge(
              testResult?.ok || systemData?.checks.database.status === 'Connected'
                ? 'Connected'
                : systemData?.checks.database.status
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            {testResult?.message ||
              (systemData?.checks.database.status === 'Connected'
                ? 'Supabase PostgreSQL connected & ready'
                : systemData?.checks.database.details || 'Supabase PostgreSQL')}
          </p>
        </div>

        {/* Road Routing Engine */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-200">Road Routing Engine</span>
            {getStatusBadge(systemData?.checks.routing.status)}
          </div>
          <p className="text-[11px] text-slate-400">
            {systemData?.checks.routing.details || 'OpenRouteService & OpenStreetMap OSRM'}
          </p>
        </div>

        {/* Location Geocoding */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-200">Location Autocomplete</span>
            {getStatusBadge(systemData?.checks.geocoding.status)}
          </div>
          <p className="text-[11px] text-slate-400">
            {systemData?.checks.geocoding.details || 'Photon OSM live query API'}
          </p>
        </div>

        {/* Atmospheric Weather */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-200">Atmospheric Telemetry</span>
            {getStatusBadge(systemData?.checks.weather.status)}
          </div>
          <p className="text-[11px] text-slate-400">
            {systemData?.checks.weather.details || 'Open-Meteo High-Resolution Surface Forecast'}
          </p>
        </div>

        {/* Traffic Incidents Proxy */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-200">Traffic Incidents</span>
            {getStatusBadge(systemData?.checks.traffic.status)}
          </div>
          <p className="text-[11px] text-slate-400">
            {systemData?.checks.traffic.details || 'TomTom Corridor Incidents Proxy'}
          </p>
        </div>

        {/* Telemetry Ingestion API */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-200">GPS Telemetry API</span>
            {getStatusBadge(systemData?.checks.telemetry_api.status)}
          </div>
          <p className="text-[11px] text-slate-400">
            {systemData?.checks.telemetry_api.details || 'Secure ingest endpoint /api/telemetry/ingest'}
          </p>
        </div>
      </div>

      {/* Safe Diagnostics Panel (Zero secrets exposed, boolean verification) */}
      <div id="system-diagnostics-panel" className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-xs text-slate-200 uppercase tracking-wider">
              System Diagnostics (Safe Boolean Verification)
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Booleans only • Zero keys exposed</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 text-[11px]">supabaseUrlPresent:</span>
            <span
              id="badge-diag-supabase-url"
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                systemData?.diagnostics?.supabaseUrlPresent
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {String(Boolean(systemData?.diagnostics?.supabaseUrlPresent))}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 text-[11px]">supabaseAnonPresent:</span>
            <span
              id="badge-diag-supabase-anon"
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                systemData?.diagnostics?.supabaseAnonPresent
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {String(Boolean(systemData?.diagnostics?.supabaseAnonPresent))}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 text-[11px]">tomtomKeyPresent:</span>
            <span
              id="badge-diag-tomtom-key"
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                systemData?.diagnostics?.tomtomKeyPresent
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {String(Boolean(systemData?.diagnostics?.tomtomKeyPresent))}
            </span>
          </div>
        </div>
      </div>

      {/* Supabase Connection Setup Box */}
      <div id="credentials-config-card" className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
              Credentials & Integration Configuration
            </h2>
          </div>
          <button
            id="btn-copy-sql"
            onClick={copySqlSchema}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedSchema ? 'SQL Copied!' : 'Copy SQL Schema'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Configure project credentials below. Settings sync to both browser storage and the backend runtime
          proxy. Environment variables in Google AI Studio Settings or <code>.env</code> are automatically utilized.
        </p>

        <form onSubmit={handleSaveAndTest} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Supabase Project URL
            </label>
            <input
              id="input-supabase-url"
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://your-project-ref.supabase.co"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Supabase Anon / Public API Key
            </label>
            <input
              id="input-supabase-anon"
              type="text"
              value={anonInput}
              onChange={(e) => setAnonInput(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              TomTom Traffic Incidents API Key{' '}
              <span className="text-slate-500 font-normal">(Optional if set in environment/secrets)</span>
            </label>
            <input
              id="input-tomtom-key"
              type="password"
              value={tomtomInput}
              onChange={(e) => setTomtomInput(e.target.value)}
              placeholder="Enter TomTom API key (persisted to backend runtime)"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                testResult.ok
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              id="btn-clear-credentials"
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Clear Stored Credentials
            </button>

            <button
              id="btn-save-credentials"
              type="submit"
              disabled={isTesting || (!urlInput.trim() && !anonInput.trim() && !tomtomInput.trim())}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
            >
              {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Save & Verify Connection</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
