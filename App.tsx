import React, { useState, useMemo, useCallback, useEffect, useRef, ReactNode } from 'react';
import { 
  RIDES, 
  FLOORS, 
  OPERATORS, 
  TICKET_SALES_PERSONNEL, 
  COUNTERS, 
  RIDES_ARRAY, 
  OPERATORS_ARRAY, 
  TICKET_SALES_PERSONNEL_ARRAY, 
  COUNTERS_ARRAY, 
  MAINTENANCE_PERSONNEL, 
  MAINTENANCE_PERSONNEL_ARRAY,
  CX_PERSONNEL,
  CX_PERSONNEL_ARRAY,
  DEFAULT_PACKAGES,
  DEFAULT_SINGLE_GNR_RIDES,
  DEFAULT_APP_CONFIG,
  getLocalDateString,
  findLatestRecordedDate,
  findPreviousAssignmentsDate,
  findPreviousTicketSalesAssignmentsDate,
  DEFAULT_OTHER_SALES_CATEGORIES
} from './constants';
import { 
  RideWithCount, 
  Ride, 
  Operator, 
  AttendanceRecord, 
  Counter, 
  CounterWithSales, 
  HistoryRecord, 
  PackageSalesRecord, 
  AttendanceData, 
  PackageSalesData, 
  MaintenanceTicket,
  PackageItem,
  SingleGnrRide,
  AppConfig,
  ManagementSummaryNotes,
  CustomTechnicalCategory,
  RidePreCheckRecord,
  AssignmentLockRecord,
  ManagementWhatsAppReport
} from './types';
import { getSeedManagementReports } from './utils/whatsappManagementParser';
import { useAuth, Role } from './hooks/useAuth';
import useFirebaseSync from './hooks/useFirebaseSync';
import { isFirebaseConfigured, database } from './firebaseConfig';
import { NotificationContext, useNotification, NotificationType } from './imageStore';
import NotificationComponent from './components/AttendanceCheckin';

import Login from './components/Login';
import Header from './components/Header';
import RideCard from './components/RideCard';
import Footer from './components/Footer';
import Dashboard from './components/Dashboard';
import MaintenanceDashboard from './components/MaintenanceDashboard';
import { MaintenanceKpiDashboard } from './components/MaintenanceKpiDashboard';
import { ManagementSummaryView } from './components/ManagementSummaryView';
import { AdminManager } from './components/AdminManager';
import { ShareModal } from './components/ShareModal';
import { KioskMonitorView } from './components/KioskMonitorView';
import { DeveloperModal } from './components/DeveloperModal';
import { DateNavigationBar } from './components/DateNavigationBar';
import { ConfirmModal } from './components/ConfirmModal';
import { playReportedIssueSound, playSolvedIssueSound, unlockAudio } from './utils/soundAlerts';
import { TBGCentralPortal } from './components/TBGCentralPortal';
import { TBGParkManagementWrapper } from './components/TBGParkManagementWrapper';
import { ArrowLeft } from 'lucide-react';

// Imports from Views.tsx
import {
  Reports,
  EditImageModal,
  OperatorManager,
  AssignmentView,
  ExpertiseReport,
  DailyRoster,
  KioskModeWrapper,
  BackupManager,
  TicketSalesView,
  TicketSalesAssignmentView,
  TicketSalesRoster,
  TicketSalesExpertiseReport,
  HistoryLog,
  DailySalesEntry,
  ConfigErrorScreen,
  CustomerExperienceView,
  OperationOfficerRideView,
  normalizeAssigneeIds
} from './components/Views';
import { SalesOfficerDashboard } from './components/SalesOfficerDashboard';

// Notification System Implementation
interface NotificationState {
  message: string;
  type: NotificationType;
  visible: boolean;
}

const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notification, setNotification] = useState<NotificationState>({ message: '', type: 'info', visible: false });

  const showNotification = useCallback((message: string, type: NotificationType = 'info', duration: number = 4000) => {
    setNotification({ message, type, visible: true });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, visible: false }));
    }, duration);
  }, []);

  const hideNotification = () => {
    setNotification(prev => ({ ...prev, visible: false }));
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <NotificationComponent
        message={notification.message}
        type={notification.type}
        visible={notification.visible}
        onClose={hideNotification}
      />
    </NotificationContext.Provider>
  );
};

type View = 'counter' | 'reports' | 'assignments' | 'expertise' | 'roster' | 'ticket-sales-dashboard' | 'ts-assignments' | 'ts-roster' | 'ts-expertise' | 'history' | 'my-sales' | 'sales-officer-dashboard' | 'dashboard' | 'maintenance-dashboard' | 'maintenance-kpi' | 'cx-feedback' | 'information-desk' | 'management-summary' | 'other-sales-categories';
type Modal = 'edit-image' | 'operators' | 'backup' | 'admin-manager' | 'share' | 'developer' | 'presentation' | null;
type FirebaseObject<T extends { id: number | string }> = Record<string | number, Omit<T, 'id'>>;

interface AppContentProps {
    onReturnToHub?: () => void;
}

const AppContent: React.FC<AppContentProps> = ({ onReturnToHub }) => {
    const { role, currentUser, login, logout } = useAuth();
    const { showNotification } = useNotification();
    
    // Always use local calendar date
    const [today, setToday] = useState(() => getLocalDateString());
    const [isCheckinAllowed, setIsCheckinAllowed] = useState(true);

    // App State
    const getInitialViewForRole = useCallback((r: Role): View => {
        if (r === 'management') return 'management-summary';
        if (r === 'admin') return 'dashboard';
        if (r === 'operation-officer') return 'counter';
        if (r === 'operator') return 'roster';
        if (r === 'maintenance') return 'maintenance-dashboard';
        if (r === 'maintenance-kpi') return 'maintenance-kpi';
        if (r === 'cx') return 'cx-feedback';
        if (r === 'information-desk') return 'information-desk';
        return 'counter';
    }, []);

    const isViewAllowedForRole = useCallback((v: View, r: Role): boolean => {
        if (r === 'admin') return true;
        if (r === 'management') return v === 'management-summary' || v === 'maintenance-kpi';
        if (r === 'operator') return v === 'roster' || v === 'counter';
        if (r === 'operation-officer') return ['dashboard', 'counter', 'roster', 'assignments', 'reports', 'history'].includes(v);
        if (r === 'maintenance') return v === 'maintenance-dashboard' || v === 'maintenance-kpi' || v === 'cx-feedback';
        if (r === 'maintenance-kpi') return v === 'maintenance-kpi' || v === 'maintenance-dashboard';
        if (r === 'cx') return v === 'cx-feedback';
        if (r === 'information-desk') return v === 'information-desk';
        return true;
    }, []);

    const [currentView, setCurrentView] = useState<View>(() => getInitialViewForRole(role));
    const [modal, setModal] = useState<Modal>(null);
    const [selectedRideForModal, setSelectedRideForModal] = useState<Ride | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

    // Non-blocking in-app confirmation dialog state
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title?: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        confirmVariant?: 'danger' | 'primary' | 'warning';
        onConfirm: () => void;
    }>({
        isOpen: false,
        message: '',
        onConfirm: () => {},
    });

    // Close any active modal or presentation slide whenever an issue is reported
    useEffect(() => {
        const handleIssueAlert = () => {
            setModal(null);
        };
        window.addEventListener('tfw-live-issue-alert', handleIssueAlert);
        window.addEventListener('tfw:new-issue-reported', handleIssueAlert);
        return () => {
            window.removeEventListener('tfw-live-issue-alert', handleIssueAlert);
            window.removeEventListener('tfw:new-issue-reported', handleIssueAlert);
        };
    }, []);

    // Refs for detecting data updates
    const prevOperatorsRef = useRef<Operator[] | undefined>(undefined);
    const prevTicketSalesPersonnelRef = useRef<Operator[] | undefined>(undefined);

    // Firebase / Persistent Server Synced State
    const { data: dailyCounts, setData: setDailyCounts, isLoading: l1 } = useFirebaseSync<Record<string, Record<string, number>>>('data/dailyCounts', {});
    const { data: dailyPackageCounts, setData: setDailyPackageCounts } = useFirebaseSync<Record<string, Record<string, number>>>('data/dailyPackageCounts', {});
    const { data: dailyTicketCounts, setData: setDailyTicketCounts } = useFirebaseSync<Record<string, Record<string, number>>>('data/dailyTicketCounts', {});
    const { data: ticketSalesData, setData: setTicketSalesData, isLoading: l2 } = useFirebaseSync<Record<string, Record<string, number>>>('data/ticketSalesData', {});
    const { data: ridesData, setData: setRidesData, isLoading: l3 } = useFirebaseSync<Record<string, any>>('config/rides', RIDES);
    const { data: operatorsData, setData: setOperatorsData, isLoading: l4 } = useFirebaseSync<Record<string, any>>('config/operators', OPERATORS);
    const { data: ticketSalesPersonnelData, setData: setTicketSalesPersonnelData, isLoading: l5 } = useFirebaseSync<Record<string, any>>('config/ticketSalesPersonnel', TICKET_SALES_PERSONNEL);
    const { data: countersData, setData: setCountersData, isLoading: l6 } = useFirebaseSync<Record<string, any>>('config/counters', COUNTERS);
    const { data: dailyAssignments, setData: setDailyAssignments, isLoading: l7 } = useFirebaseSync<Record<string, Record<string, number[]>>>('data/operatorAssignments', {});
    const { data: ticketSalesAssignments, setData: setTicketSalesAssignments, isLoading: l8 } = useFirebaseSync<Record<string, Record<string, number[]>>>('data/ticketSalesAssignments', {});
    const { data: attendanceData, setData: setAttendanceData, isLoading: l9 } = useFirebaseSync<AttendanceData>('data/attendance', {});
    const { data: historyLogData, setData: setHistoryLogData, isLoading: l10 } = useFirebaseSync<Record<number, Omit<HistoryRecord, 'id'>>>('data/historyLog', {});
    const { data: packageSalesData, setData: setPackageSalesData, isLoading: l12 } = useFirebaseSync<PackageSalesData>('data/packageSales', {});
    const { data: rawOtherSalesCategories, setData: setRawOtherSalesCategories, isLoading: l11 } = useFirebaseSync<string[]>('config/otherSalesCategories', DEFAULT_OTHER_SALES_CATEGORIES);
    const { data: maintenanceTickets, setData: setMaintenanceTickets, isLoading: l13 } = useFirebaseSync<Record<string, Record<string, MaintenanceTicket>>>('data/maintenanceTickets', {});
    const { data: maintenancePersonnelData, setData: setMaintenancePersonnelData, isLoading: l14 } = useFirebaseSync<Record<string, any>>('config/maintenancePersonnel', MAINTENANCE_PERSONNEL);
    const { data: cxPersonnelData, setData: setCxPersonnelData } = useFirebaseSync<Record<string, any>>('config/cxPersonnel', CX_PERSONNEL);
    const { data: packagesData, setData: setPackagesData } = useFirebaseSync<Record<string, any>>('config/packages', DEFAULT_PACKAGES);
    const { data: singleGnrRidesData, setData: setSingleGnrRidesData } = useFirebaseSync<SingleGnrRide[]>('config/singleGnrRides', DEFAULT_SINGLE_GNR_RIDES);
    const { data: floorsData, setData: setFloorsData } = useFirebaseSync<string[]>('config/floors', FLOORS);
    const { data: appConfigData, setData: setAppConfigData } = useFirebaseSync<AppConfig>('config/appConfig', DEFAULT_APP_CONFIG);
    const { data: staffCredentialsData, setData: setStaffCredentialsData } = useFirebaseSync<Record<string, { password: string; recoveryPin: string; createdAt: string; updatedAt?: string }>>('data/staffCredentials', {});
    const { data: ridePreChecksData, setData: setRidePreChecksData } = useFirebaseSync<Record<string, Record<string | number, RidePreCheckRecord>>>('data/ridePreChecks', {});
    const { data: assignmentLocksData, setData: setAssignmentLocksData } = useFirebaseSync<Record<string, Record<string | number, AssignmentLockRecord>>>('data/assignmentLocks', {});
    const { data: rawWhatsappReports } = useFirebaseSync<Record<string, ManagementWhatsAppReport>>('data/whatsappManagementReports', {});
    
    const whatsappManagementReports = useMemo(() => {
        const seeds = getSeedManagementReports();
        const merged: Record<string, ManagementWhatsAppReport> = { ...seeds };
        if (rawWhatsappReports && typeof rawWhatsappReports === 'object') {
            Object.entries(rawWhatsappReports).forEach(([date, report]) => {
                if (report) {
                    merged[date] = {
                        ...(seeds[date] || {}),
                        ...report,
                        salesAndRevenue: {
                            ...(seeds[date]?.salesAndRevenue || {}),
                            ...(report.salesAndRevenue || {})
                        },
                        counterBreakdown: (report.counterBreakdown && report.counterBreakdown.length >= 12)
                            ? report.counterBreakdown
                            : (seeds[date]?.counterBreakdown || report.counterBreakdown || [])
                    };
                }
            });
        }
        return merged;
    }, [rawWhatsappReports]);

    const [appLogo, setAppLogo] = useState<string | null>(null);

    // Sync app logo from appConfig or standalone path
    useEffect(() => {
        if (appConfigData?.appLogo) {
            setAppLogo(appConfigData.appLogo);
        }
    }, [appConfigData]);

    const handleLogoChange = useCallback((newLogo: string | null) => {
        setAppLogo(newLogo);
        if (isFirebaseConfigured) {
            database.ref('config/appLogo').set(newLogo);
            database.ref('config/appConfig/appLogo').set(newLogo);
        }
    }, []);

    const otherSalesCategories = useMemo<string[]>(() => {
        if (!rawOtherSalesCategories || !Array.isArray(rawOtherSalesCategories) || rawOtherSalesCategories.length === 0) {
            return DEFAULT_OTHER_SALES_CATEGORIES;
        }
        return rawOtherSalesCategories;
    }, [rawOtherSalesCategories]);

    const handleSaveOtherSalesCategories = useCallback((categories: string[]) => {
        const cleaned = Array.from(new Set(categories.map(c => c.trim()).filter(Boolean)));
        setRawOtherSalesCategories(cleaned);
        if (isFirebaseConfigured) {
            database.ref('config/otherSalesCategories').set(cleaned);
        }
    }, [isFirebaseConfigured, setRawOtherSalesCategories]);

    const handleAddOtherSalesCategory = useCallback((categoryName: string) => {
        const trimmed = categoryName.trim();
        if (!trimmed) return;
        const current = otherSalesCategories;
        if (!current.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
            const updated = [...current, trimmed];
            handleSaveOtherSalesCategories(updated);
        }
    }, [otherSalesCategories, handleSaveOtherSalesCategories]);

    const handleDeleteOtherSalesCategory = useCallback((categoryName: string) => {
        const current = otherSalesCategories;
        const updated = current.filter(c => c.toLowerCase() !== categoryName.toLowerCase());
        handleSaveOtherSalesCategories(updated);
    }, [otherSalesCategories, handleSaveOtherSalesCategories]);

    // Find the latest recorded operational date across all collections
    const latestRecordedDate = useMemo(() => {
        return findLatestRecordedDate(
            dailyCounts,
            ticketSalesData,
            dailyAssignments,
            packageSalesData,
            attendanceData,
            maintenanceTickets,
            dailyPackageCounts,
            dailyTicketCounts
        );
    }, [dailyCounts, ticketSalesData, dailyAssignments, packageSalesData, attendanceData, maintenanceTickets, dailyPackageCounts, dailyTicketCounts]);

    // Persistent Active Date State
    const [selectedDate, setSelectedDateState] = useState<string>(() => {
        const todayStr = getLocalDateString();
        const savedDate = window.localStorage.getItem('TFW_ACTIVE_DATE');
        const savedDay = window.localStorage.getItem('TFW_ACTIVE_DATE_SAVED_DAY');
        if (savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate) && savedDay === todayStr) {
            return savedDate;
        }
        return todayStr;
    });

    // Automatically align with cloud active operational date and view when broadcasted across devices
    useEffect(() => {
        if (appConfigData?.activeOperationalDate && /^\d{4}-\d{2}-\d{2}$/.test(appConfigData.activeOperationalDate)) {
            setSelectedDateState(appConfigData.activeOperationalDate);
            window.localStorage.setItem('TFW_ACTIVE_DATE', appConfigData.activeOperationalDate);
            window.localStorage.setItem('TFW_ACTIVE_DATE_SAVED_DAY', getLocalDateString());
        }
    }, [appConfigData?.activeOperationalDate]);

    const prevBroadcastViewRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (appConfigData?.activeView && appConfigData.activeView !== prevBroadcastViewRef.current) {
            const targetView = appConfigData.activeView as View;
            if (isViewAllowedForRole(targetView, role)) {
                // Only switch if this is an explicit update from another device after initial mount
                if (prevBroadcastViewRef.current !== undefined && targetView !== currentView) {
                    setCurrentView(targetView);
                }
            }
            prevBroadcastViewRef.current = appConfigData.activeView;
        }
    }, [appConfigData?.activeView, role, isViewAllowedForRole, currentView]);

    // Play pleasant high-low notification chime when maintenance solves a reported issue
    const playNotificationSound = useCallback(() => {
        playSolvedIssueSound();
    }, []);

    // Watch for maintenance tickets:
    // 1. New ticket created with status 'reported' -> chime for maintenance staff / active users
    // 2. Ticket transitioned to 'solved' -> chime & alert for Games & Ride Associate (operator)
    const prevMaintenanceTicketsRef = useRef<Map<string, string>>(new Map());
    const isMaintenanceTicketsInitialMountRef = useRef<boolean>(true);
    useEffect(() => {
        if (!maintenanceTickets || typeof maintenanceTickets !== 'object') return;
        const currentMap = new Map<string, { status: string; ticket: MaintenanceTicket }>();
        Object.values(maintenanceTickets).forEach((dayTickets: any) => {
            if (dayTickets && typeof dayTickets === 'object') {
                Object.values(dayTickets).forEach((t: any) => {
                    if (t && t.id && t.status) {
                        currentMap.set(t.id, { status: t.status, ticket: t });
                    }
                });
            }
        });

        if (isMaintenanceTicketsInitialMountRef.current) {
            isMaintenanceTicketsInitialMountRef.current = false;
            const initStatusMap = new Map<string, string>();
            currentMap.forEach(({ status }, id) => initStatusMap.set(id, status));
            prevMaintenanceTicketsRef.current = initStatusMap;
            return;
        }

        currentMap.forEach(({ status, ticket }, id) => {
            const prevStatus = prevMaintenanceTicketsRef.current.get(id);

            // Case A: A new issue has arrived in 'reported' status
            if (!prevStatus && status === 'reported') {
                // Play sound alert for maintenance, admin, or anyone monitoring issues
                playReportedIssueSound({ 
                    rideName: ticket.rideName, 
                    problem: ticket.problem,
                    reportedByName: ticket.reportedByName,
                    targetDepartment: ticket.targetDepartment,
                    feedbackCategory: ticket.feedbackCategory,
                    source: ticket.source,
                    reportedByRole: ticket.reportedByRole
                });
                showNotification(
                    `🔔 New Issue Reported: ${ticket.rideName || 'Assigned Ride'} - "${ticket.problem || 'Issue detected'}"`,
                    'info',
                    8000
                );
            }

            // Case B: Ticket solved by maintenance -> alert Games & Ride Associate
            if (status === 'solved' && prevStatus && prevStatus !== 'solved') {
                if (role === 'operator') {
                    playSolvedIssueSound({
                        rideName: ticket.rideName,
                        technician: ticket.assignedToName || 'Maintenance Technician'
                    });
                    showNotification(
                        `🎉 Issue Resolved: Maintenance has solved the issue for ${ticket.rideName}! (${ticket.assignedToName || 'Maintenance Technician'})`,
                        'success',
                        6000
                    );
                }
            }
        });

        const nextStatusMap = new Map<string, string>();
        currentMap.forEach(({ status }, id) => nextStatusMap.set(id, status));
        prevMaintenanceTicketsRef.current = nextStatusMap;
    }, [maintenanceTickets, role, showNotification, playNotificationSound, playReportedIssueSound]);

    const setSelectedDate = useCallback((newDate: string, syncGlobal: boolean = true) => {
        setSelectedDateState(newDate);
        window.localStorage.setItem('TFW_ACTIVE_DATE', newDate);
        window.localStorage.setItem('TFW_ACTIVE_DATE_SAVED_DAY', getLocalDateString());
        if (syncGlobal) {
            database.ref('config/appConfig/activeOperationalDate').set(newDate);
        }
    }, []);

    // Broadcast current view, active operational date, and data to all devices everywhere (mobile and desktop)
    const [isBroadcastingSync, setIsBroadcastingSync] = useState(false);
    const handleBroadcastSync = useCallback(async () => {
        setIsBroadcastingSync(true);
        try {
            // 1. Broadcast active date, current view, and state across mobile and desktop
            await database.syncViewEverywhere(selectedDate, currentView);

            // 2. Pull latest full database snapshot immediately
            await database.engine.fetchFullDatabase();

            showNotification(`✨ Mobile & Desktop Synced! View (${currentView}) and date (${selectedDate}) synchronized across all devices.`, 'success');
        } catch (e) {
            showNotification('Could not broadcast sync to other devices.', 'error');
        } finally {
            setTimeout(() => setIsBroadcastingSync(false), 800);
        }
    }, [selectedDate, currentView, showNotification]);

    // Check if there is data for selectedDate
    const hasDataForSelectedDate = useMemo(() => {
        const counts = dailyCounts[selectedDate];
        const sales = ticketSalesData[selectedDate];
        const assigns = dailyAssignments[selectedDate];
        const pkg = packageSalesData[selectedDate];
        const att = attendanceData[selectedDate];
        const hasCounts = counts && Object.values(counts).some(v => Number(v) > 0);
        const hasSales = sales && Object.values(sales).some(v => Number(v) > 0);
        const hasAssigns = assigns && Object.keys(assigns).length > 0;
        const hasPkg = pkg && Object.keys(pkg).length > 0;
        const hasAtt = att && Object.keys(att).length > 0;
        return Boolean(hasCounts || hasSales || hasAssigns || hasPkg || hasAtt);
    }, [dailyCounts, ticketSalesData, dailyAssignments, packageSalesData, attendanceData, selectedDate]);

    // Check if there is data for today
    const hasDataForToday = useMemo(() => {
        const counts = dailyCounts[today];
        const sales = ticketSalesData[today];
        const hasCounts = counts && Object.values(counts).some(v => Number(v) > 0);
        const hasSales = sales && Object.values(sales).some(v => Number(v) > 0);
        return Boolean(hasCounts || hasSales);
    }, [dailyCounts, ticketSalesData, today]);

    // Auto-select latest recorded date if today has no data on fresh launch without a prior manual pick
    const hasAutoSelectedRef = useRef(false);
    useEffect(() => {
        if (!hasAutoSelectedRef.current && latestRecordedDate && !hasDataForToday) {
            const savedDate = window.localStorage.getItem('TFW_ACTIVE_DATE');
            if (!savedDate) {
                setSelectedDateState(latestRecordedDate);
                hasAutoSelectedRef.current = true;
            }
        }
    }, [latestRecordedDate, hasDataForToday]);

    // Memoized arrays derived from server objects
    const rides = useMemo<Ride[]>(() => {
        if (!ridesData) return RIDES_ARRAY;
        return Object.entries(ridesData).map(([id, ride]) => ({ id: Number(id), ...(ride as object) } as Ride));
    }, [ridesData]);

    const operators = useMemo<Operator[]>(() => {
        if (!operatorsData) return OPERATORS_ARRAY;
        return Object.entries(operatorsData).map(([id, op]) => ({ id: Number(id), ...(op as object) } as Operator));
    }, [operatorsData]);

    const ticketSalesPersonnel = useMemo<Operator[]>(() => {
        if (!ticketSalesPersonnelData) return TICKET_SALES_PERSONNEL_ARRAY;
        return Object.entries(ticketSalesPersonnelData).map(([id, p]) => ({ id: Number(id), ...(p as object) } as Operator));
    }, [ticketSalesPersonnelData]);

    const counters = useMemo<Counter[]>(() => {
        if (!countersData) return COUNTERS_ARRAY;
        return Object.entries(countersData).map(([id, c]) => ({ id: Number(id), ...(c as object) } as Counter));
    }, [countersData]);

    const maintenancePersonnel = useMemo<Operator[]>(() => {
        const list = !maintenancePersonnelData
            ? MAINTENANCE_PERSONNEL_ARRAY
            : Object.entries(maintenancePersonnelData).map(([id, p]) => ({ id: Number(id), ...(p as object) } as Operator));
        return list.filter(p => {
            const n = String(p.name || '').toLowerCase().trim();
            const r = String(p.role || '').toLowerCase().trim();
            return (
                n !== 'operation officer' &&
                !n.includes('operation officer') &&
                r !== 'operation officer' &&
                !r.includes('operation officer')
            );
        });
    }, [maintenancePersonnelData]);

    const cxPersonnel = useMemo<Operator[]>(() => {
        if (!cxPersonnelData) return CX_PERSONNEL_ARRAY;
        return Object.entries(cxPersonnelData).map(([id, p]) => ({ id: Number(id), ...(p as object) } as Operator));
    }, [cxPersonnelData]);

    const packages = useMemo<PackageItem[]>(() => {
        let loadedList: PackageItem[] = [];
        if (!packagesData) {
            loadedList = DEFAULT_PACKAGES;
        } else if (Array.isArray(packagesData)) {
            loadedList = packagesData;
        } else {
            loadedList = Object.entries(packagesData).map(([id, p]) => ({ id, ...(p as object) } as PackageItem));
        }

        // Guarantee all DEFAULT_PACKAGES (including the weekend & Gov.Holiday packages) are always present
        const existingNames = new Set(loadedList.map(p => (p.name || '').trim().toLowerCase()));
        const merged = [...loadedList];
        for (const defPkg of DEFAULT_PACKAGES) {
            if (!existingNames.has(defPkg.name.trim().toLowerCase())) {
                merged.push(defPkg);
                existingNames.add(defPkg.name.trim().toLowerCase());
            }
        }
        return merged;
    }, [packagesData]);

    // Auto-sync any missing default packages to Firebase config/packages
    useEffect(() => {
        if (!packagesData || !isFirebaseConfigured) return;
        const currentList = Array.isArray(packagesData) 
            ? packagesData 
            : Object.entries(packagesData).map(([id, p]) => ({ id, ...(p as object) } as PackageItem));
        const currentNames = new Set(currentList.map(p => (p.name || '').trim().toLowerCase()));
        const missing = DEFAULT_PACKAGES.filter(p => !currentNames.has(p.name.trim().toLowerCase()));
        if (missing.length > 0) {
            const merged = [...currentList, ...missing];
            database.ref('config/packages').set(merged)
                .catch(err => console.error("Failed to auto-sync missing default packages:", err));
        }
    }, [packagesData, isFirebaseConfigured]);

    const singleGnrRides = useMemo<SingleGnrRide[]>(() => {
        if (Array.isArray(singleGnrRidesData) && singleGnrRidesData.length > 0) {
            return singleGnrRidesData;
        }
        return DEFAULT_SINGLE_GNR_RIDES;
    }, [singleGnrRidesData]);

    const floors = useMemo<string[]>(() => {
        return floorsData && floorsData.length > 0 ? floorsData : FLOORS;
    }, [floorsData]);

    const appConfig = useMemo<AppConfig>(() => {
        return appConfigData || DEFAULT_APP_CONFIG;
    }, [appConfigData]);

    const historyLog = useMemo<HistoryRecord[]>(() => {
        return historyLogData 
            ? Object.entries(historyLogData).map(([id, h]) => ({ id: Number(id), ...(h as object) } as HistoryRecord)).sort((a,b) => b.id - a.id) 
            : [];
    }, [historyLogData]);

    // UI Date states
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFloor, setSelectedFloor] = useState('');
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [mySalesStartDate, setMySalesStartDate] = useState(today);
    const [mySalesEndDate, setMySalesEndDate] = useState(today);

    // Day tick interval (updates today without logging out or reloading)
    useEffect(() => {
        const checkTime = () => {
            const now = new Date();
            const newToday = getLocalDateString(now);
            if (newToday !== today) {
                setToday(newToday);
            }
            const cutoff = appConfig.cutoffHour || 22;
            setIsCheckinAllowed(now.getHours() < cutoff);
        };

        checkTime();
        const intervalId = setInterval(checkTime, 60000);
        return () => clearInterval(intervalId);
    }, [today, appConfig.cutoffHour]);

    useEffect(() => {
        setCurrentView(getInitialViewForRole(role));
    }, [role, getInitialViewForRole]);

    useEffect(() => {
        if (isFirebaseConfigured) {
            const connectedRef = database.ref('.info/connected');
            const listener = connectedRef.on('value', (snap: any) => {
                setConnectionStatus(snap.val() === true ? 'connected' : 'disconnected');
            });
            return () => connectedRef.off('value', listener);
        }
    }, []);

    const logAction = useCallback((action: string, details: string) => {
        if (!currentUser) return;
        const newId = Date.now();
        const newRecord: Omit<HistoryRecord, 'id'> = {
            timestamp: new Date().toISOString(),
            user: currentUser.name,
            action,
            details,
        };
        if (isFirebaseConfigured) {
            Promise.resolve().then(() => {
                database.ref(`data/historyLog/${newId}`).set(newRecord).catch(e => console.error("Failed to log action:", e));
            });
        }
    }, [currentUser]);

    const handleSaveSingleGnrRides = useCallback(async (newRides: SingleGnrRide[]) => {
        setSingleGnrRidesData(newRides);
        if (isFirebaseConfigured) {
            await database.ref('config/singleGnrRides').set(newRides);
        }
        logAction('UPDATE_SINGLE_GNR_PRICING', `Updated Single G&R pricing catalog with ${newRides.length} rides.`);
        showNotification(`Updated Single G&R pricing (${newRides.length} rides).`, 'success');
    }, [setSingleGnrRidesData, isFirebaseConfigured, logAction, showNotification]);

    const handleLogout = useCallback(() => {
        if (currentUser) {
            logAction('LOGOUT', `${currentUser.name} logged out.`);
        }
        logout();
    }, [currentUser, logAction, logout]);

    const attendanceArray = useMemo<AttendanceRecord[]>(() => {
        const arr: AttendanceRecord[] = [];
        for (const date in attendanceData) {
            for (const operatorId in attendanceData[date]) {
                arr.push({ date, operatorId: Number(operatorId), ...attendanceData[date][operatorId] });
            }
        }
        return arr;
    }, [attendanceData]);

    const ridesWithCounts = useMemo<RideWithCount[]>(() => {
        const countsForDate = dailyCounts[selectedDate] || {};
        const pkgForDate = dailyPackageCounts[selectedDate] || {};
        const tktForDate = dailyTicketCounts[selectedDate] || {};
        return rides.map(ride => {
            const val = countsForDate[ride.id] !== undefined ? countsForDate[ride.id] : countsForDate[String(ride.id)];
            const pkg = pkgForDate[ride.id] !== undefined ? pkgForDate[ride.id] : pkgForDate[String(ride.id)];
            const tkt = tktForDate[ride.id] !== undefined ? tktForDate[ride.id] : tktForDate[String(ride.id)];
            const numVal = Number(val) || 0;
            let pkgNum = Number(pkg) || 0;
            let tktNum = Number(tkt) || 0;
            if (pkgNum === 0 && tktNum === 0 && numVal > 0) {
                pkgNum = numVal;
            }
            const sum = pkgNum + tktNum;
            return { 
                ...ride, 
                count: sum,
                packageCount: pkgNum,
                ticketCount: tktNum
            };
        });
    }, [rides, dailyCounts, dailyPackageCounts, dailyTicketCounts, selectedDate]);

    const countersWithSales = useMemo<CounterWithSales[]>(() => {
        const salesForSelected = ticketSalesData[selectedDate] || {};
        return counters.map(counter => {
            const val = salesForSelected[counter.id] !== undefined ? salesForSelected[counter.id] : salesForSelected[String(counter.id)];
            return { ...counter, sales: Number(val) || 0 };
        });
    }, [counters, ticketSalesData, selectedDate]);

    const filteredRides = useMemo(() => ridesWithCounts.filter(ride => 
        ride.name.toLowerCase().includes(searchTerm.toLowerCase()) && (!selectedFloor || ride.floor === selectedFloor)
    ), [ridesWithCounts, searchTerm, selectedFloor]);

    const { totalPackageGuests, totalTicketGuests, totalGuests } = useMemo(() => {
        const countsForDate = dailyCounts[selectedDate] || {};
        const pkgForDate = dailyPackageCounts[selectedDate] || {};
        const tktForDate = dailyTicketCounts[selectedDate] || {};
        let pkgSum = 0;
        let tktSum = 0;
        rides.forEach((ride) => {
            const rawPkg = Number(pkgForDate[ride.id] ?? pkgForDate[String(ride.id)] ?? 0);
            const rawTkt = Number(tktForDate[ride.id] ?? tktForDate[String(ride.id)] ?? 0);
            const val = Number(countsForDate[ride.id] ?? countsForDate[String(ride.id)] ?? 0);
            let pkg = rawPkg;
            const tkt = rawTkt;
            if (pkg === 0 && tkt === 0 && val > 0) {
                pkg = val;
            }
            pkgSum += pkg;
            tktSum += tkt;
        });
        return {
            totalPackageGuests: pkgSum,
            totalTicketGuests: tktSum,
            totalGuests: pkgSum + tktSum
        };
    }, [rides, dailyCounts, dailyPackageCounts, dailyTicketCounts, selectedDate]);
    const totalSales = useMemo(() => Object.values(ticketSalesData[selectedDate] || {}).reduce((sum: number, count) => sum + (count as number), 0), [ticketSalesData, selectedDate]);
    const totalSalesAmount = useMemo(() => {
        const dayRecords = packageSalesData[selectedDate] || {};
        let total = 0;
        Object.values(dayRecords).forEach((record: any) => {
            if (record && typeof record.total === 'number') {
                total += record.total;
            } else if (record) {
                if (record.packages) {
                    Object.entries(record.packages).forEach(([pkgName, count]) => {
                        const pkg = packages.find((p: any) => p.name === pkgName);
                        total += (Number(count) || 0) * (pkg?.price || 0);
                    });
                }
                if (Array.isArray(record.otherSales)) {
                    record.otherSales.forEach((item: any) => {
                        total += Number(item.amount) || 0;
                    });
                }
            }
        });
        return total;
    }, [packageSalesData, selectedDate, packages]);
    const hasCheckedInToday = useMemo(() => {
        if (!currentUser) return false;
        const todayAtt: Record<string | number, any> = (attendanceData as any)?.[today] || {};
        const uId = currentUser.id;
        if (todayAtt[uId] || todayAtt[String(uId)] || todayAtt[Number(uId)]) return true;
        // Check by name or ID in attendanceArray
        return attendanceArray.some(
            a => a.date === today && (
                Number(a.operatorId) === Number(currentUser.id) ||
                String(a.operatorId) === String(currentUser.id)
            )
        );
    }, [currentUser, attendanceData, today, attendanceArray]);

    const previousAssignmentsDate = useMemo(() => {
        return findPreviousAssignmentsDate(dailyAssignments, selectedDate);
    }, [dailyAssignments, selectedDate]);

    // Check if assignments can be copied from previous active date
    const canCopyAssignments = useMemo(() => {
        const currentAssigns = dailyAssignments[selectedDate];
        const hasCurrent = currentAssigns && Object.keys(currentAssigns).length > 0;
        return !hasCurrent && Boolean(previousAssignmentsDate && dailyAssignments[previousAssignmentsDate]);
    }, [dailyAssignments, selectedDate, previousAssignmentsDate]);

    const handleCopyAssignmentsFromPrevious = useCallback(async (sourceDate?: string) => {
        const dateToCopy = (typeof sourceDate === 'string' && sourceDate) ? sourceDate : previousAssignmentsDate;
        if (!dateToCopy || !dailyAssignments[dateToCopy]) return;
        const prevAssigns = JSON.parse(JSON.stringify(dailyAssignments[dateToCopy]));
        await database.ref(`data/operatorAssignments/${selectedDate}`).set(prevAssigns);
        logAction('COPY_ASSIGNMENTS', `Copied operator assignments from ${dateToCopy} to ${selectedDate}.`);
        showNotification(`Roster copied from ${dateToCopy} to ${selectedDate} successfully!`, 'success');
    }, [previousAssignmentsDate, dailyAssignments, selectedDate, logAction, showNotification]);

    const previousTicketSalesAssignmentsDate = useMemo(() => {
        return findPreviousTicketSalesAssignmentsDate(ticketSalesAssignments, selectedDate);
    }, [ticketSalesAssignments, selectedDate]);

    // Check if ticket sales assignments can be copied from previous active date
    const canCopyTicketSalesAssignments = useMemo(() => {
        const currentAssigns = ticketSalesAssignments[selectedDate];
        const hasCurrent = currentAssigns && Object.keys(currentAssigns).length > 0;
        return !hasCurrent && Boolean(previousTicketSalesAssignmentsDate && ticketSalesAssignments[previousTicketSalesAssignmentsDate]);
    }, [ticketSalesAssignments, selectedDate, previousTicketSalesAssignmentsDate]);

    const handleCopyTicketSalesAssignmentsFromPrevious = useCallback(async (sourceDate?: string) => {
        const dateToCopy = (typeof sourceDate === 'string' && sourceDate) ? sourceDate : previousTicketSalesAssignmentsDate;
        if (!dateToCopy || !ticketSalesAssignments[dateToCopy]) return;
        const prevAssigns = JSON.parse(JSON.stringify(ticketSalesAssignments[dateToCopy]));
        await database.ref(`data/ticketSalesAssignments/${selectedDate}`).set(prevAssigns);
        logAction('COPY_TS_ASSIGNMENTS', `Copied ticket sales assignments from ${dateToCopy} to ${selectedDate}.`);
        showNotification(`Sales roster copied from ${dateToCopy} to ${selectedDate} successfully!`, 'success');
    }, [previousTicketSalesAssignmentsDate, ticketSalesAssignments, selectedDate, logAction, showNotification]);

    const handleLogin = (newRole: any, payload?: any): boolean => {
        const success = login(newRole, payload);
        if (success && payload) {
            const user = typeof payload === 'object' ? payload : { id: 0, name: newRole };
            logAction('LOGIN', `${user.name} logged in as ${newRole}.`);
        }
        return success;
    };

    // Atomic increment for guest counting (zero-lag & multi-user conflict-free)
    const handleIncrementCount = useCallback((rideId: number, delta: number) => {
        const rideName = rides.find(r => r.id === rideId)?.name || 'Unknown Ride';
        if (isFirebaseConfigured) {
            database.incrementRideCount(selectedDate, rideId, 'package', delta)
                .then(() => {
                    logAction('GUEST_COUNT_INCREMENT', `Incremented count for '${rideName}' (${selectedDate}) by ${delta > 0 ? `+${delta}` : delta}.`);
                })
                .catch(error => {
                    console.error("Increment failed:", error);
                    showNotification('Failed to update count.', 'error');
                });
        }
    }, [rides, selectedDate, logAction, showNotification]);

    const handleCountChange = useCallback((rideId: number, newCount: number) => {
        const rideName = rides.find(r => r.id === rideId)?.name || 'Unknown Ride';
        const oldCount = dailyCounts[selectedDate]?.[rideId] || 0;
        if (oldCount === newCount) return;

        if (isFirebaseConfigured) {
            database.setRideCount(selectedDate, rideId, 'package', newCount)
                .then(() => {
                    logAction('GUEST_COUNT_UPDATE', `Set count for '${rideName}' (${selectedDate}) from ${oldCount} to ${newCount}.`);
                })
                .catch(error => {
                    console.error("Firebase count update failed:", error);
                    showNotification('Failed to save count. Check connection.', 'error');
                });
        }
    }, [dailyCounts, rides, selectedDate, logAction, showNotification]);

    // Package-specific guest count handlers (atomic & peak-time safe)
    const handlePackageCountChange = useCallback((rideId: number, newCount: number) => {
        const rideName = rides.find(r => r.id === rideId)?.name || 'Unknown Ride';
        const numCount = Math.max(0, Number(newCount) || 0);
        if (isFirebaseConfigured) {
            database.setRideCount(selectedDate, rideId, 'package', numCount)
                .then(() => {
                    logAction('GUEST_PACKAGE_COUNT_UPDATE', `Set package guest count for '${rideName}' (${selectedDate}) to ${numCount}.`);
                })
                .catch(error => {
                    console.error("Firebase package count update failed:", error);
                    showNotification('Failed to save package count.', 'error');
                });
        }
    }, [rides, selectedDate, logAction, showNotification]);

    const handleIncrementPackageCount = useCallback((rideId: number, delta: number) => {
        const rideName = rides.find(r => r.id === rideId)?.name || 'Unknown Ride';
        if (isFirebaseConfigured) {
            database.incrementRideCount(selectedDate, rideId, 'package', delta)
                .then(() => {
                    logAction('GUEST_PACKAGE_COUNT_INCREMENT', `Incremented package count for '${rideName}' (${selectedDate}) by ${delta > 0 ? `+${delta}` : delta}.`);
                })
                .catch(error => {
                    console.error("Increment package count failed:", error);
                    showNotification('Failed to update package count.', 'error');
                });
        }
    }, [rides, selectedDate, logAction, showNotification]);

    // Ticket-specific guest count handlers (atomic & peak-time safe)
    const handleTicketCountChange = useCallback((rideId: number, newCount: number) => {
        const rideName = rides.find(r => r.id === rideId)?.name || 'Unknown Ride';
        const numCount = Math.max(0, Number(newCount) || 0);
        if (isFirebaseConfigured) {
            database.setRideCount(selectedDate, rideId, 'ticket', numCount)
                .then(() => {
                    logAction('GUEST_TICKET_COUNT_UPDATE', `Set ticket guest count for '${rideName}' (${selectedDate}) to ${numCount}.`);
                })
                .catch(error => {
                    console.error("Firebase ticket count update failed:", error);
                    showNotification('Failed to save ticket count.', 'error');
                });
        }
    }, [rides, selectedDate, logAction, showNotification]);

    const handleIncrementTicketCount = useCallback((rideId: number, delta: number) => {
        const rideName = rides.find(r => r.id === rideId)?.name || 'Unknown Ride';
        if (isFirebaseConfigured) {
            database.incrementRideCount(selectedDate, rideId, 'ticket', delta)
                .then(() => {
                    logAction('GUEST_TICKET_COUNT_INCREMENT', `Incremented ticket count for '${rideName}' (${selectedDate}) by ${delta > 0 ? `+${delta}` : delta}.`);
                })
                .catch(error => {
                    console.error("Increment ticket count failed:", error);
                    showNotification('Failed to update ticket count.', 'error');
                });
        }
    }, [rides, selectedDate, logAction, showNotification]);

    // Atomic increment for ticket counter sales
    const handleIncrementSales = useCallback((counterId: number, delta: number) => {
        const counterName = counters.find(c => c.id === counterId)?.name || 'Unknown Counter';
        if (isFirebaseConfigured) {
            database.ref(`data/ticketSalesData/${selectedDate}/${counterId}`).increment(delta, 0)
                .then(() => {
                    logAction('SALES_COUNT_INCREMENT', `Incremented sales for '${counterName}' (${selectedDate}) by ${delta > 0 ? `+${delta}` : delta}.`);
                })
                .catch(error => {
                    console.error("Increment sales failed:", error);
                    showNotification('Failed to update sales.', 'error');
                });
        }
    }, [counters, selectedDate, logAction, showNotification]);

    const handleSalesChange = useCallback((counterId: number, newCount: number) => {
        const counterName = counters.find(c => c.id === counterId)?.name || 'Unknown Counter';
        const dateSales = ticketSalesData[selectedDate] || {};
        const oldSales = dateSales[counterId] !== undefined ? dateSales[counterId] : (dateSales[String(counterId)] || 0);
        if (Number(oldSales) === Number(newCount)) return;
        
        if (isFirebaseConfigured) {
            database.ref(`data/ticketSalesData/${selectedDate}/${counterId}`).set(Number(newCount))
                .then(() => {
                    logAction('SALES_COUNT_UPDATE', `Set sales for '${counterName}' (${selectedDate}) from ${oldSales} to ${newCount}.`);
                })
                .catch(error => {
                    console.error("Firebase sales update failed:", error);
                    showNotification('Failed to save sales data. Check connection.', 'error');
                });
        }
    }, [counters, ticketSalesData, selectedDate, logAction, showNotification]);

    const handleResetCounts = useCallback(() => {
        setConfirmDialog({
            isOpen: true,
            title: 'Reset Guest Counts',
            message: `Are you sure you want to reset all guest counts for ${selectedDate} to zero? This cannot be undone.`,
            confirmLabel: 'Reset Counts',
            confirmVariant: 'danger',
            onConfirm: () => {
                if (isFirebaseConfigured) {
                    const updates: { [key: string]: null } = {};
                    updates[`data/dailyCounts/${selectedDate}`] = null;
                    updates[`data/dailyPackageCounts/${selectedDate}`] = null;
                    updates[`data/dailyTicketCounts/${selectedDate}`] = null;
                    database.ref().update(updates)
                        .then(() => {
                            logAction('RESET_GUEST_COUNTS', `Reset all guest counts for ${selectedDate}.`);
                            showNotification('Guest counts have been reset to zero.', 'info');
                        });
                }
            }
        });
    }, [selectedDate, logAction, showNotification]);

    const handleResetSales = useCallback(() => {
        setConfirmDialog({
            isOpen: true,
            title: 'Reset Ticket Sales',
            message: `Are you sure you want to reset all ticket sales for ${selectedDate} to zero? This cannot be undone.`,
            confirmLabel: 'Reset Sales',
            confirmVariant: 'danger',
            onConfirm: () => {
                if (isFirebaseConfigured) {
                    database.ref(`data/ticketSalesData/${selectedDate}`).remove()
                        .then(() => {
                            logAction('RESET_SALES_COUNTS', `Reset all ticket sales for ${selectedDate}.`);
                            showNotification('Ticket sales have been reset to zero.', 'info');
                        });
                }
            }
        });
    }, [selectedDate, logAction, showNotification]);
    
    const handleSaveImage = useCallback(async (rideId: number, imageBase64: string) => {
        setRidesData(prev => ({ ...prev, [rideId]: { ...prev[rideId], imageUrl: imageBase64 } }));
        logAction('UPDATE_RIDE_IMAGE', `Updated image for ride: '${rides.find(r => r.id === rideId)?.name}'.`);
        setModal(null);
    }, [setRidesData, rides, logAction]);
    
    const handleClockIn = useCallback((attendedBriefing: boolean, briefingTime: string | null) => {
        if (!currentUser || !isFirebaseConfigured) return;

        const clockInDate = getLocalDateString();
        const userAtClockIn = currentUser; 
    
        database.ref(`data/attendance/${clockInDate}/${userAtClockIn.id}`).set({ attendedBriefing, briefingTime })
            .then(() => {
                logAction('ATTENDANCE_CHECKIN', `${userAtClockIn.name} checked in for ${clockInDate}. Briefing: ${attendedBriefing ? 'Yes' : 'No'}.`);
                showNotification(`✓ Check-in recorded! Welcome, ${userAtClockIn.name}.`, 'success', 4000);
            })
            .catch(error => {
                console.error("Firebase check-in failed:", error);
                showNotification('Check-in failed. Please try again.', 'error');
            });
    }, [currentUser, logAction, showNotification]);

    const handleSavePackageSales = useCallback((salesData: Omit<PackageSalesRecord, 'date' | 'personnelId'>, targetPersonnelId?: number, silent?: boolean) => {
        if (!currentUser || !isFirebaseConfigured) return;
        const personnelId = targetPersonnelId || currentUser.id;
        const targetName = ticketSalesPersonnel.find(p => p.id === personnelId)?.name || currentUser.name;
        
        database.ref(`data/packageSales/${selectedDate}/${personnelId}`).set(salesData)
            .then(() => {
                logAction('PACKAGE_SALES_UPDATE', `${currentUser.name} saved package sales for ${targetName} on ${selectedDate}.`);
                if (!silent) {
                    showNotification('Sales data saved to database successfully!', 'success');
                }
            })
            .catch(error => {
                console.error("Firebase package sales update failed:", error);
                if (!silent) {
                    showNotification('Failed to save package sales.', 'error');
                }
            });
    }, [currentUser, selectedDate, logAction, showNotification, ticketSalesPersonnel]);

    const handleEditPackageSales = useCallback((date: string, personnelId: number, salesData: Omit<PackageSalesRecord, 'date' | 'personnelId'>, silent?: boolean) => {
        if (!currentUser || !isFirebaseConfigured) return;
        const personnelName = ticketSalesPersonnel.find(p => p.id === personnelId)?.name || 'Unknown Personnel';

        database.ref(`data/packageSales/${date}/${personnelId}`).set(salesData)
            .then(() => {
                logAction('PACKAGE_SALES_CORRECTION', `${currentUser.name} updated package sales for ${personnelName} on ${date}.`);
                if (!silent) {
                    showNotification('Sales record saved to database permanently!', 'success');
                }
            })
            .catch(error => {
                console.error("Firebase package sales correction failed:", error);
                if (!silent) {
                    showNotification('Failed to update sales record.', 'error');
                }
            });
    }, [currentUser, logAction, showNotification, ticketSalesPersonnel]);

    const handleExportData = () => {
        const backupData = {
            version: 2,
            timestamp: new Date().toISOString(),
            data: {
                dailyCounts, ticketSalesData, dailyAssignments, ticketSalesAssignments,
                attendanceData, historyLogData, packageSalesData, maintenanceTickets
            },
            config: {
                ridesData, operatorsData, ticketSalesPersonnelData, countersData, 
                appLogo, otherSalesCategories, maintenancePersonnelData, packagesData, 
                floorsData, appConfigData
            }
        };

        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TFW_Backup_${getLocalDateString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        logAction('DATA_EXPORT', 'Exported all application data to a backup file.');
        showNotification('Data exported successfully!', 'success');
        setModal(null);
    };

    const handleImportData = (jsonString: string) => {
        try {
            const backupData = JSON.parse(jsonString);
            if (!backupData.data || !backupData.config) {
                throw new Error('Invalid backup file format.');
            }

            setConfirmDialog({
                isOpen: true,
                title: 'Restore From Backup',
                message: 'Restore from backup? All current data will be overwritten with the backup file.',
                confirmLabel: 'Restore Data',
                confirmVariant: 'warning',
                onConfirm: () => {
                    setRidesData(backupData.config.ridesData || {});
                    setOperatorsData(backupData.config.operatorsData || {});
                    setTicketSalesPersonnelData(backupData.config.ticketSalesPersonnelData || {});
                    setCountersData(backupData.config.countersData || {});
                    handleLogoChange(backupData.config.appLogo || null);
                    handleSaveOtherSalesCategories(backupData.config.otherSalesCategories || []);
                    setMaintenancePersonnelData(backupData.config.maintenancePersonnelData || {});
                    if (backupData.config.packagesData) setPackagesData(backupData.config.packagesData);
                    if (backupData.config.floorsData) setFloorsData(backupData.config.floorsData);
                    if (backupData.config.appConfigData) setAppConfigData(backupData.config.appConfigData);

                    setDailyCounts(backupData.data.dailyCounts || {});
                    setTicketSalesData(backupData.data.ticketSalesData || {});
                    setDailyAssignments(backupData.data.dailyAssignments || {});
                    setTicketSalesAssignments(backupData.data.ticketSalesAssignments || {});
                    setAttendanceData(backupData.data.attendanceData || {});
                    setHistoryLogData(backupData.data.historyLogData || {});
                    setPackageSalesData(backupData.data.packageSalesData || {});
                    setMaintenanceTickets(backupData.data.maintenanceTickets || {});

                    logAction('DATA_IMPORT', 'Imported data from backup file.');
                    showNotification('Data imported successfully!', 'success', 5000);
                    setModal(null);
                }
            });

        } catch (error) {
            console.error("Import failed:", error);
            showNotification(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    };

    const handleResetDay = (dateToReset: string) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Reset Daily Operations',
            message: `Are you sure you want to reset all operational data for ${dateToReset}?`,
            confirmLabel: 'Reset Data',
            confirmVariant: 'danger',
            onConfirm: () => {
                if (isFirebaseConfigured) {
                    const pathsToDelete = [
                        `data/dailyCounts/${dateToReset}`,
                        `data/dailyPackageCounts/${dateToReset}`,
                        `data/dailyTicketCounts/${dateToReset}`,
                        `data/ticketSalesData/${dateToReset}`,
                        `data/operatorAssignments/${dateToReset}`,
                        `data/ticketSalesAssignments/${dateToReset}`,
                        `data/attendance/${dateToReset}`,
                        `data/packageSales/${dateToReset}`,
                        `data/maintenanceTickets/${dateToReset}`,
                    ];

                    const updates: { [key: string]: null } = {};
                    pathsToDelete.forEach(path => { updates[path] = null; });

                    database.ref().update(updates)
                        .then(() => {
                            logAction('DAILY_DATA_RESET', `Reset data for date: ${dateToReset}.`);
                            showNotification(`All data for ${dateToReset} reset.`, 'success');
                            setModal(null);
                        });
                }
            }
        });
    };
    
    const handleNavigate = (view: View | string) => {
        if (isViewAllowedForRole(view as View, role)) {
            setCurrentView(view as View);
            setSearchTerm('');
            setSelectedFloor('');
        }
    };
    const handleShowModal = (modalType: Modal, ride?: Ride) => { if (ride) setSelectedRideForModal(ride); setModal(modalType); };

    const handleSaveRidePreCheck = useCallback(async (preCheck: RidePreCheckRecord) => {
        if (!isFirebaseConfigured) return;
        const path = `data/ridePreChecks/${preCheck.date}/${preCheck.rideId}`;
        await database.ref(path).set(preCheck);
        const tech = preCheck.srTechnicianName || 'Senior Technician / Foreman';
        const duration = preCheck.requiredTimeMinutes ? ` (${preCheck.requiredTimeMinutes} mins)` : '';
        logAction('MAINTENANCE_PRECHECK', `Pre-check sign-off for '${preCheck.rideName}' (${preCheck.date}) by ${tech}${duration}. Status: ${preCheck.status.toUpperCase()}.`);
        showNotification(`✓ Pre-check saved for ${preCheck.rideName} by ${tech}!`, 'success');
    }, [isFirebaseConfigured, logAction, showNotification]);

    const handleToggleAssignmentLock = useCallback(async (date: string, rideId: number | string, lockState: boolean, reason?: string) => {
        if (!isFirebaseConfigured) return;
        const ride = rides.find(r => String(r.id) === String(rideId));
        const rideName = ride?.name || `Ride #${rideId}`;
        const officerName = currentUser?.name || (role === 'operation-officer' ? 'Operation Officer' : 'Admin');
        const lockObj: AssignmentLockRecord = {
            locked: lockState,
            [lockState ? 'lockedAt' : 'unlockedAt']: new Date().toISOString(),
            unlockedBy: officerName,
            reason: reason || undefined
        };
        await database.ref(`data/assignmentLocks/${date}/${rideId}`).set(lockObj);
        if (lockState) {
            logAction('ASSIGNMENT_LOCKED', `${officerName} locked associate assignment for '${rideName}' (${date}).`);
            showNotification(`🔒 Assignment locked for ${rideName}`, 'info');
        } else {
            const reasonSuffix = reason ? ` (Reason: ${reason})` : '';
            logAction('ASSIGNMENT_UNLOCKED', `${officerName} unlocked assignment for '${rideName}' (${date})${reasonSuffix}. Assignment can now be modified.`);
            showNotification(`🔓 Assignment unlocked for ${rideName}. Reassignment enabled.`, 'info');
        }
    }, [isFirebaseConfigured, rides, currentUser, role, logAction, showNotification]);

    const handleSaveAssignments = useCallback(async (date: string, assignmentsForDate: Record<string, number[]>, audit?: { rideId?: number | string; action?: string; opName?: string; rideName?: string }) => {
        await database.ref(`data/operatorAssignments/${date}`).set(assignmentsForDate);
        const officerName = currentUser?.name || (role === 'operation-officer' ? 'Operation Officer' : 'Admin');

        // Auto-lock each ride that has assignees
        const lockUpdates: Record<string, any> = {};
        Object.entries(assignmentsForDate).forEach(([rId, opIds]) => {
            const norm = normalizeAssigneeIds(opIds);
            if (norm.length > 0) {
                lockUpdates[`data/assignmentLocks/${date}/${rId}`] = {
                    locked: true,
                    lockedAt: new Date().toISOString(),
                    unlockedBy: officerName
                };
            }
        });
        if (Object.keys(lockUpdates).length > 0) {
            await database.ref().update(lockUpdates);
        }

        if (audit?.rideName) {
            logAction('ASSIGNMENT_REASSIGNED', `${officerName} ${audit.action || 'updated'} assignment for '${audit.rideName}' (${date}): ${audit.opName || 'Staff changed'}. Slot auto-locked.`);
        } else {
            logAction('SAVE_ASSIGNMENTS', `Operator assignments saved & auto-locked for ${date} by ${officerName}.`);
        }
        showNotification('Operator assignments saved & auto-locked!', 'success');
    }, [currentUser, role, logAction, showNotification]);
    
    const handleSaveTicketSalesAssignments = useCallback(async (date: string, assignmentsForDate: Record<string, number[]>) => {
        await database.ref(`data/ticketSalesAssignments/${date}`).set(assignmentsForDate);
        logAction('SAVE_TS_ASSIGNMENTS', `Ticket sales assignments saved for ${date}.`);
        showNotification('Ticket sales assignments saved!', 'success');
    }, [logAction, showNotification]);

    const handleSaveManagementNotes = useCallback(async (date: string, notes: ManagementSummaryNotes) => {
        setAppConfigData((prev: AppConfig) => ({
            ...prev,
            managementNotes: {
                ...(prev?.managementNotes || {}),
                [date]: notes
            }
        }));
        if (isFirebaseConfigured) {
            await database.ref(`config/appConfig/managementNotes/${date}`).set(notes);
            logAction('SAVE_MANAGEMENT_NOTES', `Management summary notes and sales counts updated for ${date}.`);
            showNotification('Management summary saved!', 'success');
        }
    }, [isFirebaseConfigured, setAppConfigData, logAction, showNotification]);

    const handleClearHistory = () => {
        setConfirmDialog({
            isOpen: true,
            title: 'Clear History Logs',
            message: 'Are you sure you want to permanently delete all history logs?',
            confirmLabel: 'Delete All Logs',
            confirmVariant: 'danger',
            onConfirm: () => {
                if (isFirebaseConfigured) {
                    database.ref('data/historyLog').remove()
                        .then(() => {
                            showNotification('History logs cleared.', 'info');
                        });
                }
            }
        });
    };

    const handleReportProblem = useCallback((
        rideId: number, 
        problem: string,
        feedbackCategory?: string,
        priority?: 'normal' | 'high' | 'urgent',
        guestDetails?: string,
        source?: string,
        dateOverride?: string,
        targetDepartment?: string
    ) => {
        if (!isFirebaseConfigured || !problem.trim()) return Promise.resolve();

        const ride = rides.find(r => r.id === rideId);
        if (!ride) return Promise.resolve();

        const now = new Date();
        const ticketDate = dateOverride || getLocalDateString(now);
        const ticketId = `${ticketDate}-${rideId}-${Date.now()}`;
        const isCX = role === 'cx' || source === 'cx';

        const submitterId = currentUser?.id || Date.now();
        const submitterName = currentUser?.name || (isCX ? 'Customer Experience (CX)' : 'Games & Ride Associate');
        const submitterRole = isCX 
            ? 'Customer Experience (CX)' 
            : (currentUser?.role === 'operator' ? 'Games & Ride Associate' : (currentUser?.role || 'Games & Ride Associate'));

        const newTicket: MaintenanceTicket = {
            id: ticketId,
            date: ticketDate,
            rideId: ride.id,
            rideName: ride.name,
            problem: problem.trim(),
            status: 'reported',
            reportedById: submitterId,
            reportedByName: submitterName,
            reportedByRole: submitterRole,
            source: isCX ? 'cx' : (source || 'operator'),
            feedbackCategory: feedbackCategory || (isCX ? 'Guest Comfort & Seating' : 'Operational Issue'),
            priority: priority || 'normal',
            guestDetails: guestDetails || undefined,
            reportedAt: now.toISOString(),
            targetDepartment: targetDepartment || (isCX ? 'both' : undefined),
        };

        // Optimistic UI update so the ticket displays immediately with zero delay
        setMaintenanceTickets(prev => ({
            ...prev,
            [ticketDate]: {
                ...(prev?.[ticketDate] || {}),
                [ticketId]: newTicket
            }
        }));

        return database.ref(`data/maintenanceTickets/${ticketDate}/${ticketId}`).set(newTicket)
            .then(() => {
                logAction('MAINTENANCE_REPORT', `[${isCX ? 'Customer Experience (CX)' : 'REPORT'}] ${ride.name}: ${problem.trim()}`);
                // Provide immediate audible feedback to the reporting user as well
                playReportedIssueSound({ 
                    rideName: ride.name, 
                    problem: problem.trim(),
                    reportedByName: currentUser?.name || (isCX ? 'Customer Experience' : 'Associate'),
                    targetDepartment: isCX ? 'operation-officer' : 'maintenance',
                    feedbackCategory: isCX ? 'Customer Experience Feedback' : 'Operational Issue'
                });
                showNotification(
                    isCX 
                        ? 'Customer Feedback dispatched to Operation Officer & Sales Executive!'
                        : `Issue for ${ride.name} reported to Maintenance Dashboard in Reported Issues (Associates)!`, 
                    'success'
                );
            });
    }, [currentUser, rides, role, logAction, showNotification, setMaintenanceTickets]);

    const handleUpdateTicketStatus = useCallback((
        ticket: MaintenanceTicket, 
        newStatus: 'in-progress' | 'solved' | 'reported', 
        technician?: Operator, 
        helpers?: Operator[], 
        notes?: string,
        solutionImageUrl?: string,
        isExplicitReopen?: boolean,
        sourceDashboard?: string
    ) => {
        if (!isFirebaseConfigured) return;
        
        const updates: Partial<MaintenanceTicket> & { isExplicitReopen?: boolean } = { 
            status: newStatus,
            updatedAt: new Date().toISOString()
        };
        if (isExplicitReopen) {
            updates.isExplicitReopen = true;
        }
        if (newStatus === 'in-progress') {
            updates.inProgressAt = new Date().toISOString();
            updates.solvedAt = null as any;
            if (technician) {
                updates.assignedToId = technician.id;
                updates.assignedToName = technician.name;
            }
            if (helpers !== undefined) {
                updates.helperIds = helpers.map(h => h.id);
                updates.helperNames = helpers.map(h => h.name);
            }
            if (solutionImageUrl !== undefined) {
                updates.solutionImageUrl = solutionImageUrl;
            }
        } else if (newStatus === 'solved') {
            updates.solvedAt = new Date().toISOString();
            if (technician) {
                updates.assignedToId = technician.id;
                updates.assignedToName = technician.name;
            }
            if (helpers !== undefined && helpers.length > 0) {
                updates.helperIds = helpers.map(h => h.id);
                updates.helperNames = helpers.map(h => h.name);
            }
            if (notes !== undefined) {
                updates.resolutionNotes = notes;
            }
            if (solutionImageUrl !== undefined) {
                updates.solutionImageUrl = solutionImageUrl;
                updates.photoUrl = solutionImageUrl;
            }
        } else if (newStatus === 'reported') {
            updates.inProgressAt = null as any;
            updates.solvedAt = null as any;
            updates.assignedToId = null as any;
            updates.assignedToName = null as any;
            updates.helperIds = [];
            updates.helperNames = [];
            updates.solutionImageUrl = null as any;
            updates.resolutionNotes = null as any;
        }

        // Issues resolved from Maintenance are sent to the "TFW Issue Resolve (Tech+ Guest Feedback)" WhatsApp group via Whapi.cloud API.
        const isFromMaintenanceDashboard =
            sourceDashboard === 'maintenance-dashboard' ||
            (!sourceDashboard && (currentView === 'maintenance-dashboard' || (currentView === 'cx-feedback' && role === 'maintenance')));
        const shouldNotifyWhatsApp = newStatus === 'solved' && isFromMaintenanceDashboard;

        // Accurate date key lookup ensuring ticket is updated in its actual stored date container
        let actualDateKey = (ticket as any)._dateKey;
        if (!actualDateKey && maintenanceTickets) {
            for (const [d, dayTickets] of Object.entries(maintenanceTickets)) {
                if (dayTickets && typeof dayTickets === 'object' && ((dayTickets as any)[ticket.id] || Object.values(dayTickets as any).some((t: any) => t?.id === ticket.id))) {
                    actualDateKey = d;
                    break;
                }
            }
        }
        const ticketTargetDate = actualDateKey || ticket.date || selectedDate;

        const normProblem = (p?: string) => String(p || '').toLowerCase().replace(/[\r\n\t]+/g, ' ').replace(/[^\w\s\u0980-\u09FF]/g, '').replace(/\s+/g, ' ').trim();
        const ticketNorm = normProblem(ticket.problem);

        // Optimistic UI state update so status changes (to in-progress or solved) reflect with 0ms delay across all dates
        setMaintenanceTickets(prev => {
            const next = { ...(prev || {}) };
            let updatedAny = false;
            Object.keys(next).forEach(dKey => {
                if (next[dKey]) {
                    const dayObj = { ...next[dKey] };
                    let dayChanged = false;
                    Object.keys(dayObj).forEach(tKey => {
                        const t = dayObj[tKey];
                        if (t) {
                            const isSameId = tKey === ticket.id || t.id === ticket.id;
                            const isSameMsg = Boolean(t.whatsappMessageId && ticket.whatsappMessageId && t.whatsappMessageId === ticket.whatsappMessageId);
                            const tNorm = normProblem(t.problem);
                            const isSameRideAndProb = Boolean(
                                t.rideId === ticket.rideId &&
                                tNorm.length > 3 && ticketNorm.length > 3 &&
                                (tNorm === ticketNorm || tNorm.includes(ticketNorm) || ticketNorm.includes(tNorm))
                            );
                            if (isSameId || isSameMsg || isSameRideAndProb) {
                                dayObj[tKey] = {
                                    ...t,
                                    ...updates
                                };
                                dayChanged = true;
                                updatedAny = true;
                            }
                        }
                    });
                    if (dayChanged) {
                        next[dKey] = dayObj;
                    }
                }
            });
            if (!updatedAny) {
                const targetD = ticketTargetDate;
                next[targetD] = {
                    ...(next[targetD] || {}),
                    [ticket.id]: {
                        ...ticket,
                        ...updates
                    }
                };
            }
            return next;
        });

        database.ref(`data/maintenanceTickets/${ticketTargetDate}/${ticket.id}`).update(updates)
            .then(() => {
                const techTitle = technician ? technician.name : 'Team';
                logAction('MAINTENANCE_UPDATE', `${techTitle} updated status for ${ticket.rideName} to ${newStatus}.`);
                if (shouldNotifyWhatsApp) {
                    showNotification(`✅ Issue resolved & notifying "TFW Issue Resolve (Tech+ Guest Feedback)" WhatsApp group...`, 'info', 3000);
                } else if (newStatus === 'solved') {
                    showNotification('✅ Issue marked as resolved.', 'success', 3000);
                } else {
                    showNotification('Ticket status updated.', 'success');
                }
            });

        // When issue is resolved from Maintenance, send update directly to "TFW Issue Resolve (Tech+ Guest Feedback)" WhatsApp group via Whapi.cloud API
        if (shouldNotifyWhatsApp) {
            const rawPhoto = solutionImageUrl || ticket.solutionImageUrl || ticket.photoUrl || (Array.isArray(ticket.photos) && ticket.photos[0]);
            fetch('/api/whatsapp/send-ticket-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    rideId: ticket.rideId,
                    rideName: ticket.rideName,
                    action: 'solved',
                    dashboard: 'maintenance-dashboard',
                    technicianName: technician ? technician.name : (ticket.assignedToName || 'Maintenance Team'),
                    helpers: helpers ? helpers.map(h => h.name) : (ticket.helperNames || []),
                    notes: notes !== undefined ? notes : (ticket.resolutionNotes || ''),
                    reportedProblem: ticket.problem,
                    photoData: rawPhoto,
                    solutionImageUrl: rawPhoto,
                    photoUrl: rawPhoto,
                    solvedAt: updates.solvedAt || new Date().toISOString()
                })
            })
            .then(res => res.json())
            .then(res => {
                if (res.success && !res.alreadySent) {
                    if (res.hasMedia) {
                        showNotification('📸 Repair photo & resolution posted to "TFW Issue Resolve (Tech+ Guest Feedback)" WhatsApp group!', 'success', 5000);
                    } else {
                        showNotification('📱 Resolution posted to "TFW Issue Resolve (Tech+ Guest Feedback)" WhatsApp group!', 'success', 4500);
                    }
                }
            })
            .catch(err => {
                console.warn('Failed to dispatch resolution to WhatsApp:', err);
            });
        }

        // Also ensure any duplicate copies of this ticket across all dates are updated synchronously
        if (maintenanceTickets && typeof maintenanceTickets === 'object') {
            Object.keys(maintenanceTickets).forEach(dKey => {
                const dayTickets = maintenanceTickets[dKey];
                if (dayTickets && typeof dayTickets === 'object') {
                    Object.keys(dayTickets).forEach(tKey => {
                        const other = dayTickets[tKey];
                        if (other && (dKey !== ticket.date || tKey !== ticket.id)) {
                            const isSameId = tKey === ticket.id || other.id === ticket.id;
                            const isSameMsg = Boolean(other.whatsappMessageId && ticket.whatsappMessageId && other.whatsappMessageId === ticket.whatsappMessageId);
                            const otherNorm = normProblem(other.problem);
                            const isSameRideAndProb = Boolean(
                                other.rideId === ticket.rideId &&
                                otherNorm.length > 3 && ticketNorm.length > 3 &&
                                (otherNorm === ticketNorm || otherNorm.includes(ticketNorm) || ticketNorm.includes(otherNorm))
                            );
                            if (isSameId || isSameMsg || isSameRideAndProb) {
                                database.ref(`data/maintenanceTickets/${dKey}/${tKey}`).update(updates);
                            }
                        }
                    });
                }
            });
        }
    }, [logAction, showNotification, maintenanceTickets, setMaintenanceTickets]);

    const handleClearSolvedTickets = useCallback((date: string) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Clear Solved Tickets',
            message: `Are you sure you want to permanently clear all SOLVED maintenance tickets for ${date}?`,
            confirmLabel: 'Clear Solved Tickets',
            confirmVariant: 'danger',
            onConfirm: () => {
                if (isFirebaseConfigured) {
                    const dateTicketsRef = database.ref(`data/maintenanceTickets/${date}`);
                    dateTicketsRef.once('value', (snapshot: any) => {
                        const ticketsOnDate = snapshot.val();
                        if (!ticketsOnDate) return;

                        const updates: { [key: string]: null } = {};
                        for (const ticketId in ticketsOnDate) {
                            if (ticketsOnDate[ticketId].status === 'solved') {
                                updates[`data/maintenanceTickets/${date}/${ticketId}`] = null;
                            }
                        }
                        database.ref().update(updates)
                            .then(() => {
                                showNotification('Solved maintenance tickets cleared.', 'info');
                            });
                    });
                }
            }
        });
    }, [showNotification]);

    const handleDeleteTicket = useCallback((ticket: MaintenanceTicket) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Reported Issue',
            message: `Are you sure you want to permanently delete this reported ticket for "${ticket.rideName}"?`,
            confirmLabel: 'Delete Ticket',
            confirmVariant: 'danger',
            onConfirm: () => {
                // Optimistic instant purge from local React state
                setMaintenanceTickets((prev: Record<string, Record<string, MaintenanceTicket>>) => {
                    if (!prev || typeof prev !== 'object') return prev;
                    const updated = { ...prev };
                    let changed = false;
                    const normProb = String(ticket.problem || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const numRide = ticket.rideId !== undefined && ticket.rideId !== null ? Number(ticket.rideId) : undefined;

                    for (const d of Object.keys(updated)) {
                        if (updated[d] && typeof updated[d] === 'object') {
                            const dayCopy = { ...updated[d] };
                            let dayChanged = false;
                            for (const [k, t] of Object.entries(dayCopy)) {
                                const tObj = t as any;
                                const isSameId = Boolean(k === ticket.id || tObj?.id === ticket.id);
                                const isSameMsg = Boolean(ticket.whatsappMessageId && tObj?.whatsappMessageId === ticket.whatsappMessageId);
                                const tNormProb = String(tObj?.problem || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                                const isRideMatch = !numRide || !tObj?.rideId || Number(tObj?.rideId) === numRide;
                                const isProblemMatch = normProb.length > 8 && tNormProb.length > 8 &&
                                    (normProb.includes(tNormProb) || tNormProb.includes(normProb) || normProb.slice(0, 20) === tNormProb.slice(0, 20));
                                const isMarkedDeleted = database.isTicketDeleted(k, tObj?.whatsappMessageId, tObj?.rideId, tObj?.problem) ||
                                    database.isTicketDeleted(tObj?.id, tObj?.whatsappMessageId, tObj?.rideId, tObj?.problem);

                                if (isSameId || isSameMsg || (isRideMatch && isProblemMatch) || isMarkedDeleted) {
                                    delete dayCopy[k];
                                    dayChanged = true;
                                    changed = true;
                                }
                            }
                            if (dayChanged) {
                                if (Object.keys(dayCopy).length === 0) {
                                    delete updated[d];
                                } else {
                                    updated[d] = dayCopy;
                                }
                            }
                        }
                    }
                    return changed ? updated : prev;
                });

                database.deleteMaintenanceTicket(ticket, ticket.date)
                    .then(() => {
                        logAction('MAINTENANCE_UPDATE', `Deleted ticket for ${ticket.rideName}`);
                        showNotification('Ticket deleted successfully.', 'info');
                    })
                    .catch((err) => {
                        console.error('Failed to delete ticket:', err);
                        showNotification('Failed to delete ticket.', 'error');
                    });
            }
        });
    }, [isFirebaseConfigured, logAction, showNotification, setMaintenanceTickets]);

    const handleClearReportedTickets = useCallback((date: string) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Clear Reported Issues',
            message: `Are you sure you want to permanently clear all REPORTED issues for ${date}?`,
            confirmLabel: 'Clear Reported Issues',
            confirmVariant: 'danger',
            onConfirm: () => {
                // Optimistic instant purge from local React state
                setMaintenanceTickets((prev: Record<string, Record<string, MaintenanceTicket>>) => {
                    if (!prev || typeof prev !== 'object') return prev;
                    const updated = { ...prev };
                    if (updated[date]) {
                        const dayCopy = { ...updated[date] };
                        let dayChanged = false;
                        for (const [k, t] of Object.entries(dayCopy)) {
                            const tObj = t as any;
                            if (tObj && tObj.status === 'reported') {
                                delete dayCopy[k];
                                dayChanged = true;
                            }
                        }
                        if (dayChanged) {
                            if (Object.keys(dayCopy).length === 0) {
                                delete updated[date];
                            } else {
                                updated[date] = dayCopy;
                            }
                            return updated;
                        }
                    }
                    return prev;
                });

                if (isFirebaseConfigured) {
                    database.clearReportedTickets(date)
                        .then(() => {
                            logAction('MAINTENANCE_UPDATE', `Cleared all reported maintenance tickets for ${date}`);
                            showNotification('Reported issues cleared successfully.', 'info');
                        })
                        .catch((err) => {
                            console.error('Failed to clear reported tickets:', err);
                            showNotification('Failed to clear reported tickets.', 'error');
                        });
                }
            }
        });
    }, [isFirebaseConfigured, logAction, showNotification, setMaintenanceTickets]);

    const handleClearAllMaintenanceRecords = useCallback(() => {
        setConfirmDialog({
            isOpen: true,
            title: 'Clear All Maintenance Records',
            message: 'Are you sure you want to clear ALL maintenance issue records and start newly from today? All past issues and resolved records will be wiped.',
            confirmLabel: 'Clear All Records (Start Newly)',
            confirmVariant: 'danger',
            onConfirm: async () => {
                try {
                    await fetch('/api/maintenance/clear-all', { method: 'POST' });
                } catch (_) {}
                setMaintenanceTickets({});
                try {
                    database.ref('data/maintenanceTickets').set({});
                    localStorage.removeItem('tfw_cache_data/maintenanceTickets');
                } catch (_) {}
                logAction('MAINTENANCE_UPDATE', 'Cleared all maintenance records to start newly from today');
                showNotification('All maintenance issue records cleared. Starting fresh from today!', 'success');
            }
        });
    }, [logAction, showNotification, setMaintenanceTickets]);

    const handleUploadSolvedTickets = useCallback((uploadedTickets: MaintenanceTicket[]) => {
        if (!uploadedTickets || uploadedTickets.length === 0) return;
        setMaintenanceTickets((prev: Record<string, Record<string, MaintenanceTicket>>) => {
            const updated = { ...(prev || {}) };
            uploadedTickets.forEach(t => {
                const dateKey = t.date || selectedDate;
                if (!updated[dateKey]) updated[dateKey] = {};
                updated[dateKey][t.id] = { ...t, status: 'solved' };
                database.ref(`data/maintenanceTickets/${dateKey}/${t.id}`).set({ ...t, status: 'solved' });
            });
            return updated;
        });
        showNotification(`Successfully uploaded and saved ${uploadedTickets.length} solved record(s).`, 'success');
    }, [selectedDate, showNotification, setMaintenanceTickets]);

    const handleSaveCustomTechnicalCategories = useCallback((newCategories: CustomTechnicalCategory[]) => {
        setAppConfigData(prev => {
            const updated = { ...(prev || DEFAULT_APP_CONFIG), customTechnicalCategories: newCategories };
            return updated;
        });
        if (isFirebaseConfigured) {
            database.ref('config/appConfig/customTechnicalCategories').set(newCategories);
        }
        logAction('MAINTENANCE_KPI_CATEGORIES', `Updated Maintenance KPI Problem Solved categories (${newCategories.length} total).`);
        showNotification('Problem Solved categories updated & synced across KPI and Maintenance!', 'success');
    }, [isFirebaseConfigured, setAppConfigData, logAction, showNotification]);

    const handleUpdateTicketCategory = useCallback((ticket: MaintenanceTicket, newCategoryName: string) => {
        if (!ticket || !newCategoryName) return;
        const dateKey = ticket.date || (ticket as any)._dateKey || selectedDate;
        setMaintenanceTickets((prev: Record<string, Record<string, MaintenanceTicket>>) => {
            if (!prev || typeof prev !== 'object') return prev;
            const updated = { ...prev };
            if (updated[dateKey] && updated[dateKey][ticket.id]) {
                updated[dateKey] = {
                    ...updated[dateKey],
                    [ticket.id]: {
                        ...updated[dateKey][ticket.id],
                        feedbackCategory: newCategoryName,
                        updatedAt: new Date().toISOString()
                    }
                };
            }
            return updated;
        });
        if (isFirebaseConfigured) {
            database.ref(`data/maintenanceTickets/${dateKey}/${ticket.id}`).update({
                feedbackCategory: newCategoryName,
                updatedAt: new Date().toISOString()
            });
        }
        logAction('MAINTENANCE_CATEGORY_SYNC', `Synced Problem Solved category for ${ticket.rideName} to "${newCategoryName}".`);
        showNotification(`Category synced to "${newCategoryName}"`, 'info', 2500);
    }, [isFirebaseConfigured, selectedDate, setMaintenanceTickets, logAction, showNotification]);

    const handleSaveKpiCredentials = useCallback((newUser: string, newPass: string) => {
        const cleanUser = newUser.trim() || 'kpi';
        const cleanPass = newPass.trim() || 'kpi79';
        setAppConfigData(prev => ({
            ...(prev || DEFAULT_APP_CONFIG),
            maintenanceKpiUser: cleanUser,
            maintenanceKpiPassword: cleanPass
        }));
        if (isFirebaseConfigured) {
            database.ref('config/appConfig/maintenanceKpiUser').set(cleanUser);
            database.ref('config/appConfig/maintenanceKpiPassword').set(cleanPass);
        }
        logAction('UPDATE_KPI_CREDENTIALS', `Updated Maintenance KPI Dashboard User ID (${cleanUser}) & Password.`);
        showNotification(`Maintenance KPI User (${cleanUser}) & Password saved!`, 'success');
    }, [isFirebaseConfigured, setAppConfigData, logAction, showNotification]);

    // --- Admin Entity Modification Handlers ---
    const handleSaveRide = useCallback((ride: Ride) => {
        const id = ride.id;
        const currentData = ridesData || {};
        const { id: _, ...rest } = ride;
        const updated = { ...currentData, [id]: rest };
        setRidesData(updated);
        logAction('ADMIN_MODIFY_RIDE', `Saved ride details for '${ride.name}' (ID: ${id})`);
        showNotification(`Ride '${ride.name}' saved!`, 'success');
    }, [ridesData, setRidesData, logAction, showNotification]);

    const handleDeleteRide = useCallback((id: number) => {
        const currentData = { ...(ridesData || {}) };
        const name = currentData[id]?.name || id;
        delete currentData[id];
        setRidesData(currentData);
        logAction('ADMIN_DELETE_RIDE', `Deleted ride '${name}' (ID: ${id})`);
        showNotification(`Ride '${name}' deleted.`, 'info');
    }, [ridesData, setRidesData, logAction, showNotification]);

    const handleSaveCounter = useCallback((counter: Counter) => {
        const id = counter.id;
        const currentData = countersData || {};
        const { id: _, ...rest } = counter;
        const updated = { ...currentData, [id]: rest };
        setCountersData(updated);
        logAction('ADMIN_MODIFY_COUNTER', `Saved counter '${counter.name}' (ID: ${id})`);
        showNotification(`Counter '${counter.name}' saved!`, 'success');
    }, [countersData, setCountersData, logAction, showNotification]);

    const handleDeleteCounter = useCallback((id: number) => {
        const currentData = { ...(countersData || {}) };
        const name = currentData[id]?.name || id;
        delete currentData[id];
        setCountersData(currentData);
        logAction('ADMIN_DELETE_COUNTER', `Deleted counter '${name}' (ID: ${id})`);
        showNotification(`Counter '${name}' deleted.`, 'info');
    }, [countersData, setCountersData, logAction, showNotification]);

    const handleSaveOperator = useCallback((operator: Operator) => {
        const id = operator.id;
        const currentData = operatorsData || {};
        const { id: _, ...rest } = operator;
        const updated = { ...currentData, [id]: rest };
        setOperatorsData(updated);
        logAction('ADMIN_MODIFY_OPERATOR', `Saved operator '${operator.name}' (ID: ${id})`);
        showNotification(`Operator '${operator.name}' saved!`, 'success');
    }, [operatorsData, setOperatorsData, logAction, showNotification]);

    const handleDeleteOperator = useCallback((id: number) => {
        const currentData = { ...(operatorsData || {}) };
        const name = currentData[id]?.name || id;
        delete currentData[id];
        setOperatorsData(currentData);
        logAction('ADMIN_DELETE_OPERATOR', `Deleted operator '${name}' (ID: ${id})`);
        showNotification(`Operator '${name}' deleted.`, 'info');
    }, [operatorsData, setOperatorsData, logAction, showNotification]);

    const handleClearAllOperators = useCallback(() => {
        setOperatorsData({});
        if (isFirebaseConfigured) {
            database.ref('config/operators').set({});
        }
        logAction('ADMIN_DELETE_ALL_OPERATORS', `Cleared all Games & Ride Associates roster`);
        showNotification(`All Games & Ride Associates deleted. You can now add or import new ones.`, 'info');
    }, [setOperatorsData, logAction, showNotification]);

    const handleSaveTicketSalesPersonnel = useCallback((personnel: Operator) => {
        const id = personnel.id;
        const currentData = ticketSalesPersonnelData || {};
        const { id: _, ...rest } = personnel;
        const updated = { ...currentData, [id]: rest };
        setTicketSalesPersonnelData(updated);
        logAction('ADMIN_MODIFY_TS_STAFF', `Saved ticket sales staff '${personnel.name}' (ID: ${id})`);
        showNotification(`Staff '${personnel.name}' saved!`, 'success');
    }, [ticketSalesPersonnelData, setTicketSalesPersonnelData, logAction, showNotification]);

    const handleDeleteTicketSalesPersonnel = useCallback((id: number) => {
        const currentData = { ...(ticketSalesPersonnelData || {}) };
        const name = currentData[id]?.name || id;
        delete currentData[id];
        setTicketSalesPersonnelData(currentData);
        logAction('ADMIN_DELETE_TS_STAFF', `Deleted ticket sales staff '${name}' (ID: ${id})`);
        showNotification(`Staff '${name}' deleted.`, 'info');
    }, [ticketSalesPersonnelData, setTicketSalesPersonnelData, logAction, showNotification]);

    const handleSaveMaintenancePersonnel = useCallback((personnel: Operator) => {
        const id = personnel.id;
        const currentData = maintenancePersonnelData || {};
        const { id: _, ...rest } = personnel;
        const updated = { ...currentData, [id]: rest };
        setMaintenancePersonnelData(updated);
        logAction('ADMIN_MODIFY_MAINT_STAFF', `Saved maintenance staff '${personnel.name}' (ID: ${id})`);
        showNotification(`Staff '${personnel.name}' saved!`, 'success');
    }, [maintenancePersonnelData, setMaintenancePersonnelData, logAction, showNotification]);

    const handleDeleteMaintenancePersonnel = useCallback((id: number) => {
        const currentData = { ...(maintenancePersonnelData || {}) };
        const name = currentData[id]?.name || id;
        delete currentData[id];
        setMaintenancePersonnelData(currentData);
        logAction('ADMIN_DELETE_MAINT_STAFF', `Deleted maintenance staff '${name}' (ID: ${id})`);
        showNotification(`Staff '${name}' deleted.`, 'info');
    }, [maintenancePersonnelData, setMaintenancePersonnelData, logAction, showNotification]);

    const handleSaveCxPersonnel = useCallback((personnel: Operator) => {
        const id = personnel.id;
        const currentData = cxPersonnelData || {};
        const { id: _, ...rest } = personnel;
        const updated = { ...currentData, [id]: rest };
        setCxPersonnelData(updated);
        logAction('ADMIN_MODIFY_CX_STAFF', `Saved CX staff '${personnel.name}' (ID: ${id})`);
        showNotification(`CX Staff '${personnel.name}' saved!`, 'success');
    }, [cxPersonnelData, setCxPersonnelData, logAction, showNotification]);

    const handleDeleteCxPersonnel = useCallback((id: number) => {
        const currentData = { ...(cxPersonnelData || {}) };
        const name = currentData[id]?.name || id;
        delete currentData[id];
        setCxPersonnelData(currentData);
        logAction('ADMIN_DELETE_CX_STAFF', `Deleted CX staff '${name}' (ID: ${id})`);
        showNotification(`CX Staff '${name}' deleted.`, 'info');
    }, [cxPersonnelData, setCxPersonnelData, logAction, showNotification]);

    const handleSavePackage = useCallback((pkg: PackageItem) => {
        const current: PackageItem[] = Array.isArray(packages) ? (packages as PackageItem[]) : (Object.values(packages) as PackageItem[]);
        const index = current.findIndex(p => p.id === pkg.id);
        let updated: PackageItem[];
        if (index >= 0) {
            updated = [...current];
            updated[index] = pkg;
        } else {
            updated = [...current, pkg];
        }
        setPackagesData(updated);
        logAction('ADMIN_MODIFY_PACKAGE', `Saved package '${pkg.name}'`);
        showNotification(`Package '${pkg.name}' saved!`, 'success');
    }, [packages, setPackagesData, logAction, showNotification]);

    const handleDeletePackage = useCallback((id: string) => {
        const current: PackageItem[] = Array.isArray(packages) ? (packages as PackageItem[]) : (Object.values(packages) as PackageItem[]);
        const pkg = current.find(p => p.id === id);
        const updated = current.filter(p => p.id !== id);
        setPackagesData(updated);
        logAction('ADMIN_DELETE_PACKAGE', `Deleted package '${pkg?.name || id}'`);
        showNotification(`Package deleted.`, 'info');
    }, [packages, setPackagesData, logAction, showNotification]);

    const handleSaveFloors = useCallback((newFloors: string[]) => {
        setFloorsData(newFloors);
        logAction('ADMIN_UPDATE_FLOORS', `Updated floor configurations: ${newFloors.join(', ')}`);
        showNotification('Floors updated successfully!', 'success');
    }, [setFloorsData, logAction, showNotification]);

    const handleSaveAppConfig = useCallback((newConfig: Partial<AppConfig>) => {
        setAppConfigData(prev => {
            const updated = { ...(prev || DEFAULT_APP_CONFIG), ...newConfig };
            return updated;
        });
        logAction('ADMIN_UPDATE_CONFIG', 'Updated application general configuration & branding.');
        showNotification('Application configuration updated!', 'success');
    }, [setAppConfigData, logAction, showNotification]);

    const handleBulkImport = useCallback((entityTypeOrData: any, maybeImportedRecords?: any[]) => {
        if (!entityTypeOrData) return;

        // Composite object import from BulkImportModal
        if (typeof entityTypeOrData === 'object' && !Array.isArray(entityTypeOrData)) {
            const { 
                rides: importedRides, 
                counters: importedCounters, 
                operators: importedOps, 
                salesPersonnel: importedSales, 
                maintenancePersonnel: importedTechs, 
                cxPersonnel: importedCx,
                newFloors, 
                importMode = 'merge' 
            } = entityTypeOrData;

            let totalImported = 0;

            if (importedRides && importedRides.length > 0) {
                setRidesData(prev => {
                    const next = importMode === 'replace' ? {} : { ...(prev || {}) };
                    importedRides.forEach((r: Ride) => {
                        if (r.id) {
                            const { id, ...rest } = r;
                            next[id] = rest;
                        }
                    });
                    return next;
                });
                totalImported += importedRides.length;
            }

            if (importedCounters && importedCounters.length > 0) {
                setCountersData(prev => {
                    const next = importMode === 'replace' ? {} : { ...(prev || {}) };
                    importedCounters.forEach((c: Counter) => {
                        if (c.id) {
                            const { id, ...rest } = c;
                            next[id] = rest;
                        }
                    });
                    return next;
                });
                totalImported += importedCounters.length;
            }

            if (importedOps && importedOps.length > 0) {
                setOperatorsData(prev => {
                    const next = importMode === 'replace' ? {} : { ...(prev || {}) };
                    importedOps.forEach((o: Operator) => {
                        if (o.id) {
                            const { id, ...rest } = o;
                            next[id] = rest;
                        }
                    });
                    return next;
                });
                totalImported += importedOps.length;
            }

            if (importedSales && importedSales.length > 0) {
                setTicketSalesPersonnelData(prev => {
                    const next = importMode === 'replace' ? {} : { ...(prev || {}) };
                    importedSales.forEach((s: Operator) => {
                        if (s.id) {
                            const { id, ...rest } = s;
                            next[id] = rest;
                        }
                    });
                    return next;
                });
                totalImported += importedSales.length;
            }

            if (importedTechs && importedTechs.length > 0) {
                setMaintenancePersonnelData(prev => {
                    const next = importMode === 'replace' ? {} : { ...(prev || {}) };
                    importedTechs.forEach((m: Operator) => {
                        if (m.id) {
                            const { id, ...rest } = m;
                            next[id] = rest;
                        }
                    });
                    return next;
                });
                totalImported += importedTechs.length;
            }

            if (importedCx && importedCx.length > 0) {
                setCxPersonnelData(prev => {
                    const next = importMode === 'replace' ? {} : { ...(prev || {}) };
                    importedCx.forEach((c: Operator) => {
                        if (c.id) {
                            const { id, ...rest } = c;
                            next[id] = rest;
                        }
                    });
                    return next;
                });
                totalImported += importedCx.length;
            }

            if (newFloors && newFloors.length > 0) {
                setAppConfigData(prev => {
                    const currentFloors = prev?.floors || ['Level 8', 'Level 9', 'Level 10'];
                    const merged = Array.from(new Set([...currentFloors, ...newFloors]));
                    return { ...(prev || DEFAULT_APP_CONFIG), floors: merged };
                });
            }

            logAction('BULK_IMPORT', `Bulk imported ${totalImported} records (Mode: ${importMode}).`);
            showNotification(`Successfully imported ${totalImported} records!`, 'success');
            return;
        }

        // Legacy individual entity import
        const entityType = entityTypeOrData;
        const importedRecords = maybeImportedRecords;
        if (!importedRecords || importedRecords.length === 0) return;

        switch (entityType) {
            case 'rides': {
                const currentData = { ...(ridesData || {}) };
                importedRecords.forEach(r => {
                    if (r.id) {
                        const { id, ...rest } = r;
                        currentData[id] = rest;
                    }
                });
                setRidesData(currentData);
                logAction('BULK_IMPORT_RIDES', `Bulk imported/updated ${importedRecords.length} rides.`);
                showNotification(`Imported ${importedRecords.length} rides!`, 'success');
                break;
            }
            case 'counters': {
                const currentData = { ...(countersData || {}) };
                importedRecords.forEach(c => {
                    if (c.id) {
                        const { id, ...rest } = c;
                        currentData[id] = rest;
                    }
                });
                setCountersData(currentData);
                logAction('BULK_IMPORT_COUNTERS', `Bulk imported/updated ${importedRecords.length} counters.`);
                showNotification(`Imported ${importedRecords.length} counters!`, 'success');
                break;
            }
            case 'operators': {
                const currentData = { ...(operatorsData || {}) };
                importedRecords.forEach(o => {
                    if (o.id) {
                        const { id, ...rest } = o;
                        currentData[id] = rest;
                    }
                });
                setOperatorsData(currentData);
                logAction('BULK_IMPORT_OPERATORS', `Bulk imported/updated ${importedRecords.length} operators.`);
                showNotification(`Imported ${importedRecords.length} operators!`, 'success');
                break;
            }
            case 'ticketSalesPersonnel': {
                const currentData = { ...(ticketSalesPersonnelData || {}) };
                importedRecords.forEach(p => {
                    if (p.id) {
                        const { id, ...rest } = p;
                        currentData[id] = rest;
                    }
                });
                setTicketSalesPersonnelData(currentData);
                logAction('BULK_IMPORT_TS_STAFF', `Bulk imported/updated ${importedRecords.length} ticket sales staff.`);
                showNotification(`Imported ${importedRecords.length} ticket sales staff!`, 'success');
                break;
            }
            case 'maintenancePersonnel': {
                const currentData = { ...(maintenancePersonnelData || {}) };
                importedRecords.forEach(m => {
                    if (m.id) {
                        const { id, ...rest } = m;
                        currentData[id] = rest;
                    }
                });
                setMaintenancePersonnelData(currentData);
                logAction('BULK_IMPORT_MAINT_STAFF', `Bulk imported/updated ${importedRecords.length} maintenance staff.`);
                showNotification(`Imported ${importedRecords.length} maintenance staff!`, 'success');
                break;
            }
            case 'packages': {
                const current: PackageItem[] = Array.isArray(packages) ? [...packages] : (Object.values(packages) as PackageItem[]);
                importedRecords.forEach((pkg: PackageItem) => {
                    const idx = current.findIndex(p => p.id === pkg.id);
                    if (idx >= 0) {
                        current[idx] = pkg;
                    } else {
                        current.push(pkg);
                    }
                });
                setPackagesData(current);
                logAction('BULK_IMPORT_PACKAGES', `Bulk imported/updated ${importedRecords.length} packages.`);
                showNotification(`Imported ${importedRecords.length} packages!`, 'success');
                break;
            }
            default:
                showNotification(`Unknown entity type: ${entityType}`, 'error');
        }
    }, [ridesData, countersData, operatorsData, ticketSalesPersonnelData, maintenancePersonnelData, packages, setRidesData, setCountersData, setOperatorsData, setTicketSalesPersonnelData, setMaintenancePersonnelData, setPackagesData, setAppConfigData, logAction, showNotification]);

    const handleSaveStaffCredential = useCallback(async (key: string, creds: { password: string; recoveryPin: string; createdAt: string; updatedAt?: string }) => {
        const updated = {
            ...(staffCredentialsData || {}),
            [key]: creds
        };
        await setStaffCredentialsData(updated);
        try {
            const local = JSON.parse(localStorage.getItem('TFW_STAFF_CREDENTIALS') || '{}');
            local[key] = creds;
            localStorage.setItem('TFW_STAFF_CREDENTIALS', JSON.stringify(local));
        } catch {
            // ignore
        }
    }, [staffCredentialsData, setStaffCredentialsData]);

    if (!role) {
        return (
            <div className="flex flex-col min-h-screen bg-gray-900 text-gray-100">
                {onReturnToHub && (
                    <div className="bg-slate-950/95 border-b border-indigo-500/20 px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs sticky top-0 z-50 backdrop-blur-md">
                        <button
                            type="button"
                            onClick={onReturnToHub}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:text-white bg-slate-800/80 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer shadow-sm group"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                            <span>Return to TBG Central Hub</span>
                        </button>
                        <span className="text-xs text-slate-300 font-medium">
                            <span className="hidden sm:inline text-slate-400">Tanvir Bashundhara Group · </span>
                            <span className="text-amber-400 font-bold">Toggi Fun World O&amp;M Portal</span>
                        </span>
                    </div>
                )}
                <div className="flex-1 flex flex-col">
                    <Login 
                        onLogin={handleLogin} 
                        operators={operators} 
                        ticketSalesPersonnel={ticketSalesPersonnel} 
                        maintenancePersonnel={maintenancePersonnel}
                        cxPersonnel={cxPersonnel}
                        appLogo={appLogo}
                        appConfig={appConfig}
                        adminPassword={appConfig.adminPassword || 'admin79'}
                        connectionStatus={connectionStatus}
                        staffCredentials={staffCredentialsData}
                        onSaveStaffCredentials={handleSaveStaffCredential}
                    />
                </div>
            </div>
        );
    }
    
    const renderContent = () => {
        switch (currentView) {
            case 'dashboard': 
                return (
                    <Dashboard 
                        ridesWithCounts={ridesWithCounts} 
                        operators={operators} 
                        attendance={attendanceArray} 
                        historyLog={historyLog} 
                        onNavigate={handleNavigate} 
                        selectedDate={selectedDate} 
                        onDateChange={setSelectedDate} 
                        dailyAssignments={dailyAssignments} 
                        dailyCounts={dailyCounts}
                        rides={rides}
                    />
                );
            case 'reports': 
                return (
                    <Reports 
                        selectedDate={selectedDate}
                        dailyCounts={dailyCounts} 
                        dailyPackageCounts={dailyPackageCounts}
                        dailyTicketCounts={dailyTicketCounts}
                        rides={rides} 
                    />
                );
            case 'assignments': 
                return (
                    <AssignmentView 
                        rides={rides} 
                        operators={operators} 
                        dailyAssignments={dailyAssignments} 
                        assignmentLocks={assignmentLocksData}
                        onToggleAssignmentLock={handleToggleAssignmentLock}
                        ridePreChecks={ridePreChecksData}
                        onSave={handleSaveAssignments} 
                        selectedDate={selectedDate} 
                        attendance={attendanceArray}
                        onCopyPrevious={handleCopyAssignmentsFromPrevious}
                        canCopyPrevious={canCopyAssignments}
                        latestRecordedDate={previousAssignmentsDate || latestRecordedDate}
                        currentUser={currentUser}
                        role={role}
                        logAction={logAction}
                    />
                );
            case 'expertise': 
                return <ExpertiseReport operators={operators} dailyAssignments={dailyAssignments} rides={rides} />;
            case 'roster':
                const ridesForRoster = rides.map(ride => {
                    const val = dailyCounts[selectedDate]?.[ride.id] !== undefined ? dailyCounts[selectedDate]?.[ride.id] : dailyCounts[selectedDate]?.[String(ride.id)];
                    const pkgVal = dailyPackageCounts[selectedDate]?.[ride.id] !== undefined ? dailyPackageCounts[selectedDate]?.[ride.id] : dailyPackageCounts[selectedDate]?.[String(ride.id)];
                    const tktVal = dailyTicketCounts[selectedDate]?.[ride.id] !== undefined ? dailyTicketCounts[selectedDate]?.[ride.id] : dailyTicketCounts[selectedDate]?.[String(ride.id)];
                    const numVal = Number(val) || 0;
                    let numPkg = Number(pkgVal) || 0;
                    let numTkt = Number(tktVal) || 0;
                    if (numPkg === 0 && numTkt === 0 && numVal > 0) {
                        numPkg = numVal;
                    }
                    const totalSum = numPkg + numTkt;
                    return { 
                        ...ride, 
                        count: totalSum,
                        packageCount: numPkg,
                        ticketCount: numTkt
                    };
                });
                return (
                    <DailyRoster 
                        rides={ridesForRoster} 
                        operators={operators} 
                        dailyAssignments={dailyAssignments} 
                        assignmentLocks={assignmentLocksData}
                        onToggleAssignmentLock={handleToggleAssignmentLock}
                        ridePreChecks={ridePreChecksData}
                        dailyCounts={dailyCounts}
                        dailyPackageCounts={dailyPackageCounts}
                        dailyTicketCounts={dailyTicketCounts}
                        selectedDate={selectedDate} 
                        onDateChange={setSelectedDate} 
                        role={role} 
                        currentUser={currentUser} 
                        attendance={attendanceArray} 
                        onNavigate={handleNavigate} 
                        onCountChange={handleCountChange} 
                        onIncrementCount={handleIncrementCount}
                        onPackageCountChange={handlePackageCountChange}
                        onIncrementPackageCount={handleIncrementPackageCount}
                        onTicketCountChange={handleTicketCountChange}
                        onIncrementTicketCount={handleIncrementTicketCount}
                        onShowModal={handleShowModal} 
                        onReportProblem={handleReportProblem}
                        maintenanceTickets={maintenanceTickets}
                        hasCheckedInToday={hasCheckedInToday} 
                        onClockIn={handleClockIn} 
                        isCheckinAllowed={isCheckinAllowed} 
                        onSaveAssignments={handleSaveAssignments}
                        onCopyAssignmentsFromPrevious={handleCopyAssignmentsFromPrevious}
                        canCopyAssignments={canCopyAssignments}
                        latestRecordedDate={previousAssignmentsDate || latestRecordedDate}
                        logAction={logAction}
                    />
                );
            case 'ticket-sales-dashboard': 
                return (
                    <TicketSalesView 
                        countersWithSales={countersWithSales} 
                        onSalesChange={handleSalesChange} 
                        onIncrementSales={handleIncrementSales}
                        selectedDate={selectedDate}
                        packageSales={packageSalesData}
                        packages={packages}
                        otherSalesCategories={otherSalesCategories}
                        currency={appConfig.currency || 'BDT'}
                        ticketSalesPersonnel={ticketSalesPersonnel}
                        ticketSalesAssignments={ticketSalesAssignments}
                        attendance={attendanceArray}
                        onNavigate={handleNavigate}
                        currentUser={currentUser}
                        role={role}
                    />
                );
            case 'ts-assignments': 
                return (
                    <TicketSalesAssignmentView 
                        counters={counters} 
                        ticketSalesPersonnel={ticketSalesPersonnel} 
                        dailyAssignments={ticketSalesAssignments} 
                        onSave={handleSaveTicketSalesAssignments} 
                        selectedDate={selectedDate} 
                        attendance={attendanceArray} 
                        onCopyPrevious={handleCopyTicketSalesAssignmentsFromPrevious}
                        canCopyPrevious={canCopyTicketSalesAssignments}
                        latestRecordedDate={previousTicketSalesAssignmentsDate || latestRecordedDate}
                    />
                );
            case 'ts-roster': 
                const countersForRoster = counters.map(counter => {
                    const val = ticketSalesData[selectedDate]?.[counter.id] !== undefined 
                        ? ticketSalesData[selectedDate]?.[counter.id] 
                        : ticketSalesData[selectedDate]?.[String(counter.id)];
                    return { ...counter, count: Number(val) || 0 };
                });
                return (
                    <TicketSalesRoster 
                        counters={countersForRoster} 
                        ticketSalesPersonnel={ticketSalesPersonnel} 
                        dailyAssignments={ticketSalesAssignments} 
                        selectedDate={selectedDate} 
                        onDateChange={setSelectedDate} 
                        role={role} 
                        currentUser={currentUser} 
                        attendance={attendanceArray} 
                        onNavigate={handleNavigate} 
                        onCountChange={handleSalesChange}
                        onIncrementCount={handleIncrementSales}
                        onSaveAssignments={handleSaveTicketSalesAssignments} 
                        hasCheckedInToday={hasCheckedInToday} 
                        onClockIn={handleClockIn} 
                        isCheckinAllowed={isCheckinAllowed} 
                        onCopyAssignmentsFromPrevious={handleCopyTicketSalesAssignmentsFromPrevious}
                        canCopyAssignments={canCopyTicketSalesAssignments}
                        latestRecordedDate={previousTicketSalesAssignmentsDate || latestRecordedDate}
                    />
                );
            case 'ts-expertise': 
                return <TicketSalesExpertiseReport ticketSalesPersonnel={ticketSalesPersonnel} dailyAssignments={ticketSalesAssignments} counters={counters}/>;
            case 'history': 
                return <HistoryLog history={historyLog} onClearHistory={handleClearHistory} />;
            case 'my-sales': 
                return (
                    <DailySalesEntry 
                        currentUser={currentUser!} 
                        selectedDate={selectedDate} 
                        onDateChange={setSelectedDate} 
                        packageSales={packageSalesData} 
                        onSave={handleSavePackageSales} 
                        mySalesStartDate={mySalesStartDate} 
                        onMySalesStartDateChange={setMySalesStartDate} 
                        mySalesEndDate={mySalesEndDate} 
                        onMySalesEndDateChange={setMySalesEndDate} 
                        otherSalesCategories={otherSalesCategories} 
                        availablePackages={packages} 
                        currency={appConfig.currency}
                        ticketSalesPersonnel={ticketSalesPersonnel}
                        role={role}
                        singleGnrRides={singleGnrRides}
                        onAddCategory={handleAddOtherSalesCategory}
                    />
                );
            case 'other-sales-categories':
            case 'sales-officer-dashboard': 
                return (
                    <SalesOfficerDashboard 
                        ticketSalesPersonnel={ticketSalesPersonnel} 
                        packageSales={packageSalesData} 
                        startDate={startDate} 
                        endDate={endDate} 
                        onStartDateChange={setStartDate} 
                        onEndDateChange={setEndDate} 
                        role={role} 
                        onEditSales={handleEditPackageSales} 
                        otherSalesCategories={otherSalesCategories} 
                        currency={appConfig.currency}
                        availablePackages={packages}
                        singleGnrRides={singleGnrRides}
                        currentUser={currentUser}
                        onSaveOtherSalesCategories={handleSaveOtherSalesCategories}
                        onAddOtherSalesCategory={handleAddOtherSalesCategory}
                        onDeleteOtherSalesCategory={handleDeleteOtherSalesCategory}
                        initialTab={currentView === 'other-sales-categories' ? 'category-wise' : 'records'}
                        onNavigate={handleNavigate}
                        maintenanceTickets={maintenanceTickets}
                        onUpdateTicketStatus={handleUpdateTicketStatus}
                    />
                );
            case 'maintenance-kpi':
                return (
                    <MaintenanceKpiDashboard
                        maintenanceTickets={maintenanceTickets}
                        maintenancePersonnel={maintenancePersonnel}
                        rides={rides}
                        selectedDate={selectedDate}
                        onDateChange={setSelectedDate}
                        onNavigate={handleNavigate}
                        onReportProblem={handleReportProblem}
                        onUploadSolvedTickets={handleUploadSolvedTickets}
                        customCategories={appConfig.customTechnicalCategories}
                        onSaveCategories={handleSaveCustomTechnicalCategories}
                        onUpdateTicketCategory={handleUpdateTicketCategory}
                        kpiUsername={appConfig.maintenanceKpiUser || 'kpi'}
                        kpiPassword={appConfig.maintenanceKpiPassword || 'kpi79'}
                        onSaveKpiCredentials={handleSaveKpiCredentials}
                        isAlreadyAuthenticated={role === 'maintenance-kpi' || role === 'admin'}
                    />
                );
            case 'maintenance-dashboard': 
                return (
                    <MaintenanceDashboard 
                        maintenanceTickets={maintenanceTickets} 
                        selectedDate={selectedDate} 
                        onDateChange={setSelectedDate} 
                        onUpdateTicketStatus={handleUpdateTicketStatus} 
                        maintenancePersonnel={maintenancePersonnel} 
                        onClearSolved={handleClearSolvedTickets} 
                        onClearReported={handleClearReportedTickets}
                        onClearAllRecords={handleClearAllMaintenanceRecords}
                        onUploadSolvedTickets={handleUploadSolvedTickets}
                        onDeleteTicket={handleDeleteTicket}
                        rides={rides} 
                        onReportProblem={handleReportProblem}
                        portalType="rides"
                        role={role}
                        onSwitchPortal={(p) => handleNavigate(p === 'cx' ? 'cx-feedback' : 'maintenance-dashboard')}
                        onShowModal={handleShowModal}
                        onNavigate={handleNavigate}
                        customCategories={appConfig.customTechnicalCategories}
                        onUpdateTicketCategory={handleUpdateTicketCategory}
                        ridePreChecks={ridePreChecksData}
                        onSaveRidePreCheck={handleSaveRidePreCheck}
                        dailyAssignments={dailyAssignments}
                        operators={operators}
                        currentUser={currentUser}
                    />
                );
            case 'cx-feedback':
                // If user is in Maintenance role, show the Customer Experience (CX) Maintenance dashboard
                if (role === 'maintenance') {
                    return (
                        <MaintenanceDashboard 
                            maintenanceTickets={maintenanceTickets} 
                            selectedDate={selectedDate} 
                            onDateChange={setSelectedDate} 
                            onUpdateTicketStatus={handleUpdateTicketStatus} 
                            maintenancePersonnel={maintenancePersonnel} 
                            onClearSolved={handleClearSolvedTickets} 
                            onClearReported={handleClearReportedTickets}
                            onClearAllRecords={handleClearAllMaintenanceRecords}
                            onUploadSolvedTickets={handleUploadSolvedTickets}
                            onDeleteTicket={handleDeleteTicket}
                            rides={rides} 
                            onReportProblem={handleReportProblem}
                            portalType="cx"
                            role={role}
                            onSwitchPortal={(p) => handleNavigate(p === 'cx' ? 'cx-feedback' : 'maintenance-dashboard')}
                            onShowModal={handleShowModal}
                            customCategories={appConfig.customTechnicalCategories}
                            onUpdateTicketCategory={handleUpdateTicketCategory}
                            ridePreChecks={ridePreChecksData}
                            onSaveRidePreCheck={handleSaveRidePreCheck}
                            dailyAssignments={dailyAssignments}
                            operators={operators}
                            currentUser={currentUser}
                        />
                    );
                }
                return (
                    <CustomerExperienceView 
                        rides={rides}
                        currentUser={currentUser}
                        role={role}
                        selectedDate={selectedDate}
                        onDateChange={setSelectedDate}
                        maintenanceTickets={maintenanceTickets}
                        onReportProblem={handleReportProblem}
                        onUpdateTicketStatus={handleUpdateTicketStatus}
                        onNavigate={handleNavigate}
                        onBroadcastSync={handleBroadcastSync}
                        isBroadcastingSync={isBroadcastingSync}
                        onShowModal={handleShowModal}
                    />
                );

            case 'management-summary':
                return (
                    <ManagementSummaryView 
                        rides={rides}
                        dailyCounts={dailyCounts}
                        dailyPackageCounts={dailyPackageCounts}
                        dailyTicketCounts={dailyTicketCounts}
                        dailyAssignments={dailyAssignments}
                        ticketSalesData={ticketSalesData}
                        packageSalesData={packageSalesData}
                        packages={packages}
                        attendanceData={attendanceData}
                        operators={operators}
                        counters={counters}
                        maintenanceTickets={maintenanceTickets}
                        selectedDate={selectedDate}
                        today={today}
                        onDateChange={setSelectedDate}
                        managementNotes={appConfigData?.managementNotes}
                        onSaveManagementNotes={handleSaveManagementNotes}
                        currentUser={currentUser}
                        onNavigate={handleNavigate}
                        whatsappManagementReports={whatsappManagementReports}
                        onBroadcastSync={handleBroadcastSync}
                        isBroadcastingSync={isBroadcastingSync}
                    />
                );

            case 'information-desk':
                return <KioskMonitorView onLogout={handleLogout} />;
            
            case 'counter': default: 
                if (role === 'operation-officer') {
                    return (
                        <OperationOfficerRideView 
                            rides={rides}
                            dailyCounts={dailyCounts}
                            dailyPackageCounts={dailyPackageCounts}
                            dailyTicketCounts={dailyTicketCounts}
                            selectedDate={selectedDate}
                            today={today}
                            onDateChange={setSelectedDate}
                            onCountChange={handleCountChange}
                            onIncrementCount={handleIncrementCount}
                            onPackageCountChange={handlePackageCountChange}
                            onIncrementPackageCount={handleIncrementPackageCount}
                            onTicketCountChange={handleTicketCountChange}
                            onIncrementTicketCount={handleIncrementTicketCount}
                            role={role}
                            onChangePicture={(ride) => handleShowModal('edit-image', ride)}
                            floors={floors}
                            maintenanceTickets={maintenanceTickets}
                            currentUser={currentUser}
                            onUpdateTicketStatus={handleUpdateTicketStatus}
                            dailyAssignments={dailyAssignments}
                            operators={operators}
                            assignmentLocks={assignmentLocksData}
                            onToggleAssignmentLock={handleToggleAssignmentLock}
                            ridePreChecks={ridePreChecksData}
                            onSaveAssignments={handleSaveAssignments}
                        />
                    );
                }
                return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {filteredRides.map(ride => {
                            const preCheck = ridePreChecksData?.[selectedDate]?.[ride.id];
                            const assigns = normalizeAssigneeIds(dailyAssignments?.[selectedDate]?.[ride.id] || dailyAssignments?.[selectedDate]?.[String(ride.id)]);
                            const assignedOpNames = assigns.map(id => operators.find(o => Number(o.id) === id)?.name).filter(Boolean) as string[];
                            return (
                                <RideCard 
                                    key={ride.id} 
                                    ride={ride} 
                                    onCountChange={handleCountChange} 
                                    onIncrement={handleIncrementCount} 
                                    role={role} 
                                    onChangePicture={() => handleShowModal('edit-image', ride)} 
                                    preCheck={preCheck}
                                    assignedOperators={assignedOpNames}
                                />
                            );
                        })}
                    </div>
                );
        }
    };

    if (role === 'information-desk') {
        return (
            <div className="min-h-screen bg-[#04060f] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
                {onReturnToHub && (
                    <div className="bg-slate-950/95 border-b border-indigo-500/20 px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-50">
                        <button
                            type="button"
                            onClick={onReturnToHub}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:text-white bg-slate-900 border border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer shadow-sm group"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                            <span>Return to TBG Central Hub</span>
                        </button>
                        <span className="text-xs text-slate-400 font-medium">
                            Tanvir Bashundhara Group · Information Desk
                        </span>
                    </div>
                )}
                <main className="max-w-7xl w-full mx-auto flex-1 flex flex-col p-3 sm:p-5">
                    <KioskMonitorView onLogout={handleLogout} />
                </main>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-gray-900 text-gray-100">
            {role === 'operator' && <KioskModeWrapper />}
            {onReturnToHub && (
                <div className="bg-slate-950/95 border-b border-indigo-500/25 px-4 sm:px-6 py-2 flex items-center justify-between text-xs sticky top-0 z-50 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onReturnToHub}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:text-white bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-700/50 hover:border-indigo-500 transition-all cursor-pointer shadow-sm group"
                            title="Return to Tanvir Bashundhara Group Portal"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                            <span>Return to TBG Central Hub</span>
                        </button>
                        <span className="hidden sm:inline text-slate-600 text-xs font-light">|</span>
                        <span className="hidden sm:inline text-slate-400 font-medium">
                            Tanvir Bashundhara Group · <span className="text-amber-400 font-semibold">Toggi Fun World O&amp;M Portal</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active Park Operations
                        </span>
                    </div>
                </div>
            )}
            <Header 
                onSearch={setSearchTerm} 
                onSelectFloor={setSelectedFloor} 
                selectedFloor={selectedFloor} 
                role={role} 
                currentUser={currentUser} 
                onLogout={handleLogout} 
                onNavigate={handleNavigate} 
                onShowModal={handleShowModal} 
                currentView={currentView} 
                connectionStatus={connectionStatus} 
                appLogo={appLogo} 
                appConfig={appConfig}
                appName={appConfig.appName}
                floors={floors}
                onBroadcastSync={handleBroadcastSync}
                isBroadcastingSync={isBroadcastingSync}
            />

            {/* Universal Operational Date Navigator */}
            <DateNavigationBar
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                today={today}
                latestRecordedDate={previousAssignmentsDate || latestRecordedDate}
                hasDataForSelectedDate={hasDataForSelectedDate}
                hasDataForToday={hasDataForToday}
                onCopyAssignmentsFromPrevious={handleCopyAssignmentsFromPrevious}
                canCopyAssignments={canCopyAssignments}
                role={role}
                onBroadcastSync={handleBroadcastSync}
                isBroadcastingSync={isBroadcastingSync}
            />
            
            <main className="container mx-auto p-4 flex-grow">{renderContent()}</main>
            
            {currentView === 'counter' && (
                <Footer 
                    title={`${role === 'operation-officer' ? 'Total Guest Enjoy G&R' : (appConfig.totalGuestsLabel || "Total Guests")} (${selectedDate === today ? 'Today' : selectedDate})`} 
                    count={totalGuests} 
                    packageCount={totalPackageGuests}
                    ticketCount={totalTicketGuests}
                    showReset={role === 'admin'} 
                    onReset={handleResetCounts} 
                    gradient="bg-gradient-to-r from-purple-500 to-pink-600" 
                />
            )}
            {currentView === 'ticket-sales-dashboard' && (
                <Footer 
                    title={`Total Sales Amount (${selectedDate === today ? 'Today' : selectedDate})`} 
                    count={totalSalesAmount} 
                    formattedValue={`${appConfig.currency || 'BDT'} ${totalSalesAmount.toLocaleString()}`}
                    secondaryInfo={`${totalSales.toLocaleString()} Counter Tickets`}
                    showReset={role === 'admin'} 
                    onReset={handleResetSales} 
                    gradient="bg-gradient-to-r from-teal-600 to-emerald-700" 
                />
            )}
            
            {modal === 'edit-image' && selectedRideForModal && (
                <EditImageModal ride={selectedRideForModal} onClose={() => setModal(null)} onSave={handleSaveImage as any} />
            )}
            {modal === 'backup' && (
                <BackupManager 
                    onClose={() => setModal(null)} 
                    onExport={handleExportData} 
                    onImport={handleImportData} 
                    onResetDay={handleResetDay} 
                    appLogo={appLogo} 
                    onLogoChange={handleLogoChange} 
                />
            )}
            {modal === 'share' && (
                <ShareModal 
                    onClose={() => setModal(null)} 
                    appName={appConfig.appName} 
                    githubUrl={appConfig.githubUrl}
                />
            )}
            {modal === 'admin-manager' && role === 'admin' && (
                <AdminManager
                    rides={rides}
                    counters={counters}
                    operators={operators}
                    ticketSalesPersonnel={ticketSalesPersonnel}
                    maintenancePersonnel={maintenancePersonnel}
                    cxPersonnel={cxPersonnel}
                    packages={packages}
                    singleGnrRides={singleGnrRides}
                    onSaveSingleGnrRides={handleSaveSingleGnrRides}
                    floors={floors}
                    appConfig={appConfig}
                    onClose={() => setModal(null)}
                    onSaveRide={handleSaveRide}
                    onDeleteRide={handleDeleteRide}
                    onSaveCounter={handleSaveCounter}
                    onDeleteCounter={handleDeleteCounter}
                    onSaveOperator={handleSaveOperator}
                    onDeleteOperator={handleDeleteOperator}
                    onClearAllOperators={handleClearAllOperators}
                    onSaveTicketSalesPersonnel={handleSaveTicketSalesPersonnel}
                    onDeleteTicketSalesPersonnel={handleDeleteTicketSalesPersonnel}
                    onSaveMaintenancePersonnel={handleSaveMaintenancePersonnel}
                    onDeleteMaintenancePersonnel={handleDeleteMaintenancePersonnel}
                    onSaveCxPersonnel={handleSaveCxPersonnel}
                    onDeleteCxPersonnel={handleDeleteCxPersonnel}
                    onSavePackage={handleSavePackage}
                    onDeletePackage={handleDeletePackage}
                    onSaveFloors={handleSaveFloors}
                    onSaveAppConfig={handleSaveAppConfig}
                    onBulkImport={handleBulkImport}
                />
            )}

            {modal === 'developer' && role === 'admin' && (
                <DeveloperModal
                    isOpen={modal === 'developer'}
                    onClose={() => setModal(null)}
                    appConfig={appConfig}
                    operators={operators}
                    ticketSalesPersonnel={ticketSalesPersonnel}
                    maintenancePersonnel={maintenancePersonnel}
                    rides={rides}
                    counters={counters}
                    connectionStatus={connectionStatus}
                    onSaveAppConfig={handleSaveAppConfig}
                    isAdmin={role === 'admin'}
                />
            )}

            <ConfirmModal
                isOpen={confirmDialog.isOpen}
                title={confirmDialog.title}
                message={confirmDialog.message}
                confirmLabel={confirmDialog.confirmLabel}
                cancelLabel={confirmDialog.cancelLabel}
                confirmVariant={confirmDialog.confirmVariant}
                onConfirm={() => {
                    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                    confirmDialog.onConfirm();
                }}
                onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
            />

            <footer className="text-center py-4 mt-auto border-t border-gray-800/60">
              {role === 'admin' ? (
                <button 
                  type="button"
                  onClick={() => setModal('admin-manager')}
                  className="group inline-flex flex-col items-center hover:bg-gray-800/60 px-4 py-1.5 rounded-xl transition-all cursor-pointer border border-transparent hover:border-gray-750"
                  title="Admin: Open Admin Portal (includes Developer & Roles Matrix)"
                >
                  <p className="text-gray-500 text-xs font-light group-hover:text-purple-400 transition-colors">
                      {appConfig.devByLabel || 'Developed By'}
                  </p>
                  <p className="text-gray-300 group-hover:text-white font-semibold text-sm transition-colors">
                      {appConfig.devByName || 'Mufti Mahmud Mollah'}
                  </p>
                  <p className="text-gray-500 text-xs group-hover:text-gray-400 transition-colors">
                      {appConfig.devByTitle || 'AGM (Maintenance & SCD, FP, TFW)'}
                  </p>
                  {appConfig.orgName && (
                    <p className="text-gray-600 text-[11px] mt-0.5 group-hover:text-purple-400 transition-colors">
                      {appConfig.orgName} • <span className="text-purple-400 underline decoration-dotted">Open Admin Portal</span>
                    </p>
                  )}
                </button>
              ) : (
                <div className="inline-flex flex-col items-center px-4 py-1.5">
                  <p className="text-gray-500 text-xs font-light">
                      {appConfig.devByLabel || 'Developed By'}
                  </p>
                  <p className="text-gray-400 font-semibold text-sm">
                      {appConfig.devByName || 'Mufti Mahmud Mollah'}
                  </p>
                  <p className="text-gray-500 text-xs">
                      {appConfig.devByTitle || 'AGM (Maintenance & SCD, FP, TFW)'}
                  </p>
                  {appConfig.orgName && (
                    <p className="text-gray-600 text-[11px] mt-0.5">
                      {appConfig.orgName}
                    </p>
                  )}
                </div>
              )}
            </footer>
        </div>
    );
};

type PortalApp = 'hub' | 'toggi-fun-world' | 'park-management';

export interface ParkAuthUser {
    username: string;
    role: string;
    name: string;
    parkName?: string;
}

const App: React.FC = () => {
    const [portalApp, setPortalAppState] = useState<PortalApp>(() => {
        try {
            const saved = localStorage.getItem('TBG_ACTIVE_PORTAL_APP');
            if (saved === 'toggi-fun-world' || saved === 'park-management') return saved;
        } catch {}
        return 'hub';
    });

    const [parkAuthUser, setParkAuthUserState] = useState<ParkAuthUser | null>(() => {
        try {
            const saved = localStorage.getItem('TBG_PARK_AUTH_USER');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.name) return parsed;
            }
        } catch {}
        return null;
    });

    const setPortalApp = useCallback((app: PortalApp) => {
        setPortalAppState(app);
        try {
            localStorage.setItem('TBG_ACTIVE_PORTAL_APP', app);
        } catch {}
    }, []);

    const setParkAuthUser = useCallback((user: ParkAuthUser | null) => {
        setParkAuthUserState(user);
        try {
            if (user) {
                localStorage.setItem('TBG_PARK_AUTH_USER', JSON.stringify(user));
            } else {
                localStorage.removeItem('TBG_PARK_AUTH_USER');
            }
        } catch {}
    }, []);

    const handleReturnToHub = useCallback(() => {
        setPortalApp('hub');
    }, [setPortalApp]);

    const handleParkLogout = useCallback(() => {
        setParkAuthUser(null);
    }, [setParkAuthUser]);

    return (
        <>
            <div className={portalApp === 'hub' ? 'block' : 'hidden'}>
                <TBGCentralPortal 
                    onLaunchToggi={() => setPortalApp('toggi-fun-world')}
                    onLaunchParkManagement={(user) => {
                        setParkAuthUser(user);
                        setPortalApp('park-management');
                    }}
                    currentUser={parkAuthUser}
                />
            </div>
            {portalApp === 'park-management' && (
                <TBGParkManagementWrapper 
                    onReturnToHub={handleReturnToHub}
                    authenticatedUser={parkAuthUser}
                    onLoginSuccess={(user) => {
                        setParkAuthUser(user);
                    }}
                    onLogout={handleParkLogout}
                />
            )}
            {portalApp === 'toggi-fun-world' && (
                <NotificationProvider>
                    <AppContent onReturnToHub={handleReturnToHub} />
                </NotificationProvider>
            )}
        </>
    );
};

export default App;
