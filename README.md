# NER LOGISTICS
### North East India Intelligent Logistics & Fleet Management Platform

An enterprise-grade, real-data logistics management and corridor planning platform engineered specifically for the rugged terrain, monsoons, and high-altitude highway networks of North East India.

---

## ⚡ Quick Start (Run Locally Outside AI Studio)

### 1. Prerequisites
- **Node.js**: Version 18+ or 20+ (with `npm`)

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
```
*(Optional)* Add your Supabase project keys or external routing/traffic keys to `.env`. Even without keys, the app automatically falls back to live OpenStreetMap routing, Photon geocoding, and Open-Meteo atmospheric telemetry.

### 4. Start Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛡️ Real Data Architecture (Anti-Simulation Guarantee)

NER Logistics is strictly engineered around **genuine operational data**:
- **Zero Mock Telemetry**: If 0 vehicles are registered in the database, the dashboard displays 0. No fake GPS pings or synthetic movement are ever generated.
- **Physical GPS Origin**: Live coordinates originate solely from physical device sensors via `navigator.geolocation.watchPosition()`.
- **Actual Highway Corridors**: Routes are calculated through real road networks (OpenRouteService and OpenStreetMap OSRM) with turn-by-turn road polyline geometries.
- **Live Atmospheric Telemetry**: Real-time precipitation, wind speed, relative humidity, and WMO weather codes are queried along route coordinates via Open-Meteo.
- **Corridor vs Regional Traffic Segregation**: Real TomTom traffic incidents are evaluated against the road polyline using segment-to-point distance calculations (<2km = Route Impacted, <15km = Regional Context). If an API key is unconfigured, the system explicitly marks the layer as **Unavailable** rather than inventing incidents.

---

## 🚀 Environment Variables

All sensitive API keys remain securely on the server-side Express proxy. Declare them in your `.env` file or provide Supabase keys via the **System Status & Connectivity** tab in the UI:

```env
# Server Port (fixed to 3000)
PORT=3000

# Supabase Database & Auth (Required for persistent fleet, shipments, and telemetry)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Optional External API Keys (Graceful fallbacks exist if omitted)
OPENROUTE_SERVICE_API_KEY=your_ors_token
TOMTOM_API_KEY=your_tomtom_key
```

### Fallback Behavior:
- **Routing**: If `OPENROUTE_SERVICE_API_KEY` is omitted, the backend automatically routes via the live OpenStreetMap OSRM driving engine.
- **Geocoding**: Uses the live Photon OpenStreetMap geocoding engine biased to North East India coordinates. No API key required.
- **Weather**: Uses Open-Meteo high-resolution surface forecast. No API key required.
- **Traffic**: If `TOMTOM_API_KEY` is omitted, the traffic layer is truthfully marked as *Unavailable*.

---

## 🗄️ Database Setup (Supabase PostgreSQL + PostGIS)

1. Create a free project at [supabase.com](https://supabase.com).
2. Navigate to the **SQL Editor** in your Supabase dashboard.
3. Paste the contents of `supabase/schema.sql` (also available via the **Copy SQL Schema** button in the System Status tab) and run the script:
   - Enables the `postgis` extension.
   - Creates tables: `profiles`, `vehicles`, `shipments`, and `telemetry`.
   - Adds Row Level Security (RLS) policies.
   - Enables Supabase Realtime replication on `vehicles`, `shipments`, and `telemetry`.
4. Enter your **Project URL** and **Anon Key** in the **System Status & Connectivity** tab or your `.env` file.

---

## 📱 4-Step Hackathon Demonstration Protocol (Testing Real GPS)

1. **Step 1: Register a Carrier Unit**
   - In the sidebar, click **Live Fleet** &rarr; **Register Vehicle**.
   - Enter a real registration plate (e.g. `AS-01-EC-4492`) and choose a vehicle category.
   - Observe that the Command Center immediately registers 1 total vehicle with **OFFLINE / NO SIGNAL** status because no GPS ping has been transmitted yet.

2. **Step 2: Connect from a Mobile Phone or Second Browser Tab**
   - Open this application on a physical smartphone (or a separate browser window) and click **Driver Portal** (or navigate to `/driver` or `#driver`).
   - Select the registered vehicle plate from the dropdown.

3. **Step 3: Start Live GPS Transmission**
   - Tap **START LIVE TRACKING**.
   - Grant browser location permissions when prompted.
   - Your device's genuine latitude, longitude, speed, heading, and accuracy (± meters) will stream to `/api/telemetry/ingest` and commit directly to Supabase.

4. **Step 4: Watch Live Dispatch Telemetry**
   - In the main Command Center or Live Fleet view, the vehicle immediately transitions to **LIVE (&lt; 1 min)** with a pulsing green indicator.
   - The interactive Leaflet corridor map automatically renders the vehicle marker at your exact physical location with speed and heading indicators.
   - Tap **STOP LIVE TRACKING** on the driver portal to halt GPS streaming. After 1 minute, the vehicle status will transition to **RECENT**, and after 15 minutes to **OFFLINE**.

---

## 🗺️ Intelligent Route Planner & Corridor Analysis

- **Location Autocomplete**: Live suggestions for towns, districts, and border checkpoints across Assam, Meghalaya, Arunachal Pradesh, Nagaland, Manipur, Mizoram, Tripura, and Sikkim.
- **Turn-by-Turn Road Polylines**: Renders full road geometries with real distance in km and estimated driving durations.
- **Terrain & Monsoon Hazards**: Highlights vulnerable mountain passes (e.g. NH-06 East Jaintia Hills, Sela Pass, Sonapur tunnel, Bhalukpong corridor).
- **Corridor Safety Index**: Dynamically synthesizes real road distance, live atmospheric rain/fog readings along the sampled route, and active traffic obstruction data into an actionable safety rating (Low / Moderate / Elevated / High Risk).

---

## 🏗️ Production Build & Verification

```bash
# Verify TypeScript and lint rules
npm run lint

# Build full-stack application (client bundle + CommonJS server)
npm run build

# Start production server
npm start
```
