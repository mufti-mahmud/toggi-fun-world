import React, { useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { Search, RotateCcw, Filter, AlertCircle, Clock, CheckCircle2, Building2, Plus, X, Trash2, Tag } from 'lucide-react';
import { IssueStatus, IssueSeverity, IssueCategory, ParkId } from '../types';

const SEVERITIES: IssueSeverity[] = ['Critical', 'High', 'Medium', 'Low'];

export const IssueFilterBar: React.FC = () => {
  const {
    filters,
    setFilters,
    resetFilters,
    issues,
    engineers,
    categories,
    addCategory,
    removeCategory,
    openCategoryManagerModal,
    isAgm,
    userAssignedParkId,
    currentUser,
  } = usePortal();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [confirmDeleteActiveCat, setConfirmDeleteActiveCat] = useState(false);

  const relevantIssues = isAgm ? issues : issues.filter(i => i.parkId === userAssignedParkId);
  const totalCount = relevantIssues.length;
  const pendingCount = relevantIssues.filter(i => i.status === 'Pending Directive').length;
  const inProgressCount = relevantIssues.filter(i => i.status === 'In Progress').length;
  const completedCount = relevantIssues.filter(i => i.status === 'Completed').length;

  const hasActiveFilters =
    filters.searchQuery !== '' ||
    filters.parkId !== 'all' ||
    filters.status !== 'all' ||
    filters.severity !== 'all' ||
    filters.category !== 'all' ||
    filters.engineerId !== 'all' ||
    filters.sortBy !== 'newest';

  return (
    <div className="bg-slate-800/80 border border-slate-800 rounded-xl p-3 sm:p-4 mb-4 space-y-3">
      {/* Top Row: Search & Quick Status Tabs */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
            placeholder="Search by ride name, issue ID (e.g. ISSUE-8821), sensor code, or keyword..."
            className="w-full bg-slate-900/90 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
          {filters.searchQuery && (
            <button
              onClick={() => setFilters(prev => ({ ...prev, searchQuery: '' }))}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Segmented Filter */}
        <div className="flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-700/80 rounded-lg shrink-0 overflow-x-auto">
          <button
            onClick={() => setFilters(prev => ({ ...prev, status: 'all' }))}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              filters.status === 'all'
                ? 'bg-slate-700 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Concerns ({totalCount})
          </button>

          <button
            onClick={() => setFilters(prev => ({ ...prev, status: 'Pending Directive' }))}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              filters.status === 'Pending Directive'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                : 'text-amber-400 hover:bg-amber-400/10'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Pending Directive ({pendingCount})
          </button>

          <button
            onClick={() => setFilters(prev => ({ ...prev, status: 'In Progress' }))}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              filters.status === 'In Progress'
                ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                : 'text-sky-400 hover:bg-sky-400/10'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            In Progress ({inProgressCount})
          </button>

          <button
            onClick={() => setFilters(prev => ({ ...prev, status: 'Completed' }))}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              filters.status === 'Completed'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-emerald-400 hover:bg-emerald-400/10'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed ({completedCount})
          </button>
        </div>
      </div>

      {/* Second Row: Detailed Multi-Select Filters */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/60 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400 shrink-0 font-medium mr-1">
          <Filter className="w-3.5 h-3.5 text-amber-400" />
          <span>Filters:</span>
        </div>

        {/* Filter by Park: Only AGM can see Both Parks */}
        {isAgm ? (
          <select
            value={filters.parkId}
            onChange={e => setFilters(prev => ({ ...prev, parkId: e.target.value as 'all' | ParkId }))}
            className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-amber-400 font-medium"
            title="AGM Twin Parks Filter"
          >
            <option value="all">All Parks (Central Park &amp; Toggi)</option>
            <option value="bashundhara-central">Bashundhara Central Park Only</option>
            <option value="toggi-fun-world">Toggi Fun World Only</option>
          </select>
        ) : (
          <div 
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900/90 border border-amber-500/40 text-xs text-amber-300 font-semibold shadow-sm"
            title="Only AGM will see both park all the issue. Your view is locked to your assigned park."
          >
            <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{currentUser.parkName || (userAssignedParkId === 'bashundhara-central' ? 'Bashundhara Central Park' : 'Toggi Fun World')}</span>
            <span className="text-[10px] text-slate-400 font-normal ml-0.5">(Assigned Park)</span>
          </div>
        )}

        {/* Filter by Severity */}
        <select
          value={filters.severity}
          onChange={e => setFilters(prev => ({ ...prev, severity: e.target.value as 'all' | IssueSeverity }))}
          className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-amber-400"
        >
          <option value="all">All Priorities</option>
          {SEVERITIES.map(sev => (
            <option key={sev} value={sev}>
              {sev} Priority
            </option>
          ))}
        </select>

        {/* Filter by Category & Option to Add / Delete Category */}
        <div className="flex flex-wrap items-center gap-1">
          <select
            value={filters.category}
            onChange={e => {
              setFilters(prev => ({ ...prev, category: e.target.value as 'all' | IssueCategory }));
              setConfirmDeleteActiveCat(false);
            }}
            className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-amber-400 max-w-[170px] truncate"
          >
            <option value="all">
              {categories.length === 0 ? 'No Categories (Add below)' : `All Categories (${categories.length})`}
            </option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {!isAddingCategory ? (
            <button
              type="button"
              onClick={() => setIsAddingCategory(true)}
              className="px-2 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded-md flex items-center gap-1 transition-colors shrink-0"
              title="Add a new category"
            >
              <Plus className="w-3 h-3 stroke-[2.5]" />
              <span>Add Category</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-slate-900 border border-amber-400/60 rounded-md p-0.5">
              <input
                type="text"
                autoFocus
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newCategoryName.trim()) {
                      addCategory(newCategoryName.trim());
                      setFilters(prev => ({ ...prev, category: newCategoryName.trim() }));
                      setNewCategoryName('');
                      setIsAddingCategory(false);
                    }
                  } else if (e.key === 'Escape') {
                    setIsAddingCategory(false);
                  }
                }}
                placeholder="New category..."
                className="bg-transparent text-xs text-white px-2 py-1 outline-none w-32 placeholder-slate-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (newCategoryName.trim()) {
                    addCategory(newCategoryName.trim());
                    setFilters(prev => ({ ...prev, category: newCategoryName.trim() }));
                    setNewCategoryName('');
                    setIsAddingCategory(false);
                  }
                }}
                className="px-2 py-1 text-[11px] font-bold bg-amber-400 text-slate-950 rounded hover:bg-amber-300 transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingCategory(false);
                  setNewCategoryName('');
                }}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Delete active selected category option */}
          {filters.category !== 'all' && (
            confirmDeleteActiveCat ? (
              <div className="flex items-center gap-1 bg-rose-950/80 border border-rose-500/50 rounded-md p-0.5">
                <span className="text-[11px] text-rose-300 px-1 font-medium truncate max-w-[110px]">
                  Delete &ldquo;{filters.category}&rdquo;?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    removeCategory(filters.category);
                    setFilters(prev => ({ ...prev, category: 'all' }));
                    setConfirmDeleteActiveCat(false);
                  }}
                  className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteActiveCat(false)}
                  className="px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white bg-slate-800 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteActiveCat(true)}
                title={`Delete category "${filters.category}"`}
                className="px-2 py-1.5 text-xs text-rose-400 hover:text-white hover:bg-rose-600/20 border border-rose-500/30 rounded-md transition-colors flex items-center gap-1 shrink-0"
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
                <span>Delete</span>
              </button>
            )
          )}

          {/* Manage Categories Modal Trigger */}
          <button
            type="button"
            onClick={openCategoryManagerModal}
            className="px-2 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md flex items-center gap-1 transition-colors shrink-0"
            title="Manage and delete categories"
          >
            <Tag className="w-3 h-3 text-amber-400" />
            <span>Manage Categories</span>
          </button>
        </div>

        {/* Filter by Lead Engineer */}
        <select
          value={filters.engineerId}
          onChange={e => setFilters(prev => ({ ...prev, engineerId: e.target.value }))}
          className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-amber-400 max-w-[170px] truncate"
        >
          <option value="all">All Lead Engineers ({engineers.length})</option>
          {engineers.map(eng => (
            <option key={eng.id} value={eng.id}>
              {eng.name} ({eng.parkId === 'bashundhara-central' ? 'BCP' : 'TFW'})
            </option>
          ))}
        </select>

        {/* Sort by */}
        <select
          value={filters.sortBy}
          onChange={e => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
          className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-amber-400 ml-auto"
        >
          <option value="newest">Sort: Newest First</option>
          <option value="oldest">Sort: Oldest First</option>
          <option value="severity">Sort: Highest Urgency</option>
          <option value="rideName">Sort: Ride Name</option>
        </select>

        {/* Reset button if active */}
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="px-2.5 py-1.5 text-xs text-amber-400 hover:text-amber-300 hover:bg-slate-700/60 rounded-md transition-colors flex items-center gap-1 shrink-0 font-medium"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>
    </div>
  );
};
