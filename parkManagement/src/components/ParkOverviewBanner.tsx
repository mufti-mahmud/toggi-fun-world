import React, { useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { MapPin, HardHat, Lock, AlertCircle } from 'lucide-react';
import { ParkId } from '../types';

export const ParkOverviewBanner: React.FC = () => {
  const { parks, issues, engineers, filters, setFilters, openAddEngineerModal, isAgm, userAssignedParkId, currentUser } = usePortal();
  const [restrictedNotice, setRestrictedNotice] = useState('');

  const getParkStats = (parkId: ParkId) => {
    const parkIssues = issues.filter(i => i.parkId === parkId);
    const pending = parkIssues.filter(i => i.status === 'Pending Directive').length;
    const inProgress = parkIssues.filter(i => i.status === 'In Progress').length;
    const completed = parkIssues.filter(i => i.status === 'Completed').length;
    const parkEngineers = engineers.filter(e => e.parkId === parkId);
    return { parkIssues, pending, inProgress, completed, parkEngineers };
  };

  const handleSelectPark = (parkId: ParkId) => {
    if (!isAgm) {
      if (parkId !== userAssignedParkId) {
        setRestrictedNotice('Restricted: Only AGM can access and view issues across both parks.');
        setTimeout(() => setRestrictedNotice(''), 4000);
        return;
      }
      return;
    }
    if (filters.parkId === parkId) {
      setFilters(prev => ({ ...prev, parkId: 'all' }));
    } else {
      setFilters(prev => ({ ...prev, parkId }));
    }
  };

  return (
    <div className="mb-6">
      {restrictedNotice && (
        <div className="mb-3 p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-300 flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{restrictedNotice}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Tanvir Bashundhara Group (TBG)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Bashundhara Central Park &amp; Toggi Fun World
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAgm ? (
            <button
              onClick={() => setFilters(prev => ({ ...prev, parkId: 'all' }))}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                filters.parkId === 'all'
                  ? 'bg-amber-400 text-slate-950 border-amber-400 font-semibold'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
              }`}
            >
              Both Parks (Combined)
            </button>
          ) : (
            <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/40 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 shadow-sm">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>{currentUser.parkName || (userAssignedParkId === 'bashundhara-central' ? 'Bashundhara Central Park' : 'Toggi Fun World')}</span>
              <span className="text-[10px] text-slate-400 font-normal">· Only AGM views Both Parks</span>
            </div>
          )}
          <button
            onClick={() => openAddEngineerModal(isAgm ? undefined : userAssignedParkId)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <HardHat className="w-3.5 h-3.5 text-amber-400" />
            + Add Engineer
          </button>
        </div>
      </div>

      {/* Two Parks Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {parks.map(park => {
          const stats = getParkStats(park.id);
          const isSelected = filters.parkId === park.id;

          return (
            <div
              key={park.id}
              onClick={() => handleSelectPark(park.id)}
              className={`group relative overflow-hidden rounded-2xl border cursor-pointer transition-all p-4 ${
                isSelected
                  ? 'border-amber-400 ring-2 ring-amber-400/80 bg-slate-850 shadow-xl'
                  : 'border-slate-800 bg-slate-800/60 hover:border-slate-700 hover:bg-slate-800/90'
              }`}
            >
              {/* Landscape Photograph (Preserving full width so Toggi Fun World logo is visible) */}
              <div className="relative w-full h-36 sm:h-44 rounded-xl overflow-hidden bg-black border border-slate-700/80 mb-3.5 shadow-md flex items-center justify-center">
                <img
                  src={park.image}
                  alt={park.name}
                  referrerPolicy="no-referrer"
                  className={`w-full h-full ${
                    park.id === 'toggi-fun-world'
                      ? 'object-contain bg-black'
                      : 'object-cover'
                  } transition-transform duration-500 group-hover:scale-105`}
                />

                {/* Location Badge bottom-left */}
                <div className="absolute bottom-2 left-2 z-20 flex items-center">
                  <span className="text-[11px] text-slate-100 flex items-center gap-1.5 font-medium bg-slate-900/90 backdrop-blur-md px-2 py-0.5 rounded border border-slate-700/90 shadow">
                    <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                    {park.shortLocation}
                  </span>
                </div>
              </div>

              {/* Park Title and Filter Action Indicator */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-3 px-0.5">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
                  {park.name}
                </h2>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all inline-flex items-center gap-1.5 self-start sm:self-auto ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold shadow-sm'
                      : !isAgm && park.id !== userAssignedParkId
                      ? 'bg-slate-900/60 text-slate-500 border-slate-800'
                      : 'bg-slate-900/80 text-amber-400 border-slate-700/80 group-hover:border-amber-400/50'
                  }`}
                >
                  {isSelected ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
                      Filter Active (Showing this park)
                    </>
                  ) : !isAgm && park.id !== userAssignedParkId ? (
                    <>
                      <Lock className="w-3 h-3 text-slate-500" />
                      Restricted (AGM Only)
                    </>
                  ) : (
                    'Click to filter concerns →'
                  )}
                </span>
              </div>

              {/* Operations Breakdown */}
              <div className="grid grid-cols-4 gap-2 text-center pt-3 border-t border-slate-800/80">
                <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium truncate">Pending Directive</div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-amber-400 tabular-nums">
                    {stats.pending}
                  </div>
                  <div className="text-[10px] text-amber-400/80">Needs Action</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium truncate">In Progress</div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-sky-400 tabular-nums">
                    {stats.inProgress}
                  </div>
                  <div className="text-[10px] text-slate-400">Under Directive</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium truncate">Completed</div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-emerald-400 tabular-nums">
                    {stats.completed}
                  </div>
                  <div className="text-[10px] text-slate-400">Signed Off</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium truncate">Engineers</div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-slate-200 tabular-nums">
                    {stats.parkEngineers.length}
                  </div>
                  <div className="text-[10px] text-slate-400">On Roster</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
