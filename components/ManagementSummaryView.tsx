import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  BarChart3, 
  Users, 
  Ticket, 
  Package, 
  Wrench, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  CheckCircle,
  AlertTriangle, 
  DollarSign, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  FileText, 
  Save, 
  UserCheck, 
  ShieldAlert, 
  TrendingUp,
  Award,
  Layers,
  Printer,
  Gamepad2,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Tag,
  MessageSquare,
  Filter,
  CalendarRange,
  ClipboardPaste,
  Info,
  Radio
} from 'lucide-react';
import { 
  Ride, 
  Operator, 
  Counter, 
  PackageItem, 
  PackageSalesData, 
  AttendanceData, 
  MaintenanceTicket,
  ManagementSummaryNotes,
  ManagementNoteItem,
  ManagementWhatsAppReport,
  ManagementCounterBreakdown
} from '../types';
import { parseManagementReportText, ALL_TFW_LEVELS, normalizeCounterName } from '../utils/whatsappManagementParser';
import { formatDhakaTime, getDhakaDateString } from '../constants';
import { shiftDateKey, isDateKey } from '../utils/workingDate';

const normalizeAssigneeIds = (raw: any): number[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(Number).filter(n => !isNaN(n) && n > 0);
  }
  if (typeof raw === 'object') {
    return Object.values(raw).map(Number).filter(n => !isNaN(n) && n > 0);
  }
  const n = Number(raw);
  return (!isNaN(n) && n > 0) ? [n] : [];
};

interface Props {
  rides: Ride[];
  dailyCounts: Record<string, Record<string, number>>;
  dailyPackageCounts?: Record<string, Record<string, number>>;
  dailyTicketCounts?: Record<string, Record<string, number>>;
  dailyAssignments?: Record<string, Record<string, number[]>>;
  ticketSalesData?: Record<string, Record<string, number>>;
  packageSalesData?: PackageSalesData;
  packages?: PackageItem[];
  attendanceData?: AttendanceData;
  operators?: Operator[];
  counters?: Counter[];
  maintenanceTickets?: Record<string, Record<string, MaintenanceTicket>> | Record<string, MaintenanceTicket> | Record<string, any>;
  selectedDate: string;
  today: string;
  onDateChange: (date: string) => void;
  managementNotes?: Record<string, ManagementSummaryNotes>;
  onSaveManagementNotes?: (date: string, notes: ManagementSummaryNotes) => void;
  currency?: string;
  currentUser?: Operator | null;
  onNavigate?: (view: any) => void;
  whatsappManagementReports?: Record<string, ManagementWhatsAppReport>;
  onBroadcastSync?: () => Promise<void> | void;
  isBroadcastingSync?: boolean;
}

export const ManagementSummaryView: React.FC<Props> = ({
  rides,
  dailyCounts,
  dailyPackageCounts = {},
  dailyTicketCounts = {},
  dailyAssignments = {},
  ticketSalesData = {},
  packageSalesData = {},
  packages = [],
  attendanceData = {},
  operators = [],
  counters = [],
  maintenanceTickets = {},
  selectedDate,
  today,
  onDateChange,
  managementNotes = {},
  onSaveManagementNotes,
  currency = 'BDT',
  currentUser,
  onNavigate,
  whatsappManagementReports = {},
  onBroadcastSync,
  isBroadcastingSync = false
}) => {
  // Live ticking clock in Bangladesh Standard Time (Dhaka, GMT +6)
  const [liveDhakaTime, setLiveDhakaTime] = useState(() => formatDhakaTime(new Date()));

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveDhakaTime(formatDhakaTime(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Notes state for the active date
  const currentNotes = managementNotes[selectedDate] || {};
  
  const parseItemsFromNotes = (list?: (string | ManagementNoteItem)[], rawText?: string): ManagementNoteItem[] => {
    if (Array.isArray(list) && list.length > 0) {
      return list.map((item, idx) => {
        if (typeof item === 'string') {
          return { id: `item-${idx}-${idx}`, text: item, status: 'pending' };
        }
        return item;
      });
    }
    if (rawText && rawText.trim()) {
      const lines = rawText.split('\n').map(s => s.trim()).filter(Boolean);
      return lines.map((line, idx) => ({
        id: `legacy-${idx}-${idx}`,
        text: line.replace(/^[•\-\*]\s*/, ''),
        status: 'pending'
      }));
    }
    return [];
  };

  const [sprItems, setSprItems] = useState<ManagementNoteItem[]>(() => parseItemsFromNotes(currentNotes.sprList, currentNotes.sprRequired));
  const [newSprInput, setNewSprInput] = useState('');

  const [noteApprovalItems, setNoteApprovalItems] = useState<ManagementNoteItem[]>(() => parseItemsFromNotes(currentNotes.noteApprovalList, currentNotes.noteApproval));
  const [newNoteApprovalInput, setNewNoteApprovalInput] = useState('');

  const [othersItems, setOthersItems] = useState<ManagementNoteItem[]>(() => parseItemsFromNotes(currentNotes.othersList, currentNotes.others));
  const [newOthersInput, setNewOthersInput] = useState('');

  const [isSaved, setIsSaved] = useState(false);
  const [expandedRideKey, setExpandedRideKey] = useState<string | null>(null);
  const [showAssociateInputs, setShowAssociateInputs] = useState(false);
  const [associateSearchTerm, setAssociateSearchTerm] = useState('');

  // Inline editing state for any option (letters or numbers)
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // Freeform writing toggle (allows writing full paragraphs of letters & numbers)
  const [freeformMode, setFreeformMode] = useState<{ spr: boolean; note: boolean; others: boolean }>({
    spr: false,
    note: false,
    others: false,
  });
  const [freeformSprText, setFreeformSprText] = useState('');
  const [freeformNoteText, setFreeformNoteText] = useState('');
  const [freeformOthersText, setFreeformOthersText] = useState('');

  // Operations Summary Date Range & Filter states (follows Operational Officer report)
  const [opsStartDate, setOpsStartDate] = useState<string>(selectedDate);
  const [opsEndDate, setOpsEndDate] = useState<string>(selectedDate);
  const [opsSelectedGameId, setOpsSelectedGameId] = useState<string>('all');
  const userHasCustomOpsRangeRef = useRef<boolean>(false);
  const [opsSavedStatus, setOpsSavedStatus] = useState<string>('');

  // -------------------------------------------------------------
  // WhatsApp Sales & Revenue Date Range Filter states (TFW Management Team)
  // -------------------------------------------------------------
  const [salesRangeStart, setSalesRangeStart] = useState<string>(selectedDate);
  const [salesRangeEnd, setSalesRangeEnd] = useState<string>(selectedDate);
  const [activeSalesDayTab, setActiveSalesDayTab] = useState<string>('aggregate');

  // -------------------------------------------------------------
  // WhatsApp Counter & Cashier Breakdown Date Range Filter states
  // -------------------------------------------------------------
  const [counterRangeStart, setCounterRangeStart] = useState<string>(selectedDate);
  const [counterRangeEnd, setCounterRangeEnd] = useState<string>(selectedDate);

  // Manual Paste Modal for offline closing reports
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteSuccess, setPasteSuccess] = useState<string | null>(null);
  const [isSubmittingPaste, setIsSubmittingPaste] = useState(false);

  // Sync WhatsApp date ranges when selectedDate changes
  useEffect(() => {
    setSalesRangeStart(selectedDate);
    setSalesRangeEnd(selectedDate);
    setCounterRangeStart(selectedDate);
    setCounterRangeEnd(selectedDate);
    setActiveSalesDayTab('aggregate');
  }, [selectedDate]);

  // Track previous selectedDate and data hash to prevent typing wipeouts
  const lastSelectedDateRef = useRef<string>(selectedDate);
  const lastLoadedNotesHashRef = useRef<string>('');

  // Sync state whenever selectedDate changes or when loaded notes change without overwriting active user typing
  useEffect(() => {
    const isDateChange = lastSelectedDateRef.current !== selectedDate;
    const n = managementNotes[selectedDate] || {};
    const notesHash = JSON.stringify(n);

    if (isDateChange || lastLoadedNotesHashRef.current !== notesHash) {
      lastSelectedDateRef.current = selectedDate;
      lastLoadedNotesHashRef.current = notesHash;

      setSprItems(parseItemsFromNotes(n.sprList, n.sprRequired));
      setNoteApprovalItems(parseItemsFromNotes(n.noteApprovalList, n.noteApproval));
      setOthersItems(parseItemsFromNotes(n.othersList, n.others));

      // If user switched dates, reset active draft inputs
      if (isDateChange) {
        setNewSprInput('');
        setNewNoteApprovalInput('');
        setNewOthersInput('');
        setEditingItemId(null);
        setEditingText('');
        setFreeformSprText(n.sprRequired || '');
        setFreeformNoteText(n.noteApproval || '');
        setFreeformOthersText(n.others || '');
        setIsSaved(false);

        // Also sync operations date range if not in custom range mode
        if (!userHasCustomOpsRangeRef.current) {
          setOpsStartDate(selectedDate);
          setOpsEndDate(selectedDate);
        }
      } else {
        // If not in active freeform mode, safely update background text
        if (!freeformMode.spr) setFreeformSprText(n.sprRequired || '');
        if (!freeformMode.note) setFreeformNoteText(n.noteApproval || '');
        if (!freeformMode.others) setFreeformOthersText(n.others || '');
      }
    }
  }, [selectedDate, managementNotes, freeformMode]);

  const handleSaveNotes = useCallback((
    sprListToSave = sprItems,
    noteListToSave = noteApprovalItems,
    othersListToSave = othersItems
  ) => {
    if (onSaveManagementNotes) {
      onSaveManagementNotes(selectedDate, {
        sprRequired: sprListToSave.map(i => i.text).join('\n'),
        noteApproval: noteListToSave.map(i => i.text).join('\n'),
        others: othersListToSave.map(i => i.text).join('\n'),
        sprList: sprListToSave,
        noteApprovalList: noteListToSave,
        othersList: othersListToSave,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Management'
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    }
  }, [onSaveManagementNotes, selectedDate, sprItems, noteApprovalItems, othersItems, currentUser]);

  // Inline item editing handlers (letters or numbers)
  const handleStartEdit = (item: ManagementNoteItem) => {
    setEditingItemId(item.id);
    setEditingText(item.text);
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingText('');
  };

  const handleSaveEdit = (section: 'spr' | 'note' | 'others') => {
    if (!editingItemId) return;
    const trimmed = editingText.trim();
    if (!trimmed) {
      handleCancelEdit();
      return;
    }

    if (section === 'spr') {
      const updated = sprItems.map(item => item.id === editingItemId ? { ...item, text: trimmed } : item);
      setSprItems(updated);
      handleSaveNotes(updated, noteApprovalItems, othersItems);
    } else if (section === 'note') {
      const updated = noteApprovalItems.map(item => item.id === editingItemId ? { ...item, text: trimmed } : item);
      setNoteApprovalItems(updated);
      handleSaveNotes(sprItems, updated, othersItems);
    } else if (section === 'others') {
      const updated = othersItems.map(item => item.id === editingItemId ? { ...item, text: trimmed } : item);
      setOthersItems(updated);
      handleSaveNotes(sprItems, noteApprovalItems, updated);
    }
    handleCancelEdit();
  };

  // Freeform writing mode handlers
  const handleToggleFreeform = (section: 'spr' | 'note' | 'others') => {
    setFreeformMode(prev => {
      const next = !prev[section];
      if (next) {
        if (section === 'spr') setFreeformSprText(sprItems.map(i => i.text).join('\n'));
        if (section === 'note') setFreeformNoteText(noteApprovalItems.map(i => i.text).join('\n'));
        if (section === 'others') setFreeformOthersText(othersItems.map(i => i.text).join('\n'));
      }
      return { ...prev, [section]: next };
    });
  };

  const handleSaveFreeform = (section: 'spr' | 'note' | 'others') => {
    if (section === 'spr') {
      const newItems = parseItemsFromNotes([], freeformSprText);
      setSprItems(newItems);
      handleSaveNotes(newItems, noteApprovalItems, othersItems);
      setFreeformMode(prev => ({ ...prev, spr: false }));
    } else if (section === 'note') {
      const newItems = parseItemsFromNotes([], freeformNoteText);
      setNoteApprovalItems(newItems);
      handleSaveNotes(sprItems, newItems, othersItems);
      setFreeformMode(prev => ({ ...prev, note: false }));
    } else if (section === 'others') {
      const newItems = parseItemsFromNotes([], freeformOthersText);
      setOthersItems(newItems);
      handleSaveNotes(sprItems, noteApprovalItems, newItems);
      setFreeformMode(prev => ({ ...prev, others: false }));
    }
  };

  const handleAddSprOption = () => {
    if (!newSprInput.trim()) return;
    const newItem: ManagementNoteItem = {
      id: `spr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      text: newSprInput.trim(),
      status: 'pending',
      addedAt: new Date().toISOString(),
      addedBy: currentUser?.name || 'Management'
    };
    const updated = [...sprItems, newItem];
    setSprItems(updated);
    setNewSprInput('');
    handleSaveNotes(updated, noteApprovalItems, othersItems);
  };

  const handleRemoveSprOption = (id: string) => {
    const updated = sprItems.filter(i => i.id !== id);
    setSprItems(updated);
    handleSaveNotes(updated, noteApprovalItems, othersItems);
  };

  const handleToggleSprStatus = (id: string) => {
    const updated = sprItems.map(i => {
      if (i.id === id) {
        const nextStatus: 'pending' | 'approved' | 'rejected' = 
          i.status === 'pending' ? 'approved' : 
          i.status === 'approved' ? 'rejected' : 'pending';
        return { ...i, status: nextStatus };
      }
      return i;
    });
    setSprItems(updated);
    handleSaveNotes(updated, noteApprovalItems, othersItems);
  };

  const handleAddNoteApprovalOption = () => {
    if (!newNoteApprovalInput.trim()) return;
    const newItem: ManagementNoteItem = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      text: newNoteApprovalInput.trim(),
      status: 'pending',
      addedAt: new Date().toISOString(),
      addedBy: currentUser?.name || 'Management'
    };
    const updated = [...noteApprovalItems, newItem];
    setNoteApprovalItems(updated);
    setNewNoteApprovalInput('');
    handleSaveNotes(sprItems, updated, othersItems);
  };

  const handleRemoveNoteApprovalOption = (id: string) => {
    const updated = noteApprovalItems.filter(i => i.id !== id);
    setNoteApprovalItems(updated);
    handleSaveNotes(sprItems, updated, othersItems);
  };

  const handleToggleNoteApprovalStatus = (id: string) => {
    const updated = noteApprovalItems.map(i => {
      if (i.id === id) {
        const nextStatus: 'pending' | 'approved' | 'rejected' = 
          i.status === 'pending' ? 'approved' : 
          i.status === 'approved' ? 'rejected' : 'pending';
        return { ...i, status: nextStatus };
      }
      return i;
    });
    setNoteApprovalItems(updated);
    handleSaveNotes(sprItems, updated, othersItems);
  };

  const handleAddOthersOption = () => {
    if (!newOthersInput.trim()) return;
    const newItem: ManagementNoteItem = {
      id: `others-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      text: newOthersInput.trim(),
      status: 'completed',
      addedAt: new Date().toISOString(),
      addedBy: currentUser?.name || 'Management'
    };
    const updated = [...othersItems, newItem];
    setOthersItems(updated);
    setNewOthersInput('');
    handleSaveNotes(sprItems, noteApprovalItems, updated);
  };

  const handleRemoveOthersOption = (id: string) => {
    const updated = othersItems.filter(i => i.id !== id);
    setOthersItems(updated);
    handleSaveNotes(sprItems, noteApprovalItems, updated);
  };

  const handleToggleOthersStatus = (id: string) => {
    const updated = othersItems.map(i => {
      if (i.id === id) {
        const nextStatus: 'completed' | 'pending' | 'in-progress' = 
          i.status === 'completed' ? 'pending' : 
          i.status === 'pending' ? 'in-progress' : 'completed';
        return { ...i, status: nextStatus as any };
      }
      return i;
    });
    setOthersItems(updated);
    handleSaveNotes(sprItems, noteApprovalItems, updated);
  };

  // Day navigation helpers
  const handleShiftDay = (delta: number) => {
    if (isDateKey(selectedDate)) onDateChange(shiftDateKey(selectedDate, delta));
  };

  // -------------------------------------------------------------
  // 1. OPERATIONS METRICS (Follows Operational Officer Report Logic: Summation of Package Entries + Ticket Entries)
  // -------------------------------------------------------------
  const opsRangeDates = useMemo(() => {
    const s = opsStartDate || selectedDate;
    const e = opsEndDate || selectedDate;
    const start = new Date(s);
    const end = new Date(e);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [selectedDate];
    if (start > end) return [s];

    const dates: string[] = [];
    const curr = new Date(start);
    while (curr <= end) {
      dates.push(getDhakaDateString(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }, [opsStartDate, opsEndDate, selectedDate]);

  const { 
    totalTicketGuests, 
    totalPackageGuests, 
    totalGuestsSum, 
    rideInputsList, 
    ridesWithInputCount,
    rangeTotalGuests,
    rangePackageGuests,
    rangeTicketGuests,
    rangeRideBreakdown
  } = useMemo(() => {
    // 1. Active Selected Date Calculations
    const tktMap = dailyTicketCounts[selectedDate] || {};
    const pkgMap = dailyPackageCounts[selectedDate] || {};
    const rawMap = dailyCounts[selectedDate] || {};
    const assignmentsMap = dailyAssignments[selectedDate] || {};

    let totalPkg = 0;
    let totalTkt = 0;

    const list: Array<{
      rideId: number | string;
      rideName: string;
      floor?: string;
      assignedAssociates: Operator[];
      packageCount: number;
      ticketCount: number;
      totalGuestCount: number;
      hasInput: boolean;
    }> = [];

    const allRideIds = new Set<string>();
    rides.forEach(ride => allRideIds.add(String(ride.id)));
    Object.keys(tktMap).forEach(k => allRideIds.add(String(k)));
    Object.keys(pkgMap).forEach(k => allRideIds.add(String(k)));

    rides.forEach(ride => {
      const idStr = String(ride.id);
      let p = Number(pkgMap[idStr] ?? pkgMap[ride.id] ?? 0);
      let t = Number(tktMap[idStr] ?? tktMap[ride.id] ?? 0);
      const raw = Number(rawMap[idStr] ?? rawMap[ride.id] ?? 0);

      // Operational Officer report parity: proportional fallback to raw count if specific pkg/tkt are 0
      if (p === 0 && t === 0 && raw > 0) {
        p = raw;
        t = raw - p;
      }
      const rideTotal = p + t;

      totalPkg += p;
      totalTkt += t;

      const assignedIds = normalizeAssigneeIds(assignmentsMap[ride.id] || assignmentsMap[idStr]);
      const assignedOps = operators.filter(op => assignedIds.includes(Number(op.id)));

      list.push({
        rideId: ride.id,
        rideName: ride.name,
        floor: ride.floor,
        assignedAssociates: assignedOps,
        packageCount: p,
        ticketCount: t,
        totalGuestCount: rideTotal,
        hasInput: (p > 0 || t > 0)
      });

      allRideIds.delete(idStr);
    });

    allRideIds.forEach(idStr => {
      let p = Number(pkgMap[idStr] ?? 0);
      let t = Number(tktMap[idStr] ?? 0);
      const raw = Number(rawMap[idStr] ?? 0);

      if (p === 0 && t === 0 && raw > 0) {
        p = raw;
        t = raw - p;
      }
      const rideTotal = p + t;

      totalPkg += p;
      totalTkt += t;

      if (p > 0 || t > 0) {
        list.push({
          rideId: idStr,
          rideName: `Ride #${idStr}`,
          assignedAssociates: [],
          packageCount: p,
          ticketCount: t,
          totalGuestCount: rideTotal,
          hasInput: (p > 0 || t > 0)
        });
      }
    });

    const totalBothIncluded = totalPkg + totalTkt;
    const inputCount = list.filter(r => r.hasInput).length;

    // 2. Date Range Summation across entire range (Total Guests in Range = Package Entries + Ticket Entries)
    let rangePkg = 0;
    let rangeTkt = 0;
    const rideAcc: Record<string, { rideId: string; name: string; floor?: string; pkg: number; tkt: number; total: number }> = {};

    rides.forEach(r => {
      rideAcc[String(r.id)] = {
        rideId: String(r.id),
        name: r.name,
        floor: r.floor,
        pkg: 0,
        tkt: 0,
        total: 0
      };
    });

    opsRangeDates.forEach(d => {
      const pMap = dailyPackageCounts[d] || {};
      const tMap = dailyTicketCounts[d] || {};
      const rMap = dailyCounts[d] || {};

      rides.forEach(ride => {
        const idStr = String(ride.id);
        if (opsSelectedGameId !== 'all' && idStr !== opsSelectedGameId) return;

        let p = Number(pMap[idStr] ?? pMap[ride.id] ?? 0);
        let t = Number(tMap[idStr] ?? tMap[ride.id] ?? 0);
        const raw = Number(rMap[idStr] ?? rMap[ride.id] ?? 0);

        if (p === 0 && t === 0 && raw > 0) {
          p = raw;
          t = raw - p;
        }

        rangePkg += p;
        rangeTkt += t;

        if (rideAcc[idStr]) {
          rideAcc[idStr].pkg += p;
          rideAcc[idStr].tkt += t;
          rideAcc[idStr].total += (p + t);
        }
      });
    });

    const rangeTotal = rangePkg + rangeTkt;
    const breakdownList = Object.values(rideAcc).filter(item => {
      if (opsSelectedGameId !== 'all' && item.rideId !== opsSelectedGameId) return false;
      return true;
    });

    return {
      totalPackageGuests: totalPkg,
      totalTicketGuests: totalTkt,
      totalGuestsSum: totalBothIncluded,
      rideInputsList: list,
      ridesWithInputCount: inputCount,
      rangeTotalGuests: rangeTotal,
      rangePackageGuests: rangePkg,
      rangeTicketGuests: rangeTkt,
      rangeRideBreakdown: breakdownList
    };
  }, [rides, dailyPackageCounts, dailyTicketCounts, dailyCounts, dailyAssignments, operators, selectedDate, opsRangeDates, opsSelectedGameId]);

  // Permanently store Operational Summary snapshot to database
  const handleSaveOperationalSummary = useCallback(() => {
    if (onSaveManagementNotes) {
      const current = managementNotes[selectedDate] || {};
      const updatedNotes: ManagementSummaryNotes = {
        ...current,
        operationalSummary: {
          startDate: opsStartDate,
          endDate: opsEndDate,
          totalGuestsInRange: rangeTotalGuests,
          packageEntriesInRange: rangePackageGuests,
          ticketEntriesInRange: rangeTicketGuests,
          selectedGameId: opsSelectedGameId,
          savedAt: new Date().toISOString(),
          savedBy: currentUser?.name || 'Management'
        },
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Management'
      };
      onSaveManagementNotes(selectedDate, updatedNotes);
      setOpsSavedStatus(`Saved permanently to database at ${new Date().toLocaleTimeString()}`);
      setTimeout(() => setOpsSavedStatus(''), 4000);
    }
  }, [onSaveManagementNotes, selectedDate, managementNotes, opsStartDate, opsEndDate, rangeTotalGuests, rangePackageGuests, rangeTicketGuests, opsSelectedGameId, currentUser]);

  const filteredRideInputsList = useMemo(() => {
    if (!associateSearchTerm.trim()) return rideInputsList;
    const q = associateSearchTerm.toLowerCase();
    return rideInputsList.filter(item => 
      item.rideName.toLowerCase().includes(q) ||
      (item.floor && item.floor.toLowerCase().includes(q)) ||
      item.assignedAssociates.some(op => op.name.toLowerCase().includes(q))
    );
  }, [rideInputsList, associateSearchTerm]);

  // Ride Associates Present Today (Counted from when they 1st time clock in)
  const { presentAssociates, absentAssociates, totalAssociatesCount } = useMemo(() => {
    const dateAtt: Record<string | number, any> = (attendanceData as any)?.[selectedDate] || {};
    // Associates from operators list
    const associatesList = operators.filter(o => o.active !== false);

    const present: Array<{ operator: Operator; briefingTime: string | null; attendedBriefing: boolean }> = [];
    const absent: Operator[] = [];

    associatesList.forEach(op => {
      const record = dateAtt[op.id] || dateAtt[String(op.id)];
      if (record) {
        present.push({
          operator: op,
          briefingTime: record.briefingTime,
          attendedBriefing: Boolean(record.attendedBriefing)
        });
      } else {
        absent.push(op);
      }
    });

    return {
      presentAssociates: present,
      absentAssociates: absent,
      totalAssociatesCount: associatesList.length
    };
  }, [operators, attendanceData, selectedDate]);

  // -------------------------------------------------------------
  // MAINTENANCE DEDUPLICATION & UNIFICATION (Exact parity with Maintenance Dashboard)
  // -------------------------------------------------------------
  const allTicketsFlat = useMemo(() => {
    if (!maintenanceTickets || typeof maintenanceTickets !== 'object') return [];

    const rawList: any[] = [];
    Object.entries(maintenanceTickets).forEach(([dateKey, dateTickets]) => {
      if (dateTickets && typeof dateTickets === 'object') {
        // Handle if dateTickets is a single ticket object (flat) or nested dictionary
        if ((dateTickets as any).id || (dateTickets as any).rideId || (dateTickets as any).problem) {
          const t = dateTickets as any;
          const tId = t.id || dateKey;
          if (t.status !== 'deleted') {
            const coreSuffix = String(tId).replace(/^\d{4}-\d{2}-\d{2}-/, '');
            rawList.push({
              ...t,
              id: tId,
              _dateKey: t.date || (dateKey.match(/^\d{4}-\d{2}-\d{2}$/) ? dateKey : undefined),
              _coreSuffix: (coreSuffix && coreSuffix.length > 5) ? coreSuffix : ''
            });
          }
        } else {
          Object.entries(dateTickets as Record<string, any>).forEach(([tKey, t]) => {
            if (!t || typeof t !== 'object') return;
            const tId = t.id || tKey;
            if (t.status === 'deleted') return;
            const coreSuffix = String(tId).replace(/^\d{4}-\d{2}-\d{2}-/, '');
            rawList.push({
              ...t,
              id: tId,
              _dateKey: t.date || dateKey,
              _coreSuffix: (coreSuffix && coreSuffix.length > 5) ? coreSuffix : ''
            });
          });
        }
      }
    });

    if (rawList.length === 0) return [];

    // Union-find clustering for canonical deduplication across dates and WhatsApp
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
        if (a.id === b.id || (a._coreSuffix && a._coreSuffix === b._coreSuffix)) {
          isSame = true;
        } else if (a.whatsappMessageId && b.whatsappMessageId && a.whatsappMessageId === b.whatsappMessageId) {
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
      const solvedRecord = records.find(r => r.status === 'solved');
      const inProgressRecord = records.find(r => r.status === 'in-progress');

      records.sort((a, b) => {
        const rankB = statusRank[b.status] || 0;
        const rankA = statusRank[a.status] || 0;
        if (rankB !== rankA) return rankB - rankA;
        const timeB = new Date(b.solvedAt || b.reportedAt || 0).getTime();
        const timeA = new Date(a.solvedAt || a.reportedAt || 0).getTime();
        return timeB - timeA;
      });

      const best = records[0];

      if (inProgressRecord && (!solvedRecord || inProgressRecord.isExplicitReopen || (
        inProgressRecord.inProgressAt && solvedRecord.solvedAt &&
        new Date(inProgressRecord.inProgressAt).getTime() > new Date(solvedRecord.solvedAt).getTime()
      ))) {
        unifiedList.push({
          ...best,
          ...inProgressRecord,
          status: 'in-progress'
        });
      } else if (solvedRecord) {
        unifiedList.push({
          ...best,
          ...solvedRecord,
          status: 'solved',
          solvedAt: solvedRecord.solvedAt || best.solvedAt || new Date().toISOString(),
          resolutionNotes: solvedRecord.resolutionNotes || best.resolutionNotes || '',
          solutionImageUrl: solvedRecord.solutionImageUrl || best.solutionImageUrl,
          assignedToName: solvedRecord.assignedToName || best.assignedToName,
          helperNames: solvedRecord.helperNames || best.helperNames
        });
      } else if (inProgressRecord) {
        unifiedList.push({
          ...best,
          ...inProgressRecord,
          status: 'in-progress'
        });
      } else {
        unifiedList.push(best);
      }
    });

    return unifiedList.sort((a, b) => {
      const timeB = new Date(b.solvedAt || b.reportedAt || 0).getTime();
      const timeA = new Date(a.solvedAt || a.reportedAt || 0).getTime();
      return timeB - timeA;
    });
  }, [maintenanceTickets]);

  const getTicketDate = useCallback((ticket: MaintenanceTicket): string => {
    if (ticket.reportedAt) {
      try {
        return getDhakaDateString(new Date(ticket.reportedAt));
      } catch (e) {}
    }
    return ticket.date || (ticket as any)._dateKey || today;
  }, [today]);

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

  // Rides operational status
  const rideStatusSummary = useMemo(() => {
    let active = 0;
    let maint = 0;
    let closed = 0;

    // Check active maintenance tickets for rides on selectedDate (or active today)
    const activeIssueRideIds = new Set(
      allTicketsFlat
        .filter(t => (t.status === 'reported' || t.status === 'in-progress') && (getTicketDate(t) === selectedDate || selectedDate === today))
        .map(t => t.rideId)
    );

    rides.forEach(r => {
      if (activeIssueRideIds.has(r.id)) {
        maint++;
      } else if (r.status === 'active' || (r.status as string) === 'operational' || !r.status) {
        active++;
      } else {
        closed++;
      }
    });

    return { active, maint, closed, total: rides.length };
  }, [rides, allTicketsFlat, selectedDate, today, getTicketDate]);

  // -------------------------------------------------------------
  // 2. SALES & REVENUE METRICS
  // -------------------------------------------------------------
  const salesSummary = useMemo(() => {
    const dateSales: Record<string, any> = packageSalesData[selectedDate] || {};
    const pkgCatalogMap = new Map<string, PackageItem>();
    packages.forEach(p => pkgCatalogMap.set(p.id, p));

    let kiddoCount = 0;
    let xtremeCount = 0;
    let vipCount = 0;
    let otherPackagesCount = 0;
    let entryPackageCount = 0;
    let otherSalesItemsCount = 0;
    let otherSalesEntryCount = 0;
    let totalRevenue = 0;
    let cashierCalculatedRevenue = 0;

    // Counter ticket sales (Physical entry ticket counters)
    const dateTicketSales: Record<string, any> = ticketSalesData[selectedDate] || {};
    let counterEntryTickets = 0;
    let counterTicketRevenue = 0;
    Object.entries(dateTicketSales).forEach(([counterId, val]: [string, any]) => {
      const count = Number(val || 0);
      counterEntryTickets += count;
      const counterObj = counters.find(c => String(c.id) === String(counterId));
      const unitPrice = counterObj?.ticketPrice || counterObj?.price || 150;
      counterTicketRevenue += count * unitPrice;
    });

    // Cashier Package Sales & Other Sales
    const individualPackagesMap = new Map<string, { id: string; name: string; price: number; count: number; amount: number }>();
    packages.forEach(p => {
      individualPackagesMap.set(p.name, {
        id: String(p.id || p.name),
        name: p.name,
        price: Number(p.price || 0),
        count: 0,
        amount: 0
      });
    });

    const otherSalesCategoryMap = new Map<string, { category: string; count: number; amount: number; items: Array<{ customName: string; count: number; amount: number }> }>();

    // Counter Tickets (Daily Counter Ticket Sales) - Tracked for Footfall calculation ONLY
    const dateTickets = ticketSalesData[selectedDate] || {};
    Object.entries(dateTickets).forEach(([counterId, countVal]) => {
      const count = Number(countVal || 0);
      counterEntryTickets += count;
      const counterObj = counters.find(c => String(c.id) === String(counterId));
      const unitPrice = counterObj?.ticketPrice || counterObj?.price || 150;
      counterTicketRevenue += count * unitPrice;
    });

    Object.values(dateSales).forEach((personnelSale: any) => {
      if (!personnelSale) return;
      if (personnelSale.total) {
        totalRevenue += Number(personnelSale.total);
      }

      // Breakdown by packages sold
      if (personnelSale.packages) {
        Object.entries(personnelSale.packages).forEach(([pkgId, qty]) => {
          const count = Number(qty || 0);
          if (count <= 0) return;

          const pkgItem = pkgCatalogMap.get(pkgId) || packages.find(p => p.name === pkgId);
          const pkgName = pkgItem?.name || pkgId;
          const pkgPrice = pkgItem?.price || 0;

          if (!individualPackagesMap.has(pkgName)) {
            individualPackagesMap.set(pkgName, {
              id: pkgId,
              name: pkgName,
              price: pkgPrice,
              count: 0,
              amount: 0
            });
          }

          const existing = individualPackagesMap.get(pkgName)!;
          existing.count += count;
          existing.amount += count * (existing.price || pkgPrice);
          cashierCalculatedRevenue += count * (existing.price || pkgPrice);

          const nameLower = pkgName.toLowerCase();
          if (nameLower.includes('entry')) {
            entryPackageCount += count;
          } else if (nameLower.includes('kiddo')) {
            kiddoCount += count;
          } else if (nameLower.includes('xtreme')) {
            xtremeCount += count;
          } else if (nameLower.includes('vip')) {
            vipCount += count;
          } else {
            otherPackagesCount += count;
          }
        });
      }

      // Other sales records (Category-wise)
      if (personnelSale.otherSales && Array.isArray(personnelSale.otherSales)) {
        personnelSale.otherSales.forEach((item: any) => {
          const cat = item.category || 'General Other Sales';
          const count = Math.max(1, Number(item.count || 1));
          const amt = Number(item.amount !== undefined ? item.amount : (Number(item.unitPrice || 0) * count));

          if (!otherSalesCategoryMap.has(cat)) {
            otherSalesCategoryMap.set(cat, {
              category: cat,
              count: 0,
              amount: 0,
              items: []
            });
          }

          const catObj = otherSalesCategoryMap.get(cat)!;
          catObj.count += count;
          catObj.amount += amt;
          catObj.items.push({
            customName: item.customName || item.description || cat,
            count,
            amount: amt
          });

          const descLower = (item.description || item.category || '').toLowerCase();
          if (descLower.includes('entry')) {
            otherSalesEntryCount += 1;
          } else {
            otherSalesItemsCount++;
          }
          if (!personnelSale.total && item.amount) {
            cashierCalculatedRevenue += Number(item.amount);
          }
        });
      }
    });

    const individualPackagesList = Array.from(individualPackagesMap.values());
    const otherSalesCategoriesList = Array.from(otherSalesCategoryMap.values());

    // Total entry count: counter tickets + cashier entry ticket packages + any other entry items
    const totalEntryCount = counterEntryTickets + entryPackageCount + otherSalesEntryCount;

    // All package's summation: sum of all packages sold
    const allPackagesSum = individualPackagesList.reduce((acc, p) => acc + p.count, 0);

    // Footfall: All package's summation + entry count
    const footfall = allPackagesSum + totalEntryCount;

    // Requirement 6:
    // Follow Individual Package Sales Summary & Other Sales (Category-wise).
    // Footfall will only show, BUT it will NOT calculate with Revenue.
    // Therefore, counterTicketRevenue (entry tickets) is EXCLUDED from revenue!
    const cashierPackagesTotalRevenue = individualPackagesList.reduce((acc, p) => acc + p.amount, 0);
    const otherSalesTotalRevenue = otherSalesCategoriesList.reduce((acc, c) => acc + c.amount, 0);
    const computedSalesRevenue = cashierPackagesTotalRevenue + otherSalesTotalRevenue;
    const finalRevenue = totalRevenue > 0 ? totalRevenue : (computedSalesRevenue > 0 ? computedSalesRevenue : cashierCalculatedRevenue);

    return {
      individualPackagesList,
      otherSalesCategoriesList,
      kiddoCount,
      xtremeCount,
      vipCount,
      otherPackagesCount,
      otherSalesCount: otherSalesCategoriesList.reduce((acc, c) => acc + c.count, 0) || (otherPackagesCount + otherSalesItemsCount),
      entryCount: totalEntryCount,
      counterEntryTickets,
      totalPackagesCount: allPackagesSum,
      cashierPackagesTotalRevenue,
      otherSalesTotalRevenue,
      footfall,
      revenue: finalRevenue
    };
  }, [packageSalesData, packages, ticketSalesData, counters, selectedDate]);

  // Format currency with standard Bangladeshi styling (e.g. 12,45,805/=)
  const formatTaka = (amount: number): string => {
    try {
      const formatted = amount.toLocaleString('en-IN');
      return `${formatted}/=`;
    } catch {
      return `${amount}/=`;
    }
  };

  // -------------------------------------------------------------
  // WHATSAPP CLOSING METRICS & AGGREGATION ("TFW Management Team")
  // -------------------------------------------------------------
  const allWhatsAppReports = useMemo(() => {
    return Object.values(whatsappManagementReports || {}).sort((a, b) => b.date.localeCompare(a.date));
  }, [whatsappManagementReports]);

  // Available report dates for fast preset navigation
  const availableReportDates = useMemo(() => {
    return allWhatsAppReports.map(r => r.date);
  }, [allWhatsAppReports]);

  // Filtered reports for Sales & Revenue date range
  const salesReportsInRange = useMemo(() => {
    const s = salesRangeStart <= salesRangeEnd ? salesRangeStart : salesRangeEnd;
    const e = salesRangeStart <= salesRangeEnd ? salesRangeEnd : salesRangeStart;
    return allWhatsAppReports.filter(r => r.date >= s && r.date <= e);
  }, [allWhatsAppReports, salesRangeStart, salesRangeEnd]);

  // Aggregated Sales & Revenue for the selected range
  const aggregatedSalesData = useMemo(() => {
    const totals = {
      toggiKiddoSale: 0,
      toggiXtremeSale: 0,
      toggiVipConciergeSale: 0,
      entryTicketSale: 0,
      totalFootFall: 0,
      discount: 0,
      totalRevenue: 0,
      kiddoPackageSold: 0,
      xtremePackageSold: 0,
      reportsCount: salesReportsInRange.length
    };
    for (const r of salesReportsInRange) {
      if (r.salesAndRevenue) {
        totals.toggiKiddoSale += (r.salesAndRevenue.toggiKiddoSale || 0);
        totals.toggiXtremeSale += (r.salesAndRevenue.toggiXtremeSale || 0);
        totals.toggiVipConciergeSale += (r.salesAndRevenue.toggiVipConciergeSale || 0);
        totals.entryTicketSale += (r.salesAndRevenue.entryTicketSale || 0);
        totals.totalFootFall += (r.salesAndRevenue.totalFootFall || 0);
        totals.discount += (r.salesAndRevenue.discount || 0);
        totals.totalRevenue += (r.salesAndRevenue.totalRevenue || 0);
        totals.kiddoPackageSold += (r.salesAndRevenue.kiddoPackageSold || 0);
        totals.xtremePackageSold += (r.salesAndRevenue.xtremePackageSold || 0);
      }
    }
    return totals;
  }, [salesReportsInRange]);

  // Current displayed sales object (either single day or aggregate)
  const displayedSales = useMemo(() => {
    if (activeSalesDayTab !== 'aggregate') {
      const single = salesReportsInRange.find(r => r.date === activeSalesDayTab);
      if (single && single.salesAndRevenue) {
        return {
          ...single.salesAndRevenue,
          date: single.date,
          isSingleDay: true,
          timestamp: single.timestamp,
          senderName: single.senderName
        };
      }
    }
    return {
      ...aggregatedSalesData,
      date: salesRangeStart === salesRangeEnd ? salesRangeStart : `${salesRangeStart} → ${salesRangeEnd}`,
      isSingleDay: salesReportsInRange.length === 1,
      timestamp: salesReportsInRange[0]?.timestamp,
      senderName: salesReportsInRange[0]?.senderName
    };
  }, [activeSalesDayTab, salesReportsInRange, aggregatedSalesData, salesRangeStart, salesRangeEnd]);

  // Filtered reports for Counter & Cashier Breakdown date range
  const counterReportsInRange = useMemo(() => {
    const s = counterRangeStart <= counterRangeEnd ? counterRangeStart : counterRangeEnd;
    const e = counterRangeStart <= counterRangeEnd ? counterRangeEnd : counterRangeStart;
    return allWhatsAppReports.filter(r => r.date >= s && r.date <= e);
  }, [allWhatsAppReports, counterRangeStart, counterRangeEnd]);

  // Aggregated Counter breakdown across the selected range (All 10 Levels)
  const aggregatedCountersData = useMemo(() => {
    const map: Record<string, {
      counterName: string;
      individualSales: number;
      kiddoPackRatio: number;
      xtremePackRatio: number;
      totalRevenue: number;
      count: number;
      details?: string;
    }> = {};

    // Initialize all 12 TFW levels (Basement 01, Level - 01, and Level 8 to Level 17) so every level is consistently presented
    for (const lvl of ALL_TFW_LEVELS) {
      map[lvl] = {
        counterName: lvl,
        individualSales: 0,
        kiddoPackRatio: 0,
        xtremePackRatio: 0,
        totalRevenue: 0,
        count: 0
      };
    }

    for (const r of counterReportsInRange) {
      if (Array.isArray(r.counterBreakdown)) {
        for (const item of r.counterBreakdown) {
          const rawName = (item.counterName || '').trim() || 'General Counter';
          const name = normalizeCounterName(rawName);
          if (!map[name]) {
            map[name] = {
              counterName: name,
              individualSales: 0,
              kiddoPackRatio: 0,
              xtremePackRatio: 0,
              totalRevenue: 0,
              count: 0
            };
          }
          map[name].individualSales += (item.individualSales || 0);
          map[name].kiddoPackRatio += (item.kiddoPackRatio || 0);
          map[name].xtremePackRatio += (item.xtremePackRatio || 0);
          map[name].totalRevenue += (item.totalRevenue || 0);
          map[name].count += 1;
          if (item.details) map[name].details = item.details;
        }
      }
    }

    const list = Object.values(map);
    // Sort logically in architectural order: Basement 01, Level - 01, Level 8 to Level 17
    list.sort((a, b) => {
      const idxA = ALL_TFW_LEVELS.indexOf(a.counterName);
      const idxB = ALL_TFW_LEVELS.indexOf(b.counterName);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.counterName.localeCompare(b.counterName);
    });

    const grandTotal = list.reduce((acc, curr) => ({
      individualSales: acc.individualSales + curr.individualSales,
      kiddoPackRatio: acc.kiddoPackRatio + curr.kiddoPackRatio,
      xtremePackRatio: acc.xtremePackRatio + curr.xtremePackRatio,
      totalRevenue: acc.totalRevenue + curr.totalRevenue
    }), { individualSales: 0, kiddoPackRatio: 0, xtremePackRatio: 0, totalRevenue: 0 });

    return { counters: list, grandTotal, reportsCount: counterReportsInRange.length };
  }, [counterReportsInRange]);

  // Handler for manual paste submission
  const handleManualPasteSubmit = async () => {
    if (!pasteText.trim()) {
      setPasteError('Please enter or paste the message text from WhatsApp.');
      return;
    }
    setIsSubmittingPaste(true);
    setPasteError(null);
    setPasteSuccess(null);
    try {
      const res = await fetch('/api/management/parse-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: pasteText,
          date: selectedDate,
          senderName: currentUser?.name || 'TFW Management Team'
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to parse report format');
      }
      setPasteSuccess(`Report for ${data.report.date} successfully parsed and synced! Total Revenue: ${formatTaka(data.report.salesAndRevenue.totalRevenue)}`);
      setSalesRangeStart(data.report.date);
      setSalesRangeEnd(data.report.date);
      setCounterRangeStart(data.report.date);
      setCounterRangeEnd(data.report.date);
      setTimeout(() => {
        setIsPasteModalOpen(false);
        setPasteText('');
        setPasteSuccess(null);
      }, 1500);
    } catch (err: any) {
      setPasteError(err.message || 'Error parsing closing report');
    } finally {
      setIsSubmittingPaste(false);
    }
  };

  // -------------------------------------------------------------
  // 3. MAINTENANCE & ENGINEERING METRICS
  // -------------------------------------------------------------
  const maintenanceSummary = useMemo(() => {
    const solvedTodayTickets = allTicketsFlat.filter(t => isTicketSolvedOnDate(t, selectedDate));
    const reportedTodayTickets = allTicketsFlat.filter(t => t.status === 'reported' && getTicketDate(t) === selectedDate);
    const inProgressTodayTickets = allTicketsFlat.filter(t => t.status === 'in-progress' && (
      getTicketDate(t) === selectedDate || 
      (t.inProgressAt && (() => { try { return getDhakaDateString(new Date(t.inProgressAt)) === selectedDate; } catch { return false; } })())
    ));

    const allOpenReported = allTicketsFlat.filter(t => t.status === 'reported');
    const allOpenInProgress = allTicketsFlat.filter(t => t.status === 'in-progress');

    // Build ride-wise breakdown for selectedDate
    // Include all tickets active or resolved on selectedDate
    const rideMap = new Map<string, {
      rideId: number | string;
      rideName: string;
      floor?: string;
      solvedCount: number;
      inProgressCount: number;
      reportedCount: number;
      tickets: MaintenanceTicket[];
    }>();

    const dateRelevantTickets = allTicketsFlat.filter(t => 
      isTicketSolvedOnDate(t, selectedDate) || 
      (t.status === 'in-progress' && (getTicketDate(t) === selectedDate || selectedDate === today)) ||
      (t.status === 'reported' && (getTicketDate(t) === selectedDate || selectedDate === today))
    );

    dateRelevantTickets.forEach(t => {
      const key = String(t.rideId || t.rideName || 'unknown');
      if (!rideMap.has(key)) {
        const matchedRide = rides.find(r => r.id === t.rideId || r.name.toLowerCase() === (t.rideName || '').toLowerCase());
        rideMap.set(key, {
          rideId: t.rideId,
          rideName: t.rideName || matchedRide?.name || 'Ride',
          floor: t.floor || matchedRide?.floor,
          solvedCount: 0,
          inProgressCount: 0,
          reportedCount: 0,
          tickets: []
        });
      }
      const entry = rideMap.get(key)!;
      entry.tickets.push(t);
      if (t.status === 'solved' && isTicketSolvedOnDate(t, selectedDate)) {
        entry.solvedCount++;
      } else if (t.status === 'in-progress') {
        entry.inProgressCount++;
      } else if (t.status === 'reported') {
        entry.reportedCount++;
      }
    });

    const rideBreakdown = Array.from(rideMap.values()).sort((a, b) => {
      const scoreB = b.solvedCount * 10 + b.inProgressCount * 5 + b.reportedCount;
      const scoreA = a.solvedCount * 10 + a.inProgressCount * 5 + a.reportedCount;
      return scoreB - scoreA;
    });

    return {
      reported: reportedTodayTickets.length,
      inProgress: inProgressTodayTickets.length,
      solved: solvedTodayTickets.length,
      totalToday: reportedTodayTickets.length + inProgressTodayTickets.length + solvedTodayTickets.length,
      allOpenReported: allOpenReported.length,
      allOpenInProgress: allOpenInProgress.length,
      solvedTickets: solvedTodayTickets,
      rideBreakdown
    };
  }, [allTicketsFlat, selectedDate, today, rides, isTicketSolvedOnDate, getTicketDate]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Bar: Live Synchronized Dhaka GMT+6 Clock & Date Navigator */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-850 to-gray-900 border border-purple-500/30 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Title & Live Clock */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-purple-900/40 border border-purple-400/40 flex-shrink-0">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Management Summary</h2>
              <span className="bg-purple-950 text-purple-300 border border-purple-800 text-[10px] uppercase font-black px-2 py-0.5 rounded-full">
                All-Roles Overview
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Consolidated real-time operational dashboard for Toggi Fun World leadership
            </p>
          </div>
        </div>

        {/* Live Synchronized Dhaka GMT +6 Clock & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Synchronized Dhaka Time Badge */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gray-950 border border-emerald-500/40 text-emerald-300 font-mono text-xs shadow-inner">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
            <span className="font-semibold text-gray-300">Dhaka (GMT +6):</span>
            <span className="font-black text-emerald-300 text-sm">{liveDhakaTime}</span>
          </div>

          {/* Date Selector */}
          <div className="flex items-center bg-gray-950 rounded-xl border border-gray-700 p-1">
            <button
              onClick={() => handleShiftDay(-1)}
              className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 px-2">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && onDateChange(e.target.value)}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer focus:text-purple-300"
              />
            </div>
            <button
              onClick={() => handleShiftDay(1)}
              className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {selectedDate !== today && (
            <button
              onClick={() => onDateChange(today)}
              className="px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Back to Today
            </button>
          )}

          {/* Sync Everywhere Button */}
          {onBroadcastSync && (
            <button
              type="button"
              onClick={onBroadcastSync}
              disabled={isBroadcastingSync}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-200 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
              title="Broadcast active operational date, view, and synchronize data everywhere across mobile and desktop devices"
            >
              <Radio className={`w-3.5 h-3.5 text-emerald-400 ${isBroadcastingSync ? 'animate-ping' : ''}`} />
              <span>{isBroadcastingSync ? 'Syncing...' : 'Sync Everywhere'}</span>
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl border border-gray-700 transition-colors cursor-pointer"
            title="Print or Save PDF Summary"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3 CORE SUMMARY BOXES ON ONE PAGE                                         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ------------------------------------------------------------- */}
        {/* BOX 1: OPERATIONS SUMMARY BOX                                  */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-gray-850 border border-purple-500/30 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-750">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/30">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base leading-tight">Operations Summary</h3>
                  <p className="text-[11px] text-gray-400">Operational Officer Report Sync & Guest Counts</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-bold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-lg border border-purple-800">
                  {opsStartDate === opsEndDate ? opsStartDate : `${opsStartDate} → ${opsEndDate}`}
                </span>
              </div>
            </div>

            {/* Date Range & Game Filter Controls (Operational Officer Report Sync) */}
            <div className="mt-3.5 bg-gray-900/90 border border-purple-500/30 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span>Date Range & Game Selection</span>
                </span>
                {/* Quick Presets */}
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      userHasCustomOpsRangeRef.current = false;
                      setOpsStartDate(selectedDate);
                      setOpsEndDate(selectedDate);
                    }}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer font-semibold ${
                      opsStartDate === selectedDate && opsEndDate === selectedDate
                        ? 'bg-purple-600 text-white shadow'
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}
                  >
                    Day
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      userHasCustomOpsRangeRef.current = true;
                      const end = new Date();
                      const start = new Date();
                      start.setDate(end.getDate() - 6);
                      setOpsStartDate(getDhakaDateString(start));
                      setOpsEndDate(getDhakaDateString(end));
                    }}
                    className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-all cursor-pointer font-semibold"
                  >
                    7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      userHasCustomOpsRangeRef.current = true;
                      const end = new Date();
                      const start = new Date();
                      start.setDate(end.getDate() - 29);
                      setOpsStartDate(getDhakaDateString(start));
                      setOpsEndDate(getDhakaDateString(end));
                    }}
                    className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-all cursor-pointer font-semibold"
                  >
                    30 Days
                  </button>
                </div>
              </div>

              {/* Date Inputs and Game Filter Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-400 font-semibold">From Date:</label>
                  <input
                    type="date"
                    value={opsStartDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        userHasCustomOpsRangeRef.current = true;
                        setOpsStartDate(e.target.value);
                      }
                    }}
                    className="bg-gray-950 text-white rounded-lg px-2.5 py-1.5 border border-gray-700 outline-none focus:border-purple-500 font-mono text-xs cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-400 font-semibold">To Date:</label>
                  <input
                    type="date"
                    value={opsEndDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        userHasCustomOpsRangeRef.current = true;
                        setOpsEndDate(e.target.value);
                      }
                    }}
                    className="bg-gray-950 text-white rounded-lg px-2.5 py-1.5 border border-gray-700 outline-none focus:border-purple-500 font-mono text-xs cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-400 font-semibold">Filter Game / Ride:</label>
                  <select
                    value={opsSelectedGameId}
                    onChange={(e) => setOpsSelectedGameId(e.target.value)}
                    className="bg-gray-950 text-white rounded-lg px-2.5 py-1.5 border border-gray-700 outline-none focus:border-purple-500 text-xs cursor-pointer truncate"
                  >
                    <option value="all">All Games & Rides</option>
                    {rides.map(r => (
                      <option key={r.id} value={String(r.id)}>
                        {r.name} {r.floor ? `(${r.floor})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Guest Attendance Breakdown: Strictly Summation of Package Entries + Ticket Entries */}
            <div className="mt-3.5 space-y-2.5">
              {/* 1. Package Entries in Range */}
              <div className="bg-gray-900/90 border border-gray-750 rounded-xl p-3 flex items-center justify-between hover:border-amber-500/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-gray-200">Package Entries:</span>
                  </div>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    {opsRangeDates.length > 1 ? `Date range summation (${opsRangeDates.length} days)` : 'Games & Ride Associate package inputs'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black font-mono text-amber-300">
                    {rangePackageGuests.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-amber-400/80 font-mono block">Package Entries</span>
                </div>
              </div>

              {/* 2. Ticket Entries in Range */}
              <div className="bg-gray-900/90 border border-gray-750 rounded-xl p-3 flex items-center justify-between hover:border-teal-500/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-teal-400" />
                    <span className="text-xs font-bold text-gray-200">Ticket Entries:</span>
                  </div>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    {opsRangeDates.length > 1 ? `Date range summation (${opsRangeDates.length} days)` : 'Games & Ride Associate ticket inputs'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black font-mono text-teal-300">
                    {rangeTicketGuests.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-teal-400/80 font-mono block">Ticket Entries</span>
                </div>
              </div>

              {/* 3. Total Guests in Range (Summation of Package Entries + Ticket Entries) */}
              <div className="bg-gradient-to-r from-purple-950/90 via-indigo-950/90 to-purple-950/90 border-2 border-purple-500/60 rounded-xl p-3.5 shadow-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-purple-200">
                        Total Guests in Range:
                      </span>
                    </div>
                    <span className="text-[10px] text-purple-300/90 font-mono mt-0.5 block">
                      Summation of Package ({rangePackageGuests.toLocaleString()}) + Ticket ({rangeTicketGuests.toLocaleString()})
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                      {rangeTotalGuests.toLocaleString()}
                    </span>
                    <span className="text-[9px] text-purple-300 uppercase font-bold tracking-wider block">Total Guests</span>
                  </div>
                </div>

                {/* Permanent Database Storage Action & Status */}
                <div className="pt-2 border-t border-purple-800/60 flex items-center justify-between flex-wrap gap-2 text-[10px]">
                  <div className="flex items-center gap-1.5 text-purple-300 font-mono">
                    <Save className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      {currentNotes?.operationalSummary?.savedAt ? (
                        <span className="text-emerald-400 font-bold">
                          Stored in DB (Total: {currentNotes.operationalSummary.totalGuestsInRange?.toLocaleString()} Guests)
                        </span>
                      ) : (
                        <span>Permanently stores total guests snapshot</span>
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveOperationalSummary}
                    className="px-2.5 py-1 rounded bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-bold cursor-pointer flex items-center gap-1 transition-all shadow"
                    title="Store this Total Guests in Range summation permanently in the database"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Save Summary to DB</span>
                  </button>
                </div>

                {opsSavedStatus && (
                  <div className="text-[10px] text-emerald-300 font-medium bg-emerald-950/80 border border-emerald-700 rounded px-2 py-0.5 flex items-center gap-1 animate-pulse">
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>{opsSavedStatus}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Ride & Associate Inputs Inspector Accordion */}
            <div className="mt-3.5 bg-gray-900 border border-purple-500/30 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAssociateInputs(!showAssociateInputs)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-gray-850/80 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-white">Ride & Associate Input Breakdown</span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.2 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                    {ridesWithInputCount} / {rideInputsList.length} recorded
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-purple-300">
                  <span className="text-[10px] hidden sm:inline">{showAssociateInputs ? 'Hide' : 'View Breakdown'}</span>
                  {showAssociateInputs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {showAssociateInputs && (
                <div className="p-3 border-t border-gray-800 space-y-2.5 bg-gray-950/80">
                  {/* Search / Filter for ride or associate */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={associateSearchTerm}
                      onChange={(e) => setAssociateSearchTerm(e.target.value)}
                      placeholder="Search ride or associate name..."
                      className="w-full bg-gray-900 text-white text-xs pl-8 pr-3 py-1.5 rounded-lg border border-gray-700 outline-none focus:border-purple-500 placeholder-gray-500"
                    />
                  </div>

                  {/* List of rides with associate names and counts */}
                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-gray-700">
                    {filteredRideInputsList.length > 0 ? (
                      filteredRideInputsList.map((item) => (
                        <div
                          key={String(item.rideId)}
                          className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                            item.hasInput 
                              ? 'bg-gray-900 border-purple-800/60' 
                              : 'bg-gray-900/40 border-gray-800/80 opacity-70'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white truncate">{item.rideName}</span>
                              {item.floor && (
                                <span className="text-[9px] text-gray-400 bg-gray-800 px-1.5 py-0.2 rounded border border-gray-700">
                                  {item.floor}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                              <UserCheck className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                              <span className="truncate">
                                {item.assignedAssociates.length > 0 
                                  ? item.assignedAssociates.map(op => op.name).join(', ')
                                  : <span className="italic text-gray-500">Unassigned</span>
                                }
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0 text-[11px] font-mono">
                            <span className="text-amber-300 bg-amber-950/70 border border-amber-800 px-1.5 py-0.5 rounded" title="Package guests">
                              Pkg: <strong>{item.packageCount}</strong>
                            </span>
                            <span className="text-teal-300 bg-teal-950/70 border border-teal-800 px-1.5 py-0.5 rounded" title="Ticket guests">
                              Tkt: <strong>{item.ticketCount}</strong>
                            </span>
                            <span className="text-white bg-purple-950/80 border border-purple-700 font-bold px-1.5 py-0.5 rounded" title="Total guests (Both Included)">
                              {item.totalGuestCount}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-gray-500 italic py-2 text-center">
                        No matching rides or associates found.
                      </p>
                    )}
                  </div>

                  {/* Summary bar */}
                  <div className="pt-2 border-t border-gray-800 flex items-center justify-between text-[11px] font-mono text-gray-300">
                    <span>Active Rides: <strong className="text-white">{ridesWithInputCount}</strong></span>
                    <span className="text-purple-300 font-bold">
                      {totalPackageGuests} Pkg + {totalTicketGuests} Tkt = {totalGuestsSum} Total
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Ride Associates Present Today */}
            <div className="mt-4 bg-gray-900/70 border border-gray-750 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-indigo-200">Ride Associates Present Today:</span>
                </div>
                <span className="text-xs font-black font-mono px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700">
                  {presentAssociates.length} / {totalAssociatesCount} Clocked In
                </span>
              </div>

              {/* Associates 1st Clock In Timestamps */}
              <div className="mt-2.5 max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-gray-700">
                {presentAssociates.length > 0 ? (
                  presentAssociates.map(({ operator, briefingTime, attendedBriefing }) => (
                    <div
                      key={operator.id}
                      className="flex items-center justify-between text-[11px] bg-gray-850 px-2.5 py-1.5 rounded-lg border border-gray-750/70"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"></span>
                        <span className="font-semibold text-white truncate">{operator.name}</span>
                        {attendedBriefing && (
                          <span className="text-[9px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800">
                            Briefing
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-gray-300 text-[10px] flex items-center gap-1 flex-shrink-0">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>1st In: {briefingTime || 'Present'}</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-gray-500 italic py-2 text-center">
                    No ride associates have clocked in yet for {selectedDate}.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Attraction Status Footer */}
          <div className="pt-3 border-t border-gray-750 flex items-center justify-between text-xs text-gray-400">
            <span>Rides: <strong className="text-emerald-400">{rideStatusSummary.active} Operational</strong></span>
            <span>Maintenance: <strong className="text-amber-400">{rideStatusSummary.maint} Under Repair</strong></span>
            <span>Total: <strong className="text-white">{rideStatusSummary.total}</strong></span>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* BOX 2: SALES & REVENUE SUMMARY BOX                             */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-gray-850 border border-emerald-500/30 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-750">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-white text-base leading-tight">Sales & Revenue</h3>
                    <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse"></span>
                      WhatsApp Sync
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">TFW Management Team (Closing Reports • Read-Only)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPasteModalOpen(true)}
                  className="text-[10px] font-bold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-750 border border-gray-700 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  title="Paste raw WhatsApp message if offline"
                >
                  <ClipboardPaste className="w-3 h-3 text-emerald-400" />
                  <span>Paste Report</span>
                </button>
                <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-800">
                  {currency}
                </span>
              </div>
            </div>

            {/* WhatsApp Group "TFW Management Team" Sales & Revenue Section */}
            <div className="mt-4 bg-gray-900 border-2 border-emerald-500/50 rounded-2xl p-4 shadow-xl space-y-3">
              {/* Date Range Filter Bar */}
              <div className="bg-gray-850/90 border border-gray-750/80 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-gray-300 flex items-center gap-1.5">
                    <CalendarRange className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Date Range Filter</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    {salesReportsInRange.length} {salesReportsInRange.length === 1 ? 'Report' : 'Reports'} Found
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Start Date</label>
                    <input
                      type="date"
                      value={salesRangeStart}
                      onChange={(e) => {
                        setSalesRangeStart(e.target.value);
                        setActiveSalesDayTab('aggregate');
                      }}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">End Date</label>
                    <input
                      type="date"
                      value={salesRangeEnd}
                      onChange={(e) => {
                        setSalesRangeEnd(e.target.value);
                        setActiveSalesDayTab('aggregate');
                      }}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Quick Date Presets */}
                <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setSalesRangeStart(selectedDate);
                      setSalesRangeEnd(selectedDate);
                      setActiveSalesDayTab('aggregate');
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      salesRangeStart === selectedDate && salesRangeEnd === selectedDate
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    Selected Date
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      const y = d.toISOString().split('T')[0];
                      setSalesRangeStart(y);
                      setSalesRangeEnd(y);
                      setActiveSalesDayTab('aggregate');
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-400 hover:text-white transition-colors"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      const end = d.toISOString().split('T')[0];
                      d.setDate(d.getDate() - 2);
                      const start = d.toISOString().split('T')[0];
                      setSalesRangeStart(start);
                      setSalesRangeEnd(end);
                      setActiveSalesDayTab('aggregate');
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-400 hover:text-white transition-colors"
                  >
                    Last 3 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      const end = d.toISOString().split('T')[0];
                      d.setDate(d.getDate() - 6);
                      const start = d.toISOString().split('T')[0];
                      setSalesRangeStart(start);
                      setSalesRangeEnd(end);
                      setActiveSalesDayTab('aggregate');
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-400 hover:text-white transition-colors"
                  >
                    Last 7 Days
                  </button>
                </div>
              </div>

              {/* Day selection tabs if multiple dates in range */}
              {salesReportsInRange.length > 1 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setActiveSalesDayTab('aggregate')}
                    className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                      activeSalesDayTab === 'aggregate'
                        ? 'bg-emerald-600 text-white font-bold shadow'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    Aggregated Total ({salesReportsInRange.length} Days)
                  </button>
                  {salesReportsInRange.map(r => (
                    <button
                      key={r.date}
                      type="button"
                      onClick={() => setActiveSalesDayTab(r.date)}
                      className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                        activeSalesDayTab === r.date
                          ? 'bg-emerald-600 text-white font-bold shadow'
                          : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      {r.date}
                    </button>
                  ))}
                </div>
              )}

              {/* WhatsApp Sales & Revenue Information (Including Total Foot Fall and Discount) */}
              {salesReportsInRange.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 px-1 uppercase tracking-wider">
                    <span>Closing Sales ({displayedSales.date})</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {displayedSales.isSingleDay ? 'Nightly 8:30 PM+ BST' : 'Aggregated Range'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-850/90 border border-gray-800">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-200 font-bold">Toggi Kiddo sale -</span>
                        {(displayedSales as any).kiddoPackageSold ? (
                          <span className="text-[10px] text-amber-300 font-semibold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60 font-sans">
                            {(displayedSales as any).kiddoPackageSold} pcs sold
                          </span>
                        ) : null}
                      </div>
                      <span className="text-amber-300 font-black text-sm">{formatTaka(displayedSales.toggiKiddoSale || 0)}</span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-850/90 border border-gray-800">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-200 font-bold">Toggi Xtreme sale -</span>
                        {(displayedSales as any).xtremePackageSold ? (
                          <span className="text-[10px] text-blue-300 font-semibold bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/60 font-sans">
                            {(displayedSales as any).xtremePackageSold} pcs sold
                          </span>
                        ) : null}
                      </div>
                      <span className="text-blue-300 font-black text-sm">{formatTaka(displayedSales.toggiXtremeSale || 0)}</span>
                    </div>

                    {((displayedSales.toggiVipConciergeSale || 0) > 0 || (displayedSales.entryTicketSale || 0) === 0) && (
                      <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-850/90 border border-gray-800">
                        <span className="text-gray-200 font-bold">Toggi VIP Concierge sale -</span>
                        <span className="text-purple-300 font-black text-sm">{formatTaka(displayedSales.toggiVipConciergeSale || 0)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-850/90 border border-gray-800">
                      <span className="text-gray-200 font-bold">Entry Ticket sale –</span>
                      <span className="text-cyan-300 font-black text-sm">{formatTaka(displayedSales.entryTicketSale || 0)}</span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40">
                      <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Total Foot Fall –</span>
                      </span>
                      <span className="text-emerald-300 font-black text-sm">
                        {(displayedSales.totalFootFall || 0).toLocaleString()} <span className="text-[10px] font-normal text-emerald-400/80">person</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-850/90 border border-gray-800">
                      <span className="text-gray-200 font-bold">Discount –</span>
                      <span className="text-red-300 font-black text-sm">
                        {(displayedSales.discount || 0) > 0 ? `-${formatTaka(displayedSales.discount)}` : formatTaka(0)}
                      </span>
                    </div>

                    {/* Total revenue Highlight */}
                    <div className="flex items-center justify-between py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-950 via-teal-950 to-emerald-950 border-2 border-emerald-500/70 shadow-lg mt-2">
                      <div>
                        <span className="text-emerald-200 font-black uppercase text-xs tracking-wider block">
                          Total revenue (day End) –
                        </span>
                        <span className="text-[10px] text-emerald-400/80 font-mono">
                          {displayedSales.isSingleDay ? 'Audited closing balance' : `Sum of ${salesReportsInRange.length} selected days`}
                        </span>
                      </div>
                      <span className="text-xl sm:text-2xl font-black text-emerald-300 font-mono">
                        {formatTaka(displayedSales.totalRevenue || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-850 border border-dashed border-gray-700 rounded-xl p-4 text-center space-y-2">
                  <Info className="w-5 h-5 text-gray-500 mx-auto" />
                  <p className="text-xs text-gray-400">
                    No closing report received from group <strong className="text-white">"TFW Management Team"</strong> for {salesRangeStart === salesRangeEnd ? salesRangeStart : `${salesRangeStart} to ${salesRangeEnd}`} yet.
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Messages arrive everyday after 8:30 PM BST. The app automatically listens and parses incoming reports.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsPasteModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Paste WhatsApp Report Now</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom quick totals card */}
          <div className="pt-3 border-t border-gray-750 flex items-center justify-between text-xs text-gray-400">
            <span>Total Foot Fall: <strong className="text-emerald-300 font-mono font-bold">{displayedSales.totalFootFall.toLocaleString()}</strong></span>
            <span>Discount: <strong className="text-red-300 font-mono font-bold">{formatTaka(displayedSales.discount)}</strong></span>
            <span>Revenue: <strong className="text-white font-mono font-bold">{formatTaka(displayedSales.totalRevenue)}</strong></span>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* BOX 3: MAINTENANCE & ENGINEERING SUMMARY BOX                   */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-gray-850 border border-amber-500/30 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-750">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-600/20 text-amber-300 border border-amber-500/30">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base leading-tight">Maintenance & Safety</h3>
                  <p className="text-[11px] text-gray-400">Issues, SPR Approvals & Approvals</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('maintenance-kpi')}
                    className="text-xs font-bold text-gray-950 bg-amber-500 hover:bg-amber-400 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                    title="Open One-Page Maintenance KPI & Technician Category Matrix Dashboard"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>KPI Matrix</span>
                  </button>
                )}
                <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-800">
                  Engineering
                </span>
              </div>
            </div>

            {/* Status Pills: Reported, In Progress, Solved */}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="bg-red-950/40 border border-red-500/30 p-2.5 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-red-400 block">Reported</span>
                <span className="text-2xl font-black font-mono text-red-300 mt-0.5 block">
                  {maintenanceSummary.reported}
                </span>
                <span className="text-[9px] text-gray-400">Open issues</span>
              </div>

              <div className="bg-amber-950/40 border border-amber-500/30 p-2.5 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-amber-400 block">In Progress</span>
                <span className="text-2xl font-black font-mono text-amber-300 mt-0.5 block">
                  {maintenanceSummary.inProgress}
                </span>
                <span className="text-[9px] text-gray-400">Servicing</span>
              </div>

              <div className="bg-emerald-950/40 border border-emerald-500/30 p-2.5 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">Solved</span>
                <span className="text-2xl font-black font-mono text-emerald-300 mt-0.5 block">
                  {maintenanceSummary.solved}
                </span>
                <span className="text-[9px] text-gray-400">Resolved today</span>
              </div>
            </div>

            {/* Ride-wise Maintenance Activity List & Solved Audit */}
            <div className="mt-4 bg-gray-900 border border-amber-500/30 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ride-Wise Issue & Solved Breakdown</span>
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  {maintenanceSummary.rideBreakdown.length} {maintenanceSummary.rideBreakdown.length === 1 ? 'ride' : 'rides'}
                </span>
              </div>

              {maintenanceSummary.rideBreakdown.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {maintenanceSummary.rideBreakdown.map((item) => {
                    const isExpanded = expandedRideKey === String(item.rideId);
                    return (
                      <div 
                        key={String(item.rideId)} 
                        className="bg-gray-850/90 border border-gray-750/80 rounded-lg p-2 transition-all hover:border-gray-600"
                      >
                        <div 
                          className="flex items-center justify-between cursor-pointer select-none"
                          onClick={() => setExpandedRideKey(isExpanded ? null : String(item.rideId))}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-semibold text-white text-xs truncate">
                              {item.rideName}
                            </span>
                            {item.floor && (
                              <span className="text-[9px] text-gray-400 bg-gray-800 px-1.5 py-0.2 rounded border border-gray-700">
                                {item.floor}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {item.solvedCount > 0 && (
                              <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/70 border border-emerald-700 px-1.5 py-0.5 rounded">
                                {item.solvedCount} Solved
                              </span>
                            )}
                            {item.inProgressCount > 0 && (
                              <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/70 border border-amber-700 px-1.5 py-0.5 rounded">
                                {item.inProgressCount} In Prog
                              </span>
                            )}
                            {item.reportedCount > 0 && (
                              <span className="text-[10px] font-mono font-bold text-red-300 bg-red-950/70 border border-red-700 px-1.5 py-0.5 rounded">
                                {item.reportedCount} Reported
                              </span>
                            )}
                            <button
                              type="button"
                              className="text-gray-400 hover:text-gray-200 ml-1 p-0.5"
                              title={isExpanded ? "Collapse" : "Expand tickets"}
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* Expandable tickets list with resolution details */}
                        {isExpanded && (
                          <div className="mt-2.5 pt-2 border-t border-gray-750/70 space-y-1.5">
                            {item.tickets.map((t) => (
                              <div key={t.id} className="text-[11px] bg-gray-900/90 rounded p-2 border border-gray-800">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-gray-200 font-medium break-words flex-1">
                                    {t.problem}
                                  </div>
                                  <span className={`text-[9px] uppercase font-bold font-mono px-1.5 py-0.2 rounded border flex-shrink-0 ${
                                    t.status === 'solved' 
                                      ? 'text-emerald-300 bg-emerald-950/60 border-emerald-800'
                                      : t.status === 'in-progress'
                                      ? 'text-amber-300 bg-amber-950/60 border-amber-800'
                                      : 'text-red-300 bg-red-950/60 border-red-800'
                                  }`}>
                                    {t.status}
                                  </span>
                                </div>
                                {t.status === 'solved' && (
                                  <div className="mt-1 text-[10px] text-emerald-400/90 flex flex-wrap gap-x-2 gap-y-0.5">
                                    {t.solvedAt && (
                                      <span className="font-mono">
                                        Time: {formatDhakaTime(new Date(t.solvedAt))}
                                      </span>
                                    )}
                                    {t.assignedToName && (
                                      <span>Technician: {t.assignedToName}</span>
                                    )}
                                    {t.resolutionNotes && (
                                      <span className="text-gray-300 italic w-full mt-0.5">
                                        Action: {t.resolutionNotes}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-gray-500 italic py-2 text-center">
                  All rides operating normally - no maintenance issues on {selectedDate}.
                </div>
              )}
            </div>

            {/* Interactive Manual Write Sections requested by User */}
            <div className="mt-4 space-y-4">
              {/* 1. SPR Required to Approve (Spare Parts Requisition) */}
              <div className="bg-gray-900/90 border border-amber-500/30 p-3.5 rounded-xl space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-amber-300">SPR Required to Approve</span>
                    <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full font-semibold">
                      {sprItems.length} {sprItems.length === 1 ? 'Item' : 'Items'}
                    </span>
                    {sprItems.filter(i => i.status === 'approved').length > 0 && (
                      <span className="text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded-full font-medium">
                        {sprItems.filter(i => i.status === 'approved').length} Approved
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleFreeform('spr')}
                      className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 bg-amber-950/50 hover:bg-amber-900/50 border border-amber-800/80 px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>{freeformMode.spr ? 'Switch to Options List' : 'Freeform Writing Mode'}</span>
                    </button>
                    <span className="text-[10px] text-gray-400">Spare Parts Requisitions</span>
                  </div>
                </div>

                {freeformMode.spr ? (
                  /* Freeform Writing Mode (letters & numbers) */
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={freeformSprText}
                      onChange={(e) => setFreeformSprText(e.target.value)}
                      placeholder="Write SPR requisitions, part codes, quantities or BDT amounts freely (e.g. SPR #104: 5x Sensor cables - 15,000 BDT)..."
                      rows={4}
                      className="w-full bg-gray-950 text-white rounded-lg p-3 text-xs border border-amber-600/50 outline-none focus:border-amber-400 placeholder-gray-500 font-mono"
                    />
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-gray-400">Supports letters, numbers, and multiple lines. Automatically converts to management list.</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFreeformMode(prev => ({ ...prev, spr: false }))}
                          className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveFreeform('spr')}
                          className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer flex items-center gap-1 shadow"
                        >
                          <Check className="w-3 h-3" />
                          <span>Save Requisitions</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Options List & Add Input */
                  <>
                    {/* Add Option Input Row (Letters & Numbers) */}
                    <div className="space-y-1">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newSprInput}
                          onChange={(e) => setNewSprInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddSprOption();
                            }
                          }}
                          placeholder="Write SPR requisition, item code, quantity or amount (letters & numbers)..."
                          className="flex-1 bg-gray-950 text-white rounded-lg px-3 py-2 text-xs border border-gray-700 outline-none focus:border-amber-500 placeholder-gray-500 font-medium"
                        />
                        <button
                          type="button"
                          onClick={handleAddSprOption}
                          className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3.5 py-2 rounded-lg font-bold flex items-center gap-1 transition-all active:scale-95 shadow cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Option</span>
                        </button>
                      </div>
                      <div className="text-[10px] text-gray-400 px-1">
                        Write letters or numbers (e.g., <span className="text-amber-300 font-mono">SPR-102: Bearing #6204 (4 pcs) - ৳8,500</span>). Press Enter or click Add Option.
                      </div>
                    </div>

                    {/* List of Added SPR Options */}
                    {sprItems.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {sprItems.map((item, idx) => (
                          <div 
                            key={item.id}
                            className="bg-gray-950/80 border border-gray-800 hover:border-gray-700 rounded-lg p-2 flex items-center justify-between gap-2 text-xs transition-all"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-amber-950/70 border border-amber-800/80 text-amber-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>

                              {editingItemId === item.id ? (
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <input
                                    type="text"
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveEdit('spr');
                                      } else if (e.key === 'Escape') {
                                        handleCancelEdit();
                                      }
                                    }}
                                    autoFocus
                                    className="flex-1 bg-gray-900 text-white px-2 py-1 rounded text-xs border border-amber-500 outline-none font-medium"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEdit('spr')}
                                    className="p-1 rounded bg-amber-600 hover:bg-amber-500 text-white"
                                    title="Save edit (Enter)"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
                                    title="Cancel (Esc)"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-gray-200 font-medium break-words flex-1">
                                  {item.text}
                                </span>
                              )}
                            </div>

                            {editingItemId !== item.id && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(item)}
                                  className="text-gray-400 hover:text-amber-300 p-1 rounded hover:bg-gray-800 transition-colors"
                                  title="Edit text/numbers"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleSprStatus(item.id)}
                                  title="Click to cycle status: Pending -> Approved -> Rejected"
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                                    item.status === 'approved'
                                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
                                      : item.status === 'rejected'
                                      ? 'bg-red-950 text-red-300 border-red-700 hover:bg-red-900'
                                      : 'bg-amber-950 text-amber-300 border-amber-700 hover:bg-amber-900'
                                  }`}
                                >
                                  {item.status === 'approved' ? 'Approved ✓' : item.status === 'rejected' ? 'Rejected ✗' : 'Pending Approval'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSprOption(item.id)}
                                  className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition-colors"
                                  title="Delete option"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-500 italic py-1 px-1">
                        No SPR items recorded yet. Type letters or numbers in the field above and click "Add Option".
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 2. Note Approval Required */}
              <div className="bg-gray-900/90 border border-indigo-500/30 p-3.5 rounded-xl space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-indigo-300">Note Approval Required</span>
                    <span className="text-[10px] bg-indigo-950/80 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                      {noteApprovalItems.length} {noteApprovalItems.length === 1 ? 'Item' : 'Items'}
                    </span>
                    {noteApprovalItems.filter(i => i.status === 'approved').length > 0 && (
                      <span className="text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded-full font-medium">
                        {noteApprovalItems.filter(i => i.status === 'approved').length} Approved
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleFreeform('note')}
                      className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-950/50 hover:bg-indigo-900/50 border border-indigo-800/80 px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>{freeformMode.note ? 'Switch to Options List' : 'Freeform Writing Mode'}</span>
                    </button>
                    <span className="text-[10px] text-gray-400">Executive Notes & Signoffs</span>
                  </div>
                </div>

                {freeformMode.note ? (
                  /* Freeform Writing Mode (letters & numbers) */
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={freeformNoteText}
                      onChange={(e) => setFreeformNoteText(e.target.value)}
                      placeholder="Write notes requiring approval, reference codes or details freely (e.g. Note #44: Overtime authorization for maintenance crew)..."
                      rows={4}
                      className="w-full bg-gray-950 text-white rounded-lg p-3 text-xs border border-indigo-600/50 outline-none focus:border-indigo-400 placeholder-gray-500 font-mono"
                    />
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-gray-400">Supports letters, numbers, and multiple lines. Automatically converts to management list.</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFreeformMode(prev => ({ ...prev, note: false }))}
                          className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveFreeform('note')}
                          className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer flex items-center gap-1 shadow"
                        >
                          <Check className="w-3 h-3" />
                          <span>Save Notes</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Options List & Add Input */
                  <>
                    {/* Add Option Input Row (Letters & Numbers) */}
                    <div className="space-y-1">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newNoteApprovalInput}
                          onChange={(e) => setNewNoteApprovalInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddNoteApprovalOption();
                            }
                          }}
                          placeholder="Write note requiring approval, reference number or description (letters & numbers)..."
                          className="flex-1 bg-gray-950 text-white rounded-lg px-3 py-2 text-xs border border-gray-700 outline-none focus:border-indigo-500 placeholder-gray-500 font-medium"
                        />
                        <button
                          type="button"
                          onClick={handleAddNoteApprovalOption}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3.5 py-2 rounded-lg font-bold flex items-center gap-1 transition-all active:scale-95 shadow cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Option</span>
                        </button>
                      </div>
                      <div className="text-[10px] text-gray-400 px-1">
                        Write letters or numbers (e.g., <span className="text-indigo-300 font-mono">Ref #409: Emergency lighting battery replacement signoff</span>). Press Enter or click Add Option.
                      </div>
                    </div>

                    {/* List of Added Note Approval Options */}
                    {noteApprovalItems.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {noteApprovalItems.map((item, idx) => (
                          <div 
                            key={item.id}
                            className="bg-gray-950/80 border border-gray-800 hover:border-gray-700 rounded-lg p-2 flex items-center justify-between gap-2 text-xs transition-all"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-indigo-950/70 border border-indigo-800/80 text-indigo-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>

                              {editingItemId === item.id ? (
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <input
                                    type="text"
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveEdit('note');
                                      } else if (e.key === 'Escape') {
                                        handleCancelEdit();
                                      }
                                    }}
                                    autoFocus
                                    className="flex-1 bg-gray-900 text-white px-2 py-1 rounded text-xs border border-indigo-500 outline-none font-medium"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEdit('note')}
                                    className="p-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white"
                                    title="Save edit (Enter)"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
                                    title="Cancel (Esc)"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-gray-200 font-medium break-words flex-1">
                                  {item.text}
                                </span>
                              )}
                            </div>

                            {editingItemId !== item.id && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(item)}
                                  className="text-gray-400 hover:text-indigo-300 p-1 rounded hover:bg-gray-800 transition-colors"
                                  title="Edit text/numbers"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleNoteApprovalStatus(item.id)}
                                  title="Click to cycle status: Pending -> Approved -> Rejected"
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                                    item.status === 'approved'
                                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
                                      : item.status === 'rejected'
                                      ? 'bg-red-950 text-red-300 border-red-700 hover:bg-red-900'
                                      : 'bg-indigo-950 text-indigo-300 border-indigo-700 hover:bg-indigo-900'
                                  }`}
                                >
                                  {item.status === 'approved' ? 'Approved ✓' : item.status === 'rejected' ? 'Rejected ✗' : 'Pending Approval'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveNoteApprovalOption(item.id)}
                                  className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition-colors"
                                  title="Delete option"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-500 italic py-1 px-1">
                        No note approval items recorded yet. Type letters or numbers in the field above and click "Add Option".
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 3. Others / Operational Remarks */}
              <div className="bg-gray-900/90 border border-gray-700/60 p-3.5 rounded-xl space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-bold text-gray-200">Others / Operational Remarks</span>
                    <span className="text-[10px] bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded-full font-semibold">
                      {othersItems.length} {othersItems.length === 1 ? 'Item' : 'Items'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleFreeform('others')}
                      className="text-[10px] font-semibold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>{freeformMode.others ? 'Switch to Options List' : 'Freeform Writing Mode'}</span>
                    </button>
                    <span className="text-[10px] text-gray-400">Handover & Special Notes</span>
                  </div>
                </div>

                {freeformMode.others ? (
                  /* Freeform Writing Mode (letters & numbers) */
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={freeformOthersText}
                      onChange={(e) => setFreeformOthersText(e.target.value)}
                      placeholder="Write operational remarks, observations, numbers or handover remarks freely..."
                      rows={4}
                      className="w-full bg-gray-950 text-white rounded-lg p-3 text-xs border border-gray-600 outline-none focus:border-gray-400 placeholder-gray-500 font-mono"
                    />
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-gray-400">Supports letters, numbers, and multiple lines. Automatically converts to management list.</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFreeformMode(prev => ({ ...prev, others: false }))}
                          className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveFreeform('others')}
                          className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white font-bold cursor-pointer flex items-center gap-1 shadow"
                        >
                          <Check className="w-3 h-3" />
                          <span>Save Remarks</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Options List & Add Input */
                  <>
                    {/* Add Option Input Row (Letters & Numbers) */}
                    <div className="space-y-1">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newOthersInput}
                          onChange={(e) => setNewOthersInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddOthersOption();
                            }
                          }}
                          placeholder="Write operational remark, handover observation, or number (letters & numbers)..."
                          className="flex-1 bg-gray-950 text-white rounded-lg px-3 py-2 text-xs border border-gray-700 outline-none focus:border-gray-500 placeholder-gray-500 font-medium"
                        />
                        <button
                          type="button"
                          onClick={handleAddOthersOption}
                          className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3.5 py-2 rounded-lg font-bold flex items-center gap-1 transition-all active:scale-95 shadow cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Option</span>
                        </button>
                      </div>
                      <div className="text-[10px] text-gray-400 px-1">
                        Write letters or numbers (e.g., <span className="text-gray-300 font-mono">Floor 8 shift handover at 10:30 PM: 14 rides checked, POS terminal #2 reset</span>). Press Enter or click Add Option.
                      </div>
                    </div>

                    {/* List of Added Remarks */}
                    {othersItems.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {othersItems.map((item, idx) => (
                          <div 
                            key={item.id}
                            className="bg-gray-950/80 border border-gray-800 hover:border-gray-700 rounded-lg p-2 flex items-center justify-between gap-2 text-xs transition-all"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-gray-800 border border-gray-700 text-gray-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>

                              {editingItemId === item.id ? (
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <input
                                    type="text"
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveEdit('others');
                                      } else if (e.key === 'Escape') {
                                        handleCancelEdit();
                                      }
                                    }}
                                    autoFocus
                                    className="flex-1 bg-gray-900 text-white px-2 py-1 rounded text-xs border border-gray-500 outline-none font-medium"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEdit('others')}
                                    className="p-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                                    title="Save edit (Enter)"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
                                    title="Cancel (Esc)"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-gray-200 font-medium break-words flex-1">
                                  {item.text}
                                </span>
                              )}
                            </div>

                            {editingItemId !== item.id && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(item)}
                                  className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
                                  title="Edit text/numbers"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleOthersStatus(item.id)}
                                  title="Click to toggle remark status"
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                                    item.status === 'completed'
                                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
                                      : item.status === 'in-progress'
                                      ? 'bg-amber-950 text-amber-300 border-amber-700 hover:bg-amber-900'
                                      : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                                  }`}
                                >
                                  {item.status === 'completed' ? 'Completed ✓' : item.status === 'in-progress' ? 'In Progress' : 'Noted'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOthersOption(item.id)}
                                  className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition-colors"
                                  title="Delete remark"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-500 italic py-1 px-1">
                        No operational remarks added yet. Type letters or numbers in the field above and click "Add Option".
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Save Button for Maintenance & Management Notes */}
          <div className="pt-3 border-t border-gray-750 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              {currentNotes.updatedBy ? `Updated by ${currentNotes.updatedBy}` : 'Real-time database persistence'}
            </span>
            <button
              onClick={() => handleSaveNotes()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md ${
                isSaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-600 hover:bg-amber-500 text-white active:scale-95'
              }`}
            >
              {isSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{isSaved ? 'Saved to Cloud!' : 'Save Approvals & Notes'}</span>
            </button>
          </div>
        </div>

      </div>

      {/* Counter & Cashier Breakdown Section with Date Range Filter */}
      <div className="bg-gray-850 border border-emerald-500/30 rounded-2xl p-5 shadow-xl space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-750 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-white text-base leading-tight">Counter & Cashier Breakdown</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse"></span>
                  WhatsApp Sync
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Nightly closing reports collected from WhatsApp group <strong className="text-emerald-300">"TFW Management Team"</strong> (after 8:30 PM BST • Read-Only)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsPasteModalOpen(true)}
              className="text-xs font-bold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-750 border border-gray-700 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Paste closing report text from WhatsApp"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400" />
              <span>Paste Closing Report</span>
            </button>

            <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-950/80 px-3 py-1.5 rounded-xl border border-emerald-800">
              Total: {formatTaka(aggregatedCountersData.grandTotal.totalRevenue || salesSummary.revenue)}
            </span>
          </div>
        </div>

        {/* Date Range Filter Bar for Counter & Cashier Breakdown */}
        <div className="bg-gray-900 border border-gray-750 rounded-xl p-3 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                Counter Date Range Filter:
              </span>
              <span className="text-gray-400 font-mono text-[11px]">
                {counterRangeStart === counterRangeEnd ? counterRangeStart : `${counterRangeStart} to ${counterRangeEnd}`}
              </span>
            </div>
            <span className="text-[11px] font-mono text-emerald-400">
              {counterReportsInRange.length} {counterReportsInRange.length === 1 ? 'Daily Report' : 'Daily Reports'} in Selected Range
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Start Date</label>
              <input
                type="date"
                value={counterRangeStart}
                onChange={(e) => setCounterRangeStart(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">End Date</label>
              <input
                type="date"
                value={counterRangeEnd}
                onChange={(e) => setCounterRangeEnd(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 flex flex-col justify-end">
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Quick Selectors</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCounterRangeStart(selectedDate);
                    setCounterRangeEnd(selectedDate);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    counterRangeStart === selectedDate && counterRangeEnd === selectedDate
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-gray-800 text-gray-300 hover:text-white'
                  }`}
                >
                  Selected Date
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 1);
                    const y = d.toISOString().split('T')[0];
                    setCounterRangeStart(y);
                    setCounterRangeEnd(y);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300 hover:text-white transition-colors"
                >
                  Yesterday
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const end = d.toISOString().split('T')[0];
                    d.setDate(d.getDate() - 2);
                    const start = d.toISOString().split('T')[0];
                    setCounterRangeStart(start);
                    setCounterRangeEnd(end);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300 hover:text-white transition-colors"
                >
                  Last 3 Days
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const end = d.toISOString().split('T')[0];
                    d.setDate(d.getDate() - 6);
                    const start = d.toISOString().split('T')[0];
                    setCounterRangeStart(start);
                    setCounterRangeEnd(end);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300 hover:text-white transition-colors"
                >
                  Last 7 Days
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Counter Wise Information Grid (Exact User Specification) */}
        {aggregatedCountersData.counters.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
              {aggregatedCountersData.counters.map(counter => (
                <div
                  key={counter.counterName}
                  className="bg-gray-900 border-2 border-emerald-500/40 hover:border-emerald-500/70 transition-all rounded-xl p-4 shadow-md flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-3">
                    <span className="font-extrabold text-white text-base tracking-wide flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                      <span className="flex flex-col leading-tight">
                        <span>{counter.counterName}</span>
                        {counter.details && (
                          <span className="text-[11px] font-medium text-gray-400 tracking-normal">{counter.details}</span>
                        )}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                      TFW Counter
                    </span>
                  </div>

                  {/* Exact layout requested by user:
                      Level 10
                      Individual sales: 22,650/=
                      Kiddo pack ratio : 1,100/=
                      Xtreme pack ratio: 10,500/=
                      Total Revenue : 34,250/=
                  */}
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between text-gray-300">
                      <span className="text-gray-400 font-medium">Individual sales:</span>
                      <span className="font-bold text-white text-sm">{formatTaka(counter.individualSales)}</span>
                    </div>

                    <div className="flex items-center justify-between text-gray-300">
                      <span className="text-gray-400 font-medium">Kiddo pack ratio :</span>
                      <span className="font-bold text-amber-300 text-sm">{formatTaka(counter.kiddoPackRatio)}</span>
                    </div>

                    <div className="flex items-center justify-between text-gray-300">
                      <span className="text-gray-400 font-medium">Xtreme pack ratio:</span>
                      <span className="font-bold text-blue-300 text-sm">{formatTaka(counter.xtremePackRatio)}</span>
                    </div>

                    <div className="flex items-center justify-between pt-2.5 border-t border-gray-800/80 mt-1">
                      <span className="font-black text-emerald-300 text-xs uppercase tracking-wider">Total Revenue :</span>
                      <span className="font-black text-emerald-400 text-base">{formatTaka(counter.totalRevenue)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total Counter Summary Footer */}
            <div className="bg-gradient-to-r from-emerald-950/70 via-gray-900 to-emerald-950/70 border border-emerald-500/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 font-semibold">Total Individual:</span>
                <strong className="text-white font-bold">{formatTaka(aggregatedCountersData.grandTotal.individualSales)}</strong>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 font-semibold">Total Kiddo Ratio:</span>
                <strong className="text-amber-300 font-bold">{formatTaka(aggregatedCountersData.grandTotal.kiddoPackRatio)}</strong>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 font-semibold">Total Xtreme Ratio:</span>
                <strong className="text-blue-300 font-bold">{formatTaka(aggregatedCountersData.grandTotal.xtremePackRatio)}</strong>
              </div>
              <div className="flex items-center gap-2 bg-emerald-900/60 px-3 py-1 rounded-lg border border-emerald-500/60">
                <span className="text-emerald-200 font-extrabold uppercase text-[11px]">Grand Total Counter Revenue:</span>
                <strong className="text-emerald-300 font-black text-sm">{formatTaka(aggregatedCountersData.grandTotal.totalRevenue)}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-6 text-center space-y-2">
            <Info className="w-6 h-6 text-gray-500 mx-auto" />
            <p className="text-sm font-semibold text-gray-300">
              No counter breakdown report received from WhatsApp group <strong className="text-emerald-300">"TFW Management Team"</strong> for {counterRangeStart === counterRangeEnd ? counterRangeStart : `${counterRangeStart} to ${counterRangeEnd}`}.
            </p>
            <p className="text-xs text-gray-400 max-w-lg mx-auto">
              Everyday messages arrive in the group after 8:30 PM BST. The application automatically listens and parses counter statistics into this view without sending any WhatsApp messages.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-700 px-4 py-2 rounded-xl transition-colors cursor-pointer shadow"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>Paste WhatsApp Closing Message</span>
              </button>
            </div>
          </div>
        )}

        {/* Collapsible reference: Internal POS Terminal Cashiers */}
        <div className="pt-3 border-t border-gray-750">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer select-none text-xs text-gray-400 hover:text-gray-200">
              <span className="flex items-center gap-1.5 font-semibold">
                <Tag className="w-3.5 h-3.5 text-gray-400" />
                <span>Internal System POS Terminal Registers ({selectedDate})</span>
              </span>
              <span className="text-[11px] text-gray-500 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 mt-3 pt-2 border-t border-gray-800">
              {counters.map(counter => {
                const dateSales = ticketSalesData[selectedDate] || {};
                const amt = dateSales[counter.id] ?? dateSales[String(counter.id)] ?? 0;
                return (
                  <div key={counter.id} className="bg-gray-900/80 border border-gray-800 p-2.5 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <span className="text-gray-300 font-medium block truncate">{counter.name}</span>
                      <span className="text-[10px] text-gray-500 font-mono">Counter #{counter.id}</span>
                    </div>
                    <span className="text-xs font-bold font-mono text-gray-200">
                      {formatTaka(Number(amt))}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      </div>

      {/* Manual Paste WhatsApp Report Modal */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-900 border-2 border-emerald-500/60 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Paste WhatsApp Closing Report</h3>
                  <p className="text-xs text-gray-400">
                    Group: <strong className="text-emerald-300">TFW Management Team</strong> • Read-Only (Zero WhatsApp messages sent)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPasteModalOpen(false);
                  setPasteError(null);
                  setPasteSuccess(null);
                }}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-300 block">
                Message Text (Copy & Paste from WhatsApp):
              </label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`Example message format:\n\nTFW Management Team Daily Sales Closing\nDate: 16-09-2026\nTime: 09:18 PM BST\n\nSales & Revenue:\nToggi Kiddo sale - 1,45,000/=\nToggi Xtreme sale - 2,80,000/=\nToggi VIP Concierge sale - 45,000/=\nEntry Ticket sale – 65,000/=\nDiscount – 12,000/=\nTotal revenue – 5,23,000/=\n\nCounter & Cashier Breakdown:\nLevel 10\nIndividual sales: 22,650/=\nKiddo pack ratio : 1,100/=\nXtreme pack ratio: 10,500/=\nTotal Revenue : 34,250/=`}
                rows={10}
                className="w-full bg-gray-950 text-white font-mono text-xs rounded-xl p-3.5 border border-gray-700 outline-none focus:border-emerald-500 placeholder-gray-600 resize-y"
              />
            </div>

            {pasteError && (
              <div className="bg-red-950/60 border border-red-500/60 text-red-300 text-xs p-3 rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{pasteError}</span>
              </div>
            )}

            {pasteSuccess && (
              <div className="bg-emerald-950/60 border border-emerald-500/60 text-emerald-300 text-xs p-3 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{pasteSuccess}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-gray-800">
              <span className="text-[11px] text-gray-400">
                ⚡ Automatically parses Sales & Revenue and Basement 01, Level - 01, and Level 8-17 Counter Breakdown.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPasteModalOpen(false);
                    setPasteError(null);
                    setPasteSuccess(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-800 hover:bg-gray-750 text-gray-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleManualPasteSubmit}
                  disabled={isSubmittingPaste || !pasteText.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  {isSubmittingPaste ? (
                    <span>Parsing...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Parse & Save Report</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
