import React, { useState } from 'react';
import {
  Package,
  Plus,
  Search,
  Truck,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  X,
  Loader2,
  Navigation,
  ArrowRight,
  Info,
  RefreshCw,
} from 'lucide-react';
import { Shipment, ShipmentStatus, Vehicle } from '../types';
import { LeafletMap } from './LeafletMap';
import { getSupabaseClient } from '../lib/supabase';
import { saveLocalShipment } from '../hooks/useSupabaseData';

interface ShipmentsViewProps {
  shipments: Shipment[];
  vehicles: Vehicle[];
  loading: boolean;
  onRefresh: () => void;
  onSelectShipmentRoute?: (shipment: Shipment) => void;
}

export const ShipmentsView: React.FC<ShipmentsViewProps> = ({
  shipments,
  vehicles,
  loading,
  onRefresh,
}) => {
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ShipmentStatus>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Shipment form state
  const [trackingId, setTrackingId] = useState('');
  const [originName, setOriginName] = useState('');
  const [originLat, setOriginLat] = useState<number>(26.1445);
  const [originLng, setOriginLng] = useState<number>(91.7362);
  const [destName, setDestName] = useState('');
  const [destLat, setDestLat] = useState<number>(25.5788);
  const [destLng, setDestLng] = useState<number>(91.8933);
  const [assignedVehicleId, setAssignedVehicleId] = useState<string>('');
  const [cargoDesc, setCargoDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const handleCreateShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingId.trim() || !originName.trim() || !destName.trim()) {
      setSubmitError('Tracking ID, Origin, and Destination are required.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const newShipment: Shipment = {
      id: `ship-${Date.now()}`,
      tracking_id: trackingId.trim().toUpperCase(),
      origin_name: originName.trim(),
      origin_lat: Number(originLat),
      origin_lng: Number(originLng),
      destination_name: destName.trim(),
      destination_lat: Number(destLat),
      destination_lng: Number(destLng),
      status: 'Dispatched',
      assigned_vehicle_id: assignedVehicleId || null,
      estimated_delivery: null,
      cargo_description: cargoDesc.trim() || null,
      created_at: new Date().toISOString(),
    };

    try {
      if (supabase) {
        const { error } = await supabase.from('shipments').insert([
          {
            tracking_id: trackingId.trim().toUpperCase(),
            origin_name: originName.trim(),
            origin_lat: Number(originLat),
            origin_lng: Number(originLng),
            destination_name: destName.trim(),
            destination_lat: Number(destLat),
            destination_lng: Number(destLng),
            status: 'Dispatched',
            assigned_vehicle_id: assignedVehicleId || null,
            cargo_description: cargoDesc.trim() || null,
          },
        ]);

        if (error) {
          console.warn('Supabase shipment insert notice:', error.message);
          saveLocalShipment(newShipment);
        }
      } else {
        saveLocalShipment(newShipment);
      }

      setIsAddModalOpen(false);
      setTrackingId('');
      setOriginName('');
      setDestName('');
      setCargoDesc('');
      onRefresh();
    } catch (err: any) {
      console.warn('Shipment save fallback:', err?.message);
      saveLocalShipment(newShipment);
      setIsAddModalOpen(false);
      setTrackingId('');
      setOriginName('');
      setDestName('');
      setCargoDesc('');
      onRefresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredShipments = shipments.filter((s) => {
    const matchesSearch =
      s.tracking_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.origin_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.destination_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // If a shipment is selected, find assigned vehicle if any
  const assignedVehicle = selectedShipment?.assigned_vehicle_id
    ? vehicles.find((v) => v.id === selectedShipment.assigned_vehicle_id)
    : null;

  return (
    <div className="h-full flex flex-col p-4 lg:p-6 overflow-y-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-cyan-400" />
            <h1 className="text-base font-bold text-slate-100 uppercase tracking-wide">Shipment Operations</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real freight manifests and corridor tracking across North Eastern trade routes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              const genId = `NER-${Math.floor(100000 + Math.random() * 900000)}`;
              setTrackingId(genId);
              setIsAddModalOpen(true);
            }}
            className="px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Shipment Manifest</span>
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
            placeholder="Search tracking ID, origin, destination..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'Pending', 'Dispatched', 'In Transit', 'Delivered'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium uppercase font-mono transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Shipments List & Tracking Drawer */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Shipments Table / Empty State */}
        <div className={`space-y-3 ${selectedShipment ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
          {filteredShipments.length === 0 ? (
            <div className="py-16 px-4 rounded-xl border border-slate-800 bg-slate-900/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mx-auto">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-200">0 Active Shipments</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  No shipment records available in Supabase. Create a real freight consignment to track live
                  corridors and assigned vehicle positions.
                </p>
              </div>
              <button
                onClick={() => {
                  setTrackingId(`NER-${Math.floor(100000 + Math.random() * 900000)}`);
                  setIsAddModalOpen(true);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Create First Manifest
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 font-mono">
                  <tr>
                    <th className="px-4 py-3">Tracking ID</th>
                    <th className="px-4 py-3">Corridor Route</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned Vehicle</th>
                    <th className="px-4 py-3">Estimated Delivery</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredShipments.map((s) => {
                    const isSelected = selectedShipment?.id === s.id;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setSelectedShipment(s)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-cyan-950/40 border-l-2 border-cyan-400' : 'hover:bg-slate-850/50'
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-slate-100">{s.tracking_id}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                            <span>{s.origin_name.split(',')[0]}</span>
                            <ArrowRight className="w-3 h-3 text-slate-500" />
                            <span>{s.destination_name.split(',')[0]}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                              s.status === 'In Transit'
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                : s.status === 'Dispatched'
                                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                : s.status === 'Delivered'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-slate-900 text-slate-400 border border-slate-800'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">
                          {s.assigned_vehicle?.registration_number || (
                            <span className="text-slate-500">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                          {s.estimated_delivery
                            ? new Date(s.estimated_delivery).toLocaleDateString()
                            : 'Standard Corridor'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedShipment(s);
                            }}
                            className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold"
                          >
                            Track Live
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Detail & Live Tracking Panel */}
        {selectedShipment && (
          <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">
                  Tracking Manifest {selectedShipment.tracking_id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedShipment(null)}
                className="text-slate-500 hover:text-slate-300 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Consignment</span>
                  <span className="text-cyan-400 font-mono font-bold">{selectedShipment.status}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Origin</div>
                      <div className="font-medium text-slate-200">{selectedShipment.origin_name}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 pt-1">
                    <MapPin className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Destination</div>
                      <div className="font-medium text-slate-200">{selectedShipment.destination_name}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Assigned Vehicle Telemetry Status */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 font-mono block">
                  Assigned Vehicle Telemetry
                </span>
                {assignedVehicle ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-100">
                        {assignedVehicle.registration_number}
                      </span>
                      <span className="text-[10px] text-slate-400">{assignedVehicle.vehicle_type}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span>Live Speed:</span>
                      <span className="font-mono font-bold text-slate-200">
                        {assignedVehicle.current_speed.toFixed(1)} km/h
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span>Current Position:</span>
                      <span className="font-mono text-emerald-400">
                        {assignedVehicle.current_lat != null && assignedVehicle.current_lng != null
                          ? `${assignedVehicle.current_lat.toFixed(4)}°N, ${assignedVehicle.current_lng.toFixed(4)}°E`
                          : 'Unavailable (No GPS ping)'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-[11px]">
                    No vehicle currently linked to this consignment in database.
                  </div>
                )}
              </div>
            </div>

            {/* Map Preview for this shipment */}
            <div className="h-56 rounded-lg overflow-hidden border border-slate-800">
              <LeafletMap
                origin={{
                  name: selectedShipment.origin_name,
                  lat: selectedShipment.origin_lat,
                  lng: selectedShipment.origin_lng,
                }}
                destination={{
                  name: selectedShipment.destination_name,
                  lat: selectedShipment.destination_lat,
                  lng: selectedShipment.destination_lng,
                }}
                vehicles={assignedVehicle ? [assignedVehicle] : []}
                className="h-full w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* New Shipment Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-sm text-slate-100">Create Shipment Manifest</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateShipment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tracking ID</label>
                <input
                  type="text"
                  required
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  placeholder="e.g. NER-948210"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono uppercase focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Origin City/Hub</label>
                  <input
                    type="text"
                    required
                    value={originName}
                    onChange={(e) => setOriginName(e.target.value)}
                    placeholder="e.g. Guwahati, Assam"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Destination City/Hub</label>
                  <input
                    type="text"
                    required
                    value={destName}
                    onChange={(e) => setDestName(e.target.value)}
                    placeholder="e.g. Shillong, Meghalaya"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Assign Fleet Vehicle</label>
                <select
                  value={assignedVehicleId}
                  onChange={(e) => setAssignedVehicleId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- No vehicle assigned yet --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registration_number} ({v.vehicle_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Cargo Description</label>
                <input
                  type="text"
                  value={cargoDesc}
                  onChange={(e) => setCargoDesc(e.target.value)}
                  placeholder="e.g. Pharmaceuticals & Medical Supplies"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
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
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Save Manifest</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
