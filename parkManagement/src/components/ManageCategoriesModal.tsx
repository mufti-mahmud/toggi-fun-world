import React, { useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { X, Tag, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';

export const ManageCategoriesModal: React.FC = () => {
  const {
    isCategoryManagerModalOpen,
    closeCategoryManagerModal,
    categories,
    addCategory,
    removeCategory,
    issues,
  } = usePortal();

  const [newCatInput, setNewCatInput] = useState('');
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  if (!isCategoryManagerModalOpen) return null;

  const handleAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newCatInput.trim();
    if (!trimmed) return;

    if (categories.includes(trimmed)) {
      setFeedbackMessage(`Category "${trimmed}" already exists.`);
      setTimeout(() => setFeedbackMessage(null), 2500);
      return;
    }

    addCategory(trimmed);
    setNewCatInput('');
    setFeedbackMessage(`Category "${trimmed}" added successfully.`);
    setTimeout(() => setFeedbackMessage(null), 2500);
  };

  const handleDelete = (catName: string) => {
    removeCategory(catName);
    setConfirmDeleteCat(null);
    setFeedbackMessage(`Category "${catName}" deleted.`);
    setTimeout(() => setFeedbackMessage(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Manage Engineering Categories</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                  {categories.length} {categories.length === 1 ? 'Category' : 'Categories'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Create or delete categories for Bashundhara Central Park &amp; Toggi Fun World
              </p>
            </div>
          </div>

          <button
            onClick={closeCategoryManagerModal}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Feedback banner */}
          {feedbackMessage && (
            <div className="p-2.5 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{feedbackMessage}</span>
            </div>
          )}

          {/* Add Category Input */}
          <form onSubmit={handleAdd} className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Add New Category
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Tag className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={newCatInput}
                  onChange={e => setNewCatInput(e.target.value)}
                  placeholder="e.g. Electrical & Controls, Braking Systems, Ride Restraints..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={!newCatInput.trim()}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add</span>
              </button>
            </div>
          </form>

          {/* Categories List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Current Registered Categories
              </h3>
              <span className="text-[11px] text-slate-400">
                Click delete icon to remove category
              </span>
            </div>

            {categories.length === 0 ? (
              <div className="text-center py-8 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <AlertCircle className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-400">
                  No engineering categories registered yet.
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Add custom categories above to categorize ride alerts, maintenance logs, and directives.
                </p>
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl divide-y divide-slate-800/80 bg-slate-950/50 max-h-72 overflow-y-auto">
                {categories.map(cat => {
                  const issueCount = issues.filter(i => i.category === cat).length;
                  const isConfirming = confirmDeleteCat === cat;

                  return (
                    <div
                      key={cat}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-xs sm:text-sm font-semibold text-slate-200 truncate">
                          {cat}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60 shrink-0">
                          {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
                        </span>
                      </div>

                      {/* Delete action button / confirmation */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                            <button
                              type="button"
                              onClick={() => handleDelete(cat)}
                              className="px-2.5 py-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors shadow-sm"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCat(null)}
                              className="px-2 py-1 text-[11px] text-slate-400 hover:text-white bg-slate-800 rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCat(cat)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center gap-1 text-xs"
                            title={`Delete category "${cat}"`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline text-[11px]">Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-850 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            Tanvir Bashundhara Group (TBG) - Engineering Operations
          </p>
          <button
            type="button"
            onClick={closeCategoryManagerModal}
            className="px-4 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
