import React, { useState, useMemo, useCallback } from 'react';
import { MaintenanceTicket, Operator, Ride, CustomTechnicalCategory } from '../types';
import { getDhakaDateString } from '../constants';
import { database } from '../firebaseConfig';
import {
  Wrench,
  Calendar,
  CalendarRange,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Search,
  Download,
  Printer,
  Filter,
  Cpu,
  Cog,
  Zap,
  ShieldCheck,
  Gauge,
  Volume2,
  Thermometer,
  Armchair,
  Sparkles,
  Check,
  ArrowUpDown,
  ChevronRight,
  ChevronDown,
  Camera,
  Flame,
  Award,
  Layers,
  Activity,
  FileSpreadsheet,
  RotateCcw,
  Plus,
  Trash2,
  Tag,
  Settings2,
  X
} from 'lucide-react';
import { PasswordInput } from './PasswordInput';

export interface TechnicalCategoryDef {
  id: string;
  name: string;
  shortName: string;
  code: string;
  description: string;
  subsystemExamples: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  barColor: string;
  colorTheme?: 'cyan' | 'amber' | 'blue' | 'indigo' | 'rose' | 'purple' | 'teal' | 'emerald';
  iconName?: string;
  icon: React.FC<{ className?: string }>;
  keywords: string[];
}

export const CATEGORY_THEME_STYLES: Record<
  'cyan' | 'amber' | 'blue' | 'indigo' | 'rose' | 'purple' | 'teal' | 'emerald',
  { accentText: string; accentBg: string; accentBorder: string; barColor: string }
> = {
  cyan: {
    accentText: 'text-cyan-300',
    accentBg: 'bg-cyan-950/50',
    accentBorder: 'border-cyan-700/50',
    barColor: 'bg-cyan-500'
  },
  amber: {
    accentText: 'text-amber-300',
    accentBg: 'bg-amber-950/50',
    accentBorder: 'border-amber-700/50',
    barColor: 'bg-amber-500'
  },
  blue: {
    accentText: 'text-blue-300',
    accentBg: 'bg-blue-950/50',
    accentBorder: 'border-blue-700/50',
    barColor: 'bg-blue-500'
  },
  indigo: {
    accentText: 'text-indigo-300',
    accentBg: 'bg-indigo-950/50',
    accentBorder: 'border-indigo-700/50',
    barColor: 'bg-indigo-500'
  },
  rose: {
    accentText: 'text-rose-300',
    accentBg: 'bg-rose-950/50',
    accentBorder: 'border-rose-700/50',
    barColor: 'bg-rose-500'
  },
  purple: {
    accentText: 'text-purple-300',
    accentBg: 'bg-purple-950/50',
    accentBorder: 'border-purple-700/50',
    barColor: 'bg-purple-500'
  },
  teal: {
    accentText: 'text-teal-300',
    accentBg: 'bg-teal-950/50',
    accentBorder: 'border-teal-700/50',
    barColor: 'bg-teal-500'
  },
  emerald: {
    accentText: 'text-emerald-300',
    accentBg: 'bg-emerald-950/50',
    accentBorder: 'border-emerald-700/50',
    barColor: 'bg-emerald-500'
  }
};

export const CATEGORY_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Cpu,
  Zap,
  Cog,
  Gauge,
  ShieldCheck,
  Volume2,
  Thermometer,
  Armchair,
  Wrench,
  Tag
};

export const DEFAULT_CUSTOM_TECHNICAL_CATEGORIES: CustomTechnicalCategory[] = [
  {
    id: 'software-issue',
    name: 'Software Issue',
    shortName: 'Software Issue',
    code: 'CAT-01',
    description: 'Game programs, PC operating systems, VR software, card reader software, firmware bugs, display drivers, licensing & network sync glitches',
    subsystemExamples: 'Game app crash, Windows freeze, card reader offline, VR sync failure, software restart',
    colorTheme: 'cyan',
    iconName: 'Cpu',
    keywords: [
      'software', 'software issue', 'program', 'app', 'code', 'bug', 'glitch', 'crash', 'freeze', 'frozen',
      'os', 'windows', 'linux', 'firmware', 'update', 'reboot', 'restart', 'license', 'card reader', 'rfid',
      'network', 'wifi', 'lan', 'ip', 'server', 'database', 'driver', 'calibration', 'touch screen software',
      'vr app', 'simulator game', 'game error', 'screen error', 'blue screen', 'hud'
    ]
  },
  {
    id: 'hardware-repair',
    name: 'Hardware Repair',
    shortName: 'Hardware Repair',
    code: 'CAT-02',
    description: 'Board-level electronics, wiring reconnection, soldering, motor repair, mechanical welding, brackets, bent shafts & structural fixes',
    subsystemExamples: 'Broken harness bracket, disconnected wiring terminal, faulty motor winding, welded joint crack',
    colorTheme: 'amber',
    iconName: 'Wrench',
    keywords: [
      'hardware repair', 'hardware', 'repair', 'repaired', 'fixing', 'fixed', 'broken', 'damage', 'damaged',
      'soldering', 'solder', 'wiring', 'wire', 'cable repair', 'terminal', 'burnt', 'motor', 'welding', 'weld',
      'chassis', 'frame', 'crack', 'bent', 'loosened', 'tighten', 'bolt', 'screw', 'bracket', 'lever',
      'pedal', 'steering', 'hinge', 'housing', 'panel repair', 'caliper repair', 'switch repair'
    ]
  },
  {
    id: 'hardware-service',
    name: 'Hardware Service',
    shortName: 'Hardware Service',
    code: 'CAT-03',
    description: 'Periodic preventive servicing, lubrication, grease application, track alignment, dust clearance, sensor wiping & hardware maintenance',
    subsystemExamples: 'Track guide roller greasing, optical sensor dust wipe, V-belt tensioning, compressor oil check',
    colorTheme: 'teal',
    iconName: 'Cog',
    keywords: [
      'hardware service', 'harware service', 'service', 'servicing', 'serviced', 'maintenance', 'preventive',
      'cleaning', 'clean', 'cleaned', 'dust', 'grease', 'greasing', 'lubrication', 'lube', 'oil', 'oil check',
      'alignment', 'align', 'tensioning', 'tension', 'belt tension', 'chain lube', 'filter clean', 'sensor wipe',
      'periodic check', 'routine service', 'tune up', 'tightened', 'adjusted', 'adjustment'
    ]
  },
  {
    id: 'parts-replace',
    name: 'Parts Replace',
    shortName: 'Parts Replace',
    code: 'CAT-04',
    description: 'Replacement of worn-out parts, new spare installation, burnt components, new bearings, switches, belts, fuses, brake pads & seals',
    subsystemExamples: 'New bearing installed, proximity switch replaced, push-button swapped, worn drive belt replacement',
    colorTheme: 'rose',
    iconName: 'Gauge',
    keywords: [
      'parts replace', 'part replace', 'parts replacement', 'replace', 'replaced', 'replacement', 'replacing',
      'new part', 'spare', 'spare part', 'substituted', 'swap', 'swapped', 'new bearing', 'new belt',
      'new sensor', 'new switch', 'new fuse', 'new button', 'new psu', 'new valve', 'new cylinder',
      'brake pad replace', 'new wheel', 'o-ring replace', 'new cable', 'new motor'
    ]
  },
  {
    id: 'skill-knowledge-contribution',
    name: 'Skill / Knowledge Contribution',
    shortName: 'Skill / Knowledge',
    code: 'CAT-05',
    description: 'Technical expertise sharing, troubleshooting guidance, SOP procedural documentation, operator safety briefing & technical innovation',
    subsystemExamples: 'Engineering troubleshooting SOP, technician skill-share session, operator safety demonstration',
    colorTheme: 'purple',
    iconName: 'ShieldCheck',
    keywords: [
      'skill / knowledge contribution', 'skill', 'knowledge', 'contribution', 'training', 'trained', 'guide',
      'guided', 'guidance', 'instruction', 'sop', 'standard operating procedure', 'procedure', 'advice',
      'consultation', 'technique', 'expertise', 'knowledge sharing', 'demonstration', 'mentor', 'mentoring',
      'briefing', 'engineering advice', 'manual', 'innovation', 'best practice'
    ]
  }
];

export const hydrateTechnicalCategories = (customList?: CustomTechnicalCategory[]): TechnicalCategoryDef[] => {
  // If customList is the old 8 categories, force the new 5 permanent categories
  const isOld8CategoryList = customList && Array.isArray(customList) && (
    customList.length !== 5 ||
    customList.some(c => c.id === 'plc-sensors' || c.id === 'hvac-chiller-env' || c.name.includes('PLC, Control'))
  );

  const source =
    !isOld8CategoryList && customList && Array.isArray(customList) && customList.length === 5
      ? customList
      : DEFAULT_CUSTOM_TECHNICAL_CATEGORIES;

  const themeKeys: Array<'cyan' | 'amber' | 'blue' | 'indigo' | 'rose' | 'purple' | 'teal' | 'emerald'> = [
    'cyan',
    'amber',
    'blue',
    'indigo',
    'rose',
    'purple',
    'teal',
    'emerald'
  ];

  return source.map((c, idx) => {
    const themeKey = c.colorTheme && CATEGORY_THEME_STYLES[c.colorTheme] ? c.colorTheme : themeKeys[idx % themeKeys.length];
    const styles = CATEGORY_THEME_STYLES[themeKey];
    const iconComp = (c.iconName && CATEGORY_ICON_MAP[c.iconName]) || Wrench;

    return {
      id: c.id || `cat-${idx + 1}`,
      name: c.name,
      shortName: c.shortName || c.name.slice(0, 18),
      code: c.code || `CAT-${String(idx + 1).padStart(2, '0')}`,
      description: c.description || `${c.name} technical problem solved category`,
      subsystemExamples: c.subsystemExamples || '',
      accentText: styles.accentText,
      accentBg: styles.accentBg,
      accentBorder: styles.accentBorder,
      barColor: styles.barColor,
      colorTheme: themeKey,
      iconName: c.iconName || 'Wrench',
      icon: iconComp,
      keywords: Array.isArray(c.keywords) && c.keywords.length > 0
        ? c.keywords
        : c.name
            .toLowerCase()
            .split(/[\s,&/-]+/)
            .filter(w => w.length > 2)
    };
  });
};

export const AMUSEMENT_TECHNICAL_CATEGORIES: TechnicalCategoryDef[] = hydrateTechnicalCategories(
  DEFAULT_CUSTOM_TECHNICAL_CATEGORIES
);

/**
 * Expert Amusement Park Technical Classifier:
 * Analyzes ticket problem description, resolution notes, ride name, and feedbackCategory
 * to deterministically assign one of the active amusement park engineering categories.
 */
export const classifyAmusementParkIssue = (
  ticket: MaintenanceTicket,
  activeCategories: TechnicalCategoryDef[] = AMUSEMENT_TECHNICAL_CATEGORIES
): TechnicalCategoryDef => {
  const cats = activeCategories.length > 0 ? activeCategories : AMUSEMENT_TECHNICAL_CATEGORIES;
  const rawCat = (ticket.feedbackCategory || '').trim();

  // Direct match if ticket already has an explicit technical category ID, code, or name
  if (rawCat) {
    const rawLower = rawCat.toLowerCase();
    const directMatch = cats.find(
      c =>
        c.id.toLowerCase() === rawLower ||
        c.name.toLowerCase() === rawLower ||
        c.shortName.toLowerCase() === rawLower ||
        c.code.toLowerCase() === rawLower ||
        `${c.code}: ${c.name}`.toLowerCase() === rawLower
    );
    if (directMatch) return directMatch;
  }

  const combinedText = [
    ticket.problem || '',
    ticket.resolutionNotes || '',
    ticket.feedbackCategory || '',
    ticket.rideName || ''
  ]
    .join(' ')
    .toLowerCase();

  // Score each category based on technical keyword matches
  let bestCategory: TechnicalCategoryDef | null = null;
  let bestScore = 0;

  for (const cat of cats) {
    let score = 0;
    if (combinedText.includes(cat.name.toLowerCase()) || combinedText.includes(cat.shortName.toLowerCase())) {
      score += 6;
    }
    for (const kw of cat.keywords) {
      const kwClean = kw.toLowerCase().trim();
      if (kwClean && combinedText.includes(kwClean)) {
        score += kwClean.includes(' ') ? 3 : 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  if (bestCategory && bestScore > 0) {
    return bestCategory;
  }

  // Map legacy CX feedback categories cleanly to the 5 permanent categories
  const catLower = rawCat.toLowerCase();
  if (
    catLower.includes('software') ||
    catLower.includes('program') ||
    catLower.includes('system') ||
    catLower.includes('bug') ||
    catLower.includes('card reader') ||
    catLower.includes('network')
  ) {
    return cats.find(c => c.id === 'software-issue') || cats[0];
  }
  if (
    catLower.includes('replace') ||
    catLower.includes('spare') ||
    catLower.includes('bearing') ||
    catLower.includes('parts')
  ) {
    return cats.find(c => c.id === 'parts-replace') || cats[3] || cats[0];
  }
  if (
    catLower.includes('service') ||
    catLower.includes('clean') ||
    catLower.includes('lubricat') ||
    catLower.includes('grease') ||
    catLower.includes('oil') ||
    catLower.includes('air condition') ||
    catLower.includes('ventilation')
  ) {
    return cats.find(c => c.id === 'hardware-service') || cats[2] || cats[0];
  }
  if (
    catLower.includes('training') ||
    catLower.includes('sop') ||
    catLower.includes('guide') ||
    catLower.includes('knowledge') ||
    catLower.includes('skill')
  ) {
    return cats.find(c => c.id === 'skill-knowledge-contribution') || cats[4] || cats[0];
  }

  // Fallback based on ride type (VR/PC/Arcade games often software/repair)
  const rideLower = (ticket.rideName || '').toLowerCase();
  if (
    rideLower.includes('vr') ||
    rideLower.includes('simulator') ||
    rideLower.includes('arcade') ||
    rideLower.includes('game')
  ) {
    return cats.find(c => c.id === 'software-issue') || cats[0];
  }

  // Default to Hardware Repair for general ride breakdown/mechanical issues
  return cats.find(c => c.id === 'hardware-repair') || cats[1] || cats[0];
};

const getDhakaDateOffset = (baseYmd: string, daysAgo: number): string => {
  try {
    const [y, m, d] = (baseYmd || '').split('-').map(Number);
    if (!y || !m || !d) return baseYmd;
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return date.toISOString().slice(0, 10);
  } catch {
    return baseYmd;
  }
};

const extractTicketDates = (t: MaintenanceTicket, fallbackToday: string) => {
  let solvedDate = '';
  if (t.solvedAt) {
    try {
      solvedDate = getDhakaDateString(new Date(t.solvedAt));
    } catch {
      solvedDate = String(t.solvedAt).slice(0, 10);
    }
  }
  let reportedDate = '';
  if (t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
    reportedDate = t.date;
  } else if (t.reportedAt) {
    try {
      reportedDate = getDhakaDateString(new Date(t.reportedAt));
    } catch {
      reportedDate = String(t.reportedAt).slice(0, 10);
    }
  }
  if (!solvedDate && reportedDate) solvedDate = reportedDate;
  if (!reportedDate && solvedDate) reportedDate = solvedDate;
  if (!solvedDate) solvedDate = fallbackToday;
  if (!reportedDate) reportedDate = fallbackToday;
  return { solvedDate, reportedDate };
};

const getTurnaroundMinutes = (reportedAt?: string, solvedAt?: string): number | null => {
  if (!reportedAt || !solvedAt) return null;
  const start = new Date(reportedAt).getTime();
  const end = new Date(solvedAt).getTime();
  const diffMs = end - start;
  if (diffMs <= 0 || isNaN(diffMs)) return null;
  return Math.max(1, Math.floor(diffMs / (1000 * 60)));
};

const formatDurationMinutes = (mins: number | null): string => {
  if (mins === null || isNaN(mins) || mins <= 0) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

interface Props {
  maintenanceTickets: Record<string, Record<string, MaintenanceTicket>> | Record<string, any>;
  maintenancePersonnel: Operator[];
  rides: Ride[];
  selectedDate: string;
  onDateChange?: (date: string) => void;
  onNavigate?: (view: any) => void;
  onReportProblem?: (
    rideId: number,
    problem: string,
    feedbackCategory?: string,
    priority?: 'normal' | 'high' | 'urgent',
    guestDetails?: string,
    source?: string
  ) => void;
  onUploadSolvedTickets?: (tickets: MaintenanceTicket[]) => void;
  customCategories?: CustomTechnicalCategory[];
  onSaveCategories?: (categories: CustomTechnicalCategory[]) => void;
  onUpdateCustomCategories?: (categories: CustomTechnicalCategory[]) => void;
  onUpdateTicketCategory?: (ticket: MaintenanceTicket, newCategoryName: string) => void;
  kpiUsername?: string;
  kpiPassword?: string;
  onSaveKpiCredentials?: (username: string, password: string) => void;
  onUpdateKpiCredentials?: (username: string, password: string) => void;
  isAlreadyAuthenticated?: boolean;
  isKpiRolePreAuthenticated?: boolean;
}

export const MaintenanceKpiDashboard: React.FC<Props> = ({
  maintenanceTickets = {},
  maintenancePersonnel = [],
  rides = [],
  selectedDate,
  onNavigate,
  onUploadSolvedTickets,
  customCategories,
  onSaveCategories,
  onUpdateCustomCategories,
  onUpdateTicketCategory,
  kpiUsername = 'kpi',
  kpiPassword = 'kpi123',
  onSaveKpiCredentials,
  onUpdateKpiCredentials,
  isAlreadyAuthenticated,
  isKpiRolePreAuthenticated = false
}) => {
  const effectiveSaveCategories = onSaveCategories || onUpdateCustomCategories;
  const effectiveSaveCredentials = onSaveKpiCredentials || onUpdateKpiCredentials;
  const effectivePreAuth = isAlreadyAuthenticated ?? isKpiRolePreAuthenticated;
  const todayStr = useMemo(() => getDhakaDateString(), []);

  // ============================================================================
  // KPI DASHBOARD USER & PASSWORD AUTHENTICATION GATE
  // ============================================================================
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    if (effectivePreAuth) return true;
    try {
      return sessionStorage.getItem('TFW_KPI_DASHBOARD_UNLOCKED') === 'true';
    } catch {
      return false;
    }
  });
  const [inputUsername, setInputUsername] = useState<string>('');
  const [inputPassword, setInputPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [showCredentialsModal, setShowCredentialsModal] = useState<boolean>(false);
  const [newKpiUser, setNewKpiUser] = useState<string>(kpiUsername || 'kpi');
  const [newKpiPass, setNewKpiPass] = useState<string>(kpiPassword || 'kpi123');
  const [credSavedMsg, setCredSavedMsg] = useState<string>('');

  const handleKpiLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const expectedUser = (kpiUsername || 'kpi').trim().toLowerCase();
    const expectedPass = (kpiPassword || 'kpi123').trim();
    if (
      inputUsername.trim().toLowerCase() === expectedUser &&
      inputPassword.trim() === expectedPass
    ) {
      setIsUnlocked(true);
      setAuthError('');
      try {
        sessionStorage.setItem('TFW_KPI_DASHBOARD_UNLOCKED', 'true');
      } catch {
        // ignore storage error
      }
    } else {
      setAuthError('Invalid KPI Dashboard Username or Password. Please try again.');
    }
  };

  const handleLockDashboard = () => {
    setIsUnlocked(false);
    setInputUsername('');
    setInputPassword('');
    try {
      sessionStorage.removeItem('TFW_KPI_DASHBOARD_UNLOCKED');
    } catch {
      // ignore
    }
  };

  const handleSaveKpiCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKpiUser.trim() || !newKpiPass.trim()) return;
    if (effectiveSaveCredentials) {
      effectiveSaveCredentials(newKpiUser.trim(), newKpiPass.trim());
    }
    setCredSavedMsg('KPI Dashboard User & Password updated!');
    setTimeout(() => {
      setCredSavedMsg('');
      setShowCredentialsModal(false);
    }, 1200);
  };

  // ============================================================================
  // DYNAMIC SYNCED CATEGORIES (5 FIXED PERMANENT CATEGORIES)
  // ============================================================================
  const isLegacy8CatList = (list: any): boolean => {
    if (!list || !Array.isArray(list)) return true;
    if (list.length !== 5) return true;
    return list.some(
      (c: any) =>
        c.id === 'plc-sensors' ||
        c.id === 'hvac-chiller-env' ||
        c.id === 'vr-arcade-av' ||
        c.id === 'electrical-vfd' ||
        c.name?.includes('PLC, Control') ||
        c.name?.includes('Electrical Power')
    );
  };

  const [localCategories, setLocalCategories] = useState<CustomTechnicalCategory[]>(() => {
    if (customCategories && Array.isArray(customCategories) && !isLegacy8CatList(customCategories)) return customCategories;
    try {
      const saved = localStorage.getItem('TFW_CUSTOM_TECH_CATEGORIES');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !isLegacy8CatList(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_CUSTOM_TECHNICAL_CATEGORIES;
  });

  const activeCategoryRawList = useMemo(() => {
    if (customCategories && Array.isArray(customCategories) && !isLegacy8CatList(customCategories)) {
      return customCategories;
    }
    return localCategories;
  }, [customCategories, localCategories]);

  const activeCategories = useMemo(
    () => hydrateTechnicalCategories(activeCategoryRawList),
    [activeCategoryRawList]
  );

  const [showCategoryManager, setShowCategoryManager] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatShortName, setNewCatShortName] = useState<string>('');
  const [newCatDescription, setNewCatDescription] = useState<string>('');
  const [newCatKeywords, setNewCatKeywords] = useState<string>('');
  const [newCatColor, setNewCatColor] = useState<
    'cyan' | 'amber' | 'blue' | 'indigo' | 'rose' | 'purple' | 'teal' | 'emerald'
  >('cyan');

  const updateCategoriesList = useCallback(
    (nextList: CustomTechnicalCategory[]) => {
      setLocalCategories(nextList);
      try {
        localStorage.setItem('TFW_CUSTOM_TECH_CATEGORIES', JSON.stringify(nextList));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('TFW_CUSTOM_TECH_CATEGORIES_UPDATED', { detail: nextList }));
        }
      } catch {
        // ignore
      }
      try {
        database.ref('config/customTechnicalCategories').set(nextList);
        database.ref('config/appConfig/customTechnicalCategories').set(nextList);
      } catch (_) {}
      if (effectiveSaveCategories) {
        effectiveSaveCategories(nextList);
      }
    },
    [effectiveSaveCategories]
  );

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newCatName.trim();
    if (!trimmedName) return;

    const shortLabel = (newCatShortName.trim() || trimmedName).slice(0, 22);
    const nextNumber = activeCategoryRawList.length + 1;
    const code = `CAT-${String(nextNumber).padStart(2, '0')}`;
    const slugId = `cat-${Date.now()}-${trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`;

    const keywordsArray = newCatKeywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);
    if (keywordsArray.length === 0) {
      keywordsArray.push(
        ...trimmedName
          .toLowerCase()
          .split(/[\s,&/-]+/)
          .filter(w => w.length > 2)
      );
    }

    const newCat: CustomTechnicalCategory = {
      id: slugId,
      name: trimmedName,
      shortName: shortLabel,
      code,
      description:
        newCatDescription.trim() ||
        `Problems solved under ${trimmedName} technical category`,
      subsystemExamples: trimmedName,
      colorTheme: newCatColor,
      iconName: 'Tag',
      keywords: keywordsArray
    };

    const updated = [...activeCategoryRawList, newCat];
    updateCategoriesList(updated);
    setLogCategoryId(newCat.id);
    setNewCatName('');
    setNewCatShortName('');
    setNewCatDescription('');
    setNewCatKeywords('');
  };

  const handleDeleteCategory = (catId: string) => {
    if (activeCategoryRawList.length <= 1) return; // keep at least 1 category
    const updated = activeCategoryRawList
      .filter(c => c.id !== catId)
      .map((c, idx) => ({
        ...c,
        code: `CAT-${String(idx + 1).padStart(2, '0')}`
      }));
    updateCategoriesList(updated);
    if (selectedCategoryFilter === catId) {
      setSelectedCategoryFilter('all');
    }
    if (logCategoryId === catId && updated[0]) {
      setLogCategoryId(updated[0].id);
    }
  };

  const handleResetDefaultCategories = () => {
    updateCategoriesList(DEFAULT_CUSTOM_TECHNICAL_CATEGORIES);
    setSelectedCategoryFilter('all');
  };

  // Flatten and deduplicate all maintenance tickets across the database
  const allTicketsFlat = useMemo(() => {
    if (!maintenanceTickets || typeof maintenanceTickets !== 'object') return [];
    const rawList: MaintenanceTicket[] = [];

    Object.entries(maintenanceTickets).forEach(([dateKey, dateTickets]) => {
      if (!dateTickets || typeof dateTickets !== 'object') return;
      if ((dateTickets as any).id || (dateTickets as any).rideId || (dateTickets as any).problem) {
        const t = dateTickets as any;
        if (t.status !== 'deleted') {
          rawList.push({
            ...t,
            id: t.id || dateKey,
            date: t.date || (dateKey.match(/^\d{4}-\d{2}-\d{2}$/) ? dateKey : todayStr)
          });
        }
      } else {
        Object.entries(dateTickets as Record<string, any>).forEach(([tKey, t]) => {
          if (!t || typeof t !== 'object' || t.status === 'deleted') return;
          rawList.push({
            ...t,
            id: t.id || tKey,
            date: t.date || (dateKey.match(/^\d{4}-\d{2}-\d{2}$/) ? dateKey : todayStr)
          });
        });
      }
    });

    // Deduplicate by canonical ticket ID preferring 'solved' status or latest timestamp
    const statusRank: Record<string, number> = { reported: 1, 'in-progress': 2, solved: 3 };
    const map = new Map<string, MaintenanceTicket>();

    rawList.forEach(t => {
      const coreId = String(t.id || '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
      const key = coreId.length > 6 ? coreId : String(t.id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, t);
      } else {
        const rNew = statusRank[t.status] || 0;
        const rOld = statusRank[existing.status] || 0;
        if (rNew > rOld) {
          map.set(key, { ...existing, ...t });
        } else if (rNew === rOld) {
          const tNew = new Date(t.solvedAt || t.reportedAt || 0).getTime();
          const tOld = new Date(existing.solvedAt || existing.reportedAt || 0).getTime();
          if (tNew >= tOld) map.set(key, { ...existing, ...t });
        }
      }
    });

    return Array.from(map.values());
  }, [maintenanceTickets, todayStr]);

  // Compute smart initial date range based on earliest/latest ticket or active operational dates
  const { minTicketDate, maxTicketDate } = useMemo(() => {
    if (allTicketsFlat.length === 0) {
      return {
        minTicketDate: getDhakaDateOffset(selectedDate || todayStr, 29),
        maxTicketDate: selectedDate || todayStr
      };
    }
    let minD = '9999-99-99';
    let maxD = '0000-00-00';
    allTicketsFlat.forEach(t => {
      const { solvedDate, reportedDate } = extractTicketDates(t, todayStr);
      const d = t.status === 'solved' ? solvedDate : reportedDate;
      if (d && d < minD) minD = d;
      if (d && d > maxD) maxD = d;
    });
    if (minD === '9999-99-99') minD = getDhakaDateOffset(todayStr, 29);
    if (maxD === '0000-00-00') maxD = todayStr;
    return { minTicketDate: minD, maxTicketDate: maxD > todayStr ? maxD : todayStr };
  }, [allTicketsFlat, selectedDate, todayStr]);

  // Date Range & Filter States
  const [startDate, setStartDate] = useState<string>(() => minTicketDate);
  const [endDate, setEndDate] = useState<string>(() => maxTicketDate);
  const [activePreset, setActivePreset] = useState<string>('all');
  const [creditMode, setCreditMode] = useState<'team' | 'primary'>('team'); // 'team' credits both Lead & Assisted, 'primary' credits only Lead
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>('all');
  const [selectedFloorFilter, setSelectedFloorFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickLogOpen, setQuickLogOpen] = useState<boolean>(false);

  // Quick Solved Log Form States (allows instant KPI logging directly on the 1-page dashboard)
  const [logDate, setLogDate] = useState<string>(selectedDate || todayStr);
  const [logRideId, setLogRideId] = useState<string>('');
  const [logCategoryId, setLogCategoryId] = useState<string>(
    () => activeCategories[0]?.id || AMUSEMENT_TECHNICAL_CATEGORIES[0].id
  );
  const [logTechId, setLogTechId] = useState<string>(
    maintenancePersonnel[0] ? String(maintenancePersonnel[0].id) : ''
  );
  const [logHelperIds, setLogHelperIds] = useState<number[]>([]);
  const [logPriority, setLogPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [logTurnaroundMins, setLogTurnaroundMins] = useState<string>('25');
  const [logProblem, setLogProblem] = useState<string>('');
  const [logResolution, setLogResolution] = useState<string>('');

  const handleApplyPreset = (preset: 'today' | '7days' | '30days' | 'thisMonth' | 'all') => {
    setActivePreset(preset);
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      setStartDate(getDhakaDateOffset(todayStr, 6));
      setEndDate(todayStr);
    } else if (preset === '30days') {
      setStartDate(getDhakaDateOffset(todayStr, 29));
      setEndDate(todayStr);
    } else if (preset === 'thisMonth') {
      setStartDate(`${todayStr.slice(0, 7)}-01`);
      setEndDate(todayStr);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Available floors from rides
  const availableFloors = useMemo(() => {
    const set = new Set<string>();
    rides.forEach(r => {
      if (r.floor) set.add(r.floor);
    });
    return Array.from(set);
  }, [rides]);

  // Enrich all tickets with their classified Technical Category & resolved dates
  const enrichedTicketsInRange = useMemo(() => {
    return allTicketsFlat
      .map(t => {
        const { solvedDate, reportedDate } = extractTicketDates(t, todayStr);
        const techCategory = classifyAmusementParkIssue(t, activeCategories);
        const rideObj = rides.find(r => r.id === t.rideId || r.name.toLowerCase() === (t.rideName || '').toLowerCase());
        const floor = t.floor || rideObj?.floor || 'Main Zone';
        const turnaroundMins = getTurnaroundMinutes(t.reportedAt, t.solvedAt);

        return {
          ...t,
          _solvedDate: solvedDate,
          _reportedDate: reportedDate,
          _effectiveDate: t.status === 'solved' ? solvedDate : reportedDate,
          _category: techCategory,
          _floor: floor,
          _turnaroundMins: turnaroundMins
        };
      })
      .filter(t => {
        // Date Range Filter
        const targetDate = t._effectiveDate;
        if (startDate && targetDate < startDate) return false;
        if (endDate && targetDate > endDate) return false;

        // Floor Filter
        if (selectedFloorFilter !== 'all' && t._floor !== selectedFloorFilter) return false;

        // Category Filter
        if (selectedCategoryFilter !== 'all' && t._category.id !== selectedCategoryFilter) return false;

        // Technician Filter
        if (selectedTechFilter !== 'all') {
          const primaryName = (t.assignedToName || '').toLowerCase().trim();
          const helpers = (t.helperNames || []).map(h => h.toLowerCase().trim());
          const targetName = selectedTechFilter.toLowerCase().trim();
          const matchedPrimary = primaryName === targetName || String(t.assignedToId) === selectedTechFilter;
          const matchedHelper =
            creditMode === 'team' &&
            (helpers.includes(targetName) || (t.helperIds || []).map(String).includes(selectedTechFilter));
          if (!matchedPrimary && !matchedHelper) return false;
        }

        // Search Query Filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const blob = [
            t.rideName,
            t._floor,
            t.problem,
            t.resolutionNotes,
            t.assignedToName,
            ...(t.helperNames || []),
            t._category.name,
            t._category.shortName
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!blob.includes(q)) return false;
        }

        return true;
      });
  }, [
    allTicketsFlat,
    todayStr,
    rides,
    activeCategories,
    startDate,
    endDate,
    selectedFloorFilter,
    selectedCategoryFilter,
    selectedTechFilter,
    creditMode,
    searchQuery
  ]);

  const solvedTicketsInRange = useMemo(
    () => enrichedTicketsInRange.filter(t => t.status === 'solved'),
    [enrichedTicketsInRange]
  );

  const activeTicketsInRange = useMemo(
    () => enrichedTicketsInRange.filter(t => t.status === 'reported' || t.status === 'in-progress'),
    [enrichedTicketsInRange]
  );

  // ============================================================================
  // 1. EXECUTIVE KPI METRICS COMPUTATION
  // ============================================================================
  const executiveKpis = useMemo(() => {
    const totalReported = enrichedTicketsInRange.length;
    const totalSolved = solvedTicketsInRange.length;
    const totalInProgress = enrichedTicketsInRange.filter(t => t.status === 'in-progress').length;
    const totalPending = enrichedTicketsInRange.filter(t => t.status === 'reported').length;

    const resolutionRate = totalReported > 0 ? Math.round((totalSolved / totalReported) * 100) : 100;

    // Mean Time To Repair (MTTR)
    let validTurnarounds = 0;
    let sumTurnaroundMins = 0;
    let withinSlaCount = 0; // SLA: <= 45 mins for standard amusement park turnaround

    solvedTicketsInRange.forEach(t => {
      if (t._turnaroundMins !== null) {
        validTurnarounds++;
        sumTurnaroundMins += t._turnaroundMins;
        if (t._turnaroundMins <= 45) withinSlaCount++;
      } else {
        // Default assumed compliance if instant log
        withinSlaCount++;
      }
    });

    const avgMttrMins = validTurnarounds > 0 ? Math.round(sumTurnaroundMins / validTurnarounds) : null;
    const slaComplianceRate = totalSolved > 0 ? Math.round((withinSlaCount / totalSolved) * 100) : 100;

    // First-Time Fix Rate (tickets not explicitly reopened)
    const firstTimeFixed = solvedTicketsInRange.filter(t => !t.isExplicitReopen).length;
    const firstTimeFixRate = totalSolved > 0 ? Math.round((firstTimeFixed / totalSolved) * 100) : 100;

    // Photo Proof Verification Rate
    const photoVerifiedCount = solvedTicketsInRange.filter(t => Boolean(t.solutionImageUrl || t.photoUrl)).length;
    const photoVerifiedRate = totalSolved > 0 ? Math.round((photoVerifiedCount / totalSolved) * 100) : 0;

    // Fleet Availability %
    const totalRidesCount = Math.max(1, rides.length);
    const currentlyDownRideIds = new Set(
      allTicketsFlat
        .filter(t => t.status === 'reported' || t.status === 'in-progress')
        .map(t => t.rideId)
    );
    const operationalRidesCount = Math.max(0, totalRidesCount - currentlyDownRideIds.size);
    const fleetAvailability = ((operationalRidesCount / totalRidesCount) * 100).toFixed(1);

    // Urgent / High Priority Resolved
    const criticalSolvedCount = solvedTicketsInRange.filter(
      t => t.priority === 'urgent' || t.priority === 'high'
    ).length;

    return {
      totalReported,
      totalSolved,
      totalInProgress,
      totalPending,
      resolutionRate,
      avgMttrMins,
      slaComplianceRate,
      firstTimeFixRate,
      photoVerifiedCount,
      photoVerifiedRate,
      totalRidesCount,
      operationalRidesCount,
      fleetAvailability,
      criticalSolvedCount
    };
  }, [enrichedTicketsInRange, solvedTicketsInRange, rides, allTicketsFlat]);

  // ============================================================================
  // 2. CATEGORY-WISE BREAKDOWN
  // ============================================================================
  const categoryBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        category: TechnicalCategoryDef;
        solvedCount: number;
        activeCount: number;
        urgentCount: number;
        totalMins: number;
        validMinsCount: number;
        ridesAffected: Set<string>;
      }
    >();

    activeCategories.forEach(cat => {
      map.set(cat.id, {
        category: cat,
        solvedCount: 0,
        activeCount: 0,
        urgentCount: 0,
        totalMins: 0,
        validMinsCount: 0,
        ridesAffected: new Set()
      });
    });

    enrichedTicketsInRange.forEach(t => {
      const entry = map.get(t._category.id);
      if (!entry) return;
      if (t.status === 'solved') {
        entry.solvedCount++;
        if (t._turnaroundMins !== null) {
          entry.totalMins += t._turnaroundMins;
          entry.validMinsCount++;
        }
      } else {
        entry.activeCount++;
      }
      if (t.priority === 'urgent' || t.priority === 'high') {
        entry.urgentCount++;
      }
      if (t.rideName) entry.ridesAffected.add(t.rideName);
    });

    const totalSolvedAllCats = Math.max(1, solvedTicketsInRange.length);

    return Array.from(map.values()).map(item => ({
      ...item,
      sharePercent: solvedTicketsInRange.length > 0 ? Math.round((item.solvedCount / totalSolvedAllCats) * 100) : 0,
      avgMttrMins: item.validMinsCount > 0 ? Math.round(item.totalMins / item.validMinsCount) : null,
      uniqueRidesCount: item.ridesAffected.size
    }));
  }, [enrichedTicketsInRange, solvedTicketsInRange, activeCategories]);

  // ============================================================================
  // 3. TECHNICIAN NAME-WISE x CATEGORY-WISE MATRIX
  // ============================================================================
  const technicianMatrix = useMemo(() => {
    interface TechRow {
      id: string | number;
      name: string;
      designation: string;
      primarySolved: number;
      assistedSolved: number;
      totalSolved: number;
      activeAssigned: number;
      urgentSolved: number;
      photoProofCount: number;
      totalTurnaroundMins: number;
      validTurnaroundCount: number;
      byCategory: Record<string, number>;
      solvedTickets: typeof solvedTicketsInRange;
    }

    const techMap = new Map<string, TechRow>();

    const isOpOfficer = (str?: string) => {
      const s = String(str || '').toLowerCase().trim();
      return s === 'operation officer' || s.includes('operation officer') || s === 'operation-officer';
    };

    // Seed all official maintenance personnel first so every technician appears cleanly
    maintenancePersonnel
      .filter(p => p.active !== false && !isOpOfficer(p.name) && !isOpOfficer(p.role))
      .forEach(p => {
        const key = p.name.toLowerCase().trim();
        const catCounts: Record<string, number> = {};
        activeCategories.forEach(c => {
          catCounts[c.id] = 0;
        });
        techMap.set(key, {
          id: p.id,
          name: p.name,
          designation: p.role || 'Technician',
          primarySolved: 0,
          assistedSolved: 0,
          totalSolved: 0,
          activeAssigned: 0,
          urgentSolved: 0,
          photoProofCount: 0,
          totalTurnaroundMins: 0,
          validTurnaroundCount: 0,
          byCategory: catCounts,
          solvedTickets: []
        });
      });

    const getOrCreateTech = (rawName: string, rawId?: number | string): TechRow | null => {
      const cleanName = (rawName || 'Unassigned / General Tech').trim();
      if (isOpOfficer(cleanName)) return null;
      const key = cleanName.toLowerCase();
      if (techMap.has(key)) return techMap.get(key)!;

      // Try fuzzy match by ID
      if (rawId !== undefined) {
        const byId = maintenancePersonnel.find(p => String(p.id) === String(rawId));
        if (byId && techMap.has(byId.name.toLowerCase().trim())) {
          return techMap.get(byId.name.toLowerCase().trim())!;
        }
      }

      const catCounts: Record<string, number> = {};
      activeCategories.forEach(c => {
        catCounts[c.id] = 0;
      });
      const newRow: TechRow = {
        id: rawId || cleanName,
        name: cleanName,
        designation: 'Maintenance Specialist',
        primarySolved: 0,
        assistedSolved: 0,
        totalSolved: 0,
        activeAssigned: 0,
        urgentSolved: 0,
        photoProofCount: 0,
        totalTurnaroundMins: 0,
        validTurnaroundCount: 0,
        byCategory: catCounts,
        solvedTickets: []
      };
      techMap.set(key, newRow);
      return newRow;
    };

    // Process all tickets in date range
    enrichedTicketsInRange.forEach(t => {
      const catId = t._category.id;
      const primaryName = t.assignedToName?.trim();
      const helperNames = Array.isArray(t.helperNames) ? t.helperNames : [];

      if (t.status === 'solved') {
        // Credit Primary Technician
        if (primaryName && !isOpOfficer(primaryName)) {
          const row = getOrCreateTech(primaryName, t.assignedToId);
          if (row) {
            row.primarySolved++;
            row.totalSolved++;
            row.byCategory[catId] = (row.byCategory[catId] || 0) + 1;
            row.solvedTickets.push(t);
            if (t.priority === 'urgent' || t.priority === 'high') row.urgentSolved++;
            if (t.solutionImageUrl || t.photoUrl) row.photoProofCount++;
            if (t._turnaroundMins !== null) {
              row.totalTurnaroundMins += t._turnaroundMins;
              row.validTurnaroundCount++;
            }
          }
        } else if (helperNames.length === 0) {
          // Solved ticket with no technician name specified
          const row = getOrCreateTech('General Maintenance Team');
          if (row) {
            row.primarySolved++;
            row.totalSolved++;
            row.byCategory[catId] = (row.byCategory[catId] || 0) + 1;
            row.solvedTickets.push(t);
          }
        }

        // Credit Helper Technicians when in 'team' mode
        if (creditMode === 'team' && helperNames.length > 0) {
          const seenInTicket = new Set<string>();
          if (primaryName) seenInTicket.add(primaryName.toLowerCase());

          helperNames.forEach((hName, idx) => {
            const cleanH = (hName || '').trim();
            if (!cleanH || isOpOfficer(cleanH) || seenInTicket.has(cleanH.toLowerCase())) return;
            seenInTicket.add(cleanH.toLowerCase());

            const hId = t.helperIds?.[idx];
            const row = getOrCreateTech(cleanH, hId);
            if (row) {
              row.assistedSolved++;
              row.totalSolved++;
              row.byCategory[catId] = (row.byCategory[catId] || 0) + 1;
              row.solvedTickets.push(t);
              if (t.priority === 'urgent' || t.priority === 'high') row.urgentSolved++;
              if (t.solutionImageUrl || t.photoUrl) row.photoProofCount++;
              if (t._turnaroundMins !== null) {
                row.totalTurnaroundMins += t._turnaroundMins;
                row.validTurnaroundCount++;
              }
            }
          });
        }
      } else if (t.status === 'in-progress') {
        if (primaryName && !isOpOfficer(primaryName)) {
          const row = getOrCreateTech(primaryName, t.assignedToId);
          if (row) {
            row.activeAssigned++;
          }
        }
        if (creditMode === 'team' && helperNames.length > 0) {
          helperNames.forEach((hName, idx) => {
            if (!hName || isOpOfficer(hName)) return;
            const row = getOrCreateTech(hName, t.helperIds?.[idx]);
            if (row) {
              row.activeAssigned++;
            }
          });
        }
      }
    });

    // Compute Dominant Specialty & Efficiency Score for each technician
    return Array.from(techMap.values())
      .filter(row => !isOpOfficer(row.name))
      .map(row => {
        let topCat: TechnicalCategoryDef | null = null;
        let topCatCount = 0;
        activeCategories.forEach(cat => {
          const cnt = row.byCategory[cat.id] || 0;
          if (cnt > topCatCount) {
            topCatCount = cnt;
            topCat = cat;
          }
        });

        const avgMttr =
          row.validTurnaroundCount > 0 ? Math.round(row.totalTurnaroundMins / row.validTurnaroundCount) : null;

        return {
          ...row,
          topCategory: topCat as TechnicalCategoryDef | null,
          topCategoryCount: topCatCount,
          avgMttr
        };
      })
      .sort((a, b) => {
        if (b.totalSolved !== a.totalSolved) return b.totalSolved - a.totalSolved;
        if (b.primarySolved !== a.primarySolved) return b.primarySolved - a.primarySolved;
        if (b.activeAssigned !== a.activeAssigned) return b.activeAssigned - a.activeAssigned;
        return a.name.localeCompare(b.name);
      });
  }, [maintenancePersonnel, enrichedTicketsInRange, creditMode, activeCategories]);

  // ============================================================================
  // 4. TOP HIGH-MAINTENANCE RIDES & FLOOR HOTSPOTS
  // ============================================================================
  const rideHotspots = useMemo(() => {
    const map = new Map<
      string,
      {
        rideId: number | string;
        rideName: string;
        floor: string;
        solvedCount: number;
        activeCount: number;
        urgentCount: number;
        topCategoryMap: Record<string, number>;
        lastSolvedDate: string;
      }
    >();

    enrichedTicketsInRange.forEach(t => {
      const key = String(t.rideId || t.rideName || 'unknown');
      if (!map.has(key)) {
        map.set(key, {
          rideId: t.rideId,
          rideName: t.rideName || 'Attraction',
          floor: t._floor,
          solvedCount: 0,
          activeCount: 0,
          urgentCount: 0,
          topCategoryMap: {},
          lastSolvedDate: ''
        });
      }
      const item = map.get(key)!;
      if (t.status === 'solved') {
        item.solvedCount++;
        if (!item.lastSolvedDate || t._solvedDate > item.lastSolvedDate) {
          item.lastSolvedDate = t._solvedDate;
        }
      } else {
        item.activeCount++;
      }
      if (t.priority === 'urgent' || t.priority === 'high') item.urgentCount++;
      item.topCategoryMap[t._category.id] = (item.topCategoryMap[t._category.id] || 0) + 1;
    });

    return Array.from(map.values())
      .map(r => {
        let dominantCat = activeCategories[0] || AMUSEMENT_TECHNICAL_CATEGORIES[0];
        let maxC = 0;
        activeCategories.forEach(c => {
          const cnt = r.topCategoryMap[c.id] || 0;
          if (cnt > maxC) {
            maxC = cnt;
            dominantCat = c;
          }
        });
        return {
          ...r,
          totalIssues: r.solvedCount + r.activeCount,
          dominantCategory: dominantCat
        };
      })
      .sort((a, b) => b.solvedCount - a.solvedCount || b.totalIssues - a.totalIssues)
      .slice(0, 8);
  }, [enrichedTicketsInRange, activeCategories]);

  // ============================================================================
  // 5. QUICK SOLVED RECORD LOGGER (Directly on KPI Dashboard)
  // ============================================================================
  const handleQuickLogSolvedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logRideId || !logProblem.trim() || !onUploadSolvedTickets) return;

    const rideObj = rides.find(r => String(r.id) === String(logRideId));
    const catObj =
      activeCategories.find(c => c.id === logCategoryId) || activeCategories[0] || AMUSEMENT_TECHNICAL_CATEGORIES[0];
    const leadTech = maintenancePersonnel.find(p => String(p.id) === String(logTechId));
    const helperObjs = logHelperIds
      .map(id => maintenancePersonnel.find(p => p.id === id))
      .filter((p): p is Operator => Boolean(p));

    const mins = Math.max(1, parseInt(logTurnaroundMins, 10) || 20);
    const solvedIso = new Date(`${logDate}T14:30:00+06:00`).toISOString();
    const reportedIso = new Date(new Date(solvedIso).getTime() - mins * 60 * 1000).toISOString();

    const newSolvedTicket: MaintenanceTicket = {
      id: `${logDate}-kpi-${Date.now()}`,
      date: logDate,
      rideId: rideObj ? rideObj.id : Number(logRideId),
      rideName: rideObj ? rideObj.name : 'Attraction',
      floor: rideObj?.floor,
      problem: logProblem.trim(),
      feedbackCategory: catObj.name,
      priority: logPriority,
      status: 'solved',
      reportedById: 0,
      reportedByName: 'Technical Inspection',
      reportedByRole: 'Maintenance KPI Log',
      source: 'operator',
      reportedAt: reportedIso,
      inProgressAt: reportedIso,
      solvedAt: solvedIso,
      assignedToId: leadTech?.id,
      assignedToName: leadTech?.name || 'Maintenance Engineer',
      helperIds: helperObjs.map(h => h.id),
      helperNames: helperObjs.map(h => h.name),
      resolutionNotes: logResolution.trim() || `Diagnosed and resolved under ${catObj.shortName} protocol.`
    };

    onUploadSolvedTickets([newSolvedTicket]);
    setLogProblem('');
    setLogResolution('');
    setLogHelperIds([]);
    setQuickLogOpen(false);
  };

  // ============================================================================
  // 6. EXPORT TECHNICIAN x CATEGORY MATRIX CSV
  // ============================================================================
  const handleExportMatrixCSV = useCallback(() => {
    const catHeaders = activeCategories.map(c => c.shortName);
    const headers = [
      'Rank',
      'Technician Name',
      'Designation',
      'Total Problems Solved',
      'Lead / Primary Solved',
      'Assisted / Team Solved',
      'Active In-Progress',
      'Urgent / High Solved',
      'Avg Turnaround (MTTR)',
      'Dominant Technical Specialty',
      ...catHeaders
    ];

    const rows = technicianMatrix.map((t, idx) => [
      idx + 1,
      t.name,
      t.designation,
      t.totalSolved,
      t.primarySolved,
      t.assistedSolved,
      t.activeAssigned,
      t.urgentSolved,
      formatDurationMinutes(t.avgMttr),
      t.topCategory ? t.topCategory.shortName : '—',
      ...activeCategories.map(c => t.byCategory[c.id] || 0)
    ]);

    // Add totals row
    const totalRow = [
      '',
      'TOTAL (ALL TECHNICIANS)',
      '',
      technicianMatrix.reduce((s, r) => s + r.totalSolved, 0),
      technicianMatrix.reduce((s, r) => s + r.primarySolved, 0),
      technicianMatrix.reduce((s, r) => s + r.assistedSolved, 0),
      technicianMatrix.reduce((s, r) => s + r.activeAssigned, 0),
      technicianMatrix.reduce((s, r) => s + r.urgentSolved, 0),
      formatDurationMinutes(executiveKpis.avgMttrMins),
      '',
      ...activeCategories.map(c =>
        technicianMatrix.reduce((s, r) => s + (r.byCategory[c.id] || 0), 0)
      )
    ];

    const csvContent =
      '\uFEFF' +
      [headers, ...rows, totalRow]
        .map(row => row.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TFW_Maintenance_KPI_Matrix_${startDate || 'All'}_to_${endDate || todayStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [technicianMatrix, executiveKpis.avgMttrMins, startDate, endDate, todayStr, activeCategories]);

  // ============================================================================
  // RENDER KPI DASHBOARD USER & PASSWORD GATE WHEN LOCKED
  // ============================================================================
  if (!isUnlocked) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12 animate-fade-in-up">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center gap-3.5 pb-5 border-b border-gray-800">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
                Maintenance KPI Dashboard Login
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Protected Engineering KPI &amp; Category Problem Solved Matrix
              </p>
            </div>
          </div>

          <form onSubmit={handleKpiLoginSubmit} className="mt-6 space-y-4">
            {authError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700/60 text-xs text-rose-200 font-medium">
                {authError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                KPI Dashboard User ID / Username
              </label>
              <input
                type="text"
                required
                autoFocus
                value={inputUsername}
                onChange={e => setInputUsername(e.target.value)}
                placeholder="Enter KPI Username (e.g. kpi)"
                className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                KPI Dashboard Password
              </label>
              <PasswordInput
                required
                value={inputPassword}
                onChange={e => setInputPassword(e.target.value)}
                placeholder="Enter KPI Password"
                className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500"
              />
            </div>

            <div className="pt-2 flex items-center gap-2.5">
              <button
                type="submit"
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-gray-950 font-black py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-lg"
              >
                Access Maintenance KPI Dashboard
              </button>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('maintenance-dashboard')}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2.5 px-4 rounded-xl text-xs border border-gray-700 cursor-pointer"
                >
                  Back
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-[1440px] mx-auto animate-fade-in-up">
      {/* ===================================================================== */}
      {/* TOP COMMAND HEADER & DATE RANGE FILTER BAR                            */}
      {/* ===================================================================== */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-gray-800">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Maintenance Engineering KPI &amp; Technical Matrix
                </h1>
                <span className="text-xs font-mono text-amber-300">
                  · {activeCategories.length} Problem Solved Categories · {maintenancePersonnel.length} Engineers &amp; Technicians
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                Date-range technical problem-solving telemetry, name-wise technician output &amp; synced category problem solved diagnostics
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCategoryManager(prev => !prev)}
              className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-gray-950 font-bold px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
            >
              <Tag className="w-4 h-4 stroke-[2.5]" />
              <span>Add / Delete Category ({activeCategories.length})</span>
            </button>

            {onUploadSolvedTickets && (
              <button
                type="button"
                onClick={() => setQuickLogOpen(prev => !prev)}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-gray-950 font-bold px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Log Solved Technical Record</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportMatrixCSV}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
              title="Download Name-wise & Category-wise KPI Matrix as CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export KPI Matrix CSV</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNewKpiUser(kpiUsername || 'kpi');
                setNewKpiPass(kpiPassword || 'kpi123');
                setShowCredentialsModal(prev => !prev);
              }}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-750 text-amber-300 hover:text-amber-200 font-semibold px-3 py-2 rounded-xl text-xs border border-gray-700 transition-all cursor-pointer"
              title="Configure Maintenance KPI Dashboard User ID & Password"
            >
              <Settings2 className="w-4 h-4" />
              <span>KPI User &amp; Password</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-750 text-gray-200 hover:text-white font-semibold px-3 py-2 rounded-xl text-xs border border-gray-700 transition-all cursor-pointer"
              title="Print One-Page Executive KPI Report"
            >
              <Printer className="w-4 h-4 text-gray-400" />
              <span className="hidden sm:inline">Print KPI</span>
            </button>

            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('maintenance-dashboard')}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-750 text-blue-300 hover:text-blue-200 font-semibold px-3 py-2 rounded-xl text-xs border border-gray-700 transition-all cursor-pointer"
              >
                <span>Live Repair Queue</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {!effectivePreAuth && (
              <button
                type="button"
                onClick={handleLockDashboard}
                className="flex items-center gap-1 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 font-semibold px-2.5 py-2 rounded-xl text-xs border border-rose-800/50 cursor-pointer"
                title="Lock KPI Dashboard"
              >
                <span>Lock</span>
              </button>
            )}
          </div>
        </div>

        {/* KPI User & Password Configuration Drawer */}
        {showCredentialsModal && (
          <form
            onSubmit={handleSaveKpiCredentials}
            className="mt-4 p-4 bg-gray-950 border border-amber-500/40 rounded-xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <div className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <Settings2 className="w-3.5 h-3.5" />
                <span>Maintenance KPI Dashboard User &amp; Password Settings</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCredentialsModal(false)}
                className="text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                Close ✕
              </button>
            </div>

            {credSavedMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700/60 text-xs text-emerald-300 font-semibold">
                {credSavedMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                  KPI Dashboard Username
                </label>
                <input
                  type="text"
                  required
                  value={newKpiUser}
                  onChange={e => setNewKpiUser(e.target.value)}
                  placeholder="e.g. kpi"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                  KPI Dashboard Password
                </label>
                <input
                  type="text"
                  required
                  value={newKpiPass}
                  onChange={e => setNewKpiPass(e.target.value)}
                  placeholder="e.g. kpi123"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-4 py-1.5 rounded-lg text-xs cursor-pointer"
                >
                  Save KPI User &amp; Password
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Manage Category Problem Solved (Add / Delete) Drawer */}
        {showCategoryManager && (
          <div className="mt-4 p-4 bg-gray-950 border border-cyan-500/40 rounded-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2.5">
              <div className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" />
                <span>
                  Manage Problem Solved Categories (Add / Delete — Auto-Synced with Problem Solved &amp; Matrix)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetDefaultCategories}
                  className="text-[11px] text-gray-400 hover:text-amber-300 underline cursor-pointer"
                >
                  Restore Default 8 Categories
                </button>
                <button
                  type="button"
                  onClick={() => setShowCategoryManager(false)}
                  className="text-xs text-gray-400 hover:text-white cursor-pointer"
                >
                  Close ✕
                </button>
              </div>
            </div>

            {/* Add New Category Form */}
            <form onSubmit={handleAddCategory} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                  New Category Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="e.g. Hydraulic & Pneumatic Braking"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                  Matrix Short Label
                </label>
                <input
                  type="text"
                  value={newCatShortName}
                  onChange={e => setNewCatShortName(e.target.value)}
                  placeholder="e.g. Hydraulic Brake"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                  Auto-Match Keywords (comma separated)
                </label>
                <input
                  type="text"
                  value={newCatKeywords}
                  onChange={e => setNewCatKeywords(e.target.value)}
                  placeholder="e.g. brake, valve, cylinder, pressure"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">Color Theme</label>
                <select
                  value={newCatColor}
                  onChange={e => setNewCatColor(e.target.value as any)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                >
                  <option value="cyan">Cyan</option>
                  <option value="amber">Amber</option>
                  <option value="blue">Blue</option>
                  <option value="emerald">Emerald</option>
                  <option value="purple">Purple</option>
                  <option value="rose">Rose</option>
                  <option value="indigo">Indigo</option>
                  <option value="teal">Teal</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-gray-950 font-black px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Add Category</span>
                </button>
              </div>
            </form>

            {/* Current Active Categories List with Delete Option */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2">
              {activeCategories.map(cat => (
                <div
                  key={cat.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${cat.accentBg} ${cat.accentBorder}`}
                >
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-gray-400">{cat.code}</div>
                    <div className={`text-xs font-bold truncate ${cat.accentText}`} title={cat.name}>
                      {cat.name}
                    </div>
                  </div>
                  {activeCategories.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-600 text-rose-300 hover:text-white transition-colors cursor-pointer flex-shrink-0"
                      title={`Delete Category: ${cat.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Log Solved Technical Record Drawer */}
        {quickLogOpen && onUploadSolvedTickets && (
          <form
            onSubmit={handleQuickLogSolvedSubmit}
            className="mt-4 p-4 bg-gray-950 border border-amber-500/30 rounded-xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <div className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5" />
                <span>Log Resolved Amusement Park Technical Issue (Instant KPI Update)</span>
              </div>
              <button
                type="button"
                onClick={() => setQuickLogOpen(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Close ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">Solved Date</label>
                <input
                  type="date"
                  required
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">Ride / Attraction</label>
                <select
                  required
                  value={logRideId}
                  onChange={e => setLogRideId(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                >
                  <option value="">-- Select Ride / Game --</option>
                  {rides.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.floor || 'Floor'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                  Problem Solved Category (Synced)
                </label>
                <select
                  value={logCategoryId}
                  onChange={e => setLogCategoryId(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                >
                  {activeCategories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.code}: {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">Repair Time (Mins)</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={logTurnaroundMins}
                  onChange={e => setLogTurnaroundMins(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                  Lead Engineer / Technician
                </label>
                <select
                  value={logTechId}
                  onChange={e => setLogTechId(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                >
                  {maintenancePersonnel
                    .filter(p => !p.name.toLowerCase().includes('operation officer') && !String(p.role || '').toLowerCase().includes('operation officer'))
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role || 'Tech'})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                  Fault / Problem Solved Description
                </label>
                <input
                  type="text"
                  required
                  value={logProblem}
                  onChange={e => setLogProblem(e.target.value)}
                  placeholder="e.g. Proximity sensor S2 misaligned on station brake"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                  Technical Action / Root Cause Fix
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={logResolution}
                    onChange={e => setLogResolution(e.target.value)}
                    placeholder="e.g. Recalibrated 4mm gap & verified PLC input I0.4"
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1.5 rounded-lg text-xs cursor-pointer whitespace-nowrap"
                  >
                    Save Record
                  </button>
                </div>
              </div>
            </div>

            {/* Optional Assisted Technicians Multi-select */}
            <div className="pt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-400 mr-1">Assisted By (Optional):</span>
              {maintenancePersonnel
                .filter(p => String(p.id) !== String(logTechId))
                .map(p => {
                  const selected = logHelperIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setLogHelperIds(prev =>
                          prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                        )
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        selected
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                          : 'bg-gray-900 text-gray-400 border border-gray-800 hover:text-gray-200'
                      }`}
                    >
                      {selected ? '✓ ' : '+ '}
                      {p.name}
                    </button>
                  );
                })}
            </div>
          </form>
        )}

        {/* Date Range & Multi-Dimensional Controls Row */}
        <div className="mt-4 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
          {/* Date Pickers + Quick Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-gray-950 border border-gray-800 px-3 py-1.5 rounded-xl">
              <CalendarRange className="w-4 h-4 text-amber-400" />
              <span className="text-[11px] font-semibold text-gray-400 uppercase">From</span>
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setActivePreset('custom');
                }}
                className="bg-transparent text-white text-xs font-mono font-bold outline-none cursor-pointer"
              />
              <span className="text-gray-600 px-1">→</span>
              <span className="text-[11px] font-semibold text-gray-400 uppercase">To</span>
              <input
                type="date"
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setActivePreset('custom');
                }}
                className="bg-transparent text-white text-xs font-mono font-bold outline-none cursor-pointer"
              />
            </div>

            {/* Segmented Date Range Presets */}
            <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800">
              {[
                { id: 'today', label: 'Today' },
                { id: '7days', label: 'Last 7D' },
                { id: '30days', label: 'Last 30D' },
                { id: 'thisMonth', label: 'This Month' },
                { id: 'all', label: 'All Dates' }
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleApplyPreset(p.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activePreset === p.id
                      ? 'bg-amber-500 text-gray-950 font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right Filters: Credit Mode, Floor, Technician, Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Credit Attribution Toggle */}
            <div
              className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800"
              title="Choose whether solved count includes both Lead + Assisted repairs or strictly Lead Technician repairs"
            >
              <button
                type="button"
                onClick={() => setCreditMode('team')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  creditMode === 'team' ? 'bg-gray-800 text-amber-300 font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Lead + Assisted Credit
              </button>
              <button
                type="button"
                onClick={() => setCreditMode('primary')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  creditMode === 'primary' ? 'bg-gray-800 text-amber-300 font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Lead Only
              </button>
            </div>

            {/* Floor Filter */}
            <select
              value={selectedFloorFilter}
              onChange={e => setSelectedFloorFilter(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">All Park Levels ({availableFloors.length})</option>
              {availableFloors.map(f => (
                <option key={f} value={f}>
                  Floor: {f}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter tech, ride, fault..."
                className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {(selectedCategoryFilter !== 'all' ||
              selectedTechFilter !== 'all' ||
              selectedFloorFilter !== 'all' ||
              searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryFilter('all');
                  setSelectedTechFilter('all');
                  setSelectedFloorFilter('all');
                  setSearchQuery('');
                }}
                className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1.5 rounded-xl bg-rose-950/30 border border-rose-800/40 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 1: 6 CORE AMUSEMENT ENGINEERING KPI SCORECARDS                */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* KPI 1: Total Problems Solved */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">Problems Solved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums">
              {executiveKpis.totalSolved}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              of {executiveKpis.totalReported} total logged ·{' '}
              <span className="text-emerald-400 font-semibold">{executiveKpis.resolutionRate}% resolved</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Mean Time To Repair (MTTR) */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">Avg Repair (MTTR)</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums">
              {formatDurationMinutes(executiveKpis.avgMttrMins)}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Target &le; 45m ·{' '}
              <span className="text-cyan-300 font-semibold">{executiveKpis.slaComplianceRate}% within SLA</span>
            </div>
          </div>
        </div>

        {/* KPI 3: First-Time Fix Rate */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">First-Time Fix</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums">
              {executiveKpis.firstTimeFixRate}%
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Zero repeat fault reopen ·{' '}
              <span className="text-amber-300 font-semibold">{executiveKpis.criticalSolvedCount} urgent fixed</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Park Fleet Availability */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">Fleet Availability</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums">
              {executiveKpis.fleetAvailability}%
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              <span className="text-blue-300 font-semibold">
                {executiveKpis.operationalRidesCount}/{executiveKpis.totalRidesCount}
              </span>{' '}
              attractions operational
            </div>
          </div>
        </div>

        {/* KPI 5: Active Queue (Pending & In-Progress) */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">Active Queue</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums">
              {executiveKpis.totalInProgress + executiveKpis.totalPending}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              <span className="text-amber-300 font-semibold">{executiveKpis.totalInProgress} in repair</span> ·{' '}
              <span className="text-rose-300 font-semibold">{executiveKpis.totalPending} reported</span>
            </div>
          </div>
        </div>

        {/* KPI 6: Photo Proof & Audit Verification */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">Visual Proof</span>
            <Camera className="w-4 h-4 text-purple-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums">
              {executiveKpis.photoVerifiedCount}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              {executiveKpis.photoVerifiedRate}% photo verified ·{' '}
              <span className="text-purple-300 font-semibold">{technicianMatrix.length} techs tracked</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 2: SYNCED TECHNICAL CATEGORIES (ADD / DELETE SUPPORTED)       */}
      {/* ===================================================================== */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-gray-800">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              01. Category-Wise Amusement Park Problem Solved Breakdown ({activeCategories.length} Categories)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Click any category to filter the Technician Matrix &amp; Solved Logs, or use Add / Delete Category to customize &amp; sync with Problem Solved
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCategoryFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('all')}
                className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline cursor-pointer"
              >
                Show All {activeCategories.length} Categories
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCategoryManager(prev => !prev)}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-750 text-cyan-300 font-bold px-3 py-1.5 rounded-xl text-xs border border-cyan-500/30 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showCategoryManager ? 'Hide Category Manager' : 'Add / Delete Category'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4">
          {categoryBreakdown.map(item => {
            const { category, solvedCount, activeCount, sharePercent, avgMttrMins, uniqueRidesCount } = item;
            const IconComponent = category.icon;
            const isSelected = selectedCategoryFilter === category.id;

            return (
              <div
                key={category.id}
                onClick={() => setSelectedCategoryFilter(prev => (prev === category.id ? 'all' : category.id))}
                className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative group ${
                  isSelected
                    ? `${category.accentBg} ${category.accentBorder} ring-2 ring-amber-400/60`
                    : 'bg-gray-950/80 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className={`p-2 rounded-lg ${category.accentBg} border ${category.accentBorder}`}>
                      <IconComponent className={`w-4 h-4 ${category.accentText}`} />
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="text-right font-mono">
                        <span className="text-2xl font-black text-white tabular-nums">{solvedCount}</span>
                        <span className="block text-[10px] text-gray-400 uppercase">Solved ({sharePercent}%)</span>
                      </div>
                      {activeCategories.length > 1 && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteCategory(category.id);
                          }}
                          className="p-1.5 rounded-lg bg-gray-900/80 hover:bg-rose-600 text-gray-500 hover:text-white border border-gray-800 transition-colors cursor-pointer"
                          title={`Delete Category: ${category.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-mono text-gray-500">
                      {category.code} · {uniqueRidesCount} {uniqueRidesCount === 1 ? 'Ride' : 'Rides'}
                    </div>
                    <h3 className={`text-sm font-bold mt-0.5 ${isSelected ? 'text-white' : 'text-gray-100'}`}>
                      {category.name}
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                      {category.description}
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 pt-2.5 border-t border-gray-800/80">
                  {/* Progress Bar */}
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full ${category.barColor} transition-all duration-300`}
                      style={{ width: `${Math.max(solvedCount > 0 ? 6 : 0, sharePercent)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
                    <span>MTTR: {formatDurationMinutes(avgMttrMins)}</span>
                    <span>
                      {activeCount > 0 ? (
                        <strong className="text-amber-300">{activeCount} Active</strong>
                      ) : (
                        <span className="text-emerald-400">0 Pending</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 3: NAME-WISE x CATEGORY-WISE PROBLEM SOLVED MATRIX TABLE      */}
      {/* ===================================================================== */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-gray-800">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              02. Technician Name-Wise &amp; Technical Category-Wise Problem Solved Matrix
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Individual engineering output across all {activeCategories.length} synced categories for the selected date range (
              {startDate || 'Start'} to {endDate || 'Present'})
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Click any technician row to filter their specific solved repairs</span>
            {selectedTechFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedTechFilter('all')}
                className="text-amber-300 hover:text-amber-200 font-semibold underline cursor-pointer ml-2"
              >
                Clear Technician Filter ({selectedTechFilter})
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1050px]">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] font-bold uppercase tracking-wider text-gray-400 bg-gray-950/60">
                <th className="py-3 px-3 w-10">#</th>
                <th className="py-3 px-3 min-w-[200px]">Engineer / Technician Name</th>
                <th className="py-3 px-2.5 text-right font-mono text-emerald-300">Total Solved</th>
                <th className="py-3 px-2.5 text-right font-mono">Lead / Assist</th>
                <th className="py-3 px-2.5 text-right font-mono">Avg MTTR</th>
                {activeCategories.map(cat => (
                  <th
                    key={cat.id}
                    onClick={() => setSelectedCategoryFilter(prev => (prev === cat.id ? 'all' : cat.id))}
                    className={`py-3 px-2 text-center cursor-pointer transition-colors hover:text-white ${
                      selectedCategoryFilter === cat.id ? 'bg-amber-500/10 text-amber-300' : ''
                    }`}
                    title={`${cat.name}: ${cat.description}`}
                  >
                    <div className="font-mono text-[10px] text-gray-500">{cat.code}</div>
                    <div className={`truncate max-w-[95px] mx-auto ${cat.accentText}`}>{cat.shortName}</div>
                  </th>
                ))}
                <th className="py-3 px-3 text-left">Primary Specialty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70 text-xs">
              {technicianMatrix.map((tech, idx) => {
                const isTechSelected =
                  selectedTechFilter.toLowerCase() === tech.name.toLowerCase() ||
                  String(selectedTechFilter) === String(tech.id);

                return (
                  <tr
                    key={tech.id}
                    onClick={() =>
                      setSelectedTechFilter(prev =>
                        prev.toLowerCase() === tech.name.toLowerCase() ? 'all' : tech.name
                      )
                    }
                    className={`transition-colors cursor-pointer ${
                      isTechSelected
                        ? 'bg-amber-950/30 hover:bg-amber-950/40'
                        : 'hover:bg-gray-800/50'
                    }`}
                  >
                    <td className="py-3 px-3 font-mono text-gray-500 tabular-nums">
                      {String(idx + 1).padStart(2, '0')}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span>{tech.name}</span>
                        {idx === 0 && tech.totalSolved > 0 && (
                          <span title="Top Problem Solver" className="inline-flex">
                            <Award className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {tech.designation}
                        {tech.activeAssigned > 0 && (
                          <span className="text-amber-300 font-mono"> · {tech.activeAssigned} in-progress</span>
                        )}
                        {tech.urgentSolved > 0 && (
                          <span className="text-rose-300 font-mono"> · {tech.urgentSolved} urgent</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                      <span
                        className={`text-base font-black ${
                          tech.totalSolved > 0 ? 'text-emerald-400' : 'text-gray-500'
                        }`}
                      >
                        {tech.totalSolved}
                      </span>
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-gray-300">
                      <span title="Primary Lead Solved">{tech.primarySolved}L</span>
                      <span className="text-gray-600 mx-1">/</span>
                      <span className="text-gray-400" title="Assisted Team Solved">
                        {tech.assistedSolved}A
                      </span>
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-cyan-300">
                      {formatDurationMinutes(tech.avgMttr)}
                    </td>

                    {/* Synced Category Columns */}
                    {activeCategories.map(cat => {
                      const count = tech.byCategory[cat.id] || 0;
                      return (
                        <td
                          key={cat.id}
                          className={`py-3 px-2 text-center font-mono tabular-nums ${
                            selectedCategoryFilter === cat.id ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          {count > 0 ? (
                            <span className={`font-bold ${cat.accentText}`}>{count}</span>
                          ) : (
                            <span className="text-gray-700">·</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="py-3 px-3">
                      {tech.topCategory ? (
                        <div className="text-xs">
                          <span className={`font-semibold ${tech.topCategory.accentText}`}>
                            {tech.topCategory.shortName}
                          </span>
                          <span className="text-gray-500 font-mono ml-1">({tech.topCategoryCount})</span>
                        </div>
                      ) : (
                        <span className="text-gray-600 text-[11px]">Standby / Ready</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Matrix Footer Totals */}
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-950/90 font-mono text-xs font-bold text-white">
                <td className="py-3 px-3 text-gray-500">Σ</td>
                <td className="py-3 px-3 font-sans uppercase tracking-wider text-gray-300">
                  Total Engineering Output ({technicianMatrix.length} Personnel)
                </td>
                <td className="py-3 px-2.5 text-right text-emerald-400 text-base tabular-nums">
                  {technicianMatrix.reduce((s, r) => s + r.totalSolved, 0)}
                </td>
                <td className="py-3 px-2.5 text-right text-gray-300 tabular-nums">
                  {technicianMatrix.reduce((s, r) => s + r.primarySolved, 0)}L /{' '}
                  {technicianMatrix.reduce((s, r) => s + r.assistedSolved, 0)}A
                </td>
                <td className="py-3 px-2.5 text-right text-cyan-300 tabular-nums">
                  {formatDurationMinutes(executiveKpis.avgMttrMins)}
                </td>
                {activeCategories.map(cat => {
                  const colSum = technicianMatrix.reduce((s, r) => s + (r.byCategory[cat.id] || 0), 0);
                  return (
                    <td key={cat.id} className={`py-3 px-2 text-center tabular-nums ${cat.accentText}`}>
                      {colSum}
                    </td>
                  );
                })}
                <td className="py-3 px-3 font-sans text-[11px] text-gray-400">
                  {executiveKpis.totalSolved} Unique Tickets Solved
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 4: RIDE RELIABILITY HOTSPOTS & SOLVED TECHNICAL AUDIT LOG     */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 5 Columns: Attraction Reliability & Repeat-Fault Hotspots */}
        <div className="lg:col-span-5 bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-gray-800">
              <h2 className="text-base font-bold text-white">
                03. Attraction Reliability &amp; Repeat-Fault Diagnostics
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Rides ranked by technical interventions &amp; primary failure subsystem
              </p>
            </div>

            {rideHotspots.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-xs">
                No ride maintenance incidents recorded in the selected date range.
              </div>
            ) : (
              <div className="divide-y divide-gray-800/70 mt-2">
                {rideHotspots.map((r, i) => (
                  <div key={r.rideId || i} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500 tabular-nums">
                          {String(i + 1).padStart(2, '0')}.
                        </span>
                        <span className="text-sm font-bold text-white truncate">{r.rideName}</span>
                        <span className="text-[11px] text-gray-400">· {r.floor}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5 pl-6">
                        Dominant Subsystem:{' '}
                        <span className={`font-semibold ${r.dominantCategory.accentText}`}>
                          {r.dominantCategory.shortName}
                        </span>
                        {r.lastSolvedDate && <span className="font-mono text-gray-500"> · Last fix {r.lastSolvedDate}</span>}
                      </div>
                    </div>

                    <div className="text-right font-mono flex-shrink-0">
                      <div className="text-sm font-black text-emerald-400 tabular-nums">{r.solvedCount} Solved</div>
                      <div className="text-[10px] text-gray-400">
                        {r.activeCount > 0 ? (
                          <span className="text-amber-300">{r.activeCount} Active</span>
                        ) : (
                          <span>Operational</span>
                        )}
                        {r.urgentCount > 0 && <span className="text-rose-400"> · {r.urgentCount} Urgent</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preventive Maintenance Expert Recommendation Footer */}
          <div className="mt-4 pt-3 border-t border-gray-800 text-xs text-gray-400 flex items-center justify-between">
            <span>Total Park Fleet: {rides.length} Rides &amp; Simulators</span>
            <span className="font-mono text-emerald-400">PM Benchmark: &ge; 95% Uptime</span>
          </div>
        </div>

        {/* Right 7 Columns: Chronological Solved Technical Audit Feed */}
        <div className="lg:col-span-7 bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div>
                <h2 className="text-base font-bold text-white">
                  04. Date-Range Verified Problem Solved Log ({solvedTicketsInRange.length})
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Complete technical resolution trail — change any solved ticket&apos;s category below to sync immediately
                </p>
              </div>
            </div>

            {solvedTicketsInRange.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-sm font-semibold text-gray-300">
                  No solved maintenance records match the current filter criteria.
                </p>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  Adjust the date range above or click &ldquo;Log Solved Technical Record&rdquo; to record completed
                  engineering repairs and populate technician KPIs.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800/70 mt-2 max-h-[420px] overflow-y-auto pr-1">
                {solvedTicketsInRange.slice(0, 50).map(ticket => {
                  const cat = ticket._category;
                  const techList = [ticket.assignedToName, ...(ticket.helperNames || [])].filter(Boolean);

                  return (
                    <div key={ticket.id} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-mono font-bold text-gray-300">{ticket._solvedDate}</span>
                          <span className="text-gray-600">·</span>
                          <span className="font-bold text-white">{ticket.rideName}</span>
                          <span className="text-gray-600">·</span>
                          {onUpdateTicketCategory ? (
                            <select
                              value={cat.id}
                              onChange={e => {
                                const targetCat = activeCategories.find(c => c.id === e.target.value);
                                if (targetCat) {
                                  onUpdateTicketCategory(ticket, targetCat.name);
                                }
                              }}
                              className={`bg-gray-950 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] font-semibold outline-none cursor-pointer ${cat.accentText}`}
                              title="Sync Problem Solved Category"
                            >
                              {activeCategories.map(c => (
                                <option key={c.id} value={c.id} className="bg-gray-900 text-white">
                                  {c.code} {c.shortName}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`font-semibold ${cat.accentText}`}>
                              {cat.code} {cat.shortName}
                            </span>
                          )}
                          {(ticket.priority === 'urgent' || ticket.priority === 'high') && (
                            <>
                              <span className="text-gray-600">·</span>
                              <span className="text-rose-400 font-bold uppercase text-[10px]">
                                {ticket.priority}
                              </span>
                            </>
                          )}
                        </div>

                        <p className="text-xs text-gray-200 font-medium">{ticket.problem}</p>

                        {ticket.resolutionNotes && (
                          <p className="text-[11px] text-emerald-300/90">
                            Fix: {ticket.resolutionNotes}
                          </p>
                        )}
                      </div>

                      <div className="sm:text-right flex-shrink-0 text-xs font-mono">
                        <div className="text-gray-200 font-sans font-semibold">
                          {techList.length > 0 ? techList.join(', ') : 'Maintenance Team'}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          MTTR: <span className="text-cyan-300">{formatDurationMinutes(ticket._turnaroundMins)}</span>
                          {(ticket.solutionImageUrl || ticket.photoUrl) && (
                            <span className="text-purple-300 ml-2">· Photo Proof</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
            <span>
              Showing {Math.min(50, solvedTicketsInRange.length)} of {solvedTicketsInRange.length} solved tickets in
              range
            </span>
            <span className="font-mono">Toggi Fun World Engineering Standards</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceKpiDashboard;
