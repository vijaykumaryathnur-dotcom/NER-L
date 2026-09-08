import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Navigation,
  MapPin,
  Search,
  RotateCcw,
  CloudRain,
  Wind,
  Thermometer,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  Compass,
  Layers,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import {
  LocationSuggestion,
  RouteGeometry,
  WeatherPoint,
  TrafficIncident,
  RouteSafetyAssessment,
} from '../types';
import { LeafletMap } from './LeafletMap';

export const RoutePlannerView: React.FC = () => {
  // Autocomplete state for Origin
  const [fromQuery, setFromQuery] = useState('');
  const [fromSuggestions, setFromSuggestions] = useState<LocationSuggestion[]>([]);
  const [isFromLoading, setIsFromLoading] = useState(false);
  const [isFromOpen, setIsFromOpen] = useState(false);
  const [fromHighlightIndex, setFromHighlightIndex] = useState(-1);
  const [selectedOrigin, setSelectedOrigin] = useState<LocationSuggestion | null>(null);

  // Autocomplete state for Destination
  const [toQuery, setToQuery] = useState('');
  const [toSuggestions, setToSuggestions] = useState<LocationSuggestion[]>([]);
  const [isToLoading, setIsToLoading] = useState(false);
  const [isToOpen, setIsToOpen] = useState(false);
  const [toHighlightIndex, setToHighlightIndex] = useState(-1);
  const [selectedDestination, setSelectedDestination] = useState<LocationSuggestion | null>(null);

  // Route calculation & layers
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry | null>(null);

  // Weather & traffic states
  const [weatherPoints, setWeatherPoints] = useState<WeatherPoint[]>([]);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [trafficIncidents, setTrafficIncidents] = useState<TrafficIncident[]>([]);
  const [isTrafficLoading, setIsTrafficLoading] = useState(false);
  const [trafficStatusMessage, setTrafficStatusMessage] = useState<string | null>(null);
  const [safetyAssessment, setSafetyAssessment] = useState<RouteSafetyAssessment | null>(null);

  const fromDropdownRef = useRef<HTMLDivElement>(null);
  const toDropdownRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------
  // Dynamic Geocoding Queries (Debounced)
  // -------------------------------------------------------------
  const searchLocations = async (
    query: string,
    setSuggestions: (res: LocationSuggestion[]) => void,
    setLoading: (l: boolean) => void
  ) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      if (!resp.ok) throw new Error('Geocoding service unavailable');
      const data = await resp.json();
      setSuggestions(data.results || []);
    } catch (err) {
      console.error('Geocode search failed:', err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (fromQuery && (!selectedOrigin || selectedOrigin.name !== fromQuery)) {
        searchLocations(fromQuery, setFromSuggestions, setIsFromLoading);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [fromQuery, selectedOrigin]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (toQuery && (!selectedDestination || selectedDestination.name !== toQuery)) {
        searchLocations(toQuery, setToSuggestions, setIsToLoading);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [toQuery, selectedDestination]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fromDropdownRef.current && !fromDropdownRef.current.contains(e.target as Node)) {
        setIsFromOpen(false);
      }
      if (toDropdownRef.current && !toDropdownRef.current.contains(e.target as Node)) {
        setIsToOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -------------------------------------------------------------
  // Route Calculation Execution
  // -------------------------------------------------------------
  const handleCalculateRoute = async () => {
    if (!selectedOrigin || !selectedDestination) return;

    setIsRouting(true);
    setRouteError(null);
    setRouteGeometry(null);
    setWeatherPoints([]);
    setTrafficIncidents([]);
    setSafetyAssessment(null);

    try {
      // 1. Calculate road route
      const routeResp = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: selectedOrigin.lat, lng: selectedOrigin.lng },
          destination: { lat: selectedDestination.lat, lng: selectedDestination.lng },
        }),
      });

      if (!routeResp.ok) {
        const errData = await routeResp.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to calculate road route');
      }

      const routeData: RouteGeometry = await routeResp.json();
      setRouteGeometry(routeData);

      // 2. Sample meaningful coordinates along the real road polyline for weather
      const coords = routeData.coordinates;
      const originPt = { label: `Origin: ${selectedOrigin.name}`, lat: coords[0][0], lng: coords[0][1] };
      const destPt = {
        label: `Destination: ${selectedDestination.name}`,
        lat: coords[coords.length - 1][0],
        lng: coords[coords.length - 1][1],
      };

      const pointsToQuery = [originPt];
      if (coords.length > 2) {
        const midIdx = Math.floor(coords.length / 2);
        pointsToQuery.push({
          label: 'Mid-Corridor Route Point',
          lat: coords[midIdx][0],
          lng: coords[midIdx][1],
        });
      }
      pointsToQuery.push(destPt);

      // Fetch real weather
      setIsWeatherLoading(true);
      fetch('/api/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: pointsToQuery }),
      })
        .then(async (res) => {
          const text = await res.text();
          try {
            return JSON.parse(text);
          } catch {
            throw new Error(`Weather response error (HTTP ${res.status})`);
          }
        })
        .then((wData) => {
          setWeatherPoints(wData.weather || []);
        })
        .catch((e) => console.warn('Weather notice:', e?.message || e))
        .finally(() => setIsWeatherLoading(false));

      // 3. Fetch real TomTom traffic incidents in the bounding box
      let minLat = 90,
        maxLat = -90,
        minLng = 180,
        maxLng = -180;
      coords.forEach(([lat, lng]) => {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      });

      // Expand bbox slightly (approx 0.2 deg ~ 22 km buffer)
      const bbox = [
        Number((minLng - 0.2).toFixed(4)),
        Number((minLat - 0.2).toFixed(4)),
        Number((maxLng + 0.2).toFixed(4)),
        Number((maxLat + 0.2).toFixed(4)),
      ];

      // Sample route coordinates (~250 points max) to prevent payload bloat while maintaining sub-kilometer precision
      const step = Math.max(1, Math.ceil(coords.length / 250));
      const sampledCoords: [number, number][] = [];
      for (let i = 0; i < coords.length; i += step) {
        sampledCoords.push(coords[i]);
      }
      if (coords.length > 0 && sampledCoords[sampledCoords.length - 1] !== coords[coords.length - 1]) {
        sampledCoords.push(coords[coords.length - 1]);
      }

      setIsTrafficLoading(true);
      fetch('/api/traffic/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bbox, routeCoordinates: sampledCoords }),
      })
        .then(async (res) => {
          const text = await res.text();
          let data: any;
          try {
            data = JSON.parse(text);
          } catch {
            throw new Error(`Traffic API response error (HTTP ${res.status})`);
          }
          if (!res.ok) {
            throw new Error(data.message || data.error || `Traffic API error (HTTP ${res.status})`);
          }
          return data;
        })
        .then((tData) => {
          if (!tData.available) {
            setTrafficStatusMessage(tData.message || 'Traffic incidents layer unavailable');
            setTrafficIncidents([]);
          } else {
            setTrafficIncidents(tData.incidents || []);
            setTrafficStatusMessage(null);
          }
        })
        .catch((e: any) => {
          console.warn('Traffic notice:', e?.message || e);
          setTrafficStatusMessage(e?.message || 'Traffic API connection unavailable');
          setTrafficIncidents([]);
        })
        .finally(() => setIsTrafficLoading(false));
    } catch (err: any) {
      console.error('Routing failed:', err);
      setRouteError(err.message || 'Error occurred during route calculation');
    } finally {
      setIsRouting(false);
    }
  };

  // Derive Route Safety Assessment strictly from actual data
  useEffect(() => {
    if (!routeGeometry) {
      setSafetyAssessment(null);
      return;
    }

    const hasWeatherData = weatherPoints.length > 0 && weatherPoints.some((w) => w.available);
    const corridorIncidents = trafficIncidents.filter((i) => i.relevance === 'Route Impacted');
    const regionalIncidents = trafficIncidents.filter((i) => i.relevance === 'Regional Context');

    const maxPrecipitation = Math.max(0, ...weatherPoints.map((w) => w.precipitationMm || 0));
    const severeWeather = weatherPoints.some((w) => (w.weatherCode ?? 0) >= 65 || (w.weatherCode ?? 0) >= 95);

    const reasons: string[] = [];

    if (corridorIncidents.length > 0) {
      reasons.push(`${corridorIncidents.length} verified incident(s) directly within the 2 km corridor`);
    }
    if (regionalIncidents.length > 0) {
      reasons.push(`${regionalIncidents.length} regional traffic incident(s) within 15 km buffer`);
    }
    if (severeWeather) {
      reasons.push('Severe precipitation or atmospheric storm activity reported along corridor');
    } else if (maxPrecipitation > 2) {
      reasons.push(`Light-to-moderate rain detected (${maxPrecipitation.toFixed(1)} mm/hr)`);
    }

    if (!hasWeatherData && trafficIncidents.length === 0 && trafficStatusMessage) {
      setSafetyAssessment({
        level: 'INSUFFICIENT_DATA',
        headline: 'Insufficient live data to determine route conditions.',
        reasons: ['Atmospheric or traffic telemetry stream is currently incomplete.'],
        lastAssessed: new Date().toLocaleTimeString(),
      });
      return;
    }

    if (corridorIncidents.length > 0 || severeWeather || maxPrecipitation > 15) {
      setSafetyAssessment({
        level: 'HIGH ATTENTION',
        headline: 'High Attention Advisory: Route Corridor Hazards Detected',
        reasons: reasons.length > 0 ? reasons : ['Elevated operational risk on hill terrain.'],
        lastAssessed: new Date().toLocaleTimeString(),
      });
    } else if (regionalIncidents.length > 0 || maxPrecipitation > 1) {
      setSafetyAssessment({
        level: 'CAUTION',
        headline: 'Caution Advisory: Moderate Mountain Corridor Conditions',
        reasons: reasons.length > 0 ? reasons : ['Minor road variances or damp pavement.'],
        lastAssessed: new Date().toLocaleTimeString(),
      });
    } else {
      setSafetyAssessment({
        level: 'OPTIMAL',
        headline: 'Optimal Road & Atmospheric Corridor Conditions',
        reasons: ['No corridor obstructions detected', 'Clear atmospheric telemetry across route points'],
        lastAssessed: new Date().toLocaleTimeString(),
      });
    }
  }, [routeGeometry, weatherPoints, trafficIncidents, trafficStatusMessage]);

  // Quick NE corridor preset hubs for rapid testing
  const quickHubs = [
    { name: 'Guwahati, Assam', lat: 26.1445, lng: 91.7362 },
    { name: 'Shillong, Meghalaya', lat: 25.5788, lng: 91.8933 },
    { name: 'Silchar, Assam', lat: 24.8333, lng: 92.7789 },
    { name: 'Agartala, Tripura', lat: 23.8315, lng: 91.2868 },
    { name: 'Kohima, Nagaland', lat: 25.6751, lng: 94.1086 },
    { name: 'Imphal, Manipur', lat: 24.817, lng: 93.9368 },
  ];

  return (
    <div className="h-full flex flex-col xl:flex-row gap-5 p-4 lg:p-6 overflow-hidden">
      {/* Left Control Panel */}
      <div className="w-full xl:w-[440px] flex flex-col gap-4 overflow-y-auto pr-1">
        {/* Route Planner Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur p-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-emerald-400" />
              <h2 className="font-bold text-sm tracking-wide text-slate-100 uppercase">Search Route</h2>
            </div>
            <span className="text-[10px] font-mono text-slate-400">OpenStreetMap / ORS</span>
          </div>

          {/* Location Autocomplete Inputs */}
          <div className="mt-4 space-y-4">
            {/* Origin (FROM) */}
            <div className="relative" ref={fromDropdownRef}>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>From (Origin)</span>
                {selectedOrigin && (
                  <span className="text-emerald-400 font-mono text-[10px]">
                    {selectedOrigin.lat.toFixed(4)}, {selectedOrigin.lng.toFixed(4)}
                  </span>
                )}
              </label>

              <div className="relative flex items-center">
                <div className="absolute left-3 text-emerald-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <input
                  id="route-from-input"
                  type="text"
                  value={fromQuery}
                  onChange={(e) => {
                    setFromQuery(e.target.value);
                    setIsFromOpen(true);
                    setFromHighlightIndex(-1);
                    if (selectedOrigin && selectedOrigin.name !== e.target.value) {
                      setSelectedOrigin(null);
                    }
                  }}
                  onFocus={() => {
                    if (fromSuggestions.length > 0) setIsFromOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (!isFromOpen || fromSuggestions.length === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setFromHighlightIndex((prev) => (prev < fromSuggestions.length - 1 ? prev + 1 : 0));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setFromHighlightIndex((prev) => (prev > 0 ? prev - 1 : fromSuggestions.length - 1));
                    } else if (e.key === 'Enter' && fromHighlightIndex >= 0) {
                      e.preventDefault();
                      const item = fromSuggestions[fromHighlightIndex];
                      setSelectedOrigin(item);
                      setFromQuery(item.name);
                      setIsFromOpen(false);
                    } else if (e.key === 'Escape') {
                      setIsFromOpen(false);
                    }
                  }}
                  placeholder="Type origin place (e.g. Shillong, Meghalaya)..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-9 pr-8 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />

                {isFromLoading && (
                  <div className="absolute right-3 text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                )}
                {!isFromLoading && fromQuery && (
                  <button
                    onClick={() => {
                      setFromQuery('');
                      setSelectedOrigin(null);
                      setFromSuggestions([]);
                    }}
                    className="absolute right-2.5 p-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {isFromOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-900">
                  {fromSuggestions.length === 0 && !isFromLoading ? (
                    <div className="p-3 text-center text-xs text-slate-500">
                      No matching places found. Try typing another town or district.
                    </div>
                  ) : (
                    fromSuggestions.map((sug, idx) => (
                      <button
                        key={sug.id}
                        type="button"
                        onClick={() => {
                          setSelectedOrigin(sug);
                          setFromQuery(sug.name);
                          setIsFromOpen(false);
                        }}
                        className={`w-full text-left p-2.5 text-xs transition-colors flex items-start gap-2 ${
                          idx === fromHighlightIndex
                            ? 'bg-emerald-950/60 text-emerald-200'
                            : 'text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-200">{sug.name}</div>
                          <div className="text-[10px] text-slate-400 line-clamp-1">{sug.label}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Destination (TO) */}
            <div className="relative" ref={toDropdownRef}>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>To (Destination)</span>
                {selectedDestination && (
                  <span className="text-rose-400 font-mono text-[10px]">
                    {selectedDestination.lat.toFixed(4)}, {selectedDestination.lng.toFixed(4)}
                  </span>
                )}
              </label>

              <div className="relative flex items-center">
                <div className="absolute left-3 text-rose-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <input
                  id="route-to-input"
                  type="text"
                  value={toQuery}
                  onChange={(e) => {
                    setToQuery(e.target.value);
                    setIsToOpen(true);
                    setToHighlightIndex(-1);
                    if (selectedDestination && selectedDestination.name !== e.target.value) {
                      setSelectedDestination(null);
                    }
                  }}
                  onFocus={() => {
                    if (toSuggestions.length > 0) setIsToOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (!isToOpen || toSuggestions.length === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setToHighlightIndex((prev) => (prev < toSuggestions.length - 1 ? prev + 1 : 0));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setToHighlightIndex((prev) => (prev > 0 ? prev - 1 : toSuggestions.length - 1));
                    } else if (e.key === 'Enter' && toHighlightIndex >= 0) {
                      e.preventDefault();
                      const item = toSuggestions[toHighlightIndex];
                      setSelectedDestination(item);
                      setToQuery(item.name);
                      setIsToOpen(false);
                    } else if (e.key === 'Escape') {
                      setIsToOpen(false);
                    }
                  }}
                  placeholder="Type destination (e.g. Guwahati, Assam)..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-9 pr-8 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-colors"
                />

                {isToLoading && (
                  <div className="absolute right-3 text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                )}
                {!isToLoading && toQuery && (
                  <button
                    onClick={() => {
                      setToQuery('');
                      setSelectedDestination(null);
                      setToSuggestions([]);
                    }}
                    className="absolute right-2.5 p-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {isToOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-900">
                  {toSuggestions.length === 0 && !isToLoading ? (
                    <div className="p-3 text-center text-xs text-slate-500">
                      No matching places found. Try typing another city or district.
                    </div>
                  ) : (
                    toSuggestions.map((sug, idx) => (
                      <button
                        key={sug.id}
                        type="button"
                        onClick={() => {
                          setSelectedDestination(sug);
                          setToQuery(sug.name);
                          setIsToOpen(false);
                        }}
                        className={`w-full text-left p-2.5 text-xs transition-colors flex items-start gap-2 ${
                          idx === toHighlightIndex
                            ? 'bg-rose-950/60 text-rose-200'
                            : 'text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-200">{sug.name}</div>
                          <div className="text-[10px] text-slate-400 line-clamp-1">{sug.label}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick Preset Hubs */}
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <span className="text-[10px] text-slate-500 font-mono uppercase block mb-1.5">
              Quick NE Capital Hubs
            </span>
            <div className="flex flex-wrap gap-1.5">
              {quickHubs.map((hub) => (
                <button
                  key={hub.name}
                  type="button"
                  onClick={() => {
                    const sug: LocationSuggestion = {
                      id: `${hub.lat}-${hub.lng}`,
                      name: hub.name.split(',')[0],
                      label: hub.name,
                      state: hub.name.split(',')[1]?.trim() || '',
                      country: 'India',
                      lat: hub.lat,
                      lng: hub.lng,
                    };
                    if (!selectedOrigin) {
                      setSelectedOrigin(sug);
                      setFromQuery(sug.name);
                    } else if (!selectedDestination) {
                      setSelectedDestination(sug);
                      setToQuery(sug.name);
                    } else {
                      setSelectedDestination(sug);
                      setToQuery(sug.name);
                    }
                  }}
                  className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-[10px] text-slate-300 border border-slate-800 transition-colors"
                >
                  {hub.name.split(',')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <button
            id="calculate-route-btn"
            disabled={!selectedOrigin || !selectedDestination || isRouting}
            onClick={handleCalculateRoute}
            className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            {isRouting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Computing Real Road Corridors...</span>
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4" />
                <span>Calculate Real Road Route</span>
              </>
            )}
          </button>

          {routeError && (
            <div className="mt-3 p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <div>
                <div className="font-semibold">Routing Error</div>
                <div className="text-[11px] text-rose-200/80">{routeError}</div>
              </div>
            </div>
          )}
        </div>

        {/* Route Metrics Summary */}
        {routeGeometry && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Calculated Road Corridor</span>
              <span className="text-[10px] font-mono text-emerald-400">{routeGeometry.engine}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Road Distance</span>
                <span className="text-xl font-bold font-mono text-slate-100">{routeGeometry.distanceKm}</span>
                <span className="text-xs text-slate-400 ml-1 font-mono">km</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Est. Drive Time</span>
                <span className="text-xl font-bold font-mono text-slate-100">
                  {Math.floor(routeGeometry.durationMins / 60)}h {routeGeometry.durationMins % 60}m
                </span>
              </div>
            </div>

            {/* Safety Assessment Indicator */}
            {safetyAssessment && (
              <div
                className={`p-3 rounded-lg border text-xs ${
                  safetyAssessment.level === 'HIGH ATTENTION'
                    ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                    : safetyAssessment.level === 'CAUTION'
                    ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                    : safetyAssessment.level === 'OPTIMAL'
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between font-bold mb-1">
                  <div className="flex items-center gap-1.5">
                    {safetyAssessment.level === 'HIGH ATTENTION' ? (
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                    ) : safetyAssessment.level === 'CAUTION' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : safetyAssessment.level === 'OPTIMAL' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Info className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="uppercase tracking-wider text-[11px] font-mono">
                      {safetyAssessment.level}
                    </span>
                  </div>
                  <span className="text-[10px] opacity-80 font-mono">{safetyAssessment.lastAssessed}</span>
                </div>
                <p className="text-[11px] font-medium leading-tight">{safetyAssessment.headline}</p>
                <ul className="mt-1.5 space-y-0.5 text-[10px] opacity-90 list-disc list-inside">
                  {safetyAssessment.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Environmental Atmospheric Data (Open-Meteo) */}
        {weatherPoints.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">Atmospheric Telemetry</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">Open-Meteo API</span>
            </div>

            <div className="space-y-2">
              {weatherPoints.map((wp, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{wp.label}</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {wp.lat.toFixed(2)}°N, {wp.lng.toFixed(2)}°E
                    </span>
                  </div>

                  {wp.available ? (
                    <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                      <div className="flex items-center gap-1 text-slate-300">
                        <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-mono font-bold">{wp.temperatureC}°C</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-300">
                        <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                        <span className="font-mono font-bold">{wp.precipitationMm} mm</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-300">
                        <Wind className="w-3.5 h-3.5 text-teal-400" />
                        <span className="font-mono font-bold">{wp.windSpeedKmh} km/h</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500">Telemetry unavailable</span>
                  )}
                  {wp.condition && (
                    <div className="text-[10px] text-sky-300 font-medium">Condition: {wp.condition}</div>
                  )}
                </div>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Source: Open-Meteo Live Surface Model
            </div>
          </div>
        )}

        {/* Real Traffic Incidents Panel */}
        {routeGeometry && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur p-4 shadow-xl space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">Corridor Traffic Incidents</span>
              <span className="text-[10px] font-mono text-slate-400">TomTom Incidents</span>
            </div>

            {isTrafficLoading ? (
              <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                <span>Checking TomTom traffic incidents...</span>
              </div>
            ) : trafficIncidents.length === 0 ? (
              <div className="p-3 text-center rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400">
                {trafficStatusMessage || 'No route-relevant traffic incidents detected in corridor.'}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {trafficIncidents.map((inc) => (
                  <div key={inc.id} className="p-2 rounded bg-slate-950 border border-slate-800 text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          inc.relevance === 'Route Impacted'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {inc.relevance}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{inc.distanceToRouteKm} km off-road</span>
                    </div>
                    <div className="text-slate-200 text-[11px] leading-snug">{inc.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Map Canvas */}
      <div className="flex-1 h-[450px] xl:h-full relative">
        <LeafletMap
          routeGeometry={routeGeometry}
          origin={selectedOrigin ? { name: selectedOrigin.name, lat: selectedOrigin.lat, lng: selectedOrigin.lng } : null}
          destination={
            selectedDestination
              ? { name: selectedDestination.name, lat: selectedDestination.lat, lng: selectedDestination.lng }
              : null
          }
          trafficIncidents={trafficIncidents}
          className="h-full w-full"
        />
      </div>
    </div>
  );
};
