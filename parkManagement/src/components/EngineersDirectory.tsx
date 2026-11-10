import React, { useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { HardHat, Phone, Radio, Award, Building2, UserPlus, Clock } from 'lucide-react';
import { ParkId } from '../types';

export const EngineersDirectory: React.FC = () => {
  const { engineers, issues, openAddEngineerModal, setFilters, setActiveTab } = usePortal();
  const [selectedPark, setSelectedPark] = useState<'all' | ParkId>('all');

  const filteredEngineers = engineers.filter(e => {
    if (selectedPark === 'all') return true;
    return e.parkId === selectedPark;
  });

  const getEngineerIssues = (engineerId: string) => {
    const reported = issues.filter(i => i.reportedByEngineerId === engineerId);
    const assigned = issues.filter(i => i.assignedLeadEngineerId === engineerId && i.status === 'In Progress');
    return { reportedCount: reported.length, activeAssignedCount: assigned.length };
  };

  const handleFilterIssuesByEngineer = (engineerId: string) => {
    setFilters(prev => ({ ...prev, engineerId, status: 'all' }));
    setActiveTab('issues');
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/80 border border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <HardHat className="w-5 h-5 text-amber-400" />
            Park Lead Engineers
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Site engineering leads for Bashundhara Central Park & Toggi Fun World
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Park Filter */}
          <select
            value={selectedPark}
            onChange={e => setSelectedPark(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
          >
            <option value="all">All Parks ({engineers.length} Engineers)</option>
            <option value="bashundhara-central">Bashundhara Central Park Only</option>
            <option value="toggi-fun-world">Toggi Fun World Only</option>
          </select>

          <button
            onClick={() => openAddEngineerModal(selectedPark === 'all' ? undefined : selectedPark)}
            className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5 stroke-[2.5]" />
            Add Lead Engineer
          </button>
        </div>
      </div>

      {/* Empty State if no engineers */}
      {filteredEngineers.length === 0 ? (
        <div className="p-12 text-center bg-slate-850 border border-slate-800 rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-amber-400">
            <HardHat className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Lead Engineers Enrolled Yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You have a fresh roster. Enroll your site lead engineers for Bashundhara Central Park or Toggi Fun World to assign maintenance directives.
          </p>
          <button
            onClick={() => openAddEngineerModal(selectedPark === 'all' ? undefined : selectedPark)}
            className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5 stroke-[2.5]" />
            Add First Lead Engineer
          </button>
        </div>
      ) : (
        /* Engineers Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEngineers.map(engineer => {
            const { reportedCount, activeAssignedCount } = getEngineerIssues(engineer.id);
            const isCentral = engineer.parkId === 'bashundhara-central';

            return (
              <div
                key={engineer.id}
                className="rounded-xl border border-slate-800 bg-slate-800/60 hover:border-slate-700 p-4 space-y-3 transition-colors flex flex-col justify-between"
              >
                <div>
                  {/* Header Badge */}
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-400">
                      {engineer.badgeNumber}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                          engineer.status === 'On Duty'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : engineer.status === 'Standby'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-slate-700/40 text-slate-400'
                        }`}
                      >
                        {engineer.status}
                      </span>
                    </div>
                  </div>

                  {/* Name & Role */}
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      {engineer.name}
                    </h3>
                    <div className="text-xs font-medium text-amber-300/90 mt-0.5">
                      {engineer.role}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isCentral ? 'Bashundhara Central Park' : 'Toggi Fun World'}</span>
                    </div>
                  </div>

                  {/* Shift & Radio Info */}
                  <div className="mt-3 p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs space-y-1.5 font-mono">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 font-sans flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        Shift:
                      </span>
                      <span className="text-[11px] truncate max-w-[170px] text-right">{engineer.shift}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 font-sans flex items-center gap-1">
                        <Radio className="w-3 h-3 text-slate-400" />
                        Radio:
                      </span>
                      <span className="text-[11px] text-amber-400 truncate max-w-[170px] text-right">
                        {engineer.radioChannel}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 font-sans flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        Phone:
                      </span>
                      <span className="text-[11px] text-slate-300">{engineer.phone}</span>
                    </div>
                  </div>

                  {/* Certifications */}
                  {engineer.certifications.length > 0 && (
                    <div className="mt-2.5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Award className="w-3 h-3 text-amber-400" />
                        Certifications
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {engineer.certifications.map((c, i) => (
                          <span
                            key={i}
                            className="text-[10px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 font-mono"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Actions & Active Issues */}
                <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
                  <div className="text-slate-400 text-[11px]">
                    <span>{reportedCount} reported</span>
                    {activeAssignedCount > 0 && (
                      <span className="text-sky-400 font-bold ml-1.5">
                        · {activeAssignedCount} active in-progress
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleFilterIssuesByEngineer(engineer.id)}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium hover:underline flex items-center gap-1"
                  >
                    View Tasks →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
