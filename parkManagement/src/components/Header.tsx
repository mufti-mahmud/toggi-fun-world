import React from 'react';
import { usePortal } from '../context/PortalContext';
import { Plus, FileSpreadsheet } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    openNewIssueModal,
    openAddEngineerModal,
    openExportModal,
    issues,
    currentUser,
  } = usePortal();

  const pendingCount = issues.filter(i => i.status === 'Pending Directive').length;

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6 h-16">
          {/* Zone 1: TBG Logo & Tanvir Bashundhara Group (TBG) */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-10 w-auto bg-white px-2.5 py-0.5 rounded-lg border border-slate-700 shadow-sm flex items-center justify-center shrink-0">
              <img
                src="/assets/aistudio/TBG_7e8eece1.JPG"
                alt="TBG Logo"
                className="h-8 w-auto object-contain"
              />
            </div>
            <div className="text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap">
              Tanvir Bashundhara Group (TBG)
            </div>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <button
              onClick={() => setActiveTab('issues')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
                activeTab === 'issues' ? 'text-amber-400 font-semibold' : ''
              }`}
            >
              Issues & Directives
              {pendingCount > 0 && (
                <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded">
                  {pendingCount} new
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('engineers')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'engineers' ? 'text-amber-400 font-semibold' : ''
              }`}
            >
              Lead Engineers
            </button>
            <button
              onClick={() => setActiveTab('parks')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'parks' ? 'text-amber-400 font-semibold' : ''
              }`}
            >
              Status
            </button>
            <button
              onClick={openExportModal}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 text-slate-300 flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-400" />
              Issue Log
            </button>
          </nav>

          {/* Zone 3: Post-Login User Profile (Name, Designation, Park Name) & Actions */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex flex-col text-right">
              <span className="text-xs sm:text-sm font-bold text-amber-400 flex items-center justify-end gap-1.5">
                <span className="text-amber-300">★</span>
                <span>{currentUser.name}</span>
              </span>
              <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-300">
                <span className="font-semibold text-sky-400">{currentUser.title || currentUser.role}</span>
                <span className="text-slate-600">·</span>
                <span className="text-emerald-400 font-medium">{currentUser.parkName || 'TBG Twin Parks'}</span>
              </div>
            </div>

            <button
              onClick={() => openNewIssueModal()}
              className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">Report Concern</span>
              <span className="sm:hidden">Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile user profile strip: Name, Designation, Park Name */}
      <div className="sm:hidden px-4 py-1.5 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-amber-300 font-semibold truncate">
          <span>★</span>
          <span className="truncate">{currentUser.name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[10px] shrink-0">
          <span className="text-sky-300">{currentUser.title || currentUser.role}</span>
          <span>•</span>
          <span className="text-emerald-300">{currentUser.parkName || 'TBG Twin Parks'}</span>
        </div>
      </div>

      {/* Mobile nav subbar */}
      <div className="md:hidden flex items-center justify-between px-4 py-2 border-t border-slate-800 bg-slate-900 text-xs">
        <button
          onClick={() => setActiveTab('issues')}
          className={`py-1 ${activeTab === 'issues' ? 'text-amber-400 font-bold' : 'text-slate-400'}`}
        >
          Issues ({issues.length})
        </button>
        <button
          onClick={() => setActiveTab('engineers')}
          className={`py-1 ${activeTab === 'engineers' ? 'text-amber-400 font-bold' : 'text-slate-400'}`}
        >
          Engineers
        </button>
        <button
          onClick={() => setActiveTab('parks')}
          className={`py-1 ${activeTab === 'parks' ? 'text-amber-400 font-bold' : 'text-slate-400'}`}
        >
          Status
        </button>
        <button onClick={() => openAddEngineerModal()} className="py-1 text-slate-300 font-medium">
          + Add Eng
        </button>
      </div>
    </header>
  );
};
