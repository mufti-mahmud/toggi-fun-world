import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, UserCheck, Lock, Eye, EyeOff, UserPlus, LogOut, Mail, Building, AlertCircle, Check } from 'lucide-react';
import ParkManagementApp from '../parkManagement/src/App';

export interface ParkAuthUser {
  username: string;
  role: string;
  name: string;
  parkName?: string;
}

interface Props {
  onReturnToHub: () => void;
  authenticatedUser?: ParkAuthUser | null;
  onLoginSuccess?: (user: ParkAuthUser) => void;
  onLogout?: () => void;
}

const DEFAULT_STAFF_FALLBACK = [
  {
    id: 'agm-1',
    name: 'Mufti Mahmud Mollah',
    role: 'AGM',
    parkName: 'Toggi Fun World & Central Park',
    email: 'mufti.mahmud@tbg.com',
    username: 'mufti',
    defaultPassword: 'agm79'
  },
  {
    id: 'tech-0',
    name: 'Md. Hafizur Rahman',
    role: 'Lead Technician',
    parkName: 'Toggi Fun World',
    email: 'hafizur@tbg.com',
    username: 'hafizur',
    defaultPassword: 'tech79'
  },
  {
    id: 'eng-1',
    name: 'Engr. Rafiqul Islam',
    role: 'Engineer',
    parkName: 'Toggi Fun World',
    email: 'rafiqul.islam@tbg.com',
    username: 'rafiqul',
    defaultPassword: 'eng79'
  },
  {
    id: 'eng-2',
    name: 'Engr. Tariq Hossain',
    role: 'Engineer',
    parkName: 'Bashundhara Central Park',
    email: 'tariq.hossain@tbg.com',
    username: 'tariq',
    defaultPassword: 'eng79'
  },
  {
    id: 'tech-1',
    name: 'Md. Kabir Hossain',
    role: 'Sr. Technician',
    parkName: 'Toggi Fun World',
    email: 'kabir.tech@tbg.com',
    username: 'kabir',
    defaultPassword: 'tech79'
  },
  {
    id: 'tech-2',
    name: 'Md. Shahin Alam',
    role: 'Sr. Technician',
    parkName: 'Bashundhara Central Park',
    email: 'shahin.tech@tbg.com',
    username: 'shahin',
    defaultPassword: 'tech79'
  },
  {
    id: 'foreman-1',
    name: 'Al-Amin Mia',
    role: 'Sr. Foreman',
    parkName: 'Toggi Fun World',
    email: 'alamin.foreman@tbg.com',
    username: 'alamin',
    defaultPassword: 'foreman79'
  },
  {
    id: 'foreman-2',
    name: 'Kamal Uddin',
    role: 'Sr. Foreman',
    parkName: 'Bashundhara Central Park',
    email: 'kamal.foreman@tbg.com',
    username: 'kamal',
    defaultPassword: 'foreman79'
  }
];

export const TBGParkManagementWrapper: React.FC<Props> = ({ 
  onReturnToHub, 
  authenticatedUser, 
  onLoginSuccess,
  onLogout 
}) => {
  // Simplified login form states
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginNotice, setLoginNotice] = useState('');

  // Add staff modal state
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'AGM' | 'Engineer' | 'Sr. Technician' | 'Sr. Foreman' | 'Lead Technician'>('Engineer');
  const [newStaffPark, setNewStaffPark] = useState('Toggi Fun World');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('tbg79');

  const getStaffList = () => {
    try {
      const saved = localStorage.getItem('TBG_PARK_STAFF_LIST');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_STAFF_FALLBACK;
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginNotice('');

    if (!loginUsername.trim()) {
      setLoginError('Please enter your Username or Corporate Email.');
      return;
    }
    if (!loginPassword.trim()) {
      setLoginError('Please enter your Password.');
      return;
    }

    setIsLoggingIn(true);

    setTimeout(() => {
      setIsLoggingIn(false);
      const input = loginUsername.trim().toLowerCase();
      const enteredPass = loginPassword.trim();
      const staffList = getStaffList();

      const matchedStaff = staffList.find(s =>
        (s.username && s.username.toLowerCase() === input) ||
        (s.email && s.email.toLowerCase() === input) ||
        (s.name && s.name.toLowerCase() === input) ||
        (s.email && s.email.toLowerCase().split('@')[0] === input)
      );

      let role = 'Lead Engineer';
      let name = loginUsername.trim();
      let parkName = 'Toggi Fun World & Central Park';

      if (matchedStaff) {
        const validPass = matchedStaff.defaultPassword || 'tbg79';
        if (enteredPass !== validPass && enteredPass !== 'tbg79' && enteredPass !== 'admin79') {
          setLoginError('Incorrect password. Please verify your password or use Add Staff.');
          return;
        }
        role = matchedStaff.role;
        name = matchedStaff.name;
        parkName = matchedStaff.parkName || 'Toggi Fun World';
      } else if (input === 'agm' || input === 'mufti' || input.includes('mollah')) {
        if (enteredPass !== 'agm79' && enteredPass !== 'tbg79') {
          setLoginError('Incorrect password for AGM account.');
          return;
        }
        role = 'AGM';
        name = 'Mufti Mahmud Mollah';
        parkName = 'Toggi Fun World & Central Park';
      } else if (input === 'hafizur' || input.includes('hafizur')) {
        if (enteredPass !== 'tech79' && enteredPass !== 'tbg79') {
          setLoginError('Incorrect password for Hafizur Rahman.');
          return;
        }
        role = 'Lead Technician';
        name = 'Md. Hafizur Rahman';
        parkName = 'Toggi Fun World';
      } else if (input === 'admin' || input === 'desk') {
        if (enteredPass !== 'admin79' && enteredPass !== 'tbg79') {
          setLoginError('Incorrect password for Admin account.');
          return;
        }
        role = 'Central Administrator';
        name = 'TBG Admin Desk';
        parkName = 'TBG Twin Parks';
      } else {
        if (enteredPass !== 'tbg79' && enteredPass !== 'admin79' && enteredPass.length < 3) {
          setLoginError('Invalid credentials. Please click "+ Add Staff" to register your account.');
          return;
        }
        name = loginUsername.split('@')[0];
        name = name.charAt(0).toUpperCase() + name.slice(1);
        role = 'Engineer';
        parkName = 'Toggi Fun World';
      }

      const userObject: ParkAuthUser = {
        username: loginUsername.trim(),
        role,
        name,
        parkName
      };

      try {
        localStorage.setItem('TBG_PARK_AUTH_USER', JSON.stringify(userObject));
      } catch {}

      if (onLoginSuccess) {
        onLoginSuccess(userObject);
      }
    }, 300);
  };

  const handleAddStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim()) {
      return;
    }

    const cleanSlug = newStaffUsername.trim() || newStaffName.trim().toLowerCase().replace(/[^a-z0-9]/g, '.');
    const generatedEmail = `${cleanSlug}@tbg.com`;
    const staffList = getStaffList();

    const newStaff = {
      id: 'staff-' + Date.now(),
      name: newStaffName.trim(),
      role: newStaffRole,
      parkName: newStaffPark,
      username: cleanSlug,
      email: generatedEmail,
      defaultPassword: newStaffPassword.trim() || 'tbg79'
    };

    const updated = [newStaff, ...staffList];
    try {
      localStorage.setItem('TBG_PARK_STAFF_LIST', JSON.stringify(updated));
    } catch {}

    setLoginUsername(cleanSlug);
    setLoginPassword('');
    setIsAddStaffOpen(false);
    setNewStaffName('');
    setNewStaffUsername('');
    setNewStaffPassword('tbg79');
    setLoginNotice(`Staff account registered for ${newStaff.name}! Please enter password to login.`);
    setLoginError('');
  };

  // If user is not authenticated, display the Simplified Login View (Only Username, Password, and Add Staff)
  if (!authenticatedUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#091830] via-[#071426] to-[#06101f] text-slate-100 flex flex-col font-sans">
        {/* Navigation bar */}
        <div className="bg-[#0a192f]/95 border-b border-[#1b355a] px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
          <button
            onClick={onReturnToHub}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:text-white bg-slate-800/80 hover:bg-indigo-600/30 border border-slate-700/80 hover:border-indigo-500/50 transition-all cursor-pointer shadow-sm group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Return to TBG Central Hub</span>
          </button>

          <span className="text-xs text-slate-400 font-medium">
            Tanvir Bashundhara Group · Park Management Login
          </span>
        </div>

        {/* Simplified Login Center Card */}
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-md">
            {/* Header */}
            <div className="flex items-center gap-3.5 mb-6">
              <div className="h-12 w-auto bg-white p-1 rounded-xl shadow border border-slate-700 flex items-center justify-center shrink-0">
                <img 
                  src="/assets/aistudio/TBG_7e8eece1.JPG" 
                  alt="TBG Logo" 
                  className="h-10 w-auto object-contain max-w-[120px]"
                />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">
                  TBG Park Management
                </h1>
                <p className="text-xs text-amber-400 font-semibold uppercase tracking-wide">
                  Sign In to Access Dashboard
                </p>
              </div>
            </div>

            {/* Error & Success Messages */}
            {loginError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{loginError}</span>
              </div>
            )}
            {loginNotice && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{loginNotice}</span>
              </div>
            )}

            {/* SIMPLIFIED LOGIN VIEW: ONLY USERNAME, PASSWORD, AND ADD STAFF */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="Enter username or email"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                    autoFocus
                  />
                  <Mail className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Add Staff Link right below password */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddStaffOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer py-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Add Staff</span>
                </button>
                <span className="text-[11px] text-slate-500">Authorized Personnel</span>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-[0.99] disabled:opacity-50 transition-all shadow-md shadow-amber-400/20 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {isLoggingIn ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Login</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Dedicated Add Staff Modal */}
        {isAddStaffOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-7 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">Add Staff</h3>
                    <p className="text-[11px] text-slate-400">Register new personnel for TBG Park Management</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleAddStaffSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Staff Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="e.g. Md. Hafizur Rahman"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Designation *
                    </label>
                    <select
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="Engineer">Engineer</option>
                      <option value="Lead Technician">Lead Technician</option>
                      <option value="Sr. Technician">Sr. Technician</option>
                      <option value="Sr. Foreman">Sr. Foreman</option>
                      <option value="AGM">AGM</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Park Name *
                    </label>
                    <select
                      value={newStaffPark}
                      onChange={(e) => setNewStaffPark(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="Toggi Fun World">Toggi Fun World</option>
                      <option value="Bashundhara Central Park">Bashundhara Central Park</option>
                      <option value="TBG Twin Parks">TBG Twin Parks</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={newStaffUsername}
                      onChange={(e) => setNewStaffUsername(e.target.value)}
                      placeholder="e.g. hafizur"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Password
                    </label>
                    <input
                      type="text"
                      value={newStaffPassword}
                      onChange={(e) => setNewStaffPassword(e.target.value)}
                      placeholder="Default: tbg79"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddStaffOpen(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer shadow-sm"
                  >
                    Save Staff
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // POST-LOGIN DASHBOARD VIEW: User is logged in, show dashboard with Name, Designation, and Park Name clearly
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top TBG Hub Navigation Bar */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-indigo-500/20 px-4 sm:px-6 py-2.5 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onReturnToHub}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:text-white bg-slate-800/80 hover:bg-indigo-600/30 border border-slate-700/80 hover:border-indigo-500/50 transition-all cursor-pointer shadow-sm group"
            title="Return to Tanvir Bashundhara Group Portal"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Return to TBG Central Hub</span>
          </button>

          <span className="hidden sm:inline text-slate-600 text-xs font-light">|</span>

          <span className="hidden sm:inline text-xs text-slate-400 font-medium">
            Tanvir Bashundhara Group · Operations &amp; Maintenance
          </span>
        </div>

        {/* Post-Login Header Badge: Clear Name, Designation, and Park Name */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2.5 bg-indigo-950/60 border border-indigo-500/40 px-3 py-1.5 rounded-xl text-indigo-100 shadow-sm">
            <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex flex-col text-left">
              <span className="font-bold text-white text-xs tracking-tight">{authenticatedUser.name}</span>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-300">
                <span className="font-semibold text-amber-300">{authenticatedUser.role}</span>
                <span className="text-slate-500">•</span>
                <span className="text-emerald-400 font-medium">{authenticatedUser.parkName || 'Toggi Fun World & Central Park'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 border border-slate-700/60 transition-colors cursor-pointer"
            title="Logout / Switch Staff"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main TBG Park Management Sub-Application with authenticated user */}
      <div className="flex-1">
        <ParkManagementApp authenticatedUser={authenticatedUser} />
      </div>
    </div>
  );
};

export default TBGParkManagementWrapper;
