import React, { useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { X, Building2, UserPlus, Phone, Mail, Check, Tag } from 'lucide-react';
import { ParkId, LeadEngineer } from '../types';

export const AddEngineerModal: React.FC = () => {
  const { isAddEngineerModalOpen, closeAddEngineerModal, addEngineer, parks, categories, addCategory, openCategoryManagerModal } = usePortal();

  const [name, setName] = useState('');
  const [parkId, setParkId] = useState<ParkId>('bashundhara-central');
  const [role, setRole] = useState('Lead Ride Systems & Electrical Engineer');
  const [specialty, setSpecialty] = useState('');
  const [customSpecialty, setCustomSpecialty] = useState('');
  const [status, setStatus] = useState<LeadEngineer['status']>('On Duty');
  const [phone, setPhone] = useState('+880 1711-000000');
  const [email, setEmail] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  if (!isAddEngineerModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Engineer name is required.');
      return;
    }

    const generatedEmail =
      email.trim() ||
      `${name.toLowerCase().replace(/\s+/g, '.')}@bashundharagroup.com`;

    const finalSpecialty = (specialty === 'NEW_SPECIALTY' || categories.length === 0)
      ? (customSpecialty.trim() || 'General Engineering')
      : (specialty || categories[0] || 'General Engineering');

    if (customSpecialty.trim()) {
      addCategory(customSpecialty.trim());
    }

    addEngineer({
      name: name.trim(),
      parkId,
      role: role.trim(),
      specialty: finalSpecialty,
      status,
      phone: phone.trim(),
      email: generatedEmail,
      shift: 'Morning Shift (06:00 - 15:00)',
      radioChannel: 'Site Engineering',
      certifications: ['Site Technical Lead'],
    });

    setSuccessMessage(
      `Lead Engineer ${name} successfully enrolled to ${
        parkId === 'bashundhara-central' ? 'Bashundhara Central Park' : 'Toggi Fun World'
      }.`
    );
    setTimeout(() => {
      setSuccessMessage('');
      setName('');
      closeAddEngineerModal();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Add Lead Engineer to Park Roster
              </h2>
              <p className="text-xs text-slate-400">
                Register new site engineering leadership for Bashundhara Central Park or Toggi Fun World
              </p>
            </div>
          </div>

          <button
            onClick={closeAddEngineerModal}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(85vh-130px)] overflow-y-auto">
          {successMessage && (
            <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{successMessage}</span>
            </div>
          )}

          {error && <p className="text-xs text-rose-400">{error}</p>}

          {/* Park Assignment */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              Facility Location Assignment *
            </label>
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
          </div>

          {/* Full Name & Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. Engr. Rafiqul Islam"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Engineering Title / Role *
              </label>
              <input
                type="text"
                required
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="e.g. Lead Ride Maintenance Engineer"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Specialty & Duty Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-300">
                  Primary Specialty / Category
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
                  value={customSpecialty}
                  onChange={e => setCustomSpecialty(e.target.value)}
                  placeholder="e.g. Mechanical & Brakes, Electrical..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              ) : (
                <div className="space-y-1.5">
                  <select
                    value={specialty || (categories[0] || 'NEW_SPECIALTY')}
                    onChange={e => setSpecialty(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="NEW_SPECIALTY">+ Add New Category...</option>
                  </select>
                  {specialty === 'NEW_SPECIALTY' && (
                    <input
                      type="text"
                      autoFocus
                      value={customSpecialty}
                      onChange={e => setCustomSpecialty(e.target.value)}
                      placeholder="Type new category..."
                      className="w-full bg-slate-900 border border-amber-400/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                    />
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Duty Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as LeadEngineer['status'])}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="On Duty">On Duty (Active on Site)</option>
                <option value="Standby">Standby / On Call</option>
                <option value="Off Duty">Off Duty</option>
              </select>
            </div>
          </div>

          {/* Contact (Phone & Email) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-400" />
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+880 1711-000000"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Mail className="w-3 h-3 text-slate-400" />
                Staff Email (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="engineer@bashundharagroup.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={closeAddEngineerModal}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-md"
            >
              <UserPlus className="w-3.5 h-3.5 stroke-[2.5]" />
              Enroll Lead Engineer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
