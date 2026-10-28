export type UserRole = "agent" | "ADMIN";

export interface UserProfile {
  fullName: string;
  username: string;
  role: UserRole;
  team: string; // Dynamic team name
  status?: "active" | "suspended";
  isSimulation?: boolean;
  accrued_leave?: number;
  accruedLeaveDays?: number;
  accruedMonths?: string[];
  lastAccrualMonth?: string;
  accrualStartMonth?: string;
}

export * from "./utils/dateUtils";

export interface Team {
  teamId: string;
  name: string;
  teamLead?: string;
  archived: boolean;
  maxLeavePerDay: number;
  membersCount?: number;
  createdAt?: string;
}

export type TeamInfo = Team;

export interface Role {
  roleId: string;
  name: string;
  description: string;
  permissions: string[];
}

export type LeaveStatus = "booked" | "cancelled" | "approved" | "pending" | "rejected" | "denied";

export interface LeaveRequest {
  requestId: string;
  username: string; // applicant username
  fullName?: string;
  leaveType?: string;
  team: string; // team of applicant
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dates: string[]; // Authoritative discrete date list: exactly 1 date per individual leave request
  totalDays: number;
  status: LeaveStatus;
  reason?: string;
  createdAt: string; // ISO string
  cancelledAt?: string;
  accrualDeducted?: boolean;
  deductedDays?: number;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  responseComment?: string;
}

export interface TeamAvailability {
  teamName: string;
  maxLeavePerDay: number; // default 3
  membersCount: number;
  teamLead?: string;
}

export interface Notification {
  notificationId: string;
  recipient: string; // username
  message: string;
  timestamp: string; // ISO string
  unread: boolean;
  type?: 'success' | 'alert' | 'info' | 'critical';
}

export interface AuditLog {
  logId: string;
  adminId?: string;
  adminName?: string;
  username: string; // Acting user or affected user
  targetUser?: string;
  action: string;
  previousValues?: string;
  newValues?: string;
  details: string;
  timestamp: string; // ISO string
  ipAddress?: string;
  deviceInfo?: string;
}

export interface ExportRecord {
  exportId: string;
  performedBy: string;
  year: number;
  month: number;
  monthName: string;
  format: "CSV" | "XLSX";
  recordCount: number;
  totalApprovedDays: number;
  timestamp: string; // ISO string
  status: "success" | "failed";
}

export interface GoogleSheetsSyncConfig {
  enabled: boolean;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  title: string;
  lastSyncedAt: string | null;
  status: "connected" | "syncing" | "error" | "disconnected" | "ready";
  lastErrorMessage: string | null;
  syncedMonthsCount: number;
  totalSyncedCells: number;
  autoSync: boolean;
  userEmail?: string | null;
}

export interface GoogleSheetsSyncLog {
  logId: string;
  action: "CREATE_SHEET" | "UPDATE_BOOKING" | "CANCEL_BOOKING" | "ADD_EMPLOYEE" | "FULL_SYNC" | "CREATE_MONTH";
  monthName: string;
  year: number;
  username?: string;
  affectedDates?: string[];
  affectedCells?: string[];
  details: string;
  timestamp: string;
  status: "success" | "retry" | "failed";
  error?: string;
}

// Convert "YYYY-MM-DD" style dates into verbal readable format with name of weekday attached
export function formatDateToWords(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

// Generate all individual date YYYY-MM-DD strings between startDate and endDate (inclusive)
export function getDatesInRange(startDate: string, endDate: string): string[] {
  if (!startDate) return [];
  if (!endDate) return [startDate];
  const dates: string[] = [];
  const start = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return [startDate];
  }
  const current = new Date(start);
  while (current <= end) {
    const yyyy = current.getUTCFullYear();
    const mm = String(current.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(current.getUTCDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export type BookingWindowStatus = "CLOSED" | "SCHEDULED" | "OPEN";

export interface BookingWindow {
  year: number;
  month: number;
  monthName: string;
  isOpen: boolean;
  status: BookingWindowStatus;
  scheduledOpenTime?: string | null;
}

export interface CountdownResult {
  isExpired: boolean;
  text: string;
  shortText: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMsRemaining: number;
}

export function formatCountdown(targetTimeIso?: string | null, currentTimeMs: number = Date.now()): CountdownResult {
  if (!targetTimeIso) {
    return { isExpired: true, text: "0m 0s", shortText: "0m", days: 0, hours: 0, minutes: 0, seconds: 0, totalMsRemaining: 0 };
  }
  const targetMs = new Date(targetTimeIso).getTime();
  const diffMs = targetMs - currentTimeMs;

  if (isNaN(targetMs) || diffMs <= 0) {
    return { isExpired: true, text: "0m 0s", shortText: "0m", days: 0, hours: 0, minutes: 0, seconds: 0, totalMsRemaining: 0 };
  }

  const seconds = Math.floor((diffMs / 1000) % 60);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const parts: string[] = [];
  const shortParts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
    shortParts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
    shortParts.push(`${hours}h`);
  }
  parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  if (shortParts.length === 0) {
    shortParts.push(`${minutes}m`);
  }

  return {
    isExpired: false,
    text: parts.join(" "),
    shortText: shortParts.join(" "),
    days,
    hours,
    minutes,
    seconds,
    totalMsRemaining: diffMs
  };
}

export function normalizeTeamName(t: string | undefined): string {
  if (!t) return "";
  const cleaned = t.trim().toLowerCase().replace(/^team\s+/, "");
  if (cleaned.startsWith("fausti")) return "faustina";
  return cleaned;
}

export function areTeamsMatching(t1: string | undefined, t2: string | undefined): boolean {
  const n1 = normalizeTeamName(t1);
  const n2 = normalizeTeamName(t2);
  if (!n1 || !n2 || n1 === "none" || n2 === "none" || n1 === "unassigned" || n2 === "unassigned") return false;
  return n1 === n2;
}


