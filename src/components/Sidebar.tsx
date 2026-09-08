import React from 'react';
import {
  LayoutDashboard,
  Navigation,
  Truck,
  Package,
  BarChart3,
  Smartphone,
  Server,
  Radio,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { NavigationTab } from '../types';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  realtimeStatus: 'SUBSCRIBED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR' | 'UNCONFIGURED';
  liveVehiclesCount: number;
  activeShipmentsCount: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  realtimeStatus,
  liveVehiclesCount,
  activeShipmentsCount,
  isOpenMobile,
  onCloseMobile,
}) => {
  const navItems: { id: NavigationTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number | string }[] = [
    { id: 'dashboard', label: 'Command Center', icon: LayoutDashboard },
    { id: 'routes', label: 'Route Planner', icon: Navigation },
    {
      id: 'fleet',
      label: 'Live Fleet',
      icon: Truck,
      badge: liveVehiclesCount > 0 ? `${liveVehiclesCount} Live` : undefined,
    },
    {
      id: 'shipments',
      label: 'Shipments',
      icon: Package,
      badge: activeShipmentsCount > 0 ? `${activeShipmentsCount} Active` : undefined,
    },
    { id: 'analytics', label: 'Operational Analytics', icon: BarChart3 },
    { id: 'driver', label: 'Driver Portal (GPS)', icon: Smartphone },
    { id: 'status', label: 'System & Connectivity', icon: Server },
  ];

  const getRealtimePill = () => {
    switch (realtimeStatus) {
      case 'SUBSCRIBED':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-[11px] font-medium text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Realtime Live</span>
          </div>
        );
      case 'CONNECTING':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-950/80 border border-amber-800/80 text-[11px] font-medium text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>Connecting...</span>
          </div>
        );
      case 'DISCONNECTED':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-950/80 border border-rose-800/80 text-[11px] font-medium text-rose-300">
            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
            <span>Sync Interrupted</span>
          </div>
        );
      case 'UNCONFIGURED':
      default:
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
            <span>DB Standby</span>
          </div>
        );
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-slate-950/95 backdrop-blur-md border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center text-slate-950">
              <Zap className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black tracking-wider text-base text-slate-100 font-mono">NER LOGISTICS</span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  PROD
                </span>
              </div>
              <p className="text-[11px] text-slate-400 tracking-tight mt-0.5">
                North East India Intelligent Corridor
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            {getRealtimePill()}
            <span className="text-[10px] font-mono text-slate-500">8 NE States</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 font-mono">
            Logistics Modules
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors group ${
                  isActive
                    ? 'bg-slate-900 text-emerald-400 border border-emerald-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-300'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 border border-emerald-800 text-emerald-300">
                    {item.badge}
                  </span>
                ) : (
                  <ChevronRight
                    className={`w-3.5 h-3.5 text-slate-600 transition-transform ${
                      isActive ? 'opacity-100 translate-x-0.5 text-emerald-400' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Operational Scope Banner */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 space-y-2">
            <div className="flex items-center gap-1.5 text-slate-300 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real Live Data Engine</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Zero simulated telemetry. Every marker originates from authenticated browser/phone GPS readings.
            </p>
            <div className="flex flex-wrap gap-1 pt-1">
              {['AS', 'AR', 'ML', 'MN', 'MZ', 'NL', 'SK', 'TR'].map((st) => (
                <span key={st} className="px-1.5 py-0.5 rounded bg-slate-900 text-[10px] font-mono text-slate-400 border border-slate-800">
                  {st}
                </span>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
