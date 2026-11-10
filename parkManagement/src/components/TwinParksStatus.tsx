import React, { useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { MapPin, HardHat, Plus, Lock, ShieldAlert } from 'lucide-react';
import { PARK_RIDES } from '../data/initialData';
import { ParkId } from '../types';

export const TwinParksStatus: React.FC = () => {
  const { 
    parks, 
    issues, 
    engineers, 
    setFilters, 
    setActiveTab, 
    openNewIssueModal, 
    openAddEngineerModal, 
    isAgm, 
    userAssignedParkId 
  } = usePortal();

  const [accessNotice, setAccessNotice] = useState<string>('');

  const handleFilterParkIssues = (parkId: ParkId, status?: any) => {
    if (!isAgm && parkId !== userAssignedParkId) {
      setAccessNotice('Access Restricted: Non-AGM personnel can only view and manage concerns for their assigned facility. Cross-park oversight is reserved for AGM (Mufti Mahmud Mollah).');
      return;
    }
    setFilters(prev => ({ ...prev, parkId, status: status || 'all' }));
    setActiveTab('issues');
  };

  return (
    <div className="space-y-6">
      {accessNotice && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{accessNotice}</span>
          </div>
          <button 
            onClick={() => setAccessNotice('')}
            className="text-[11px] underline hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Status
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational status and facility engineering profiles for Bashundhara Central Park & Toggi Fun World
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openNewIssueModal()}
            className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            Report Attraction Concern
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {parks.map(park => {
          const isRestrictedForUser = !isAgm && park.id !== userAssignedParkId;
          const parkIssues = issues.filter(i => i.parkId === park.id);
          const pending = parkIssues.filter(i => i.status === 'Pending Directive');
          const inProgress = parkIssues.filter(i => i.status === 'In Progress');
          const completed = parkIssues.filter(i => i.status === 'Completed');
          const parkEngineers = engineers.filter(e => e.parkId === park.id);
          const rides = PARK_RIDES[park.id] || [];

          return (
            <div
              key={park.id}
              className={`rounded-2xl border ${
                isRestrictedForUser ? 'border-slate-800/80 bg-slate-900/60 opacity-90' : 'border-slate-800 bg-slate-850'
              } overflow-hidden shadow-xl flex flex-col justify-between`}
            >
              {/* Photo Banner with High Clarity */}
              <div className="relative w-full h-44 sm:h-52 overflow-hidden bg-black border-b border-slate-800 flex items-center justify-center group">
                <img
                  src={park.image}
                  alt={park.name}
                  referrerPolicy="no-referrer"
                  className={`w-full h-full ${
                    park.id === 'toggi-fun-world' ? 'object-contain bg-black' : 'object-cover'
                  } transition-transform duration-500 hover:scale-105`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none z-10" />

                {isRestrictedForUser && (
                  <div className="absolute top-3 right-3 z-20">
                    <span className="text-[11px] font-bold text-amber-300 bg-slate-950/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-amber-500/40 inline-flex items-center gap-1.5 shadow">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      AGM Oversight Only
                    </span>
                  </div>
                )}

                <div className="absolute bottom-3 left-4 z-20">
                  <span className="text-xs text-slate-100 font-medium bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-slate-700/80 inline-flex items-center gap-1.5 mb-1 shadow">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    {park.shortLocation}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight drop-shadow-md">
                    {park.name}
                  </h3>
                </div>
              </div>

              {/* Park Details Body */}
              <div className="p-5 space-y-4">
                {/* Metric Strip */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <button
                    onClick={() => handleFilterParkIssues(park.id, 'Pending Directive')}
                    className={`p-3 rounded-xl bg-slate-900/80 border ${
                      isRestrictedForUser ? 'border-slate-800 cursor-not-allowed opacity-75' : 'border-slate-800 hover:border-amber-400/50'
                    } transition-colors text-left`}
                  >
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Pending Directive</div>
                    <div className="text-xl font-bold font-mono text-amber-400 tabular-nums">
                      {pending.length}
                    </div>
                    <div className="text-[11px] text-amber-400/90 mt-0.5">
                      {isRestrictedForUser ? 'AGM Only' : 'Click to view →'}
                    </div>
                  </button>

                  <button
                    onClick={() => handleFilterParkIssues(park.id, 'In Progress')}
                    className={`p-3 rounded-xl bg-slate-900/80 border ${
                      isRestrictedForUser ? 'border-slate-800 cursor-not-allowed opacity-75' : 'border-slate-800 hover:border-sky-400/50'
                    } transition-colors text-left`}
                  >
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">In Progress</div>
                    <div className="text-xl font-bold font-mono text-sky-400 tabular-nums">
                      {inProgress.length}
                    </div>
                    <div className="text-[11px] text-sky-400/90 mt-0.5">
                      {isRestrictedForUser ? 'AGM Only' : 'Click to view →'}
                    </div>
                  </button>

                  <button
                    onClick={() => handleFilterParkIssues(park.id, 'Completed')}
                    className={`p-3 rounded-xl bg-slate-900/80 border ${
                      isRestrictedForUser ? 'border-slate-800 cursor-not-allowed opacity-75' : 'border-slate-800 hover:border-emerald-400/50'
                    } transition-colors text-left`}
                  >
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Resolved</div>
                    <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                      {completed.length}
                    </div>
                    <div className="text-[11px] text-emerald-400/90 mt-0.5">
                      {isRestrictedForUser ? 'AGM Only' : 'Click to view →'}
                    </div>
                  </button>
                </div>


                {/* Lead Engineers on Site */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-slate-300 uppercase tracking-wider">
                      Site Engineering Roster ({parkEngineers.length})
                    </span>
                    {(isAgm || park.id === userAssignedParkId) && (
                      <button
                        onClick={() => openAddEngineerModal(park.id)}
                        className="text-amber-400 hover:underline text-[11px]"
                      >
                        + Add Engineer
                      </button>
                    )}
                  </div>
                  {parkEngineers.length === 0 ? (
                    <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 text-xs text-slate-400 text-center">
                      No lead engineers added yet.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {parkEngineers.map(eng => (
                        <div
                          key={eng.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <HardHat className="w-3.5 h-3.5 text-slate-500" />
                            <span className="font-medium text-slate-200">{eng.name}</span>
                            <span className="text-[11px] text-slate-400">({eng.specialty.split(' ')[0]})</span>
                          </div>
                          <span className="font-mono text-[11px] text-amber-400">
                            {eng.radioChannel.split(' ')[0]} {eng.radioChannel.split(' ')[1] || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Location: <span className="text-slate-200 font-medium">{park.shortLocation}</span>
                </span>
                {isRestrictedForUser ? (
                  <span className="font-semibold text-slate-500 flex items-center gap-1.5 cursor-not-allowed">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    AGM Directives Only
                  </span>
                ) : (
                  <button
                    onClick={() => handleFilterParkIssues(park.id)}
                    className="font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    View Facility Concerns →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
