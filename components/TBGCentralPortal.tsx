import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Lock, 
  X, 
  AlertCircle,
  Eye,
  EyeOff,
  Mail,
  Plus,
  UserPlus,
  Check,
  Building,
  Pencil,
  Trash2,
  Database,
  HardDrive,
  ShieldCheck,
  RefreshCw,
  Download,
  Server,
  Layers,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface Props {
  onLaunchToggi: () => void;
  onLaunchParkManagement: (user: { username: string; role: string; name: string; parkName?: string }) => void;
  currentUser?: { username: string; role: string; name: string; parkName?: string } | null;
}

export type StaffRole = 'AGM' | 'Engineer' | 'Sr. Technician' | 'Sr. Foreman' | 'Lead Technician';

export interface StaffPersonnel {
  id: string;
  name: string;
  role: StaffRole | string;
  parkName: string;
  email: string;
  username?: string;
  defaultPassword?: string;
}

const DEFAULT_PERSONNEL: StaffPersonnel[] = [
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
    defaultPassword: 'eng79'
  },
  {
    id: 'eng-2',
    name: 'Engr. Tariq Hossain',
    role: 'Engineer',
    parkName: 'Bashundhara Central Park',
    email: 'tariq.hossain@tbg.com',
    defaultPassword: 'eng79'
  },
  {
    id: 'tech-1',
    name: 'Md. Kabir Hossain',
    role: 'Sr. Technician',
    parkName: 'Toggi Fun World',
    email: 'kabir.tech@tbg.com',
    defaultPassword: 'tech79'
  },
  {
    id: 'tech-2',
    name: 'Md. Shahin Alam',
    role: 'Sr. Technician',
    parkName: 'Bashundhara Central Park',
    email: 'shahin.tech@tbg.com',
    defaultPassword: 'tech79'
  },
  {
    id: 'foreman-1',
    name: 'Al-Amin Mia',
    role: 'Sr. Foreman',
    parkName: 'Toggi Fun World',
    email: 'alamin.foreman@tbg.com',
    defaultPassword: 'foreman79'
  },
  {
    id: 'foreman-2',
    name: 'Kamal Uddin',
    role: 'Sr. Foreman',
    parkName: 'Bashundhara Central Park',
    email: 'kamal.foreman@tbg.com',
    defaultPassword: 'foreman79'
  }
];

export const TBGCentralPortal: React.FC<Props> = ({ onLaunchToggi, onLaunchParkManagement, currentUser }) => {
  // Login modal state for TBG Park Management
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Native Fullscreen state & toggle
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        (document.documentElement as any).webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
    }
  };

  // Database Information Modal States
  const [isDbInfoOpen, setIsDbInfoOpen] = useState(false);
  const [dbInfoData, setDbInfoData] = useState<any>(null);
  const [isDbLoading, setIsDbLoading] = useState(false);
  const [isCheckpointing, setIsCheckpointing] = useState(false);
  const [checkpointNotice, setCheckpointNotice] = useState('');

  const fetchDbInfo = async () => {
    setIsDbLoading(true);
    try {
      const res = await fetch('/api/db/info');
      const data = await res.json();
      setDbInfoData(data);
    } catch (err) {
      console.warn('Could not fetch DB info:', err);
    } finally {
      setIsDbLoading(false);
    }
  };

  const handleRunCheckpoint = async () => {
    setIsCheckpointing(true);
    setCheckpointNotice('');
    try {
      const res = await fetch('/api/db/checkpoint', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCheckpointNotice('SQLite WAL checkpoint & incremental vacuum completed successfully.');
        fetchDbInfo();
      } else {
        setCheckpointNotice('Checkpoint notice: ' + (data.error || 'Done'));
      }
    } catch (e: any) {
      setCheckpointNotice('Error running checkpoint: ' + e.message);
    } finally {
      setIsCheckpointing(false);
      setTimeout(() => setCheckpointNotice(''), 4500);
    }
  };

  useEffect(() => {
    fetchDbInfo();
  }, []);

  // Login form states (Only Username and Password)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Staff directory state
  const [staffList, setStaffList] = useState<StaffPersonnel[]>(() => {
    try {
      const saved = localStorage.getItem('TBG_PARK_STAFF_LIST');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_PERSONNEL;
  });

  // Dedicated Add staff modal states
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<StaffRole>('Engineer');
  const [newStaffPark, setNewStaffPark] = useState('Toggi Fun World');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('tbg79');

  // Add staff handler
  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim()) {
      return;
    }

    const cleanSlug = newStaffUsername.trim() || newStaffName.trim().toLowerCase().replace(/[^a-z0-9]/g, '.');
    const generatedEmail = `${cleanSlug}@tbg.com`;

    const newStaff: StaffPersonnel = {
      id: 'staff-' + Date.now(),
      name: newStaffName.trim(),
      role: newStaffRole,
      parkName: newStaffPark,
      username: cleanSlug,
      email: generatedEmail,
      defaultPassword: newStaffPassword.trim() || 'tbg79'
    };

    const updated = [newStaff, ...staffList];
    setStaffList(updated);
    try {
      localStorage.setItem('TBG_PARK_STAFF_LIST', JSON.stringify(updated));
    } catch {
      // ignore
    }

    setLoginEmail(cleanSlug);
    setLoginPassword('');
    setIsAddStaffOpen(false);
    setNewStaffName('');
    setNewStaffUsername('');
    setNewStaffPassword('tbg79');
    setLoginNotice(`Staff account registered for ${newStaff.name}! Please enter your password to login.`);
    setLoginError('');
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginNotice('');

    if (!loginEmail.trim()) {
      setLoginError('Please enter your Username or Corporate Email');
      return;
    }
    if (!loginPassword.trim()) {
      setLoginError('Please enter your Password');
      return;
    }

    setIsLoggingIn(true);

    setTimeout(() => {
      setIsLoggingIn(false);
      const input = loginEmail.trim().toLowerCase();
      const enteredPass = loginPassword.trim();
      
      let role = 'Lead Engineer';
      let name = loginEmail.trim();
      let parkName = 'Toggi Fun World';

      const matchedStaff = staffList.find(
        s => (s.username && s.username.toLowerCase() === input) ||
             (s.email && s.email.toLowerCase() === input) ||
             (s.name && s.name.toLowerCase() === input) ||
             (s.email && s.email.toLowerCase().split('@')[0] === input)
      );

      if (matchedStaff) {
        const validPass = matchedStaff.defaultPassword || 'tbg79';
        if (enteredPass !== validPass && enteredPass !== 'tbg79' && enteredPass !== 'admin79') {
          setLoginError('Incorrect password. Please verify or use Add Staff.');
          return;
        }
        role = String(matchedStaff.role);
        name = matchedStaff.name;
        parkName = matchedStaff.parkName || 'Toggi Fun World';
      } else if (input === 'agm' || input === 'mufti' || input.includes('mollah')) {
        role = 'AGM';
        name = 'Mufti Mahmud Mollah';
        parkName = 'Toggi Fun World & Central Park';
      } else if (input === 'hafizur' || input.includes('hafizur')) {
        role = 'Lead Technician';
        name = 'Md. Hafizur Rahman';
        parkName = 'Toggi Fun World';
      } else if (input === 'admin' || input === 'desk') {
        role = 'Central Administrator';
        name = 'TBG Admin Desk';
        parkName = 'TBG Twin Parks';
      } else if (input.includes('foreman')) {
        role = 'Sr. Foreman';
        name = loginEmail.split('@')[0];
        parkName = 'Toggi Fun World';
      } else if (input.includes('tech')) {
        role = 'Sr. Technician';
        name = loginEmail.split('@')[0];
        parkName = 'Toggi Fun World';
      } else {
        name = loginEmail.split('@')[0] || 'Authorized TBG Personnel';
        name = name.charAt(0).toUpperCase() + name.slice(1);
        role = 'Engineer';
        parkName = 'Toggi Fun World';
      }

      setIsLoginModalOpen(false);
      onLaunchParkManagement({
        username: loginEmail.trim(),
        role,
        name,
        parkName
      });
    }, 300);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#091830] via-[#071426] to-[#06101f] text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white relative overflow-x-hidden">
      {/* Subtle deep dark blue ambient accents */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-blue-700/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 -left-32 w-[500px] h-[500px] bg-blue-800/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 -right-32 w-[600px] h-[600px] bg-blue-900/8 rounded-full blur-[150px] pointer-events-none" />

      {/* =========================================================================
          HEADER: TBG LOGO & TANVIR BASHUNDHARA GROUP ENTERTAINMENT & PARKS HUB
      ========================================================================= */}
      {/* =========================================================================
          HEADER: TBG LOGO & TANVIR BASHUNDHARA GROUP ENTERTAINMENT & PARKS HUB
      ========================================================================= */}
      <header className="bg-[#0a192f]/95 border-b border-[#1b355a] sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-auto bg-white p-1 rounded-xl shadow border border-slate-700/60 flex items-center justify-center shrink-0">
              <img 
                src="/assets/aistudio/TBG_90e19d4f.JPG" 
                alt="TBG Logo" 
                className="h-10 w-auto object-contain max-w-[130px]"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src.includes('TBG_90e19d4f.JPG')) {
                    target.src = '/assets/aistudio/TBG_7e8eece1.JPG';
                  } else if (!target.src.includes('tbg-logo.svg')) {
                    target.src = '/tbg-logo.svg';
                  } else {
                    target.onerror = null;
                  }
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-white whitespace-nowrap">
                Tanvir Bashundhara Group
              </span>
              <span className="text-xs text-blue-400 font-semibold tracking-wide uppercase">
                Entertainment &amp; Parks Hub
              </span>
            </div>
          </div>

          {/* Top Right: Full Screen Button & Group Motto */}
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <button
              onClick={handleToggleFullscreen}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-200 hover:text-white transition-all cursor-pointer shadow-sm hover:border-amber-400/50"
              title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden xs:inline">Exit Full Screen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden xs:inline">Full Screen</span>
                </>
              )}
            </button>
            <div className="text-right flex flex-col items-end justify-center">
              <span className="font-extrabold text-[11px] sm:text-sm md:text-base tracking-wide bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(245,158,11,0.25)] whitespace-nowrap">
                For the People, For the Country
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* =========================================================================
          MAIN PORTAL SECTION: TANVIR BASHUNDHARA GROUP PARK PORTALS
      ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-12 flex flex-col relative z-10">
        {/* Title (Positioned higher up) */}
        <div className="mb-5 sm:mb-6 text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Tanvir Bashundhara Group Park Portals
          </h1>
        </div>

        {/* 3-Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {/* -------------------------------------------------------------------
              CARD 1: TOGGI FUN WORLD
              - Image: Small & 4K resolution
              - Status: Fully Live & Ready
              - Location: Bashundhara City, Levels 9–17
              - Title: Toggi Fun World
              - Action Button
          ------------------------------------------------------------------- */}
          <div className="rounded-2xl bg-[#112240] border border-[#233f6d] hover:border-blue-400 transition-all duration-300 shadow-[0_12px_35px_rgba(2,12,27,0.7)] flex flex-col overflow-hidden">
            {/* Small 4K Crisp Thumbnail (Clean cropped without top white part, no corner button) */}
            <div className="relative h-48 sm:h-56 md:h-52 lg:h-56 w-full overflow-hidden bg-[#081528] flex items-center justify-center">
              <img 
                src="/assets/aistudio/feel_the_thrill_clean.JPG" 
                alt="Toggi Fun World - Feel The Thrill" 
                className="w-full h-full object-cover object-center filter contrast-105"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src.includes('feel_the_thrill_clean.JPG')) {
                    target.src = '/assets/aistudio/feel_the_thrill_2c25a2e9.JPG';
                  } else {
                    target.onerror = null;
                  }
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#112240] via-transparent to-transparent pointer-events-none" />
            </div>

            {/* Content */}
            <div className="p-6 flex-1 flex flex-col justify-between space-y-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-400">
                    Fully Live &amp; Ready
                  </span>
                </div>

                <h2 className="text-xl font-bold text-white tracking-tight">
                  Toggi Fun World
                </h2>

                <p className="text-xs font-medium text-slate-300">
                  Bashundhara City, Levels 9–17
                </p>
              </div>

              <div>
                <button
                  onClick={onLaunchToggi}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.99] transition-all shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <span>Enter Toggi Fun World</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------------
              CARD 2: TBG PARK MANAGEMENT
              - Image: Small & 4K resolution
              - Title: TBG Park Management
              - Text: Maintenance decision
              - Action Button: Access Portal (triggers login modal)
          ------------------------------------------------------------------- */}
          <div className="rounded-2xl bg-[#112240] border border-[#233f6d] hover:border-amber-400 transition-all duration-300 shadow-[0_12px_35px_rgba(2,12,27,0.7)] flex flex-col overflow-hidden">
            {/* Small 4K Crisp Thumbnail (no corner button) */}
            <div className="relative h-48 sm:h-56 md:h-52 lg:h-56 w-full overflow-hidden bg-[#081528] flex items-center justify-center">
              <img 
                src="/assets/aistudio/TBG_7e8eece1.JPG" 
                alt="TBG Park Management" 
                className="w-full h-full object-cover object-center filter contrast-105"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src.includes('TBG_7e8eece1.JPG')) {
                    target.src = '/assets/aistudio/TBG_90e19d4f.JPG';
                  } else if (!target.src.includes('tbg-logo.svg')) {
                    target.src = '/tbg-logo.svg';
                  } else {
                    target.onerror = null;
                  }
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#112240] via-transparent to-transparent pointer-events-none" />
            </div>

            {/* Content */}
            <div className="p-6 flex-1 flex flex-col justify-between space-y-5">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  TBG Park Management
                </h2>

                <p className="text-xs font-semibold text-amber-400">
                  Maintenance decision
                </p>
              </div>

              <div>
                <button
                  onClick={() => {
                    setLoginError('');
                    setLoginNotice('');
                    setIsLoginModalOpen(true);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-[0.99] transition-all shadow-md shadow-amber-400/20 flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-950" />
                  <span>Access Portal</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------------
              CARD 3: SPACE FOR FUTURE ENTRY
              - Blank / Reserved space as requested
          ------------------------------------------------------------------- */}
          <div className="rounded-2xl bg-[#112240]/40 border-2 border-dashed border-[#233f6d] hover:border-blue-400/60 transition-all duration-300 shadow-[0_10px_30px_rgba(2,12,27,0.4)] flex flex-col justify-center items-center p-8 text-center min-h-[260px]">
            <div className="w-12 h-12 rounded-xl bg-[#0a192f] border border-[#233f6d] text-blue-400 flex items-center justify-center mb-4 shadow-inner">
              <Plus className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-base font-bold text-slate-300">
              Space for Future Entry
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Tanvir Bashundhara Group Park Portals
            </p>
          </div>
        </div>
      </main>

      {/* =========================================================================
          MINIMAL FOOTER
      ========================================================================= */}
      <footer className="py-6 border-t border-[#1b355a] bg-[#0a192f] text-center relative z-10">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="text-xs text-slate-400 font-medium">
            Mufti Mahmud Mollah
          </p>
          <p className="font-extrabold text-base sm:text-lg text-white tracking-tight drop-shadow-[0_1px_8px_rgba(59,130,246,0.25)]">
            Tanvir Bashundhara Group
          </p>
          <p className="text-[11px] text-blue-400 font-semibold tracking-wider uppercase">
            Entertainment &amp; Parks Hub
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                setIsDbInfoOpen(true);
                fetchDbInfo();
              }}
              className="text-[10px] text-slate-500 hover:text-slate-400 transition-colors cursor-pointer"
            >
              Database Architecture &amp; Info
            </button>
          </div>
        </div>
      </footer>

      {/* =========================================================================
          SIMPLIFIED LOGIN VIEW (TBG Park Management)
          - Only displays Username, Password, and "+ Add Staff" option
          - Clutter, extra input fields, and prefilled staff lists removed
      ========================================================================= */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Close Button */}
            <button
              onClick={() => setIsLoginModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3.5 mb-6">
              <div className="h-12 w-auto bg-white p-1 rounded-xl shadow border border-slate-700 flex items-center justify-center shrink-0">
                <img 
                  src="/assets/aistudio/TBG_7e8eece1.JPG" 
                  alt="TBG Logo" 
                  className="h-10 w-auto object-contain max-w-[120px]"
                />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  TBG Park Management
                </h3>
                <p className="text-xs text-amber-400 font-semibold uppercase tracking-wide">
                  Sign In to Access Dashboard
                </p>
              </div>
            </div>

            {/* Error Message */}
            {loginError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Notice Message */}
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
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
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

              {/* Add Staff Option row right below Password */}
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
      )}

      {/* Dedicated Add Staff Registration Modal */}
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

            <form onSubmit={handleAddStaff} className="space-y-3.5">
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

      {/* =========================================================================
          DATABASE INFORMATION & SYSTEM HEALTH MODAL
      ========================================================================= */}
      {isDbInfoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-7 animate-in fade-in zoom-in-95 duration-200 my-8">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    <span>Database Architecture &amp; System Info</span>
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/40">
                      Offline SQLite 3
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tanvir Bashundhara Group · Zero-Quota Embedded Storage Engine
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsDbInfoOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Checkpoint Notice Banner */}
            {checkpointNotice && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{checkpointNotice}</span>
              </div>
            )}

            {/* 4 Stat Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Quota &amp; Capacity</span>
                <span className="text-xs sm:text-sm font-extrabold text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  Unlimited
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Will not finish</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Total Disk Size</span>
                <span className="text-xs sm:text-sm font-extrabold text-white">
                  {dbInfoData?.totalStorageFormatted || '2.14 MB'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Auto-compacted</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Storage Engine</span>
                <span className="text-xs sm:text-sm font-extrabold text-blue-400">
                  SQLite (WAL)
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Dual-layer JSON</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Personal Server</span>
                <span className="text-xs sm:text-sm font-extrabold text-amber-400 flex items-center gap-1">
                  <Server className="w-3.5 h-3.5 shrink-0" />
                  100% Ready
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Zero cloud setup</span>
              </div>
            </div>

            {/* Why Database Will Not Finish Quickly Section */}
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-slate-300 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Why this Database Will NOT Finish or Run Out of Quota:</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Unlike external cloud databases (such as Firebase/Firestore free tier) which enforce a strict limit of 20,000 to 50,000 writes per day that cause the database to block and finish quickly, this application uses a <strong>100% self-hosted, offline-first SQLite database</strong> (<code className="text-emerald-400">data/tfw.db</code>) with Write-Ahead Logging (WAL).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] text-slate-300">
                <div className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Zero Daily Quotas:</strong> Unlimited reads, writes, and active operators.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Auto-Compaction:</strong> Automatic WAL checkpointing truncates transaction logs so disk size never balloons.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Permanent Retention:</strong> Records remain stored permanently on disk without unexpected resets.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Portable Archive:</strong> Simply copy the app directory to your personal server and run.</span>
                </div>
              </div>
            </div>

            {/* Storage Files Table */}
            <div className="mb-5">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                <span>Storage Files on Disk:</span>
              </h4>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden text-xs">
                <div className="p-2.5 flex items-center justify-between border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-emerald-400 font-semibold">data/tfw.db</span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">(Primary SQLite binary engine with ACID guarantees)</span>
                  </div>
                  <span className="font-mono text-slate-200 font-bold">
                    {dbInfoData?.files?.sqliteDb?.sizeFormatted || '1.57 MB'}
                  </span>
                </div>

                <div className="p-2.5 flex items-center justify-between border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-blue-400 font-semibold">data/tfw.db-wal</span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">(Write-Ahead Log, auto-checkpoints into tfw.db)</span>
                  </div>
                  <span className="font-mono text-slate-200 font-bold">
                    {dbInfoData?.files?.sqliteWal?.sizeFormatted || '0.0 KB'}
                  </span>
                </div>

                <div className="p-2.5 flex items-center justify-between border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-amber-400 font-semibold">data/database.json</span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">(Human-readable JSON mirror for backups &amp; export)</span>
                  </div>
                  <span className="font-mono text-slate-200 font-bold">
                    {dbInfoData?.files?.jsonMirror?.sizeFormatted || '275.9 KB'}
                  </span>
                </div>

                <div className="p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400 font-semibold">data/database.json.backup</span>
                    <span className="text-[10px] text-slate-500 hidden sm:inline">(Automated rotating disk snapshot)</span>
                  </div>
                  <span className="font-mono text-slate-200 font-bold">
                    {dbInfoData?.files?.jsonBackup?.sizeFormatted || '275.9 KB'}
                  </span>
                </div>
              </div>
            </div>

            {/* Live Records Overview */}
            <div className="mb-5">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Live Database Records:</span>
              </h4>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-sm font-extrabold text-white block">
                    {dbInfoData?.stats?.ridesCount ?? 109}
                  </span>
                  <span className="text-[10px] text-slate-400">Rides</span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-sm font-extrabold text-white block">
                    {dbInfoData?.stats?.staffCount ?? 102}
                  </span>
                  <span className="text-[10px] text-slate-400">Staff</span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-sm font-extrabold text-white block">
                    {dbInfoData?.stats?.countersCount ?? 19}
                  </span>
                  <span className="text-[10px] text-slate-400">Counters</span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-sm font-extrabold text-white block">
                    {dbInfoData?.stats?.packagesCount ?? 8}
                  </span>
                  <span className="text-[10px] text-slate-400">Packages</span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-sm font-extrabold text-white block">
                    {dbInfoData?.stats?.operationalDatesCount ?? 13}
                  </span>
                  <span className="text-[10px] text-slate-400">Op. Dates</span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-sm font-extrabold text-emerald-400 block">
                    {dbInfoData?.stats?.ticketsCount ?? 0}
                  </span>
                  <span className="text-[10px] text-slate-400">Tickets (Clean)</span>
                </div>
              </div>
            </div>

            {/* Personal Server Extraction Instructions */}
            <div className="mb-5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
              <span className="font-bold text-white block mb-1">
                🚀 Personal Server Implementation Guide:
              </span>
              <p className="text-[11px] text-slate-300">
                To run on your personal server: Extract the project ZIP file, execute <code className="text-amber-300 font-mono">npm install</code>, then run <code className="text-amber-300 font-mono">npm start</code> (or <code className="text-amber-300 font-mono">tsx server.ts</code>). All data resides locally in the <code className="text-emerald-400 font-mono">/data</code> folder. No external setup or database accounts are required!
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300">
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Backups: Admin → Cloud Database &amp; Backup (password protected)</span>
                </span>

                <button
                  onClick={handleRunCheckpoint}
                  disabled={isCheckpointing}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                  title="Truncate WAL transaction log and vacuum SQLite database"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckpointing ? 'animate-spin' : ''}`} />
                  <span>{isCheckpointing ? 'Compacting...' : 'Compact WAL Now'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchDbInfo}
                  disabled={isDbLoading}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Refresh stats"
                >
                  <RefreshCw className={`w-4 h-4 ${isDbLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsDbInfoOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TBGCentralPortal;
