export type ParkId = 'bashundhara-central' | 'toggi-fun-world';

export interface AmusementPark {
  id: ParkId;
  name: string;
  shortLocation: string;
  image: string;
  openHours?: string;
  leadSuperintendent?: string;
}

export type IssueStatus = 'Pending Directive' | 'In Progress' | 'Completed';

export type IssueSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type IssueCategory = string;

export interface WorkLogEntry {
  id: string;
  author: string;
  role: string;
  timestamp: string;
  note: string;
  isAgm?: boolean;
}

export interface SafetySignOff {
  verifiedBy: string;
  signedAt: string;
  testCyclesCompleted: number;
  clearanceGranted: boolean;
  notes: string;
}

export interface ParkIssue {
  id: string;
  parkId: ParkId;
  parkName: string;
  rideName: string;
  title: string;
  description: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: IssueStatus;
  
  // Reported by
  reportedByEngineerId: string;
  reportedByEngineerName: string;
  reportedAt: string;
  diagnosticCode?: string;
  suggestedAction?: string;

  // Picked & Directives by AGM
  pickedByAgmAt?: string;
  agmDirective?: string; // "comments what have to do which will be in-progress state"
  agmDirectiveAuthor?: string;
  targetResolutionTime?: string;
  assignedLeadEngineerId?: string;
  assignedLeadEngineerName?: string;

  // Real-time AGM Directive & Q&A Response tracking
  hasAgmAnswer?: boolean;
  latestAgmAnswer?: string;
  latestAgmAnswerAuthor?: string;
  latestAgmAnswerAt?: string;

  // Progress tracking
  inProgressAt?: string;
  workLogs: WorkLogEntry[];

  // Completion
  completedAt?: string;
  completedByEngineerId?: string;
  completedByEngineerName?: string;
  resolutionSummary?: string;
  safetySignOff?: SafetySignOff;
}

export interface LeadEngineer {
  id: string;
  name: string;
  parkId: ParkId;
  role: string;
  specialty: IssueCategory;
  badgeNumber: string;
  email: string;
  radioChannel: string;
  phone: string;
  shift: 'Morning Shift (06:00 - 15:00)' | 'Evening Shift (14:30 - 23:30)' | 'Night Overhaul (23:00 - 07:00)';
  status: 'On Duty' | 'Standby' | 'Off Duty';
  certifications: string[];
  joinedDate: string;
}

export interface IssueFilterState {
  searchQuery: string;
  parkId: 'all' | ParkId;
  status: 'all' | IssueStatus;
  severity: 'all' | IssueSeverity;
  category: 'all' | IssueCategory;
  engineerId: 'all' | string;
  sortBy: 'newest' | 'oldest' | 'severity' | 'rideName';
}
