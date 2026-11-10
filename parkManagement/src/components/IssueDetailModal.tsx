import React, { useState } from 'react';
import { usePortal, isAgmUser } from '../context/PortalContext';
import {
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  HardHat,
  Wrench,
  Send,
  Building2,
  Check,
  ShieldCheck,
  RotateCcw,
  Calendar,
} from 'lucide-react';
import { IssueStatus, IssueSeverity } from '../types';

export const IssueDetailModal: React.FC = () => {
  const {
    selectedIssue,
    isIssueDetailModalOpen,
    closeIssueDetailModal,
    openAgmDirectiveModal,
    addWorkLog,
    completeIssue,
    reopenIssue,
    currentUser,
  } = usePortal();

  const [newLogNote, setNewLogNote] = useState('');
  const [showCompletionForm, setShowCompletionForm] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [testCycles, setTestCycles] = useState(3);
  const [safetyCleared, setSafetyCleared] = useState(true);
  const [completionNotes, setCompletionNotes] = useState('All mechanical clearances within OEM tolerance. Safety PLC circuits reset.');
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenForm, setShowReopenForm] = useState(false);

  if (!isIssueDetailModalOpen || !selectedIssue) return null;

  const isPending = selectedIssue.status === 'Pending Directive';
  const isInProgress = selectedIssue.status === 'In Progress';
  const isCompleted = selectedIssue.status === 'Completed';

  const handleAddLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogNote.trim()) return;
    addWorkLog(selectedIssue.id, newLogNote.trim());
    setNewLogNote('');
  };

  const handleCompleteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionSummary.trim()) return;
    completeIssue(
      selectedIssue.id,
      resolutionSummary.trim(),
      testCycles,
      completionNotes
    );
    setShowCompletionForm(false);
  };

  const handleReopenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) return;
    reopenIssue(selectedIssue.id, reopenReason.trim());
    setShowReopenForm(false);
    setReopenReason('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded border border-amber-400/20">
              {selectedIssue.id}
            </span>
            <div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>{selectedIssue.parkName}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedIssue.category}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPending && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                Pending Directive
              </span>
            )}
            {isInProgress && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                In Progress
              </span>
            )}
            {isCompleted && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Completed
              </span>
            )}

            <button
              onClick={closeIssueDetailModal}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[calc(85vh-130px)] overflow-y-auto">
          {/* Main Title & Ride Info */}
          <div>
            <div className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wide">
              {selectedIssue.rideName}
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight mt-0.5">
              {selectedIssue.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
              <span>Reported by {selectedIssue.reportedByEngineerName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{selectedIssue.reportedAt}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold text-rose-400">{selectedIssue.severity} Severity</span>
            </div>
          </div>

          {/* Description & Telemetry */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-3">
            <div>
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                Issue Description
              </div>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                {selectedIssue.description}
              </p>
            </div>

            {selectedIssue.diagnosticCode && (
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-300 flex items-center justify-between">
                <span>Diagnostic Sensor Code:</span>
                <span className="text-amber-400 font-bold">{selectedIssue.diagnosticCode}</span>
              </div>
            )}

            {selectedIssue.suggestedAction && (
              <div className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Engineer Suggested Remediation: </span>
                {selectedIssue.suggestedAction}
              </div>
            )}
          </div>

          {/* Pending State Banner & Action */}
          {isPending && (
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  Awaiting Directive
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  This concern has been reported by the site lead engineer and is pending directive before work begins.
                </div>
              </div>

              <button
                onClick={() => {
                  closeIssueDetailModal();
                  openAgmDirectiveModal(selectedIssue);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-md"
              >
                <Wrench className="w-3.5 h-3.5 stroke-[2.5]" />
                Pick & Issue Directive
              </button>
            </div>
          )}

          {/* AGM Directive & Answer Card */}
          {(selectedIssue.latestAgmAnswer || selectedIssue.agmDirective) && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500/60 shadow-lg space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>💡 Official AGM Operational Directive & Answer</span>
                </span>
                <span className="text-[11px] text-amber-400 font-mono">
                  {selectedIssue.latestAgmAnswerAuthor || selectedIssue.agmDirectiveAuthor || 'Mufti Mahmud Mollah (AGM)'} · {selectedIssue.latestAgmAnswerAt || selectedIssue.pickedByAgmAt || 'Active Directive'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white font-medium leading-relaxed bg-slate-950/90 p-3.5 rounded-xl border border-amber-500/40 shadow-inner">
                "{selectedIssue.latestAgmAnswer || selectedIssue.agmDirective}"
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 pt-1 font-mono">
                {selectedIssue.targetResolutionTime && (
                  <span>
                    Deadline: <span className="text-amber-300 font-bold">{selectedIssue.targetResolutionTime}</span>
                  </span>
                )}
                {selectedIssue.assignedLeadEngineerName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Assigned Lead: <span className="text-white font-semibold">{selectedIssue.assignedLeadEngineerName}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Completed Resolution Card */}
          {isCompleted && (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Completed & Verified by Engineering
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {selectedIssue.completedAt}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                {selectedIssue.resolutionSummary}
              </p>
              {selectedIssue.safetySignOff && (
                <div className="mt-2 pt-2 border-t border-emerald-500/20 text-xs text-emerald-300 flex flex-wrap items-center gap-3">
                  <span>Cleared by: {selectedIssue.safetySignOff.verifiedBy && !selectedIssue.safetySignOff.verifiedBy.includes('Tanvir Ahmed') && !selectedIssue.safetySignOff.verifiedBy.includes('AGM Operations') ? selectedIssue.safetySignOff.verifiedBy : 'AGM - Tanvir Bashundhara Group (TBG)'}</span>
                  <span aria-hidden="true">·</span>
                  <span>Test cycles: {selectedIssue.safetySignOff.testCyclesCompleted} passed</span>
                  <span aria-hidden="true">·</span>
                  <span>Clearance granted: {selectedIssue.safetySignOff.clearanceGranted ? 'YES' : 'NO'}</span>
                </div>
              )}
            </div>
          )}

          {/* Completion Form (Drawer inside In Progress) */}
          {isInProgress && !showCompletionForm && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <div className="text-xs text-slate-300">
                Work completed according to AGM directives? Mark this issue resolved.
              </div>
              <button
                onClick={() => setShowCompletionForm(true)}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                Mark Issue Completed
              </button>
            </div>
          )}

          {isInProgress && showCompletionForm && (
            <form onSubmit={handleCompleteSubmit} className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  Engineering Completion & Safety Sign-off
                </h4>
                <button
                  type="button"
                  onClick={() => setShowCompletionForm(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Resolution Summary (What was repaired/calibrated/verified) *
                </label>
                <textarea
                  rows={3}
                  required
                  value={resolutionSummary}
                  onChange={e => setResolutionSummary(e.target.value)}
                  placeholder="e.g. Completed AGM directive: Replaced proximity sensor with spare M18 unit. Verified wiring continuity and completed 5 consecutive dry run train cycles without fault."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Unweighted Test Cycles Completed
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={testCycles}
                    onChange={e => setTestCycles(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Safety Clearance Certification
                  </label>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="clearanceCheck"
                      checked={safetyCleared}
                      onChange={e => setSafetyCleared(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-400 w-4 h-4"
                    />
                    <label htmlFor="clearanceCheck" className="text-xs text-slate-200 cursor-pointer">
                      Safety lockouts removed & certified safe for guest operation
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCompletionForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  Confirm & Close Issue as Completed
                </button>
              </div>
            </form>
          )}

          {/* Reopen form if completed */}
          {isCompleted && !showReopenForm && (
            <div className="flex justify-end pt-1">
              <button
                onClick={() => setShowReopenForm(true)}
                className="text-xs text-slate-400 hover:text-amber-400 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reopen Issue for Further Directives
              </button>
            </div>
          )}

          {isCompleted && showReopenForm && (
            <form onSubmit={handleReopenSubmit} className="p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
              <div className="text-xs font-semibold text-slate-200">Reopen Concern to In-Progress:</div>
              <input
                type="text"
                required
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                placeholder="Reason for reopening (e.g. Recurrence during load cycle, secondary sensor anomaly)..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReopenForm(false)}
                  className="px-3 py-1 text-xs text-slate-400 bg-slate-800 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-xs font-semibold bg-amber-400 text-slate-950 rounded hover:bg-amber-300"
                >
                  Reopen Issue
                </button>
              </div>
            </form>
          )}

          {/* Work Log Timeline */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Operational Activity Trail ({selectedIssue.workLogs.length})
            </h4>

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {selectedIssue.workLogs.map(log => (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg border text-xs ${
                    log.isAgm
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-slate-800/80 border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      {log.isAgm ? (
                        <span className="text-amber-400 font-bold">★ {log.author}</span>
                      ) : (
                        <span>{log.author}</span>
                      )}
                      <span className="text-[11px] text-slate-400 font-normal">({log.role})</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{log.timestamp}</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{log.note}</p>
                </div>
              ))}
            </div>

            {/* Interactive Q&A & Directive Reply Input */}
            <form onSubmit={handleAddLog} className="flex gap-2 pt-1">
              <input
                type="text"
                value={newLogNote}
                onChange={e => setNewLogNote(e.target.value)}
                placeholder={
                  isAgmUser(currentUser)
                    ? "Post AGM Directive / Answer to this Concern..."
                    : "Reply to AGM / Ask follow-up question or update progress..."
                }
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-sans"
              />
              <button
                type="submit"
                disabled={!newLogNote.trim()}
                className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer ${
                  isAgmUser(currentUser)
                    ? "bg-amber-400 hover:bg-amber-300 text-slate-950"
                    : "bg-sky-600 hover:bg-sky-500 text-white"
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isAgmUser(currentUser) ? "Submit AGM Answer" : "Send Reply to AGM"}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
