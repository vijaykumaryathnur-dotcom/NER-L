import React, { useState, useEffect } from 'react';
import {
  Menu,
  X,
  Truck,
  Package,
  Navigation,
  Smartphone,
  Radio,
  RefreshCw,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { NavigationTab } from './types';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { RoutePlannerView } from './components/RoutePlannerView';
import { LiveFleetView } from './components/LiveFleetView';
import { ShipmentsView } from './components/ShipmentsView';
import { AnalyticsView } from './components/AnalyticsView';
import { DriverPortalView } from './components/DriverPortalView';
import { SystemStatusView } from './components/SystemStatusView';
import { useSupabaseData } from './hooks/useSupabaseData';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const {
    vehicles,
    shipments,
    loading,
    schemaStatus,
    realtimeStatus,
    metrics,
    refreshAll,
  } = useSupabaseData();

  // Support direct URL path like /driver or #driver for phone convenience
  useEffect(() => {
    const path = window.location.pathname;
    const hash = window.location.hash;
    if (path.includes('/driver') || hash.includes('driver')) {
      setCurrentTab('driver');
    }
  }, []);

  const handleTabChange = (tab: NavigationTab) => {
    setCurrentTab(tab);
    if (tab === 'driver') {
      window.location.hash = 'driver';
    } else if (window.location.hash === '#driver') {
      window.location.hash = '';
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleTabChange}
        realtimeStatus={realtimeStatus}
        liveVehiclesCount={metrics.liveVehicles}
        activeShipmentsCount={metrics.activeShipments}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-950/60">
        {/* Top Operational Header */}
        <header className="h-14 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button
              id="mobile-menu-toggle"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-900 lg:hidden"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold hidden sm:inline">
                NER Logistics
              </span>
              <span className="text-slate-600 hidden sm:inline">&bull;</span>
              <h1 className="text-xs sm:text-sm font-semibold text-slate-200 capitalize tracking-wide">
                {currentTab === 'dashboard'
                  ? 'Command Center'
                  : currentTab === 'routes'
                  ? 'Intelligent Route Planner'
                  : currentTab === 'fleet'
                  ? 'Live Carrier Fleet'
                  : currentTab === 'shipments'
                  ? 'Freight Shipments'
                  : currentTab === 'analytics'
                  ? 'Operational Analytics'
                  : currentTab === 'driver'
                  ? 'Driver Phone GPS Console'
                  : 'System Status & Connectivity'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Real Data indicator */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real Live Data</span>
            </div>

            {/* Driver Portal Shortcut */}
            <button
              id="header-driver-btn"
              onClick={() => handleTabChange('driver')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                currentTab === 'driver'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Driver Portal</span>
            </button>

            {/* Refresh */}
            <button
              id="header-refresh-btn"
              onClick={refreshAll}
              title="Refresh all database records"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-850 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </header>

        {/* Database Schema Setup Banner if Tables Need Creation */}
        {schemaStatus === 'SCHEMA_MISSING' && (
          <div className="bg-amber-950/90 border-b border-amber-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200 z-10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              <span>
                <strong>Supabase Project Connected:</strong> Database tables (<code>vehicles</code>, <code>shipments</code>, <code>telemetry</code>) are ready to be created.
              </span>
            </div>
            <button
              onClick={() => handleTabChange('status')}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded transition-colors text-[11px] cursor-pointer"
            >
              Open SQL Setup & Schema
            </button>
          </div>
        )}

        {/* Dynamic View Body */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {currentTab === 'dashboard' && (
            <DashboardView
              vehicles={vehicles}
              shipments={shipments}
              loading={loading}
              realtimeStatus={realtimeStatus}
              metrics={metrics}
              onSelectTab={handleTabChange}
              onRefresh={refreshAll}
            />
          )}

          {currentTab === 'routes' && <RoutePlannerView />}

          {currentTab === 'fleet' && (
            <LiveFleetView
              vehicles={vehicles}
              loading={loading}
              onRefresh={refreshAll}
            />
          )}

          {currentTab === 'shipments' && (
            <ShipmentsView
              shipments={shipments}
              vehicles={vehicles}
              loading={loading}
              onRefresh={refreshAll}
            />
          )}

          {currentTab === 'analytics' && (
            <AnalyticsView
              vehicles={vehicles}
              shipments={shipments}
              onRefresh={refreshAll}
            />
          )}

          {currentTab === 'driver' && (
            <DriverPortalView
              vehicles={vehicles}
              onRefresh={refreshAll}
            />
          )}

          {currentTab === 'status' && (
            <SystemStatusView onConfigChanged={refreshAll} />
          )}
        </div>
      </main>
    </div>
  );
}
