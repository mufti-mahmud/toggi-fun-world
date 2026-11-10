import React from 'react';
import { usePortal } from '../context/PortalContext';
import { ParkIssue, IssueSeverity, IssueStatus } from '../types';
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  HardHat,
  MessageSquare,
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  Wrench,
  Check,
  Building2,
  SlidersHorizontal,
} from 'lucide-react';

export const IssueList: React.FC = () => {
  const {
    issues,
    filters,
    isAgm,
    userAssignedParkId,
    openAgmDirectiveModal,
    openIssueDetailModal,
    openNewIssueModal,
    resetFilters,
    currentUser,
  } = usePortal();

  // Apply filters
  const filteredIssues = issues
    .filter(issue => {
      // Security check: Only AGM will see both park all the issue
      if (!isAgm) {
        if (issue.parkId !== userAssignedParkId) return false;
      } else {
        // Park filter for AGM
        if (filters.parkId !== 'all' && issue.parkId !== filters.parkId) return false;
      }
      // Status filter
      if (filters.status !== 'all' && issue.status !== filters.status) return false;
      // Severity filter
      if (filters.severity !== 'all' && issue.severity !== filters.severity) return false;
      // Category filter
      if (filters.category !== 'all' && issue.category !== filters.category) return false;
      // Engineer filter
      if (
        filters.engineerId !== 'all' &&
        issue.reportedByEngineerId !== filters.engineerId &&
        issue.assignedLeadEngineerId !== filters.engineerId
      ) {
        return false;
      }
      // Search query
      if (filters.searchQuery.trim() !== '') {
        const query = filters.searchQuery.toLowerCase();
        const matchesId = issue.id.toLowerCase().includes(query);
        const matchesRide = issue.rideName.toLowerCase().includes(query);
        const matchesTitle = issue.title.toLowerCase().includes(query);
        const matchesDesc = issue.description.toLowerCase().includes(query);
        const matchesPark = issue.parkName.toLowerCase().includes(query);
        const matchesCode = (issue.diagnosticCode || '').toLowerCase().includes(query);
        const matchesEng = issue.reportedByEngineerName.toLowerCase().includes(query);
        if (!matchesId && !matchesRide && !matchesTitle && !matchesDesc && !matchesPark && !matchesCode && !matchesEng) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'newest') return b.id.localeCompare(a.id);
      if (filters.sortBy === 'oldest') return a.id.localeCompare(b.id);
      if (filters.sortBy === 'severity') {
        const weight: Record<IssueSeverity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
        return weight[b.severity] - weight[a.severity];
      }
      if (filters.sortBy === 'rideName') return a.rideName.localeCompare(b.rideName);
      return 0;
    });

  const getSeverityBadge = (severity: IssueSeverity) => {
    switch (severity) {
      case 'Critical':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Critical Stoppage
          </span>
        );
      case 'High':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            High Priority
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            Medium
          </span>
        );
      case 'Low':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-700/50 text-slate-300 border border-slate-600/40">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Routine
          </span>
        );
    }
  };

  const getStatusBadge = (status: IssueStatus) => {
    switch (status) {
      case 'Pending Directive':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            Pending Directive
          </span>
        );
      case 'In Progress':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            In Progress (Directives Active)
          </span>
        );
      case 'Completed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Completed & Cleared
          </span>
        );
    }
  };

  if (filteredIssues.length === 0) {
    const isTotalEmpty = issues.length === 0;
    return (
      <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-3 text-amber-400">
          <SlidersHorizontal className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-white">
          {isTotalEmpty ? 'No Concerns Logged Yet · All Systems Nominal' : 'No Concerns Match Filters'}
        </h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
          {isTotalEmpty
            ? 'Site lead engineers from Bashundhara Central Park and Toggi Fun World can report ride concerns, mechanical maintenance, or electrical safety items here for your directive.'
            : 'There are currently no engineering concerns matching the active filter criteria. Try resetting your search or filter tags.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          {!isTotalEmpty && (
            <button
              onClick={resetFilters}
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Clear All Filters
            </button>
          )}
          <button
            onClick={() => openNewIssueModal()}
            className="px-4 py-2 text-xs font-bold bg-amber-400 text-slate-950 rounded-lg hover:bg-amber-300 transition-colors shadow-sm"
          >
            Report First Concern
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Showing <span className="font-mono text-slate-200 font-bold">{filteredIssues.length}</span> recorded concerns
        </span>
        <span className="font-mono text-[11px]">
          {filteredIssues.filter(i => i.status === 'Pending Directive').length} require directive
        </span>
      </div>

      <div className="space-y-3">
        {filteredIssues.map(issue => {
          const isPending = issue.status === 'Pending Directive';
          const isInProgress = issue.status === 'In Progress';
          const isCompleted = issue.status === 'Completed';

          return (
            <div
              key={issue.id}
              className={`rounded-xl border transition-all duration-150 p-4 sm:p-5 ${
                isPending
                  ? 'bg-slate-800/90 border-amber-500/50 ring-1 ring-amber-500/20 shadow-md shadow-amber-950/20'
                  : isInProgress
                  ? 'bg-slate-800/70 border-sky-500/40 hover:border-sky-500/60'
                  : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Header row: Metadata without pill sandwich */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                    {issue.id}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-300 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-500" />
                    {issue.parkName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{issue.category}</span>
                  {issue.diagnosticCode && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-400 text-[11px]">
                        {issue.diagnosticCode}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {getSeverityBadge(issue.severity)}
                  {getStatusBadge(issue.status)}
                </div>
              </div>

              {/* Title & Ride */}
              <div className="mb-2">
                <div className="text-xs font-mono font-semibold text-amber-300 uppercase tracking-wide">
                  {issue.rideName}
                </div>
                <h3
                  onClick={() => openIssueDetailModal(issue)}
                  className="text-base font-bold text-white tracking-tight hover:text-amber-300 transition-colors cursor-pointer mt-0.5"
                >
                  {issue.title}
                </h3>
              </div>

              {/* Description */}
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3">
                {issue.description}
              </p>

              {/* AGM DIRECTIVE & ANSWER BLOCK (What has to do / Answer to Concern) */}
              {(issue.latestAgmAnswer || issue.agmDirective) && (
                <div className="mb-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/70 border-2 border-amber-500/50 text-xs shadow-md">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-bold text-amber-300 flex items-center gap-1.5">
                      <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>💡 AGM Operational Directive & Answer:</span>
                    </span>
                    <span className="text-[11px] text-amber-400/80 font-mono">
                      {issue.latestAgmAnswerAuthor || issue.agmDirectiveAuthor || 'Mufti Mahmud Mollah (AGM)'}
                      {issue.latestAgmAnswerAt ? ` · ${issue.latestAgmAnswerAt}` : ''}
                    </span>
                  </div>
                  <p className="text-white text-xs sm:text-sm font-medium leading-relaxed bg-slate-950/90 p-2.5 rounded-lg border border-amber-500/30">
                    "{issue.latestAgmAnswer || issue.agmDirective}"
                  </p>
                  {issue.targetResolutionTime && (
                    <div className="mt-2 text-[11px] text-slate-300 font-mono flex items-center justify-between flex-wrap gap-2">
                      <span>Target deadline: <strong className="text-amber-300">{issue.targetResolutionTime}</strong></span>
                      {issue.assignedLeadEngineerName && (
                        <span>Assigned Lead: <strong className="text-white">{issue.assignedLeadEngineerName}</strong></span>
                      )}
                    </div>
                  )}
                  {currentUser?.name && issue.reportedByEngineerName && currentUser.name.toLowerCase().includes(issue.reportedByEngineerName.toLowerCase().split(' ')[0]) && (
                    <div className="mt-2 pt-1.5 border-t border-amber-500/30 flex items-center justify-between text-[11px]">
                      <span className="text-amber-300 font-semibold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Answer provided for your raised concern. Click to view full thread or reply.</span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* RESOLUTION BLOCK (If completed) */}
              {isCompleted && issue.resolutionSummary && (
                <div className="mb-3 p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      Resolution & Safety Clearance Summary
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {issue.completedAt}
                    </span>
                  </div>
                  <p className="text-slate-200 leading-relaxed">
                    {issue.resolutionSummary}
                  </p>
                  {issue.safetySignOff && (
                    <div className="mt-1 text-[11px] text-emerald-300 font-mono">
                      ✓ Cleared by: {issue.safetySignOff.verifiedBy && !issue.safetySignOff.verifiedBy.includes('Tanvir Ahmed') && !issue.safetySignOff.verifiedBy.includes('AGM Operations') ? issue.safetySignOff.verifiedBy : 'AGM - Tanvir Bashundhara Group (TBG)'} ({issue.safetySignOff.testCyclesCompleted} test cycles passed)
                    </div>
                  )}
                </div>
              )}

              {/* Footer info & Action buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-700/60 text-xs">
                {/* Reported by */}
                <div className="flex items-center gap-2 text-slate-400">
                  <HardHat className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>
                    Reported by <span className="text-slate-200 font-medium">{issue.reportedByEngineerName}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[11px]">{issue.reportedAt}</span>
                  {issue.workLogs.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <MessageSquare className="w-3 h-3" />
                        {issue.workLogs.length} updates
                      </span>
                    </>
                  )}
                </div>

                {/* Primary Action Button */}
                <div className="flex items-center gap-2 shrink-0">
                  {isPending && (
                    <button
                      onClick={() => openAgmDirectiveModal(issue)}
                      className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Wrench className="w-3.5 h-3.5 stroke-[2.5]" />
                      Pick Issue & Comments What To Do
                    </button>
                  )}

                  {isInProgress && (
                    <button
                      onClick={() => openIssueDetailModal(issue)}
                      className="px-3 py-1.5 text-xs font-semibold text-sky-300 bg-sky-950/80 hover:bg-sky-900 border border-sky-600/50 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Add Work Log / Mark Completed
                    </button>
                  )}

                  {isCompleted && (
                    <button
                      onClick={() => openIssueDetailModal(issue)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Inspect Sign-off
                    </button>
                  )}

                  <button
                    onClick={() => openIssueDetailModal(issue)}
                    className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700/60 transition-colors"
                    title="View Full History"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
