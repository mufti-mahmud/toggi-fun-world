import React, { useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { X, Printer, Copy, Check, FileSpreadsheet } from 'lucide-react';

export const ExportSummaryModal: React.FC = () => {
  const { isExportModalOpen, closeExportModal, issues, currentUser, isAgm, userAssignedParkId, parks } = usePortal();
  const [copied, setCopied] = useState(false);

  if (!isExportModalOpen) return null;

  const exportedIssues = isAgm ? issues : issues.filter(i => i.parkId === userAssignedParkId);
  const assignedParkName = parks.find(p => p.id === userAssignedParkId)?.name || 'Assigned Facility';

  const pending = exportedIssues.filter(i => i.status === 'Pending Directive');
  const inProgress = exportedIssues.filter(i => i.status === 'In Progress');
  const completed = exportedIssues.filter(i => i.status === 'Completed');

  const handleCopyText = () => {
    let report = `========================================================\n`;
    report += `TANVIR BASHUNDHARA GROUP (TBG)\n`;
    report += isAgm
      ? `Engineering directives and issue log for Bashundhara Central Park & Toggi Fun World (AGM Scope)\n`
      : `Engineering directives and issue log for ${assignedParkName}\n`;
    report += `========================================================\n\n`;

    report += `EXECUTIVE SUMMARY:\n`;
    report += `- Total Concerns Logged: ${exportedIssues.length}\n`;
    report += `- Awaiting Directives: ${pending.length}\n`;
    report += `- Active In-Progress (Under Directive): ${inProgress.length}\n`;
    report += `- Completed & Certified: ${completed.length}\n\n`;

    if (exportedIssues.length === 0) {
      report += `No active issues currently logged for this scope.\n`;
    } else {
      report += `DETAILED ISSUES LOG:\n`;
      exportedIssues.forEach(issue => {
        report += `--------------------------------------------------------\n`;
        report += `[${issue.id}] [${issue.severity}] [${issue.status.toUpperCase()}]\n`;
        report += `Park: ${issue.parkName}\n`;
        report += `Attraction: ${issue.rideName}\n`;
        report += `Title: ${issue.title}\n`;
        report += `Reported By: ${issue.reportedByEngineerName} (${issue.reportedAt})\n`;
        if (issue.agmDirective) {
          report += `AGM Directive: "${issue.agmDirective}" (${issue.agmDirectiveAuthor})\n`;
        }
        if (issue.resolutionSummary) {
          report += `Resolution: "${issue.resolutionSummary}"\n`;
        }
        report += `\n`;
      });
    }

    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8 print:border-none print:shadow-none print:bg-white print:text-black">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Tanvir Bashundhara Group (TBG) - Issue Log
              </h2>
              <p className="text-xs text-slate-400">
                {isAgm
                  ? 'Engineering directives and issue log for Bashundhara Central Park & Toggi Fun World'
                  : `Engineering directives and issue log for ${assignedParkName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied to Clipboard' : 'Copy Plaintext'}
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <button
              onClick={closeExportModal}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-6 space-y-6 max-h-[calc(85vh-130px)] overflow-y-auto print:max-h-none print:overflow-visible">
          {/* Header Block */}
          <div className="border-b border-slate-800 pb-4">
            <h1 className="text-xl font-bold text-white tracking-tight">
              Tanvir Bashundhara Group (TBG)
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
              <span>
                {isAgm
                  ? 'Executive directives & issue log for Bashundhara Central Park & Toggi Fun World'
                  : `Engineering directives & issue log for ${assignedParkName}`}
              </span>
            </div>
          </div>

          {/* Metric Summary */}
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Total Issues</div>
              <div className="text-xl font-bold font-mono text-white mt-0.5">{exportedIssues.length}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/80 border border-amber-500/40">
              <div className="text-[10px] text-amber-400 uppercase font-mono">Pending Directive</div>
              <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">{pending.length}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/80 border border-sky-500/40">
              <div className="text-[10px] text-sky-400 uppercase font-mono">In Progress</div>
              <div className="text-xl font-bold font-mono text-sky-400 mt-0.5">{inProgress.length}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/80 border border-emerald-500/40">
              <div className="text-[10px] text-emerald-400 uppercase font-mono">Completed</div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{completed.length}</div>
            </div>
          </div>

          {/* Issues Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300">
              Master Issue & Directive Registry
            </h3>

            {exportedIssues.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-800/40 rounded-xl border border-slate-800">
                No active issues recorded in the log for this facility. All systems nominal.
              </div>
            ) : (
              <div className="space-y-3">
                {exportedIssues.map(issue => (
                  <div
                    key={issue.id}
                    className="p-3 rounded-xl bg-slate-850 border border-slate-700/80 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">{issue.id}</span>
                        <span className="text-slate-300 font-medium">[{issue.parkName}] {issue.rideName}</span>
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {issue.status}
                      </span>
                    </div>

                    <div className="text-slate-200 font-semibold">{issue.title}</div>
                    <div className="text-slate-400 text-[11px]">{issue.description}</div>

                    {issue.agmDirective && (
                      <div className="p-2 rounded bg-slate-900 border border-amber-500/30 text-amber-300/90 font-mono text-[11px] mt-1">
                        AGM DIRECTIVE: "{issue.agmDirective}"
                      </div>
                    )}

                    {issue.resolutionSummary && (
                      <div className="p-2 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] mt-1">
                        RESOLUTION: "{issue.resolutionSummary}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
