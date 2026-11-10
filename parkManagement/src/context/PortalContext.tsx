import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  AmusementPark,
  LeadEngineer,
  ParkIssue,
  IssueFilterState,
  ParkId,
  IssueStatus,
  IssueSeverity,
  IssueCategory,
} from '../types';
import { INITIAL_PARKS, INITIAL_ENGINEERS, INITIAL_ISSUES } from '../data/initialData';

export interface UserPersona {
  role: 'AGM' | 'Engineer' | 'Sr. Technician' | 'Sr. Foreman' | string;
  name: string;
  title: string;
  badgeId?: string;
  parkId?: ParkId;
  parkName?: string;
  engineerId?: string;
}

export const PRESET_USERS: UserPersona[] = [
  {
    role: 'AGM',
    name: 'Mufti Mahmud Mollah',
    title: 'Assistant General Manager',
    badgeId: 'AGM-TBG-001',
    parkName: 'Toggi Fun World & Central Park',
  },
];

interface PortalContextType {
  parks: AmusementPark[];
  engineers: LeadEngineer[];
  issues: ParkIssue[];
  filters: IssueFilterState;
  currentUser: UserPersona;
  selectedIssue: ParkIssue | null;
  activeTab: 'issues' | 'engineers' | 'parks';
  isAgm: boolean;
  userAssignedParkId: ParkId;
  
  // Modals
  isAgmDirectiveModalOpen: boolean;
  isNewIssueModalOpen: boolean;
  isAddEngineerModalOpen: boolean;
  isIssueDetailModalOpen: boolean;
  isExportModalOpen: boolean;
  isCategoryManagerModalOpen: boolean;

  // Categories
  categories: string[];
  addCategory: (categoryName: string) => void;
  removeCategory: (categoryName: string) => void;

  // Actions
  setActiveTab: (tab: 'issues' | 'engineers' | 'parks') => void;
  setFilters: React.Dispatch<React.SetStateAction<IssueFilterState>>;
  resetFilters: () => void;
  setCurrentUser: (user: UserPersona) => void;
  setSelectedIssue: (issue: ParkIssue | null) => void;
  
  // Modal toggles
  openAgmDirectiveModal: (issue: ParkIssue) => void;
  closeAgmDirectiveModal: () => void;
  openNewIssueModal: (preselectedParkId?: ParkId) => void;
  closeNewIssueModal: () => void;
  openAddEngineerModal: (preselectedParkId?: ParkId) => void;
  closeAddEngineerModal: () => void;
  openIssueDetailModal: (issue: ParkIssue) => void;
  closeIssueDetailModal: () => void;
  openExportModal: () => void;
  closeExportModal: () => void;
  openCategoryManagerModal: () => void;
  closeCategoryManagerModal: () => void;

  // Business logic
  addEngineer: (engineerData: {
    name: string;
    parkId: ParkId;
    role: string;
    specialty: IssueCategory;
    email?: string;
    phone?: string;
    radioChannel?: string;
    shift?: LeadEngineer['shift'];
    status?: LeadEngineer['status'];
    certifications?: string[];
  }) => LeadEngineer;

  createIssue: (issueData: {
    parkId: ParkId;
    rideName: string;
    title: string;
    description: string;
    category: IssueCategory;
    severity: IssueSeverity;
    diagnosticCode?: string;
    suggestedAction?: string;
    engineerId?: string;
  }) => ParkIssue;

  pickIssueAndIssueDirective: (
    issueId: string,
    directive: string,
    options?: {
      targetTime?: string;
      assignedEngineerId?: string;
      priority?: IssueSeverity;
    }
  ) => void;

  addWorkLog: (issueId: string, note: string) => void;

  completeIssue: (
    issueId: string,
    resolutionSummary: string,
    testCycles?: number,
    notes?: string
  ) => void;

  reopenIssue: (issueId: string, reason: string) => void;
  resetToFactoryData: () => void;
}

const defaultFilters: IssueFilterState = {
  searchQuery: '',
  parkId: 'all',
  status: 'all',
  severity: 'all',
  category: 'all',
  engineerId: 'all',
  sortBy: 'newest',
};

export const isAgmUser = (user?: { role?: string; name?: string } | null): boolean => {
  if (!user) return false;
  const role = (user.role || '').toUpperCase();
  const name = (user.name || '').toLowerCase();
  return (
    role === 'AGM' ||
    role.includes('AGM') ||
    role.includes('ASSISTANT GENERAL MANAGER') ||
    name.includes('mufti') ||
    name.includes('mollah')
  );
};

export const resolveUserParkId = (user?: { parkName?: string } | null): ParkId => {
  if (!user) return 'toggi-fun-world';
  const pName = (user.parkName || '').toLowerCase();
  if (pName.includes('central') || pName.includes('bashundhara central')) {
    return 'bashundhara-central';
  }
  return 'toggi-fun-world';
};

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export const PortalProvider: React.FC<{ children: React.ReactNode; initialUser?: any }> = ({ children, initialUser }) => {
  const [parks] = useState<AmusementPark[]>(INITIAL_PARKS);

  const [engineers, setEngineers] = useState<LeadEngineer[]>(() => {
    // Clear old mock storage if present
    localStorage.removeItem('agm_portal_engineers');
    const saved = localStorage.getItem('tbg_portal_engineers_v3');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved engineers', e);
      }
    }
    return INITIAL_ENGINEERS;
  });

  const [issues, setIssues] = useState<ParkIssue[]>(() => {
    // Clear old mock storage if present
    localStorage.removeItem('agm_portal_issues');
    const saved = localStorage.getItem('tbg_portal_issues_v3');
    if (saved) {
      try {
        const parsed: ParkIssue[] = JSON.parse(saved);
        return parsed.map(issue => {
          const updated = { ...issue };
          if (updated.safetySignOff) {
            updated.safetySignOff = {
              ...updated.safetySignOff,
              verifiedBy: 'AGM - Tanvir Bashundhara Group (TBG)',
            };
          }
          if (updated.agmDirectiveAuthor && updated.agmDirectiveAuthor.includes('Tanvir Ahmed')) {
            updated.agmDirectiveAuthor = updated.agmDirectiveAuthor.replace('Tanvir Ahmed', 'Mufti Mahmud Mollah');
          }
          if (updated.workLogs) {
            updated.workLogs = updated.workLogs.map(log => {
              if (log.isAgm || log.author.includes('Tanvir Ahmed')) {
                return {
                  ...log,
                  author: 'Mufti Mahmud Mollah (AGM)',
                  role: 'Assistant General Manager',
                };
              }
              return log;
            });
          }
          return updated;
        });
      } catch (e) {
        console.error('Failed to parse saved issues', e);
      }
    }
    return INITIAL_ISSUES;
  });

  const [currentUser, setCurrentUser] = useState<UserPersona>(() => {
    if (initialUser && initialUser.name) {
      const parkId = resolveUserParkId(initialUser);
      return {
        role: initialUser.role || 'AGM',
        name: initialUser.name,
        title: initialUser.role || 'Personnel',
        parkName: initialUser.parkName || (isAgmUser(initialUser) ? 'Toggi Fun World & Central Park' : 'Toggi Fun World'),
        parkId,
        badgeId: 'TBG-' + (initialUser.role || 'STAFF').toUpperCase().slice(0, 3) + '-001'
      };
    }
    try {
      const saved = localStorage.getItem('TBG_PARK_AUTH_USER');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name) {
          const parkId = resolveUserParkId(parsed);
          return {
            role: parsed.role || 'AGM',
            name: parsed.name,
            title: parsed.role || 'Personnel',
            parkName: parsed.parkName || (isAgmUser(parsed) ? 'Toggi Fun World & Central Park' : 'Toggi Fun World'),
            parkId,
            badgeId: 'TBG-' + (parsed.role || 'STAFF').toUpperCase().slice(0, 3) + '-001'
          };
        }
      }
    } catch {}
    return PRESET_USERS[0];
  });

  const isAgm = isAgmUser(currentUser);
  const userAssignedParkId = resolveUserParkId(currentUser);

  const [filters, setFilters] = useState<IssueFilterState>(() => {
    return {
      ...defaultFilters,
      parkId: isAgm ? 'all' : userAssignedParkId,
    };
  });

  useEffect(() => {
    if (initialUser && initialUser.name) {
      const parkId = resolveUserParkId(initialUser);
      setCurrentUser({
        role: initialUser.role || 'AGM',
        name: initialUser.name,
        title: initialUser.role || 'Personnel',
        parkName: initialUser.parkName || (isAgmUser(initialUser) ? 'Toggi Fun World & Central Park' : 'Toggi Fun World'),
        parkId,
        badgeId: 'TBG-' + (initialUser.role || 'STAFF').toUpperCase().slice(0, 3) + '-001'
      });
    }
  }, [initialUser]);

  // Synchronize park filter whenever user or AGM status changes
  useEffect(() => {
    if (!isAgm) {
      setFilters(prev => ({ ...prev, parkId: userAssignedParkId }));
    }
  }, [isAgm, userAssignedParkId]);

  // Wrapped setFilters: only AGM can select 'all' or switch between parks; non-AGM is strictly locked to their assigned park
  const handleSetFilters: React.Dispatch<React.SetStateAction<IssueFilterState>> = (action) => {
    setFilters(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (!isAgm) {
        return { ...next, parkId: userAssignedParkId };
      }
      return next;
    });
  };

  const [selectedIssue, setSelectedIssue] = useState<ParkIssue | null>(null);
  const [activeTab, setActiveTab] = useState<'issues' | 'engineers' | 'parks'>('issues');

  // Modals
  const [isAgmDirectiveModalOpen, setIsAgmDirectiveModalOpen] = useState(false);
  const [isNewIssueModalOpen, setIsNewIssueModalOpen] = useState(false);
  const [isAddEngineerModalOpen, setIsAddEngineerModalOpen] = useState(false);
  const [isIssueDetailModalOpen, setIsIssueDetailModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isCategoryManagerModalOpen, setIsCategoryManagerModalOpen] = useState(false);

  // Dynamic categories - removed hardcoded defaults as requested
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('tbg_portal_categories_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse categories', e);
      }
    }
    return [];
  });

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('tbg_portal_categories_v1', JSON.stringify(categories));
  }, [categories]);

  const addCategory = (categoryName: string) => {
    const trimmed = categoryName.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories(prev => [...prev, trimmed]);
    }
  };

  const removeCategory = (categoryName: string) => {
    setCategories(prev => prev.filter(c => c !== categoryName));
    setFilters(prev => (prev.category === categoryName ? { ...prev, category: 'all' } : prev));
  };

  // Sync to localStorage & server backend
  useEffect(() => {
    localStorage.setItem('tbg_portal_engineers_v3', JSON.stringify(engineers));
  }, [engineers]);

  useEffect(() => {
    localStorage.setItem('tbg_portal_issues_v3', JSON.stringify(issues));
    // Persist to central server database for real-time multi-user synchronization
    try {
      fetch('/api/db/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'data/parkManagementIssues',
          value: issues,
          senderId: currentUser.name || 'park-mgmt-client'
        })
      }).catch(() => {});
    } catch (_) {}
  }, [issues, currentUser.name]);

  // Initial load and periodic polling from server backend to receive AGM comments in real time
  useEffect(() => {
    let isMounted = true;
    const fetchRemoteIssues = async () => {
      try {
        const res = await fetch('/api/db?path=data/parkManagementIssues');
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data?.data && Array.isArray(data.data) && data.data.length > 0) {
          setIssues(prev => {
            // Merge remote issues, keeping any local unsynced edits if newer
            const remoteIssues: ParkIssue[] = data.data;
            const remoteMap = new Map(remoteIssues.map(i => [i.id, i]));
            // Check if there are meaningful differences
            const isDiff = JSON.stringify(prev) !== JSON.stringify(remoteIssues);
            return isDiff ? remoteIssues : prev;
          });
        }
      } catch (_) {}
    };

    fetchRemoteIssues();
    const interval = setInterval(fetchRemoteIssues, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const resetFilters = () => {
    setFilters({
      ...defaultFilters,
      parkId: isAgm ? 'all' : userAssignedParkId,
    });
  };

  const openAgmDirectiveModal = (issue: ParkIssue) => {
    setSelectedIssue(issue);
    setIsAgmDirectiveModalOpen(true);
  };

  const closeAgmDirectiveModal = () => {
    setIsAgmDirectiveModalOpen(false);
  };

  const openNewIssueModal = (preselectedParkId?: ParkId) => {
    if (isAgm && preselectedParkId) {
      setFilters(prev => ({ ...prev, parkId: preselectedParkId }));
    }
    setIsNewIssueModalOpen(true);
  };

  const closeNewIssueModal = () => {
    setIsNewIssueModalOpen(false);
  };

  const openAddEngineerModal = (preselectedParkId?: ParkId) => {
    if (preselectedParkId) {
      setFilters(prev => ({ ...prev, parkId: preselectedParkId }));
    }
    setIsAddEngineerModalOpen(true);
  };

  const closeAddEngineerModal = () => {
    setIsAddEngineerModalOpen(false);
  };

  const openIssueDetailModal = (issue: ParkIssue) => {
    setSelectedIssue(issue);
    setIsIssueDetailModalOpen(true);
  };

  const closeIssueDetailModal = () => {
    setIsIssueDetailModalOpen(false);
  };

  const openExportModal = () => {
    setIsExportModalOpen(true);
  };

  const closeExportModal = () => {
    setIsExportModalOpen(false);
  };

  const openCategoryManagerModal = () => {
    setIsCategoryManagerModalOpen(true);
  };

  const closeCategoryManagerModal = () => {
    setIsCategoryManagerModalOpen(false);
  };

  // Add Engineer
  const addEngineer = (data: {
    name: string;
    parkId: ParkId;
    role: string;
    specialty: IssueCategory;
    email?: string;
    phone?: string;
    radioChannel?: string;
    shift?: LeadEngineer['shift'];
    status?: LeadEngineer['status'];
    certifications?: string[];
  }): LeadEngineer => {
    const count = engineers.filter(e => e.parkId === data.parkId).length + 1;
    const parkCode = data.parkId === 'bashundhara-central' ? 'BCP' : 'TFW';
    const newEngineer: LeadEngineer = {
      id: `eng-${data.parkId === 'bashundhara-central' ? 'bcp' : 'tfw'}-${Date.now().toString().slice(-4)}`,
      badgeNumber: `ENG-${parkCode}-${100 + count}`,
      name: data.name,
      parkId: data.parkId,
      role: data.role,
      specialty: data.specialty,
      email: data.email || `${data.name.toLowerCase().replace(/\s+/g, '.')}@bashundharagroup.com`,
      phone: data.phone || '+880 1711-000000',
      radioChannel: data.radioChannel || 'Site Operations',
      shift: data.shift || 'Morning Shift (06:00 - 15:00)',
      status: data.status || 'On Duty',
      certifications: data.certifications && data.certifications.length > 0 ? data.certifications : ['Safety Trained', 'Technical Lead'],
      joinedDate: new Date().toISOString().split('T')[0],
    };

    setEngineers(prev => [newEngineer, ...prev]);
    return newEngineer;
  };

  // Report New Issue / Concern
  const createIssue = (data: {
    parkId: ParkId;
    rideName: string;
    title: string;
    description: string;
    category: IssueCategory;
    severity: IssueSeverity;
    diagnosticCode?: string;
    suggestedAction?: string;
    engineerId?: string;
  }): ParkIssue => {
    const park = parks.find(p => p.id === data.parkId)!;
    const authorEng = data.engineerId
      ? engineers.find(e => e.id === data.engineerId)
      : engineers.find(e => e.parkId === data.parkId);

    const reporterName = authorEng?.name || (currentUser.role === 'Engineer' ? currentUser.name : 'Duty Lead Engineer');
    const reporterId = authorEng?.id || (currentUser.role === 'Engineer' ? currentUser.engineerId || 'eng-gen' : 'eng-gen');

    const now = new Date();
    const timeString = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const newIssue: ParkIssue = {
      id: `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`,
      parkId: data.parkId,
      parkName: park.name,
      rideName: data.rideName,
      title: data.title,
      description: data.description,
      category: data.category,
      severity: data.severity,
      status: 'Pending Directive',
      reportedByEngineerId: reporterId,
      reportedByEngineerName: reporterName,
      reportedAt: timeString,
      diagnosticCode: data.diagnosticCode || undefined,
      suggestedAction: data.suggestedAction || undefined,
      workLogs: [
        {
          id: `wl-${Date.now()}`,
          author: reporterName,
          role: authorEng?.role || 'Lead Engineer',
          timestamp: timeString,
          note: `Issue reported and dispatched to AGM Operations. Priority: ${data.severity}.`,
        },
      ],
    };

    setIssues(prev => [newIssue, ...prev]);
    return newIssue;
  };

  // AGM picks the issue and comments what have to do -> transitions to In Progress
  const pickIssueAndIssueDirective = (
    issueId: string,
    directive: string,
    options?: {
      targetTime?: string;
      assignedEngineerId?: string;
      priority?: IssueSeverity;
    }
  ) => {
    const now = new Date();
    const timeString = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    setIssues(prev =>
      prev.map(issue => {
        if (issue.id !== issueId) return issue;

        const assignedEng = options?.assignedEngineerId
          ? engineers.find(e => e.id === options.assignedEngineerId)
          : engineers.find(e => e.id === issue.reportedByEngineerId);

        const newLogEntry: {
          id: string;
          author: string;
          role: string;
          timestamp: string;
          note: string;
          isAgm: boolean;
        } = {
          id: `wl-${Date.now()}`,
          author: `${currentUser.name} (AGM)`,
          role: 'Assistant General Manager',
          timestamp: timeString,
          note: `AGM picked issue and issued directive: "${directive}"`,
          isAgm: true,
        };

        const updated: ParkIssue = {
          ...issue,
          status: 'In Progress',
          pickedByAgmAt: timeString,
          inProgressAt: timeString,
          agmDirective: directive,
          agmDirectiveAuthor: `${currentUser.name} (AGM)`,
          hasAgmAnswer: true,
          latestAgmAnswer: directive,
          latestAgmAnswerAuthor: `${currentUser.name} (AGM)`,
          latestAgmAnswerAt: timeString,
          targetResolutionTime: options?.targetTime || 'Before next operational shift',
          assignedLeadEngineerId: assignedEng?.id || issue.reportedByEngineerId,
          assignedLeadEngineerName: assignedEng?.name || issue.reportedByEngineerName,
          severity: options?.priority || issue.severity,
          workLogs: [...issue.workLogs, newLogEntry],
        };

        if (selectedIssue?.id === issueId) {
          setSelectedIssue(updated);
        }

        return updated;
      })
    );
  };

  // Add a work progress log entry
  const addWorkLog = (issueId: string, note: string) => {
    const now = new Date();
    const timeString = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    setIssues(prev =>
      prev.map(issue => {
        if (issue.id !== issueId) return issue;

        const isUserAgm = isAgmUser(currentUser);
        const newLog = {
          id: `wl-${Date.now()}`,
          author: isUserAgm ? `${currentUser.name} (AGM)` : currentUser.name,
          role: isUserAgm ? 'Assistant General Manager' : (currentUser.title || currentUser.role),
          timestamp: timeString,
          note,
          isAgm: isUserAgm,
        };

        const updated = {
          ...issue,
          workLogs: [...issue.workLogs, newLog],
          ...(isUserAgm ? {
            hasAgmAnswer: true,
            latestAgmAnswer: note,
            latestAgmAnswerAuthor: `${currentUser.name} (AGM)`,
            latestAgmAnswerAt: timeString,
          } : {})
        };

        if (selectedIssue?.id === issueId) {
          setSelectedIssue(updated);
        }

        return updated;
      })
    );
  };

  // Mark issue as Completed
  const completeIssue = (
    issueId: string,
    resolutionSummary: string,
    testCycles = 3,
    signOffNotes = 'All systems checked. Mechanical & electrical clearances granted.'
  ) => {
    const now = new Date();
    const timeString = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    setIssues(prev =>
      prev.map(issue => {
        if (issue.id !== issueId) return issue;

        const resolverName = currentUser.name;
        const isAgm = currentUser.role === 'AGM';
        const newLog = {
          id: `wl-${Date.now()}`,
          author: isAgm ? `${currentUser.name} (AGM)` : resolverName,
          role: currentUser.title,
          timestamp: timeString,
          note: `Issue marked as Completed: ${resolutionSummary}. Safety test runs completed: ${testCycles}.`,
          isAgm,
        };

        const updated: ParkIssue = {
          ...issue,
          status: 'Completed',
          completedAt: timeString,
          completedByEngineerId: currentUser.engineerId || 'agm-override',
          completedByEngineerName: resolverName,
          resolutionSummary,
          safetySignOff: {
            verifiedBy: 'AGM - Tanvir Bashundhara Group (TBG)',
            signedAt: timeString,
            testCyclesCompleted: testCycles,
            clearanceGranted: true,
            notes: signOffNotes,
          },
          workLogs: [...issue.workLogs, newLog],
        };

        if (selectedIssue?.id === issueId) {
          setSelectedIssue(updated);
        }

        return updated;
      })
    );
  };

  // Re-open issue
  const reopenIssue = (issueId: string, reason: string) => {
    const now = new Date();
    const timeString = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    setIssues(prev =>
      prev.map(issue => {
        if (issue.id !== issueId) return issue;

        const newLog = {
          id: `wl-${Date.now()}`,
          author: `${currentUser.name} (${currentUser.role})`,
          role: currentUser.title,
          timestamp: timeString,
          note: `Issue reopened: ${reason}`,
          isAgm: currentUser.role === 'AGM',
        };

        const updated: ParkIssue = {
          ...issue,
          status: 'In Progress',
          completedAt: undefined,
          safetySignOff: undefined,
          workLogs: [...issue.workLogs, newLog],
        };

        if (selectedIssue?.id === issueId) {
          setSelectedIssue(updated);
        }

        return updated;
      })
    );
  };

  const resetToFactoryData = () => {
    localStorage.removeItem('agm_portal_engineers');
    localStorage.removeItem('agm_portal_issues');
    localStorage.removeItem('tbg_portal_engineers_v3');
    localStorage.removeItem('tbg_portal_issues_v3');
    setEngineers(INITIAL_ENGINEERS);
    setIssues(INITIAL_ISSUES);
    setFilters(defaultFilters);
    setSelectedIssue(null);
  };

  return (
    <PortalContext.Provider
      value={{
        parks,
        engineers,
        issues,
        filters,
        currentUser,
        selectedIssue,
        activeTab,
        isAgm,
        userAssignedParkId,
        isAgmDirectiveModalOpen,
        isNewIssueModalOpen,
        isAddEngineerModalOpen,
        isIssueDetailModalOpen,
        isExportModalOpen,
        isCategoryManagerModalOpen,
        categories,
        addCategory,
        removeCategory,
        setActiveTab,
        setFilters: handleSetFilters,
        resetFilters,
        setCurrentUser,
        setSelectedIssue,
        openAgmDirectiveModal,
        closeAgmDirectiveModal,
        openNewIssueModal,
        closeNewIssueModal,
        openAddEngineerModal,
        closeAddEngineerModal,
        openIssueDetailModal,
        closeIssueDetailModal,
        openExportModal,
        closeExportModal,
        openCategoryManagerModal,
        closeCategoryManagerModal,
        addEngineer,
        createIssue,
        pickIssueAndIssueDirective,
        addWorkLog,
        completeIssue,
        reopenIssue,
        resetToFactoryData,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
};

export const usePortal = () => {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error('usePortal must be used within a PortalProvider');
  }
  return context;
};
