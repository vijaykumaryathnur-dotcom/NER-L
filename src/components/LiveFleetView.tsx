import React, { useState } from 'react';
import {
  Truck,
  Plus,
  Radio,
  Clock,
  WifiOff,
  Search,
  Filter,
  RefreshCw,
  MapPin,
  Compass,
  Gauge,
  X,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Vehicle, VehicleType, VehicleStatus } from '../types';
import { calculateVehicleTelemetryStatus, saveLocalVehicle } from '../hooks/useSupabaseData';
import { getSupabaseClient } from '../lib/supabase';

interface LiveFleetViewProps {
  vehicles: Vehicle[];
  loading: boolean;
  onRefresh: () => void;
  onSelectVehicleForMap?: (vehicle: Vehicle) => void;
}

export const LiveFleetView: React.FC<LiveFleetViewProps> = ({
  vehicles,
  loading,
  onRefresh,
  onSelectVehicleForMap,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'RECENT' | 'OFFLINE'>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form states for creating real vehicle in Supabase
  const [regNumber, setRegNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('Heavy Truck');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNumber.trim()) {
      setSubmitError('Registration number is required.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const newVehicle: Vehicle = {
      id: `veh-${Date.now()}`,
      registration_number: regNumber.trim().toUpperCase(),
      vehicle_type: vehicleType,
      assigned_driver_id: null,
      status: 'active',
      current_lat: null,
      current_lng: null,
      current_speed: 0,
      current_heading: 0,
      current_accuracy: null,
      last_ping: null,
      created_at: new Date().toISOString(),
    };

    try {
      if (supabase) {
        const { error } = await supabase.from('vehicles').insert([
          {
            registration_number: regNumber.trim().toUpperCase(),
            vehicle_type: vehicleType,
            status: 'active',
            current_speed: 0,
            current_heading: 0,
          },
        ]);

        if (error) {
          console.warn('Supabase vehicle insert notice:', error.message);
          // Save locally if schema table is not yet created
          saveLocalVehicle(newVehicle);
        }
      } else {
        saveLocalVehicle(newVehicle);
      }

      setIsAddModalOpen(false);
      setRegNumber('');
      onRefresh();
    } catch (err: any) {
      console.warn('Vehicle save fallback:', err?.message);
      saveLocalVehicle(newVehicle);
      setIsAddModalOpen(false);
      setRegNumber('');
      onRefresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredVehicles = vehicles.filter((v) => {
    const teleStatus = calculateVehicleTelemetryStatus(v.last_ping);
    const matchesSearch =
      v.registration_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.vehicle_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.driver_name && v.driver_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || teleStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="h-full flex flex-col p-4 lg:p-6 overflow-y-auto space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-400" />
            <h1 className="text-base font-bold text-slate-100 uppercase tracking-wide">Live Fleet Management</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Active carrier units operating across North Eastern state corridors
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Register Vehicle</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter by registration or vehicle type..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'LIVE', 'RECENT', 'OFFLINE'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono uppercase transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Vehicles Table / Empty State */}
      {filteredVehicles.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-slate-800 bg-slate-900/40 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600">
            <WifiOff className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">0 Vehicles Connected</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              No live vehicle telemetry is currently being received. Register a vehicle unit or transmit live
              GPS from a physical smartphone on the Driver Portal.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mt-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Register First Vehicle
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 font-mono">
                <tr>
                  <th className="px-4 py-3">Registration</th>
                  <th className="px-4 py-3">Vehicle Type</th>
                  <th className="px-4 py-3">Telemetry Status</th>
                  <th className="px-4 py-3">Speed</th>
                  <th className="px-4 py-3">Heading</th>
                  <th className="px-4 py-3">Last Ping</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3 text-right">Coordinates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredVehicles.map((vehicle) => {
                  const teleStatus = calculateVehicleTelemetryStatus(vehicle.last_ping);

                  return (
                    <tr key={vehicle.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-100">
                        {vehicle.registration_number}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{vehicle.vehicle_type}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                            teleStatus === 'LIVE'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : teleStatus === 'RECENT'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-slate-900 text-slate-500 border border-slate-800'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              teleStatus === 'LIVE'
                                ? 'bg-emerald-400 animate-pulse'
                                : teleStatus === 'RECENT'
                                ? 'bg-amber-400'
                                : 'bg-slate-600'
                            }`}
                          />
                          {teleStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-200">
                        {vehicle.current_speed.toFixed(1)} km/h
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">{vehicle.current_heading}°</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                        {vehicle.last_ping ? new Date(vehicle.last_ping).toLocaleTimeString() : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{vehicle.driver_name || 'Unassigned'}</td>
                      <td className="px-4 py-3 text-right font-mono text-[11px] text-slate-400">
                        {vehicle.current_lat != null && vehicle.current_lng != null ? (
                          <span className="text-emerald-400">
                            {vehicle.current_lat.toFixed(4)}°N, {vehicle.current_lng.toFixed(4)}°E
                          </span>
                        ) : (
                          <span className="text-slate-600">Unavailable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Register Vehicle Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-slate-100">Register Vehicle Unit</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateVehicle} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Registration Plate Number
                </label>
                <input
                  type="text"
                  required
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value)}
                  placeholder="e.g. AS-01-EC-4492"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Vehicle Category</label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Heavy Truck">Heavy Truck (Multi-Axle)</option>
                  <option value="Medium Carrier">Medium Carrier (14ft / 19ft)</option>
                  <option value="Refrigerated Van">Refrigerated Van (Cold Chain)</option>
                  <option value="Light Commercial">Light Commercial Vehicle (LCV)</option>
                  <option value="4x4 Hill Runner">4x4 Hill Runner (Terrain Optimized)</option>
                </select>
              </div>

              {submitError && (
                <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-xs text-rose-300">
                  {submitError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Save to Supabase</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
