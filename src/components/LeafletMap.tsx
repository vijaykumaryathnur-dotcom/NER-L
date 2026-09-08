import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Vehicle, TrafficIncident, RouteGeometry } from '../types';
import { calculateVehicleTelemetryStatus } from '../hooks/useSupabaseData';

interface LeafletMapProps {
  vehicles?: Vehicle[];
  selectedVehicleId?: string | null;
  onSelectVehicle?: (vehicle: Vehicle) => void;
  routeGeometry?: RouteGeometry | null;
  origin?: { name: string; lat: number; lng: number } | null;
  destination?: { name: string; lat: number; lng: number } | null;
  trafficIncidents?: TrafficIncident[];
  userLocation?: { lat: number; lng: number } | null;
  className?: string;
  focusBounds?: [number, number][] | null;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  vehicles = [],
  selectedVehicleId = null,
  onSelectVehicle,
  routeGeometry,
  origin,
  destination,
  trafficIncidents = [],
  userLocation,
  className = 'h-full w-full',
  focusBounds,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Layer groups
  const vehiclesLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const trafficLayerRef = useRef<L.LayerGroup | null>(null);
  const userLocLayerRef = useRef<L.LayerGroup | null>(null);

  // Keep track of marker instances for smooth position interpolation
  const vehicleMarkersRef = useRef<Map<string, { marker: L.Marker; lastLat: number; lastLng: number }>>(
    new Map()
  );

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center on North East India
    const map = L.map(mapContainerRef.current, {
      center: [26.2006, 92.9376],
      zoom: 7,
      zoomControl: false,
      attributionControl: false,
    });

    // Free OpenStreetMap Tile Layer (no API key required) with technical dark styling
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      className: 'dark-osm-tiles',
    }).addTo(map);

    // Zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Attribution at bottom left
    L.control
      .attribution({
        position: 'bottomleft',
        prefix: '<span class="text-[10px] text-slate-500 font-mono">&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" class="hover:text-slate-400">OpenStreetMap</a> contributors | NER Logistics</span>',
      })
      .addTo(map);

    // Create persistent layer groups
    routeLayerRef.current = L.layerGroup().addTo(map);
    trafficLayerRef.current = L.layerGroup().addTo(map);
    vehiclesLayerRef.current = L.layerGroup().addTo(map);
    userLocLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Route and Pins
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;

    routeLayer.clearLayers();

    const boundsPoints: [number, number][] = [];

    // Origin Marker
    if (origin && origin.lat != null && origin.lng != null) {
      boundsPoints.push([origin.lat, origin.lng]);
      const originIcon = L.divIcon({
        className: 'custom-map-pin origin-pin',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <div class="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
            </div>
            <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-700 text-[10px] font-medium text-emerald-400 whitespace-nowrap shadow">
              ${origin.name.split(',')[0]}
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([origin.lat, origin.lng], { icon: originIcon })
        .bindPopup(`
          <div class="p-1 font-sans text-xs text-slate-200">
            <div class="font-semibold text-emerald-400 uppercase tracking-wider text-[10px]">Origin Point</div>
            <div class="font-medium text-sm mt-0.5">${origin.name}</div>
            <div class="text-slate-400 mt-1 font-mono text-[10px]">${origin.lat.toFixed(4)}°N, ${origin.lng.toFixed(4)}°E</div>
          </div>
        `)
        .addTo(routeLayer);
    }

    // Destination Marker
    if (destination && destination.lat != null && destination.lng != null) {
      boundsPoints.push([destination.lat, destination.lng]);
      const destIcon = L.divIcon({
        className: 'custom-map-pin dest-pin',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="w-6 h-6 rounded-full bg-rose-500/20 border border-rose-400 flex items-center justify-center shadow-lg shadow-rose-500/30">
              <div class="w-2.5 h-2.5 rounded-full bg-rose-400"></div>
            </div>
            <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-700 text-[10px] font-medium text-rose-400 whitespace-nowrap shadow">
              ${destination.name.split(',')[0]}
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([destination.lat, destination.lng], { icon: destIcon })
        .bindPopup(`
          <div class="p-1 font-sans text-xs text-slate-200">
            <div class="font-semibold text-rose-400 uppercase tracking-wider text-[10px]">Destination Point</div>
            <div class="font-medium text-sm mt-0.5">${destination.name}</div>
            <div class="text-slate-400 mt-1 font-mono text-[10px]">${destination.lat.toFixed(4)}°N, ${destination.lng.toFixed(4)}°E</div>
          </div>
        `)
        .addTo(routeLayer);
    }

    // Route Polyline
    if (routeGeometry && routeGeometry.coordinates.length > 0) {
      // Glow underlay
      L.polyline(routeGeometry.coordinates, {
        color: '#0284c7',
        weight: 7,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayer);

      // Core route polyline
      const poly = L.polyline(routeGeometry.coordinates, {
        color: '#38bdf8',
        weight: 3.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayer);

      routeGeometry.coordinates.forEach((c) => boundsPoints.push(c));
    }

    // Fit map bounds if route or points exist
    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [60, 60],
        maxZoom: 14,
        animate: true,
      });
    }
  }, [routeGeometry, origin, destination]);

  // Update Traffic Incidents
  useEffect(() => {
    const trafficLayer = trafficLayerRef.current;
    if (!trafficLayer) return;

    trafficLayer.clearLayers();

    trafficIncidents.forEach((inc) => {
      const isCorridor = inc.relevance === 'Route Impacted';
      const color = isCorridor ? '#f43f5e' : '#f59e0b';
      const label = isCorridor ? 'CORRIDOR HAZARD' : 'REGIONAL CONTEXT';

      const incIcon = L.divIcon({
        className: 'custom-traffic-icon',
        html: `
          <div class="relative group cursor-pointer">
            <div class="w-5 h-5 rounded-full ${isCorridor ? 'bg-rose-500/20 border-rose-500' : 'bg-amber-500/20 border-amber-500'} border flex items-center justify-center animate-pulse">
              <div class="w-2 h-2 rounded-full ${isCorridor ? 'bg-rose-500' : 'bg-amber-400'}"></div>
            </div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const marker = L.marker([inc.lat, inc.lng], { icon: incIcon }).addTo(trafficLayer);

      marker.bindPopup(`
        <div class="p-1 font-sans text-xs text-slate-100 max-w-xs">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
              isCorridor ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
            }">${label}</span>
            <span class="text-[10px] text-slate-400 font-mono">${inc.distanceToRouteKm} km from road</span>
          </div>
          <div class="font-medium text-slate-200 mt-1">${inc.description}</div>
          ${inc.delaySeconds > 0 ? `<div class="text-rose-400 font-mono text-[11px] mt-1">Estimated delay: +${Math.round(inc.delaySeconds / 60)} mins</div>` : ''}
          <div class="text-[10px] text-slate-400 mt-1 font-mono">${inc.lat.toFixed(4)}°N, ${inc.lng.toFixed(4)}°E</div>
        </div>
      `);
    });
  }, [trafficIncidents]);

  // Update Real Vehicles with Smooth Transitions
  useEffect(() => {
    const vehiclesLayer = vehiclesLayerRef.current;
    if (!vehiclesLayer) return;

    const currentMarkers = vehicleMarkersRef.current;
    const seenIds = new Set<string>();

    vehicles.forEach((vehicle) => {
      if (vehicle.current_lat == null || vehicle.current_lng == null) return;
      seenIds.add(vehicle.id);

      const status = calculateVehicleTelemetryStatus(vehicle.last_ping);
      const isSelected = vehicle.id === selectedVehicleId;

      const statusBadge =
        status === 'LIVE'
          ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-400/40'
          : status === 'RECENT'
          ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400/30'
          : 'bg-slate-700 text-slate-200';

      const pulseEffect = status === 'LIVE' ? '<span class="absolute -inset-1 rounded-full bg-emerald-500/30 animate-ping"></span>' : '';

      const iconHtml = `
        <div class="relative cursor-pointer transition-transform duration-300 ${isSelected ? 'scale-125 z-50' : 'hover:scale-110'}">
          ${pulseEffect}
          <div class="relative w-8 h-8 rounded-lg bg-slate-900 border ${isSelected ? 'border-emerald-400 shadow-lg shadow-emerald-500/50' : 'border-slate-700'} flex items-center justify-center text-slate-100 shadow-md">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${vehicle.current_heading}deg);">
              <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
            </svg>
            <div class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${statusBadge}"></div>
          </div>
          <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 px-1 py-0.2 rounded bg-slate-950/90 border border-slate-800 text-[9px] font-mono text-slate-300 whitespace-nowrap shadow pointer-events-none">
            ${vehicle.registration_number}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'vehicle-marker-icon',
        html: iconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const popupHtml = `
        <div class="p-1 font-sans text-xs text-slate-100 min-w-[210px]">
          <div class="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
            <span class="font-bold text-sm text-emerald-400 font-mono">${vehicle.registration_number}</span>
            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
              status === 'LIVE' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
              status === 'RECENT' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
              'bg-slate-800 text-slate-400 border border-slate-700'
            }">${status}</span>
          </div>

          <div class="space-y-1 text-[11px] text-slate-300">
            <div class="flex justify-between"><span class="text-slate-500">Vehicle Type:</span> <span class="font-medium">${vehicle.vehicle_type}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Driver:</span> <span class="font-medium">${vehicle.driver_name || 'Unassigned'}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Real Speed:</span> <span class="font-mono font-bold text-slate-100">${vehicle.current_speed.toFixed(1)} km/h</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Heading:</span> <span class="font-mono">${vehicle.current_heading}°</span></div>
            <div class="flex justify-between"><span class="text-slate-500">GPS Accuracy:</span> <span class="font-mono">${vehicle.current_accuracy != null ? `±${vehicle.current_accuracy.toFixed(1)}m` : 'Unavailable'}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Last Ping:</span> <span class="font-mono text-[10px] text-slate-400">${vehicle.last_ping ? new Date(vehicle.last_ping).toLocaleTimeString() : 'Unavailable'}</span></div>
          </div>
        </div>
      `;

      if (currentMarkers.has(vehicle.id)) {
        const item = currentMarkers.get(vehicle.id)!;
        item.marker.setIcon(customIcon);
        item.marker.setPopupContent(popupHtml);

        // Smoothly update position if changed
        if (item.lastLat !== vehicle.current_lat || item.lastLng !== vehicle.current_lng) {
          item.marker.setLatLng([vehicle.current_lat, vehicle.current_lng]);
          item.lastLat = vehicle.current_lat;
          item.lastLng = vehicle.current_lng;
        }
      } else {
        const marker = L.marker([vehicle.current_lat, vehicle.current_lng], { icon: customIcon })
          .bindPopup(popupHtml)
          .addTo(vehiclesLayer);

        marker.on('click', () => {
          if (onSelectVehicle) onSelectVehicle(vehicle);
        });

        currentMarkers.set(vehicle.id, {
          marker,
          lastLat: vehicle.current_lat,
          lastLng: vehicle.current_lng,
        });
      }
    });

    // Remove deleted or non-coordinate vehicles
    currentMarkers.forEach((item, id) => {
      if (!seenIds.has(id)) {
        vehiclesLayer.removeLayer(item.marker);
        currentMarkers.delete(id);
      }
    });
  }, [vehicles, selectedVehicleId, onSelectVehicle]);

  // Update User Current Location
  useEffect(() => {
    const userLayer = userLocLayerRef.current;
    if (!userLayer) return;

    userLayer.clearLayers();

    if (userLocation && userLocation.lat != null && userLocation.lng != null) {
      const userIcon = L.divIcon({
        className: 'user-location-pin',
        html: `
          <div class="relative flex items-center justify-center">
            <span class="absolute -inset-1.5 rounded-full bg-cyan-500/20 animate-ping"></span>
            <div class="w-4 h-4 rounded-full bg-cyan-500 border-2 border-white shadow-lg shadow-cyan-500/50"></div>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .bindPopup(`
          <div class="p-1 font-sans text-xs text-slate-100">
            <div class="font-semibold text-cyan-400">Your Device Location</div>
            <div class="text-[10px] font-mono text-slate-400 mt-0.5">${userLocation.lat.toFixed(5)}°N, ${userLocation.lng.toFixed(5)}°E</div>
          </div>
        `)
        .addTo(userLayer);
    }
  }, [userLocation]);

  // Handle focus bounds
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusBounds || focusBounds.length === 0) return;

    map.fitBounds(L.latLngBounds(focusBounds), {
      padding: [50, 50],
      maxZoom: 15,
      animate: true,
    });
  }, [focusBounds]);

  return (
    <div className={`relative ${className} overflow-hidden rounded-xl border border-slate-800 bg-slate-950`}>
      <div ref={mapContainerRef} className="h-full w-full z-0" />
    </div>
  );
};
