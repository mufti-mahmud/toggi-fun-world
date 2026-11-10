import React, { useState, useEffect } from 'react';
import { usePortal } from '../context/PortalContext';
import { X, Wrench, ShieldAlert, Clock, HardHat, Check, Sparkles, Building2 } from 'lucide-react';
import { IssueSeverity } from '../types';

export const AgmDirectiveModal: React.FC = () => {
  const {
    selectedIssue,
    isAgmDirectiveModalOpen,
    closeAgmDirectiveModal,
    pickIssueAndIssueDirective,
    engineers,
    currentUser,
  } = usePortal();

  const [directive, setDirective] = useState('');
  const [assignedEngineerId, setAssignedEngineerId] = useState('');
  const [targetTime, setTargetTime] = useState('Within next 2 hours');
  const [priority, setPriority] = useState<IssueSeverity>('High');
  const [error, setError] = useState('');

  useEffect(() => {
    if (selectedIssue) {
      setAssignedEngineerId(selectedIssue.reportedByEngineerId || '');
      setPriority(selectedIssue.severity);
      // Pre-fill with reasonable default or existing suggestion
      if (selectedIssue.suggestedAction) {
        setDirective(
          `1. Lockout/tagout safety interlock. 2. ${selectedIssue.suggestedAction} 3. Execute 3 consecutive unweighted test cycles before guest boarding.`
        );
      } else {
        setDirective('');
      }
      setError('');
    }
  }, [selectedIssue]);

  if (!isAgmDirectiveModalOpen || !selectedIssue) return null;

  const parkEngineers = engineers.filter(e => e.parkId === selectedIssue.parkId);

  const PRESET_DIRECTIVES = [
    {
      label: 'Sensor Swap & Test Cycles',
      text: '1. Lockout Block electrical panel. 2. Replace faulty proximity sensor with calibrated spare from Bay B rack. 3. Verify optical alignment and run 5 full empty-train dispatches.',
    },
    {
      label: 'Hydraulic Seal & Recharge',
      text: '1. Isolate hydraulic cylinder loop. 2. Replace damaged high-pressure Viton O-ring seal. 3. Recharge nitrogen accumulator to 150 bar. 4. Pressure test under peak holding load for 30 minutes.',
    },
    {
      label: 'Brake Caliper Pad Replacement',
      text: '1. Tag out brake run. 2. Replace friction brake pad assemblies 3A/3B. 3. Measure caliper clearance with feeler gauges to exactly 14.0mm ±0.2mm. 4. Complete 3 loaded ballast test runs.',
    },
    {
      label: 'Drive Inverter & Motor Test',
      text: '1. Run motor winding insulation Megger test (>200MΩ required). 2. Retorque dynamic braking resistors. 3. Update VFD acceleration ramp to 1.8s. 4. Run 3 complete revolutions under simulated load.',
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directive.trim()) {
      setError('Please provide the AGM directive describing what actions must be taken.');
      return;
    }

    pickIssueAndIssueDirective(selectedIssue.id, directive.trim(), {
      assignedEngineerId: assignedEngineerId || selectedIssue.reportedByEngineerId,
      targetTime,
      priority,
    });

    closeAgmDirectiveModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                AGM Directive Console: Pick Concern
              </h2>
              <div className="flex items-center gap-1.5 text-xs mt-0.5">
                <span className="text-amber-400 font-bold">★ Mufti Mahmud Mollah (AGM)</span>
                <span className="text-slate-400 font-normal">(Assistant General Manager)</span>
              </div>
            </div>
          </div>

          <button
            onClick={closeAgmDirectiveModal}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(85vh-130px)] overflow-y-auto">
          {/* Issue Context Card */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-amber-400 font-bold">{selectedIssue.id}</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-300 font-sans">{selectedIssue.parkName}</span>
              </div>
              <span className="text-[11px] text-slate-400">{selectedIssue.reportedAt}</span>
            </div>

            <div>
              <div className="text-xs font-mono font-bold text-amber-300 uppercase">
                {selectedIssue.rideName}
              </div>
              <div className="text-sm font-bold text-white mt-0.5">
                {selectedIssue.title}
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {selectedIssue.description}
            </p>

            {selectedIssue.diagnosticCode && (
              <div className="text-[11px] font-mono text-slate-300 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-700/70">
                Diagnostic Code: <span className="text-amber-400">{selectedIssue.diagnosticCode}</span>
              </div>
            )}

            <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-1">
              <HardHat className="w-3.5 h-3.5 text-slate-500" />
              <span>Reported by: <span className="text-slate-200 font-medium">{selectedIssue.reportedByEngineerName}</span></span>
            </div>
          </div>

          {/* Quick preset template chips */}
          <div>
            <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <span>Standard Operational Directives (Click to apply):</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_DIRECTIVES.map((item, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setDirective(item.text)}
                  className="px-2.5 py-1 text-xs rounded-md bg-slate-800 border border-slate-700 hover:border-amber-400/50 hover:bg-slate-700/70 text-slate-300 transition-colors text-left"
                >
                  + {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Core Directive Input: "comments what have to do" */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
              AGM Action Directive: What Has To Be Done *
            </label>
            <textarea
              rows={4}
              value={directive}
              onChange={e => {
                setDirective(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. 1. Lockout Station Block 2. 2. Replace primary proximity sensor with spare from Bay B rack 4. 3. Run 5 empty test cycles before reopening."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 leading-relaxed"
            />
            {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
          </div>

          {/* Operational Parameters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Lead Engineer Assignment */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Assign Site Lead
              </label>
              <select
                value={assignedEngineerId}
                onChange={e => setAssignedEngineerId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                {parkEngineers.length > 0 ? (
                  parkEngineers.map(eng => (
                    <option key={eng.id} value={eng.id}>
                      {eng.name} ({eng.specialty.split(' ')[0]})
                    </option>
                  ))
                ) : (
                  <option value="">Duty Lead Engineer</option>
                )}
              </select>
            </div>

            {/* Target Completion Window */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Target Resolution Time
              </label>
              <select
                value={targetTime}
                onChange={e => setTargetTime(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="Within next 1 hour">Immediate: Within next 1 hour</option>
                <option value="Within next 2 hours">Within next 2 hours</option>
                <option value="Before 11:30 AM Park Rush">Before Peak Park Rush</option>
                <option value="By end of day shift (15:00)">By End of Day Shift</option>
                <option value="Scheduled for Night Overhaul">Night Overhaul Maintenance</option>
              </select>
            </div>

            {/* Urgency Confirmation */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Severity Level
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as IssueSeverity)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="Critical">Critical - Ride Stoppage</option>
                <option value="High">High - Prompt Inspection</option>
                <option value="Medium">Medium - Maintenance Due</option>
                <option value="Low">Low - Routine Calibration</option>
              </select>
            </div>
          </div>

          {/* Action note */}
          <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-600/30 text-xs text-sky-300">
            <strong>AGM Workflow Notice:</strong> Submitting will record this directive in the audit trail, assign the engineering team, and transition the issue status to <strong>In Progress</strong>.
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={closeAgmDirectiveModal}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-md"
            >
              <Wrench className="w-3.5 h-3.5 stroke-[2.5]" />
              Authorize Directive & Put In-Progress
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
