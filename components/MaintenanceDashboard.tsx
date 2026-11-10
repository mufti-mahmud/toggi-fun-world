import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MaintenanceTicket, Operator, Ride, CustomTechnicalCategory, RidePreCheckRecord } from '../types';
import { hydrateTechnicalCategories, classifyAmusementParkIssue, DEFAULT_CUSTOM_TECHNICAL_CATEGORIES } from './MaintenanceKpiDashboard';
import { database } from '../firebaseConfig';
import { 
  Wrench, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Users, 
  UserCheck, 
  Search, 
  Plus, 
  Trash2, 
  Check, 
  ChevronRight,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Filter,
  UserPlus,
  RefreshCw,
  Sparkles,
  Layers,
  Camera,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  X,
  Download,
  Upload,
  UploadCloud,
  FileImage,
  RotateCcw,
  HeartHandshake,
  Gamepad2,
  MessageSquare,
  Tag,
  Flame,
  User,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  FileText,
  MessageCircle,
  Send,
  Copy,
  CheckCheck,
  ShieldCheck,
  Radio,
  Settings2,
  ExternalLink,
  CalendarRange,
  QrCode,
  Volume2,
  VolumeX
} from 'lucide-react';
import { isSoundMuted, setSoundMuted, unlockAudio, playReportedIssueSound } from '../utils/soundAlerts';
import { DateRangeResolvedModal } from './DateRangeResolvedModal';
import { ShareModal } from './ShareModal';
import { getDhakaDateString, formatDhakaTime, formatDhakaDateTime } from '../constants';

// Helper to calculate YYYY-MM-DD offset relative to a base YYYY-MM-DD string
export const getDhakaDateOffset = (baseYmd: string, daysAgo: number): string => {
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

// Client-side image compression helper: keeps size tiny (< 40KB) via HTML5 Canvas
export const compressImageToLightweightDataUrl = (
  file: File | Blob,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.72
): Promise<{ dataUrl: string; sizeKb: number; originalSizeKb: number }> => {
  return new Promise((resolve, reject) => {
    const originalSizeKb = Math.round(file.size / 1024);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Proportional scale to fit within maxWidth x maxHeight
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to lightweight JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);
        resolve({ dataUrl, sizeKb, originalSizeKb });
      };
      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
};

const CX_FEEDBACK_CATEGORIES = [
  'Guest Comfort & Seating',
  'Ride Smoothness & Noise',
  'Safety Harness & Restraints',
  'Audio, Video & Light FX',
  'Air Conditioning & Ventilation',
  'Cleanliness & Sanitation',
  'Queue Line & Signage',
  'Mechanical / Operational Issue',
  'General Guest Feedback'
];

interface Props {
  maintenanceTickets: Record<string, Record<string, MaintenanceTicket>> | Record<string, any>;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onUpdateTicketStatus: (
    ticket: MaintenanceTicket, 
    status: 'in-progress' | 'solved' | 'reported', 
    technician?: Operator, 
    helpers?: Operator[],
    notes?: string,
    solutionImageUrl?: string,
    isExplicitReopen?: boolean,
    sourceDashboard?: string
  ) => void;
  maintenancePersonnel: Operator[];
  onClearSolved: (date: string) => void;
  rides?: Ride[];
  onReportProblem?: (
    rideId: number, 
    problem: string,
    feedbackCategory?: string,
    priority?: 'normal' | 'high' | 'urgent',
    guestDetails?: string,
    source?: string
  ) => void;
  portalType?: 'rides' | 'cx' | 'all';
  role?: string;
  onSwitchPortal?: (portal: 'rides' | 'cx') => void;
  onDeleteTicket?: (ticket: MaintenanceTicket) => void;
  onClearReported?: (date: string) => void;
  onClearAllRecords?: () => void;
  onUploadSolvedTickets?: (tickets: MaintenanceTicket[]) => void;
  onShowModal?: (modal: any) => void;
  onNavigate?: (view: any) => void;
  customCategories?: CustomTechnicalCategory[];
  onUpdateTicketCategory?: (ticket: MaintenanceTicket, newCategoryName: string) => void;
  ridePreChecks?: Record<string, Record<string | number, RidePreCheckRecord>>;
  onSaveRidePreCheck?: (record: RidePreCheckRecord) => void;
  dailyAssignments?: Record<string, Record<string, number[]>>;
  operators?: Operator[];
  currentUser?: any;
}

export const MaintenanceDashboard: React.FC<Props> = ({ 
  maintenanceTickets = {}, 
  selectedDate, 
  onDateChange, 
  onUpdateTicketStatus, 
  maintenancePersonnel = [], 
  onClearSolved,
  rides = [],
  onReportProblem,
  portalType = 'rides',
  role = 'maintenance',
  onSwitchPortal,
  onDeleteTicket,
  onClearReported,
  onClearAllRecords,
  onUploadSolvedTickets,
  onShowModal,
  onNavigate,
  customCategories,
  onUpdateTicketCategory,
  ridePreChecks = {},
  onSaveRidePreCheck,
  dailyAssignments = {},
  operators = [],
  currentUser
}) => {
  // Helper to detect legacy 8-category schema and force upgrade to 5 permanent categories
  const isLegacy8CategoryList = (list: any): boolean => {
    if (!list || !Array.isArray(list)) return true;
    if (list.length !== 5) return true;
    return list.some(
      (c: any) =>
        c.id === 'plc-sensors' ||
        c.id === 'hvac-chiller-env' ||
        c.id === 'vr-arcade-av' ||
        c.id === 'electrical-vfd' ||
        c.id === 'safety-restraints' ||
        c.id === 'mechanical-drivetrain' ||
        c.id === 'cabin-upholstery' ||
        c.name?.includes('PLC, Control') ||
        c.name?.includes('Electrical Power') ||
        c.name?.includes('Mechanical Drivetrain, Slewing')
    );
  };

  // Real-time synchronization of Custom Technical Categories (strictly 5 fixed categories)
  const [liveCategories, setLiveCategories] = useState<CustomTechnicalCategory[]>(() => {
    if (customCategories && Array.isArray(customCategories) && !isLegacy8CategoryList(customCategories)) {
      return customCategories;
    }
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('TFW_CUSTOM_TECH_CATEGORIES') : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !isLegacy8CategoryList(parsed)) return parsed;
      }
    } catch (_) {}
    return DEFAULT_CUSTOM_TECHNICAL_CATEGORIES;
  });

  useEffect(() => {
    if (customCategories && Array.isArray(customCategories) && !isLegacy8CategoryList(customCategories)) {
      setLiveCategories(customCategories);
    }
  }, [customCategories]);

  // Real-time listener for database updates and local storage updates across all tabs
  useEffect(() => {
    // Purge legacy 8-category data immediately from localStorage if found
    try {
      const saved = localStorage.getItem('TFW_CUSTOM_TECH_CATEGORIES');
      if (saved && isLegacy8CategoryList(JSON.parse(saved))) {
        localStorage.setItem('TFW_CUSTOM_TECH_CATEGORIES', JSON.stringify(DEFAULT_CUSTOM_TECHNICAL_CATEGORIES));
      }
    } catch (_) {}

    const unsub = database.ref('config/appConfig/customTechnicalCategories').on('value', (snap) => {
      const val = snap.val();
      if (val && Array.isArray(val) && !isLegacy8CategoryList(val)) {
        setLiveCategories(val);
        try {
          localStorage.setItem('TFW_CUSTOM_TECH_CATEGORIES', JSON.stringify(val));
        } catch (_) {}
      } else if (val && Array.isArray(val) && isLegacy8CategoryList(val)) {
        // Automatically overwrite old 8-category list in database with the 5 permanent categories
        database.ref('config/appConfig/customTechnicalCategories').set(DEFAULT_CUSTOM_TECHNICAL_CATEGORIES).catch(() => {});
        database.ref('config/customTechnicalCategories').set(DEFAULT_CUSTOM_TECHNICAL_CATEGORIES).catch(() => {});
        setLiveCategories(DEFAULT_CUSTOM_TECHNICAL_CATEGORIES);
      }
    });

    const unsub2 = database.ref('config/customTechnicalCategories').on('value', (snap) => {
      const val = snap.val();
      if (val && Array.isArray(val) && !isLegacy8CategoryList(val)) {
        setLiveCategories(val);
        try {
          localStorage.setItem('TFW_CUSTOM_TECH_CATEGORIES', JSON.stringify(val));
        } catch (_) {}
      }
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'TFW_CUSTOM_TECH_CATEGORIES' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && !isLegacy8CategoryList(parsed)) setLiveCategories(parsed);
        } catch (_) {}
      }
    };

    const handleCustomUpdate = (e: any) => {
      if (e?.detail && Array.isArray(e.detail) && !isLegacy8CategoryList(e.detail)) {
        setLiveCategories(e.detail);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('TFW_CUSTOM_TECH_CATEGORIES_UPDATED', handleCustomUpdate);

    return () => {
      database.ref('config/appConfig/customTechnicalCategories').off('value', unsub);
      database.ref('config/customTechnicalCategories').off('value', unsub2);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('TFW_CUSTOM_TECH_CATEGORIES_UPDATED', handleCustomUpdate);
    };
  }, []);

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

  const activeSyncedCategories = useMemo(
    () => hydrateTechnicalCategories(liveCategories),
    [liveCategories]
  );
  const [selectedCategoryByTicket, setSelectedCategoryByTicket] = useState<Record<string, string>>({});
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [showCategoryCards, setShowCategoryCards] = useState<boolean>(true);
  const [activePortal, setActivePortal] = useState<'rides' | 'cx'>(portalType === 'cx' ? 'cx' : 'rides');
  const [showMobileShare, setShowMobileShare] = useState(false);
  const [dashboardNotice, setDashboardNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setDashboardNotice(msg);
    setTimeout(() => setDashboardNotice(null), 4500);
  };

  // --- Level-Wise Games & Rides Pre-Check Hub State ---
  const [selectedPreCheckLevel, setSelectedPreCheckLevel] = useState<string>('all');
  const [preCheckSearch, setPreCheckSearch] = useState<string>('');
  const [selectedPreCheckRide, setSelectedPreCheckRide] = useState<Ride | null>(null);

  // Pre-Check Form State (for selectedPreCheckRide)
  const [preCheckSrTech, setPreCheckSrTech] = useState<string>('');
  const [preCheckRequiredTime, setPreCheckRequiredTime] = useState<number>(15);
  const [preCheckStatus, setPreCheckStatus] = useState<'completed' | 'in-progress' | 'flagged' | 'pending'>('completed');
  const [preCheckNotes, setPreCheckNotes] = useState<string>('');
  const [preCheckList, setPreCheckList] = useState<Record<string, boolean>>({
    powerBreakers: true,
    emergencyStop: true,
    safetyRestraints: true,
    mechanicalTracks: true,
    sensorsLimit: true,
    audioLightingFX: true,
    testCycleRun: true
  });

  const normalizeAssigneeIds = (raw: any): number[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number).filter(n => !isNaN(n) && n > 0);
    if (typeof raw === 'object') return Object.values(raw).map(Number).filter(n => !isNaN(n) && n > 0);
    const n = Number(raw);
    return (!isNaN(n) && n > 0) ? [n] : [];
  };

  const availableLevels = useMemo(() => {
    const set = new Set<string>();
    rides.forEach(r => {
      if (r.floor && r.floor.trim()) set.add(r.floor.trim());
    });
    return Array.from(set).sort();
  }, [rides]);

  const levelFilteredRides = useMemo(() => {
    return rides.filter(r => {
      if (selectedPreCheckLevel !== 'all' && (r.floor || '').trim() !== selectedPreCheckLevel) {
        return false;
      }
      if (preCheckSearch.trim()) {
        const q = preCheckSearch.toLowerCase().trim();
        const matchName = r.name.toLowerCase().includes(q);
        const matchFloor = (r.floor || '').toLowerCase().includes(q);
        return matchName || matchFloor;
      }
      return true;
    });
  }, [rides, selectedPreCheckLevel, preCheckSearch]);

  const levelPreCheckStats = useMemo(() => {
    let completed = 0;
    let pending = 0;
    let flagged = 0;
    levelFilteredRides.forEach(r => {
      const pc = ridePreChecks?.[selectedDate]?.[r.id];
      if (pc?.status === 'completed') completed++;
      else if (pc?.status === 'flagged') flagged++;
      else pending++;
    });
    return { completed, pending, flagged, total: levelFilteredRides.length };
  }, [levelFilteredRides, ridePreChecks, selectedDate]);

  const handleOpenPreCheckModal = (ride: Ride) => {
    setSelectedPreCheckRide(ride);
    const existing = ridePreChecks?.[selectedDate]?.[ride.id];
    if (existing) {
      setPreCheckSrTech(existing.srTechnicianName || '');
      setPreCheckRequiredTime(existing.requiredTimeMinutes || 15);
      setPreCheckStatus(existing.status || 'completed');
      setPreCheckNotes(existing.notes || '');
      setPreCheckList(existing.checklist || {
        powerBreakers: true,
        emergencyStop: true,
        safetyRestraints: true,
        mechanicalTracks: true,
        sensorsLimit: true,
        audioLightingFX: true,
        testCycleRun: true
      });
    } else {
      const defaultForeman = maintenancePersonnel.find(p => 
        (p.role || '').toLowerCase().includes('foreman') || 
        (p.role || '').toLowerCase().includes('senior') ||
        (p.name || '').toLowerCase().includes('hafizur')
      ) || maintenancePersonnel[0];
      
      setPreCheckSrTech(defaultForeman?.name ? `${defaultForeman.name} (${defaultForeman.role || 'Foreman'})` : 'Md. Hafizur Rahman (Foreman)');
      setPreCheckRequiredTime(15);
      setPreCheckStatus('completed');
      setPreCheckNotes('');
      setPreCheckList({
        powerBreakers: true,
        emergencyStop: true,
        safetyRestraints: true,
        mechanicalTracks: true,
        sensorsLimit: true,
        audioLightingFX: true,
        testCycleRun: true
      });
    }
  };

  const handleSavePreCheckForm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPreCheckRide || !onSaveRidePreCheck) return;

    const record: RidePreCheckRecord = {
      rideId: selectedPreCheckRide.id,
      rideName: selectedPreCheckRide.name,
      floor: selectedPreCheckRide.floor,
      date: selectedDate,
      status: preCheckStatus,
      srTechnicianName: preCheckSrTech.trim() || 'Senior Technician / Foreman',
      requiredTimeMinutes: Number(preCheckRequiredTime) || 15,
      checklist: preCheckList,
      notes: preCheckNotes.trim() || undefined,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || 'Maintenance Department'
    };

    onSaveRidePreCheck(record);
    setSelectedPreCheckRide(null);
  };

  const handleSelectPortal = (targetPortal: 'rides' | 'cx') => {
    setActivePortal(targetPortal);
    onSwitchPortal?.(targetPortal);
    try {
      database.syncViewEverywhere(
        selectedDate,
        targetPortal === 'cx' ? 'cx-feedback' : 'maintenance-dashboard',
        {
          portalType: targetPortal,
          statusTab: selectedStatusTab,
          viewScope
        }
      );
    } catch (e) {}
  };

  useEffect(() => {
    if (role === 'maintenance') {
      setActivePortal('rides');
    } else if (portalType) {
      setActivePortal(portalType === 'cx' ? 'cx' : 'rides');
    }
  }, [portalType, role]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [viewScope, setViewScope] = useState<'unresolved' | 'solved' | 'date' | 'all'>('unresolved');
  const [selectedStatusTab, setSelectedStatusTab] = useState<'all' | 'reported' | 'in-progress' | 'solved'>('all');

  const handleStatusTabChange = useCallback((tab: 'all' | 'reported' | 'in-progress' | 'solved') => {
    setSelectedStatusTab(tab);
    try {
      sessionStorage.setItem('maintenance_status_tab', tab);
    } catch (_) {}
  }, []);

  const handleViewScopeChange = useCallback((scope: 'unresolved' | 'solved' | 'date' | 'all') => {
    setViewScope(scope);
    database.ref('config/appConfig/activeMaintenanceViewScope').set(scope);
  }, []);
  const [selectedTechsByTicket, setSelectedTechsByTicket] = useState<Record<string, number[]>>({});
  const [selectedLeadByTicket, setSelectedLeadByTicket] = useState<Record<string, number | null>>({});
  const [selectedHelpersByTicket, setSelectedHelpersByTicket] = useState<Record<string, number[]>>({});

  const isOperationOfficer = useCallback((name?: string, role?: string) => {
    const n = String(name || '').toLowerCase().trim();
    const r = String(role || '').toLowerCase().trim();
    return (
      n === 'operation officer' ||
      n.includes('operation officer') ||
      n === 'operation-officer' ||
      r === 'operation officer' ||
      r.includes('operation officer') ||
      r === 'operation-officer'
    );
  }, []);

  const availableTechs = useMemo(
    () => maintenancePersonnel.filter(p => p.active !== false && !isOperationOfficer(p.name, p.role)),
    [maintenancePersonnel, isOperationOfficer]
  );
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [resolutionNotesByTicket, setResolutionNotesByTicket] = useState<Record<string, string>>({});
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newTicketRideId, setNewTicketRideId] = useState<number | ''>('');
  const [newTicketProblem, setNewTicketProblem] = useState('');
  const [newTicketCategory, setNewTicketCategory] = useState<string>(
    activePortal === 'cx' ? 'Guest Comfort & Seating' : 'Operational Issue'
  );
  const [newTicketPriority, setNewTicketPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [newTicketGuestDetails, setNewTicketGuestDetails] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showDateRangeModal, setShowDateRangeModal] = useState(false);

  // Upload Solved Records (Date Range Wise) states
  const [showUploadSolvedModal, setShowUploadSolvedModal] = useState(false);
  const [uploadDateFrom, setUploadDateFrom] = useState('');
  const [uploadDateTo, setUploadDateTo] = useState('');
  const [uploadInputText, setUploadInputText] = useState('');
  const [parsedUploadTickets, setParsedUploadTickets] = useState<MaintenanceTicket[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

  // Quick Ride Tag Editor state
  const [editingRideTicketId, setEditingRideTicketId] = useState<string | null>(null);

  // Sound notification state and unlock
  const [soundMuted, setLocalSoundMuted] = useState<boolean>(() => isSoundMuted());
  const handleToggleSound = () => {
    unlockAudio();
    const next = !soundMuted;
    setLocalSoundMuted(next);
    setSoundMuted(next);
    if (!next) {
      playReportedIssueSound({
        rideName: 'Carousel',
        problem: 'Sound system verified',
        reportedByName: 'Maintenance Lead',
        targetDepartment: 'Maintenance'
      });
    }
  };

  const handleUpdateRideTag = async (ticket: MaintenanceTicket, newRideId: number, newRideName: string) => {
    const dateKey = ticket.date || selectedDate;
    try {
      await database.ref(`data/maintenanceTickets/${dateKey}/${ticket.id}`).update({
        rideId: newRideId,
        rideName: newRideName
      });
    } catch (err) {
      console.error('Failed to update ticket ride tag:', err);
    }
    setEditingRideTicketId(null);
  };

  // Synchronize maintenance viewScope across all devices in real-time
  useEffect(() => {
    const unsub = database.ref('config/appConfig').on('value', (snap) => {
      const cfg = snap.val();
      if (cfg && cfg.activeMaintenanceViewScope) {
        setViewScope(prev => cfg.activeMaintenanceViewScope !== prev ? cfg.activeMaintenanceViewScope : prev);
      }
    });
    return () => {
      database.ref('config/appConfig').off('value', unsub);
    };
  }, []);

  // Unified Sync Mobile & Desktop handler
  const handleSyncAllDevices = async () => {
    setIsSyncingAll(true);
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      await database.syncViewEverywhere(
        selectedDate,
        activePortal === 'cx' ? 'cx-feedback' : 'maintenance-dashboard',
        {
          portalType: activePortal,
          statusTab: selectedStatusTab,
          viewScope
        }
      );
      await database.engine.fetchFullDatabase();
      setSyncFeedback('Mobile & Desktop Synced!');
    } catch (e) {
      console.warn('Sync failed:', e);
      setSyncFeedback('Synced locally');
    } finally {
      setTimeout(() => {
        setIsSyncingAll(false);
        setIsSyncing(false);
        setTimeout(() => setSyncFeedback(null), 2500);
      }, 600);
    }
  };

  // CSV & JSON Parser for Solved Records by Date Range
  const handleParseUploadRecords = () => {
    setUploadError(null);
    setUploadSuccessMsg(null);
    if (!uploadInputText.trim()) {
      setUploadError('Please provide CSV or JSON data to upload.');
      return;
    }

    try {
      const trimmed = uploadInputText.trim();
      let records: MaintenanceTicket[] = [];

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        // JSON format
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) throw new Error('JSON data must be an array of records.');
        records = parsed.map((item: any, idx: number) => {
          const matchedRide = rides.find(r => 
            String(r.id) === String(item.rideId) || 
            r.name.toLowerCase() === String(item.rideName || '').toLowerCase()
          ) || rides[0];

          const dateVal = item.date || uploadDateFrom || selectedDate;
          return {
            id: item.id || `uploaded-solved-${Date.now()}-${idx}`,
            date: dateVal,
            rideId: matchedRide ? matchedRide.id : (Number(item.rideId) || 1),
            rideName: item.rideName || (matchedRide ? matchedRide.name : 'Attraction'),
            problem: item.problem || item.issue || 'Maintenance resolution record',
            feedbackCategory: item.feedbackCategory || item.category || 'Operational Issue',
            priority: (['normal', 'high', 'urgent'].includes(item.priority) ? item.priority : 'normal') as any,
            status: 'solved',
            reportedAt: item.reportedAt || new Date(dateVal).toISOString(),
            solvedAt: item.solvedAt || new Date(dateVal).toISOString(),
            reportedById: Number(item.reportedById) || 0,
            reportedByName: item.reportedByName || 'Games & Ride Associate',
            reportedByRole: item.reportedByRole || 'Associate',
            assignedToName: item.assignedToName || item.technician || 'Maintenance Concern',
            assignedToPhone: item.assignedToPhone || '',
            resolutionNotes: item.resolutionNotes || item.notes || 'Resolved and verified operational',
            source: item.source || 'operator'
          };
        });
      } else {
        // CSV format: Date, Ride Name, Problem, Category, Priority, Technician, Resolution Notes
        const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) throw new Error('CSV is empty');

        let startIndex = 0;
        // Check if first line is header
        const firstLineLower = lines[0].toLowerCase();
        if (firstLineLower.includes('ride') || firstLineLower.includes('date') || firstLineLower.includes('problem')) {
          startIndex = 1;
        }

        for (let i = startIndex; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
          if (cols.length < 2) continue;

          let recDate = uploadDateFrom || selectedDate;
          let rideStr = '';
          let problemStr = '';
          let categoryStr = 'Operational Issue';
          let priorityStr: 'normal' | 'high' | 'urgent' = 'normal';
          let techStr = 'Maintenance Concern';
          let notesStr = 'Resolved and verified operational';

          // Format: Date, Ride Name, Problem, [Category, Priority, Technician, Notes]
          if (cols[0].match(/^\d{4}-\d{2}-\d{2}$/)) {
            recDate = cols[0];
            rideStr = cols[1] || '';
            problemStr = cols[2] || 'Maintenance resolution record';
            if (cols[3]) categoryStr = cols[3];
            if (cols[4] && ['normal', 'high', 'urgent'].includes(cols[4].toLowerCase())) {
              priorityStr = cols[4].toLowerCase() as any;
            }
            if (cols[5]) techStr = cols[5];
            if (cols[6]) notesStr = cols[6];
          } else {
            rideStr = cols[0] || '';
            problemStr = cols[1] || 'Maintenance resolution record';
            if (cols[2]) categoryStr = cols[2];
            if (cols[3] && ['normal', 'high', 'urgent'].includes(cols[3].toLowerCase())) {
              priorityStr = cols[3].toLowerCase() as any;
            }
            if (cols[4]) techStr = cols[4];
            if (cols[5]) notesStr = cols[5];
          }

          const matchedRide = rides.find(r => 
            r.name.toLowerCase() === rideStr.toLowerCase() || 
            String(r.id) === rideStr
          ) || rides[0];

          records.push({
            id: `uploaded-solved-${Date.now()}-${i}`,
            date: recDate,
            rideId: matchedRide ? matchedRide.id : 1,
            rideName: matchedRide ? matchedRide.name : (rideStr || 'Attraction'),
            problem: problemStr,
            feedbackCategory: categoryStr,
            priority: priorityStr,
            status: 'solved',
            reportedAt: new Date(recDate).toISOString(),
            solvedAt: new Date(recDate).toISOString(),
            reportedById: 0,
            reportedByName: 'Games & Ride Associate',
            reportedByRole: 'Associate',
            assignedToName: techStr,
            assignedToPhone: '',
            resolutionNotes: notesStr,
            source: 'operator'
          });
        }
      }

      if (records.length === 0) {
        throw new Error('No valid records found in the uploaded text or CSV.');
      }

      setParsedUploadTickets(records);
      setUploadSuccessMsg(`Successfully parsed ${records.length} solved record(s). Review below and click "Save Solved Records" to apply.`);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse records. Check formatting.');
      setParsedUploadTickets([]);
    }
  };

  const handleConfirmUpload = () => {
    if (parsedUploadTickets.length === 0) return;
    setIsProcessingUpload(true);
    try {
      if (onUploadSolvedTickets) {
        onUploadSolvedTickets(parsedUploadTickets);
      }
      setUploadSuccessMsg(`Successfully saved ${parsedUploadTickets.length} solved record(s) into database!`);
      setTimeout(() => {
        setShowUploadSolvedModal(false);
        setParsedUploadTickets([]);
        setUploadInputText('');
        setUploadSuccessMsg(null);
        setIsProcessingUpload(false);
      }, 1200);
    } catch (err: any) {
      setUploadError(err.message || 'Error saving uploaded records.');
      setIsProcessingUpload(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const header = 'Date,Ride Name,Problem,Category,Priority,Technician,Resolution Notes\n';
    const row1 = `${selectedDate},Sky Coaster,Emergency stop switch calibration,Operational Issue,normal,Tech Tom,Calibrated and verified smooth stop\n`;
    const row2 = `${selectedDate},Carousel,Motor belt friction checked,Operational Issue,high,Fixit Felix,Lubricated and tightened belt\n`;
    const row3 = `${selectedDate},Bumper Cars,Rubber buffer alignment,Safety Inspection,normal,Dave Hydraulics,Inspected and secured bolts\n`;
    const blob = new Blob([header + row1 + row2 + row3], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sample_solved_maintenance_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Photo attachment states
  const [photoByTicket, setPhotoByTicket] = useState<Record<string, { dataUrl: string; sizeKb: number; originalSizeKb?: number }>>({});
  const [isCompressingTicketId, setIsCompressingTicketId] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string;
    rideName: string;
    problem: string;
    resolutionNotes?: string;
    date?: string;
    techNames?: string[];
  } | null>(null);

  const todayStr = useMemo(() => {
    return getDhakaDateString();
  }, []);

  // Solved Date Range Filters
  const [solvedDateFrom, setSolvedDateFrom] = useState<string>('');
  const [solvedDateTo, setSolvedDateTo] = useState<string>('');
  const [showSolvedDateFilter, setShowSolvedDateFilter] = useState<boolean>(false);

  const getTicketDate = useCallback((ticket: MaintenanceTicket): string => {
    if (ticket.reportedAt) {
      try {
        return getDhakaDateString(new Date(ticket.reportedAt));
      } catch (e) {}
    }
    return ticket.date || todayStr;
  }, [todayStr]);

  // Strictly identify tickets sent by Customer Experience (CX) role - exclude all other issues
  const isCxTicket = useCallback((t: MaintenanceTicket): boolean => {
    if (!t) return false;
    // Explicitly exclude Operator tickets unless explicitly sent by CX role
    if (t.source === 'operator') {
      const roleStr = (t.reportedByRole || '').toLowerCase();
      if (!roleStr.includes('cx') && !roleStr.includes('customer experience')) {
        return false;
      }
    }
    
    // Must be sent by Customer Experience role or source
    if (t.source === 'cx') return true;
    
    const roleStr = (t.reportedByRole || '').toLowerCase();
    if (roleStr.includes('cx') || roleStr.includes('customer experience')) {
      return true;
    }
    
    const nameStr = (t.reportedByName || '').toLowerCase();
    if (nameStr.includes('customer experience') || nameStr.includes('(cx)')) {
      return true;
    }

    return false;
  }, []);

  const isWhatsAppTicket = (t: MaintenanceTicket) => Boolean(t.whatsappMessageId || t.source === 'whatsapp' || t.whatsappGroup);

  // Helper to normalize problem text across English and Bengali scripts
  const normalizeIssue = (text?: string): string => {
    return String(text || '')
      .toLowerCase()
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\w\s\u0980-\u09FF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const isProblemMatching = (probA?: string, probB?: string): boolean => {
    const a = normalizeIssue(probA);
    const b = normalizeIssue(probB);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a))) return true;
    return false;
  };

  // Collect all tickets across all dates with anti-resurrection filtering & robust canonical deduplication
  const allTicketsFlat = useMemo(() => {
    if (!maintenanceTickets || typeof maintenanceTickets !== 'object') return [];

    const rawList: any[] = [];
    Object.entries(maintenanceTickets).forEach(([dateKey, dateTickets]) => {
      if (dateTickets && typeof dateTickets === 'object') {
        Object.entries(dateTickets as Record<string, any>).forEach(([tKey, t]) => {
          if (!t || typeof t !== 'object') return;
          const tId = t.id || tKey;
          if (
            t.status === 'deleted' ||
            database.isTicketDeleted(tId, t.whatsappMessageId) ||
            database.isTicketDeleted(tKey, t.whatsappMessageId)
          ) {
            return;
          }
          const coreSuffix = String(tId).replace(/^\d{4}-\d{2}-\d{2}-/, '');
          rawList.push({
            ...t,
            id: tId,
            _dateKey: dateKey,
            _coreSuffix: (coreSuffix && coreSuffix.length > 5) ? coreSuffix : ''
          });
        });
      }
    });

    if (rawList.length === 0) return [];

    // Disjoint set (Union-Find) clustering to group all related tickets across dates and sources
    const n = rawList.length;
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;

    const findRoot = (i: number): number => {
      let root = i;
      while (root !== parent[root]) root = parent[root];
      let curr = i;
      while (curr !== root) {
        const next = parent[curr];
        parent[curr] = root;
        curr = next;
      }
      return root;
    };

    const union = (i: number, j: number) => {
      const rootI = findRoot(i);
      const rootJ = findRoot(j);
      if (rootI !== rootJ) parent[rootI] = rootJ;
    };

    for (let i = 0; i < n; i++) {
      const a = rawList[i];
      for (let j = i + 1; j < n; j++) {
        const b = rawList[j];
        let isSame = false;
        // 1. Same exact ID or core suffix
        if (a.id === b.id || (a._coreSuffix && a._coreSuffix === b._coreSuffix)) {
          isSame = true;
        }
        // 2. Same WhatsApp message ID
        else if (a.whatsappMessageId && b.whatsappMessageId && a.whatsappMessageId === b.whatsappMessageId) {
          isSame = true;
        }

        if (isSame) union(i, j);
      }
    }

    const clusters = new Map<number, any[]>();
    for (let i = 0; i < n; i++) {
      const root = findRoot(i);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(rawList[i]);
    }

    const statusRank: Record<string, number> = { reported: 1, 'in-progress': 2, solved: 3 };
    const unifiedList: MaintenanceTicket[] = [];

    clusters.forEach((records) => {
      if (records.length === 0) return;

      // Sort to find the latest / authoritative record by status rank first (solved > in-progress > reported), then most recent activity
      records.sort((a, b) => {
        const rankDiff = (statusRank[b.status] || 1) - (statusRank[a.status] || 1);
        if (rankDiff !== 0) return rankDiff;
        const timeB = new Date(b.updatedAt || b.solvedAt || b.inProgressAt || b.reportedAt || 0).getTime();
        const timeA = new Date(a.updatedAt || a.solvedAt || a.inProgressAt || a.reportedAt || 0).getTime();
        return timeB - timeA;
      });

      const best = records[0];
      unifiedList.push(best);
    });

    // Sort newest reports or solutions first
    return unifiedList.sort((a, b) => {
      const timeB = new Date(b.solvedAt || b.reportedAt || 0).getTime();
      const timeA = new Date(a.solvedAt || a.reportedAt || 0).getTime();
      return timeB - timeA;
    });
  }, [maintenanceTickets]);

  // Base tickets filtered for current portal (Games & Ride Associates vs CX)
  const baseTickets = useMemo(() => {
    if (activePortal === 'cx') {
      // Strictly tickets sent by Customer Experience role - exclude all other issues
      return allTicketsFlat.filter(t => isCxTicket(t));
    } else if (activePortal === 'rides') {
      // Rides / Games Associates & Operators tickets
      return allTicketsFlat.filter(t => !isCxTicket(t));
    }
    return allTicketsFlat;
  }, [allTicketsFlat, activePortal, isCxTicket]);

  // Global solved tickets across all portals
  const allSolvedTicketsFlat = useMemo(() => {
    return allTicketsFlat.filter(t => t.status === 'solved');
  }, [allTicketsFlat]);

  // Global CX tickets across all states
  const allCxTicketsFlat = useMemo(() => {
    return allTicketsFlat.filter(t => isCxTicket(t));
  }, [allTicketsFlat]);

  // Global solved CX tickets
  const allCxSolvedTicketsFlat = useMemo(() => {
    return allTicketsFlat.filter(t => isCxTicket(t) && t.status === 'solved');
  }, [allTicketsFlat]);

  // Global counts for both tabs
  const ridesUnresolvedCount = useMemo(() => {
    return allTicketsFlat.filter(t => !isCxTicket(t) && (t.status === 'reported' || t.status === 'in-progress')).length;
  }, [allTicketsFlat]);

  const cxUnresolvedCount = useMemo(() => {
    return allTicketsFlat.filter(t => isCxTicket(t) && (t.status === 'reported' || t.status === 'in-progress')).length;
  }, [allTicketsFlat]);

  // Total unresolved count for current portal
  const totalUnresolvedCount = useMemo(() => {
    return baseTickets.filter(t => t.status === 'reported' || t.status === 'in-progress').length;
  }, [baseTickets]);

  // Total solved count for current portal
  const totalSolvedCount = useMemo(() => {
    return baseTickets.filter(t => t.status === 'solved').length;
  }, [baseTickets]);

  // Total solved with photos count
  const totalSolvedWithPhotosCount = useMemo(() => {
    return baseTickets.filter(t => t.status === 'solved' && (t.solutionImageUrl || t.photoUrl)).length;
  }, [baseTickets]);

  // Helper to reliably check if a ticket was solved on a specific date (handling ISO string and local dates)
  const isTicketSolvedOnDate = useCallback((t: MaintenanceTicket, targetDate: string) => {
    if (t.status !== 'solved') return false;
    if (t.solvedAt) {
      try {
        const solvedDhaka = getDhakaDateString(new Date(t.solvedAt));
        if (solvedDhaka === targetDate) return true;
      } catch (e) {}
    }
    const ticketDate = getTicketDate(t);
    return ticketDate === targetDate;
  }, [getTicketDate]);

  // Helper to reliably check if a ticket was solved within a date range (Dhaka time)
  const isTicketSolvedInRange = useCallback((t: MaintenanceTicket, from?: string, to?: string) => {
    if (t.status !== 'solved') return false;
    if (!from && !to) return true;
    let sDate = '';
    if (t.solvedAt) {
      try {
        sDate = getDhakaDateString(new Date(t.solvedAt));
      } catch (e) {
        sDate = String(t.solvedAt).slice(0, 10);
      }
    }
    const rDate = getTicketDate(t);
    const targetDate = sDate || rDate;
    if (from && targetDate && targetDate < from) return false;
    if (to && targetDate && targetDate > to) return false;
    if (from && !targetDate) return false;
    return true;
  }, [getTicketDate]);

  // Solved today count
  const solvedTodayCount = useMemo(() => {
    return baseTickets.filter(t => t.status === 'solved' && isTicketSolvedOnDate(t, todayStr)).length;
  }, [baseTickets, todayStr, isTicketSolvedOnDate]);

  // Helper to format turnaround / fix duration
  const formatTurnaroundDuration = (reportedAt?: string, solvedAt?: string) => {
    if (!reportedAt || !solvedAt) return null;
    const start = new Date(reportedAt).getTime();
    const end = new Date(solvedAt).getTime();
    const diffMs = end - start;
    if (diffMs <= 0 || isNaN(diffMs)) return null;
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    if (totalMinutes < 60) {
      return `${totalMinutes} min${totalMinutes === 1 ? '' : 's'}`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (mins === 0) return `${hours} hr${hours === 1 ? '' : 's'}`;
    return `${hours}h ${mins}m`;
  };

  // --- Export and Download Utilities ---
  const downloadTicketsCSV = (ticketsToExport: MaintenanceTicket[], defaultFileName: string) => {
    if (!ticketsToExport || ticketsToExport.length === 0) {
      return;
    }

    const headers = [
      'Ticket ID',
      'Resolved Date',
      'Reported Date',
      'Source Portal',
      'Ride / Attraction',
      'Floor / Location',
      'Issue / Feedback Category',
      'Priority',
      'Reported Problem / Guest Feedback',
      'Guest / Cabin Details',
      'Status',
      'Reported By',
      'Reported Role',
      'Reported At',
      'Resolved At',
      'Fix Turnaround Time',
      'Primary Technician',
      'Helper Technicians',
      'Resolution Notes / Actions Taken',
      'Proof Photo Attached'
    ];

    const rows = ticketsToExport.map(t => {
      const isFromCX = isCxTicket(t);
      const helpers = (t.helperNames && Array.isArray(t.helperNames)) ? t.helperNames.join('; ') : '';
      const turnaround = formatTurnaroundDuration(t.reportedAt, t.solvedAt) || 'N/A';
      const hasPhoto = Boolean(t.solutionImageUrl || t.photoUrl) ? 'YES' : 'NO';

      let solvedDate = '';
      if (t.solvedAt) {
        try { solvedDate = getDhakaDateString(t.solvedAt); } catch { solvedDate = t.solvedAt.slice(0, 10); }
      }
      const reportedDate = t.date || (t.reportedAt ? getDhakaDateString(t.reportedAt) : '');

      const rideObj = rides.find(r => r.id === t.rideId);
      const floorStr = rideObj?.floor || (t as any).floor || '';

      return [
        t.id || '',
        solvedDate,
        reportedDate,
        isFromCX ? 'Customer Experience (CX)' : 'Games & Ride Associate',
        t.rideName || '',
        floorStr,
        t.feedbackCategory || (isFromCX ? 'Guest Feedback' : 'Operational Issue'),
        (t.priority || 'normal').toUpperCase(),
        t.problem || '',
        t.guestDetails || '',
        (t.status || 'reported').toUpperCase(),
        t.reportedByName || '',
        t.reportedByRole || (isFromCX ? 'Customer Experience' : 'Associate'),
        t.reportedAt ? new Date(t.reportedAt).toLocaleString('en-GB') : '',
        t.solvedAt ? new Date(t.solvedAt).toLocaleString('en-GB') : '',
        turnaround,
        t.assignedToName || '',
        helpers,
        t.resolutionNotes || '',
        hasPhoto
      ];
    });

    const csvContent = '\uFEFF' + [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${defaultFileName}_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  const handlePrintAuditReport = (ticketsToExport: MaintenanceTicket[], reportTitle: string, reportSubtitle: string) => {
    if (!ticketsToExport || ticketsToExport.length === 0) {
      showNotice('No tickets available to print.');
      return;
    }

    const printWindow = window.open('', '_blank');

    const solvedCount = ticketsToExport.filter(t => t.status === 'solved').length;
    const activeCount = ticketsToExport.filter(t => t.status === 'reported' || t.status === 'in-progress').length;
    const withPhotoCount = ticketsToExport.filter(t => Boolean(t.solutionImageUrl || t.photoUrl)).length;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${reportTitle} - ${todayStr}</title>
          <style>
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-print { display: none !important; }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #111827;
              margin: 20px;
              font-size: 11px;
            }
            .header {
              border-bottom: 2px solid #374151;
              padding-bottom: 12px;
              margin-bottom: 16px;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .title { font-size: 18px; font-weight: bold; color: #111827; margin: 0 0 4px 0; }
            .subtitle { font-size: 12px; color: #4B5563; margin: 0; }
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin-bottom: 16px;
            }
            .stat-card {
              border: 1px solid #E5E7EB;
              border-radius: 6px;
              padding: 8px 12px;
              background-color: #F9FAFB;
            }
            .stat-num { font-size: 16px; font-weight: bold; color: #111827; }
            .stat-lbl { font-size: 10px; color: #6B7280; text-transform: uppercase; font-weight: 600; }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            th {
              background-color: #F3F4F6;
              border: 1px solid #D1D5DB;
              padding: 6px 8px;
              text-align: left;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              color: #374151;
            }
            td {
              border: 1px solid #E5E7EB;
              padding: 6px 8px;
              vertical-align: top;
            }
            tr:nth-child(even) { background-color: #F9FAFB; }
            .badge {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 9px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .badge-solved { background-color: #D1FAE5; color: #065F46; border: 1px solid #A7F3D0; }
            .badge-progress { background-color: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
            .badge-reported { background-color: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; }
            .badge-cx { background-color: #FCE7F3; color: #9D174D; border: 1px solid #FBCFE8; }
            .badge-op { background-color: #DBEAFE; color: #1E40AF; border: 1px solid #BFDBFE; }
            .footer {
              margin-top: 24px;
              border-top: 1px solid #E5E7EB;
              padding-top: 8px;
              font-size: 10px;
              color: #6B7280;
              display: flex;
              justify-content: space-between;
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 15px; text-align: right;">
            <button onclick="window.print()" style="padding: 8px 16px; background: #2563EB; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
              Print / Save as PDF
            </button>
            <button onclick="window.close()" style="margin-left: 8px; padding: 8px 16px; background: #6B7280; color: white; border: none; border-radius: 6px; cursor: pointer;">
              Close Window
            </button>
          </div>

          <div class="header">
            <div>
              <h1 class="title">${reportTitle}</h1>
              <p class="subtitle">${reportSubtitle}</p>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: bold; color: #374151;">Generated: ${new Date().toLocaleString()}</div>
              <div style="color: #6B7280; font-size: 10px;">Selected Date: ${selectedDate}</div>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-num">${ticketsToExport.length}</div>
              <div class="stat-lbl">Total Records</div>
            </div>
            <div class="stat-card">
              <div class="stat-num" style="color: #059669;">${solvedCount}</div>
              <div class="stat-lbl">Resolved Issues</div>
            </div>
            <div class="stat-card">
              <div class="stat-num" style="color: #D97706;">${activeCount}</div>
              <div class="stat-lbl">Active / In-Progress</div>
            </div>
            <div class="stat-card">
              <div class="stat-num" style="color: #7C3AED;">${withPhotoCount}</div>
              <div class="stat-lbl">Photo Proof Verified</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 45px;">Date</th>
                <th style="width: 70px;">Source</th>
                <th style="width: 100px;">Ride / Attraction</th>
                <th style="width: 80px;">Category</th>
                <th>Issue / Feedback</th>
                <th style="width: 65px;">Status</th>
                <th style="width: 110px;">Technicians & Helpers</th>
                <th style="width: 65px;">Turnaround</th>
                <th>Resolution Notes</th>
              </tr>
            </thead>
            <tbody>
              ${ticketsToExport.map(t => {
                const isFromCX = isCxTicket(t);
                const techList = [t.assignedToName, ...(t.helperNames || [])].filter(Boolean).join(', ');
                const statusBadge = t.status === 'solved' 
                  ? '<span class="badge badge-solved">Solved</span>'
                  : t.status === 'in-progress'
                  ? '<span class="badge badge-progress">In Progress</span>'
                  : '<span class="badge badge-reported">Reported</span>';
                const sourceBadge = isFromCX
                  ? '<span class="badge badge-cx">CX</span>'
                  : '<span class="badge badge-op">Associate</span>';
                const turnaround = formatTurnaroundDuration(t.reportedAt, t.solvedAt) || '-';

                return `
                  <tr>
                    <td>${t.date || '-'}</td>
                    <td>${sourceBadge}</td>
                    <td><strong>${t.rideName || '-'}</strong></td>
                    <td><span style="font-size: 9px; color: #4B5563;">${t.feedbackCategory || '-'}</span></td>
                    <td>
                      <div>${t.problem || '-'}</div>
                      ${t.guestDetails ? `<div style="font-size: 9px; color: #DB2777; margin-top: 2px;">Guest/Seat: ${t.guestDetails}</div>` : ''}
                    </td>
                    <td>${statusBadge}</td>
                    <td><span style="font-weight: 500;">${techList || '<em style="color:#9CA3AF;">Unassigned</em>'}</span></td>
                    <td><span style="font-family: monospace; font-size: 9px;">${turnaround}</span></td>
                    <td>
                      <div style="color: #065F46; font-size: 9.5px;">${t.resolutionNotes || '<em style="color:#9CA3AF;">No notes</em>'}</div>
                      ${t.solutionImageUrl || t.photoUrl ? '<div style="color: #059669; font-size: 9px; font-weight: bold; margin-top: 2px;">📷 Photo Verified</div>' : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="footer">
            <span>Toggi Fun World • Maintenance &amp; Customer Experience Audit Log</span>
            <span>Page 1 of 1 • System Export</span>
          </div>
        </body>
      </html>
    `;

    if (!printWindow) {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);
          setShowDownloadMenu(false);
          return;
        }
      } catch (e) {}
      showNotice('Please allow popups in your browser to print the audit report.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setShowDownloadMenu(false);
  };

  // Extract tickets according to viewScope & activePortal
  const scopedTickets = useMemo(() => {
    // If viewing Solved specifically via viewScope
    if (viewScope === 'solved') {
      return baseTickets
        .filter(t => t.status === 'solved')
        .filter(t => activePortal === 'cx' ? isCxTicket(t) : (activePortal === 'rides' ? !isCxTicket(t) : true))
        .filter(t => {
          if (solvedDateFrom || solvedDateTo) {
            return isTicketSolvedInRange(t, solvedDateFrom, solvedDateTo);
          }
          return true;
        })
        .sort((a, b) => new Date(b.solvedAt || b.reportedAt || 0).getTime() - new Date(a.solvedAt || a.reportedAt || 0).getTime());
    }

    if (viewScope === 'unresolved') {
      return baseTickets
        .filter(t => {
          if (t.status === 'reported' || t.status === 'in-progress') return true;
          if (t.status === 'solved') {
            if (solvedDateFrom || solvedDateTo) {
              return isTicketSolvedInRange(t, solvedDateFrom, solvedDateTo);
            }
            return isTicketSolvedOnDate(t, todayStr) || isTicketSolvedOnDate(t, selectedDate);
          }
          return false;
        })
        .filter(t => activePortal === 'cx' ? isCxTicket(t) : (activePortal === 'rides' ? !isCxTicket(t) : true))
        .sort((a, b) => new Date(b.reportedAt || 0).getTime() - new Date(a.reportedAt || 0).getTime());
    }

    if (viewScope === 'all') {
      return baseTickets
        .filter(t => activePortal === 'cx' ? isCxTicket(t) : (activePortal === 'rides' ? !isCxTicket(t) : true))
        .filter(t => {
          if (t.status === 'solved' && (solvedDateFrom || solvedDateTo)) {
            return isTicketSolvedInRange(t, solvedDateFrom, solvedDateTo);
          }
          return true;
        })
        .sort((a, b) => new Date(b.reportedAt || 0).getTime() - new Date(a.reportedAt || 0).getTime());
    }

    // viewScope === 'date'
    // Include tickets reported on selectedDate, tickets solved on selectedDate, AND any tickets currently in-progress or reported from other days
    const dayReported = baseTickets.filter(t => t.date === selectedDate);
    const solvedOnDateFromOtherDays = baseTickets.filter(
      t => t.status === 'solved' && t.date !== selectedDate && (
        (solvedDateFrom || solvedDateTo) ? isTicketSolvedInRange(t, solvedDateFrom, solvedDateTo) : isTicketSolvedOnDate(t, selectedDate)
      )
    );
    const activeUnresolvedFromOtherDays = baseTickets.filter(
      t => (t.status === 'in-progress' || t.status === 'reported') && t.date !== selectedDate
    );

    const ticketMap = new Map<string, MaintenanceTicket>();
    [...dayReported, ...solvedOnDateFromOtherDays, ...activeUnresolvedFromOtherDays].forEach(t => {
      if (t && t.id) ticketMap.set(t.id, t);
    });

    return Array.from(ticketMap.values())
      .filter(t => activePortal === 'cx' ? isCxTicket(t) : (activePortal === 'rides' ? !isCxTicket(t) : true))
      .filter(t => {
        if (t.status === 'solved' && (solvedDateFrom || solvedDateTo)) {
          return isTicketSolvedInRange(t, solvedDateFrom, solvedDateTo);
        }
        return true;
      })
      .sort((a, b) => new Date(b.reportedAt || 0).getTime() - new Date(a.reportedAt || 0).getTime());
  }, [baseTickets, selectedDate, viewScope, activePortal, isCxTicket, isTicketSolvedOnDate, isTicketSolvedInRange, solvedDateFrom, solvedDateTo, todayStr]);

  // Filter tickets by search query and category filter
  const filteredTickets = useMemo(() => {
    return scopedTickets.filter(t => {
      if (selectedCategoryFilter !== 'all') {
        const ticketCat = t.feedbackCategory || classifyAmusementParkIssue(t, activeSyncedCategories)?.name;
        if (ticketCat !== selectedCategoryFilter && t.feedbackCategory !== selectedCategoryFilter) {
          return false;
        }
      }
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const rideMatch = t.rideName?.toLowerCase().includes(q);
      const probMatch = t.problem?.toLowerCase().includes(q);
      const repMatch = t.reportedByName?.toLowerCase().includes(q);
      const dateMatch = t.date?.includes(q);
      const notesMatch = t.resolutionNotes?.toLowerCase().includes(q);
      const catMatch = t.feedbackCategory?.toLowerCase().includes(q);
      const guestMatch = t.guestDetails?.toLowerCase().includes(q);
      const techMatch = t.assignedToName?.toLowerCase().includes(q) || 
        t.helperNames?.some(h => h.toLowerCase().includes(q));
      return rideMatch || probMatch || repMatch || techMatch || dateMatch || notesMatch || catMatch || guestMatch;
    });
  }, [scopedTickets, searchQuery, selectedCategoryFilter, activeSyncedCategories]);

  const solved = useMemo(() => filteredTickets.filter(t => t.status === 'solved'), [filteredTickets]);

  const allSolvedTickets = useMemo(() => allTicketsFlat.filter(t => t.status === 'solved'), [allTicketsFlat]);

  const isMatchingAnySolved = useCallback((t: MaintenanceTicket): boolean => {
    if (t.status === 'solved') return true;
    for (const s of allSolvedTickets) {
      if (s.id === t.id) return true;
      if (s.whatsappMessageId && t.whatsappMessageId && s.whatsappMessageId === t.whatsappMessageId) return true;
      // If core ID without date prefix matches a solved ticket
      const tCore = String(t.id).replace(/^\d{4}-\d{2}-\d{2}-/, '');
      const sCore = String(s.id).replace(/^\d{4}-\d{2}-\d{2}-/, '');
      if (tCore && sCore && tCore.length > 8 && tCore === sCore) return true;
    }
    return false;
  }, [allSolvedTickets]);

  const inProgress = useMemo(() => filteredTickets.filter(t => t.status === 'in-progress'), [filteredTickets]);
  const reported = useMemo(() => filteredTickets.filter(t => t.status === 'reported'), [filteredTickets]);

  // Force database re-fetch from server
  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      await database.engine.fetchFullDatabase();
    } catch (e) {
      console.warn('Sync failed:', e);
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  // Handle Photo File Pick and Auto Compression
  const handlePhotoUpload = async (ticketOrId: string | MaintenanceTicket, file: File) => {
    if (!file) return;
    const ticketId = typeof ticketOrId === 'string' ? ticketOrId : ticketOrId.id;
    const ticketObj = typeof ticketOrId === 'object' ? ticketOrId : scopedTickets.find(t => t.id === ticketId);

    setIsCompressingTicketId(ticketId);
    try {
      const compressed = await compressImageToLightweightDataUrl(file);
      setPhotoByTicket(prev => ({
        ...prev,
        [ticketId]: compressed
      }));

      // Immediately persist proof photo to the ticket in database so it is preserved across views/devices
      const dateKey = ticketObj?.date || (ticketObj as any)?._dateKey || selectedDate;
      if (ticketId && dateKey) {
        await database.ref(`data/maintenanceTickets/${dateKey}/${ticketId}`).update({
          solutionImageUrl: compressed.dataUrl,
          photoUrl: compressed.dataUrl
        }).catch((e: any) => console.warn('Sync photo to ticket error:', e));
      }
    } catch (err) {
      console.error('Image compression error:', err);
      showNotice('Could not process this image. Please select a valid photo.');
    } finally {
      setIsCompressingTicketId(null);
    }
  };

  const handleRemovePhoto = (ticketOrId: string | MaintenanceTicket) => {
    const ticketId = typeof ticketOrId === 'string' ? ticketOrId : ticketOrId.id;
    const ticketObj = typeof ticketOrId === 'object' ? ticketOrId : scopedTickets.find(t => t.id === ticketId);

    setPhotoByTicket(prev => {
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });

    const dateKey = ticketObj?.date || (ticketObj as any)?._dateKey || selectedDate;
    if (ticketId && dateKey) {
      database.ref(`data/maintenanceTickets/${dateKey}/${ticketId}`).update({
        solutionImageUrl: null,
        photoUrl: null
      }).catch((e: any) => console.warn('Remove photo from ticket error:', e));
    }
  };

  // Toggle technician selection for a specific ticket
  const handleSetLeadForTicket = (ticketId: string, leadId: number | null) => {
    setSelectedLeadByTicket(prev => ({ ...prev, [ticketId]: leadId }));
    // If the selected lead was in helpers, remove them from helpers
    if (leadId !== null) {
      setSelectedHelpersByTicket(prev => {
        const helpers = prev[ticketId] || [];
        if (helpers.includes(leadId)) {
          return { ...prev, [ticketId]: helpers.filter(id => id !== leadId) };
        }
        return prev;
      });
    }
  };

  const toggleHelperForTicket = (ticketId: string, techId: number) => {
    setSelectedHelpersByTicket(prev => {
      const current = prev[ticketId] || [];
      if (current.includes(techId)) {
        return { ...prev, [ticketId]: current.filter(id => id !== techId) };
      } else {
        return { ...prev, [ticketId]: [...current, techId] };
      }
    });
  };

  const clearTeamForTicket = (ticketId: string) => {
    setSelectedLeadByTicket(prev => ({ ...prev, [ticketId]: null }));
    setSelectedHelpersByTicket(prev => ({ ...prev, [ticketId]: [] }));
  };

  const selectAllHelpersForTicket = (ticketId: string) => {
    const leadId = selectedLeadByTicket[ticketId];
    setSelectedHelpersByTicket(prev => ({
      ...prev,
      [ticketId]: availableTechs.filter(t => t.id !== leadId).map(t => t.id)
    }));
  };

  const toggleTechForTicket = (ticketId: string, techId: number) => {
    toggleHelperForTicket(ticketId, techId);
  };

  // Select all technicians for a ticket
  const selectAllTechsForTicket = (ticketId: string) => {
    selectAllHelpersForTicket(ticketId);
  };

  // Clear technician selection for a ticket
  const clearTechsForTicket = (ticketId: string) => {
    clearTeamForTicket(ticketId);
  };

  // Assign multiple selected technicians and mark as in-progress
  const handleAssignSelectedTechs = (ticket: MaintenanceTicket) => {
    const leadId = selectedLeadByTicket[ticket.id];
    const helperIds = selectedHelpersByTicket[ticket.id] || [];

    if (!leadId && helperIds.length === 0) {
      showNotice('Please select a Lead Technician or at least one Helping Hand to assign.');
      return;
    }

    let primaryTech: Operator | undefined = undefined;
    let helpers: Operator[] = [];

    if (leadId) {
      primaryTech = availableTechs.find(p => p.id === leadId);
      helpers = helperIds
        .filter(id => id !== leadId)
        .map(id => availableTechs.find(p => p.id === id))
        .filter((p): p is Operator => Boolean(p));
    } else {
      const allSelected = helperIds
        .map(id => availableTechs.find(p => p.id === id))
        .filter((p): p is Operator => Boolean(p));
      if (allSelected.length === 0) return;
      primaryTech = allSelected[0];
      helpers = allSelected.slice(1);
    }

    if (!primaryTech) return;

    onUpdateTicketStatus(ticket, 'in-progress', primaryTech, helpers);

    // Seamless sequence transition: if on Reported tab, transition to In Progress (Step 3)
    if (selectedStatusTab === 'reported') {
      handleStatusTabChange('in-progress');
    }

    // Clear local selection for this ticket
    setSelectedLeadByTicket(prev => {
      const next = { ...prev };
      delete next[ticket.id];
      return next;
    });
    setSelectedHelpersByTicket(prev => {
      const next = { ...prev };
      delete next[ticket.id];
      return next;
    });
    setEditingTicketId(null);
  };

  // Start editing team for an in-progress ticket
  const handleStartEditTeam = (ticket: MaintenanceTicket) => {
    setEditingTicketId(ticket.id);
    setSelectedLeadByTicket(prev => ({
      ...prev,
      [ticket.id]: ticket.assignedToId || null
    }));
    const helpers = Array.isArray(ticket.helperIds) ? ticket.helperIds : [];
    setSelectedHelpersByTicket(prev => ({
      ...prev,
      [ticket.id]: helpers.filter(id => id !== ticket.assignedToId)
    }));
  };

  // Save updated team for an in-progress ticket
  const handleSaveTeamEdit = (ticket: MaintenanceTicket) => {
    const leadId = selectedLeadByTicket[ticket.id];
    const helperIds = selectedHelpersByTicket[ticket.id] || [];

    if (!leadId && helperIds.length === 0) {
      showNotice('Please select at least one technician.');
      return;
    }

    let primaryTech: Operator | undefined = undefined;
    let helpers: Operator[] = [];

    if (leadId) {
      primaryTech = availableTechs.find(p => p.id === leadId);
      helpers = helperIds
        .filter(id => id !== leadId)
        .map(id => availableTechs.find(p => p.id === id))
        .filter((p): p is Operator => Boolean(p));
    } else {
      const allSelected = helperIds
        .map(id => availableTechs.find(p => p.id === id))
        .filter((p): p is Operator => Boolean(p));
      if (allSelected.length === 0) return;
      primaryTech = allSelected[0];
      helpers = allSelected.slice(1);
    }

    if (!primaryTech) return;

    onUpdateTicketStatus(ticket, 'in-progress', primaryTech, helpers);
    setEditingTicketId(null);
  };

  // Handle Mark Solved with auto-compressed photo, resolution note & synced KPI category
  const handleMarkSolved = (ticket: MaintenanceTicket) => {
    const notes = resolutionNotesByTicket[ticket.id] || ticket.resolutionNotes || '';
    const assignedTech = availableTechs.find(p => p.id === ticket.assignedToId) || (ticket.assignedToName ? { id: ticket.assignedToId || 'tech', name: ticket.assignedToName, role: 'maintenance' } as Operator : undefined);
    const helpers = ticket.helperIds 
      ? ticket.helperIds.map(id => availableTechs.find(p => p.id === id)).filter((p): p is Operator => Boolean(p))
      : undefined;
    const photoData = 
      photoByTicket[ticket.id]?.dataUrl || 
      ticket.solutionImageUrl || 
      ticket.photoUrl || 
      (Array.isArray(ticket.photos) && ticket.photos[0]) || 
      undefined;

    const autoClassified = classifyAmusementParkIssue(ticket, activeSyncedCategories);
    const chosenCatName = selectedCategoryByTicket[ticket.id] || ticket.feedbackCategory || autoClassified?.name;
    const updatedTicket: MaintenanceTicket = {
      ...ticket,
      ...(chosenCatName ? { feedbackCategory: chosenCatName } : {}),
      ...(photoData ? { solutionImageUrl: photoData, photoUrl: photoData } : {})
    };

    if (chosenCatName && onUpdateTicketCategory) {
      onUpdateTicketCategory(updatedTicket, chosenCatName);
    }

    onUpdateTicketStatus(updatedTicket, 'solved', assignedTech, helpers, notes, photoData, false, 'maintenance-dashboard');

    // Seamless sequence transition: if on In-Progress tab, transition to Solved (Step 4)
    if (selectedStatusTab === 'in-progress') {
      handleStatusTabChange('solved');
    }

    setResolutionNotesByTicket(prev => {
      const next = { ...prev };
      delete next[ticket.id];
      return next;
    });
    setSelectedCategoryByTicket(prev => {
      const next = { ...prev };
      delete next[ticket.id];
      return next;
    });
    setPhotoByTicket(prev => {
      const next = { ...prev };
      delete next[ticket.id];
      return next;
    });
  };

  // Handle Create New Ticket
  const handleCreateNewTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketRideId || !newTicketProblem.trim()) {
      showNotice('Please select a ride and enter issue details.');
      return;
    }
    if (onReportProblem) {
      const isCX = activePortal === 'cx';
      onReportProblem(
        Number(newTicketRideId),
        newTicketProblem.trim(),
        newTicketCategory || (isCX ? 'Guest Feedback' : 'Operational Issue'),
        newTicketPriority,
        newTicketGuestDetails.trim() || undefined,
        isCX ? 'cx' : 'operator'
      );
      setShowNewTicketModal(false);
      setNewTicketRideId('');
      setNewTicketProblem('');
      setNewTicketGuestDetails('');
      setNewTicketPriority('normal');
    }
  };

  const formatDateBadge = (ticketOrDate?: MaintenanceTicket | string) => {
    if (!ticketOrDate) return '';
    const dateStr = typeof ticketOrDate === 'string' ? ticketOrDate : getTicketDate(ticketOrDate);
    if (dateStr === todayStr) return 'Today';
    return dateStr;
  };

  const isCXPortal = activePortal === 'cx';

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Quick Portal Switcher Pills (Hidden for CX and Maintenance roles) */}
      {role !== 'cx' && role !== 'maintenance' && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/80 p-2.5 rounded-2xl border border-gray-700/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-1">
              Active Maintenance Portal:
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleSelectPortal('rides')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 shadow-sm ${
                !isCXPortal
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-red-900/40 ring-2 ring-red-400/40'
                  : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700'
              }`}
            >
              <Gamepad2 className="w-4 h-4 text-blue-300" />
              <span>Tickets & Repairs (Games & Ride Associates)</span>
              {ridesUnresolvedCount > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-red-950/90 text-red-200 border border-red-500/50 font-mono font-black animate-pulse">
                  {ridesUnresolvedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => handleSelectPortal('cx')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 shadow-sm ${
                isCXPortal
                  ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-pink-900/40 ring-2 ring-pink-400/40'
                  : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700'
              }`}
            >
              <HeartHandshake className="w-4 h-4 text-pink-300" />
              <span>Customer Experience (CX)</span>
              {cxUnresolvedCount > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-pink-950/90 text-pink-200 border border-pink-500/50 font-mono font-black animate-pulse">
                  {cxUnresolvedCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Alert banner if on rides portal and there are unresolved CX tickets (Hidden for Maintenance role) */}
      {role !== 'maintenance' && !isCXPortal && cxUnresolvedCount > 0 && (
        <div className="bg-gradient-to-r from-rose-950/80 via-pink-950/50 to-gray-900 border border-rose-800/60 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping flex-shrink-0" />
            <HeartHandshake className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div className="text-xs sm:text-sm text-gray-200">
              <span className="font-bold text-white tracking-tight">
                {cxUnresolvedCount} Customer Experience (CX)
              </span> feedback {cxUnresolvedCount > 1 ? 'tickets require' : 'ticket requires'} maintenance attention.
            </div>
          </div>
          <button
            onClick={() => handleSelectPortal('cx')}
            className="bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all self-end sm:self-auto cursor-pointer"
          >
            <span>Switch to Customer Experience (CX)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header & Controls Bar */}
      <div className={`p-4 sm:p-5 rounded-2xl border shadow-lg flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 ${
        isCXPortal 
          ? 'bg-gradient-to-br from-gray-900 via-gray-850 to-pink-950/30 border-pink-900/40' 
          : 'bg-gray-800 border-gray-700'
      }`}>
        <div>
          <div className="flex items-center gap-2.5">
            <div className={`p-2.5 rounded-xl border shadow-inner ${
              isCXPortal 
                ? 'bg-pink-900/40 text-pink-400 border-pink-800/60' 
                : 'bg-red-900/40 text-red-400 border-red-800/60'
            }`}>
              {isCXPortal ? <HeartHandshake className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {isCXPortal ? 'Customer Experience (CX) — Tickets & Repairs' : 'Tickets & Repairs (Games & Ride Associates)'}
                </h2>
                {totalUnresolvedCount > 0 ? (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold animate-pulse flex items-center gap-1 border ${
                    isCXPortal 
                      ? 'bg-pink-500/20 text-pink-300 border-pink-500/40' 
                      : 'bg-red-500/20 text-red-300 border-red-500/40'
                  }`}>
                    <span className={`w-2 h-2 rounded-full animate-ping ${isCXPortal ? 'bg-pink-500' : 'bg-red-500'}`} />
                    {totalUnresolvedCount} Active
                  </span>
                ) : (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <Check className="w-3 h-3" /> All Operational
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {isCXPortal 
                  ? 'Real-time guest feedback, ride condition complaints, and repair dispatch from the Customer Experience (CX) team' 
                  : 'Real-time ride breakdown monitoring & technical dispatch reported by Games & Ride Associates'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1st Step: Report Issue for Assigned Ride */}
          <button
            onClick={() => setShowNewTicketModal(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-900/40 transition-all active:scale-95"
            title="Report an issue for an assigned ride or game (Games & Ride Associate)"
          >
            <Plus className="w-4 h-4" />
            <span>Report Issue for Assigned Ride</span>
          </button>

          {/* Solved Records Upload by Date Range */}
          <button
            onClick={() => setShowUploadSolvedModal(true)}
            className="flex items-center gap-1.5 bg-teal-800/90 hover:bg-teal-700 text-teal-100 hover:text-white px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border border-teal-600/70 transition-all active:scale-95 shadow-sm"
            title="Upload solved issue records by date range wise"
          >
            <Upload className="w-4 h-4 text-teal-300" />
            <span>Upload Solved (Date Range)</span>
          </button>

          {/* Clear All Maintenance Records */}
          {onClearAllRecords && (
            <button
              onClick={onClearAllRecords}
              className="flex items-center gap-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 hover:text-red-100 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-red-800/60 transition-all active:scale-95 shadow-sm"
              title="Clear all maintenance issue records and start newly from today"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Clear All Records</span>
            </button>
          )}

          {/* Force Sync button with live status */}
          <button
            onClick={handleForceSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 bg-gray-900/80 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold border border-gray-700 transition-all active:scale-95 shadow-sm"
            title="Force refresh tickets from server"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Live Sync'}</span>
          </button>

          {/* Sync Mobile & Desktop (Broadcast View & Date Everywhere) */}
          <button
            onClick={handleSyncAllDevices}
            disabled={isSyncingAll || isSyncing}
            className="flex items-center gap-1.5 bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 hover:text-white px-3 py-2 rounded-xl text-xs font-bold border border-emerald-600/60 transition-all active:scale-95 shadow-sm shadow-emerald-950/30 cursor-pointer disabled:opacity-50"
            title="Sync tickets, date, and maintenance dashboard between mobile & desktop devices simultaneously"
          >
            <Radio className={`w-3.5 h-3.5 text-emerald-300 ${isSyncingAll || isSyncing ? 'animate-ping' : ''}`} />
            <span>{syncFeedback || (isSyncingAll ? 'Syncing...' : 'Sync Mobile & Desktop')}</span>
          </button>

          {/* Mobile QR Scanner Link */}
          <button
            onClick={() => {
              if (onShowModal) onShowModal('share');
              else setShowMobileShare(true);
            }}
            className="flex items-center gap-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 hover:text-blue-100 px-3 py-2 rounded-xl text-xs font-bold border border-blue-700/60 transition-all active:scale-95 shadow-sm cursor-pointer"
            title="Scan QR code to open and sync maintenance dashboard on mobile phone or tablet"
          >
            <QrCode className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Mobile QR</span>
          </button>

          {/* Full Screen Toggle Button */}
          <button
            onClick={handleToggleFullscreen}
            className="flex items-center gap-1.5 bg-gray-900/80 hover:bg-gray-750 text-gray-200 hover:text-white px-3 py-2 rounded-xl text-xs font-bold border border-gray-700/80 transition-all active:scale-95 shadow-sm cursor-pointer hover:border-amber-400/50"
            title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5 text-amber-400" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit Full' : 'Full Screen'}</span>
          </button>

          {/* Date Picker & Today Shortcut */}
          <div className="flex items-center gap-1.5 bg-gray-900/60 border border-gray-700 rounded-xl px-2.5 py-1.5">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => {
                onDateChange(e.target.value);
                if (viewScope !== 'date') handleViewScopeChange('date');
              }} 
              className="bg-transparent text-white text-xs sm:text-sm outline-none cursor-pointer"
            />
            {selectedDate !== todayStr && (
              <button
                onClick={() => {
                  onDateChange(todayStr);
                  handleViewScopeChange('date');
                }}
                className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded-md font-medium transition-colors"
                title="Jump to today"
              >
                Today
              </button>
            )}
          </div>

          {/* Direct Date-Range Solved Button */}
          <button
            onClick={() => setShowDateRangeModal(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600 text-white px-3 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-teal-900/30 border border-teal-500/30 transition-all active:scale-95"
            title="Download or view solved issues filtered by custom date range"
          >
            <CalendarRange className="w-4 h-4 text-emerald-200" />
            <span>Date-Range Solved</span>
          </button>

          {/* Maintenance KPI Dashboard Shortcut Button */}
          {onNavigate && (
            <button
              onClick={() => onNavigate('maintenance-kpi')}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-gray-950 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold shadow-md shadow-amber-900/30 transition-all active:scale-95 cursor-pointer"
              title="Open One-Page Maintenance KPI & Technician Category Matrix Dashboard"
            >
              <Wrench className="w-4 h-4" />
              <span>KPI Dashboard</span>
            </button>
          )}

          {/* Export & Download Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => setShowDownloadMenu(prev => !prev)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-900/30 transition-all active:scale-95"
              title="Download reports or export data"
            >
              <Download className="w-4 h-4" />
              <span>Download / Export</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDownloadMenu ? 'rotate-180' : ''}`} />
            </button>

            {showDownloadMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 backdrop-blur-md">
                <div className="px-3 py-2 border-b border-gray-800 mb-1.5">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                    Maintenance & CX Exports
                  </span>
                  <span className="text-[10px] text-gray-500">
                    Instant CSV and Printable PDF Audit Logs
                  </span>
                </div>

                <div className="space-y-1">
                  {/* Featured Option: Custom Date Range Solved Issues Report */}
                  <button
                    onClick={() => {
                      setShowDownloadMenu(false);
                      setShowDateRangeModal(true);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-950/40 hover:bg-emerald-950/80 border border-emerald-700/50 transition-colors text-left group mb-1"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-emerald-800/80 rounded-lg text-emerald-200">
                        <CalendarRange className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-emerald-200 flex items-center gap-1.5">
                          <span>Date Range Solved Report</span>
                          <span className="text-[9px] bg-emerald-500 text-gray-950 px-1.5 py-0.2 rounded font-extrabold uppercase">Custom Range</span>
                        </div>
                        <div className="text-[10px] text-emerald-400/80">Choose any start & end date (CSV & PDF)</div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  {/* Option 1: Download Solved Issues CSV */}
                  <button
                    onClick={() => downloadTicketsCSV(allSolvedTicketsFlat, 'Maintenance_Solved_Issues')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-gray-200 hover:text-white hover:bg-emerald-950/60 border border-transparent hover:border-emerald-800/60 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-emerald-900/50 rounded-lg text-emerald-400 group-hover:bg-emerald-800/80 transition-colors">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-100">All Solved Issues (CSV)</div>
                        <div className="text-[10px] text-gray-400">Complete resolved maintenance history</div>
                      </div>
                    </div>
                    <span className="text-[10px] bg-emerald-900/70 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                      {allSolvedTicketsFlat.length}
                    </span>
                  </button>

                  {/* Option 2: Download Solved for Selected Date */}
                  <button
                    onClick={() => downloadTicketsCSV(solved, `Solved_Issues_${selectedDate}`)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-gray-200 hover:text-white hover:bg-emerald-950/60 border border-transparent hover:border-emerald-800/60 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-teal-900/50 rounded-lg text-teal-400 group-hover:bg-teal-800/80 transition-colors">
                        <Calendar className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-100">Solved ({selectedDate}) (CSV)</div>
                        <div className="text-[10px] text-gray-400">Selected date resolved tickets</div>
                      </div>
                    </div>
                    <span className="text-[10px] bg-teal-900/70 text-teal-300 px-2 py-0.5 rounded-full font-bold">
                      {solved.length}
                    </span>
                  </button>

                  {/* Option 3: Download Customer Experience (CX) Feedbacks CSV */}
                  <button
                    onClick={() => downloadTicketsCSV(allCxTicketsFlat, 'Customer_Experience_Feedbacks')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-gray-200 hover:text-white hover:bg-pink-950/60 border border-transparent hover:border-pink-800/60 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-pink-900/50 rounded-lg text-pink-400 group-hover:bg-pink-800/80 transition-colors">
                        <HeartHandshake className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-100">Customer Experience (CX) (CSV)</div>
                        <div className="text-[10px] text-gray-400">Guest feedbacks, categories & resolutions</div>
                      </div>
                    </div>
                    <span className="text-[10px] bg-pink-900/70 text-pink-300 px-2 py-0.5 rounded-full font-bold">
                      {allCxTicketsFlat.length}
                    </span>
                  </button>

                  {/* Option 4: Download Solved CX Only */}
                  <button
                    onClick={() => downloadTicketsCSV(allCxSolvedTicketsFlat, 'Customer_Experience_Solved')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-gray-200 hover:text-white hover:bg-pink-950/60 border border-transparent hover:border-pink-800/60 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-rose-900/50 rounded-lg text-rose-400 group-hover:bg-rose-800/80 transition-colors">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-100">CX Solved Issues Only (CSV)</div>
                        <div className="text-[10px] text-gray-400">Resolved guest comfort & safety issues</div>
                      </div>
                    </div>
                    <span className="text-[10px] bg-rose-900/70 text-rose-300 px-2 py-0.5 rounded-full font-bold">
                      {allCxSolvedTicketsFlat.length}
                    </span>
                  </button>

                  {/* Option 5: Download Current View / Filtered Tickets */}
                  <button
                    onClick={() => downloadTicketsCSV(filteredTickets, `Maintenance_Filtered_${portalType}`)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-gray-200 hover:text-white hover:bg-blue-950/60 border border-transparent hover:border-blue-800/60 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-blue-900/50 rounded-lg text-blue-400 group-hover:bg-blue-800/80 transition-colors">
                        <Filter className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-100">Current Filtered View (CSV)</div>
                        <div className="text-[10px] text-gray-400">Currently displayed tickets</div>
                      </div>
                    </div>
                    <span className="text-[10px] bg-blue-900/70 text-blue-300 px-2 py-0.5 rounded-full font-bold">
                      {filteredTickets.length}
                    </span>
                  </button>

                  <div className="border-t border-gray-800 my-1 pt-1">
                    {/* Option 6: Print / Save PDF Audit Report */}
                    <button
                      onClick={() => handlePrintAuditReport(
                        filteredTickets.length > 0 ? filteredTickets : baseTickets,
                        isCXPortal ? 'Customer Experience (CX) Audit & Resolution Report' : 'Ride Maintenance & Breakdown Audit Report',
                        `Comprehensive audit log for ${selectedDate} • Toggi Fun World System`
                      )}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-purple-300 hover:text-white hover:bg-purple-950/60 border border-transparent hover:border-purple-800/60 transition-colors text-left group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-purple-900/50 rounded-lg text-purple-400 group-hover:bg-purple-800/80 transition-colors">
                          <Printer className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-purple-200">Print / PDF Audit Report</div>
                          <div className="text-[10px] text-purple-400/80">Formatted printable summary & table</div>
                        </div>
                      </div>
                      <FileText className="w-3.5 h-3.5 text-purple-400" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {onReportProblem && rides.length > 0 && (
            <button
              onClick={() => {
                setNewTicketCategory(isCXPortal ? 'Guest Comfort & Seating' : 'Operational Issue');
                setShowNewTicketModal(true);
              }}
              className={`text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-95 ${
                isCXPortal
                  ? 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-pink-900/30'
                  : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-900/30'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{isCXPortal ? 'Log CX Feedback / Issue' : 'Report Associate Issue'}</span>
            </button>
          )}

          <button
            onClick={handleSyncAllDevices}
            disabled={isSyncingAll || isSyncing}
            className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white border border-indigo-500/40 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
            title="Force immediate real-time sync of active view and tickets across mobile and desktop devices"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isSyncingAll || isSyncing ? 'animate-spin' : ''}`} />
            <span>{syncFeedback || (isSyncingAll ? 'Syncing...' : 'Sync Mobile & Desktop')}</span>
          </button>

          <div 
            className="bg-emerald-950/60 border border-emerald-700/60 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs text-emerald-300 shadow-sm"
            title="Whapi.cloud Connected (https://gate.whapi.cloud/): Resolved maintenance tickets are automatically broadcasted to the 'TFW Issue Resolve (Tech+ Guest Feedback)' WhatsApp group"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold text-emerald-200 hidden sm:inline">TFW Issue Resolve (Tech+ Guest Feedback)</span>
            <span className="text-[10px] bg-emerald-900/80 px-1.5 py-0.5 rounded text-emerald-300 font-mono font-bold uppercase">Resolved Only</span>
          </div>

          {solved.length > 0 && (
            <button 
              onClick={() => onClearSolved(selectedDate)} 
              className="bg-gray-700/80 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold border border-gray-600 transition-all flex items-center gap-1.5"
              title="Clear all solved tickets for this date"
            >
              <Trash2 className="w-3.5 h-3.5 text-gray-400" />
              <span>Clear Solved ({solved.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Scope Selector: All Unresolved vs Solved vs Selected Date vs All History */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-850/90 p-2.5 rounded-2xl border border-gray-750">
        <div className="flex flex-wrap bg-gray-900/90 p-1 rounded-xl border border-gray-700/80 gap-1">
          <button
            onClick={() => {
              handleViewScopeChange('unresolved');
              if (selectedStatusTab === 'solved') handleStatusTabChange('all');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewScope === 'unresolved'
                ? isCXPortal 
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-900/40'
                  : 'bg-red-600 text-white shadow-md shadow-red-900/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Active & Unresolved ({totalUnresolvedCount})</span>
          </button>
          <button
            onClick={() => {
              handleViewScopeChange('solved');
              handleStatusTabChange('solved');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewScope === 'solved'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>All Solved ({totalSolvedCount})</span>
          </button>
          <button
            onClick={() => {
              onDateChange(todayStr);
              handleViewScopeChange('date');
              handleStatusTabChange('solved');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewScope === 'date' && selectedDate === todayStr && selectedStatusTab === 'solved'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-900/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Today Solved ({solvedTodayCount})</span>
          </button>
          <button
            onClick={() => {
              handleViewScopeChange('date');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewScope === 'date' && (selectedDate !== todayStr || selectedStatusTab !== 'solved')
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Date: {selectedDate === todayStr ? 'Today' : selectedDate}</span>
          </button>
          <button
            onClick={() => handleViewScopeChange('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewScope === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All History ({baseTickets.length})</span>
          </button>
        </div>

        {viewScope === 'unresolved' && totalUnresolvedCount > 0 && (
          <div className="text-xs text-yellow-400 flex items-center gap-1.5 px-3 py-1 bg-yellow-950/40 border border-yellow-800/60 rounded-xl">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            <span>Showing all active issues from all dates so no report is ever missed</span>
          </div>
        )}

        {(viewScope === 'solved' || selectedStatusTab === 'solved') && (
          <div className="text-xs text-emerald-300 flex items-center gap-2 px-3 py-1 bg-emerald-950/40 border border-emerald-800/60 rounded-xl">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Showing all resolved maintenance issues with resolution notes &amp; proof photos</span>
          </div>
        )}
      </div>

      {/* Solved Summary Statistics Bar (when viewing Solved records) */}
      {(viewScope === 'solved' || selectedStatusTab === 'solved') && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-850/70 p-3 rounded-2xl border border-gray-750">
          <div className="bg-gray-900/80 p-3 rounded-xl border border-gray-700/60 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-extrabold text-white">{totalSolvedCount}</div>
              <div className="text-[11px] text-gray-400">Total Solved Issues</div>
            </div>
          </div>

          <div className="bg-gray-900/80 p-3 rounded-xl border border-gray-700/60 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-extrabold text-white">{totalSolvedWithPhotosCount}</div>
              <div className="text-[11px] text-gray-400">With Proof Photos</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onDateChange(todayStr);
              handleViewScopeChange('date');
              handleStatusTabChange('solved');
            }}
            title="Click to view all issues solved today"
            className="bg-gray-900/80 hover:bg-gray-800/90 transition-all p-3 rounded-xl border border-gray-700/60 hover:border-blue-500/50 flex items-center gap-3 text-left cursor-pointer group"
          >
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-105 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-extrabold text-white flex items-center gap-1.5">
                {solvedTodayCount}
                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider bg-blue-500/10 px-1.5 py-0.5 rounded">View</span>
              </div>
              <div className="text-[11px] text-gray-400 group-hover:text-gray-300">Resolved Today</div>
            </div>
          </button>

          <div className="bg-gray-900/80 p-3 rounded-xl border border-gray-700/60 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-extrabold text-white">{availableTechs.length}</div>
              <div className="text-[11px] text-gray-400">Tech Personnel Active</div>
            </div>
          </div>
        </div>
      )}

      {/* Date Range Filter Bar for Solved Issues */}
      {(viewScope === 'solved' || selectedStatusTab === 'solved' || Boolean(solvedDateFrom || solvedDateTo) || showSolvedDateFilter) && (
        <div className="bg-gradient-to-r from-emerald-950/40 via-gray-900/90 to-teal-950/40 border border-emerald-700/50 rounded-2xl p-3.5 sm:p-4 shadow-lg flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <CalendarRange className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                  <span>Filter Solved Issues by Date Range</span>
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                    {solved.length} Solved in Range
                  </span>
                </div>
                <div className="text-[11px] text-gray-400">
                  Select start and end dates to filter and download resolved maintenance issues
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => downloadTicketsCSV(solved, `Solved_Issues_${solvedDateFrom || 'Start'}_to_${solvedDateTo || 'End'}`)}
                disabled={solved.length === 0}
                className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-900/30 transition-all active:scale-95 disabled:pointer-events-none cursor-pointer"
                title="Download CSV for issues in selected date range"
              >
                <Download className="w-4 h-4" />
                <span>Download Solved ({solved.length} CSV)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDateRangeModal(true)}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold border border-gray-700 transition-all cursor-pointer"
                title="Open full audit modal with print PDF and photo proofs"
              >
                <Printer className="w-4 h-4 text-blue-400" />
                <span>Audit / PDF Report</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2 border-t border-gray-800/80">
            {/* From Date */}
            <div className="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700 px-2.5 py-1.5 rounded-xl flex-1 sm:flex-initial">
              <span className="text-[11px] font-bold text-gray-400 uppercase">From:</span>
              <input
                type="date"
                value={solvedDateFrom}
                onChange={(e) => setSolvedDateFrom(e.target.value)}
                className="bg-transparent text-white text-xs outline-none cursor-pointer font-medium"
              />
            </div>

            {/* To Date */}
            <div className="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700 px-2.5 py-1.5 rounded-xl flex-1 sm:flex-initial">
              <span className="text-[11px] font-bold text-gray-400 uppercase">To:</span>
              <input
                type="date"
                value={solvedDateTo}
                onChange={(e) => setSolvedDateTo(e.target.value)}
                className="bg-transparent text-white text-xs outline-none cursor-pointer font-medium"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 flex-wrap flex-1">
              {[
                { label: 'All', from: '', to: '' },
                { label: 'Today', from: todayStr, to: todayStr },
                { label: 'Yesterday', from: getDhakaDateOffset(todayStr, 1), to: getDhakaDateOffset(todayStr, 1) },
                { label: '7 Days', from: getDhakaDateOffset(todayStr, 6), to: todayStr },
                { label: '30 Days', from: getDhakaDateOffset(todayStr, 29), to: todayStr },
                { label: 'This Month', from: `${todayStr.slice(0, 7)}-01`, to: todayStr },
              ].map(p => {
                const isSelected = solvedDateFrom === p.from && solvedDateTo === p.to;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setSolvedDateFrom(p.from);
                      setSolvedDateTo(p.to);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-750 border border-gray-700/60'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}

              {(solvedDateFrom || solvedDateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setSolvedDateFrom('');
                    setSolvedDateTo('');
                  }}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search and Status Tabs Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text"
            placeholder="Search ride, technician, problem, category, note..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 text-white pl-9 pr-3 py-2 rounded-xl border border-gray-700 text-xs sm:text-sm outline-none focus:border-blue-500 placeholder-gray-500"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Tabs */}
        <div className="flex bg-gray-800 p-1 rounded-xl border border-gray-700 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => handleStatusTabChange('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedStatusTab === 'all' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            All ({filteredTickets.length})
          </button>
          <button
            onClick={() => handleStatusTabChange('reported')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              selectedStatusTab === 'reported' 
                ? isCXPortal ? 'bg-pink-900/60 text-pink-200 border border-pink-700/60' : 'bg-red-900/60 text-red-200 border border-red-700/60' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full animate-pulse ${isCXPortal ? 'bg-pink-500' : 'bg-red-500'}`} />
            Reported ({reported.length})
          </button>
          <button
            onClick={() => handleStatusTabChange('in-progress')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              selectedStatusTab === 'in-progress' ? 'bg-yellow-900/60 text-yellow-200 border border-yellow-700/60' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            In Progress ({inProgress.length})
          </button>
          <button
            onClick={() => handleStatusTabChange('solved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              selectedStatusTab === 'solved' ? 'bg-emerald-900/70 text-emerald-200 border border-emerald-600/70 font-bold' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Solved ({solved.length})
          </button>
        </div>
      </div>

      {/* Category Breakdown & Games/Rides Pre-Check Hub (Beside Category) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left: Category (Category-Wise Breakdown) Filter Bar & Visual Cards */}
        <div className="xl:col-span-6 bg-gray-850/95 p-3 sm:p-4 rounded-2xl border border-gray-750 shadow-md space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-200">
                <Tag className="w-3.5 h-3.5 text-indigo-400" />
                <span>Category Breakdown:</span>
              </div>
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="bg-gray-900 text-white rounded-xl px-3 py-1.5 text-xs border border-gray-700 outline-none focus:border-indigo-500 cursor-pointer font-medium max-w-[200px] sm:max-w-[240px] truncate"
              >
                <option value="all">All Categories ({scopedTickets.length})</option>
                {activeSyncedCategories.map(cat => {
                  const countInScope = scopedTickets.filter(t => (t.feedbackCategory || classifyAmusementParkIssue(t, activeSyncedCategories)?.name) === cat.name).length;
                  return (
                    <option key={cat.id} value={cat.name}>
                      {cat.code}: {cat.name} ({countInScope})
                    </option>
                  );
                })}
              </select>

              {selectedCategoryFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('all')}
                  className="text-xs text-amber-300 hover:text-amber-200 underline font-semibold ml-1 cursor-pointer"
                >
                  Reset
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowCategoryCards(prev => !prev)}
                className="text-[11px] font-semibold text-gray-400 hover:text-white px-2 py-1 rounded-lg bg-gray-900/80 hover:bg-gray-800 border border-gray-700 transition-colors flex items-center gap-1 cursor-pointer ml-auto sm:ml-0"
                title="Toggle visual category chips"
              >
                <Layers className="w-3 h-3 text-indigo-400" />
                <span>{showCategoryCards ? 'Hide' : 'Cards'}</span>
              </button>
            </div>

            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('maintenance-kpi')}
                className="text-[11px] font-bold text-indigo-300 hover:text-indigo-200 bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-750/70 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm flex-shrink-0"
                title="Open KPI Category Portal"
              >
                <Tag className="w-3 h-3 text-indigo-400" />
                <span>KPI Portal</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Visual Category-Wise Breakdown Grid (5 Fixed Categories) */}
          {showCategoryCards && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-gray-750/80">
              {activeSyncedCategories.map(cat => {
                const IconComp = cat.icon;
                const inScopeIssues = scopedTickets.filter(t => (t.feedbackCategory || classifyAmusementParkIssue(t, activeSyncedCategories)?.name) === cat.name);
                const solvedCount = inScopeIssues.filter(t => t.status === 'solved').length;
                const isSelected = selectedCategoryFilter === cat.name;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(prev => (prev === cat.name ? 'all' : cat.name))}
                    className={`text-left p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? `${cat.accentBg} ${cat.accentBorder} ring-2 ring-indigo-400/70 shadow-sm`
                        : 'bg-gray-900/80 hover:bg-gray-800/90 border-gray-750/80 text-gray-300'
                    }`}
                    title={`Filter by: ${cat.name}`}
                  >
                    <div className="flex items-start justify-between gap-1.5 mb-1">
                      <div className={`p-1 rounded-lg ${cat.accentBg} border ${cat.accentBorder}`}>
                        <IconComp className={`w-3 h-3 ${cat.accentText}`} />
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-white font-mono">{inScopeIssues.length}</span>
                        <span className="block text-[8px] text-gray-400 uppercase font-mono">
                          {solvedCount} Solved
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-mono font-bold text-gray-400">{cat.code}</div>
                      <div className="text-[11px] font-bold text-white line-clamp-1" title={cat.name}>
                        {cat.shortName || cat.name}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Beside of Category - Games and Rides List with Level Filter & Pre-Check */}
        <div className="xl:col-span-6 bg-gray-850/95 p-3 sm:p-4 rounded-2xl border border-gray-750 shadow-md space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-2 border-b border-gray-750">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-950/80 border border-indigo-700/60 text-indigo-400">
                <Gamepad2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <span>Games & Rides Pre-Check List</span>
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 font-mono">
                    {levelPreCheckStats.completed}/{levelPreCheckStats.total} Pre-Checked
                  </span>
                </h3>
                <p className="text-[10px] text-gray-400">Select level to view games & click to fill pre-check sign-off</p>
              </div>
            </div>

            {/* Level / Floor Selector Dropdown */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <span className="text-[11px] font-bold text-gray-300 flex-shrink-0">Level:</span>
              <select
                value={selectedPreCheckLevel}
                onChange={(e) => setSelectedPreCheckLevel(e.target.value)}
                className="bg-gray-900 text-white rounded-xl px-2.5 py-1 text-xs border border-gray-700 outline-none focus:border-indigo-500 cursor-pointer font-bold flex-1 sm:w-36"
              >
                <option value="all">🏢 All Levels ({rides.length})</option>
                {availableLevels.map(lvl => {
                  const countOnLevel = rides.filter(r => (r.floor || '').trim() === lvl).length;
                  return (
                    <option key={lvl} value={lvl}>
                      {lvl} ({countOnLevel})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Search bar inside pre-check hub */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={`Search ${levelFilteredRides.length} games on ${selectedPreCheckLevel === 'all' ? 'all levels' : selectedPreCheckLevel}...`}
                value={preCheckSearch}
                onChange={(e) => setPreCheckSearch(e.target.value)}
                className="w-full bg-gray-900 text-white text-xs pl-8 pr-2.5 py-1.5 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none placeholder-gray-500"
              />
            </div>
            {preCheckSearch && (
              <button
                type="button"
                onClick={() => setPreCheckSearch('')}
                className="text-[10px] text-gray-400 hover:text-white px-2 py-1 bg-gray-800 rounded-lg"
              >
                Clear
              </button>
            )}
          </div>

          {/* Level Filtered Games and Rides List */}
          <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1 custom-scrollbar">
            {levelFilteredRides.map(ride => {
              const pc = ridePreChecks?.[selectedDate]?.[ride.id];
              const isPassed = pc?.status === 'completed';
              const isFlagged = pc?.status === 'flagged';
              const assignedIds = normalizeAssigneeIds(dailyAssignments?.[selectedDate]?.[ride.id] || dailyAssignments?.[selectedDate]?.[String(ride.id)]);
              const assignedOps = assignedIds.map(id => operators.find(o => Number(o.id) === id)).filter(Boolean) as Operator[];

              return (
                <div
                  key={ride.id}
                  onClick={() => handleOpenPreCheckModal(ride)}
                  className="group bg-gray-900/80 hover:bg-gray-800/90 border border-gray-750 hover:border-indigo-500/60 p-2.5 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm"
                  title={`Click to fill/view pre-checked details for ${ride.name}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-sm font-bold flex-shrink-0 group-hover:scale-105 transition-transform">
                      🎮
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                          {ride.name}
                        </h4>
                        {ride.floor && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 border border-gray-700">
                            {ride.floor}
                          </span>
                        )}
                      </div>
                      {assignedOps.length > 0 && (
                        <div className="text-[11px] text-indigo-300/90 flex items-center gap-1 mt-0.5 truncate">
                          <span className="text-gray-400 font-normal">Associate:</span>
                          <span className="font-semibold text-white">{assignedOps.map(o => o.name).join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                    {isPassed ? (
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-700/80">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Pre-Checked
                        </span>
                        <span className="block text-[9px] text-emerald-400/90 font-mono mt-0.5">
                          {pc.srTechnicianName ? `${pc.srTechnicianName.split(' ')[0]} • ` : ''}{pc.requiredTimeMinutes || 15}m
                        </span>
                      </div>
                    ) : isFlagged ? (
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950/90 text-red-300 border border-red-700/80">
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          Flagged
                        </span>
                        <span className="block text-[9px] text-red-400/80 font-mono mt-0.5">Defect noted</span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/70 group-hover:bg-amber-900 transition-colors">
                        <Clock className="w-3 h-3 text-amber-400" />
                        Pre-Check Pending
                      </span>
                    )}

                    <span className="text-gray-500 group-hover:text-indigo-400 transition-colors text-xs font-bold pl-1">
                      →
                    </span>
                  </div>
                </div>
              );
            })}

            {levelFilteredRides.length === 0 && (
              <div className="py-8 text-center text-gray-500 text-xs italic bg-gray-900/50 rounded-xl border border-gray-800">
                No games found on {selectedPreCheckLevel === 'all' ? 'the selected filter' : selectedPreCheckLevel}.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Daily Pre-Check & Sr. Technician / Foreman Sign-off Modal */}
      {selectedPreCheckRide && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-3 sm:p-4 backdrop-blur-sm animate-fade-in-up">
          <div className="bg-gray-850 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-gray-700/80 flex justify-between items-center bg-gray-900/90">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-950/90 border border-indigo-700/60 flex items-center justify-center text-xl text-indigo-400">
                  🎮
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                      {selectedPreCheckRide.name}
                    </h3>
                    {selectedPreCheckRide.floor && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700 font-semibold">
                        {selectedPreCheckRide.floor}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Daily Pre-Opening Safety Inspection & Maintenance Sign-Off ({selectedDate})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPreCheckRide(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSavePreCheckForm} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
              {/* Senior Technician / Foreman Selector & Required Time Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-900/70 p-4 rounded-xl border border-gray-750">
                {/* 1. Sr. Technician / Foreman Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-indigo-300 mb-1.5 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Senior Technician / Foreman Name:</span>
                  </label>
                  <select
                    value={preCheckSrTech}
                    onChange={(e) => setPreCheckSrTech(e.target.value)}
                    className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-xs border border-gray-700 focus:border-indigo-500 outline-none cursor-pointer font-semibold mb-2"
                  >
                    <option value="">Select Technician / Foreman...</option>
                    {maintenancePersonnel.map(p => (
                      <option key={p.id} value={`${p.name} (${p.role || 'Foreman'})`}>
                        {p.name} — {p.role || 'Maintenance Technician'}
                      </option>
                    ))}
                    <option value="custom">✏️ Other / Custom Name...</option>
                  </select>

                  {(!preCheckSrTech || preCheckSrTech === 'custom' || !maintenancePersonnel.some(p => `${p.name} (${p.role || 'Foreman'})` === preCheckSrTech)) && (
                    <input
                      type="text"
                      placeholder="Type Senior Technician / Foreman name..."
                      value={preCheckSrTech === 'custom' ? '' : preCheckSrTech}
                      onChange={(e) => setPreCheckSrTech(e.target.value)}
                      className="w-full bg-gray-800 text-white text-xs px-3 py-2 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none placeholder-gray-500 font-medium"
                      required
                    />
                  )}
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    Foreman responsible for physical pre-operation inspection.
                  </span>
                </div>

                {/* 2. Required Time to fill pre-checked */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-teal-300 mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal-400" />
                    <span>Required Time to Fill Pre-Checked:</span>
                  </label>

                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {[10, 15, 20, 25, 30, 45, 60].map(mins => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setPreCheckRequiredTime(mins)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          Number(preCheckRequiredTime) === mins
                            ? 'bg-teal-600 text-white shadow'
                            : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-750 border border-gray-700'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="180"
                      value={preCheckRequiredTime}
                      onChange={(e) => setPreCheckRequiredTime(Math.max(1, parseInt(e.target.value) || 0))}
                      className="w-24 bg-gray-800 text-white text-xs font-mono font-bold px-3 py-2 rounded-xl border border-gray-700 focus:border-teal-500 outline-none text-center"
                    />
                    <span className="text-xs text-gray-300 font-medium">Minutes spent on pre-check</span>
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    Duration required to complete checklist & cycle run.
                  </span>
                </div>
              </div>

              {/* Pre-Check Inspection Checklist Options */}
              <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-750 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-750 pb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
                      Pre-Opening Inspection Checklist Options:
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const allChecked = Object.values(preCheckList).every(Boolean);
                      setPreCheckList({
                        powerBreakers: !allChecked,
                        emergencyStop: !allChecked,
                        safetyRestraints: !allChecked,
                        mechanicalTracks: !allChecked,
                        sensorsLimit: !allChecked,
                        audioLightingFX: !allChecked,
                        testCycleRun: !allChecked
                      });
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-semibold cursor-pointer"
                  >
                    {Object.values(preCheckList).every(Boolean) ? 'Uncheck All' : 'Check All ✓'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { key: 'powerBreakers', label: '1. Power Supply, Breakers & Voltage Checked', desc: 'Main isolators and operating voltage within threshold' },
                    { key: 'emergencyStop', label: '2. Emergency Stop (E-Stop) Tested & Responsive', desc: 'Instantaneous cutoff verified at console and ride area' },
                    { key: 'safetyRestraints', label: '3. Safety Harnesses, Lap Bars & Restraints', desc: 'Pneumatic locks, seatbelts and latches secure' },
                    { key: 'mechanicalTracks', label: '4. Drive Chain, Gears, Tracks & Hydraulics', desc: 'No oil leaks, chain tension normal, fluid levels checked' },
                    { key: 'sensorsLimit', label: '5. Proximity Sensors & Limit Switches Tested', desc: 'Photo-eyes clean and aligned, sensors responding' },
                    { key: 'audioLightingFX', label: '6. Audio, Lighting FX & Reader Operational', desc: 'Operator console sounds, lighting cues and card readers work' },
                    { key: 'testCycleRun', label: '7. Full Test Cycle / Dry Run Completed', desc: '1 complete cycle run with zero fault codes or vibration' }
                  ].map(item => (
                    <label
                      key={item.key}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                        preCheckList[item.key]
                          ? 'bg-emerald-950/40 border-emerald-700/60 text-white'
                          : 'bg-gray-800/60 border-gray-700/80 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(preCheckList[item.key])}
                        onChange={(e) => setPreCheckList(prev => ({ ...prev, [item.key]: e.target.checked }))}
                        className="w-4 h-4 mt-0.5 rounded border-gray-600 text-emerald-500 focus:ring-0 cursor-pointer accent-emerald-500"
                      />
                      <div className="flex-1">
                        <span className="text-xs font-bold block">{item.label}</span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">{item.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status and Observations */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">
                    Pre-Check Status:
                  </label>
                  <select
                    value={preCheckStatus}
                    onChange={(e: any) => setPreCheckStatus(e.target.value)}
                    className={`w-full font-bold text-xs rounded-xl px-3 py-2 border outline-none cursor-pointer ${
                      preCheckStatus === 'completed'
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
                        : preCheckStatus === 'flagged'
                        ? 'bg-red-950/80 text-red-300 border-red-600'
                        : 'bg-amber-950/80 text-amber-300 border-amber-600'
                    }`}
                  >
                    <option value="completed">✅ Completed (Operational)</option>
                    <option value="in-progress">⏱️ In Progress (Ongoing)</option>
                    <option value="flagged">⚠️ Flagged (Defect Found)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">
                    Foreman Observations & Remarks (Optional):
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Safety latch lubricated, ride tested 1 cycle with zero error. Cleared for guests."
                    value={preCheckNotes}
                    onChange={(e) => setPreCheckNotes(e.target.value)}
                    className="w-full bg-gray-800 text-white text-xs px-3 py-2 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none placeholder-gray-500 font-medium"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-700/80 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPreCheckRide(null)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Certify & Save Pre-Check</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Strict Workflow Sequence Banner */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-850 to-gray-900 border border-gray-750/90 rounded-2xl p-3 sm:p-3.5 shadow-md flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Maintenance Workflow Sequence
          </div>
          <span className="text-xs text-gray-400">
            Sequential Ride Maintenance Process • Solved records saved permanently
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] font-semibold text-gray-300 overflow-x-auto max-w-full py-0.5">
          <button 
            onClick={() => setShowNewTicketModal(true)}
            className="flex items-center gap-1 bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 border border-blue-700/60 px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors"
            title="Step 1: Click to report issue for assigned ride"
          >
            <Plus className="w-3 h-3 text-blue-400" />
            <span>1st: Report Issue (Associate)</span>
          </button>
          <span className="text-gray-500">→</span>
          <button
            onClick={() => handleStatusTabChange('reported')}
            className="flex items-center gap-1 bg-yellow-950/60 hover:bg-yellow-900/80 text-yellow-300 border border-yellow-700/60 px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors"
            title="Step 2: View reported issues queue"
          >
            <AlertTriangle className="w-3 h-3 text-yellow-400" />
            <span>2nd: Reported Issues ({reported.length})</span>
          </button>
          <span className="text-gray-500">→</span>
          <button
            onClick={() => handleStatusTabChange('in-progress')}
            className="flex items-center gap-1 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-700/60 px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors"
            title="Step 3: Maintenance concern picking up repairs"
          >
            <Wrench className="w-3 h-3 text-indigo-400" />
            <span>3rd: In Progress ({inProgress.length})</span>
          </button>
          <span className="text-gray-500">→</span>
          <button
            onClick={() => handleStatusTabChange('solved')}
            className="flex items-center gap-1 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors"
            title="Step 4: Solved and saved permanently"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>4th: Solved ({solved.length})</span>
          </button>
          <span className="text-gray-500">→</span>
          <button
            onClick={() => setShowUploadSolvedModal(true)}
            className="flex items-center gap-1 bg-teal-950/60 hover:bg-teal-900/80 text-teal-300 border border-teal-700/60 px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors"
            title="Step 5: Bulk upload solved records by date range wise"
          >
            <Upload className="w-3 h-3 text-teal-400" />
            <span>5th: Upload Solved (Date Range)</span>
          </button>
        </div>
      </div>

      {/* Mobile Column Quick Jump & View Switcher - Always accessible on mobile */}
      <div className="lg:hidden flex items-center justify-between gap-1 p-2 bg-gray-900/95 rounded-2xl border border-gray-750 shadow-lg text-xs sticky top-16 z-30 backdrop-blur-md">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Column:</span>
        <div className="flex items-center gap-1.5 flex-1 justify-end overflow-x-auto">
          <button
            type="button"
            onClick={() => handleStatusTabChange('all')}
            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] whitespace-nowrap transition-all active:scale-95 ${
              selectedStatusTab === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40 ring-1 ring-blue-400'
                : 'bg-gray-800 text-gray-300 border border-gray-700'
            }`}
          >
            All ({filteredTickets.length})
          </button>
          <button
            type="button"
            onClick={() => handleStatusTabChange('reported')}
            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] whitespace-nowrap transition-all flex items-center gap-1.5 active:scale-95 ${
              selectedStatusTab === 'reported'
                ? isCXPortal
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-900/40 ring-1 ring-pink-400'
                  : 'bg-red-600 text-white shadow-md shadow-red-900/40 ring-1 ring-red-400'
                : isCXPortal
                  ? 'bg-pink-950/60 text-pink-300 border border-pink-800/60 font-semibold'
                  : 'bg-red-950/60 text-red-300 border border-red-800/60 font-semibold'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${selectedStatusTab === 'reported' ? 'bg-white' : 'bg-red-400 animate-pulse'}`} />
            Reported ({reported.length})
          </button>
          <button
            type="button"
            onClick={() => handleStatusTabChange('in-progress')}
            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] whitespace-nowrap transition-all flex items-center gap-1.5 active:scale-95 ${
              selectedStatusTab === 'in-progress'
                ? 'bg-yellow-600 text-white shadow-md shadow-yellow-900/40 ring-1 ring-yellow-400'
                : 'bg-yellow-950/60 text-yellow-300 border border-yellow-800/60 font-semibold'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${selectedStatusTab === 'in-progress' ? 'bg-white' : 'bg-yellow-400 animate-pulse'}`} />
            In Progress ({inProgress.length})
          </button>
          <button
            type="button"
            onClick={() => handleStatusTabChange('solved')}
            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] whitespace-nowrap transition-all flex items-center gap-1.5 active:scale-95 ${
              selectedStatusTab === 'solved'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40 ring-1 ring-emerald-400'
                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 font-semibold'
            }`}
          >
            Resolved ({solved.length})
          </button>
        </div>
      </div>

      {/* 3-Column Ticket Board: Unified responsive grid on both desktop & mobile */}
      <div className={selectedStatusTab === 'all' 
        ? "grid grid-cols-1 lg:grid-cols-3 gap-6 pb-6" 
        : "grid grid-cols-1 gap-6 pb-6"}>
        {/* 1. REPORTED COLUMN */}
        {(selectedStatusTab === 'all' || selectedStatusTab === 'reported') && (
          <div id="col-reported" className={`w-full bg-gray-800/60 rounded-2xl p-4 border border-gray-700/80 border-t-4 flex flex-col min-h-[350px] sm:min-h-[400px] ${
            isCXPortal ? 'border-t-pink-500' : 'border-t-red-500'
          }`}>
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-700/60">
              <div className="flex items-center gap-2">
                {isCXPortal ? <HeartHandshake className="w-5 h-5 text-pink-400" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
                <h3 className="font-bold text-base text-gray-100">
                  {isCXPortal ? 'Reported CX Feedbacks & Issues' : 'Reported Issues (Associates)'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {/* Audible alert status & test button */}
                <button
                  type="button"
                  onClick={handleToggleSound}
                  className={`text-[11px] px-2 py-0.5 rounded-lg transition-all flex items-center gap-1 border cursor-pointer ${
                    soundMuted
                      ? 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700'
                      : 'bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border-amber-800/80 shadow-sm'
                  }`}
                  title={soundMuted ? 'Notification sound is muted. Click to turn sound ON.' : 'Audible sound alert is ACTIVE for reported issues. Click to test chime or mute.'}
                >
                  {soundMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  )}
                  <span className="hidden sm:inline font-semibold">{soundMuted ? 'Sound Off' : 'Sound Alert'}</span>
                </button>

                {onClearReported && reported.length > 0 && (
                  <button
                    onClick={() => onClearReported(selectedDate)}
                    className="text-[11px] px-2 py-0.5 bg-gray-800 hover:bg-red-900/50 text-gray-300 hover:text-red-200 rounded-lg transition-colors flex items-center gap-1 border border-gray-700 hover:border-red-700"
                    title="Clear all reported issues for this date"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                    <span>Clear All</span>
                  </button>
                )}
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  isCXPortal ? 'bg-pink-900/50 text-pink-300 border-pink-800/80' : 'bg-red-900/50 text-red-300 border-red-800/80'
                }`}>
                  {reported.length}
                </span>
              </div>
            </div>

            <div className="space-y-4 flex-grow">
              {reported.map(ticket => {
                const selectedTechIds = selectedTechsByTicket[ticket.id] || [];
                const isSelectedAny = selectedTechIds.length > 0;
                const isFromCX = isCxTicket(ticket);

                return (
                  <div key={ticket.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-md hover:border-gray-600 transition-all">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <div className="flex flex-col">
                        {editingRideTicketId === ticket.id ? (
                          <div className="flex items-center gap-1.5 py-0.5">
                            <select
                              value={ticket.rideId}
                              onChange={(e) => {
                                const selected = (rides || []).find(r => r.id === Number(e.target.value));
                                if (selected) {
                                  handleUpdateRideTag(ticket, selected.id, selected.name);
                                }
                              }}
                              className="text-xs bg-gray-900 text-blue-300 border border-blue-500 rounded px-2 py-1 outline-none font-bold"
                              autoFocus
                            >
                              {(rides || []).map(r => (
                                <option key={r.id} value={r.id}>
                                  {r.floor ? `[${r.floor}] ` : ''}{r.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => setEditingRideTicketId(null)}
                              className="text-xs text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <span className="font-bold text-base text-blue-400 leading-tight">{ticket.rideName}</span>
                            <button
                              onClick={() => setEditingRideTicketId(ticket.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-gray-500 hover:text-blue-300 rounded hover:bg-gray-700/50"
                              title="Edit / Re-tag ride or game name"
                            >
                              <Tag className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {/* Reporter & Source Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {isWhatsAppTicket(ticket) ? (
                            <span className="text-[10px] bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <MessageCircle className="w-2.5 h-2.5 text-emerald-400" /> {ticket.whatsappGroup || 'TFW Issue Resolve (Tech+ Guest Feedback)'}
                            </span>
                          ) : isFromCX ? (
                            <span className="text-[10px] bg-rose-950/90 text-rose-200 border border-rose-500/70 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-sm">
                              <HeartHandshake className="w-3 h-3 text-rose-400" /> Customer Experience (CX)
                            </span>
                          ) : (
                            <span className="text-[10px] bg-blue-950/80 text-blue-300 border border-blue-800/70 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <Gamepad2 className="w-2.5 h-2.5 text-blue-400" /> Games & Ride Associate
                            </span>
                          )}

                          {(() => {
                            const rawCat = ticket.feedbackCategory;
                            const resolvedName = (rawCat && rawCat !== 'Operational Issue')
                              ? rawCat
                              : (classifyAmusementParkIssue(ticket, activeSyncedCategories)?.name || rawCat || 'General Maintenance');
                            const catDef = activeSyncedCategories.find(c => c.name === resolvedName);
                            return (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1 border ${
                                  catDef
                                    ? `${catDef.accentBg} ${catDef.accentText} ${catDef.accentBorder}`
                                    : 'bg-purple-950/70 text-purple-300 border-purple-800/60'
                                }`}
                                title={`KPI Portal Category: ${resolvedName}`}
                              >
                                <Tag className="w-2.5 h-2.5" />
                                <span>{catDef?.code ? `${catDef.code}: ` : ''}{catDef?.shortName || resolvedName}</span>
                              </span>
                            );
                          })()}

                          {ticket.priority && ticket.priority !== 'normal' && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider flex items-center gap-0.5 ${
                              ticket.priority === 'urgent' 
                                ? 'bg-red-600 text-white animate-pulse' 
                                : 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                            }`}>
                              <Flame className="w-2.5 h-2.5" />
                              {ticket.priority}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          {ticket.date && (
                            <span className="text-[10px] text-amber-300 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded font-mono">
                              {formatDateBadge(ticket)}
                            </span>
                          )}
                          {onDeleteTicket && (
                            <button
                              onClick={() => onDeleteTicket(ticket)}
                              className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-950/40 rounded transition-colors"
                              title="Delete / discard this reported issue"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-400 bg-gray-900/80 px-2 py-0.5 rounded font-mono whitespace-nowrap flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-500" />
                          {formatDhakaTime(ticket.reportedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Problem Description */}
                    <div className={`p-2.5 rounded-lg mb-3 border ${
                      isFromCX 
                        ? 'bg-rose-950/25 border-rose-900/50 shadow-inner' 
                        : 'bg-red-950/30 border-red-900/50'
                    }`}>
                      {isFromCX && (
                        <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-rose-900/40">
                          <span className="text-[10px] uppercase tracking-wider font-black text-rose-400 flex items-center gap-1">
                            <HeartHandshake className="w-3 h-3 text-rose-400" /> Customer Experience (CX) Feedback
                          </span>
                          {ticket.feedbackCategory && (
                            <span className="text-[10px] bg-rose-900/60 text-rose-200 border border-rose-700/60 px-1.5 py-0.2 rounded font-semibold ml-auto">
                              {ticket.feedbackCategory}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-xs sm:text-sm text-gray-200 leading-relaxed font-medium">{ticket.problem}</p>
                      
                      {ticket.guestDetails && (
                        <div className="mt-1.5 pt-1.5 border-t border-rose-900/40 text-[11px] text-rose-300 flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3 text-rose-400 flex-shrink-0" />
                          <span>Guest Note / Details: <strong>{ticket.guestDetails}</strong></span>
                        </div>
                      )}

                      <div className="text-[11px] text-gray-400 mt-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1 flex-wrap">
                          <span>Reported by:</span>
                          <strong className={isFromCX ? "text-rose-300 font-bold" : "text-gray-300 font-semibold"}>
                            {ticket.reportedByName || (isFromCX ? 'Customer Experience (CX)' : 'Games & Ride Associate')}
                          </strong>
                          {ticket.reportedByRole && !isFromCX && (
                            <span className="text-[10px] text-blue-300/80 font-normal">({ticket.reportedByRole})</span>
                          )}
                          {isFromCX && (
                            <span className="text-[10px] text-rose-400 font-semibold">(Customer Experience Team)</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Assigned Team: Filter Options for Lead and Helping Hand (Multi-select) */}
                    <div className="mt-3 pt-2.5 border-t border-gray-700/80 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-blue-400" />
                          <span>Assigned Team:</span>
                        </label>
                        {(selectedLeadByTicket[ticket.id] || (selectedHelpersByTicket[ticket.id] || []).length > 0) && (
                          <button
                            type="button"
                            onClick={() => clearTeamForTicket(ticket.id)}
                            className="text-[11px] text-gray-400 hover:text-gray-200 underline"
                          >
                            Reset Team
                          </button>
                        )}
                      </div>

                      {/* Filter Option 1: Lead Engineer / Technician (Single Select Dropdown) */}
                      <div className="bg-gray-900/80 p-2.5 rounded-xl border border-blue-500/30">
                        <label className="block text-[10px] font-bold text-blue-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <UserCheck className="w-3 h-3 text-blue-400" />
                            Lead Engineer / Technician:
                          </span>
                          {selectedLeadByTicket[ticket.id] && (
                            <span className="text-[10px] text-emerald-400 font-semibold truncate max-w-[150px]">
                              {availableTechs.find(p => p.id === selectedLeadByTicket[ticket.id])?.name}
                            </span>
                          )}
                        </label>
                        <select
                          value={selectedLeadByTicket[ticket.id] || ''}
                          onChange={(e) => handleSetLeadForTicket(ticket.id, e.target.value ? Number(e.target.value) : null)}
                          className="w-full bg-gray-950 text-white rounded-lg px-2.5 py-1.5 text-xs border border-gray-700 outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value="">-- Choose Lead Engineer / Technician --</option>
                          {availableTechs.map(tech => (
                            <option key={tech.id} value={tech.id}>
                              {tech.name} ({tech.role || 'Tech'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Filter Option 2: Helping Hand (Multiple Selection Filter Option) */}
                      <div className="bg-gray-900/80 p-2.5 rounded-xl border border-indigo-500/30">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                            <Users className="w-3 h-3 text-indigo-400" />
                            <span>Helping Hand (Multiple Selection):</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-indigo-300 font-mono font-bold bg-indigo-950/80 px-1.5 py-0.2 rounded border border-indigo-800/60">
                              {(selectedHelpersByTicket[ticket.id] || []).length} Chosen
                            </span>
                            {availableTechs.length > 2 && (
                              <button
                                type="button"
                                onClick={() => selectAllHelpersForTicket(ticket.id)}
                                className="text-[10px] text-indigo-400 hover:text-indigo-200 underline cursor-pointer"
                              >
                                All
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Helping Hand Multi-Select Buttons Grid */}
                        <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1 scrollbar-thin">
                          {availableTechs.map(tech => {
                            const isLead = selectedLeadByTicket[ticket.id] === tech.id;
                            const isHelper = (selectedHelpersByTicket[ticket.id] || []).includes(tech.id);
                            return (
                              <button
                                key={tech.id}
                                type="button"
                                disabled={isLead}
                                onClick={() => toggleHelperForTicket(ticket.id, tech.id)}
                                className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium flex items-center justify-between transition-all text-left ${
                                  isLead
                                    ? 'bg-gray-850 text-gray-500 border-gray-800 opacity-60 cursor-not-allowed'
                                    : isHelper
                                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                                    : 'bg-gray-750 text-gray-300 border-gray-650 hover:bg-gray-700'
                                }`}
                                title={isLead ? `${tech.name} is selected as Lead` : `Toggle ${tech.name} as Helping Hand`}
                              >
                                <span className="truncate">{tech.name}</span>
                                {isLead ? (
                                  <span className="text-[9px] uppercase font-bold text-blue-400 ml-1">Lead</span>
                                ) : isHelper ? (
                                  <Check className="w-3 h-3 flex-shrink-0 ml-1 text-white" />
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Action Button: Assign Selected Team & Start Work */}
                      {(() => {
                        const curLeadId = selectedLeadByTicket[ticket.id];
                        const curHelperIds = selectedHelpersByTicket[ticket.id] || [];
                        const curLeadTech = curLeadId ? availableTechs.find(p => p.id === curLeadId) : undefined;
                        const hasAnySelection = Boolean(curLeadId || curHelperIds.length > 0);

                        return (
                          <button
                            type="button"
                            disabled={!hasAnySelection}
                            onClick={() => handleAssignSelectedTechs(ticket)}
                            className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 ${
                              hasAnySelection
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/40 cursor-pointer'
                                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>
                              {!hasAnySelection
                                ? 'Select Lead or Helping Hand Above'
                                : curLeadTech
                                ? `Assign Lead (${curLeadTech.name}) ${curHelperIds.length > 0 ? `+ ${curHelperIds.length} Helping Hand${curHelperIds.length > 1 ? 's' : ''}` : ''} & Start Work`
                                : `Assign ${curHelperIds.length} Helping Hand${curHelperIds.length > 1 ? 's' : ''} & Start Work`}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}

              {reported.length === 0 && (
                <div className="text-center py-10 px-4 text-gray-500 bg-gray-850/40 rounded-xl border border-gray-800 border-dashed">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-gray-600 mb-2" />
                  <p className="text-sm font-medium">No reported issues</p>
                  <p className="text-xs text-gray-600 mt-1">All rides operating normally</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. IN-PROGRESS COLUMN */}
        {(selectedStatusTab === 'all' || selectedStatusTab === 'in-progress') && (
          <div id="col-in-progress" className="w-full bg-gray-800/60 rounded-2xl p-4 border border-gray-700/80 border-t-4 border-t-yellow-500 flex flex-col min-h-[350px] sm:min-h-[400px]">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-700/60">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-400" />
                <h3 className="font-bold text-base text-gray-100">In Progress</h3>
              </div>
              <span className="bg-yellow-900/50 text-yellow-300 border border-yellow-800/80 px-2.5 py-0.5 rounded-full text-xs font-bold">
                {inProgress.length}
              </span>
            </div>

            <div className="space-y-4 flex-grow">
              {inProgress.map(ticket => {
                const isEditingThis = editingTicketId === ticket.id;
                const editSelectedIds = selectedTechsByTicket[ticket.id] || [];
                const isFromCX = isCxTicket(ticket);

                const allAssignedNames: string[] = [];
                if (ticket.assignedToName) allAssignedNames.push(ticket.assignedToName);
                if (ticket.helperNames && Array.isArray(ticket.helperNames)) {
                  ticket.helperNames.forEach(name => {
                    if (!allAssignedNames.includes(name)) allAssignedNames.push(name);
                  });
                }

                return (
                  <div key={ticket.id} className="bg-gray-800 rounded-xl p-4 border border-yellow-700/50 shadow-md">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <div className="flex flex-col">
                        <span className="font-bold text-base text-yellow-400 leading-tight">{ticket.rideName}</span>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {isWhatsAppTicket(ticket) ? (
                            <span className="text-[10px] bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <MessageCircle className="w-2.5 h-2.5 text-emerald-400" /> {ticket.whatsappGroup || 'TFW Issue Resolve (Tech+ Guest Feedback)'}
                            </span>
                          ) : isFromCX ? (
                            <span className="text-[10px] bg-rose-950/90 text-rose-200 border border-rose-500/70 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-sm">
                              <HeartHandshake className="w-3 h-3 text-rose-400" /> Customer Experience (CX)
                            </span>
                          ) : (
                            <span className="text-[10px] bg-blue-950/80 text-blue-300 border border-blue-800/70 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <Gamepad2 className="w-2.5 h-2.5 text-blue-400" /> Associate
                            </span>
                          )}

                          {ticket.feedbackCategory && (
                            <span className="text-[10px] bg-purple-950/70 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded-md font-medium">
                              {ticket.feedbackCategory}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {ticket.date && (
                          <span className="text-[10px] text-amber-300 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded font-mono">
                            {formatDateBadge(ticket)}
                          </span>
                        )}
                        <span className="text-[11px] text-yellow-300 bg-yellow-950/80 px-2 py-0.5 rounded font-mono whitespace-nowrap flex items-center gap-1">
                          <Clock className="w-3 h-3 text-yellow-400" />
                          {ticket.inProgressAt ? formatDhakaTime(ticket.inProgressAt) : 'Working'}
                        </span>
                      </div>
                    </div>

                    {/* Problem */}
                    <div className={`p-2.5 rounded-lg mb-3 border ${
                      isFromCX ? 'bg-rose-950/20 border-rose-900/50' : 'bg-gray-900/60 border-gray-750'
                    }`}>
                      {isFromCX && (
                        <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-rose-900/40">
                          <span className="text-[10px] uppercase tracking-wider font-extrabold text-rose-400 flex items-center gap-1">
                            <HeartHandshake className="w-3 h-3 text-rose-400" /> Customer Experience (CX) Feedback
                          </span>
                        </div>
                      )}
                      <p className="text-xs sm:text-sm text-gray-200 leading-relaxed">{ticket.problem}</p>
                      {ticket.guestDetails && (
                        <div className="mt-1.5 pt-1.5 border-t border-rose-900/40 text-[11px] text-rose-300 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-rose-400" />
                          <span>Guest: <strong>{ticket.guestDetails}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Assigned Tech Team Section */}
                    <div className="bg-gray-900/60 p-2.5 rounded-lg mb-3 border border-gray-750">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-yellow-400" />
                          Assigned Team ({allAssignedNames.length}):
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditingThis) {
                              setEditingTicketId(null);
                            } else {
                              handleStartEditTeam(ticket);
                            }
                          }}
                          className="text-[11px] text-blue-400 hover:text-blue-300 underline font-medium"
                        >
                          {isEditingThis ? 'Cancel Edit' : 'Edit Team'}
                        </button>
                      </div>

                      {/* Editing Team Selection Mode (Lead + Helping Hand) */}
                      {isEditingThis ? (
                        <div className="space-y-2 pt-1 border-t border-gray-700">
                          {/* Lead Selection */}
                          <div>
                            <label className="block text-[10px] font-bold text-blue-300 uppercase tracking-wider mb-1">
                              Lead Engineer / Technician:
                            </label>
                            <select
                              value={selectedLeadByTicket[ticket.id] || ''}
                              onChange={(e) => handleSetLeadForTicket(ticket.id, e.target.value ? Number(e.target.value) : null)}
                              className="w-full bg-gray-950 text-white rounded-lg px-2.5 py-1.5 text-xs border border-gray-700 outline-none focus:border-blue-500"
                            >
                              <option value="">-- Choose Lead --</option>
                              {availableTechs.map(tech => (
                                <option key={tech.id} value={tech.id}>
                                  {tech.name} ({tech.role || 'Tech'})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Helping Hand (Multiple Selection) */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                                Helping Hand (Multiple Selection):
                              </label>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {(selectedHelpersByTicket[ticket.id] || []).length} Selected
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
                              {availableTechs.map(tech => {
                                const isLead = selectedLeadByTicket[ticket.id] === tech.id;
                                const isHelper = (selectedHelpersByTicket[ticket.id] || []).includes(tech.id);
                                return (
                                  <button
                                    key={tech.id}
                                    type="button"
                                    disabled={isLead}
                                    onClick={() => toggleHelperForTicket(ticket.id, tech.id)}
                                    className={`text-xs px-2 py-1.5 rounded-lg border font-medium flex items-center justify-between transition-all ${
                                      isLead
                                        ? 'bg-gray-800/60 text-gray-500 border-gray-800 opacity-60 cursor-not-allowed'
                                        : isHelper
                                        ? 'bg-indigo-600 text-white border-indigo-400'
                                        : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-650'
                                    }`}
                                  >
                                    <span className="truncate">{tech.name}</span>
                                    {isLead ? (
                                      <span className="text-[9px] uppercase font-bold text-blue-400">Lead</span>
                                    ) : isHelper ? (
                                      <Check className="w-3 h-3 flex-shrink-0 text-white" />
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSaveTeamEdit(ticket)}
                            className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          >
                            Save Assigned Team
                          </button>
                        </div>
                      ) : (
                        /* Standard View of Assigned Team */
                        <div className="flex flex-wrap gap-1.5">
                          {allAssignedNames.length > 0 ? (
                            allAssignedNames.map((name, idx) => (
                              <span 
                                key={idx} 
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-yellow-900/30 text-yellow-200 border border-yellow-700/60 font-semibold"
                              >
                                <UserCheck className="w-3 h-3 text-yellow-400" />
                                {name}
                                {idx === 0 && <span className="text-[10px] text-yellow-400/80 font-normal">(Lead)</span>}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500 italic">No technicians listed</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Photo Attachment & Auto-Compression Area */}
                    <div className="bg-gray-900/60 p-2.5 rounded-lg mb-3 border border-gray-750">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          <Camera className="w-3.5 h-3.5 text-yellow-400" />
                          Repair Photo (WhatsApp Proof):
                        </span>
                        {isCompressingTicketId === ticket.id && (
                          <span className="text-[11px] text-yellow-400 animate-pulse flex items-center gap-1 font-medium">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Compressing...
                          </span>
                        )}
                      </div>

                      {/* Hidden File Input (Gallery / File picker) */}
                      <input 
                        id={`photo-input-${ticket.id}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoUpload(ticket, file);
                          e.target.value = '';
                        }}
                      />

                      {/* Hidden Camera Input (Opens phone camera directly on mobile) */}
                      <input 
                        id={`photo-camera-${ticket.id}`}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoUpload(ticket, file);
                          e.target.value = '';
                        }}
                      />

                      {/* If Photo is Selected or Attached */}
                      {(photoByTicket[ticket.id]?.dataUrl || ticket.solutionImageUrl || ticket.photoUrl) ? (
                        <div className="space-y-2">
                          <div className="relative group rounded-xl overflow-hidden border border-emerald-600/60 bg-emerald-950/20 flex items-center gap-3 p-2.5 shadow-sm">
                            <img 
                              src={photoByTicket[ticket.id]?.dataUrl || ticket.solutionImageUrl || ticket.photoUrl} 
                              alt="Repair Preview"
                              className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-emerald-500/50 flex-shrink-0 cursor-pointer hover:opacity-90 hover:scale-105 transition-all shadow-md"
                              onClick={() => {
                                const url = photoByTicket[ticket.id]?.dataUrl || ticket.solutionImageUrl || ticket.photoUrl || '';
                                setLightboxPhoto({
                                  url,
                                  rideName: ticket.rideName,
                                  problem: ticket.problem,
                                  resolutionNotes: resolutionNotesByTicket[ticket.id] || ticket.resolutionNotes,
                                  date: ticket.date,
                                  techNames: allAssignedNames
                                });
                              }}
                            />
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Photo Attached • Ready for WhatsApp</span>
                              </div>
                              
                              <p className="text-[10px] text-gray-300 font-mono mt-0.5">
                                {photoByTicket[ticket.id] ? (
                                  <>
                                    Size: <strong>{photoByTicket[ticket.id].sizeKb} KB</strong>
                                    {photoByTicket[ticket.id].originalSizeKb ? (
                                      <span className="text-gray-400"> (from {photoByTicket[ticket.id].originalSizeKb} KB)</span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span>Cloud attached proof</span>
                                )}
                              </p>

                              <div className="flex flex-wrap gap-1.5 mt-2">
                                <label
                                  htmlFor={`photo-camera-${ticket.id}`}
                                  className="text-[10px] px-2 py-0.5 rounded bg-gray-750 hover:bg-gray-700 text-yellow-300 border border-yellow-700/50 cursor-pointer font-medium flex items-center gap-1 active:scale-95 transition-all"
                                  title="Retake photo using camera"
                                >
                                  <Camera className="w-2.5 h-2.5" /> Retake
                                </label>
                                <label
                                  htmlFor={`photo-input-${ticket.id}`}
                                  className="text-[10px] px-2 py-0.5 rounded bg-gray-750 hover:bg-gray-700 text-gray-200 border border-gray-650 cursor-pointer font-medium flex items-center gap-1 active:scale-95 transition-all"
                                  title="Change photo from gallery"
                                >
                                  <ImageIcon className="w-2.5 h-2.5" /> Change
                                </label>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhoto(ticket)}
                                  className="text-[10px] px-2 py-0.5 rounded bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-800/60 font-medium active:scale-95 transition-all"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Dual Camera / Gallery Upload Trigger Buttons */
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-2 gap-2">
                            <label 
                              htmlFor={`photo-camera-${ticket.id}`}
                              className="cursor-pointer group flex items-center justify-center gap-2 p-2 rounded-xl border border-yellow-600/40 hover:border-yellow-400 bg-yellow-950/20 hover:bg-yellow-900/30 transition-all select-none text-center active:scale-95"
                              title="Take repair photo using camera"
                            >
                              <Camera className="w-4 h-4 text-yellow-400 group-hover:scale-110 transition-transform" />
                              <div className="text-left">
                                <div className="text-[11px] font-bold text-yellow-300">Take Photo</div>
                                <div className="text-[9px] text-gray-400">Camera</div>
                              </div>
                            </label>

                            <label 
                              htmlFor={`photo-input-${ticket.id}`}
                              className="cursor-pointer group flex items-center justify-center gap-2 p-2 rounded-xl border border-blue-600/40 hover:border-blue-400 bg-blue-950/20 hover:bg-blue-900/30 transition-all select-none text-center active:scale-95"
                              title="Select repair photo from gallery or files"
                            >
                              <ImageIcon className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                              <div className="text-left">
                                <div className="text-[11px] font-bold text-blue-300">Choose File</div>
                                <div className="text-[9px] text-gray-400">Gallery</div>
                              </div>
                            </label>
                          </div>
                          <div className="text-[9.5px] text-gray-400 text-center flex items-center justify-center gap-1 font-medium">
                            <Sparkles className="w-2.5 h-2.5 text-yellow-400" />
                            <span>Auto-compressed (&lt;40KB) &amp; posted to WhatsApp group when resolved</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Problem Solved Category (Category-Wise Amusement Park Problem Solved Breakdown) */}
                    <div className="space-y-2 pt-2 border-t border-gray-700/80">
                      <div className="bg-gray-900/70 p-2.5 rounded-xl border border-indigo-500/30">
                        <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-indigo-400" />
                            Category (Category-Wise Breakdown):
                          </span>
                          <span className="text-[9px] text-indigo-300 bg-indigo-950/80 border border-indigo-700/60 px-1.5 py-0.2 rounded font-mono">
                            {activeSyncedCategories.length} Categories (KPI Portal)
                          </span>
                        </label>
                        <select
                          value={
                            selectedCategoryByTicket[ticket.id] ||
                            (activeSyncedCategories.some(c => c.name === ticket.feedbackCategory)
                              ? ticket.feedbackCategory
                              : classifyAmusementParkIssue(ticket, activeSyncedCategories)?.name || '')
                          }
                          onChange={(e) => {
                            const newCat = e.target.value;
                            // Only update local selection for this ticket; do NOT trigger live sync to KPI until marked solved
                            setSelectedCategoryByTicket(prev => ({ ...prev, [ticket.id]: newCat }));
                          }}
                          className="w-full bg-gray-950 text-white rounded-lg px-2.5 py-2 text-xs border border-gray-700 outline-none focus:border-indigo-500 cursor-pointer font-medium"
                        >
                          {activeSyncedCategories.map(cat => (
                            <option key={cat.id} value={cat.name}>
                              {cat.code}: {cat.name}
                            </option>
                          ))}
                        </select>

                        {/* Active Category Preview Chip with KPI styling and icon */}
                        {(() => {
                          const currentSelectedName =
                            selectedCategoryByTicket[ticket.id] ||
                            (activeSyncedCategories.some(c => c.name === ticket.feedbackCategory)
                              ? ticket.feedbackCategory
                              : classifyAmusementParkIssue(ticket, activeSyncedCategories)?.name || '');
                          const currentCatDef = activeSyncedCategories.find(c => c.name === currentSelectedName);
                          if (!currentCatDef) return null;
                          const IconComp = currentCatDef.icon;
                          return (
                            <div className={`mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] ${currentCatDef.accentBg} ${currentCatDef.accentBorder} ${currentCatDef.accentText}`}>
                              <IconComp className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="font-bold">{currentCatDef.code}:</span>
                              <span className="truncate">{currentCatDef.name}</span>
                            </div>
                          );
                        })()}
                      </div>
                      <input
                        type="text"
                        placeholder="Resolution note (e.g. part replaced, sensor recalibrated, tested OK)..."
                        value={resolutionNotesByTicket[ticket.id] || ''}
                        onChange={(e) => setResolutionNotesByTicket({ ...resolutionNotesByTicket, [ticket.id]: e.target.value })}
                        className="w-full bg-gray-900/80 text-white rounded-lg px-2.5 py-1.5 text-xs border border-gray-700 outline-none focus:border-green-500 placeholder-gray-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleMarkSolved(ticket)}
                          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 ${
                            (photoByTicket[ticket.id]?.dataUrl || ticket.solutionImageUrl || ticket.photoUrl)
                              ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white ring-2 ring-emerald-400/50 shadow-emerald-950/40'
                              : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white'
                          }`}
                          title="Mark issue resolved and notify TFW Issue Resolve (Tech+ Guest Feedback) WhatsApp group"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                          <span>
                            {photoByTicket[ticket.id]?.dataUrl || ticket.solutionImageUrl || ticket.photoUrl
                              ? 'Resolve & Notify WhatsApp (Photo 📸)'
                              : 'Resolve & Notify WhatsApp Group'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateTicketStatus(ticket, 'reported')}
                          className="px-2.5 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-xs font-medium transition-colors active:scale-95"
                          title="Move back to reported"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-[10px] font-medium pt-0.5">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        {(photoByTicket[ticket.id]?.dataUrl || ticket.solutionImageUrl || ticket.photoUrl) ? (
                          <span className="text-emerald-300 font-semibold">
                            📸 Repair photo &amp; report will be posted to "TFW Issue Resolve (Tech+ Guest Feedback)" WhatsApp group
                          </span>
                        ) : (
                          <span className="text-emerald-400/90">
                            Only resolved issues are posted to "TFW Issue Resolve (Tech+ Guest Feedback)" WhatsApp group
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {inProgress.length === 0 && (
                <div className="text-center py-10 px-4 text-gray-500 bg-gray-850/40 rounded-xl border border-gray-800 border-dashed">
                  <Clock className="w-8 h-8 mx-auto text-gray-600 mb-2" />
                  <p className="text-sm font-medium">No repairs in progress</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. SOLVED COLUMN / DEDICATED SOLVED VIEW */}
        {(selectedStatusTab === 'all' || selectedStatusTab === 'solved') && (
          <div id="col-resolved" className="w-full bg-gray-800/60 rounded-2xl p-4 border border-gray-700/80 border-t-4 border-t-emerald-500 flex flex-col min-h-[350px] sm:min-h-[400px]">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-700/60">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-gray-100">
                  {selectedStatusTab === 'solved' || viewScope === 'solved' ? 'Resolved Issues & Fix Proofs' : 'Resolved Records'}
                </h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowSolvedDateFilter(prev => !prev)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 border font-semibold active:scale-95 shadow-sm cursor-pointer ${
                    (showSolvedDateFilter || solvedDateFrom || solvedDateTo)
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-900/30'
                      : 'bg-gray-750 hover:bg-gray-700 text-gray-300 hover:text-white border-gray-650'
                  }`}
                  title="Filter solved issues by date range"
                >
                  <CalendarRange className="w-3.5 h-3.5 text-emerald-300" />
                  <span>{(solvedDateFrom || solvedDateTo) ? 'Date Filter Active' : 'Date Range'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDateRangeModal(true)}
                  className="text-xs px-2.5 py-1 bg-gray-750 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-all flex items-center gap-1.5 border border-gray-650 font-semibold active:scale-95 shadow-sm cursor-pointer"
                  title="Open date range report and audit modal"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-400" />
                  <span>Audit / PDF</span>
                </button>

                {solved.length > 0 && (
                  <button
                    onClick={() => downloadTicketsCSV(solved, `Maintenance_Solved_${(solvedDateFrom || solvedDateTo) ? `${solvedDateFrom || 'Start'}_to_${solvedDateTo || 'End'}` : (selectedDate || 'Records')}`)}
                    className="text-xs px-2.5 py-1 bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 hover:text-white rounded-lg transition-all flex items-center gap-1.5 border border-emerald-700/80 font-bold active:scale-95 shadow-sm cursor-pointer"
                    title="Download solved issues for current view as CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Download CSV ({solved.length})</span>
                  </button>
                )}
                <span className="bg-emerald-900/50 text-emerald-300 border border-emerald-800/80 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {solved.length} Solved
                </span>
                {solved.length > 0 && selectedDate && (
                  <button
                    onClick={() => onClearSolved(selectedDate)}
                    className="text-[11px] px-2 py-1 bg-gray-750 hover:bg-gray-700 text-gray-300 hover:text-red-300 rounded-lg transition-colors flex items-center gap-1 border border-gray-650"
                    title="Clear solved tickets for selected date"
                  >
                    <Trash2 className="w-3 h-3 text-gray-400" />
                    <span>Clear Date</span>
                  </button>
                )}
              </div>
            </div>

            <div className={selectedStatusTab === 'solved' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-grow' : 'space-y-4 flex-grow'}>
              {solved.map(ticket => {
                const isFromCX = isCxTicket(ticket);
                const allAssignedNames: string[] = [];
                if (ticket.assignedToName) allAssignedNames.push(ticket.assignedToName);
                if (ticket.helperNames && Array.isArray(ticket.helperNames)) {
                  ticket.helperNames.forEach(name => {
                    if (!allAssignedNames.includes(name)) allAssignedNames.push(name);
                  });
                }

                const photoUrl = ticket.solutionImageUrl || ticket.photoUrl;
                const turnaround = formatTurnaroundDuration(ticket.reportedAt, ticket.solvedAt);

                return (
                  <div key={ticket.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700/80 shadow-md hover:border-emerald-700/60 transition-all flex flex-col justify-between">
                    <div>
                      {/* Header */}
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <div>
                          <span className="font-bold text-base text-gray-100 leading-tight block">{ticket.rideName}</span>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            {isWhatsAppTicket(ticket) ? (
                              <span className="text-[10px] bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <MessageCircle className="w-2.5 h-2.5 text-emerald-400" /> {ticket.whatsappGroup || 'TFW Issue Resolve (Tech+ Guest Feedback)'}
                              </span>
                            ) : isFromCX ? (
                              <span className="text-[10px] bg-rose-950/90 text-rose-200 border border-rose-500/70 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-sm">
                                <HeartHandshake className="w-3 h-3 text-rose-400" /> Customer Experience (CX)
                              </span>
                            ) : (
                              <span className="text-[10px] bg-blue-950/80 text-blue-300 border border-blue-800/70 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <Gamepad2 className="w-2.5 h-2.5 text-blue-400" /> Associate
                              </span>
                            )}

                            {onUpdateTicketCategory ? (
                              <select
                                value={
                                  activeSyncedCategories.some(c => c.name === ticket.feedbackCategory)
                                    ? ticket.feedbackCategory
                                    : classifyAmusementParkIssue(ticket, activeSyncedCategories)?.name || ''
                                }
                                onChange={(e) => onUpdateTicketCategory(ticket, e.target.value)}
                                title="Problem Solved Category (Synced with Maintenance KPI Dashboard)"
                                className="text-[10px] bg-indigo-950/80 text-indigo-200 border border-indigo-700/70 px-2 py-0.5 rounded-md font-semibold outline-none focus:border-indigo-400 cursor-pointer max-w-[230px] truncate"
                              >
                                {activeSyncedCategories.map(cat => (
                                  <option key={cat.id} value={cat.name} className="bg-gray-900 text-white">
                                    {cat.code}: {cat.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              ticket.feedbackCategory && (
                                <span className="text-[10px] bg-purple-950/70 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded-md font-medium">
                                  {ticket.feedbackCategory}
                                </span>
                              )
                            )}
                          </div>
                          {ticket.date && (
                            <span className="text-[10px] text-gray-400 font-mono mt-1 block">
                              Date: {formatDateBadge(ticket)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[11px] text-emerald-400 bg-emerald-950/70 border border-emerald-800/60 px-2 py-0.5 rounded font-bold whitespace-nowrap flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-400" />
                            Resolved
                          </span>
                          {turnaround && (
                            <span className="text-[10px] text-yellow-400 bg-yellow-950/40 border border-yellow-800/40 px-1.5 py-0.2 rounded font-mono flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              Fixed in {turnaround}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Problem Description */}
                      <div className={`p-2.5 rounded-lg mb-2 border ${
                        isFromCX ? 'bg-rose-950/20 border-rose-900/50' : 'bg-gray-900/60 border-gray-750'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Reported Issue:</span>
                          {isFromCX && (
                            <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                              <HeartHandshake className="w-3 h-3" /> Customer Experience (CX)
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-gray-300 leading-relaxed font-medium">{ticket.problem}</p>
                        {ticket.guestDetails && (
                          <div className="mt-1 text-[11px] text-rose-300 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3 text-rose-400" />
                            <span>Guest: <strong>{ticket.guestDetails}</strong></span>
                          </div>
                        )}
                      </div>

                      {/* Resolution Photo Card (if attached) */}
                      {photoUrl ? (
                        <div className="mb-2 p-2 bg-emerald-950/20 rounded-xl border border-emerald-800/50 hover:border-emerald-500/80 flex items-center justify-between gap-3 transition-all shadow-sm">
                          <div 
                            onClick={() => setLightboxPhoto({
                              url: photoUrl,
                              rideName: ticket.rideName,
                              problem: ticket.problem,
                              resolutionNotes: ticket.resolutionNotes,
                              date: ticket.date,
                              techNames: allAssignedNames
                            })}
                            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer group"
                          >
                            <img 
                              src={photoUrl} 
                              alt="Solution Proof" 
                              className="w-14 h-14 rounded-lg object-cover border border-emerald-700/60 group-hover:scale-105 transition-transform flex-shrink-0" 
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                                <Camera className="w-3.5 h-3.5" />
                                <span>Proof of Fix Photo</span>
                              </div>
                              <p className="text-[11px] text-gray-400 group-hover:text-emerald-300 flex items-center gap-1 mt-0.5 font-medium">
                                Click to view full photo <Maximize2 className="w-2.5 h-2.5" />
                              </p>
                            </div>
                          </div>

                          <a
                            href={photoUrl}
                            download={`Proof_${ticket.rideName.replace(/\s+/g, '_')}_${ticket.date || todayStr}.jpg`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 bg-gray-800 hover:bg-emerald-700 text-gray-300 hover:text-white rounded-lg border border-gray-700 hover:border-emerald-600 transition-colors shadow-sm flex items-center gap-1 text-xs"
                            title="Download proof photo directly"
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-400" />
                          </a>
                        </div>
                      ) : (
                        <div className="mb-2 p-1.5 bg-gray-900/30 rounded-lg border border-gray-800 text-[11px] text-gray-500 flex items-center gap-1">
                          <Camera className="w-3 h-3 text-gray-600" />
                          <span>No photo attached with fix</span>
                        </div>
                      )}

                      {/* Resolution Notes */}
                      {ticket.resolutionNotes && (
                        <div className="bg-emerald-950/30 border border-emerald-900/50 p-2 rounded-lg mb-2 text-xs text-emerald-300">
                          <strong className="text-emerald-400">Resolution Note: </strong> {ticket.resolutionNotes}
                        </div>
                      )}

                      {/* Solved Team Roster */}
                      <div className="mb-2 p-2 bg-gray-900/50 rounded-lg text-xs border border-gray-750">
                        <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1 font-semibold uppercase tracking-wider">
                          <Users className="w-3 h-3 text-emerald-400" />
                          Resolved By Team:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {allAssignedNames.length > 0 ? (
                            allAssignedNames.map((name, idx) => (
                              <span key={idx} className="text-[11px] bg-gray-750 text-gray-200 px-2 py-0.5 rounded border border-gray-650">
                                {name}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-500 italic">Maintenance Technician</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Timestamps & Reopen Action */}
                    <div className="pt-2 border-t border-gray-700/60 mt-2">
                      <div className="text-[11px] text-gray-400 flex justify-between items-center mb-2">
                        <span>Reported by: <strong className="text-gray-300">{ticket.reportedByName}</strong></span>
                        {ticket.solvedAt && (
                          <span className="text-emerald-400 font-mono">
                            Solved: {formatDhakaTime(ticket.solvedAt)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-xs mt-1">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <span>Saved Record • Cleared &amp; WhatsApp Notified</span>
                        </div>
                        <span className="text-[10px] text-emerald-400/80 font-mono bg-emerald-900/40 px-1.5 py-0.5 rounded border border-emerald-700/40 font-bold uppercase">Archived</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {solved.length === 0 && (
                <div className="col-span-full text-center py-12 px-4 text-gray-400 bg-gray-850/40 rounded-xl border border-gray-800 border-dashed">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/40 mb-2" />
                  <p className="text-sm font-semibold text-gray-300">No resolved maintenance issues found</p>
                  <p className="text-xs text-gray-500 mt-1">
                    When technicians resolve reported problems, they will appear here with timestamps, proof photos, and technician notes.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Full-Screen Photo Lightbox Modal */}
      {lightboxPhoto && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-md animate-fade-in-up">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Lightbox Header */}
            <div className="p-4 bg-gray-850 border-b border-gray-750 flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-green-400" />
                  <span>{lightboxPhoto.rideName} — Repair Photo</span>
                </h4>
                {lightboxPhoto.date && (
                  <p className="text-xs text-gray-400 font-mono mt-0.5">Date: {lightboxPhoto.date}</p>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <a 
                  href={lightboxPhoto.url} 
                  download={`maintenance-${lightboxPhoto.rideName.replace(/\s+/g, '_')}.jpg`}
                  className="p-2 rounded-lg bg-gray-750 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                  title="Download Image"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxPhoto(null)}
                  className="p-2 rounded-lg bg-gray-750 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Lightbox Image Viewport */}
            <div className="p-4 bg-black/70 flex items-center justify-center overflow-auto flex-grow max-h-[55vh]">
              <img 
                src={lightboxPhoto.url} 
                alt="Full resolution repair solution"
                className="max-h-[50vh] w-auto max-w-full object-contain rounded-xl shadow-lg border border-gray-800" 
              />
            </div>

            {/* Lightbox Footer Details */}
            <div className="p-4 bg-gray-850 border-t border-gray-750 text-xs space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="font-bold text-gray-400">Problem:</span>
                <span className="text-gray-200">{lightboxPhoto.problem}</span>
              </div>

              {lightboxPhoto.resolutionNotes && (
                <div className="flex items-start gap-2 text-green-300">
                  <span className="font-bold text-green-400">Resolution:</span>
                  <span>{lightboxPhoto.resolutionNotes}</span>
                </div>
              )}

              {lightboxPhoto.techNames && lightboxPhoto.techNames.length > 0 && (
                <div className="flex items-center gap-1.5 text-gray-400 pt-1">
                  <Users className="w-3 h-3 text-yellow-400" />
                  <span>Team: <strong className="text-gray-300">{lightboxPhoto.techNames.join(', ')}</strong></span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Maintenance / CX Ticket Modal */}
      {showNewTicketModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in-up">
          <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-lg overflow-hidden">
            <div className={`p-5 border-b border-gray-700 flex justify-between items-center ${
              isCXPortal ? 'bg-gradient-to-r from-pink-950/60 to-gray-900' : 'bg-gray-900/60'
            }`}>
              <div className="flex items-center gap-2">
                {isCXPortal ? <HeartHandshake className="w-5 h-5 text-pink-400" /> : <Wrench className="w-5 h-5 text-red-400" />}
                <h3 className="text-lg font-bold text-white">
                  {isCXPortal ? 'Log Customer Experience (CX) Issue' : 'Report Associate Issue (Games & Rides)'}
                </h3>
              </div>
              <button 
                onClick={() => setShowNewTicketModal(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewTicket} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  Select Ride / Attraction:
                </label>
                <select
                  required
                  value={newTicketRideId}
                  onChange={(e) => setNewTicketRideId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-gray-700 text-white rounded-xl p-3 border border-gray-600 outline-none focus:border-blue-500 text-sm"
                >
                  <option value="">-- Choose a Ride / Attraction --</option>
                  {rides.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.floor || 'Main'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-pink-400" />
                  <span>{isCXPortal ? 'Feedback / Issue Category:' : 'Technical Subsystem Category:'}</span>
                </label>
                <select
                  value={newTicketCategory}
                  onChange={(e) => setNewTicketCategory(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-xl p-3 border border-gray-600 outline-none focus:border-pink-500 text-sm"
                >
                  {isCXPortal ? (
                    CX_FEEDBACK_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))
                  ) : (
                    <>
                      {activeSyncedCategories.map(cat => (
                        <option key={cat.id} value={cat.name}>
                          {cat.code}: {cat.name}
                        </option>
                      ))}
                      <option value="Operational Issue">General Operational Issue (Auto-Classify)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  Priority Level:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['normal', 'high', 'urgent'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewTicketPriority(p)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold uppercase transition-all ${
                        newTicketPriority === p
                          ? p === 'urgent'
                            ? 'bg-red-600 text-white shadow-md'
                            : p === 'high'
                            ? 'bg-orange-600 text-white shadow-md'
                            : 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  {isCXPortal ? 'Customer Feedback / Issue Description:' : 'Problem Description:'}
                </label>
                <textarea
                  required
                  rows={3}
                  value={newTicketProblem}
                  onChange={(e) => setNewTicketProblem(e.target.value)}
                  placeholder={
                    isCXPortal 
                      ? "Describe guest feedback or observed condition (e.g. cabin AC warm, seat belt stuck, harness sensor alert, ride rattling, sound clipping)..."
                      : "Describe the issue (e.g. sound sensor loose, hydraulic pressure error, emergency stop switch error)..."
                  }
                  className={`w-full bg-gray-700 text-white rounded-xl p-3 border border-gray-600 outline-none text-sm placeholder-gray-400 resize-none ${
                    isCXPortal ? 'focus:border-pink-500' : 'focus:border-red-500'
                  }`}
                />
              </div>

              {isCXPortal && (
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-pink-400" />
                    <span>Guest Details / Cabin / Seat # (Optional):</span>
                  </label>
                  <input
                    type="text"
                    value={newTicketGuestDetails}
                    onChange={(e) => setNewTicketGuestDetails(e.target.value)}
                    placeholder="e.g. Guest Cabin #4 / Seat 2B / Family of 4 feedback"
                    className="w-full bg-gray-700 text-white rounded-xl p-3 border border-gray-600 outline-none focus:border-pink-500 text-sm placeholder-gray-400"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-95 ${
                    isCXPortal
                      ? 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-pink-900/40'
                      : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-900/40'
                  }`}
                >
                  {isCXPortal ? 'Dispatch to Maintenance' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Solved Records (Date Range Wise) Modal */}
      {showUploadSolvedModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-800 border border-teal-700/80 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl animate-fade-in-up my-8">
            <div className="flex justify-between items-start pb-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-teal-900/50 text-teal-400 rounded-xl border border-teal-700/70">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    Upload Solved Records (Date Range Wise)
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Bulk import resolved maintenance records with date ranges, technician names, and resolution notes.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowUploadSolvedModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Date Range Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-900/70 p-3.5 rounded-xl border border-gray-700">
                <div>
                  <label className="block text-[11px] font-bold text-gray-300 mb-1">
                    Start Date / Default Date
                  </label>
                  <input
                    type="date"
                    value={uploadDateFrom || selectedDate}
                    onChange={(e) => setUploadDateFrom(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-300 mb-1">
                    End Date (Optional Range)
                  </label>
                  <input
                    type="date"
                    value={uploadDateTo || selectedDate}
                    onChange={(e) => setUploadDateTo(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Sample Template & Format Tips */}
              <div className="flex items-center justify-between bg-teal-950/40 border border-teal-800/50 rounded-xl px-3.5 py-2.5">
                <div className="text-xs text-teal-200">
                  <span>Format: <strong>Date, Ride Name, Problem, Category, Priority, Technician, Resolution Notes</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSampleCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-800/80 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold transition-colors border border-teal-600/70"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Sample CSV</span>
                </button>
              </div>

              {/* CSV / Text Input Area */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  Paste CSV or JSON Solved Tickets Data:
                </label>
                <textarea
                  value={uploadInputText}
                  onChange={(e) => {
                    setUploadInputText(e.target.value);
                    setUploadError(null);
                  }}
                  placeholder={`Example CSV rows:\n${selectedDate},Sky Coaster,Emergency switch calibration,Operational Issue,normal,Tech Tom,Calibrated and tested\n${selectedDate},Carousel,Motor belt friction checked,Operational Issue,high,Fixit Felix,Lubricated and tightened`}
                  rows={6}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs text-gray-200 font-mono focus:border-teal-500 outline-none resize-y"
                />
              </div>

              {/* Action Buttons: Parse */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleParseUploadRecords}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Parse & Preview Records</span>
                </button>
                {parsedUploadTickets.length > 0 && (
                  <span className="text-xs font-bold text-emerald-400">
                    ✓ {parsedUploadTickets.length} records ready
                  </span>
                )}
              </div>

              {/* Error & Feedback Messages */}
              {uploadError && (
                <div className="p-3 bg-red-950/70 border border-red-700 text-red-200 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadSuccessMsg && (
                <div className="p-3 bg-emerald-950/70 border border-emerald-700 text-emerald-200 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{uploadSuccessMsg}</span>
                </div>
              )}

              {/* Parsed Preview Table */}
              {parsedUploadTickets.length > 0 && (
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Preview ({parsedUploadTickets.length} Solved Tickets):
                  </div>
                  {parsedUploadTickets.map((rec, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-gray-800/80 border border-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-teal-300">{rec.rideName}</span>
                        <span className="text-gray-400 text-[11px]">• {rec.problem}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-300">
                        <span className="bg-teal-900/60 px-2 py-0.5 rounded text-teal-200">{rec.assignedToName}</span>
                        <span className="text-gray-400 font-mono">{rec.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-700 mt-4">
              <button
                onClick={() => {
                  setShowUploadSolvedModal(false);
                  setParsedUploadTickets([]);
                  setUploadError(null);
                  setUploadSuccessMsg(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmUpload}
                disabled={parsedUploadTickets.length === 0 || isProcessingUpload}
                className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isProcessingUpload ? 'Saving...' : `Save ${parsedUploadTickets.length} Solved Records`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Date-Range Resolved Issues Download & Audit Modal */}
      <DateRangeResolvedModal
        isOpen={showDateRangeModal}
        onClose={() => setShowDateRangeModal(false)}
        allTickets={allTicketsFlat}
        rides={rides}
        initialPortalType={activePortal === 'cx' ? 'cx' : 'rides'}
        todayStr={todayStr}
      />

      {/* Mobile QR Link & Pairing Modal */}
      {showMobileShare && (
        <ShareModal onClose={() => setShowMobileShare(false)} />
      )}

      {/* Non-Blocking Floating Notification Banner */}
      {dashboardNotice && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-amber-200 border border-amber-600/70 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in-up max-w-md">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="text-xs font-semibold">{dashboardNotice}</span>
          <button
            type="button"
            onClick={() => setDashboardNotice(null)}
            className="text-gray-400 hover:text-white ml-auto cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default MaintenanceDashboard;
