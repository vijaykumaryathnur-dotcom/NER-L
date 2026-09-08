import React, { useState } from 'react';
import {
  Truck,
  Package,
  Activity,
  AlertCircle,
  ShieldCheck,
  Radio,
  Clock,
  ArrowUpRight,
  ChevronRight,
  WifiOff,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import { Vehicle, Shipment, NavigationTab } from '../types';
import { LeafletMap } from './LeafletMap';
import { calculateVehicleTelemetryStatus } from '../hooks/useSupabaseData';

interface DashboardViewProps {
  vehicles: Vehicle[];
  shipments: Shipment[];
  loading: boolean;
  realtimeStatus: 'SUBSCRIBED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR' | 'UNCONFIGURED';
  metrics: {
    totalVehicles: number;
    liveVehicles: number;
    recentVehicles: number;
    offlineVehicles: number;
    totalShipments: number;
    activeShipments: number;
    pendingShipments: number;
    deliveredShipments: number;
    delayedShipments: number;
    routeAlerts: number;
  };
  onSelectTab: (tab: NavigationTab) => void;
  onRefresh: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  vehicles,
  shipments,
  loading,
  realtimeStatus,
  metrics,
  onSelectTab,
  onRefresh,
}) => {
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Filter real vehicles with valid coordinates
  const mappedVehicles = vehicles.filter((v) => v.current_lat != null && v.current_lng != null);

  // Filter active live vehicles
  const liveVehiclesList = vehicles.filter(
    (v) => calculateVehicleTelemetryStatus(v.last_ping) === 'LIVE'
  );

  return (
    <div className="h-full flex flex-col gap-4 p-4 lg:p-6 overflow-y-auto lg:overflow-hidden">
      {/* Top Operational KPI Cards (Strict Real Data, 0 if Empty) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Fleet */}
        <div
          onClick={() => onSelectTab('fleet')}
          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-sm hover:border-slate-700 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Fleet</span>
            <Truck className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-slate-100">{metrics.totalVehicles}</span>
            <span className="text-[10px] text-slate-500 font-mono">registered</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {metrics.totalVehicles === 0 ? '0 registered in DB' : `${metrics.offlineVehicles} offline`}
          </div>
        </div>

        {/* Live Active Telemetry */}
        <div
          onClick={() => onSelectTab('fleet')}
          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-sm hover:border-emerald-500/30 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Live Vehicles</span>
            <Radio
              className={`w-4 h-4 ${
                metrics.liveVehicles > 0 ? 'text-emerald-400 animate-pulse' : 'text-slate-600'
              }`}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-emerald-400">{metrics.liveVehicles}</span>
            <span className="text-[10px] text-emerald-500/80 font-mono">&lt; 1m ping</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {metrics.liveVehicles === 0 ? 'No live telemetry' : `${metrics.recentVehicles} recent`}
          </div>
        </div>

        {/* Active Shipments */}
        <div
          onClick={() => onSelectTab('shipments')}
          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-sm hover:border-slate-700 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Active Shipments</span>
            <Package className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-slate-100">{metrics.activeShipments}</span>
            <span className="text-[10px] text-slate-500 font-mono">in transit</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {metrics.totalShipments === 0 ? '0 shipments logged' : `${metrics.pendingShipments} pending`}
          </div>
        </div>

        {/* Delayed Shipments */}
        <div
          onClick={() => onSelectTab('shipments')}
          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-sm hover:border-amber-500/30 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Delayed Shipments</span>
            <Clock className="w-4 h-4 text-amber-500/70" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-black font-mono ${
                metrics.delayedShipments > 0 ? 'text-amber-400' : 'text-slate-100'
              }`}
            >
              {metrics.delayedShipments}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">past ETA</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {metrics.delayedShipments === 0 ? '0 overdue consignments' : 'Attention required'}
          </div>
        </div>

        {/* Route Alerts */}
        <div
          onClick={() => onSelectTab('routes')}
          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-sm hover:border-slate-700 transition-colors cursor-pointer group col-span-2 md:col-span-1"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Route Alerts</span>
            <AlertCircle className="w-4 h-4 text-slate-500 group-hover:text-rose-400 transition-colors" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-slate-100">{metrics.routeAlerts}</span>
            <span className="text-[10px] text-slate-500 font-mono">active</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {metrics.routeAlerts === 0 ? 'No active route alerts' : 'Critical corridor notices'}
          </div>
        </div>
      </div>

      {/* Main Command Center Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[500px]">
        {/* Interactive Map (Large Visual Element) */}
        <div className="lg:col-span-8 flex flex-col h-[480px] lg:h-full rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden relative">
          {/* Map Sub-Header Bar */}
          <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto bg-slate-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-xs shadow-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="font-semibold text-slate-200">North East Regional Corridor Map</span>
              <span className="text-[10px] font-mono text-slate-400">|</span>
              <span className="text-[10px] font-mono text-slate-400">
                {mappedVehicles.length} vehicles with GPS coords
              </span>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={onRefresh}
                className="p-1.5 rounded-lg bg-slate-950/90 backdrop-blur border border-slate-800 text-slate-300 hover:text-white shadow hover:bg-slate-900 transition-colors"
                title="Refresh database records"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <LeafletMap
            vehicles={mappedVehicles}
            selectedVehicleId={selectedVehicle?.id}
            onSelectVehicle={(v) => setSelectedVehicle(v)}
            className="h-full w-full"
          />

          {/* Empty State Banner if 0 vehicles on map */}
          {mappedVehicles.length === 0 && (
            <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
              <div className="p-3 rounded-lg bg-slate-950/90 backdrop-blur border border-slate-800/90 text-xs text-slate-400 flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-slate-500" />
                  <span>
                    <strong>0 Vehicles Connected:</strong> No live vehicle telemetry is currently being received.
                  </span>
                </div>
                <button
                  onClick={() => onSelectTab('driver')}
                  className="pointer-events-auto text-emerald-400 hover:underline font-medium text-[11px]"
                >
                  Open Driver Portal &rarr;
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Operational Side Panels */}
        <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto">
          {/* Live Fleet Section */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Live Fleet</h3>
              </div>
              <button
                onClick={() => onSelectTab('fleet')}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {liveVehiclesList.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-400">No live vehicles</p>
                <p className="text-[11px] text-slate-500">
                  Vehicles stream here when drivers activate GPS transmission on /driver
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {liveVehiclesList.map((veh) => (
                  <div
                    key={veh.id}
                    onClick={() => setSelectedVehicle(veh)}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-500/40 text-xs flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="font-bold text-slate-200 font-mono">{veh.registration_number}</div>
                      <div className="text-[10px] text-slate-400">{veh.vehicle_type}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400">{veh.current_speed.toFixed(0)} km/h</div>
                      <div className="text-[9px] font-mono text-slate-500">&lt; 1m ago</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Shipments Section */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Recent Shipments</h3>
              </div>
              <button
                onClick={() => onSelectTab('shipments')}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
              >
                <span>Manage</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {shipments.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-400">No shipment data available</p>
                <p className="text-[11px] text-slate-500">
                  Consignments recorded in Supabase will show live statuses and corridors.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {shipments.slice(0, 4).map((shipment) => (
                  <div
                    key={shipment.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-200">{shipment.tracking_id}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                          shipment.status === 'In Transit'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : shipment.status === 'Delivered'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {shipment.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span>{shipment.origin_name.split(',')[0]}</span>
                      <span>&rarr;</span>
                      <span>{shipment.destination_name.split(',')[0]}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Route Alerts Section */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Route Alerts</h3>
              </div>
              <button
                onClick={() => onSelectTab('routes')}
                className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-0.5"
              >
                <span>Plan Corridor</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="py-5 text-center text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-400">No active route alerts</p>
              <p className="text-[11px] text-slate-500">
                Corridor analysis runs in the Route Planner using real atmospheric & traffic APIs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
