import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Tag, 
  Layers, 
  Edit2, 
  Save, 
  CheckCircle2, 
  Database,
  MessageSquare,
  HeartHandshake,
  Clock,
  RefreshCw,
  AlertTriangle,
  Users,
  Code2,
  Terminal,
  Copy,
  Check,
  Play,
  Download
} from 'lucide-react';
import { PackageItem, MaintenanceTicket } from '../types';
import { DEFAULT_PACKAGES, DEFAULT_OTHER_SALES_CATEGORIES } from '../constants';

export const SalesOfficerDashboard = ({ 
  ticketSalesPersonnel = [], 
  packageSales = {}, 
  startDate, 
  endDate, 
  onStartDateChange, 
  onEndDateChange, 
  role = 'sales-officer',
  onEditSales,
  otherSalesCategories = [],
  currency = 'BDT',
  availablePackages = [],
  currentUser,
  onSaveOtherSalesCategories,
  onAddOtherSalesCategory,
  onDeleteOtherSalesCategory,
  initialTab = 'records',
  onNavigate,
  maintenanceTickets = {},
  onUpdateTicketStatus
}: any) => {
  const packagesList: PackageItem[] = availablePackages && availablePackages.length > 0 ? availablePackages : DEFAULT_PACKAGES;

  const [activeTab, setActiveTab] = useState<'records' | 'category-wise' | 'cx-feedback' | 'ticket-api'>(
    initialTab === 'category-wise' ? 'category-wise' : initialTab === 'cx-feedback' ? 'cx-feedback' : initialTab === 'ticket-api' ? 'ticket-api' : 'records'
  );
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab === 'category-wise' ? 'category-wise' : initialTab === 'cx-feedback' ? 'cx-feedback' : initialTab === 'ticket-api' ? 'ticket-api' : 'records');
    }
  }, [initialTab]);

  // Ticket Sales API Tester State
  const [apiTestLoading, setApiTestLoading] = useState(false);
  const [apiTestResponse, setApiTestResponse] = useState<any>(null);
  const [apiTestCounterId, setApiTestCounterId] = useState<number | string>(1);
  const [apiTestCount, setApiTestCount] = useState<number>(5);
  const [apiTestAction, setApiTestAction] = useState<string>('increment');
  const [apiTestReason, setApiTestReason] = useState<string>('Customer cancellation');
  const [apiCopiedEndpoint, setApiCopiedEndpoint] = useState<string | null>(null);
  const [apiSubTab, setApiSubTab] = useState<'tester' | 'dotnet' | 'standalone'>('tester');

  // CX Feedback Management State for Sales Executive
  const [cxFilter, setCxFilter] = useState<'all' | 'reported' | 'in-progress' | 'solved'>('all');
  const [solvingTicket, setSolvingTicket] = useState<MaintenanceTicket | null>(null);
  const [resolutionRemarks, setResolutionRemarks] = useState('');
  const [isSolving, setIsSolving] = useState(false);

  // Extract all CX feedback tickets routed to Sales Executive (or both)
  const salesCxTickets = useMemo(() => {
    if (!maintenanceTickets) return [];
    const flat: MaintenanceTicket[] = [];
    Object.entries(maintenanceTickets).forEach(([dKey, byId]) => {
      if (byId && typeof byId === 'object') {
        Object.values(byId).forEach((ticket: any) => {
          if (ticket && typeof ticket === 'object') {
            const isCX = ticket.source === 'cx' || 
              (ticket.reportedByRole || '').toLowerCase().includes('cx') ||
              (ticket.reportedByRole || '').toLowerCase().includes('customer experience') ||
              (ticket.reportedByName || '').toLowerCase().includes('customer experience');
            if (isCX) {
              const target = ticket.targetDepartment || 'both';
              if (target === 'both' || target === 'sales-officer') {
                flat.push({ ...ticket, date: ticket.date || dKey });
              }
            }
          }
        });
      }
    });
    return flat.sort((a, b) => new Date(b.reportedAt || 0).getTime() - new Date(a.reportedAt || 0).getTime());
  }, [maintenanceTickets]);

  const displayedSalesCxTickets = useMemo(() => {
    if (cxFilter === 'all') return salesCxTickets;
    return salesCxTickets.filter(t => t.status === cxFilter);
  }, [salesCxTickets, cxFilter]);

  const pendingSalesCxCount = salesCxTickets.filter(t => t.status !== 'solved').length;
  const inProgressSalesCxCount = salesCxTickets.filter(t => t.status === 'in-progress').length;
  const solvedSalesCxCount = salesCxTickets.filter(t => t.status === 'solved').length;

  const handleMarkInProgress = (ticket: MaintenanceTicket) => {
    if (!onUpdateTicketStatus) return;
    onUpdateTicketStatus(
      ticket,
      'in-progress',
      { id: currentUser?.id || 902, name: currentUser?.name || 'Sales Executive', role: 'Sales Executive' },
      [],
      'Sales Executive initiated review & action'
    );
  };

  const handleConfirmSolve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!solvingTicket || !onUpdateTicketStatus) return;
    setIsSolving(true);
    try {
      onUpdateTicketStatus(
        solvingTicket,
        'solved',
        { id: currentUser?.id || 902, name: currentUser?.name || 'Sales Executive', role: 'Sales Executive' },
        [],
        resolutionRemarks.trim() || 'Ticketing / package issue investigated and solved by Sales Executive'
      );
      setSolvingTicket(null);
      setResolutionRemarks('');
    } finally {
      setIsSolving(false);
    }
  };

  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryMessage, setCategoryMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ original: string; name: string } | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('ALL');

  const [modalNewCatOpen, setModalNewCatOpen] = useState(false);
  const [modalNewCatName, setModalNewCatName] = useState('');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editDate, setEditDate] = useState<string>(endDate || new Date().toISOString().split('T')[0]);
  const [editPersonnelId, setEditPersonnelId] = useState<number>(ticketSalesPersonnel[0]?.id || 1);
  const [editPackages, setEditPackages] = useState<Record<string, number>>({});
  const [editOtherSales, setEditOtherSales] = useState<Array<{
    category: string;
    customName?: string;
    amount: number;
    baseAmount?: number;
    discount?: string;
    description?: string;
  }>>([]);
  const [editSaveStatus, setEditSaveStatus] = useState<'idle' | 'saved' | 'saving'>('idle');

  const aggregatedData = useMemo(() => {
    const totals: Record<number, number> = {};
    const records: any[] = [];
    Object.keys(packageSales || {}).forEach(date => {
      if (date >= startDate && date <= endDate) {
        Object.entries(packageSales[date] || {}).forEach(([pId, data]: [string, any]) => {
          const id = Number(pId);
          totals[id] = (totals[id] || 0) + (data.total || 0);
          records.push({ date, personnelId: id, ...data });
        });
      }
    });
    return { totals, records };
  }, [packageSales, startDate, endDate]);

  const computeDiscountAndAmount = (base: number, discountRaw: string | number | undefined) => {
    const basePrice = Math.max(0, Number(base) || 0);
    if (!discountRaw && discountRaw !== 0) {
      return { discountPercent: 0, discountValue: 0, finalAmount: basePrice };
    }
    const str = String(discountRaw).trim();
    if (!str) return { discountPercent: 0, discountValue: 0, finalAmount: basePrice };

    let discountPercent = 0;
    let discountValue = 0;
    if (str.includes('%')) {
      const parsed = parseFloat(str.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed)) {
        discountPercent = parsed;
        discountValue = Math.round((basePrice * parsed) / 100);
      }
    } else {
      const num = parseFloat(str);
      if (!isNaN(num)) {
        if (num <= 100) {
          discountPercent = num;
          discountValue = Math.round((basePrice * num) / 100);
        } else {
          discountValue = Math.round(num);
          discountPercent = basePrice > 0 ? Math.round((num / basePrice) * 100) : 0;
        }
      }
    }
    const finalAmount = Math.max(0, Math.round(basePrice - discountValue));
    return { discountPercent, discountValue, finalAmount };
  };

  // Category management handlers for Sales Officer
  const handleCreateCategory = (nameToCreate?: string) => {
    const target = (typeof nameToCreate === 'string' ? nameToCreate : newCategoryName).trim();
    if (!target) {
      setCategoryMessage({ type: 'error', text: 'Please enter a category name.' });
      return;
    }
    const exists = otherSalesCategories.some((c: string) => c.toLowerCase() === target.toLowerCase());
    if (exists) {
      setCategoryMessage({ type: 'error', text: `Category "${target}" already exists.` });
      return;
    }
    if (onAddOtherSalesCategory) {
      onAddOtherSalesCategory(target);
    } else if (onSaveOtherSalesCategories) {
      onSaveOtherSalesCategories([...otherSalesCategories, target]);
    }
    setNewCategoryName('');
    setCategoryMessage({ type: 'success', text: `Category "${target}" created successfully!` });
    setTimeout(() => setCategoryMessage(null), 4000);
  };

  const handleDeleteCategory = (catName: string) => {
    if (onDeleteOtherSalesCategory) {
      onDeleteOtherSalesCategory(catName);
    } else if (onSaveOtherSalesCategories) {
      onSaveOtherSalesCategories(otherSalesCategories.filter((c: string) => c.toLowerCase() !== catName.toLowerCase()));
    }
    setCategoryMessage({ type: 'success', text: `Category "${catName}" removed.` });
    setTimeout(() => setCategoryMessage(null), 3000);
  };

  const handleRenameCategory = (original: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed.toLowerCase() === original.toLowerCase()) {
      setEditingCategory(null);
      return;
    }
    if (otherSalesCategories.some((c: string) => c.toLowerCase() === trimmed.toLowerCase() && c.toLowerCase() !== original.toLowerCase())) {
      setCategoryMessage({ type: 'error', text: `Category "${trimmed}" already exists.` });
      return;
    }
    const updated = otherSalesCategories.map((c: string) => c === original ? trimmed : c);
    if (onSaveOtherSalesCategories) {
      onSaveOtherSalesCategories(updated);
    }
    setEditingCategory(null);
    setCategoryMessage({ type: 'success', text: `Category renamed to "${trimmed}".` });
    setTimeout(() => setCategoryMessage(null), 3000);
  };

  // Detailed Other Sales breakdown by category across all dates in range
  const otherSalesCategoryBreakdown = useMemo(() => {
    const baseCats: string[] = otherSalesCategories && otherSalesCategories.length > 0 
      ? otherSalesCategories 
      : DEFAULT_OTHER_SALES_CATEGORIES;

    const catMap = new Map<string, {
      category: string;
      isConfigured: boolean;
      totalAmount: number;
      totalCount: number;
      contributors: Record<string, { name: string; amount: number; count: number }>;
      records: Array<{
        date: string;
        personnelId: number;
        personnelName: string;
        amount: number;
        baseAmount?: number;
        discount?: string;
        description?: string;
        customName?: string;
      }>;
    }>();

    baseCats.forEach(cat => {
      catMap.set(cat.toLowerCase(), {
        category: cat,
        isConfigured: true,
        totalAmount: 0,
        totalCount: 0,
        contributors: {},
        records: []
      });
    });

    Object.keys(packageSales || {}).forEach(date => {
      if (date >= startDate && date <= endDate) {
        Object.entries(packageSales[date] || {}).forEach(([pId, data]: [string, any]) => {
          const id = Number(pId);
          const person = ticketSalesPersonnel.find((p: any) => p.id === id);
          const personName = person?.name || `Staff #${id}`;

          if (Array.isArray(data?.otherSales)) {
            data.otherSales.forEach((item: any) => {
              const rawCat = (item.category || 'General').trim();
              const key = rawCat.toLowerCase();
              const amt = Number(item.amount) || 0;

              if (!catMap.has(key)) {
                catMap.set(key, {
                  category: rawCat,
                  isConfigured: baseCats.some(bc => bc.toLowerCase() === key),
                  totalAmount: 0,
                  totalCount: 0,
                  contributors: {},
                  records: []
                });
              }

              const entry = catMap.get(key)!;
              entry.totalCount += 1;
              entry.totalAmount += amt;

              if (!entry.contributors[pId]) {
                entry.contributors[pId] = { name: personName, amount: 0, count: 0 };
              }
              entry.contributors[pId].amount += amt;
              entry.contributors[pId].count += 1;

              entry.records.push({
                date,
                personnelId: id,
                personnelName: personName,
                amount: amt,
                baseAmount: item.baseAmount,
                discount: item.discount,
                description: item.description,
                customName: item.customName
              });
            });
          }
        });
      }
    });

    const list = Array.from(catMap.values()).sort((a, b) => {
      if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
      return a.category.localeCompare(b.category);
    });

    const grandTotalAmount = list.reduce((sum, c) => sum + c.totalAmount, 0);
    const grandTotalCount = list.reduce((sum, c) => sum + c.totalCount, 0);
    const topCategory = list.find(c => c.totalAmount > 0) || null;

    return { list, grandTotalAmount, grandTotalCount, topCategory };
  }, [packageSales, startDate, endDate, otherSalesCategories, ticketSalesPersonnel]);

  // Filtered transactions for Category View
  const filteredCategoryTransactions = useMemo(() => {
    let allRecords: Array<{
      date: string;
      category: string;
      personnelId: number;
      personnelName: string;
      amount: number;
      baseAmount?: number;
      discount?: string;
      description?: string;
      customName?: string;
    }> = [];

    otherSalesCategoryBreakdown.list.forEach(c => {
      if (selectedFilterCategory === 'ALL' || c.category.toLowerCase() === selectedFilterCategory.toLowerCase()) {
        c.records.forEach(r => {
          allRecords.push({ ...r, category: c.category });
        });
      }
    });

    if (categorySearch.trim()) {
      const q = categorySearch.toLowerCase().trim();
      allRecords = allRecords.filter(r => 
        r.category.toLowerCase().includes(q) ||
        r.personnelName.toLowerCase().includes(q) ||
        (r.customName && r.customName.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q))
      );
    }

    return allRecords.sort((a, b) => b.date.localeCompare(a.date));
  }, [otherSalesCategoryBreakdown, selectedFilterCategory, categorySearch]);

  const loadRecordForEdit = (date: string, pId: number) => {
    setEditDate(date);
    setEditPersonnelId(pId);
    const existing = packageSales[date]?.[pId] || {};
    setEditPackages(existing.packages || {});

    const rawOther = existing.otherSales || [];
    setEditOtherSales(rawOther.map((item: any) => {
      const isCustom = !packagesList.some(p => p.name === item.category) || item.category === '__CUSTOM_NEW_SALE__';
      const isKnownCategory = otherSalesCategories.includes(item.category);
      const customName = item.customName !== undefined 
        ? item.customName 
        : (isCustom && item.category !== '__CUSTOM_NEW_SALE__' && !isKnownCategory ? item.category : '');

      return {
        category: item.category || (otherSalesCategories[0] || packagesList[0]?.name || 'General'),
        customName,
        amount: item.amount !== undefined ? Number(item.amount) : (item.baseAmount || 0),
        baseAmount: item.baseAmount,
        discount: item.discount || '',
        description: item.description || ''
      };
    }));
    setEditSaveStatus('idle');
    setEditModalOpen(true);
  };

  const handleEditPackageChange = (name: string, val: string) => {
    setEditPackages(prev => ({ ...prev, [name]: Number(val) }));
    setEditSaveStatus('idle');
  };

  const handleEditOtherAdd = () => {
    const defaultCat = otherSalesCategories[0] || (packagesList[0] ? packagesList[0].name : '__CUSTOM_NEW_SALE__');
    const matchedPkg = packagesList.find(p => p.name === defaultCat);
    const initialBase = matchedPkg ? matchedPkg.price : 0;
    setEditOtherSales(prev => [
      ...prev,
      {
        category: defaultCat,
        customName: '',
        baseAmount: initialBase,
        discount: '',
        amount: initialBase,
        description: ''
      }
    ]);
    setEditSaveStatus('idle');
  };

  const handleEditOtherCategoryChange = (idx: number, catName: string) => {
    setEditOtherSales(prev => {
      const updated = [...prev];
      const current = updated[idx];
      if (!current) return prev;
      if (catName === '__CUSTOM_NEW_SALE__') {
        const customNameVal = current.customName || '';
        updated[idx] = {
          ...current,
          category: customNameVal.trim() ? customNameVal.trim() : '__CUSTOM_NEW_SALE__',
          customName: customNameVal,
          baseAmount: 0,
          amount: current.amount || 0,
          description: customNameVal.trim() ? `Custom sale: ${customNameVal.trim()}` : 'New custom sale'
        };
      } else if (otherSalesCategories.includes(catName)) {
        updated[idx] = {
          ...current,
          category: catName,
          customName: current.customName || '',
          baseAmount: current.baseAmount || current.amount || 0,
          amount: current.amount || 0,
          description: current.description || catName
        };
      } else {
        const matchedPkg = packagesList.find(p => p.name === catName);
        const base = matchedPkg ? matchedPkg.price : (current.baseAmount || current.amount || 0);
        const { finalAmount } = computeDiscountAndAmount(base, current.discount);
        updated[idx] = {
          ...current,
          category: catName,
          customName: '',
          baseAmount: base,
          amount: finalAmount,
          description: current.discount ? `${current.discount}% discount` : ''
        };
      }
      return updated;
    });
    setEditSaveStatus('idle');
  };

  const handleEditOtherCustomNameChange = (idx: number, name: string) => {
    setEditOtherSales(prev => {
      const updated = [...prev];
      if (!updated[idx]) return prev;
      const current = updated[idx];
      const isKnownCategory = otherSalesCategories.includes(current.category) || packagesList.some(p => p.name === current.category);
      updated[idx] = {
        ...current,
        customName: name,
        category: isKnownCategory ? current.category : (name.trim() ? name.trim() : '__CUSTOM_NEW_SALE__'),
        description: name.trim() ? `Sale: ${name.trim()}` : (current.description || 'Custom sale')
      };
      return updated;
    });
    setEditSaveStatus('idle');
  };

  const handleEditOtherDiscountChange = (idx: number, discountVal: string) => {
    const updated = [...editOtherSales];
    const current = updated[idx];
    let base = current.baseAmount;
    if (base === undefined || base === 0) {
      const matchedPkg = packagesList.find(p => p.name === current.category);
      base = matchedPkg ? matchedPkg.price : (current.amount || 0);
    }
    const { finalAmount } = computeDiscountAndAmount(base, discountVal);
    updated[idx] = {
      ...current,
      baseAmount: base,
      discount: discountVal,
      amount: finalAmount,
      description: discountVal ? `${discountVal}% discount` : ''
    };
    setEditOtherSales(updated);
    setEditSaveStatus('idle');
  };

  const handleEditOtherAmountChange = (idx: number, val: string) => {
    const updated = [...editOtherSales];
    const num = Number(val) || 0;
    updated[idx] = {
      ...updated[idx],
      amount: num,
      baseAmount: !updated[idx].discount ? num : (updated[idx].baseAmount || num)
    };
    setEditOtherSales(updated);
    setEditSaveStatus('idle');
  };

  const handleEditOtherRemove = (idx: number) => {
    setEditOtherSales(prev => prev.filter((_, i) => i !== idx));
    setEditSaveStatus('idle');
  };

  const calculateEditTotal = () => {
    let total = 0;
    packagesList.forEach(pkg => {
      const count = Number(editPackages[pkg.name] || 0);
      total += count * (pkg.price || 0);
    });
    editOtherSales.forEach(s => total += Number(s.amount || 0));
    return total;
  };

  const handleSaveEditRecord = () => {
    if (!onEditSales) return;
    setEditSaveStatus('saving');
    const total = calculateEditTotal();
    const sanitized = editOtherSales.map(item => {
      const isKnownCategory = otherSalesCategories.includes(item.category);
      const isCustom = !isKnownCategory && (!packagesList.some(p => p.name === item.category) || item.category === '__CUSTOM_NEW_SALE__');
      const resolvedName = isKnownCategory
        ? item.category
        : (isCustom ? (item.customName?.trim() || (item.category !== '__CUSTOM_NEW_SALE__' ? item.category : 'Custom Sale')) : item.category);
      return {
        ...item,
        category: resolvedName,
        customName: item.customName !== undefined ? item.customName : (isCustom ? resolvedName : '')
      };
    });
    onEditSales(editDate, editPersonnelId, {
      packages: editPackages,
      otherSales: sanitized,
      total
    });
    setEditSaveStatus('saved');
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Top Header */}
      <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">Sales Executive Dashboard</h2>
            <span className="bg-teal-900/60 text-teal-300 border border-teal-700/60 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              Duty Officer
            </span>
          </div>
          <p className="text-gray-400 text-xs mt-1">
            Review personnel package sales, manage Other Sales categories, and record adjustments directly to database
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-900/80 px-3 py-1.5 rounded-xl border border-gray-700 text-xs">
            <span className="text-gray-400 font-medium">From:</span>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => onStartDateChange(e.target.value)} 
              className="bg-transparent text-white outline-none cursor-pointer" 
            />
            <span className="text-gray-400 font-medium ml-1">To:</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => onEndDateChange(e.target.value)} 
              className="bg-transparent text-white outline-none cursor-pointer" 
            />
          </div>

          <button
            type="button"
            onClick={() => loadRecordForEdit(endDate, ticketSalesPersonnel[0]?.id || 1)}
            className="bg-teal-600 hover:bg-teal-500 active:scale-95 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg shadow-teal-900/40 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record / Enter Sales</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-gray-700 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('records')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'records'
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/30'
              : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-750'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>All Sales Records & History</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('category-wise')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'category-wise'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
              : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-750'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Other Sales (Category-wise)</span>
          <span className="ml-1 bg-amber-900/80 text-amber-200 border border-amber-600/50 text-[11px] px-2 py-0.5 rounded-full font-mono">
            {otherSalesCategories.length} Categories
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cx-feedback')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'cx-feedback'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30'
              : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-750'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Customer Feedback (from CX)</span>
          {pendingSalesCxCount > 0 ? (
            <span className="ml-1 bg-amber-500 text-black font-black text-[10px] px-2 py-0.5 rounded-full animate-pulse">
              {pendingSalesCxCount} Pending
            </span>
          ) : (
            <span className="ml-1 bg-gray-700 text-gray-300 text-[10px] px-2 py-0.5 rounded-full font-mono">
              {salesCxTickets.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ticket-api')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'ticket-api'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
              : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-750'
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>Ticket Sales API</span>
          <span className="ml-1 bg-blue-950 text-blue-300 border border-blue-600/50 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
            REST v2
          </span>
        </button>
      </div>

      {/* TAB 1: ALL SALES RECORDS & HISTORY */}
      {activeTab === 'records' && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Personnel Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {ticketSalesPersonnel.map((p: any) => (
              <div key={p.id} className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow flex flex-col justify-between hover:border-teal-500/40 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-12 h-12 bg-teal-900/50 text-teal-300 rounded-2xl flex items-center justify-center text-lg font-bold border border-teal-700/60 shadow-inner">
                    {p.name.charAt(0)}
                  </div>
                  <button
                    type="button"
                    onClick={() => loadRecordForEdit(endDate, p.id)}
                    className="px-2.5 py-1 bg-teal-950/70 hover:bg-teal-700 text-teal-300 hover:text-white border border-teal-800/60 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                    title="Enter or adjust sales for this personnel"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Enter Sales</span>
                  </button>
                </div>
                
                <div className="mt-3">
                  <h3 className="font-bold text-white text-base leading-tight">{p.name}</h3>
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-750 px-1.5 py-0.5 rounded">ID #{p.id}</span>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-750">
                  <p className="text-gray-400 text-[11px] uppercase tracking-wider font-semibold">Total Revenue (Range)</p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono mt-0.5">
                    {currency} {(aggregatedData.totals[p.id] || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Sales Records Table */}
          <div className="bg-gray-800 rounded-2xl overflow-hidden border border-gray-700 shadow-xl">
            <div className="p-4 bg-gray-850 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">Package & Other Sales History</h3>
              <span className="text-xs text-gray-400">{aggregatedData.records.length} records found</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-gray-750 text-gray-200 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Personnel</th>
                    <th className="p-4">Sales Breakdown</th>
                    <th className="p-4 text-right">Total Amount</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/80">
                  {aggregatedData.records.map((r, idx) => {
                    const p = ticketSalesPersonnel.find((tp: any) => tp.id === r.personnelId);
                    const pkgCount: number = (Object.values(r.packages || {}) as any[]).reduce((acc: number, val: any) => acc + (Number(val) || 0), 0);
                    const otherCount = (r.otherSales || []).length;
                    return (
                      <tr key={idx} className="hover:bg-gray-750/50 transition-colors">
                        <td className="p-4 font-mono text-gray-300">{r.date}</td>
                        <td className="p-4 font-medium text-white">{p?.name || `Staff #${r.personnelId}`}</td>
                        <td className="p-4 text-xs text-gray-300">
                          <span className="bg-gray-700 px-2 py-0.5 rounded text-teal-300 font-semibold">{pkgCount} pkgs</span>
                          {otherCount > 0 && (
                            <span className="ml-1.5 bg-amber-950/80 border border-amber-600/40 text-amber-300 px-2 py-0.5 rounded font-semibold">
                              +{otherCount} other
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right font-bold text-emerald-400 font-mono text-base">
                          {currency} {r.total?.toLocaleString()}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            type="button"
                            onClick={() => loadRecordForEdit(r.date, r.personnelId)}
                            className="px-3 py-1.5 bg-teal-600/30 hover:bg-teal-600 border border-teal-500/40 hover:border-teal-500 text-teal-300 hover:text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit / Adjust</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {aggregatedData.records.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center italic text-gray-500">
                        No sales records found for this period. Click "+ Record / Enter Sales" to add a new record.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OTHER SALES (CATEGORY-WISE) */}
      {activeTab === 'category-wise' && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Category Creation Panel for Sales Officer */}
          <div className="bg-gradient-to-r from-gray-850 to-gray-800 p-6 rounded-2xl border border-amber-500/30 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Tag className="w-5 h-5 text-amber-400" />
                  <span>Sales Officer Category Management</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Create and manage categories for ancillary sales (Food & Beverage, Merchandise, VIP Services, Lockers, etc.)
                </p>
              </div>
              <span className="text-xs text-amber-300/80 bg-amber-950/60 border border-amber-600/40 px-3 py-1 rounded-full font-mono">
                {otherSalesCategories.length} Configured Categories
              </span>
            </div>

            {/* Notification message */}
            {categoryMessage && (
              <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-fade-in-up ${
                categoryMessage.type === 'success' 
                  ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300' 
                  : 'bg-red-950/60 border border-red-500/50 text-red-300'
              }`}>
                <span>{categoryMessage.text}</span>
                <button onClick={() => setCategoryMessage(null)} className="hover:opacity-75">✕</button>
              </div>
            )}

            {/* Input to create category */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Type new category name (e.g. Food & Beverage, Merchandise, Photo Souvenirs)..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateCategory();
                    }
                  }}
                  className="w-full bg-gray-900 text-white text-sm px-4 py-3 rounded-xl border border-gray-600 focus:border-amber-400 outline-none font-medium placeholder-gray-500"
                />
              </div>
              <button
                type="button"
                onClick={() => handleCreateCategory()}
                className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-gray-950 px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-amber-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Category</span>
              </button>
            </div>

            {/* Preset quick buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Quick Suggestions:</span>
              {['Food & Beverage', 'Merchandise', 'Lockers & Storage', 'Photo Souvenirs', 'VR Experience', 'Carnival Games', 'VIP Add-on'].map(preset => {
                const alreadyExists = otherSalesCategories.some((c: string) => c.toLowerCase() === preset.toLowerCase());
                if (alreadyExists) return null;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleCreateCategory(preset)}
                    className="text-xs bg-gray-750 hover:bg-gray-700 text-gray-300 hover:text-white px-2.5 py-1 rounded-lg border border-gray-600/60 transition-all cursor-pointer"
                  >
                    + {preset}
                  </button>
                );
              })}
            </div>

            {/* Configured Categories Chip List */}
            <div className="pt-3 border-t border-gray-700/80">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                Active Categories (Available in Daily Sales & Reports):
              </span>
              <div className="flex flex-wrap gap-2">
                {otherSalesCategories.map((cat: string) => {
                  const stat = otherSalesCategoryBreakdown.list.find(c => c.category.toLowerCase() === cat.toLowerCase());
                  const isEditingThis = editingCategory?.original === cat;

                  if (isEditingThis) {
                    return (
                      <div key={cat} className="flex items-center gap-1.5 bg-gray-900 border border-amber-400 p-1 rounded-xl">
                        <input
                          type="text"
                          value={editingCategory.name}
                          onChange={(e) => setEditingCategory({ original: cat, name: e.target.value })}
                          className="bg-transparent text-white text-xs px-2 py-1 outline-none font-medium w-36"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameCategory(cat, editingCategory.name);
                            if (e.key === 'Escape') setEditingCategory(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameCategory(cat, editingCategory.name)}
                          className="text-emerald-400 hover:text-emerald-300 text-xs px-2 py-1 font-bold"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategory(null)}
                          className="text-gray-400 hover:text-white text-xs px-1 py-1"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={cat} 
                      className="bg-gray-750 border border-gray-600/80 hover:border-amber-500/60 rounded-xl px-3 py-1.5 flex items-center gap-2 group transition-all"
                    >
                      <span className="text-xs font-semibold text-white">📁 {cat}</span>
                      {stat && stat.totalAmount > 0 && (
                        <span className="text-[10px] bg-emerald-950 border border-emerald-600/40 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                          {currency} {stat.totalAmount.toLocaleString()}
                        </span>
                      )}
                      <div className="flex items-center gap-1 border-l border-gray-600 pl-1.5 ml-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setEditingCategory({ original: cat, name: cat })}
                          className="text-gray-400 hover:text-amber-300 text-xs p-0.5"
                          title="Rename Category"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="text-gray-400 hover:text-red-400 text-xs p-0.5"
                          title="Delete Category"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Metric KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400">Total Other Sales Revenue</span>
              <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                {currency} {otherSalesCategoryBreakdown.grandTotalAmount.toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-400 mt-1 block">In selected date range</span>
            </div>

            <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400">Total Transactions</span>
              <p className="text-2xl font-bold text-amber-400 font-mono mt-1">
                {otherSalesCategoryBreakdown.grandTotalCount} items
              </p>
              <span className="text-[11px] text-gray-400 mt-1 block">Across all counters</span>
            </div>

            <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400">Top Revenue Category</span>
              <p className="text-xl font-bold text-teal-300 truncate mt-1">
                {otherSalesCategoryBreakdown.topCategory?.category || 'None yet'}
              </p>
              <span className="text-[11px] text-gray-400 mt-1 block">
                {otherSalesCategoryBreakdown.topCategory ? `${currency} ${otherSalesCategoryBreakdown.topCategory.totalAmount.toLocaleString()}` : '0 BDT'}
              </span>
            </div>

            <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400">Active Categories</span>
              <p className="text-2xl font-bold text-purple-400 font-mono mt-1">
                {otherSalesCategories.length} Categories
              </p>
              <span className="text-[11px] text-gray-400 mt-1 block">Managed by Sales Officer</span>
            </div>
          </div>

          {/* Category-wise Revenue Distribution Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300">
              Category Revenue Breakdown & Staff Contributions
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherSalesCategoryBreakdown.list.map(catItem => {
                const percent = otherSalesCategoryBreakdown.grandTotalAmount > 0
                  ? Math.round((catItem.totalAmount / otherSalesCategoryBreakdown.grandTotalAmount) * 100)
                  : 0;

                const contributorsList = Object.values(catItem.contributors);

                return (
                  <div key={catItem.category} className="bg-gray-800 p-5 rounded-2xl border border-gray-700/80 shadow flex flex-col justify-between hover:border-amber-500/40 transition-all">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-white text-base leading-tight">📁 {catItem.category}</h4>
                        <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/80 border border-amber-600/40 px-2 py-0.5 rounded-full">
                          {percent}%
                        </span>
                      </div>

                      <div className="mt-3">
                        <span className="text-2xl font-bold text-emerald-400 font-mono">
                          {currency} {catItem.totalAmount.toLocaleString()}
                        </span>
                        <p className="text-xs text-gray-400 mt-0.5">{catItem.totalCount} sales logged</p>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-gray-700 h-2 rounded-full mt-3 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(percent, catItem.totalAmount > 0 ? 5 : 0))}%` }}
                        />
                      </div>
                    </div>

                    {/* Contributor summary */}
                    <div className="mt-4 pt-3 border-t border-gray-750 text-xs">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Contributors:</span>
                      {contributorsList.length > 0 ? (
                        <div className="space-y-1">
                          {contributorsList.slice(0, 3).map((c: any, i: number) => (
                            <div key={i} className="flex justify-between text-gray-300 text-[11px]">
                              <span>{c.name}</span>
                              <span className="font-mono text-emerald-400 font-semibold">{currency} {c.amount.toLocaleString()} ({c.count})</span>
                            </div>
                          ))}
                          {contributorsList.length > 3 && (
                            <span className="text-[10px] text-gray-500 italic">+{contributorsList.length - 3} more staff</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 italic text-[11px]">No sales recorded in this period</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Category Transactions Table */}
          <div className="bg-gray-800 rounded-2xl overflow-hidden border border-gray-700 shadow-xl">
            <div className="p-4 bg-gray-850 border-b border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <h3 className="font-bold text-white text-sm">Detailed Category-Wise Sales Log</h3>
                <span className="text-xs text-gray-400">{filteredCategoryTransactions.length} transaction entries found</span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                {/* Category Filter */}
                <select
                  value={selectedFilterCategory}
                  onChange={(e) => setSelectedFilterCategory(e.target.value)}
                  className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-xl border border-gray-700 outline-none cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  {otherSalesCategoryBreakdown.list.map(c => (
                    <option key={c.category} value={c.category}>
                      📁 {c.category} ({c.totalCount})
                    </option>
                  ))}
                </select>

                {/* Search input */}
                <input
                  type="text"
                  placeholder="Search item, category, or staff..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-xl border border-gray-700 outline-none placeholder-gray-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-gray-750 text-gray-200 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Sale Name / Item Description</th>
                    <th className="p-4">Staff Member</th>
                    <th className="p-4">Discount</th>
                    <th className="p-4 text-right">Amount</th>
                    <th className="p-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/80">
                  {filteredCategoryTransactions.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-gray-750/50 transition-colors">
                      <td className="p-4 font-mono text-gray-300 text-xs">{tx.date}</td>
                      <td className="p-4">
                        <span className="bg-amber-950/80 border border-amber-600/40 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-semibold">
                          📁 {tx.category}
                        </span>
                      </td>
                      <td className="p-4 text-white text-xs font-medium">
                        {tx.customName || tx.description || <span className="text-gray-500 italic">Standard {tx.category}</span>}
                      </td>
                      <td className="p-4 text-gray-300 text-xs">{tx.personnelName}</td>
                      <td className="p-4 text-xs font-mono">
                        {tx.discount ? (
                          <span className="text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-600/30">
                            {tx.discount}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="p-4 text-right font-bold text-emerald-400 font-mono text-sm">
                        {currency} {tx.amount.toLocaleString()}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => loadRecordForEdit(tx.date, tx.personnelId)}
                          className="px-2.5 py-1 bg-teal-600/30 hover:bg-teal-600 border border-teal-500/40 text-teal-300 hover:text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          Edit / Adjust
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredCategoryTransactions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center italic text-gray-500">
                        No category transactions found matching your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CUSTOMER FEEDBACK (FROM CX) ROUTED TO SALES EXECUTIVE */}
      {activeTab === 'cx-feedback' && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800 p-4 rounded-2xl border border-gray-700 shadow flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Routed to Sales</p>
                <p className="text-2xl font-black text-white font-mono mt-1">{salesCxTickets.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-900/40 text-purple-400 border border-purple-750 flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-gray-800 p-4 rounded-2xl border border-gray-700 shadow flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Pending Action</p>
                <p className="text-2xl font-black text-amber-300 font-mono mt-1">{pendingSalesCxCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-900/40 text-amber-400 border border-amber-750 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-gray-800 p-4 rounded-2xl border border-gray-700 shadow flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">In Progress</p>
                <p className="text-2xl font-black text-blue-300 font-mono mt-1">{inProgressSalesCxCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-900/40 text-blue-400 border border-blue-750 flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-gray-800 p-4 rounded-2xl border border-gray-700 shadow flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Solved & Returned</p>
                <p className="text-2xl font-black text-emerald-300 font-mono mt-1">{solvedSalesCxCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-900/40 text-emerald-400 border border-emerald-750 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Customer Feedback Feed Table */}
          <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-gray-800 via-gray-800 to-gray-750">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <HeartHandshake className="w-5 h-5 text-rose-400" />
                  <span>Customer Experience Feedbacks Assigned to Sales</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Action ticketing inquiries, package pricing issues, and counter concerns • Solved tickets immediately return to CX portal
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 bg-gray-900 p-1 rounded-xl border border-gray-750">
                {(['all', 'reported', 'in-progress', 'solved'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setCxFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                      cxFilter === f
                        ? 'bg-rose-600 text-white shadow'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {f === 'all' ? `All (${salesCxTickets.length})` : f === 'reported' ? `Pending (${pendingSalesCxCount})` : f === 'in-progress' ? `In Progress (${inProgressSalesCxCount})` : `Solved (${solvedSalesCxCount})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm text-gray-300">
                <thead className="bg-gray-900 text-gray-400 uppercase text-[11px] tracking-wider border-b border-gray-700">
                  <tr>
                    <th className="px-5 py-3.5">Counter / Area & Time</th>
                    <th className="px-5 py-3.5">Category & Issue Details</th>
                    <th className="px-5 py-3.5">Priority</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Sales Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60">
                  {displayedSalesCxTickets.map(ticket => {
                    const isSolved = ticket.status === 'solved';
                    const isInProg = ticket.status === 'in-progress';

                    return (
                      <tr key={ticket.id} className="hover:bg-gray-750/50 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="font-bold text-white text-sm">{ticket.rideName}</div>
                          <div className="text-[11px] text-gray-500 font-mono mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-600" />
                            <span>{ticket.date} • {ticket.reportedAt ? new Date(ticket.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Logged'}</span>
                          </div>
                          <div className="text-[10px] text-rose-300 mt-1">
                            By {ticket.reportedByName || 'Customer Experience'}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          {ticket.feedbackCategory && (
                            <span className="inline-block bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-md mb-1">
                              {ticket.feedbackCategory}
                            </span>
                          )}
                          <p className="text-gray-200 text-xs sm:text-sm font-medium leading-relaxed max-w-md">
                            {ticket.problem}
                          </p>
                          {ticket.guestDetails && (
                            <p className="text-[11px] text-gray-400 italic mt-1 bg-gray-900/60 p-1.5 rounded border border-gray-750">
                              Guest note: "{ticket.guestDetails}"
                            </p>
                          )}
                          {isSolved && ticket.resolutionNotes && (
                            <div className="text-[11px] text-emerald-300 bg-emerald-950/60 p-2 rounded-lg border border-emerald-800/80 mt-2">
                              <strong>Solved Action:</strong> {ticket.resolutionNotes}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4 whitespace-nowrap">
                          {ticket.priority === 'urgent' ? (
                            <span className="bg-red-950 text-red-300 border border-red-700 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                              Urgent
                            </span>
                          ) : ticket.priority === 'high' ? (
                            <span className="bg-amber-950 text-amber-300 border border-amber-700 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                              High
                            </span>
                          ) : (
                            <span className="bg-gray-700 text-gray-300 text-[11px] px-2.5 py-1 rounded-lg">
                              Normal
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 whitespace-nowrap">
                          {isSolved ? (
                            <div>
                              <span className="inline-flex items-center gap-1 bg-emerald-950 text-emerald-300 border border-emerald-700/80 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Solved</span>
                              </span>
                              <div className="text-[10px] text-gray-500 mt-1">
                                {ticket.solvedAt ? new Date(ticket.solvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              </div>
                            </div>
                          ) : isInProg ? (
                            <span className="inline-flex items-center gap-1 bg-blue-950 text-blue-300 border border-blue-700/80 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                              <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                              <span>In Progress</span>
                            </span>
                          ) : (
                            <span className="inline-block bg-amber-950 text-amber-300 border border-amber-700/80 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                              Pending Review
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!isSolved && !isInProg && (
                              <button
                                type="button"
                                onClick={() => handleMarkInProgress(ticket)}
                                className="px-3 py-1.5 bg-blue-900/60 hover:bg-blue-800 text-blue-300 hover:text-white border border-blue-700/70 rounded-xl text-xs font-bold transition-all cursor-pointer"
                              >
                                Start Action
                              </button>
                            )}
                            {!isSolved ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSolvingTicket(ticket);
                                  setResolutionRemarks('');
                                }}
                                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-950/40 flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Solve Feedback</span>
                              </button>
                            ) : (
                              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Completed</span>
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {displayedSalesCxTickets.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500 italic">
                        <HeartHandshake className="w-8 h-8 mx-auto mb-2 opacity-30 text-rose-400" />
                        No Customer Experience (CX) feedback records currently found under "{cxFilter}".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- POPUP MODAL: SOLVE FEEDBACK (SALES EXECUTIVE) --- */}
      {solvingTicket && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in-up">
          <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-gray-700 bg-gray-850 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Resolve Feedback: {solvingTicket.rideName}</span>
              </h3>
              <button
                type="button"
                onClick={() => setSolvingTicket(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmSolve} className="p-5 space-y-4">
              <div className="bg-gray-900/80 p-3 rounded-xl border border-gray-700 text-xs text-gray-300 space-y-1">
                <p><strong>Feedback:</strong> {solvingTicket.problem}</p>
                {solvingTicket.feedbackCategory && (
                  <p className="text-rose-300">Category: {solvingTicket.feedbackCategory}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block mb-1.5">
                  Resolution Action Taken by Sales Executive <span className="text-emerald-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={resolutionRemarks}
                  onChange={(e) => setResolutionRemarks(e.target.value)}
                  placeholder="Explain corrective action taken (e.g., Guest ticket refunded/re-issued, package discount applied at counter, clarified terms with customer)..."
                  className="w-full bg-gray-900 text-white rounded-xl p-3 text-sm border border-gray-700 outline-none focus:border-emerald-500"
                />
              </div>

              {/* Quick Action Presets */}
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Quick Action Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Guest ticket card recharged & verified at POS counter',
                    'Package dispute reconciled and explained to customer',
                    'Sales counter operator instructed on correct tariff',
                    'Guest refund / credit note processed successfully'
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setResolutionRemarks(preset)}
                      className="text-[11px] bg-gray-900 hover:bg-gray-750 text-gray-300 px-2.5 py-1 rounded-lg border border-gray-700 transition-colors cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSolvingTicket(null)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSolving || !resolutionRemarks.trim()}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md shadow-emerald-950/40 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSolving ? 'Resolving...' : 'Confirm Solved & Return to CX'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: TICKET SALES & TURNSTILE REST API EXPLORER */}
      {activeTab === 'ticket-api' && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Top Banner */}
          <div className="bg-gradient-to-r from-blue-950/70 via-gray-800 to-indigo-950/70 p-6 rounded-2xl border border-blue-600/40 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-blue-600 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg uppercase tracking-wider flex items-center gap-1.5 shadow">
                    <Code2 className="w-3.5 h-3.5" /> REST API v2
                  </span>
                  <span className="bg-emerald-950/90 text-emerald-400 border border-emerald-600/50 text-xs px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    SSE Real-Time Broadcast Active
                  </span>
                </div>
                <h3 className="text-xl font-black text-white tracking-tight mt-1">
                  Ticket Sales, Turnstiles & POS Integration API
                </h3>
                <p className="text-sm text-gray-300 max-w-3xl">
                  Connect physical turnstiles, entrance gate scanners, central POS counters, and external ticketing services directly to Toggi Fun World. Updates persist in SQLite and instantly broadcast across all active screens.
                </p>
              </div>

              <div className="bg-gray-900/80 p-3.5 rounded-xl border border-gray-700/80 text-xs font-mono text-gray-300 space-y-1 flex-shrink-0">
                <div className="text-gray-400 font-sans text-[11px] font-bold uppercase tracking-wider">Base URL</div>
                <div className="text-blue-400 font-bold select-all">
                  {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}
                </div>
                <div className="text-[11px] text-gray-400 pt-1">
                  Active Date: <span className="text-emerald-400 font-bold">{startDate || 'Today'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub Navigation Bar */}
          <div className="flex items-center gap-2 border-b border-gray-700 pb-3 flex-wrap">
            <button
              type="button"
              onClick={() => setApiSubTab('tester')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                apiSubTab === 'tester'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Interactive API Tester</span>
            </button>

            <button
              type="button"
              onClick={() => setApiSubTab('dotnet')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                apiSubTab === 'dotnet'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>.NET (C#) Client & SDK</span>
            </button>

            <button
              type="button"
              onClick={() => setApiSubTab('standalone')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                apiSubTab === 'standalone'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Standalone API Hosting (Docker / IIS)</span>
            </button>
          </div>

          {apiSubTab === 'tester' && (
            <>
          {/* Quick Interactive API Tester */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Test Controls */}
            <div className="lg:col-span-5 bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md space-y-5">
              <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  <h4 className="font-bold text-white text-sm">Interactive API Tester</h4>
                </div>
                <span className="text-[11px] text-gray-400 bg-gray-900 px-2 py-0.5 rounded border border-gray-700">
                  Live Endpoints
                </span>
              </div>

              {/* Action 1: Query GET */}
              <div className="bg-gray-900/70 p-4 rounded-xl border border-gray-700/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded">GET</span>
                    <span className="text-xs font-mono text-gray-200 font-semibold">/api/ticket-sales</span>
                  </div>
                  <button
                    type="button"
                    disabled={apiTestLoading}
                    onClick={async () => {
                      setApiTestLoading(true);
                      try {
                        const targetUrl = startDate ? `/api/ticket-sales?date=${startDate}` : '/api/ticket-sales';
                        const res = await fetch(targetUrl);
                        const json = await res.json();
                        setApiTestResponse({ endpoint: `GET ${targetUrl}`, status: res.status, ok: res.ok, data: json });
                      } catch (err: any) {
                        setApiTestResponse({ endpoint: 'GET /api/ticket-sales', status: 500, ok: false, error: err?.message });
                      } finally {
                        setApiTestLoading(false);
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Run Query</span>
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">
                  Retrieves real-time ticket counts and calculated revenue for all entrance counters on selected date.
                </p>
              </div>

              {/* Action 2: Universal Action Dispatcher (POST /api/ticket-sales/action) */}
              <div className="bg-gradient-to-br from-indigo-950/60 to-purple-950/40 p-4 rounded-xl border border-indigo-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-purple-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded shadow">POST</span>
                    <span className="text-xs font-mono text-purple-200 font-bold">/api/ticket-sales/action</span>
                    <span className="text-[10px] bg-purple-900/80 text-purple-300 px-1.5 py-0.5 rounded font-bold border border-purple-600/40">Full Access</span>
                  </div>
                  <button
                    type="button"
                    disabled={apiTestLoading}
                    onClick={async () => {
                      setApiTestLoading(true);
                      try {
                        const payload: any = {
                          action: apiTestAction,
                          counterId: Number(apiTestCounterId),
                          count: Number(apiTestCount) || 1,
                          date: startDate,
                          soldBy: currentUser?.name ? `${currentUser.name} (Full Access API)` : 'Master API Dispatcher',
                          reason: apiTestReason || 'API Action test',
                          notes: `Triggered from Sales Dashboard UI`
                        };
                        const res = await fetch('/api/ticket-sales/action', {
                          method: 'POST',
                          headers: { 
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify(payload)
                        });
                        const json = await res.json();
                        setApiTestResponse({ endpoint: 'POST /api/ticket-sales/action', status: res.status, ok: res.ok, requestBody: payload, data: json });
                      } catch (err: any) {
                        setApiTestResponse({ endpoint: 'POST /api/ticket-sales/action', status: 500, ok: false, error: err?.message });
                      } finally {
                        setApiTestLoading(false);
                      }
                    }}
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-purple-950/50 cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Execute Action</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-purple-300 text-[10px] uppercase font-bold block mb-1">Action Type</label>
                    <select
                      value={apiTestAction}
                      onChange={(e) => setApiTestAction(e.target.value)}
                      className="w-full bg-gray-900 text-purple-200 border border-purple-700/80 rounded-lg p-2 text-xs font-semibold outline-none focus:border-purple-400"
                    >
                      <option value="increment">increment (Add Tickets)</option>
                      <option value="set">set (Override Total)</option>
                      <option value="refund">refund (Void / Refund)</option>
                      <option value="reset">reset (Clear to 0)</option>
                      <option value="query">query (Fetch Counts)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-[10px] uppercase font-bold block mb-1">Target Counter</label>
                    <select
                      value={apiTestCounterId}
                      onChange={(e) => setApiTestCounterId(e.target.value)}
                      className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-2 text-xs outline-none focus:border-blue-500"
                    >
                      <option value="1">Counter 1 (Main Entrance)</option>
                      <option value="2">Counter 2 (VIP Kiosk)</option>
                      <option value="3">Counter 3 (Online Pickup)</option>
                      <option value="4">Counter 4 (Express Pass)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-[10px] uppercase font-bold block mb-1">Count / Qty</label>
                    <input
                      type="number"
                      min="0"
                      max="5000"
                      value={apiTestCount}
                      onChange={(e) => setApiTestCount(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-2 text-xs font-mono outline-none focus:border-blue-500 text-center font-bold"
                    />
                  </div>
                </div>

                {(apiTestAction === 'refund' || apiTestAction === 'reset') && (
                  <div>
                    <label className="text-rose-400 text-[10px] uppercase font-bold block mb-1">Reason / Authorization</label>
                    <input
                      type="text"
                      value={apiTestReason}
                      onChange={(e) => setApiTestReason(e.target.value)}
                      placeholder="e.g. Guest canceled booking / bad weather voucher"
                      className="w-full bg-gray-900 text-white border border-rose-800/80 rounded-lg p-2 text-xs outline-none focus:border-rose-500"
                    />
                  </div>
                )}

                <p className="text-[11px] text-gray-400">
                  Universal master method. Executes atomic state change in SQLite + JSON with real-time SSE event broadcast.
                </p>
              </div>

              {/* Action 3: Quick Full Access Controls */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={apiTestLoading}
                  onClick={async () => {
                    setApiTestLoading(true);
                    try {
                      const res = await fetch('/api/ticket-sales/full-access');
                      const json = await res.json();
                      setApiTestResponse({ endpoint: 'GET /api/ticket-sales/full-access', status: res.status, ok: res.ok, data: json });
                    } catch (err: any) {
                      setApiTestResponse({ endpoint: 'GET /api/ticket-sales/full-access', status: 500, ok: false, error: err?.message });
                    } finally {
                      setApiTestLoading(false);
                    }
                  }}
                  className="bg-indigo-900/60 hover:bg-indigo-800 border border-indigo-700/60 text-indigo-200 text-xs font-semibold py-2 px-3 rounded-xl transition-colors cursor-pointer text-left flex items-center justify-between"
                >
                  <span>GET Full Access Dump</span>
                  <span className="text-[10px] bg-indigo-950 px-1.5 py-0.5 rounded text-indigo-400">Admin</span>
                </button>

                <button
                  type="button"
                  disabled={apiTestLoading}
                  onClick={async () => {
                    setApiTestLoading(true);
                    try {
                      const res = await fetch('/api/ticket-sales/history?limit=30');
                      const json = await res.json();
                      setApiTestResponse({ endpoint: 'GET /api/ticket-sales/history', status: res.status, ok: res.ok, data: json });
                    } catch (err: any) {
                      setApiTestResponse({ endpoint: 'GET /api/ticket-sales/history', status: 500, ok: false, error: err?.message });
                    } finally {
                      setApiTestLoading(false);
                    }
                  }}
                  className="bg-teal-900/60 hover:bg-teal-800 border border-teal-700/60 text-teal-200 text-xs font-semibold py-2 px-3 rounded-xl transition-colors cursor-pointer text-left flex items-center justify-between"
                >
                  <span>GET Audit History</span>
                  <span className="text-[10px] bg-teal-950 px-1.5 py-0.5 rounded text-teal-400">Logs</span>
                </button>

                <button
                  type="button"
                  disabled={apiTestLoading}
                  onClick={async () => {
                    setApiTestLoading(true);
                    try {
                      const res = await fetch('/api/ticket-sales/counters');
                      const json = await res.json();
                      setApiTestResponse({ endpoint: 'GET /api/ticket-sales/counters', status: res.status, ok: res.ok, data: json });
                    } catch (err: any) {
                      setApiTestResponse({ endpoint: 'GET /api/ticket-sales/counters', status: 500, ok: false, error: err?.message });
                    } finally {
                      setApiTestLoading(false);
                    }
                  }}
                  className="bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-200 text-xs font-semibold py-2 px-3 rounded-xl transition-colors cursor-pointer text-left flex items-center justify-between"
                >
                  <span>GET Counters & Status</span>
                  <span className="text-[10px] bg-gray-900 px-1.5 py-0.5 rounded text-gray-400">Live</span>
                </button>

                <a
                  href="/api/ticket-sales/export?format=csv"
                  download="tfw_ticket_sales.csv"
                  className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/70 text-emerald-300 text-xs font-semibold py-2 px-3 rounded-xl transition-colors cursor-pointer text-left flex items-center justify-between"
                >
                  <span>Download CSV Export</span>
                  <span className="text-[10px] bg-emerald-900 px-1.5 py-0.5 rounded text-emerald-200 font-mono">.csv</span>
                </a>
              </div>
            </div>

            {/* Right: Live Response Output */}
            <div className="lg:col-span-7 bg-gray-900 rounded-2xl border border-gray-700 shadow-md p-5 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    <span className="text-xs font-mono font-bold text-gray-300">Live JSON Response</span>
                    {apiTestResponse && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        apiTestResponse.ok ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-rose-950 text-rose-300 border border-rose-700'
                      }`}>
                        HTTP {apiTestResponse.status || 200}
                      </span>
                    )}
                  </div>
                  {apiTestResponse && (
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof navigator !== 'undefined' && navigator.clipboard) {
                          navigator.clipboard.writeText(JSON.stringify(apiTestResponse, null, 2));
                          setApiCopiedEndpoint('response');
                          setTimeout(() => setApiCopiedEndpoint(null), 2000);
                        }
                      }}
                      className="text-gray-400 hover:text-white text-xs flex items-center gap-1 bg-gray-800 px-2 py-1 rounded cursor-pointer"
                    >
                      {apiCopiedEndpoint === 'response' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{apiCopiedEndpoint === 'response' ? 'Copied!' : 'Copy JSON'}</span>
                    </button>
                  )}
                </div>

                <div className="bg-gray-950 rounded-xl p-4 border border-gray-800 overflow-x-auto max-h-[360px] text-xs font-mono">
                  {apiTestLoading ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-blue-400">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Executing request against Ticket Sales API...</span>
                    </div>
                  ) : apiTestResponse ? (
                    <pre className="text-emerald-400 whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(apiTestResponse, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-gray-500 py-10 text-center space-y-1">
                      <Terminal className="w-8 h-8 mx-auto text-gray-600 mb-2" />
                      <p>Click "Run Query" or "Send Sale" on the left to test the live API.</p>
                      <p className="text-[11px] text-gray-600">All responses will appear here formatted in real-time JSON.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 text-[11px] text-gray-400 flex items-center justify-between border-t border-gray-800">
                <span>Integrated SQLite + File DB Storage</span>
                <span className="text-emerald-400 font-bold font-mono">Zero Server Restart Needed</span>
              </div>
            </div>
          </div>

          {/* Detailed Endpoint Reference Cards */}
          <div className="space-y-4 pt-2">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <Code2 className="w-5 h-5 text-teal-400" />
              API Endpoints & Integration Samples
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: GET Ticket Sales */}
              <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded">GET</span>
                    <span className="font-mono text-xs font-bold text-white">/api/ticket-sales</span>
                  </div>
                  <span className="text-[10px] text-gray-400 bg-gray-900 px-2 py-0.5 rounded">Query Sales</span>
                </div>
                <p className="text-xs text-gray-300">
                  Fetch physical ticket counts, ticket unit prices, subtotals, and cashier totals for today or any historical date.
                </p>
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-700/60 font-mono text-xs text-gray-300 overflow-x-auto relative">
                  <button
                    type="button"
                    onClick={() => {
                      const curl = `curl -X GET "${window.location.origin}/api/ticket-sales?date=${startDate || '2026-09-27'}"`;
                      navigator.clipboard.writeText(curl);
                      setApiCopiedEndpoint('curl-get');
                      setTimeout(() => setApiCopiedEndpoint(null), 2000);
                    }}
                    className="absolute top-2 right-2 text-gray-400 hover:text-white text-[11px] bg-gray-800 px-2 py-0.5 rounded border border-gray-700 flex items-center gap-1 cursor-pointer"
                  >
                    {apiCopiedEndpoint === 'curl-get' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{apiCopiedEndpoint === 'curl-get' ? 'Copied' : 'curl'}</span>
                  </button>
                  <code>curl -X GET "{typeof window !== 'undefined' ? window.location.origin : ''}/api/ticket-sales?date={startDate || '2026-09-27'}"</code>
                </div>
              </div>

              {/* Card 2: POST Record Ticket Sale */}
              <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded">POST</span>
                    <span className="font-mono text-xs font-bold text-white">/api/ticket-sales</span>
                  </div>
                  <span className="text-[10px] text-gray-400 bg-gray-900 px-2 py-0.5 rounded">Record Sale</span>
                </div>
                <p className="text-xs text-gray-300">
                  Record ticket sale or turnstile entry. Automatically recalculates counter revenue and broadcasts to all dashboards.
                </p>
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-700/60 font-mono text-xs text-gray-300 overflow-x-auto relative">
                  <button
                    type="button"
                    onClick={() => {
                      const curl = `curl -X POST "${window.location.origin}/api/ticket-sales" \\\n  -H "Content-Type: application/json" \\\n  -d '{"counterId": 1, "count": 5, "action": "increment", "soldBy": "Turnstile Gate 1"}'`;
                      navigator.clipboard.writeText(curl);
                      setApiCopiedEndpoint('curl-post');
                      setTimeout(() => setApiCopiedEndpoint(null), 2000);
                    }}
                    className="absolute top-2 right-2 text-gray-400 hover:text-white text-[11px] bg-gray-800 px-2 py-0.5 rounded border border-gray-700 flex items-center gap-1 cursor-pointer"
                  >
                    {apiCopiedEndpoint === 'curl-post' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{apiCopiedEndpoint === 'curl-post' ? 'Copied' : 'curl'}</span>
                  </button>
                  <code>curl -X POST "{typeof window !== 'undefined' ? window.location.origin : ''}/api/ticket-sales" \ <br/>
  -H "Content-Type: application/json" \ <br/>
  -d '{`{"counterId": 1, "count": 5, "action": "increment"}`}'</code>
                </div>
              </div>

              {/* Card 3: POST Batch Sales */}
              <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-purple-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded">POST</span>
                    <span className="font-mono text-xs font-bold text-white">/api/ticket-sales/batch</span>
                  </div>
                  <span className="text-[10px] text-gray-400 bg-gray-900 px-2 py-0.5 rounded">Bulk Upload</span>
                </div>
                <p className="text-xs text-gray-300">
                  Update multiple ticket counters simultaneously in one atomic database transaction (ideal for POS synchronization).
                </p>
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-700/60 font-mono text-xs text-gray-300 overflow-x-auto">
                  <code>{`{ "sales": [{ "counterId": 1, "count": 10 }, { "counterId": 2, "count": 5 }] }`}</code>
                </div>
              </div>

              {/* Card 4: GET Summary & Counters */}
              <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded">GET</span>
                    <span className="font-mono text-xs font-bold text-white">/api/ticket-sales/summary</span>
                  </div>
                  <span className="text-[10px] text-gray-400 bg-gray-900 px-2 py-0.5 rounded">Analytics</span>
                </div>
                <p className="text-xs text-gray-300">
                  Retrieve multi-day footfall totals, revenue analytics, and individual counter performance history.
                </p>
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-700/60 font-mono text-xs text-gray-300 overflow-x-auto">
                  <code>GET /api/ticket-sales/summary?startDate=...&endDate=...</code>
                </div>
              </div>

              {/* Card 5: POST Universal Action Dispatcher */}
              <div className="bg-gray-800 p-5 rounded-2xl border border-purple-700/60 shadow space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-purple-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded">POST</span>
                    <span className="font-mono text-xs font-bold text-purple-200">/api/ticket-sales/action</span>
                  </div>
                  <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded font-bold border border-purple-800">Master Method</span>
                </div>
                <p className="text-xs text-gray-300">
                  Universal method to execute ANY action (record, set, refund, reset, query) through a single unified endpoint.
                </p>
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-700/60 font-mono text-xs text-purple-200 overflow-x-auto">
                  <code>{`{ "action": "refund", "counterId": 1, "count": 2, "reason": "Customer cancellation" }`}</code>
                </div>
              </div>

              {/* Card 6: POST Refund / Void */}
              <div className="bg-gray-800 p-5 rounded-2xl border border-rose-700/60 shadow space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-rose-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded">POST</span>
                    <span className="font-mono text-xs font-bold text-white">/api/ticket-sales/refund</span>
                  </div>
                  <span className="text-[10px] bg-rose-950 text-rose-300 px-2 py-0.5 rounded font-bold border border-rose-800">Refunds & Voids</span>
                </div>
                <p className="text-xs text-gray-300">
                  Void tickets or process customer refunds with mandatory audit reason and supervisor authorization.
                </p>
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-700/60 font-mono text-xs text-rose-200 overflow-x-auto">
                  <code>{`{ "counterId": 1, "count": 2, "reason": "Guest cancellation", "authorizedBy": "Supervisor" }`}</code>
                </div>
              </div>

              {/* Card 7: PUT Direct Idempotent Set */}
              <div className="bg-gray-800 p-5 rounded-2xl border border-blue-700/60 shadow space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded">PUT</span>
                    <span className="font-mono text-xs font-bold text-white">/api/ticket-sales/:date/:counterId</span>
                  </div>
                  <span className="text-[10px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded font-bold border border-blue-800">Direct Set</span>
                </div>
                <p className="text-xs text-gray-300">
                  Idempotent write to set exact ticket counts for any counter and historical or operational date.
                </p>
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-700/60 font-mono text-xs text-blue-200 overflow-x-auto">
                  <code>PUT /api/ticket-sales/2026-09-27/1 {`{"count": 150}`}</code>
                </div>
              </div>

              {/* Card 8: GET Full Access State & CSV Export */}
              <div className="bg-gray-800 p-5 rounded-2xl border border-teal-700/60 shadow space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-teal-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded">GET</span>
                    <span className="font-mono text-xs font-bold text-white">/api/ticket-sales/full-access</span>
                  </div>
                  <span className="text-[10px] bg-teal-950 text-teal-300 px-2 py-0.5 rounded font-bold border border-teal-800">Export & Admin</span>
                </div>
                <p className="text-xs text-gray-300">
                  Full admin state dump (counters, all dates, assignments, audit logs) plus downloadable CSV export via <code className="text-teal-400">?format=csv</code>.
                </p>
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-700/60 font-mono text-xs text-teal-200 overflow-x-auto">
                  <code>GET /api/ticket-sales/export?format=csv</code>
                </div>
              </div>
            </div>
          </div>
            </>
          )}

          {/* TAB: .NET (C#) INTEGRATION CLIENT */}
          {apiSubTab === 'dotnet' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="bg-gradient-to-r from-purple-950/70 via-gray-800 to-indigo-950/70 p-6 rounded-2xl border border-purple-600/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-purple-600 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg">C# .NET SDK</span>
                    <span className="bg-purple-950 text-purple-300 border border-purple-700 text-xs px-2.5 py-1 rounded-lg">.NET 6 / 7 / 8 / 9</span>
                    <span className="bg-gray-800 text-gray-300 border border-gray-700 text-xs px-2.5 py-1 rounded-lg">WPF / WinForms / ASP.NET Core</span>
                  </div>
                  <h3 className="text-xl font-black text-white tracking-tight mt-1">
                    Direct .NET (C#) Turnstile & POS Client Library
                  </h3>
                  <p className="text-sm text-gray-300 max-w-3xl">
                    Production C# client class (<code className="text-purple-300 font-bold">TfwTicketApiClient.cs</code>) with strongly-typed models, thread-safe <code className="text-purple-300">HttpClient</code> pooling, automatic master key injection, and Dependency Injection support.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                  <a
                    href="/api/ticket-sales/dotnet-code?download=true"
                    download="TfwTicketApiClient.cs"
                    className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-purple-950/50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download TfwTicketApiClient.cs</span>
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/ticket-sales/dotnet-code?format=raw');
                        const code = await res.text();
                        navigator.clipboard.writeText(code);
                        setApiCopiedEndpoint('dotnet-full');
                        setTimeout(() => setApiCopiedEndpoint(null), 2500);
                      } catch (_) {}
                    }}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {apiCopiedEndpoint === 'dotnet-full' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{apiCopiedEndpoint === 'dotnet-full' ? 'Code Copied!' : 'Copy C# Class Code'}</span>
                  </button>
                </div>
              </div>

              {/* Steps / Code snippets */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Quick Startup in C# */}
                <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-purple-400" />
                      1. Quick Start in .NET Console / WinForms / WPF
                    </h4>
                    <span className="text-[11px] font-mono text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                      C# Code
                    </span>
                  </div>

                  <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 font-mono text-xs text-gray-300 space-y-2 overflow-x-auto">
                    <pre className="text-purple-300 leading-relaxed whitespace-pre">
{`using Tfw.TicketSales.Client;

// 1. Initialize Client (Points to Standalone API or Cloud)
var options = new TfwTicketApiOptions
{
    BaseUrl = "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000'}",
    ApiKey = "<TICKET_API_KEY>",
    DefaultSenderName = "Turnstile Gate #1 Controller"
};

using var client = new TfwTicketApiClient(options);

// 2. Record Turnstile Entry / Ticket Sale
var result = await client.RecordSaleAsync(
    counterId: 1, 
    count: 2, 
    notes: "Barcode QR scan #9981"
);

Console.WriteLine($"New Total: {result.NewTotalCount} tickets");`}
                    </pre>
                  </div>
                </div>

                {/* Right: ASP.NET Core Dependency Injection */}
                <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-indigo-400" />
                      2. ASP.NET Core Dependency Injection
                    </h4>
                    <span className="text-[11px] font-mono text-indigo-300 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
                      Program.cs
                    </span>
                  </div>

                  <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 font-mono text-xs text-gray-300 space-y-2 overflow-x-auto">
                    <pre className="text-indigo-300 leading-relaxed whitespace-pre">
{`// In Program.cs (ASP.NET Core Web API / Minimal API):
builder.Services.AddSingleton<ITfwTicketApiClient>(sp =>
{
    return new TfwTicketApiClient(new TfwTicketApiOptions
    {
        BaseUrl = builder.Configuration["TfwTicketApi:BaseUrl"] 
                  ?? "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000'}",
        ApiKey = "<TICKET_API_KEY>",
        DefaultSenderName = ".NET Web Controller"
    });
});

// Inject ITfwTicketApiClient into any Controller:
[HttpPost("turnstile/entry")]
public async Task<IActionResult> Entry([FromServices] ITfwTicketApiClient client)
{
    var res = await client.RecordSaleAsync(counterId: 1, count: 1);
    return Ok(res);
}`}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Supported Methods Table */}
              <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Included C# Client Methods & Signatures
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-300">
                    <thead className="bg-gray-900 text-gray-400 uppercase font-mono text-[10px] border-b border-gray-700">
                      <tr>
                        <th className="p-2.5">C# Method</th>
                        <th className="p-2.5">Return Type</th>
                        <th className="p-2.5">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-750 font-mono">
                      <tr>
                        <td className="p-2.5 text-purple-300 font-bold">RecordSaleAsync(counterId, count, ...)</td>
                        <td className="p-2.5 text-emerald-400">Task&lt;TicketSaleResult&gt;</td>
                        <td className="p-2.5 font-sans">Atomically records / increments ticket sales or turnstile entries.</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-300 font-bold">SetCountAsync(counterId, newCount, ...)</td>
                        <td className="p-2.5 text-emerald-400">Task&lt;TicketSaleResult&gt;</td>
                        <td className="p-2.5 font-sans">Direct idempotent override of counter count for a date.</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-300 font-bold">RefundAsync(counterId, count, reason, ...)</td>
                        <td className="p-2.5 text-rose-400">Task&lt;RefundResult&gt;</td>
                        <td className="p-2.5 font-sans">Deducts tickets and records refund reason and manager authorization.</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-300 font-bold">ReconcileTurnstilesAsync(readings, ...)</td>
                        <td className="p-2.5 text-teal-400">Task&lt;ReconcileResult&gt;</td>
                        <td className="p-2.5 font-sans">Compares turnstile sensor readings with registered tickets, reporting variances.</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-300 font-bold">GetSalesAsync(date)</td>
                        <td className="p-2.5 text-blue-400">Task&lt;TicketSalesQueryResponse&gt;</td>
                        <td className="p-2.5 font-sans">Fetches all counters with tickets sold, tariff prices, and subtotals.</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-300 font-bold">GetCountersAsync()</td>
                        <td className="p-2.5 text-blue-400">Task&lt;CountersResponse&gt;</td>
                        <td className="p-2.5 font-sans">Lists all active park entrance counters and their configuration.</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-300 font-bold">ExportCsvAsync()</td>
                        <td className="p-2.5 text-yellow-400">Task&lt;string&gt;</td>
                        <td className="p-2.5 font-sans">Downloads complete multi-day sales data as raw CSV text.</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-300 font-bold">ExecuteActionAsync(request)</td>
                        <td className="p-2.5 text-indigo-400">Task&lt;JsonElement&gt;</td>
                        <td className="p-2.5 font-sans">Universal master method for any dynamic action.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: STANDALONE API HOSTING & DOCKER */}
          {apiSubTab === 'standalone' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="bg-gradient-to-r from-emerald-950/70 via-gray-800 to-teal-950/70 p-6 rounded-2xl border border-emerald-600/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-emerald-600 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg">Standalone Project</span>
                    <span className="bg-emerald-950 text-emerald-300 border border-emerald-700 text-xs px-2.5 py-1 rounded-lg">Self-Hosted</span>
                    <span className="bg-gray-800 text-gray-300 border border-gray-700 text-xs px-2.5 py-1 rounded-lg">Windows / Linux / Docker</span>
                  </div>
                  <h3 className="text-xl font-black text-white tracking-tight mt-1">
                    Independent Ticket Sales API Project
                  </h3>
                  <p className="text-sm text-gray-300 max-w-3xl">
                    Located in <code className="text-emerald-300 font-bold">/standalone-api/</code>. Zero-build Node.js application ready to host on your own server, internal park VM, local network turnstile gate server, or cloud container.
                  </p>
                </div>

                <div className="bg-gray-900/80 p-3.5 rounded-xl border border-gray-700/80 text-xs font-mono text-gray-300 space-y-1 flex-shrink-0">
                  <div className="text-gray-400 font-sans text-[11px] font-bold uppercase tracking-wider">Project Folder</div>
                  <div className="text-emerald-400 font-bold">/standalone-api/</div>
                  <div className="text-[11px] text-gray-400">Port: <span className="text-white font-bold">5000</span> (Configurable)</div>
                </div>
              </div>

              {/* Hosting Options Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Option 1: Docker */}
                <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="bg-blue-950 text-blue-300 border border-blue-700/60 font-mono text-xs font-bold px-2 py-0.5 rounded">Option 1</span>
                    <span className="text-xs text-gray-400 font-bold">Docker Compose</span>
                  </div>
                  <h4 className="font-bold text-white text-sm">Instant 1-Command Startup</h4>
                  <p className="text-xs text-gray-300">
                    Runs in an isolated container with volume-mounted local storage. Ideal for Linux or Portainer.
                  </p>
                  <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 font-mono text-xs text-blue-300 overflow-x-auto">
                    <code>cd standalone-api<br/>docker-compose up -d</code>
                  </div>
                </div>

                {/* Option 2: Windows Server Service */}
                <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="bg-purple-950 text-purple-300 border border-purple-700/60 font-mono text-xs font-bold px-2 py-0.5 rounded">Option 2</span>
                    <span className="text-xs text-gray-400 font-bold">Windows Server</span>
                  </div>
                  <h4 className="font-bold text-white text-sm">Windows Service (NSSM / IIS)</h4>
                  <p className="text-xs text-gray-300">
                    Runs as a background Windows Service that automatically boots with Windows without logging in.
                  </p>
                  <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 font-mono text-xs text-purple-300 overflow-x-auto">
                    <code>nssm install TfwTicketApi<br/>node server.js</code>
                  </div>
                </div>

                {/* Option 3: Linux PM2 */}
                <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-mono text-xs font-bold px-2 py-0.5 rounded">Option 3</span>
                    <span className="text-xs text-gray-400 font-bold">Linux / Ubuntu</span>
                  </div>
                  <h4 className="font-bold text-white text-sm">PM2 Process Manager</h4>
                  <p className="text-xs text-gray-300">
                    Zero-downtime clustering, log rotation, and automated restart on crash or server reboot.
                  </p>
                  <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 font-mono text-xs text-emerald-300 overflow-x-auto">
                    <code>npm install<br/>pm2 start server.js --name tfw-api</code>
                  </div>
                </div>
              </div>

              {/* Standalone Project Files Overview */}
              <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Files in the Standalone API Project (<code className="text-emerald-300">standalone-api/</code>)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="bg-gray-900 p-3 rounded-xl border border-gray-750">
                    <div className="font-mono font-bold text-white">server.js</div>
                    <div className="text-gray-400 text-[11px] mt-0.5">Complete REST API server, zero-build, native Node.js.</div>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-xl border border-gray-750">
                    <div className="font-mono font-bold text-white">package.json</div>
                    <div className="text-gray-400 text-[11px] mt-0.5">Standard npm dependencies (express, cors, dotenv).</div>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-xl border border-gray-750">
                    <div className="font-mono font-bold text-white">Dockerfile</div>
                    <div className="text-gray-400 text-[11px] mt-0.5">Multi-platform Docker container definition.</div>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-xl border border-gray-750">
                    <div className="font-mono font-bold text-white">docker-compose.yml</div>
                    <div className="text-gray-400 text-[11px] mt-0.5">One-click container orchestration and data volume.</div>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-xl border border-gray-750">
                    <div className="font-mono font-bold text-white">.env.example</div>
                    <div className="text-gray-400 text-[11px] mt-0.5">Environment template for PORT, API_KEY, and timezones.</div>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-xl border border-gray-750">
                    <div className="font-mono font-bold text-white">README.md</div>
                    <div className="text-gray-400 text-[11px] mt-0.5">Full hosting guides for IIS, NSSM, Docker, and PM2.</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in-up">
          <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-700 bg-gray-850 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Record & Edit Package / Other Sales</h3>
                  <p className="text-xs text-gray-400">Changes save directly and permanently to local database</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              {/* Target Metadata Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-750/70 p-3.5 rounded-xl border border-gray-700">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => {
                      setEditDate(e.target.value);
                      loadRecordForEdit(e.target.value, editPersonnelId);
                    }}
                    className="w-full bg-gray-900 text-white p-2 rounded-lg border border-gray-600 outline-none focus:border-teal-500 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">Ticket Personnel</label>
                  <select
                    value={editPersonnelId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setEditPersonnelId(id);
                      loadRecordForEdit(editDate, id);
                    }}
                    className="w-full bg-gray-900 text-white p-2 rounded-lg border border-gray-600 outline-none focus:border-teal-500 text-sm"
                  >
                    {ticketSalesPersonnel.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} (ID #{p.id})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Banner if saved */}
              {editSaveStatus === 'saved' && (
                <div className="bg-emerald-950/60 border border-emerald-500/50 p-3 rounded-xl flex items-center justify-between text-xs text-emerald-300 font-semibold animate-fade-in-up">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Saved to database permanently!
                  </span>
                  <span className="text-[11px] text-emerald-400/80">Synced live with database</span>
                </div>
              )}

              {/* Packages Section */}
              <div className="bg-gray-750/70 p-4 rounded-xl border border-gray-700">
                <h4 className="text-sm font-bold uppercase tracking-wider text-gray-200 mb-3 border-b border-gray-700 pb-2 flex items-center justify-between">
                  <span>Packages</span>
                  <span className="text-xs text-teal-400 font-normal">{packagesList.length} Options</span>
                </h4>
                <div className="space-y-3">
                  {packagesList.map(pkg => (
                    <div key={pkg.id || pkg.name} className="flex justify-between items-center bg-gray-800/80 p-2.5 rounded-lg border border-gray-700/60">
                      <div>
                        <span className="text-sm text-gray-200 font-medium block">{pkg.name}</span>
                        <span className="text-xs text-emerald-400 font-mono">{currency} {pkg.price.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditPackageChange(pkg.name, String(Math.max(0, (editPackages[pkg.name] || 0) - 1)))}
                          className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-650 text-white font-bold flex items-center justify-center text-sm"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={editPackages[pkg.name] || ''}
                          onChange={(e) => handleEditPackageChange(pkg.name, e.target.value)}
                          placeholder="0"
                          className="w-16 bg-gray-900 text-white text-center font-mono font-bold p-1.5 rounded-lg border border-gray-600 outline-none focus:border-teal-500 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleEditPackageChange(pkg.name, String((editPackages[pkg.name] || 0) + 1))}
                          className="w-8 h-8 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center justify-center text-sm shadow"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Other Sales Section */}
              <div className="bg-gray-750/70 p-4 rounded-xl border border-gray-700">
                <div className="flex items-center justify-between mb-3 border-b border-gray-700 pb-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-gray-200">Other Sales & Custom Passes</h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModalNewCatOpen(!modalNewCatOpen)}
                      className="text-xs bg-amber-600/30 hover:bg-amber-600 border border-amber-500/40 text-amber-300 hover:text-white font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                      title="Create new category right now"
                    >
                      <Tag className="w-3 h-3" />
                      <span>+ Category</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleEditOtherAdd}
                      className="text-xs bg-teal-600 hover:bg-teal-500 text-white font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      + Add Item
                    </button>
                  </div>
                </div>

                {modalNewCatOpen && (
                  <div className="bg-amber-950/40 border border-amber-500/50 p-2.5 rounded-xl mb-3 flex items-center gap-2 animate-fade-in-up">
                    <input
                      type="text"
                      placeholder="New Category name (e.g. Merchandise, Photos)..."
                      value={modalNewCatName}
                      onChange={(e) => setModalNewCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (modalNewCatName.trim()) {
                            handleCreateCategory(modalNewCatName.trim());
                            setModalNewCatName('');
                            setModalNewCatOpen(false);
                          }
                        }
                      }}
                      className="flex-1 bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-gray-600 focus:border-amber-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (modalNewCatName.trim()) {
                          handleCreateCategory(modalNewCatName.trim());
                          setModalNewCatName('');
                          setModalNewCatOpen(false);
                        }
                      }}
                      className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalNewCatOpen(false)}
                      className="text-gray-400 hover:text-white text-xs px-2 py-1.5 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="space-y-3">
                  {editOtherSales.map((item, idx) => (
                    <div key={idx} className="bg-gray-800/90 p-3 rounded-xl border border-gray-700/80 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={
                            packagesList.some(p => p.name === item.category) 
                              ? item.category 
                              : (otherSalesCategories.includes(item.category) ? item.category : '__CUSTOM_NEW_SALE__')
                          }
                          onChange={(e) => handleEditOtherCategoryChange(idx, e.target.value)}
                          className="flex-1 bg-gray-900 text-white text-xs p-2 rounded-lg border border-gray-600 outline-none focus:border-teal-500 font-medium cursor-pointer"
                        >
                          <option value="" disabled>-- Select Category or Package --</option>
                          {otherSalesCategories.length > 0 && (
                            <optgroup label="📂 Categories (Created by Sales Officer)">
                              {otherSalesCategories.map((cat: string) => (
                                <option key={cat} value={cat}>📁 {cat}</option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="🎟️ Packages">
                            {packagesList.map(pkg => (
                              <option key={pkg.id || pkg.name} value={pkg.name}>
                                {pkg.name} ({currency} {pkg.price.toLocaleString()})
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="✨ Custom / Other Sale">
                            <option value="__CUSTOM_NEW_SALE__">+ Custom / New Sale (Write Name & Amount)</option>
                          </optgroup>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleEditOtherRemove(idx)}
                          className="text-red-400 hover:text-red-300 font-bold px-2 py-1 rounded hover:bg-red-500/10 text-sm cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Custom / Category Sale Name Input */}
                      {(!packagesList.some(p => p.name === item.category) || item.category === '__CUSTOM_NEW_SALE__' || otherSalesCategories.includes(item.category)) && (
                        <div className="bg-amber-950/30 border border-amber-500/40 p-2.5 rounded-lg space-y-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center justify-between">
                            <span>✍️ Sale Name / Item Description:</span>
                            <span className="text-[9px] text-gray-400 font-normal">
                              {otherSalesCategories.includes(item.category) ? `Category: ${item.category}` : '(Sums into Total Daily Revenue)'}
                            </span>
                          </label>
                          <input
                            type="text"
                            placeholder={otherSalesCategories.includes(item.category) ? `Enter item description in ${item.category}...` : "Write sale name (e.g. VIP Add-on, Special Pass)..."}
                            value={item.customName !== undefined ? item.customName : (!packagesList.some(p => p.name === item.category) && item.category !== '__CUSTOM_NEW_SALE__' && !otherSalesCategories.includes(item.category) ? item.category : '')}
                            onChange={(e) => handleEditOtherCustomNameChange(idx, e.target.value)}
                            className="w-full bg-gray-900 text-white p-2 rounded-lg border border-gray-600 focus:border-amber-400 outline-none text-xs font-medium"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="block text-gray-400 text-[10px] uppercase font-bold mb-1">Discount Option</label>
                          <input
                            type="text"
                            placeholder="e.g. 10%"
                            value={item.discount || ''}
                            onChange={(e) => handleEditOtherDiscountChange(idx, e.target.value)}
                            className="w-full bg-gray-900 text-white p-1.5 rounded border border-gray-600 outline-none font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-emerald-400 text-[10px] uppercase font-bold mb-1">Amount ({currency})</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={item.amount !== undefined ? item.amount : ''}
                            onChange={(e) => handleEditOtherAmountChange(idx, e.target.value)}
                            className="w-full bg-gray-900 text-emerald-400 font-mono font-bold p-1.5 rounded border border-gray-600 outline-none text-right"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {editOtherSales.length === 0 && (
                    <p className="text-gray-500 text-xs text-center italic py-2">No other sales items added.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-gray-700 bg-gray-850 flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-400 uppercase font-semibold">Total Amount:</span>
                <p className="text-2xl font-bold text-emerald-400 font-mono">
                  {currency} {calculateEditTotal().toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-gray-400 hover:text-white text-xs font-semibold hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditRecord}
                  disabled={editSaveStatus === 'saving'}
                  className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white px-5 py-2 rounded-xl font-bold text-xs shadow-lg shadow-emerald-900/40 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editSaveStatus === 'saving' ? 'Saving...' : 'Save to Database Permanently'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
