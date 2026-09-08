import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  Navigation,
  Radio,
  Play,
  Square,
  AlertCircle,
  ShieldCheck,
  Compass,
  Gauge,
  MapPin,
  Clock,
  CheckCircle2,
  Loader2,
  Lock,
} from 'lucide-react';
import { Vehicle } from '../types';
import { getSupabaseClient } from '../lib/supabase';

interface DriverPortalViewProps {
  vehicles: Vehicle[];
  onRefresh: () => void;
}

export const DriverPortalView: React.FC<DriverPortalViewProps> = ({ vehicles, onRefresh }) => {
  // Selected or assigned vehicle
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

  // GPS & Tracking states
  const [isTracking, setIsTracking] = useState(false);
  const [gpsPermission, setGpsPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [lastReadingTime, setLastReadingTime] = useState<string | null>(null);

  // Real device readings
  const [coords, setCoords] = useState<{
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    speed: number | null; // m/s from browser
    heading: number | null;
    altitude: number | null;
  }>({
    latitude: null,
    longitude: null,
    accuracy: null,
    speed: null,
    heading: null,
    altitude: null,
  });

  const [transmittedPingsCount, setTransmittedPingsCount] = useState(0);
  const [lastTransmissionStatus, setLastTransmissionStatus] = useState<string | null>(null);
  const [transmissionError, setTransmissionError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastSendTimeRef = useRef<number>(0);

  // Check initial permission status if available
  useEffect(() => {
    if ('permissions' in navigator && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((result) => {
          setGpsPermission(result.state as any);
          result.onchange = () => {
            setGpsPermission(result.state as any);
          };
        })
        .catch(() => {
          // Ignore if permission query not supported
        });
    }
  }, []);

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  // Send genuine GPS telemetry to secure ingest endpoint
  const transmitTelemetry = async (position: GeolocationPosition, vehicleId: string) => {
    const now = Date.now();
    // Throttle to at most 1 ping every 3 seconds to avoid flooding network
    if (now - lastSendTimeRef.current < 3000) return;
    lastSendTimeRef.current = now;

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const speedKmh = position.coords.speed != null ? position.coords.speed * 3.6 : 0;
    const heading = position.coords.heading ?? 0;
    const accuracy = position.coords.accuracy;
    const altitude = position.coords.altitude;

    try {
      const resp = await fetch('/api/telemetry/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_id: vehicleId,
          latitude: lat,
          longitude: lng,
          speed: Number(speedKmh.toFixed(1)),
          heading: Math.round(heading),
          accuracy: accuracy != null ? Number(accuracy.toFixed(1)) : null,
          altitude: altitude != null ? Number(altitude.toFixed(1)) : null,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.message || data.error || `HTTP ${resp.status}`);
      }

      setTransmittedPingsCount((prev) => prev + 1);
      setLastTransmissionStatus(`Live ping sent at ${new Date().toLocaleTimeString()}`);
      setTransmissionError(null);
      // Trigger background refresh so dashboard updates immediately
      onRefresh();
    } catch (err: any) {
      console.warn('Telemetry transmission notice:', err.message);
      setTransmissionError(err.message || 'Telemetry send notice');
    }
  };

  const handleStartTracking = () => {
    if (!selectedVehicleId) return;

    if (!('geolocation' in navigator)) {
      setTransmissionError('Geolocation is not supported by this browser environment');
      return;
    }

    setTransmissionError(null);
    setIsTracking(true);

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsPermission('granted');
        const readingTime = new Date().toLocaleTimeString();
        setLastReadingTime(readingTime);

        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : 0, // convert m/s to km/h
          heading: pos.coords.heading,
          altitude: pos.coords.altitude,
        });

        // Transmit genuine coordinate reading
        transmitTelemetry(pos, selectedVehicleId);
      },
      (err) => {
        console.error('GPS error:', err);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsPermission('denied');
          setTransmissionError('Location permission was denied. Please allow GPS access in browser.');
        } else {
          setTransmissionError(`GPS error: ${err.message}`);
        }
        setIsTracking(false);
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    watchIdRef.current = id;
  };

  const handleStopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setLastTransmissionStatus('Tracking stopped by driver');
  };

  return (
    <div className="h-full max-w-lg mx-auto p-4 lg:p-6 overflow-y-auto space-y-4">
      {/* Mobile-First Header */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <h1 className="font-bold text-sm uppercase tracking-wide text-slate-100">Driver Telemetry Portal</h1>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
            GPS v2
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-snug">
          Authenticated driver console. Transmits genuine physical GPS coordinates from this device directly
          to the NER Dispatch Command Center.
        </p>
      </div>

      {/* Vehicle Selection or Assignment Card */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3 shadow-sm">
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
          Assigned Vehicle Unit
        </label>

        {vehicles.length === 0 ? (
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center space-y-1">
            <AlertCircle className="w-4 h-4 text-amber-400 mx-auto" />
            <div className="font-semibold text-slate-300">No vehicle assigned</div>
            <p className="text-[11px] text-slate-500">
              Zero vehicles currently registered in Supabase. Register a carrier unit on the Live Fleet tab first.
            </p>
          </div>
        ) : (
          <select
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
            disabled={isTracking}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
          >
            <option value="">-- Select your assigned vehicle plate --</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.registration_number} — {v.vehicle_type}
              </option>
            ))}
          </select>
        )}

        {selectedVehicle && (
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs flex items-center justify-between">
            <span className="text-slate-400">Category:</span>
            <span className="font-semibold text-slate-200">{selectedVehicle.vehicle_type}</span>
          </div>
        )}
      </div>

      {/* Real GPS Live Readout */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-4 h-4 ${isTracking ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}
            />
            <h2 className="font-bold text-xs uppercase tracking-wider text-slate-200">Real-Time Sensor Telemetry</h2>
          </div>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
              isTracking
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                : 'bg-slate-950 text-slate-500 border border-slate-800'
            }`}
          >
            {isTracking ? 'STREAMING' : 'STANDBY'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Latitude */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-mono">Latitude</span>
            <span className="text-sm font-mono font-bold text-slate-100">
              {coords.latitude != null ? coords.latitude.toFixed(6) : 'Unavailable'}
            </span>
          </div>

          {/* Longitude */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-mono">Longitude</span>
            <span className="text-sm font-mono font-bold text-slate-100">
              {coords.longitude != null ? coords.longitude.toFixed(6) : 'Unavailable'}
            </span>
          </div>

          {/* Accuracy */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-mono">Accuracy</span>
            <span className="text-sm font-mono font-bold text-slate-100">
              {coords.accuracy != null ? `±${coords.accuracy.toFixed(1)} m` : 'Unavailable'}
            </span>
          </div>

          {/* Real Speed */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-mono">Speed</span>
            <span className="text-sm font-mono font-bold text-emerald-400">
              {coords.speed != null ? `${coords.speed.toFixed(1)} km/h` : '0.0 km/h'}
            </span>
          </div>

          {/* Heading */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-mono">Heading</span>
            <span className="text-sm font-mono font-bold text-slate-100">
              {coords.heading != null && !isNaN(coords.heading) ? `${coords.heading.toFixed(0)}°` : '0°'}
            </span>
          </div>

          {/* Last Reading */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-mono">Last GPS Ping</span>
            <span className="text-xs font-mono font-semibold text-slate-300">
              {lastReadingTime || 'No readings yet'}
            </span>
          </div>
        </div>

        {/* GPS Permission State */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
          <span>GPS Permission:</span>
          <span
            className={`font-mono font-semibold uppercase ${
              gpsPermission === 'granted'
                ? 'text-emerald-400'
                : gpsPermission === 'denied'
                ? 'text-rose-400'
                : 'text-amber-400'
            }`}
          >
            {gpsPermission}
          </span>
        </div>

        {/* Pings Counter */}
        {isTracking && (
          <div className="p-2 rounded bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-center justify-between">
            <span className="font-medium">Pings Transmitted:</span>
            <span className="font-mono font-bold">{transmittedPingsCount}</span>
          </div>
        )}

        {lastTransmissionStatus && (
          <div className="text-[10px] font-mono text-slate-400">{lastTransmissionStatus}</div>
        )}

        {transmissionError && (
          <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-xs text-rose-300">
            {transmissionError}
          </div>
        )}
      </div>

      {/* Start / Stop Action Buttons */}
      <div className="space-y-2">
        {!isTracking ? (
          <button
            onClick={handleStartTracking}
            disabled={!selectedVehicleId}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>START LIVE TRACKING</span>
          </button>
        ) : (
          <button
            onClick={handleStopTracking}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-rose-600 hover:bg-rose-500 shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Square className="w-5 h-5 fill-current" />
            <span>STOP LIVE TRACKING</span>
          </button>
        )}

        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-500 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Anti-Simulation Guarantee</span>
          </div>
          <p>
            Positions are drawn strictly from <code>navigator.geolocation.watchPosition()</code> with zero
            extrapolation.
          </p>
        </div>
      </div>
    </div>
  );
};
