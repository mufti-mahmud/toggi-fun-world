export interface Ride {
  id: number;
  name: string;
  floor: string;
  imageUrl?: string;
  capacity?: number;
  status?: 'active' | 'maintenance' | 'closed';
  minHeight?: string;
  notes?: string;
}

export interface RideWithCount extends Ride {
  count: number;
  packageCount?: number;
  ticketCount?: number;
}

export interface Operator {
  id: number;
  name: string;
  phone?: string;
  role?: string;
  active?: boolean;
  notes?: string;
}

export interface Counter {
  id: number;
  name: string;
  type?: string;
  location?: string;
  active?: boolean;
  price?: number;
  ticketPrice?: number;
  counterNumber?: string | number;
}

export interface CounterWithSales extends Counter {
  sales: number;
}

export interface PackageItem {
  id: string;
  name: string;
  price: number;
  category?: string;
  description?: string;
  active?: boolean;
}

export interface SingleGnrRide {
  id: string | number;
  rideName: string;
  price: number;
  category?: string;
  floor?: string;
}

export interface SingleGnrSaleItem {
  id?: string;
  rideName: string;
  unitPrice: number;
  count: number;
  discount?: string;
  totalAmount?: number;
}

export interface StaffRoleDefinition {
  id: string;
  name: string;
  department: 'operations' | 'sales' | 'maintenance' | 'management' | 'general';
  description?: string;
  isSystem?: boolean;
  loginRole?: string;
  enabledForLogin?: boolean;
  badge?: string;
  color?: string;
}

export interface CustomTechnicalCategory {
  id: string;
  name: string;
  shortName: string;
  code: string;
  description: string;
  subsystemExamples?: string;
  colorTheme?: 'cyan' | 'amber' | 'blue' | 'indigo' | 'rose' | 'purple' | 'teal' | 'emerald';
  iconName?: string;
  keywords: string[];
}

export interface AppConfig {
  appName: string;
  appSubtitle?: string;
  appLogo: string | null;
  loginLeftLogo?: string | null;
  loginLeftTitle?: string;
  loginLeftSubtitle?: string;
  loginRightLogo?: string | null;
  loginRightTitle?: string;
  loginRightSubtitle?: string;
  orgName?: string;
  devByLabel?: string;
  devByName?: string;
  devByTitle?: string;
  currency?: string;
  totalGuestsLabel?: string;
  totalTicketSalesLabel?: string;
  loginHeading?: string;
  loginSubheading?: string;
  announcementText?: string;
  managementPassword?: string;
  adminPassword?: string;
  operationOfficerPassword?: string;
  maintenancePassword?: string;
  maintenanceKpiUser?: string;
  maintenanceKpiPassword?: string;
  infoDeskUser?: string;
  infoDeskPassword?: string;
  infoDeskEditPassword?: string;
  infoDeskAddPassword?: string;
  informationDeskUser?: string;
  informationDeskPassword?: string;
  cxPassword?: string;
  githubUrl?: string;
  cutoffHour?: number;
  themeColor?: string;
  activeOperationalDate?: string;
  activeView?: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  cycleIntervalMonths?: number;
  lastBackupDate?: string;
  lastCycleResetDate?: string;
  roles?: StaffRoleDefinition[];
  hiddenLoginRoles?: string[];
  floors?: string[];
  singleGnrRides?: SingleGnrRide[];
  maintenanceCategories?: CustomTechnicalCategory[];
  customTechnicalCategories?: CustomTechnicalCategory[];
  leadershipProfiles?: Array<{
    id: string;
    name: string;
    designation: string;
    organization: string;
    avatarUrl: string;
    roleBadge?: string;
  }>;
  managementNotes?: Record<string, ManagementSummaryNotes>;
}

export interface StaffCredential {
  password: string;
  recoveryPin: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  date: string;
  operatorId: number;
  attendedBriefing: boolean;
  briefingTime: string | null;
}

export interface ManagementNoteItem {
  id: string;
  text: string;
  status?: 'pending' | 'approved' | 'rejected' | 'completed' | 'in-progress' | 'urgent';
  addedAt?: string;
  addedBy?: string;
  floor?: string;
}

export interface ManagementSummaryNotes {
  sprRequired?: string;
  noteApproval?: string;
  others?: string;
  sprList?: (string | ManagementNoteItem)[];
  noteApprovalList?: (string | ManagementNoteItem)[];
  othersList?: (string | ManagementNoteItem)[];
  operationsNotes?: string;
  operationsNotesList?: (string | ManagementNoteItem)[];
  salesNotes?: string;
  salesNotesList?: (string | ManagementNoteItem)[];
  operationalSummary?: {
    startDate?: string;
    endDate?: string;
    totalGuestsInRange?: number;
    packageEntriesInRange?: number;
    ticketEntriesInRange?: number;
    selectedGameId?: string;
    savedAt?: string;
    savedBy?: string;
  };
  updatedAt?: string;
  updatedBy?: string;
}

export interface AttendanceData {
  [date: string]: {
    [operatorId: number]: Omit<AttendanceRecord, 'date' | 'operatorId'>;
  };
}

export interface HistoryRecord {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export interface PackageSalesRecord {
  date: string;
  personnelId: number;
  total?: number;
  packageDiscounts?: Record<string, string>;
  otherSales?: Array<{ 
    category: string; 
    amount: number; 
    baseAmount?: number;
    discount?: string;
    description?: string; 
    customName?: string;
    count?: number;
    unitPrice?: number;
  }>;
  packages?: Record<string, number>;
  singleGnrSales?: SingleGnrSaleItem[];
}

export interface PackageSalesData {
  [date: string]: {
    [personnelId: number]: Omit<PackageSalesRecord, 'date' | 'personnelId'>;
  };
}

export interface MaintenanceTicket {
  id: string;
  date: string;
  rideId: number;
  rideName: string;
  floor?: string;
  problem: string;
  status: 'reported' | 'in-progress' | 'solved' | 'pending-approval';
  reportedById: number;
  reportedByName: string;
  reportedByRole?: string;
  source?: 'operator' | 'cx' | 'counter' | string;
  feedbackCategory?: string;
  priority?: 'normal' | 'high' | 'urgent';
  guestDetails?: string;
  reportedAt: string;
  targetDepartment?: 'both' | 'operation-officer' | 'sales-officer' | 'all' | string;
  solvedByRole?: string;
  assignedToId?: number;
  assignedToName?: string;
  assignedToPhone?: string;
  helperIds?: number[];
  helperNames?: string[];
  inProgressAt?: string;
  solvedAt?: string;
  resolutionNotes?: string;
  solutionImageUrl?: string;
  photoUrl?: string;
  photos?: string[];
  whatsappGroup?: string;
  whatsappChatId?: string;
  whatsappMessageId?: string;
  updatedAt?: string;
  isExplicitReopen?: boolean;
}

export interface RidePreCheckRecord {
  rideId: number;
  rideName: string;
  floor?: string;
  date: string;
  status: 'pending' | 'in-progress' | 'completed' | 'flagged';
  srTechnicianId?: number | string;
  srTechnicianName?: string;
  requiredTimeMinutes?: number;
  checklist?: Record<string, boolean>;
  notes?: string;
  completedAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AssignmentLockRecord {
  locked: boolean;
  lockedAt?: string;
  unlockedAt?: string;
  unlockedBy?: string;
  reason?: string;
}

export interface ManagementCounterBreakdown {
  counterName: string; // e.g. 'Level 10', 'Level 8', 'Level 9', 'Level 11'
  individualSales: number; // e.g. 22650
  kiddoPackRatio: number; // e.g. 1100
  xtremePackRatio: number; // e.g. 10500
  totalRevenue: number; // e.g. 34250
}

export interface ManagementWhatsAppReport {
  date: string; // 'YYYY-MM-DD'
  timestamp: string; // ISO string
  rawMessage: string;
  senderName: string;
  senderPhone?: string;
  groupName: string; // 'TFW Management Team'
  
  // Overall Sales & Revenue
  salesAndRevenue: {
    toggiKiddoSale: number;
    toggiXtremeSale: number;
    toggiVipConciergeSale: number;
    entryTicketSale: number;
    totalFootFall: number;
    discount: number;
    totalRevenue: number;
    kiddoPackageSold?: number;
    xtremePackageSold?: number;
    notes?: string;
  };

  // Counter & Cashier Breakdown
  counterBreakdown: ManagementCounterBreakdown[];
}

