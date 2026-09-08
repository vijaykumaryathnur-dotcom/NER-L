import { useState, useEffect, useCallback, useMemo } from 'react';
import { Vehicle, Shipment, TelemetryStatus } from '../types';
import { getSupabaseClient } from '../lib/supabase';

export function calculateVehicleTelemetryStatus(lastPing: string | null): TelemetryStatus {
  if (!lastPing) return 'OFFLINE';
  const pingTime = new Date(lastPing).getTime();
  if (isNaN(pingTime)) return 'OFFLINE';

  const diffSeconds = (Date.now() - pingTime) / 1000;
  if (diffSeconds < 60) return 'LIVE'; // less than 1 minute
  if (diffSeconds < 900) return 'RECENT'; // less than 15 minutes
  return 'OFFLINE'; // older than 15 minutes
}

const LOCAL_VEHICLES_KEY = 'ner_local_vehicles';
const LOCAL_SHIPMENTS_KEY = 'ner_local_shipments';

function getLocalVehicles(): Vehicle[] {
  try {
    const raw = localStorage.getItem(LOCAL_VEHICLES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getLocalShipments(): Shipment[] {
  try {
    const raw = localStorage.getItem(LOCAL_SHIPMENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalVehicle(vehicle: Vehicle) {
  try {
    const existing = getLocalVehicles();
    const updated = [vehicle, ...existing.filter((v) => v.id !== vehicle.id)];
    localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function saveLocalShipment(shipment: Shipment) {
  try {
    const existing = getLocalShipments();
    const updated = [shipment, ...existing.filter((s) => s.id !== shipment.id)];
    localStorage.setItem(LOCAL_SHIPMENTS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function useSupabaseData() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<
    'READY' | 'SCHEMA_MISSING' | 'NETWORK_ERROR' | 'UNCONFIGURED'
  >('UNCONFIGURED');
  const [realtimeStatus, setRealtimeStatus] = useState<
    'SUBSCRIBED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR' | 'UNCONFIGURED'
  >('UNCONFIGURED');
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toISOString());

  const supabase = getSupabaseClient();

  const fetchVehicles = useCallback(async () => {
    if (!supabase) {
      setVehicles(getLocalVehicles());
      setSchemaStatus('UNCONFIGURED');
      setRealtimeStatus('UNCONFIGURED');
      setLoading(false);
      return;
    }

    try {
      const { data, error: vError } = await supabase
        .from('vehicles')
        .select(`
          id,
          registration_number,
          vehicle_type,
          assigned_driver_id,
          status,
          current_lat,
          current_lng,
          current_speed,
          current_heading,
          current_accuracy,
          last_ping,
          created_at,
          profiles:assigned_driver_id (
            full_name
          )
        `)
        .order('created_at', { ascending: false });

      if (vError) {
        const isMissingTable =
          vError.code === 'PGRST205' ||
          vError.message?.includes('schema cache') ||
          vError.message?.includes('Could not find the table');

        if (isMissingTable) {
          setSchemaStatus('SCHEMA_MISSING');
          setError('Database schema tables not yet created in Supabase. Run schema.sql in Supabase SQL editor.');
          setVehicles(getLocalVehicles());
          return;
        }

        console.warn('Vehicles query notice:', vError.message);
        setError(vError.message);
        setVehicles(getLocalVehicles());
        return;
      }

      const mapped: Vehicle[] = (data || []).map((row: any) => ({
        id: row.id,
        registration_number: row.registration_number,
        vehicle_type: row.vehicle_type,
        assigned_driver_id: row.assigned_driver_id,
        driver_name: row.profiles?.full_name || null,
        status: row.status,
        current_lat: row.current_lat != null ? Number(row.current_lat) : null,
        current_lng: row.current_lng != null ? Number(row.current_lng) : null,
        current_speed: Number(row.current_speed || 0),
        current_heading: Number(row.current_heading || 0),
        current_accuracy: row.current_accuracy != null ? Number(row.current_accuracy) : null,
        last_ping: row.last_ping,
        created_at: row.created_at,
      }));

      setVehicles(mapped);
      setSchemaStatus('READY');
      setError(null);
    } catch (err: any) {
      const isNetwork = err?.message?.includes('Failed to fetch') || err?.name === 'TypeError';
      if (isNetwork) {
        console.warn('Supabase host connection notice: Unable to reach database endpoint.');
        setSchemaStatus('NETWORK_ERROR');
        setError('Unable to reach Supabase database host. Verify your Supabase URL in System Status.');
      } else {
        console.warn('Vehicles fetch notice:', err?.message);
        setError(err?.message || 'Failed to fetch vehicles');
      }
      setVehicles(getLocalVehicles());
    }
  }, [supabase]);

  const fetchShipments = useCallback(async () => {
    if (!supabase) {
      setShipments(getLocalShipments());
      return;
    }

    try {
      const { data, error: sError } = await supabase
        .from('shipments')
        .select(`
          *,
          assigned_vehicle:assigned_vehicle_id (*)
        `)
        .order('created_at', { ascending: false });

      if (sError) {
        const isMissingTable =
          sError.code === 'PGRST205' ||
          sError.message?.includes('schema cache') ||
          sError.message?.includes('Could not find the table');

        if (isMissingTable) {
          setSchemaStatus('SCHEMA_MISSING');
          setShipments(getLocalShipments());
          return;
        }

        console.warn('Shipments query notice:', sError.message);
        setShipments(getLocalShipments());
        return;
      }

      setShipments(data || []);
      setError(null);
    } catch (err: any) {
      console.warn('Shipments fetch notice:', err?.message);
      setShipments(getLocalShipments());
    }
  }, [supabase]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchVehicles(), fetchShipments()]);
    setLastRefreshed(new Date().toISOString());
    setLoading(false);
  }, [fetchVehicles, fetchShipments]);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Set up Supabase Realtime subscription
  useEffect(() => {
    if (!supabase) {
      setRealtimeStatus('UNCONFIGURED');
      return;
    }

    setRealtimeStatus('CONNECTING');

    const channel = supabase
      .channel('public-fleet-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicles' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newVehicle = payload.new as any;
            setVehicles((prev) => [
              {
                id: newVehicle.id,
                registration_number: newVehicle.registration_number,
                vehicle_type: newVehicle.vehicle_type,
                assigned_driver_id: newVehicle.assigned_driver_id,
                status: newVehicle.status,
                current_lat: newVehicle.current_lat != null ? Number(newVehicle.current_lat) : null,
                current_lng: newVehicle.current_lng != null ? Number(newVehicle.current_lng) : null,
                current_speed: Number(newVehicle.current_speed || 0),
                current_heading: Number(newVehicle.current_heading || 0),
                current_accuracy: newVehicle.current_accuracy != null ? Number(newVehicle.current_accuracy) : null,
                last_ping: newVehicle.last_ping,
                created_at: newVehicle.created_at,
              },
              ...prev.filter((v) => v.id !== newVehicle.id),
            ]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any;
            setVehicles((prev) =>
              prev.map((v) =>
                v.id === updated.id
                  ? {
                      ...v,
                      registration_number: updated.registration_number,
                      vehicle_type: updated.vehicle_type,
                      assigned_driver_id: updated.assigned_driver_id,
                      status: updated.status,
                      current_lat: updated.current_lat != null ? Number(updated.current_lat) : null,
                      current_lng: updated.current_lng != null ? Number(updated.current_lng) : null,
                      current_speed: Number(updated.current_speed || 0),
                      current_heading: Number(updated.current_heading || 0),
                      current_accuracy: updated.current_accuracy != null ? Number(updated.current_accuracy) : null,
                      last_ping: updated.last_ping,
                    }
                  : v
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setVehicles((prev) => prev.filter((v) => v.id !== (payload.old as any).id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shipments' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setShipments((prev) => [payload.new as Shipment, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setShipments((prev) =>
              prev.map((s) => (s.id === (payload.new as Shipment).id ? (payload.new as Shipment) : s))
            );
          } else if (payload.eventType === 'DELETE') {
            setShipments((prev) => prev.filter((s) => s.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('SUBSCRIBED');
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setRealtimeStatus('DISCONNECTED');
        } else if (status === 'CLOSED') {
          setRealtimeStatus('DISCONNECTED');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Operational metrics calculated strictly from actual data
  const metrics = useMemo(() => {
    const totalVehicles = vehicles.length;
    const liveVehicles = vehicles.filter(
      (v) => calculateVehicleTelemetryStatus(v.last_ping) === 'LIVE'
    ).length;
    const recentVehicles = vehicles.filter(
      (v) => calculateVehicleTelemetryStatus(v.last_ping) === 'RECENT'
    ).length;
    const offlineVehicles = vehicles.filter(
      (v) => calculateVehicleTelemetryStatus(v.last_ping) === 'OFFLINE'
    ).length;

    const totalShipments = shipments.length;
    const activeShipments = shipments.filter(
      (s) => s.status === 'Dispatched' || s.status === 'In Transit'
    ).length;
    const pendingShipments = shipments.filter((s) => s.status === 'Pending').length;
    const deliveredShipments = shipments.filter((s) => s.status === 'Delivered').length;

    // Delayed shipments: estimated_delivery is passed and status is not Delivered
    const now = Date.now();
    const delayedShipments = shipments.filter((s) => {
      if (s.status === 'Delivered') return false;
      if (!s.estimated_delivery) return false;
      return new Date(s.estimated_delivery).getTime() < now;
    }).length;

    return {
      totalVehicles,
      liveVehicles,
      recentVehicles,
      offlineVehicles,
      totalShipments,
      activeShipments,
      pendingShipments,
      deliveredShipments,
      delayedShipments,
      routeAlerts: 0, // derived dynamically when route planner is engaged
    };
  }, [vehicles, shipments]);

  return {
    vehicles,
    shipments,
    loading,
    error,
    schemaStatus,
    realtimeStatus,
    lastRefreshed,
    metrics,
    refreshAll,
    fetchVehicles,
    fetchShipments,
  };
}
