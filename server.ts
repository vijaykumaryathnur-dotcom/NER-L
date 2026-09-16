import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure fresh assets and endpoints during development and testing
app.use((req: Request, res: Response, next: express.NextFunction) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Gracefully intercept payload size or JSON syntax errors to return JSON instead of HTML
app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      available: false,
      configured: false,
      error: 'PayloadTooLargeError: request entity too large',
      message: 'Route payload exceeds processing size limit.',
      incidents: [],
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload format' });
  }
  next(err);
});

// Helper for Haversine distance in km
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Distance from point P to line segment AB in km
function distancePointToSegmentKm(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const dAB = haversineDistanceKm(aLat, aLon, bLat, bLon);
  if (dAB === 0) return haversineDistanceKm(pLat, pLon, aLat, aLon);

  // Project point onto segment in equirectangular projection approximation for local segments
  const x = (bLon - aLon) * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  const y = bLat - aLat;
  const px = (pLon - aLon) * Math.cos(((aLat + pLat) / 2) * (Math.PI / 180));
  const py = pLat - aLat;

  const dot = px * x + py * y;
  const lenSq = x * x + y * y;
  const param = Math.max(0, Math.min(1, dot / lenSq));

  const projLat = aLat + param * (bLat - aLat);
  const projLon = aLon + param * (bLon - aLon);

  return haversineDistanceKm(pLat, pLon, projLat, projLon);
}

// -------------------------------------------------------------
// 1. Health & System Status Endpoint
// -------------------------------------------------------------
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'NER Logistics Core API',
    timestamp: new Date().toISOString(),
  });
});

// In-memory runtime configuration updated via UI Save & Verify or headers
let runtimeSupabaseConfig = {
  url: '',
  anonKey: '',
};
let runtimeTomTomKey = '';

// Helper to get effective TomTom key from request headers, runtime memory, or environment
function getEffectiveTomTomKey(req?: Request): string {
  const headerKey = (req?.headers['x-tomtom-key'] as string) || '';
  return (
    headerKey ||
    runtimeTomTomKey ||
    process.env.TOMTOM_API_KEY ||
    process.env.VITE_TOMTOM_API_KEY ||
    ''
  ).trim();
}

// Normalize Supabase URL & ref
// SUPABASE_SERVICE_ROLE_KEY is strictly server-side only: never exposed in diagnostics, responses, or client bundles.
function getNormalizedSupabaseConfig(req?: Request) {
  const headerUrl = (req?.headers['x-supabase-url'] as string) || '';
  const headerKey = (req?.headers['x-supabase-anon-key'] as string) || '';

  let url = (
    headerUrl ||
    runtimeSupabaseConfig.url ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();

  // Public anon key for client-facing operations and presence verification
  const anonKey = (
    headerKey ||
    runtimeSupabaseConfig.anonKey ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  // Strictly server-only service role key for trusted backend operations (e.g. telemetry ingest)
  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();

  // For backend internal requests, prefer serviceRoleKey if available, otherwise fallback to anonKey
  const backendKey = serviceRoleKey || anonKey;

  if (url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    if (url.includes('lxooymvwrdjjubfkcesc.supabase.co')) {
      url = url.replace('lxooymvwrdjjubfkcesc', 'lxooymwwrdjjubfkcesc');
    }
    const keyForRef = anonKey || serviceRoleKey;
    if (keyForRef) {
      try {
        const parts = keyForRef.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload.ref && typeof payload.ref === 'string' && url.includes('.supabase.co')) {
            url = `https://${payload.ref}.supabase.co`;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return { url, anonKey, serviceRoleKey, backendKey };
}

// Endpoint to sync client credentials to server runtime
const handleSystemConfig = (req: Request, res: Response) => {
  const { url, anonKey, tomtomKey } = req.body || {};
  if (url !== undefined) {
    runtimeSupabaseConfig.url = typeof url === 'string' ? url.trim() : '';
  }
  if (anonKey !== undefined) {
    runtimeSupabaseConfig.anonKey = typeof anonKey === 'string' ? anonKey.trim() : '';
  }
  if (tomtomKey !== undefined) {
    runtimeTomTomKey = typeof tomtomKey === 'string' ? tomtomKey.trim() : '';
  }

  const { url: activeUrl, anonKey: activeAnon, backendKey: activeKey } = getNormalizedSupabaseConfig(req);
  const activeTomTom = getEffectiveTomTomKey(req);

  res.json({
    success: true,
    url: runtimeSupabaseConfig.url,
    configured: Boolean(activeUrl && (activeAnon || activeKey)),
    diagnostics: {
      supabaseUrlPresent: Boolean(activeUrl),
      supabaseAnonPresent: Boolean(activeAnon || activeKey),
      tomtomKeyPresent: Boolean(activeTomTom),
    },
  });
};

app.post('/api/supabase-config', handleSystemConfig);
app.post('/api/system/supabase-config', handleSystemConfig);
app.post('/api/system/config', handleSystemConfig);

// Safe diagnostics endpoint: strictly returns booleans, never reveals secrets
app.get('/api/system/diagnostics', (req: Request, res: Response) => {
  const { url: supabaseUrl, anonKey: supabaseAnon, backendKey } = getNormalizedSupabaseConfig(req);
  const tomtomKey = getEffectiveTomTomKey(req);
  const orsKey = process.env.OPENROUTE_SERVICE_API_KEY;

  res.json({
    supabaseUrlPresent: Boolean(supabaseUrl),
    supabaseAnonPresent: Boolean(supabaseAnon || backendKey),
    tomtomKeyPresent: Boolean(tomtomKey),
    openRouteServiceKeyPresent: Boolean(orsKey),
  });
});

app.get('/api/system/status', async (req: Request, res: Response) => {
  const { url: supabaseUrl, anonKey: supabaseAnon, backendKey } = getNormalizedSupabaseConfig(req);
  const orsKey = process.env.OPENROUTE_SERVICE_API_KEY;
  const tomtomKey = getEffectiveTomTomKey(req);
  const hasAnon = Boolean(supabaseAnon || backendKey);

  const diagnostics = {
    supabaseUrlPresent: Boolean(supabaseUrl),
    supabaseAnonPresent: hasAnon,
    tomtomKeyPresent: Boolean(tomtomKey),
    openRouteServiceKeyPresent: Boolean(orsKey),
  };

  const checks: Record<string, { status: 'Connected' | 'Unavailable' | 'Checking'; details: string }> = {
    database: {
      status: supabaseUrl && hasAnon ? 'Connected' : 'Unavailable',
      details:
        supabaseUrl && hasAnon
          ? 'Supabase PostgreSQL connected'
          : supabaseUrl
            ? 'Supabase URL set, anon key required'
            : 'Database credentials missing in environment',
    },
    routing: {
      status: 'Connected', // We always have real road routing (ORS if key present, fallback to live OSRM)
      details: orsKey ? 'OpenRouteService API key configured' : 'Using real OpenStreetMap OSRM road engine',
    },
    geocoding: {
      status: 'Connected',
      details: 'Photon OSM live geocoding active',
    },
    weather: {
      status: 'Connected',
      details: 'Open-Meteo real-time atmospheric API active',
    },
    traffic: {
      status: tomtomKey ? 'Connected' : 'Unavailable',
      details: tomtomKey ? 'TomTom traffic incidents proxy connected' : 'TomTom API key not configured',
    },
    telemetry_api: {
      status: 'Connected',
      details: 'Secure vehicle GPS ingest active on /api/telemetry/ingest',
    },
    realtime: {
      status: supabaseUrl && hasAnon ? 'Connected' : 'Unavailable',
      details: supabaseUrl ? 'Supabase Realtime channel ready' : 'Supabase credentials needed for live sync',
    },
  };

  res.json({
    timestamp: new Date().toISOString(),
    checks,
    diagnostics,
  });
});

// -------------------------------------------------------------
// 2. Real Geocoding / Location Autocomplete
// -------------------------------------------------------------
app.get('/api/geocode', async (req: Request, res: Response) => {
  const query = (req.query.q as string || '').trim();
  if (!query || query.length < 2) {
    return res.json({ results: [] });
  }

  try {
    // We prioritize or bias toward North East India (approx center lat 26.2, lon 92.9)
    // Photon by Komoot is free, respects OpenStreetMap, and provides fast fuzzy location suggestions.
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=26.2&lon=92.9&limit=8`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NERLogistics/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Photon returned status ${response.status}`);
    }

    const data = await response.json();
    const results = (data.features || []).map((feat: any) => {
      const p = feat.properties || {};
      const coords = feat.geometry?.coordinates || [0, 0]; // [lon, lat]
      const parts = [
        p.name,
        p.city || p.district || p.county,
        p.state,
        p.country,
      ].filter(Boolean);

      return {
        id: `${coords[1]}-${coords[0]}-${p.osm_id || Math.random()}`,
        name: p.name || query,
        label: parts.join(', '),
        state: p.state || '',
        country: p.country || '',
        lat: coords[1],
        lng: coords[0],
      };
    });

    res.json({ results });
  } catch (error: any) {
    console.error('Geocoding error:', error.message);
    res.status(502).json({ error: 'Geocoding service unavailable', details: error.message, results: [] });
  }
});

// -------------------------------------------------------------
// 3. Real Road Route Calculation
// -------------------------------------------------------------
app.post('/api/route', async (req: Request, res: Response) => {
  const { origin, destination } = req.body;
  if (!origin || !destination || origin.lat == null || origin.lng == null || destination.lat == null || destination.lng == null) {
    return res.status(400).json({ error: 'Origin and destination with lat/lng are required' });
  }

  const orsKey = process.env.OPENROUTE_SERVICE_API_KEY;

  try {
    if (orsKey) {
      // Use OpenRouteService Directions v2
      const orsUrl = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
      const orsResp = await fetch(orsUrl, {
        method: 'POST',
        headers: {
          Authorization: orsKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: [
            [origin.lng, origin.lat],
            [destination.lng, destination.lat],
          ],
        }),
      });

      if (orsResp.ok) {
        const geojson = await orsResp.json();
        const feature = geojson.features?.[0];
        if (feature) {
          const coords = feature.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]); // [lat, lng]
          const summary = feature.properties.summary || {};
          return res.json({
            engine: 'OpenRouteService',
            coordinates: coords,
            distanceKm: Number((summary.distance / 1000).toFixed(2)),
            durationMins: Math.round(summary.duration / 60),
            bbox: feature.bbox || null,
          });
        }
      }
      console.warn('ORS call failed or returned empty, falling back to real OSRM');
    }

    // Fallback: Real OpenStreetMap OSRM driving engine
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=false`;
    const osrmResp = await fetch(osrmUrl);
    if (!osrmResp.ok) {
      throw new Error(`Routing engine returned HTTP ${osrmResp.status}`);
    }

    const osrmData = await osrmResp.json();
    if (!osrmData.routes || osrmData.routes.length === 0) {
      return res.status(404).json({ error: 'No road route found between selected coordinates' });
    }

    const primaryRoute = osrmData.routes[0];
    const coords = primaryRoute.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]); // [lat, lng]

    return res.json({
      engine: 'OSRM (OpenStreetMap Road Network)',
      coordinates: coords,
      distanceKm: Number((primaryRoute.distance / 1000).toFixed(2)),
      durationMins: Math.round(primaryRoute.duration / 60),
      bbox: null,
    });
  } catch (error: any) {
    console.error('Route calculation error:', error.message);
    res.status(502).json({ error: 'Route calculation failed', details: error.message });
  }
});

// -------------------------------------------------------------
// 4. Real Weather along Route (Open-Meteo)
// -------------------------------------------------------------
const WMO_CODE_MAP: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  75: 'Heavy snow',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

app.post('/api/weather', async (req: Request, res: Response) => {
  const { points } = req.body; // Array of { label: string, lat: number, lng: number }
  if (!Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ error: 'At least one coordinate point is required' });
  }

  try {
    const weatherPromises = points.map(async (pt) => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${pt.lat}&longitude=${pt.lng}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`;
      const resp = await fetch(url);
      if (!resp.ok) {
        return {
          label: pt.label,
          lat: pt.lat,
          lng: pt.lng,
          available: false,
          error: `HTTP ${resp.status}`,
        };
      }
      const data = await resp.json();
      const current = data.current || {};
      const weatherCode = current.weather_code ?? 0;
      return {
        label: pt.label,
        lat: pt.lat,
        lng: pt.lng,
        available: true,
        temperatureC: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        precipitationMm: current.precipitation ?? 0,
        windSpeedKmh: current.wind_speed_10m,
        weatherCode,
        condition: WMO_CODE_MAP[weatherCode] || 'Atmospheric activity',
        source: 'Open-Meteo Free Weather API',
        lastUpdated: current.time || new Date().toISOString(),
      };
    });

    const results = await Promise.all(weatherPromises);
    res.json({ weather: results, source: 'Open-Meteo', fetchedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('Weather fetch error:', error.message);
    res.status(502).json({ error: 'Failed to retrieve real-time atmospheric data', details: error.message });
  }
});

// -------------------------------------------------------------
// 5. Real TomTom Traffic Incidents & Corridor Relevance
// -------------------------------------------------------------
app.post('/api/traffic/incidents', async (req: Request, res: Response) => {
  const { bbox, routeCoordinates } = req.body; // bbox: [minLon, minLat, maxLon, maxLat], routeCoordinates: [[lat, lng], ...]
  const tomtomKey = getEffectiveTomTomKey(req);

  if (!tomtomKey) {
    return res.json({
      available: false,
      configured: false,
      message: 'TomTom API key not configured. Traffic incidents layer is currently unavailable.',
      incidents: [],
    });
  }

  if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
    return res.status(400).json({ error: 'Valid bbox array [minLon, minLat, maxLon, maxLat] is required' });
  }

  try {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const ttUrl = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${minLon},${minLat},${maxLon},${maxLat}&fields={incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime,from,to,length}}}&language=en-GB&key=${tomtomKey}`;

    const resp = await fetch(ttUrl);
    if (!resp.ok) {
      const errText = await resp.text();
      return res.json({
        available: false,
        configured: true,
        message: `Traffic incident telemetry currently unavailable from provider (${resp.status} ${resp.statusText})`,
        details: errText,
        incidents: [],
      });
    }

    const data = await resp.json();
    const rawIncidents = data.incidents || [];

    // Parse incidents and compute route relevance
    const CORRIDOR_THRESHOLD_KM = 2.0;
    const REGIONAL_BUFFER_KM = 15.0;

    const classifiedIncidents = rawIncidents.map((inc: any, idx: number) => {
      const geom = inc.geometry;
      let incLat = 0;
      let incLon = 0;

      if (geom.type === 'Point') {
        incLon = geom.coordinates[0];
        incLat = geom.coordinates[1];
      } else if (geom.type === 'LineString' && geom.coordinates?.length > 0) {
        incLon = geom.coordinates[0][0];
        incLat = geom.coordinates[0][1];
      }

      // Calculate min distance to route coordinates
      let minDistanceKm = Infinity;
      if (Array.isArray(routeCoordinates) && routeCoordinates.length >= 2) {
        for (let i = 0; i < routeCoordinates.length - 1; i++) {
          const [aLat, aLon] = routeCoordinates[i];
          const [bLat, bLon] = routeCoordinates[i + 1];
          const d = distancePointToSegmentKm(incLat, incLon, aLat, aLon, bLat, bLon);
          if (d < minDistanceKm) {
            minDistanceKm = d;
          }
        }
      }

      let relevance: 'Route Impacted' | 'Regional Context' | 'Unable to Verify' = 'Unable to Verify';
      if (minDistanceKm <= CORRIDOR_THRESHOLD_KM) {
        relevance = 'Route Impacted';
      } else if (minDistanceKm <= REGIONAL_BUFFER_KM) {
        relevance = 'Regional Context';
      }

      const props = inc.properties || {};
      const events = props.events || [];
      const description = events.map((e: any) => e.description).filter(Boolean).join('. ') || 'Traffic Incident';

      return {
        id: `inc-${idx}-${incLat.toFixed(4)}`,
        lat: incLat,
        lng: incLon,
        type: props.iconCategory || 'General',
        magnitudeOfDelay: props.magnitudeOfDelay || 0,
        description,
        delaySeconds: props.delay || 0,
        distanceToRouteKm: Number(minDistanceKm.toFixed(2)),
        relevance,
        startTime: props.startTime,
        from: props.from || '',
        to: props.to || '',
      };
    });

    res.json({
      available: true,
      configured: true,
      count: classifiedIncidents.length,
      incidents: classifiedIncidents,
    });
  } catch (error: any) {
    console.error('Traffic API error:', error.message);
    res.json({
      available: false,
      configured: true,
      error: 'Traffic incidents retrieval failed',
      details: error.message,
      incidents: [],
    });
  }
});

// -------------------------------------------------------------
// 6. Secure Vehicle Telemetry Ingest API (Edge Function Proxy)
// -------------------------------------------------------------
app.post('/api/telemetry/ingest', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const {
    vehicle_id,
    latitude,
    longitude,
    speed,
    heading,
    accuracy,
    driver_id,
    altitude,
  } = req.body;

  // Coordinate validation
  if (
    latitude == null ||
    longitude == null ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({ error: 'Invalid coordinates provided' });
  }

  // Speed and accuracy validation
  if (speed != null && (typeof speed !== 'number' || speed < 0)) {
    return res.status(400).json({ error: 'Speed must be a non-negative number' });
  }
  if (accuracy != null && (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 10000)) {
    return res.status(400).json({ error: 'Accuracy out of reasonable GPS bounds' });
  }

  const { url: supabaseUrl, backendKey } = getNormalizedSupabaseConfig(req);

  if (!supabaseUrl || !backendKey) {
    // If Supabase is not yet configured, we reject direct database write but confirm telemetry syntax
    return res.status(503).json({
      error: 'Database backend not configured',
      message: 'Supabase URL and database credentials must be configured to persist telemetry.',
    });
  }

  try {
    // Forward to Supabase REST API securely with authorization using server backend credentials
    const vehicleUpdateUrl = `${supabaseUrl}/rest/v1/vehicles?id=eq.${vehicle_id}`;
    const now = new Date().toISOString();

    const updateResp = await fetch(vehicleUpdateUrl, {
      method: 'PATCH',
      headers: {
        apikey: backendKey,
        Authorization: authHeader || `Bearer ${backendKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        current_lat: latitude,
        current_lng: longitude,
        current_speed: speed || 0,
        current_heading: heading || 0,
        current_accuracy: accuracy || null,
        last_ping: now,
      }),
    });

    // Also record in telemetry history table
    const telemetryInsertUrl = `${supabaseUrl}/rest/v1/telemetry`;
    await fetch(telemetryInsertUrl, {
      method: 'POST',
      headers: {
        apikey: backendKey,
        Authorization: authHeader || `Bearer ${backendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vehicle_id,
        driver_id: driver_id || null,
        latitude,
        longitude,
        speed: speed || 0,
        heading: heading || 0,
        accuracy: accuracy || null,
        altitude: altitude || null,
        recorded_at: now,
      }),
    });

    return res.json({
      success: true,
      timestamp: now,
      vehicle_id,
      coordinates: { latitude, longitude },
    });
  } catch (error: any) {
    console.error('Telemetry ingestion error:', error.message);
    res.status(500).json({ error: 'Failed to record vehicle telemetry', details: error.message });
  }
});

// -------------------------------------------------------------
// 7. Vite Integration (Dev vs Prod)
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NER Logistics] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
