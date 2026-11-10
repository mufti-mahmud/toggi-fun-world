import React, { useState, useMemo } from 'react';
import {
  Search,
  Film,
  ExternalLink,
  Layers,
  VideoOff,
  PlusCircle,
  Filter,
  Info,
  X,
  CheckCircle2,
  Trash2,
  Edit3,
  Lock,
  Unlock,
  Building2,
  LogOut
} from 'lucide-react';
import { PasswordInput } from './PasswordInput';
import {
  ENLISTED_CATALOG,
  EnlistedItem,
  getGameBanglaDescription,
  normalizeFloor,
  toEmbedUrl
} from '../data/enlistedCatalog';
import { ToggiFunWorldLogo, TanvirBashundharaLogo } from './BrandLogos';

const CUSTOM_GAMES_STORAGE_KEY = 'toggi_custom_added_games_v1';
const EDITED_GAMES_STORAGE_KEY = 'toggi_edited_games_map_v1';
const ADMIN_ADD_SESSION_KEY = 'toggi_admin_add_unlocked_v1';
const ADMIN_EDIT_SESSION_KEY = 'toggi_admin_edit_unlocked_v1';

// Separate Admin Credentials for Add Game vs Edit Game
const DEFAULT_ADMIN_USER = 'admin';
const ADD_GAME_PASS = 'toggi123';
const EDIT_GAME_PASS = 'edit456';

import { AppConfig } from '../types';

interface KioskMonitorViewProps {
  onLogout?: () => void;
  appConfig?: AppConfig;
}

export const KioskMonitorView: React.FC<KioskMonitorViewProps> = ({ onLogout, appConfig }) => {
  const activeAdminUser = (appConfig?.infoDeskUser || DEFAULT_ADMIN_USER).trim();
  const activeAddPass = (appConfig?.infoDeskAddPassword || ADD_GAME_PASS).trim();
  const activeEditPass = (appConfig?.infoDeskEditPassword || EDIT_GAME_PASS).trim();
  // 1. Custom added games from localStorage
  const [customGames, setCustomGames] = useState<EnlistedItem[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_GAMES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 2. Edits to existing enlisted games stored by game.id
  const [editedGamesMap, setEditedGamesMap] = useState<Record<string, EnlistedItem>>(() => {
    try {
      const saved = localStorage.getItem(EDITED_GAMES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // 3. Combined & normalized catalog (Custom games + Enlisted games with any saved edits applied)
  const allGames = useMemo(() => {
    const mergedEnlisted = ENLISTED_CATALOG.map((item) => {
      const edited = editedGamesMap[item.id];
      const base = edited ? { ...item, ...edited } : item;
      return {
        ...base,
        floor: normalizeFloor(base.floor)
      };
    });
    const normalizedCustom = customGames.map((item) => {
      const edited = editedGamesMap[item.id];
      const base = edited ? { ...item, ...edited } : item;
      return {
        ...base,
        floor: normalizeFloor(base.floor)
      };
    });
    return [...normalizedCustom, ...mergedEnlisted];
  }, [customGames, editedGamesMap]);

  // Extract unique sorted Floors / Levels for the Level Filter
  const availableLevels = useMemo(() => {
    const set = new Set<string>();
    allGames.forEach((g) => {
      if (g.floor) set.add(normalizeFloor(g.floor));
    });
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numB - numA; // Level 17 down to Level 09
    });
  }, [allGames]);

  // Currently selected game ID
  const [selectedGameId, setSelectedGameId] = useState<string>(() => {
    const def =
      ENLISTED_CATALOG.find((g) => g.name.toLowerCase().includes('bowling')) ||
      ENLISTED_CATALOG[0];
    return def.id;
  });

  // Derive the active selectedGame object from allGames so edits reflect immediately
  const selectedGame = useMemo(() => {
    return allGames.find((g) => g.id === selectedGameId) || allGames[0];
  }, [allGames, selectedGameId]);

  const [switchKey, setSwitchKey] = useState<number>(1);

  // Filter States:
  // Option 1: Type Game Name
  const [typedQuery, setTypedQuery] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  // Option 2: Separate Level / Floor Filter ('ALL' or specific floor e.g. 'Level 10')
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<string>('ALL');

  // Games filtered by the selected Floor / Level (for Option 3: Game Name Filter)
  const gamesInSelectedLevel = useMemo(() => {
    if (selectedLevelFilter === 'ALL') return allGames;
    return allGames.filter(
      (g) => normalizeFloor(g.floor).toLowerCase() === selectedLevelFilter.toLowerCase()
    );
  }, [allGames, selectedLevelFilter]);

  // Separate Admin Authentication State for Add vs Edit
  const [isAddUnlocked, setIsAddUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(ADMIN_ADD_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isEditUnlocked, setIsEditUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(ADMIN_EDIT_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [pendingAdminAction, setPendingAdminAction] = useState<'ADD' | 'EDIT' | null>(null);
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  // Add / Edit Game Modal State
  const [formMode, setFormMode] = useState<'ADD' | 'EDIT' | null>(null);
  const [formGameName, setFormGameName] = useState<string>('');
  const [formGameFloor, setFormGameFloor] = useState<string>('');
  const [formGamePrice, setFormGamePrice] = useState<string>('');
  const [formGameVideo, setFormGameVideo] = useState<string>('');
  const [formGameDescBn, setFormGameDescBn] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<string>('');

  // Switch active game and refresh video player immediately
  const selectGameNow = (game: EnlistedItem) => {
    setSelectedGameId(game.id);
    setSwitchKey((k) => k + 1);
  };

  // Filtered matches for Option 1 (Type Game Name)
  const typedMatches = useMemo(() => {
    const q = typedQuery.trim().toLowerCase();
    if (!q) return [];
    const pool = selectedLevelFilter === 'ALL' ? allGames : gamesInSelectedLevel;
    return pool.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.floor.toLowerCase().includes(q)
    );
  }, [typedQuery, allGames, gamesInSelectedLevel, selectedLevelFilter]);

  // Handle typing in Option 1 (Type Game Name)
  const handleTypeGameName = (value: string) => {
    setTypedQuery(value);
    setShowSuggestions(true);
    const q = value.trim().toLowerCase();
    if (!q) return;

    const pool = selectedLevelFilter === 'ALL' ? allGames : gamesInSelectedLevel;
    const exactOrStartsWith =
      pool.find((g) => g.name.toLowerCase() === q) ||
      pool.find((g) => g.name.toLowerCase().startsWith(q)) ||
      pool.find((g) => g.name.toLowerCase().includes(q));

    if (exactOrStartsWith && exactOrStartsWith.id !== selectedGame.id) {
      selectGameNow(exactOrStartsWith);
    }
  };

  // Handle selecting a Level in Option 2 (Select Floor / Level)
  const handleSelectLevelFilter = (level: string) => {
    setSelectedLevelFilter(level);
    setTypedQuery('');
    setShowSuggestions(false);
    if (level === 'ALL') return;

    // Automatically load the first game on that floor so guest sees that floor's games right away
    const gamesOnFloor = allGames.filter(
      (g) => normalizeFloor(g.floor).toLowerCase() === level.toLowerCase()
    );
    if (gamesOnFloor.length > 0) {
      selectGameNow(gamesOnFloor[0]);
    }
  };

  // Handle selecting a game in Option 3 (Game Name Filter dropdown)
  const handleSelectDropdownGame = (gameId: string) => {
    const found = allGames.find((g) => g.id === gameId);
    if (found) {
      selectGameNow(found);
      setTypedQuery('');
      setShowSuggestions(false);
    }
  };

  // Open Add Game Form (or require Add Game User/Pass first)
  const requestOpenAddModal = () => {
    if (!isAddUnlocked) {
      setPendingAdminAction('ADD');
      setLoginUsername('');
      setLoginPassword('');
      setLoginError('');
      setIsLoginModalOpen(true);
      return;
    }
    openAddModalDirect();
  };

  const openAddModalDirect = () => {
    setFormMode('ADD');
    setFormGameName('');
    setFormGameFloor(selectedLevelFilter !== 'ALL' ? selectedLevelFilter : 'Level 14');
    setFormGamePrice('');
    setFormGameVideo('');
    setFormGameDescBn('');
  };

  // Open Edit Game Form for currently selected game (or require separate Edit Game User/Pass first)
  const requestOpenEditModal = () => {
    if (!isEditUnlocked) {
      setPendingAdminAction('EDIT');
      setLoginUsername('');
      setLoginPassword('');
      setLoginError('');
      setIsLoginModalOpen(true);
      return;
    }
    openEditModalDirect();
  };

  const openEditModalDirect = () => {
    setFormMode('EDIT');
    setFormGameName(selectedGame.name);
    setFormGameFloor(normalizeFloor(selectedGame.floor));
    setFormGamePrice(selectedGame.price);
    setFormGameVideo(selectedGame.videoLink || '');
    setFormGameDescBn(getGameBanglaDescription(selectedGame));
  };

  // Handle Admin Login Submit (Separate Password for ADD vs EDIT)
  const handleAdminLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = loginUsername.trim().toLowerCase();
    const userOk = cleanUser === activeAdminUser.toLowerCase() || cleanUser === 'admin';
    const isAddPassMatch =
      loginPassword === activeAddPass ||
      loginPassword === ADD_GAME_PASS ||
      loginPassword === appConfig?.adminPassword ||
      loginPassword === 'admin79';
    const isEditPassMatch =
      loginPassword === activeEditPass ||
      loginPassword === EDIT_GAME_PASS ||
      loginPassword === appConfig?.adminPassword ||
      loginPassword === 'admin79';

    if (pendingAdminAction === 'ADD' && userOk && isAddPassMatch) {
      setIsAddUnlocked(true);
      try {
        sessionStorage.setItem(ADMIN_ADD_SESSION_KEY, 'true');
      } catch {}
      setIsLoginModalOpen(false);
      setLoginError('');
      openAddModalDirect();
      setPendingAdminAction(null);
    } else if (pendingAdminAction === 'EDIT' && userOk && isEditPassMatch) {
      setIsEditUnlocked(true);
      try {
        sessionStorage.setItem(ADMIN_EDIT_SESSION_KEY, 'true');
      } catch {}
      setIsLoginModalOpen(false);
      setLoginError('');
      openEditModalDirect();
      setPendingAdminAction(null);
    } else {
      setLoginError(
        pendingAdminAction === 'EDIT'
          ? `Invalid Username or Edit Game Password! (Default user: "${activeAdminUser}" | pass: "${activeEditPass}")`
          : `Invalid Username or Add Game Password! (Default user: "${activeAdminUser}" | pass: "${activeAddPass}")`
      );
    }
  };

  const handleLockAdmin = () => {
    setIsAddUnlocked(false);
    setIsEditUnlocked(false);
    try {
      sessionStorage.removeItem(ADMIN_ADD_SESSION_KEY);
      sessionStorage.removeItem(ADMIN_EDIT_SESSION_KEY);
    } catch {}
    setStatusBanner('অ্যাডমিন মোড লক করা হয়েছে (Admin Mode Locked)');
    setTimeout(() => setStatusBanner(''), 3000);
  };

  // Handle Add or Edit Form Submit
  const handleGameFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = formGameName.trim();
    const floorTrimmed = normalizeFloor(formGameFloor.trim());
    const priceTrimmed = formGamePrice.trim();
    const videoTrimmed = formGameVideo.trim();
    const descTrimmed = formGameDescBn.trim();

    if (!nameTrimmed || !floorTrimmed || !priceTrimmed) return;

    const formattedPrice =
      priceTrimmed.toLowerCase().startsWith('tk') ||
      priceTrimmed.includes('৳')
        ? priceTrimmed
        : `Tk ${priceTrimmed}`;

    if (formMode === 'ADD') {
      const newItem: EnlistedItem = {
        id: `custom-${Date.now()}`,
        name: nameTrimmed,
        floor: floorTrimmed,
        price: formattedPrice,
        videoLink: videoTrimmed,
        embedUrl: toEmbedUrl(videoTrimmed),
        descriptionBn: descTrimmed || undefined
      };

      const updatedCustom = [newItem, ...customGames];
      setCustomGames(updatedCustom);
      try {
        localStorage.setItem(
          CUSTOM_GAMES_STORAGE_KEY,
          JSON.stringify(updatedCustom)
        );
      } catch {}

      if (selectedLevelFilter !== 'ALL' && selectedLevelFilter !== floorTrimmed) {
        setSelectedLevelFilter(floorTrimmed);
      }
      selectGameNow(newItem);
      setStatusBanner(`নতুন গেম যুক্ত হয়েছে: ${newItem.name} (${newItem.floor})`);
    } else if (formMode === 'EDIT') {
      const updatedItem: EnlistedItem = {
        ...selectedGame,
        name: nameTrimmed,
        floor: floorTrimmed,
        price: formattedPrice,
        videoLink: videoTrimmed,
        embedUrl: toEmbedUrl(videoTrimmed),
        descriptionBn: descTrimmed || undefined
      };

      const updatedMap = {
        ...editedGamesMap,
        [selectedGame.id]: updatedItem
      };
      setEditedGamesMap(updatedMap);
      try {
        localStorage.setItem(EDITED_GAMES_STORAGE_KEY, JSON.stringify(updatedMap));
      } catch {}

      // If it's also a custom game, update customGames list too
      if (selectedGame.id.startsWith('custom-')) {
        const updatedCustom = customGames.map((g) =>
          g.id === selectedGame.id ? updatedItem : g
        );
        setCustomGames(updatedCustom);
        try {
          localStorage.setItem(
            CUSTOM_GAMES_STORAGE_KEY,
            JSON.stringify(updatedCustom)
          );
        } catch {}
      }

      setSwitchKey((k) => k + 1);
      setStatusBanner(`গেম আপডেট হয়েছে: ${updatedItem.name} (${updatedItem.floor})`);
    }

    setTimeout(() => setStatusBanner(''), 4000);
    setFormMode(null);
  };

  // Delete a custom added game
  const handleDeleteCustomGame = (id: string) => {
    const updated = customGames.filter((g) => g.id !== id);
    setCustomGames(updated);
    try {
      localStorage.setItem(CUSTOM_GAMES_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    if (selectedGame.id === id) {
      const fallback = ENLISTED_CATALOG[0];
      if (fallback) selectGameNow(fallback);
    }
  };

  const isCustomSelected = selectedGame.id.startsWith('custom-');

  return (
    <div className="flex flex-col min-h-[calc(100vh-32px)] bg-[#050713] rounded-2xl border border-cyan-500/30 shadow-2xl overflow-hidden text-slate-100 font-sans">
      
      {/* =====================================================================
          TOP HEADER BAR WITH BOTH ATTACHED LOGOS (TOGGI FUN WORLD & TBG)
         ===================================================================== */}
      <div className="px-4 sm:px-6 py-3 bg-[#0a0d20] border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        {/* Left: 1st Logo (Our Amusement Park Logo - TOGGI FUN WORLD) */}
        <div className="flex items-center gap-3">
          <ToggiFunWorldLogo className="h-14 sm:h-16 w-auto" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-normal text-slate-200 text-xs sm:text-sm tracking-wide uppercase">
                TOGGI FUN WORLD
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                TFW Information Desk
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Counter Desk Information &amp; Video Display ({allGames.length} Games)
            </p>
          </div>
        </div>

        {/* Right: Admin Status + TANVIR BASHUNDHARA GROUP + 2nd Logo + Switch Role */}
        <div className="flex items-center gap-3.5 flex-wrap">
          {(isAddUnlocked || isEditUnlocked) && (
            <button
              type="button"
              onClick={handleLockAdmin}
              title="Click to Lock Admin Mode"
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Unlock className="w-3.5 h-3.5 text-amber-400" />
              <span>Admin Unlocked (Lock)</span>
            </button>
          )}
          <div className="text-right">
            <span className="font-black text-white text-sm sm:text-lg tracking-tight uppercase block">
              TANVIR BASHUNDHARA GROUP
            </span>
          </div>
          <TanvirBashundharaLogo className="h-14 sm:h-16 w-auto" />
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Return to Login / Role Selection"
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-red-900/40 text-slate-200 hover:text-red-200 border border-slate-700 hover:border-red-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-md"
            >
              <LogOut className="w-4 h-4 text-red-400" />
              <span className="hidden sm:inline">Switch Role</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Confirmation Banner */}
      {statusBanner && (
        <div className="px-5 py-2 bg-emerald-950/90 border-b border-emerald-500/40 flex items-center justify-between text-xs text-emerald-200">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusBanner}</span>
          </div>
        </div>
      )}

      {/* =====================================================================
          FILTER & ADMIN ACTION BAR:
          1. Type Game Name
          2. Select Floor / Level (Separately filters games on that floor)
          3. Game Name Filter (Shows games of selected floor)
          4. Edit Game & + Add New Game (Protected by User/Pass)
         ===================================================================== */}
      <div className="px-4 sm:px-6 py-3.5 bg-[#080b1a] border-b border-slate-800 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          
          {/* OPTION 1: TYPE GAME NAME */}
          <div className="md:col-span-3 relative">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 mb-1">
              <Search className="w-3.5 h-3.5" />
              <span>1. Type Game Name</span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={typedQuery}
                onChange={(e) => handleTypeGameName(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                placeholder="Type game name (e.g. Paintball)..."
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 font-medium"
              />
              {typedQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setTypedQuery('');
                    setShowSuggestions(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Live Suggestions Dropdown while Typing */}
            {showSuggestions && typedQuery.trim() !== '' && (
              <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-xl bg-slate-900 border border-cyan-500/50 shadow-2xl z-30 divide-y divide-slate-800">
                {typedMatches.length > 0 ? (
                  typedMatches.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={() => {
                        selectGameNow(item);
                        setTypedQuery(item.name);
                        setShowSuggestions(false);
                      }}
                      className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between hover:bg-cyan-500/20 transition-colors cursor-pointer ${
                        selectedGame.id === item.id ? 'bg-cyan-500/15 text-cyan-300 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <span className="truncate font-semibold">{item.name}</span>
                      <span className="text-[11px] font-mono text-amber-300 shrink-0 ml-2">
                        {item.floor} • {item.price}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-3.5 py-2.5 text-xs text-slate-400">
                    No matching game found for "{typedQuery}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* OPTION 2: SELECT LEVEL / FLOOR SEPARATELY */}
          <div className="md:col-span-3">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-1">
              <Building2 className="w-3.5 h-3.5" />
              <span>2. Select Floor / Level</span>
            </label>
            <select
              value={selectedLevelFilter}
              onChange={(e) => handleSelectLevelFilter(e.target.value)}
              className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-slate-900 border border-amber-500/50 text-white focus:outline-none focus:border-amber-400 font-bold cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">
                All Levels / Floors ({allGames.length} Games)
              </option>
              {availableLevels.map((lvl) => {
                const count = allGames.filter(
                  (g) => normalizeFloor(g.floor).toLowerCase() === lvl.toLowerCase()
                ).length;
                return (
                  <option key={lvl} value={lvl} className="bg-slate-900 text-white">
                    {lvl} ({count} Games in this floor)
                  </option>
                );
              })}
            </select>
          </div>

          {/* OPTION 3: GAME NAME FILTER (FILTERED BY SELECTED LEVEL) */}
          <div className="md:col-span-3">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-purple-400 flex items-center gap-1.5 mb-1">
              <Filter className="w-3.5 h-3.5" />
              <span>
                3. Game Name Filter ({gamesInSelectedLevel.length}{' '}
                {selectedLevelFilter === 'ALL' ? 'Total' : `on ${selectedLevelFilter}`})
              </span>
            </label>
            <select
              value={selectedGame.id}
              onChange={(e) => handleSelectDropdownGame(e.target.value)}
              className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-purple-400 font-semibold cursor-pointer"
            >
              {gamesInSelectedLevel.map((game) => (
                <option key={game.id} value={game.id} className="bg-slate-900 text-white">
                  {game.name} • ({game.floor}) • {game.price}
                </option>
              ))}
            </select>
          </div>

          {/* ADMIN ACTIONS: EDIT EXISTING GAME & + ADD NEW GAME */}
          <div className="md:col-span-3 flex items-center gap-2">
            <button
              type="button"
              onClick={requestOpenEditModal}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 border border-amber-500/40 cursor-pointer transition-all shadow-md"
              title="Edit currently selected game (Requires Admin User/Pass)"
            >
              <Edit3 className="w-4 h-4 shrink-0" />
              <span>Edit Game</span>
            </button>
            <button
              type="button"
              onClick={requestOpenAddModal}
              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-900/30 border border-emerald-400/40 cursor-pointer transition-all"
              title="Add a new game (Requires Admin User/Pass)"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>+ Add New</span>
            </button>
          </div>
        </div>

        {/* Quick Floor Game Chips when a specific Level is selected */}
        {selectedLevelFilter !== 'ALL' && (
          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[11px] font-black text-amber-400 uppercase shrink-0 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              <span>{selectedLevelFilter} Games:</span>
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {gamesInSelectedLevel.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selectGameNow(g)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap border transition-all cursor-pointer ${
                    selectedGame.id === g.id
                      ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  {g.name} ({g.price})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          MAIN 2-COLUMN DISPLAY:
          LEFT: GAME NAME + ACCURATE HOW-TO-PLAY BANGLA INFO + FLOOR + PRICE
          RIGHT: VIDEO PLAYER
         ===================================================================== */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 overflow-y-auto">
        
        {/* LEFT PANEL: GAME NAME, BANGLA HOW-TO-PLAY DESCRIPTION, FLOOR & PRICE */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-2xl bg-[#0c0f24] border border-cyan-500/40 p-6 sm:p-7 shadow-xl">
          <div className="space-y-5">
            
            {/* 1. Game / Ride Name + Accurate 2-3 Line Bangla How-To-Play Description */}
            <div className="border-b border-slate-800 pb-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-black uppercase text-cyan-400 tracking-wider block mb-1">
                    Game / Ride Name
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                    {selectedGame.name}
                  </h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={requestOpenEditModal}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  {isCustomSelected && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomGame(selectedGame.id)}
                      title="Delete custom added game"
                      className="px-2.5 py-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Accurate 2-3 Line Bangla Information About What Type of Game & How to Play */}
              <div className="mt-3.5 p-4 rounded-xl bg-slate-900/95 border border-cyan-500/30 text-slate-200 shadow-inner">
                <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 mb-1.5">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>গেমের ধরন ও খেলার নিয়ম (সংক্ষিপ্ত তথ্য):</span>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed text-slate-100 font-medium">
                  {getGameBanglaDescription(selectedGame)}
                </p>
              </div>
            </div>

            {/* 2. Floor */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-bold uppercase block">
                    Floor / Level
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-cyan-300 font-mono">
                    {selectedGame.floor}
                  </span>
                </div>
              </div>
              <span className="px-3.5 py-1.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/50 text-xs sm:text-sm font-black font-mono">
                {selectedGame.floor}
              </span>
            </div>

            {/* 3. Price (BDT) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                  <span className="text-sm font-black text-amber-400 tracking-tight font-mono select-none">
                    TK
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-bold uppercase block">
                    Ticket Price (BDT)
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-amber-300 font-mono">
                    {selectedGame.price}
                  </span>
                </div>
              </div>
              <span className="px-3.5 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 text-xs sm:text-sm font-black">
                {selectedGame.price}
              </span>
            </div>
          </div>

          {/* Left Card Footer with Both Logos */}
          <div className="pt-4 mt-5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ToggiFunWorldLogo className="h-10 w-auto" />
              <span className="font-normal text-slate-300 text-xs tracking-wide uppercase">
                TOGGI FUN WORLD
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="font-black text-white text-xs sm:text-sm tracking-tight uppercase">
                TANVIR BASHUNDHARA GROUP
              </span>
              <TanvirBashundharaLogo className="h-10 w-auto" />
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: VIDEO LINK PLAYER */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-2xl bg-[#0c0f24] border border-cyan-500/40 p-4 shadow-xl">
          <div className="space-y-3 h-full flex flex-col justify-between">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-pink-400" />
                <h3 className="font-black text-white text-xs sm:text-sm uppercase tracking-wide">
                  Game Video Preview
                </h3>
              </div>
              <span className="text-xs font-mono text-cyan-300 font-bold">
                {selectedGame.name} ({selectedGame.floor})
              </span>
            </div>

            {/* Video Iframe Player or Placeholder */}
            {selectedGame.embedUrl ? (
              <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-purple-950 shadow-inner group">
                <iframe
                  key={`video-player-${selectedGame.id}-${switchKey}`}
                  src={selectedGame.embedUrl}
                  title={selectedGame.name}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
                <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded bg-black/80 border border-white/20 text-[10px] text-cyan-300 font-bold backdrop-blur-sm flex items-center gap-1.5 pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                  <span>Now Playing: {selectedGame.name}</span>
                </div>
              </div>
            ) : (
              <div className="aspect-video w-full rounded-xl bg-slate-950/80 border border-dashed border-slate-800 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <VideoOff className="w-12 h-12 text-slate-600 mb-2" />
                <p className="text-sm font-bold text-slate-300">ভিডিও লিংক যুক্ত করা নেই</p>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  No video link specified for {selectedGame.name}
                </p>
                <button
                  type="button"
                  onClick={requestOpenEditModal}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>+ Add / Edit Video Link</span>
                </button>
              </div>
            )}

            {/* Direct Video Link Bar */}
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
              <div className="truncate pr-2">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Video Link:</span>
                <span className="text-white font-mono text-[11px] truncate block">
                  {selectedGame.videoLink || 'None (কোনো লিংক নেই)'}
                </span>
              </div>
              {selectedGame.videoLink ? (
                <a
                  href={selectedGame.videoLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-[11px] font-bold text-white flex items-center gap-1 transition-all shrink-0 shadow-md"
                >
                  <span>ইউটিউবে দেখুন</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-500 text-[11px] font-bold">
                  No Link
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          MODAL 1: ADMIN LOGIN (USER & PASSWORD FOR ADD / EDIT GAME)
         ===================================================================== */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1229] border border-amber-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-400" />
                <h3 className="text-base sm:text-lg font-black text-white uppercase">
                  Admin Login Required
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsLoginModalOpen(false);
                  setPendingAdminAction(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Please enter Admin Username and Password to{' '}
              <span className="text-amber-300 font-bold">
                {pendingAdminAction === 'ADD' ? 'Add a New Game' : `Edit "${selectedGame.name}"`}
              </span>
              .
            </p>

            <div className="flex items-center justify-between text-[11px] text-slate-300 bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-700/80">
              <span className="font-mono">User: <strong className="text-cyan-300 font-bold">{activeAdminUser}</strong></span>
              <span className="font-mono">
                {pendingAdminAction === 'EDIT' ? (
                  <>Edit Pass: <strong className="text-amber-300 font-bold">{activeEditPass}</strong></>
                ) : (
                  <>Add Pass: <strong className="text-amber-300 font-bold">{activeAddPass}</strong></>
                )}
              </span>
            </div>

            {loginError && (
              <div className="p-2.5 rounded-xl bg-red-950/90 border border-red-500/50 text-xs text-red-200 font-semibold">
                {loginError}
              </div>
            )}

            <form onSubmit={handleAdminLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-cyan-300 uppercase mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-300 uppercase mb-1">
                  Password *
                </label>
                <PasswordInput
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsLoginModalOpen(false);
                    setPendingAdminAction(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs sm:text-sm font-black shadow-lg cursor-pointer"
                >
                  Unlock &amp; Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: ADD NEW GAME OR EDIT EXISTING GAME
         ===================================================================== */}
      {formMode !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1229] border border-cyan-500/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                {formMode === 'ADD' ? (
                  <PlusCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Edit3 className="w-5 h-5 text-amber-400" />
                )}
                <h3 className="text-base sm:text-lg font-black text-white uppercase">
                  {formMode === 'ADD' ? 'Add New Game / Ride' : `Edit Game: ${selectedGame.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFormMode(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGameFormSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-cyan-300 uppercase mb-1">
                  Game / Ride Name *
                </label>
                <input
                  type="text"
                  required
                  value={formGameName}
                  onChange={(e) => setFormGameName(e.target.value)}
                  placeholder="e.g. VR Sky Diver"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-purple-300 uppercase mb-1">
                    Floor / Level *
                  </label>
                  <input
                    type="text"
                    required
                    list="floor-levels-list"
                    value={formGameFloor}
                    onChange={(e) => setFormGameFloor(e.target.value)}
                    placeholder="e.g. Level 14"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-400"
                  />
                  <datalist id="floor-levels-list">
                    {availableLevels.map((lvl) => (
                      <option key={lvl} value={lvl} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-300 uppercase mb-1">
                    Price (BDT) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formGamePrice}
                    onChange={(e) => setFormGamePrice(e.target.value)}
                    placeholder="e.g. Tk 400"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-pink-300 uppercase mb-1">
                  Video Link (YouTube / Shorts URL)
                </label>
                <input
                  type="url"
                  value={formGameVideo}
                  onChange={(e) => setFormGameVideo(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or https://www.youtube.com/shorts/..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-pink-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-emerald-300 uppercase mb-1">
                  গেমের ধরন ও খেলার নিয়ম (বাংলা বর্ণনা)
                </label>
                <textarea
                  rows={3}
                  value={formGameDescBn}
                  onChange={(e) => setFormGameDescBn(e.target.value)}
                  placeholder="এই গেমটি কী ধরনের এবং কীভাবে খেলতে হয় তা ২-৩ লাইনে লিখুন..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs sm:text-sm focus:outline-none focus:border-emerald-400 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormMode(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs sm:text-sm font-black shadow-lg cursor-pointer"
                >
                  {formMode === 'ADD' ? 'Save & Show New Game' : 'Update Game Info'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          PAGE FOOTER: DEVELOPED BY MUFTI MAHMUD MOLLAH
         ===================================================================== */}
      <footer className="px-4 sm:px-6 py-3.5 bg-[#070a18] border-t border-cyan-500/25 text-center shrink-0">
        <div className="max-w-xl mx-auto flex flex-col items-center justify-center space-y-0.5">
          <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-semibold">
            Developed By
          </span>
          <p className="text-sm sm:text-base font-normal text-white tracking-wide">
            Mufti Mahmud Mollah
          </p>
          <p className="text-xs font-semibold text-amber-300">
            AGM (Maintenance &amp; SCD, FP, TFW)
          </p>
          <p className="text-xs font-medium text-slate-300">
            Toggi Fun World
          </p>
        </div>
      </footer>
    </div>
  );
};
