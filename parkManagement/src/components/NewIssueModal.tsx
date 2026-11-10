import React, { useState, useEffect } from 'react';
import { usePortal } from '../context/PortalContext';
import { X, AlertTriangle, Building2, HardHat, Check, Tag } from 'lucide-react';
import { ParkId, IssueCategory, IssueSeverity } from '../types';
import { PARK_RIDES } from '../data/initialData';

export const NewIssueModal: React.FC = () => {
  const {
    isNewIssueModalOpen,
    closeNewIssueModal,
    createIssue,
    parks,
    engineers,
    currentUser,
    categories,
    addCategory,
    openCategoryManagerModal,
    isAgm,
    userAssignedParkId,
  } = usePortal();

  const [parkId, setParkId] = useState<ParkId>(isAgm ? 'bashundhara-central' : userAssignedParkId);
  const [engineerId, setEngineerId] = useState('');
  const [engineerNameManual, setEngineerNameManual] = useState('');
  const [rideName, setRideName] = useState('');
  const [customRide, setCustomRide] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');
  const [customCategory, setCustomCategory] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('High');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Non-AGM users are strictly locked to their assigned park
  useEffect(() => {
    if (!isAgm) {
      setParkId(userAssignedParkId);
    }
  }, [isAgm, userAssignedParkId, isNewIssueModalOpen]);

  // Set default engineer and ride when park changes
  useEffect(() => {
    const parkEngineers = engineers.filter(e => e.parkId === parkId);
    if (parkEngineers.length > 0) {
      if (currentUser.role === 'Engineer' && currentUser.parkId === parkId && currentUser.engineerId) {
        setEngineerId(currentUser.engineerId);
      } else {
        setEngineerId(parkEngineers[0].id);
      }
    } else {
      setEngineerId('');
      if (!engineerNameManual) {
        setEngineerNameManual('Lead Site Engineer');
      }
    }
    const rides = PARK_RIDES[parkId] || [];
    if (rides.length > 0) {
      setRideName(rides[0]);
    }
  }, [parkId, engineers, currentUser]);

  if (!isNewIssueModalOpen) return null;

  const parkEngineers = engineers.filter(e => e.parkId === parkId);
  const availableRides = PARK_RIDES[parkId] || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Title and issue description are required.');
      return;
    }

    const finalRide = rideName === 'OTHER' ? customRide.trim() || 'General Park Attraction' : rideName;
    const finalCategory = (category === 'NEW_CATEGORY' || categories.length === 0)
      ? (customCategory.trim() || 'General Engineering')
      : (category || categories[0] || 'General Engineering');

    if (customCategory.trim()) {
      addCategory(customCategory.trim());
    }

    createIssue({
      parkId,
      rideName: finalRide,
      title: title.trim(),
      description: description.trim(),
      category: finalCategory,
      severity,
      engineerId: engineerId || undefined,
    });

    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setTitle('');
      setDescription('');
      closeNewIssueModal();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Report Site Engineering Concern to AGM
              </h2>
              <p className="text-xs text-slate-400">
                Submit ride faults, structural alerts, or operational concerns for AGM review & directive
              </p>
            </div>
          </div>

          <button
            onClick={closeNewIssueModal}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(85vh-130px)] overflow-y-auto">
          {success && (
            <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Concern reported successfully! Sent to AGM Operations queue for directives.</span>
            </div>
          )}

          {error && <p className="text-xs text-rose-400">{error}</p>}

          {/* Park Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              Select Facility Location *
            </label>
            {isAgm ? (
              <div className="grid grid-cols-2 gap-3">
                {parks.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setParkId(p.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      parkId === p.id
                        ? 'border-amber-400 bg-amber-400/10 text-white font-semibold'
                        : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold truncate mt-0.5">{p.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{p.shortLocation}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-amber-400/30 bg-amber-400/5 text-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-amber-400">
                    {parks.find(p => p.id === userAssignedParkId)?.name || 'Assigned Facility'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {parks.find(p => p.id === userAssignedParkId)?.shortLocation} • Locked to your authorized facility
                  </div>
                </div>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 font-semibold">
                  Site Assigned
                </span>
              </div>
            )}
          </div>

          {/* Submitting Engineer & Ride Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <HardHat className="w-3.5 h-3.5 text-slate-400" />
                Reporting Lead Engineer *
              </label>
              {parkEngineers.length > 0 ? (
                <select
                  value={engineerId}
                  onChange={e => setEngineerId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  {parkEngineers.map(eng => (
                    <option key={eng.id} value={eng.id}>
                      {eng.name} ({eng.role.split(' ')[0]})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={engineerNameManual}
                  onChange={e => setEngineerNameManual(e.target.value)}
                  placeholder="e.g. Lead Duty Engineer"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Attraction / Ride Name *
              </label>
              <select
                value={rideName}
                onChange={e => setRideName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                {availableRides.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value="OTHER">Other Attraction (Custom)</option>
              </select>
            </div>
          </div>

          {rideName === 'OTHER' && (
            <div>
              <label className="block text-xs text-slate-300 mb-1">Custom Ride Name</label>
              <input
                type="text"
                value={customRide}
                onChange={e => setCustomRide(e.target.value)}
                placeholder="Enter ride or attraction name..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
              />
            </div>
          )}

          {/* Category & Severity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-300">
                  Engineering Category
                </label>
                <button
                  type="button"
                  onClick={openCategoryManagerModal}
                  className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition-colors"
                  title="Open category manager to add or delete categories"
                >
                  <Tag className="w-3 h-3" />
                  <span>Manage / Delete</span>
                </button>
              </div>
              {categories.length === 0 ? (
                <input
                  type="text"
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  placeholder="e.g. Rides & Mechanical, Safety..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              ) : (
                <div className="space-y-1.5">
                  <select
                    value={category || (categories[0] || 'NEW_CATEGORY')}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="NEW_CATEGORY">+ Add New Category...</option>
                  </select>
                  {category === 'NEW_CATEGORY' && (
                    <input
                      type="text"
                      autoFocus
                      value={customCategory}
                      onChange={e => setCustomCategory(e.target.value)}
                      placeholder="Type new category name..."
                      className="w-full bg-slate-900 border border-amber-400/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                    />
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Operational Severity
              </label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value as IssueSeverity)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="Critical">Critical - Ride Stoppage</option>
                <option value="High">High - Prompt Inspection Required</option>
                <option value="Medium">Medium - Maintenance Due Soon</option>
                <option value="Low">Low - Routine Calibration / Cosmetic</option>
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Concern Summary / Headline *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Dhaka Eye main drive motor inverter overcurrent warning"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Detailed Description */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Detailed Engineering Description *
            </label>
            <textarea
              rows={4}
              required
              value={description}
              onChange={e => {
                setDescription(e.target.value);
                if (error) setError('');
              }}
              placeholder="Describe observations, symptoms, cycle intervals, and when the fault occurred..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={closeNewIssueModal}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-md"
            >
              <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
              Submit Concern to AGM
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
