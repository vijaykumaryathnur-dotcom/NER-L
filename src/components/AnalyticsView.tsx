import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Database,
  Activity,
  Layers,
  Radio,
  Package,
  Truck,
  Calendar,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Vehicle, Shipment } from '../types';
import { getSupabaseClient } from '../lib/supabase';
import { calculateVehicleTelemetryStatus } from '../hooks/useSupabaseData';

interface AnalyticsViewProps {
  vehicles: Vehicle[];
  shipments: Shipment[];
  onRefresh: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  vehicles,
  shipments,
  onRefresh,
}) => {
  const [telemetryCount, setTelemetryCount] = useState<number | null>(null);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);

  const supabase = getSupabaseClient();

  useEffect(() => {
    async function loadTelemetryStats() {
      if (!supabase) {
        setTelemetryCount(0);
        return;
      }
      setLoadingTelemetry(true);
      try {
        const { count, error } = await supabase
          .from('telemetry')
          .select('*', { count: 'exact', head: true });
        if (error) throw error;
        setTelemetryCount(count ?? 0);
      } catch (err) {
        console.error('Failed to load telemetry count:', err);
        setTelemetryCount(0);
      } finally {
        setLoadingTelemetry(false);
      }
    }
    loadTelemetryStats();
  }, [supabase]);

  const hasData = vehicles.length > 0 || shipments.length > 0 || (telemetryCount ?? 0) > 0;

  // Real calculations
  const totalVehicles = vehicles.length;
  const liveCount = vehicles.filter((v) => calculateVehicleTelemetryStatus(v.last_ping) === 'LIVE').length;
  const recentCount = vehicles.filter((v) => calculateVehicleTelemetryStatus(v.last_ping) === 'RECENT').length;
  const offlineCount = vehicles.filter((v) => calculateVehicleTelemetryStatus(v.last_ping) === 'OFFLINE').length;

  const totalShipments = shipments.length;
  const deliveredCount = shipments.filter((s) => s.status === 'Delivered').length;
  const inTransitCount = shipments.filter((s) => s.status === 'In Transit').length;
  const dispatchedCount = shipments.filter((s) => s.status === 'Dispatched').length;
  const pendingCount = shipments.filter((s) => s.status === 'Pending').length;

  return (
    <div className="h-full flex flex-col p-4 lg:p-6 overflow-y-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h1 className="text-base font-bold text-slate-100 uppercase tracking-wide">
              Operational Analytics
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Strict telemetry and consignment metrics computed purely from genuine Supabase database records
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="self-start sm:self-auto px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 rounded-xl border border-slate-800 bg-slate-900/40 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mx-auto">
            <Info className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">Not enough data for analytics yet.</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Zero records currently exist in the database. In accordance with the Real Data architecture, no
              mock charts or simulated percentages are displayed until actual vehicles, shipments, or GPS
              telemetry pings are logged.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                Total Telemetry Records
              </span>
              <div className="text-2xl font-mono font-bold text-slate-100">
                {loadingTelemetry ? '...' : telemetryCount ?? 0}
              </div>
              <span className="text-[11px] text-slate-500">Historical GPS points saved in DB</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                Connected Fleet Size
              </span>
              <div className="text-2xl font-mono font-bold text-slate-100">{totalVehicles}</div>
              <span className="text-[11px] text-emerald-400">{liveCount} vehicles currently live</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                Total Manifests
              </span>
              <div className="text-2xl font-mono font-bold text-slate-100">{totalShipments}</div>
              <span className="text-[11px] text-cyan-400">{inTransitCount} consignments in transit</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                Completed Deliveries
              </span>
              <div className="text-2xl font-mono font-bold text-emerald-400">{deliveredCount}</div>
              <span className="text-[11px] text-slate-500">
                {totalShipments > 0
                  ? `${((deliveredCount / totalShipments) * 100).toFixed(0)}% completion rate`
                  : '0% completed'}
              </span>
            </div>
          </div>

          {/* Breakdown Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Fleet Status Breakdown */}
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-xs uppercase text-slate-200">Fleet Status Distribution</h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{totalVehicles} units</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    <span className="text-slate-200">Live Streaming (&lt; 1 min)</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-400">{liveCount}</span>
                </div>

                <div className="flex justify-between items-center p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                    <span className="text-slate-200">Recent Ping (&lt; 15 mins)</span>
                  </div>
                  <span className="font-mono font-bold text-amber-400">{recentCount}</span>
                </div>

                <div className="flex justify-between items-center p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                    <span className="text-slate-200">Offline / No Signal</span>
                  </div>
                  <span className="font-mono font-bold text-slate-400">{offlineCount}</span>
                </div>
              </div>
            </div>

            {/* Shipment Status Distribution */}
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  <h3 className="font-bold text-xs uppercase text-slate-200">Consignment Pipeline</h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{totalShipments} records</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">Pending Assignment</span>
                  <span className="font-mono font-bold text-slate-400">{pendingCount}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">Dispatched from Hub</span>
                  <span className="font-mono font-bold text-blue-400">{dispatchedCount}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">In Transit (Corridor Active)</span>
                  <span className="font-mono font-bold text-cyan-400">{inTransitCount}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">Successfully Delivered</span>
                  <span className="font-mono font-bold text-emerald-400">{deliveredCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
