import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { 
  triggerGoogleSheetsSync, 
  setGoogleOAuthToken, 
  getGoogleOAuthToken, 
  getGoogleUserEmail,
  MONTH_NAMES,
  getDaysInMonth 
} from "./server/googleSheetsSync";
import {
  isWeekendDate,
  isWeekdayDate,
  getDatesInRange,
  parseCalendarDate
} from "./src/utils/dateUtils";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini SDK with telemetry header
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (geminiApiKey) {
  try {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Gemini API:", err);
  }
} else {
  console.log("No GEMINI_API_KEY configuration found. Falling back to local heuristics AI engine.");
}

const DATA_FILE = path.join(process.cwd(), "data_store_real.json");

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

const defaultTeams = [
  { teamId: "team-1", name: "Team Ernestina", teamLead: "Unassigned", archived: false, maxLeavePerDay: 3, membersCount: 0, createdAt: "2026-01-01T00:00:00Z" },
  { teamId: "team-2", name: "Team Faustina", teamLead: "Unassigned", archived: false, maxLeavePerDay: 3, membersCount: 0, createdAt: "2026-01-01T00:00:00Z" },
  { teamId: "team-3", name: "Team Bernice", teamLead: "Unassigned", archived: false, maxLeavePerDay: 3, membersCount: 0, createdAt: "2026-01-01T00:00:00Z" },
  { teamId: "team-4", name: "Team Precious", teamLead: "Unassigned", archived: false, maxLeavePerDay: 3, membersCount: 0, createdAt: "2026-01-01T00:00:00Z" }
];

const defaultRoles = [
  { roleId: "ADMIN", name: "Administrator", description: "Full administrative, user management, booking window control, and system configuration", permissions: ["manage_users", "manage_teams", "manage_roles", "view_audit_logs", "export_reports", "approve_leaves", "override_balances"] },
  { roleId: "agent", name: "Agent", description: "Standard agent account for filing and managing personal leave requests within open booking windows", permissions: ["submit_leave", "view_own_balance"] }
];

const defaultBookingWindows = [
  { year: 2026, month: 0, monthName: "January", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 1, monthName: "February", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 2, monthName: "March", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 3, monthName: "April", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 4, monthName: "May", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 5, monthName: "June", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 6, monthName: "July", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 7, monthName: "August", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 8, monthName: "September", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 9, monthName: "October", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 10, monthName: "November", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
  { year: 2026, month: 11, monthName: "December", isOpen: false, status: "CLOSED", scheduledOpenTime: null },
];

const initialRealData = {
  currentMonthIndex: 4,
  currentYear: 2026,
  teams: defaultTeams,
  roles: defaultRoles,
  booking_windows: defaultBookingWindows,
  export_history: [],
  sheets_sync_config: {
    enabled: true,
    spreadsheetId: "1adwords_live_leave_roster_2026_sync",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1adwords_live_leave_roster_2026_sync/edit",
    title: "ADWORDS Master Leave Roster 2026",
    lastSyncedAt: new Date().toISOString(),
    status: "connected",
    lastErrorMessage: null,
    syncedMonthsCount: 12,
    totalSyncedCells: 0,
    autoSync: true,
    userEmail: "ops-manager@adwords.system"
  },
  sheets_sync_logs: [
    {
      logId: "sync-init-1",
      action: "FULL_SYNC",
      monthName: "All Months",
      year: 2026,
      username: "SYSTEM",
      affectedDates: [],
      affectedCells: ["All Monthly Worksheets (12 Months)"],
      details: "Initial Google Sheets automatic synchronization connection established.",
      timestamp: new Date().toISOString(),
      status: "success"
    }
  ],
  scheduled_timers: [],
  users: {
    "ADWORDSADMIN": { 
      fullName: "System Administrator", 
      username: "ADWORDSADMIN", 
      role: "ADMIN", 
      team: "none", 
      teamLead: "Unassigned", 
      status: "active", 
      forcePasswordChange: false, 
      accrued_leave: 15.0, 
      used_leave: 0.0, 
      previous_denials: 0, 
      recent_approved_requests: 0, 
      peak_day_usage: 0, 
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "araba": {
      fullName: "Araba",
      username: "araba",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "ernest": {
      fullName: "Ernest",
      username: "ernest",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "justina": {
      fullName: "Justina",
      username: "justina",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "ebenezer": {
      fullName: "Ebenezer",
      username: "ebenezer",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "martinson": {
      fullName: "Martinson",
      username: "martinson",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "jeserenne": {
      fullName: "Jeserenne",
      username: "jeserenne",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "victoria": {
      fullName: "Victoria",
      username: "victoria",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "lydia": {
      fullName: "Lydia",
      username: "lydia",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "bertha": {
      fullName: "Bertha",
      username: "bertha",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "charlse": {
      fullName: "Charlse",
      username: "charlse",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "desmond": {
      fullName: "Desmond Debrah",
      username: "desmond",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "pricilla": {
      fullName: "Pricilla Antwi",
      username: "pricilla",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    },
    "winfred": {
      fullName: "Winfred",
      username: "winfred",
      role: "agent",
      team: "Unassigned",
      teamLead: "Unassigned",
      status: "active",
      forcePasswordChange: false,
      accrued_leave: 15.0,
      used_leave: 0.0,
      previous_denials: 0,
      recent_approved_requests: 0,
      peak_day_usage: 0,
      isNewUser: false,
      accruedLeaveDays: 15.0
    }
  },
  leave_requests: [],
  notifications: [
    {
      notificationId: "sys-prod-init",
      recipient: "ADWORDSADMIN",
      message: "AdWords Production Environment Initialized. System Administrator account ready.",
      timestamp: "2026-09-18T00:00:00.000Z",
      unread: true,
      type: "info"
    }
  ],
  audit_logs: [
    {
      logId: "prod-init-log",
      username: "SYSTEM",
      action: "PRODUCTION_INITIALIZATION",
      details: "AdWords Production database initialized. Sole administrator ADWORDSADMIN configured.",
      timestamp: "2026-09-18T00:00:00.000Z"
    }
  ]
};

// Production Data Store helper function: always loads production data store
function getFilePath(_req?: any): string {
  return DATA_FILE;
}

function formatYearMonth(year: number, month1To12: number): string {
  return `${year}-${String(month1To12).padStart(2, "0")}`;
}

function getMonthsBetween(startYearMonth: string, endYearMonth: string): string[] {
  const [startYear, startMonth] = startYearMonth.split("-").map(Number);
  const [endYear, endMonth] = endYearMonth.split("-").map(Number);
  const months: string[] = [];
  let y = startYear;
  let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    months.push(formatYearMonth(y, m));
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

interface ProcessAccrualOptions {
  isSimulation?: boolean;
  targetYear?: number;
  targetMonth?: number; // 1 to 12
  targetMonthStr?: string; // "YYYY-MM"
  specificMonth?: string; // "YYYY-MM"
  actingUser?: string;
}

function processMonthlyAccruals(data: any, options: ProcessAccrualOptions = {}) {
  if (!data || !data.users) {
    return { applied: false, totalDaysAdded: 0, updatedCount: 0, monthsProcessed: [] as string[], agentSummaries: [] as any[] };
  }

  // Determine effective target month and year
  let effectiveYear: number;
  let effectiveMonth: number; // 1 to 12

  if (options.targetYear && options.targetMonth) {
    effectiveYear = options.targetYear;
    effectiveMonth = options.targetMonth;
  } else if (options.targetMonthStr) {
    const parts = options.targetMonthStr.split("-").map(Number);
    effectiveYear = parts[0];
    effectiveMonth = parts[1];
  } else if (options.isSimulation) {
    effectiveYear = data.currentYear || 2026;
    effectiveMonth = (data.currentMonthIndex !== undefined ? data.currentMonthIndex : 4) + 1; // 0-indexed to 1-12
  } else {
    const now = new Date();
    effectiveYear = now.getFullYear();
    effectiveMonth = now.getMonth() + 1;
  }

  const effectiveEndMonthStr = formatYearMonth(effectiveYear, effectiveMonth);

  const agentSummaries: any[] = [];
  let totalDaysAdded = 0;
  let updatedCount = 0;
  const globalMonthsProcessed = new Set<string>();

  for (const [username, user] of Object.entries<any>(data.users)) {
    // Only agents accrue monthly leave (Admins do not accrue automatically)
    if (user.role !== "agent") continue;

    const currentBal = typeof user.accruedLeaveDays === "number"
      ? user.accruedLeaveDays
      : (typeof user.accrued_leave === "number" ? user.accrued_leave : 0);

    // Ensure user.accruedMonths is an array
    if (!Array.isArray(user.accruedMonths)) {
      user.accruedMonths = [];
      const simMonth = data.currentMonthIndex !== undefined ? data.currentMonthIndex + 1 : 5;
      const count = options.isSimulation ? simMonth : Math.min(12, Math.max(1, Math.round(currentBal / 1.25)));
      for (let m = 1; m <= count; m++) {
        user.accruedMonths.push(formatYearMonth(2026, m));
      }
      user.lastAccrualMonth = user.accruedMonths[user.accruedMonths.length - 1] || "2026-05";
      user.accrualStartMonth = "2026-01";
    }

    const startMonthStr = user.accrualStartMonth || "2026-01";

    // Determine eligible candidate months
    let candidateMonths: string[] = [];
    if (options.specificMonth) {
      candidateMonths = [options.specificMonth];
    } else {
      candidateMonths = getMonthsBetween(startMonthStr, effectiveEndMonthStr);
    }

    // Filter to only unaccrued months (strict idempotency check)
    const unaccrued = candidateMonths.filter((m) => !user.accruedMonths.includes(m));

    if (unaccrued.length > 0) {
      const addedForUser = parseFloat((unaccrued.length * 1.25).toFixed(2));
      const previousBalance = currentBal;
      const newBalance = parseFloat((currentBal + addedForUser).toFixed(2));

      user.accruedMonths.push(...unaccrued);
      user.accruedLeaveDays = newBalance;
      user.accrued_leave = newBalance;
      user.lastAccrualMonth = unaccrued[unaccrued.length - 1];

      unaccrued.forEach((m) => globalMonthsProcessed.add(m));
      totalDaysAdded = parseFloat((totalDaysAdded + addedForUser).toFixed(2));
      updatedCount++;

      agentSummaries.push({
        username,
        fullName: user.fullName || username,
        previousBalance,
        newBalance,
        daysAdded: addedForUser,
        accruedMonths: [...user.accruedMonths],
        newlyAccrued: unaccrued,
      });

      if (Array.isArray(data.audit_logs)) {
        data.audit_logs.unshift({
          logId: `accrual-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          username: options.actingUser || "SYSTEM_ACCRUAL",
          targetUser: username,
          action: "MONTHLY_LEAVE_ACCRUED",
          details: `Automatic monthly leave accrual: added +${addedForUser} day(s) for month(s) ${unaccrued.join(", ")} (1.25 days/mo). Balance: ${previousBalance} -> ${newBalance} accrued days.`,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  return {
    applied: updatedCount > 0,
    totalDaysAdded,
    updatedCount,
    monthsProcessed: Array.from(globalMonthsProcessed),
    agentSummaries,
  };
}

function loadData(_req?: any) {
  const file = DATA_FILE;
  const init = initialRealData;

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(init, null, 2));
    return JSON.parse(JSON.stringify(init)); // deep copy
  }
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    let modified = false;
    if (parsed && parsed.users) {
      // Ensure ADWORDSADMIN is always present
      if (!parsed.users["ADWORDSADMIN"]) {
        parsed.users["ADWORDSADMIN"] = { 
          fullName: "System Administrator", 
          username: "ADWORDSADMIN", 
          role: "ADMIN", 
          team: "none", 
          teamLead: "Unassigned", 
          status: "active", 
          forcePasswordChange: false, 
          accrued_leave: 15.0, 
          used_leave: 0.0, 
          previous_denials: 0, 
          recent_approved_requests: 0, 
          peak_day_usage: 0, 
          isNewUser: false,
          accruedLeaveDays: 15.0 
        };
        modified = true;
      }
      
      // Ensure all standard production agents are populated if missing
      for (const [agentUsername, agentRecord] of Object.entries<any>(initialRealData.users)) {
        if (!parsed.users[agentUsername]) {
          parsed.users[agentUsername] = JSON.parse(JSON.stringify(agentRecord));
          modified = true;
        }
      }

      // Guarantee only valid roles exist in users: ADMIN and agent, and normalize leave balances
      for (const [_uname, u] of Object.entries<any>(parsed.users)) {
        if (u.role !== "ADMIN" && u.role !== "agent") {
          u.role = "agent";
          modified = true;
        }
        const currentBal = typeof u.accruedLeaveDays === "number"
          ? u.accruedLeaveDays
          : (typeof u.accrued_leave === "number" ? u.accrued_leave : 0);
        if (u.accrued_leave !== currentBal || u.accruedLeaveDays !== currentBal) {
          u.accrued_leave = currentBal;
          u.accruedLeaveDays = currentBal;
          modified = true;
        }
        // Initialize accrual tracking array for agents
        if (u.role === "agent") {
          if (!Array.isArray(u.accruedMonths)) {
            u.accruedMonths = [];
            const count = Math.min(12, Math.max(1, Math.round(currentBal / 1.25)));
            for (let m = 1; m <= count; m++) {
              u.accruedMonths.push(formatYearMonth(2026, m));
            }
            u.lastAccrualMonth = u.accruedMonths[u.accruedMonths.length - 1] || "2026-05";
            u.accrualStartMonth = "2026-01";
            modified = true;
          }
        }
      }
      // Automatic monthly accrual check (strictly idempotent across missed eligible months)
      const accrualRes = processMonthlyAccruals(parsed, { isSimulation: false });
      if (accrualRes.applied) {
        modified = true;
      }
    }
    // Guarantee only 2 roles in system roles array: ADMIN and agent
    if (parsed && parsed.roles && Array.isArray(parsed.roles)) {
      const filtered = parsed.roles.filter((r: any) => r.roleId === "ADMIN" || r.roleId === "agent");
      if (filtered.length !== parsed.roles.length) {
        parsed.roles = filtered;
        modified = true;
      }
    }
    if (parsed && (!parsed.booking_windows || !Array.isArray(parsed.booking_windows))) {
      parsed.booking_windows = defaultBookingWindows;
      modified = true;
    }
    if (parsed && parsed.leave_requests && Array.isArray(parsed.leave_requests)) {
      const normalizedRequests: any[] = [];
      let hadMultiDate = false;

      for (const r of parsed.leave_requests) {
        if (r.status === "rejected") {
          r.status = "denied";
          modified = true;
        } else if (r.status === "waitlisted") {
          r.status = "pending";
          modified = true;
        }
        if (r.status === "approved" && r.accrualDeducted === undefined) {
          r.accrualDeducted = true;
          modified = true;
        } else if (r.status !== "approved" && r.accrualDeducted === undefined) {
          r.accrualDeducted = false;
          modified = true;
        }

        // Split historical multi-date request into individual one-day requests while preserving
        // agent, team, original dates, current status, relevant timestamps, and audit information.
        const itemDates: string[] = Array.isArray(r.dates) && r.dates.length > 0
          ? r.dates
          : (r.startDate && r.endDate && r.startDate !== r.endDate
              ? getDatesInRange(r.startDate, r.endDate)
              : (r.startDate ? [r.startDate] : []));

        if (itemDates.length > 1) {
          hadMultiDate = true;
          itemDates.forEach((singleDate: string, idx: number) => {
            normalizedRequests.push({
              ...r,
              requestId: `${r.requestId}-${idx}`,
              startDate: singleDate,
              endDate: singleDate,
              dates: [singleDate],
              totalDays: 1,
              deductedDays: r.accrualDeducted ? 1 : 0
            });
          });
        } else {
          normalizedRequests.push({
            ...r,
            startDate: itemDates[0] || r.startDate,
            endDate: itemDates[0] || r.endDate || r.startDate,
            dates: itemDates.length === 1 ? itemDates : (r.startDate ? [r.startDate] : []),
            totalDays: 1
          });
        }
      }

      if (hadMultiDate) {
        parsed.leave_requests = normalizedRequests;
        modified = true;
      }
    }
    if (modified) {
      fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
    }
    return parsed;
  } catch (err) {
    console.error(`Failed to parse data store ${file}, resetting to default state`, err);
    fs.writeFileSync(file, JSON.stringify(init, null, 2));
    return JSON.parse(JSON.stringify(init)); // deep copy
  }
}

function saveData(data: any, req?: any) {
  const file = getFilePath(req);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Helper to check valid date within 3-month rolling window
function getRollingWindowMonths(currentMonthIndex: number, currentYear: number) {
  const result = [];
  for (let s = 0; s < 3; s++) {
    let m = currentMonthIndex + s;
    let y = currentYear;
    if (m >= 12) {
      m = m - 12;
      y += 1;
    }
    result.push({ monthIndex: m, year: y });
  }
  return result;
}

function evaluateBookingWindowState(w: any, nowMs: number = Date.now()): {
  isOpen: boolean;
  status: "CLOSED" | "SCHEDULED" | "OPEN";
  scheduledOpenTime: string | null;
} {
  if (!w) {
    return { isOpen: false, status: "CLOSED", scheduledOpenTime: null };
  }

  // Explicit OPEN state
  if (w.status === "OPEN") {
    return { isOpen: true, status: "OPEN", scheduledOpenTime: null };
  }

  // SCHEDULED state with an opening time
  if (w.status === "SCHEDULED" || (w.scheduledOpenTime && w.status !== "CLOSED")) {
    if (w.scheduledOpenTime) {
      const targetTime = new Date(w.scheduledOpenTime).getTime();
      if (!isNaN(targetTime)) {
        if (nowMs >= targetTime) {
          // Authoritative server clock: Scheduled time has arrived or passed! Automatically OPEN!
          return { isOpen: true, status: "OPEN", scheduledOpenTime: w.scheduledOpenTime };
        } else {
          // Scheduled opening time is in the future. Remains strictly CLOSED / SCHEDULED.
          return { isOpen: false, status: "SCHEDULED", scheduledOpenTime: w.scheduledOpenTime };
        }
      }
    }
  }

  // Legacy fallback: if isOpen was explicitly true and status was not closed
  if (w.isOpen === true && !w.status && !w.scheduledOpenTime) {
    return { isOpen: true, status: "OPEN", scheduledOpenTime: null };
  }

  // Strict default: CLOSED
  return { isOpen: false, status: "CLOSED", scheduledOpenTime: null };
}

function checkAndSyncScheduledBookingWindows(data: any, nowMs: number = Date.now()): boolean {
  if (!data || !Array.isArray(data.booking_windows)) return false;
  let hasChanges = false;
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  for (const w of data.booking_windows) {
    if ((w.status === "SCHEDULED" || w.scheduledOpenTime) && w.status !== "CLOSED" && w.status !== "OPEN") {
      if (w.scheduledOpenTime) {
        const targetTime = new Date(w.scheduledOpenTime).getTime();
        if (!isNaN(targetTime) && nowMs >= targetTime) {
          w.status = "OPEN";
          w.isOpen = true;
          w.scheduledOpenTime = null;
          hasChanges = true;

          if (!data.audit_logs) data.audit_logs = [];
          data.audit_logs.unshift({
            logId: "bw-auto-" + Date.now(),
            username: "SYSTEM_TIMER",
            action: "BOOKING_WINDOW_AUTO_OPENED",
            details: `Scheduled opening timer reached for ${w.monthName || monthNames[w.month]} ${w.year}. Booking window is now OPEN for Agents.`,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  }
  return hasChanges;
}

function isDateInOpenBookingWindow(dateStr: string, bookingWindows: any[], nowMs: number = Date.now()): boolean {
  if (!dateStr) return false;
  const parts = parseCalendarDate(dateStr);
  if (!parts) return false;
  const month = parts.month - 1; // 0-indexed (0-11)
  const year = parts.year;

  // If no booking window configuration or empty: treat strictly as CLOSED
  if (!bookingWindows || !Array.isArray(bookingWindows) || bookingWindows.length === 0) {
    return false;
  }

  const match = bookingWindows.find((w: any) => Number(w.year) === year && Number(w.month) === month);
  if (!match) {
    return false; // Undefined record -> strictly CLOSED
  }

  const evaluated = evaluateBookingWindowState(match, nowMs);
  return evaluated.isOpen;
}

function isDateInRollingWindow(dateStr: string, currentMonthIndex: number, currentYear: number): boolean {
  const dateObj = new Date(dateStr + "T12:00:00Z"); // Prevent timezone offsets
  const testMonth = dateObj.getUTCMonth();
  const testYear = dateObj.getUTCFullYear();
  
  const window = getRollingWindowMonths(currentMonthIndex, currentYear);
  return window.some(w => w.monthIndex === testMonth && w.year === testYear);
}

// REST API Middleware / Endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Helper to find a user account by username, full name, or common variations
function findUserAccount(data: any, identifier: string): any | null {
  if (!data?.users || !identifier) return null;
  const raw = String(identifier).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Direct key match (case-insensitive)
  const exactKey = Object.keys(data.users).find(k => k.toLowerCase() === lower);
  if (exactKey) return data.users[exactKey];

  // 2. Full name match (case-insensitive)
  const nameMatch = Object.values<any>(data.users).find((u: any) => 
    u.fullName && u.fullName.trim().toLowerCase() === lower
  );
  if (nameMatch) return nameMatch;

  // 3. Normalized alphanumeric match (ignores spaces, periods, dashes, underscores)
  const cleanInput = lower.replace(/[^a-z0-9]/g, "");
  const normMatch = Object.values<any>(data.users).find((u: any) => {
    const cleanKey = (u.username || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanFull = (u.fullName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return cleanKey === cleanInput || cleanFull === cleanInput;
  });
  if (normMatch) return normMatch;

  // 4. Common spelling variations/aliases
  if (cleanInput === "charles") return data.users["charlse"] || null;
  if (cleanInput === "priscilla" || cleanInput === "priscillaantwi") return data.users["pricilla"] || null;
  if (cleanInput === "desmonddebrah") return data.users["desmond"] || null;

  return null;
}

// Check User Status Endpoint
app.get("/api/auth/check-status", (req, res) => {
  const username = String(req.query.username || "").trim();
  if (!username) {
    return res.status(400).json({ error: "Username required" });
  }
  const data = loadData(req);
  const user = findUserAccount(data, username);
  if (!user) {
    return res.json({ exists: false });
  }
  return res.json({
    exists: true,
    isNewUser: !!user.isNewUser,
    forcePasswordChange: !!user.forcePasswordChange,
    status: user.status || "active",
    role: user.role,
    team: user.team
  });
});

// Password Change Endpoint for Forced Password Reset or Onboarding
app.post("/api/auth/change-password", (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  if (!username || !newPassword) {
    return res.status(400).json({ error: "Username and new password are required." });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }

  const rawUsername = String(username).trim();
  const data = loadData(req);
  const user = data.users[rawUsername];

  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  // Check if account is suspended
  if (user.status === "suspended") {
    return res.status(403).json({ error: "Account suspended. Please contact administrator." });
  }

  // Verify old password if custom password was set and not forced first login
  if (user.password && !user.forcePasswordChange && !user.isNewUser && oldPassword) {
    if (user.password !== oldPassword) {
      return res.status(401).json({ error: "Current password does not match." });
    }
  }

  const prevPassState = user.forcePasswordChange ? "Force Reset" : user.isNewUser ? "Initial Setup" : "Manual Change";
  user.password = newPassword;
  user.forcePasswordChange = false;
  user.isNewUser = false;

  data.audit_logs.unshift({
    logId: "pwd-change-" + Date.now(),
    username: rawUsername,
    targetUser: rawUsername,
    action: "USER_PASSWORD_UPDATED",
    details: `Password updated successfully for account ${rawUsername} (${prevPassState}).`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({ success: true, profile: user });
});

// Active in-memory session token store for production access control
const activeSessions = new Map<string, { username: string; role: string; createdAt: number }>();

function generateSessionToken(username: string, role: string): string {
  const token = "tok_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
  activeSessions.set(token, { username, role, createdAt: Date.now() });
  return token;
}

export function getAuthenticatedUser(req: any): { username: string; role: string } | null {
  // Check Authorization Bearer header
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    const session = activeSessions.get(token);
    if (session) {
      return session;
    }
  }

  // Check X-User-Session header, query, or body
  const sessionUser = req.headers["x-user-session"] || req.headers["x-admin-user"] || req.query.session_user || req.body?.adminUser || req.body?.creator;
  if (sessionUser) {
    const username = String(sessionUser).trim();
    const isAdmin = username.toUpperCase() === "ADWORDSADMIN";
    return { username, role: isAdmin ? "ADMIN" : "agent" };
  }

  return null;
}

export function requireAdwordsAdmin(req: any, res: any, next: any) {
  const auth = getAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({ error: "Authentication required. Please sign in." });
  }

  if (auth.username.toUpperCase() !== "ADWORDSADMIN") {
    return res.status(403).json({ error: "Access denied. Administrative actions are strictly restricted to ADWORDSADMIN." });
  }

  // Double check that ADWORDSADMIN exists with ADMIN role in database
  const data = loadData(req);
  const adminProfile = data.users["ADWORDSADMIN"] || data.users["adwordsadmin"];
  if (!adminProfile || adminProfile.role !== "ADMIN") {
    return res.status(403).json({ error: "Access denied. Production admin record not found or invalid role." });
  }

  next();
}

// Authentication Endpoint (Strict Production: NO auto-provisioning, NO demo accounts)
app.post("/api/auth/login", (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const rawUsername = String(username).trim();
  const data = loadData(req);
  
  // Find user by username, full name, or common variations
  const user = findUserAccount(data, rawUsername);
  if (!user) {
    return res.status(401).json({ error: "Invalid username. Account does not exist. Please contact your administrator." });
  }

  // Check if account is suspended
  if (user.status === "suspended") {
    return res.status(403).json({ error: "Account suspended. Please contact your administrator." });
  }

  // Strict role security: ONLY ADWORDSADMIN can have role ADMIN
  if (user.username.toUpperCase() === "ADWORDSADMIN") {
    user.role = "ADMIN";
  } else if (user.role === "ADMIN") {
    user.role = "agent";
    saveData(data, req);
  }

  const token = generateSessionToken(user.username, user.role);

  return res.json({ profile: user, token, forcePasswordChange: false });
});

// Admin Add User (Passwordless - Restricted strictly to ADWORDSADMIN)
app.post("/api/admin/add-user", requireAdwordsAdmin, async (req, res) => {
  const { fullName, username, role, team, teamLead, status, creator } = req.body;
  if (!fullName || !username || !team) {
    return res.status(400).json({ error: "Full Name, username, and team are required." });
  }

  const rawUsername = String(username).trim();
  const data = loadData(req);
  
  if (data.users[rawUsername]) {
    return res.status(400).json({ error: "User with this username already exists." });
  }

  // Find team lead for selected team if not provided
  let assignedTL = teamLead;
  if (!assignedTL && data.teams) {
    const tObj = data.teams.find((t: any) => t.name === team);
    if (tObj) assignedTL = tObj.teamLead;
  }

  const assignedRole = (role === "ADMIN" || rawUsername.toLowerCase().includes("admin")) ? "ADMIN" : "agent";

  const currentSimMonth = data.currentMonthIndex !== undefined ? data.currentMonthIndex + 1 : 5;
  const currentYear = data.currentYear || 2026;
  const currentPeriodStr = formatYearMonth(currentYear, currentSimMonth);
  const initDays = req.body.initialBalance !== undefined 
    ? Number(req.body.initialBalance) 
    : (req.body.accruedLeaveDays !== undefined ? Number(req.body.accruedLeaveDays) : (assignedRole === "agent" ? 1.25 : 15.0));

  const newUser = {
    fullName: fullName.trim(),
    username: rawUsername,
    role: assignedRole,
    team: team,
    teamLead: assignedTL || "Unassigned",
    status: status || "active",
    forcePasswordChange: false,
    isNewUser: false,
    accrued_leave: initDays,
    accruedLeaveDays: initDays,
    accruedMonths: assignedRole === "agent" ? [currentPeriodStr] : [],
    accrualStartMonth: currentPeriodStr,
    lastAccrualMonth: assignedRole === "agent" ? currentPeriodStr : undefined,
    used_leave: 0.0,
    previous_denials: 0,
    recent_approved_requests: 0,
    peak_day_usage: 0
  };

  data.users[rawUsername] = newUser;

  data.audit_logs.unshift({
    logId: "admin-add-" + Date.now(),
    adminId: creator || "ADMIN",
    adminName: creator || "Administrator",
    username: creator || "ADMIN",
    targetUser: rawUsername,
    action: "USER_PROVISIONED_BY_ADMIN",
    details: `Admin provisioned user account ${rawUsername} (${fullName}, Role: ${assignedRole}, Team: ${team}).`,
    timestamp: new Date().toISOString()
  });

  // Automatically ensure new employee has their dedicated row in monthly worksheets
  await triggerGoogleSheetsSync(data, { action: "ADD_EMPLOYEE", user: newUser });

  saveData(data, req);
  res.json({ success: true, profile: newUser, users: data.users });
});

// Admin Edit User Details
app.post("/api/admin/users/edit", (req, res) => {
  const { targetUsername, username, fullName, role, team, teamLead, status, daysToAdd, newBalance, accruedLeaveDays, accrued_leave, adminUser, adminUsername } = req.body;
  const effectiveTarget = (targetUsername || username)?.trim();
  if (!effectiveTarget) {
    return res.status(400).json({ error: "Target username is required." });
  }

  const data = loadData(req);
  const user = data.users[effectiveTarget];
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const currentAccrued = typeof user.accruedLeaveDays === "number"
    ? user.accruedLeaveDays
    : (typeof user.accrued_leave === "number" ? user.accrued_leave : 0);

  const previousValues = JSON.stringify({
    fullName: user.fullName,
    role: user.role,
    team: user.team,
    teamLead: user.teamLead,
    status: user.status,
    accrued_leave: currentAccrued,
    accruedLeaveDays: currentAccrued
  });

  if (fullName !== undefined) user.fullName = fullName.trim();
  if (role !== undefined) user.role = (role === "ADMIN" ? "ADMIN" : "agent");
  if (team !== undefined) user.team = team;
  if (teamLead !== undefined) user.teamLead = teamLead;
  if (status !== undefined) user.status = status;

  // Handle accrued balance updates if provided
  if (daysToAdd !== undefined) {
    const parsedAdd = Number(daysToAdd);
    if (isNaN(parsedAdd) || parsedAdd < 0) {
      return res.status(400).json({ error: "Days to add must be zero or a positive number." });
    }
    const updated = parseFloat((currentAccrued + parsedAdd).toFixed(2));
    user.accrued_leave = updated;
    user.accruedLeaveDays = updated;
  } else if (newBalance !== undefined || accruedLeaveDays !== undefined || accrued_leave !== undefined) {
    const rawVal = newBalance !== undefined ? newBalance : (accruedLeaveDays !== undefined ? accruedLeaveDays : accrued_leave);
    const parsedVal = Number(rawVal);
    if (isNaN(parsedVal) || parsedVal < 0) {
      return res.status(400).json({ error: "Accrued leave days must be zero or a positive number." });
    }
    const updated = parseFloat(parsedVal.toFixed(2));
    user.accrued_leave = updated;
    user.accruedLeaveDays = updated;
  } else {
    // Keep them synced
    user.accrued_leave = currentAccrued;
    user.accruedLeaveDays = currentAccrued;
  }

  const newValues = JSON.stringify({
    fullName: user.fullName,
    role: user.role,
    team: user.team,
    teamLead: user.teamLead,
    status: user.status,
    accrued_leave: user.accrued_leave,
    accruedLeaveDays: user.accruedLeaveDays
  });

  const actingAdmin = adminUser || adminUsername || "ADMIN";

  data.audit_logs.unshift({
    logId: "user-edit-" + Date.now(),
    adminId: actingAdmin,
    adminName: actingAdmin,
    username: actingAdmin,
    targetUser: effectiveTarget,
    action: "USER_DETAILS_UPDATED",
    previousValues,
    newValues,
    details: `Admin updated details for user ${user.fullName} (${effectiveTarget}). Accrued balance: ${user.accrued_leave} days.`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({ success: true, profile: user, users: data.users });
});

// Admin Add Accrued Leave Days (Dedicated action)
app.post("/api/admin/users/add-accrued-leave", (req, res) => {
  const { targetUsername, username, daysToAdd, newBalance, adminUser, adminUsername } = req.body;
  const effectiveTarget = (targetUsername || username)?.trim();
  if (!effectiveTarget) {
    return res.status(400).json({ error: "Target username is required." });
  }

  const data = loadData(req);
  const user = data.users[effectiveTarget];
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const currentBalance = typeof user.accruedLeaveDays === "number"
    ? user.accruedLeaveDays
    : (typeof user.accrued_leave === "number" ? user.accrued_leave : 0);

  let updatedBalance = currentBalance;

  if (newBalance !== undefined) {
    const parsedNew = Number(newBalance);
    if (isNaN(parsedNew) || parsedNew < 0) {
      return res.status(400).json({ error: "Accrued leave balance must be zero or a positive number." });
    }
    updatedBalance = parseFloat(parsedNew.toFixed(2));
  } else if (daysToAdd !== undefined) {
    const parsedAdd = Number(daysToAdd);
    if (isNaN(parsedAdd) || parsedAdd < 0) {
      return res.status(400).json({ error: "Days to add must be zero or a positive number." });
    }
    updatedBalance = parseFloat((currentBalance + parsedAdd).toFixed(2));
  } else {
    return res.status(400).json({ error: "Either 'daysToAdd' or 'newBalance' must be provided." });
  }

  const previousBalance = currentBalance;
  user.accrued_leave = updatedBalance;
  user.accruedLeaveDays = updatedBalance;

  const actingAdmin = adminUser || adminUsername || "ADMIN";
  const addedDays = daysToAdd !== undefined ? Number(daysToAdd) : parseFloat((updatedBalance - previousBalance).toFixed(2));

  data.audit_logs.unshift({
    logId: "accrual-edit-" + Date.now(),
    adminId: actingAdmin,
    adminName: actingAdmin,
    username: actingAdmin,
    targetUser: effectiveTarget,
    action: "ACCRUED_LEAVE_UPDATED",
    previousValues: JSON.stringify({ accrued_leave: previousBalance, accruedLeaveDays: previousBalance }),
    newValues: JSON.stringify({ accrued_leave: updatedBalance, accruedLeaveDays: updatedBalance }),
    details: `Admin added ${addedDays} leave days for ${user.fullName} (${effectiveTarget}). Balance: ${previousBalance} -> ${updatedBalance} accrued days.`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({
    success: true,
    profile: user,
    currentBalance: updatedBalance,
    previousBalance,
    addedDays,
    users: data.users
  });
});

// Admin Reset Password
app.post("/api/admin/users/reset-password", (req, res) => {
  const { targetUsername, newPassword, forcePasswordChangeOnNextLogin, adminUser } = req.body;
  if (!targetUsername || !newPassword) {
    return res.status(400).json({ error: "Target username and new password required." });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }

  const data = loadData(req);
  const user = data.users[targetUsername];
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  user.password = newPassword;
  user.forcePasswordChange = forcePasswordChangeOnNextLogin !== undefined ? forcePasswordChangeOnNextLogin : true;

  data.audit_logs.unshift({
    logId: "reset-pwd-" + Date.now(),
    adminId: adminUser || "ADMIN",
    adminName: adminUser || "Administrator",
    username: adminUser || "ADMIN",
    targetUser: targetUsername,
    action: "USER_PASSWORD_RESET_BY_ADMIN",
    details: `Admin reset password for user ${targetUsername} (forcePasswordChange: ${user.forcePasswordChange}).`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({ success: true, profile: user });
});

// Admin Toggle User Status (Suspend / Reactivate)
app.post("/api/admin/users/toggle-status", (req, res) => {
  const { targetUsername, status, adminUser } = req.body;
  if (!targetUsername || !status) {
    return res.status(400).json({ error: "Target username and status ('active' | 'suspended') required." });
  }

  const data = loadData(req);
  const user = data.users[targetUsername];
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const oldStatus = user.status || "active";
  user.status = status;

  data.audit_logs.unshift({
    logId: "status-toggle-" + Date.now(),
    adminId: adminUser || "ADMIN",
    adminName: adminUser || "Administrator",
    username: adminUser || "ADMIN",
    targetUser: targetUsername,
    action: status === "suspended" ? "USER_ACCOUNT_SUSPENDED" : "USER_ACCOUNT_REACTIVATED",
    previousValues: `status: ${oldStatus}`,
    newValues: `status: ${status}`,
    details: `Admin changed account status of ${targetUsername} from ${oldStatus} to ${status}.`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({ success: true, profile: user, users: data.users });
});

// Admin Force Password Change Toggle
app.post("/api/admin/users/force-password-change", (req, res) => {
  const { targetUsername, force, adminUser } = req.body;
  if (!targetUsername) {
    return res.status(400).json({ error: "Target username is required." });
  }

  const data = loadData(req);
  const user = data.users[targetUsername];
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  user.forcePasswordChange = force !== undefined ? force : true;

  data.audit_logs.unshift({
    logId: "force-pwd-" + Date.now(),
    adminId: adminUser || "ADMIN",
    adminName: adminUser || "Administrator",
    username: adminUser || "ADMIN",
    targetUser: targetUsername,
    action: "FORCE_PASSWORD_CHANGE_TOGGLED",
    details: `Admin set forcePasswordChange = ${user.forcePasswordChange} for ${targetUsername}.`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({ success: true, profile: user });
});

// Teams API (GET, POST Create, PUT Rename/Update, POST Archive, POST Assign Lead)
app.get("/api/admin/teams", (req, res) => {
  const data = loadData(req);
  res.json({ teams: data.teams || defaultTeams });
});

app.post("/api/admin/teams", (req, res) => {
  const { name, teamLead, maxLeavePerDay, adminUser } = req.body;
  if (!name) return res.status(400).json({ error: "Team name is required." });

  const data = loadData(req);
  if (!data.teams) data.teams = [...defaultTeams];

  if (data.teams.some((t: any) => t.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: "A team with this name already exists." });
  }

  const newTeam = {
    teamId: "team-" + Date.now(),
    name: name.trim(),
    teamLead: teamLead || "Unassigned",
    archived: false,
    maxLeavePerDay: maxLeavePerDay || 3,
    membersCount: 0,
    createdAt: new Date().toISOString()
  };

  data.teams.push(newTeam);

  data.audit_logs.unshift({
    logId: "team-create-" + Date.now(),
    adminId: adminUser || "ADMIN",
    adminName: adminUser || "Administrator",
    username: adminUser || "ADMIN",
    action: "TEAM_CREATED",
    details: `Admin created new team '${newTeam.name}' with Team Lead '${newTeam.teamLead}'.`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({ success: true, team: newTeam, teams: data.teams });
});

app.put("/api/admin/teams", (req, res) => {
  const { teamId, name, teamLead, maxLeavePerDay, adminUser } = req.body;
  if (!teamId) return res.status(400).json({ error: "Team ID required." });

  const data = loadData(req);
  if (!data.teams) data.teams = [...defaultTeams];

  const team = data.teams.find((t: any) => t.teamId === teamId);
  if (!team) return res.status(404).json({ error: "Team not found." });

  const oldName = team.name;
  const newName = name ? name.trim() : team.name;
  const newLead = teamLead !== undefined ? teamLead : team.teamLead;

  team.name = newName;
  team.teamLead = newLead;
  if (maxLeavePerDay !== undefined) team.maxLeavePerDay = maxLeavePerDay;

  // Cascade updates if team name changed!
  if (oldName !== newName) {
    Object.keys(data.users).forEach(un => {
      if (data.users[un].team === oldName) {
        data.users[un].team = newName;
      }
    });
    data.leave_requests.forEach((lr: any) => {
      if (lr.team === oldName) {
        lr.team = newName;
      }
    });
  }

  // Update team leads for user members if team lead changed
  if (team.teamLead) {
    Object.keys(data.users).forEach(un => {
      if (data.users[un].team === newName) {
        data.users[un].teamLead = team.teamLead;
      }
    });
  }

  data.audit_logs.unshift({
    logId: "team-update-" + Date.now(),
    adminId: adminUser || "ADMIN",
    adminName: adminUser || "Administrator",
    username: adminUser || "ADMIN",
    action: "TEAM_UPDATED",
    details: `Admin updated team '${oldName}' -> Name: '${newName}', Lead: '${newLead}'. Cascaded updates across all user rosters & requests.`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({ success: true, team, teams: data.teams });
});

app.post("/api/admin/teams/archive", (req, res) => {
  const { teamId, archived, adminUser } = req.body;
  if (!teamId) return res.status(400).json({ error: "Team ID required." });

  const data = loadData(req);
  if (!data.teams) data.teams = [...defaultTeams];

  const team = data.teams.find((t: any) => t.teamId === teamId);
  if (!team) return res.status(404).json({ error: "Team not found." });

  team.archived = archived !== undefined ? archived : true;

  data.audit_logs.unshift({
    logId: "team-archive-" + Date.now(),
    adminId: adminUser || "ADMIN",
    adminName: adminUser || "Administrator",
    username: adminUser || "ADMIN",
    action: team.archived ? "TEAM_ARCHIVED" : "TEAM_REACTIVATED",
    details: `Admin ${team.archived ? "archived" : "reactivated"} team '${team.name}'.`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({ success: true, team, teams: data.teams });
});

// Roles API (Strictly 2 roles: ADMIN and agent)
app.get("/api/admin/roles", (req, res) => {
  const data = loadData(req);
  const roles = (data.roles || defaultRoles).filter((r: any) => r.roleId === "ADMIN" || r.roleId === "agent");
  res.json({ roles });
});

app.put("/api/admin/roles", (req, res) => {
  const { roleId, name, description, permissions, adminUser } = req.body;
  if (!roleId) return res.status(400).json({ error: "Role ID required." });

  const data = loadData(req);
  if (!data.roles) data.roles = [...defaultRoles];

  const role = data.roles.find((r: any) => r.roleId === roleId);
  if (!role) return res.status(404).json({ error: "Role not found." });

  if (name) role.name = name;
  if (description) role.description = description;
  if (permissions) role.permissions = permissions;

  data.audit_logs.unshift({
    logId: "role-update-" + Date.now(),
    adminId: adminUser || "ADMIN",
    adminName: adminUser || "Administrator",
    username: adminUser || "ADMIN",
    action: "ROLE_PERMISSIONS_UPDATED",
    details: `Admin updated permissions for role '${role.name}' (${role.roleId}).`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({ success: true, role, roles: data.roles });
});

// Monthly Google Sheets Export API (GET submitted leave bookings by Year & Month)
app.get(["/api/exports/submitted-leaves", "/api/exports/approved-leaves"], (req, res) => {
  const year = parseInt(String(req.query.year || new Date().getFullYear()));
  const month = parseInt(String(req.query.month || new Date().getMonth())); // 0-indexed: 0=Jan, 11=Dec

  const data = loadData(req);

  // Get total days in target year and month
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Get all active users, sorted by 1. Team, 2. Username
  const allUsersList = Object.values(data.users || {})
    .filter((u: any) => u.status !== "inactive")
    .sort((a: any, b: any) => {
      const teamA = (a.team || "").toLowerCase();
      const teamB = (b.team || "").toLowerCase();
      if (teamA !== teamB) return teamA.localeCompare(teamB);
      const userA = (a.username || "").toLowerCase();
      const userB = (b.username || "").toLowerCase();
      return userA.localeCompare(userB);
    });

  // Get all submitted leave requests for this month (including pending, approved, approved_tl, waitlisted; excluding rejected)
  const monthStr = String(month + 1).padStart(2, "0");
  const monthStartStr = `${year}-${monthStr}-01`;
  const monthEndStr = `${year}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  const submittedRequests = (data.leave_requests || []).filter((r: any) => {
    if (r.status === "rejected" || r.status === "cancelled") return false;
    if (Array.isArray(r.dates) && r.dates.length > 0) {
      return r.dates.some((d: string) => d >= monthStartStr && d <= monthEndStr);
    }
    return r.startDate <= monthEndStr && r.endDate >= monthStartStr;
  });

  // Build employee rows with day map (1..daysInMonth)
  const employeeRows = allUsersList.map((u: any) => {
    const userRequests = submittedRequests.filter((r: any) => r.username === u.username);
    
    const bookedDays: Record<number, string> = {};
    const bookedTimes: Record<number, string> = {};
    let userBookedCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const monthStr = String(month + 1).padStart(2, "0");
      const dayStr = String(day).padStart(2, "0");
      const dateString = `${year}-${monthStr}-${dayStr}`;

      const matchedReq = userRequests.find((r: any) => {
        const bDates = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates : getDatesInRange(r.startDate, r.endDate);
        return bDates.includes(dateString);
      });
      if (matchedReq) {
        bookedDays[day] = "Booked";
        userBookedCount++;

        let timeFormatted = "2.30pm";
        if (matchedReq.createdAt) {
          try {
            const dt = new Date(matchedReq.createdAt);
            if (!isNaN(dt.getTime())) {
              let hours = dt.getHours();
              const minutes = String(dt.getMinutes()).padStart(2, "0");
              const ampm = hours >= 12 ? "pm" : "am";
              hours = hours % 12;
              if (hours === 0) hours = 12;
              timeFormatted = `${hours}.${minutes}${ampm}`;
            }
          } catch (e) {
            timeFormatted = "2.30pm";
          }
        }
        bookedTimes[day] = timeFormatted;
      } else {
        bookedDays[day] = "";
        bookedTimes[day] = "";
      }
    }

    return {
      username: u.username,
      fullName: u.fullName || u.username,
      team: u.team || "Unassigned",
      teamLead: u.teamLead || "",
      role: u.role || "agent",
      status: u.status || "active",
      bookedDays,
      bookedTimes,
      bookedCount: userBookedCount,
      requests: userRequests
    };
  });

  // Summary statistics
  const totalEmployees = employeeRows.length;
  const employeesWithBookings = employeeRows.filter(e => e.bookedCount > 0).length;
  const totalSubmittedRequests = submittedRequests.length;
  const totalBookedDaysAcrossEmployees = employeeRows.reduce((sum, e) => sum + e.bookedCount, 0);

  const teamBreakdown: Record<string, { employeeCount: number; requestCount: number; bookedDays: number }> = {};
  employeeRows.forEach(e => {
    const t = e.team || "Unassigned";
    if (!teamBreakdown[t]) teamBreakdown[t] = { employeeCount: 0, requestCount: 0, bookedDays: 0 };
    teamBreakdown[t].employeeCount += 1;
    teamBreakdown[t].bookedDays += e.bookedCount;
  });

  submittedRequests.forEach((r: any) => {
    const t = r.team || "Unassigned";
    if (teamBreakdown[t]) teamBreakdown[t].requestCount += 1;
  });

  res.json({
    year,
    month,
    daysInMonth,
    employeeRows,
    submittedRequests,
    summary: {
      totalEmployees,
      employeesWithBookings,
      totalSubmittedRequests,
      totalBookedDaysAcrossEmployees,
      teamBreakdown
    }
  });
});

// Log Export Generation to Audit & Export History
app.post("/api/exports/log", (req, res) => {
  const { performedBy, year, month, monthName, format, recordCount, totalApprovedDays } = req.body;
  if (!performedBy) return res.status(400).json({ error: "performedBy is required." });

  const data = loadData(req);
  if (!data.export_history) data.export_history = [];

  const newExport = {
    exportId: "exp-" + Date.now(),
    performedBy,
    year: year || new Date().getFullYear(),
    month: month !== undefined ? month : new Date().getMonth(),
    monthName: monthName || "Month",
    format: format || "XLSX",
    recordCount: recordCount || 0,
    totalApprovedDays: totalApprovedDays || 0,
    timestamp: new Date().toISOString(),
    status: "success"
  };

  data.export_history.unshift(newExport);

  data.audit_logs.unshift({
    logId: "export-log-" + Date.now(),
    adminId: performedBy,
    adminName: performedBy,
    username: performedBy,
    action: "EXCEL_SHEETS_EXPORT_GENERATED",
    details: `${performedBy} generated ${format} export for ${monthName} ${year} (${recordCount} records, ${totalApprovedDays} leave days).`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({ success: true, exportRecord: newExport, history: data.export_history });
});

// Get Export History
app.get("/api/exports/history", (req, res) => {
  const data = loadData(req);
  res.json({ history: data.export_history || [] });
});

// Google Sheets Auto-Sync Engine Endpoints
app.get("/api/sheets/config", (req, res) => {
  const data = loadData(req);
  if (!data.sheets_sync_config) {
    data.sheets_sync_config = {
      enabled: true,
      spreadsheetId: "1adwords_live_leave_roster_2026_sync",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1adwords_live_leave_roster_2026_sync/edit",
      title: "ADWORDS Master Leave Roster 2026",
      lastSyncedAt: new Date().toISOString(),
      status: "connected",
      lastErrorMessage: null,
      syncedMonthsCount: 12,
      totalSyncedCells: 38,
      autoSync: true,
      userEmail: "ops-manager@adwords.system"
    };
    saveData(data, req);
  }
  res.json({
    config: data.sheets_sync_config,
    logs: data.sheets_sync_logs || []
  });
});

app.post("/api/sheets/auth-token", async (req, res) => {
  const { accessToken, userEmail } = req.body;
  if (!accessToken) {
    return res.status(400).json({ error: "Access token is required." });
  }

  setGoogleOAuthToken(accessToken, userEmail);

  const data = loadData(req);
  if (!data.sheets_sync_config) {
    data.sheets_sync_config = {
      enabled: true,
      spreadsheetId: null,
      spreadsheetUrl: null,
      title: "ADWORDS Master Leave Roster 2026",
      lastSyncedAt: null,
      status: "connected",
      lastErrorMessage: null,
      syncedMonthsCount: 12,
      totalSyncedCells: 0,
      autoSync: true,
      userEmail: userEmail || null
    };
  } else {
    data.sheets_sync_config.status = "connected";
    data.sheets_sync_config.userEmail = userEmail || data.sheets_sync_config.userEmail;
  }

  const syncResult = await triggerGoogleSheetsSync(data, { 
    action: "FULL_SYNC", 
    performedBy: userEmail || "GOOGLE_OAUTH_USER" 
  });

  saveData(data, req);
  res.json({
    success: true,
    config: data.sheets_sync_config,
    logs: data.sheets_sync_logs,
    syncResult
  });
});

app.post("/api/sheets/sync-now", async (req, res) => {
  const { performedBy, year, month } = req.body;
  const data = loadData(req);

  const syncResult = await triggerGoogleSheetsSync(data, {
    action: month !== undefined ? "CREATE_MONTH" : "FULL_SYNC",
    year,
    month,
    performedBy: performedBy || "ADMIN"
  });

  saveData(data, req);
  res.json({
    success: true,
    config: data.sheets_sync_config,
    logs: data.sheets_sync_logs,
    syncResult
  });
});

app.post("/api/sheets/update-config", (req, res) => {
  const { enabled, autoSync, title } = req.body;
  const data = loadData(req);
  if (!data.sheets_sync_config) {
    data.sheets_sync_config = {
      enabled: true,
      spreadsheetId: "1adwords_live_leave_roster_2026_sync",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1adwords_live_leave_roster_2026_sync/edit",
      title: "ADWORDS Master Leave Roster 2026",
      lastSyncedAt: new Date().toISOString(),
      status: "connected",
      lastErrorMessage: null,
      syncedMonthsCount: 12,
      totalSyncedCells: 38,
      autoSync: true,
      userEmail: null
    };
  }

  if (enabled !== undefined) data.sheets_sync_config.enabled = enabled;
  if (autoSync !== undefined) data.sheets_sync_config.autoSync = autoSync;
  if (title !== undefined) data.sheets_sync_config.title = title;

  saveData(data, req);
  res.json({ success: true, config: data.sheets_sync_config });
});

// Get Audit Logs Endpoint
app.get("/api/admin/audit-logs", (req, res) => {
  const data = loadData(req);
  const search = String(req.query.search || "").toLowerCase();
  const actionFilter = String(req.query.action || "");
  const adminFilter = String(req.query.admin || "");

  let logs = data.audit_logs || [];

  if (search) {
    logs = logs.filter((l: any) =>
      (l.details && l.details.toLowerCase().includes(search)) ||
      (l.action && l.action.toLowerCase().includes(search)) ||
      (l.username && l.username.toLowerCase().includes(search)) ||
      (l.targetUser && l.targetUser.toLowerCase().includes(search))
    );
  }

  if (actionFilter) {
    logs = logs.filter((l: any) => l.action === actionFilter);
  }

  if (adminFilter) {
    logs = logs.filter((l: any) => l.username === adminFilter || l.adminId === adminFilter);
  }

  res.json({ logs });
});

// Get User Profile
app.get("/api/user/profile", (req, res) => {
  const username = String(req.query.username || "");
  const data = loadData(req);
  const user = findUserAccount(data, username);
  if (!user) {
    return res.status(404).json({ error: "User profile not found" });
  }
  return res.json({ profile: user });
});

// Get rolling month config and status
app.get("/api/system/rolling-window", (req, res) => {
  const data = loadData(req);
  const months = getRollingWindowMonths(data.currentMonthIndex, data.currentYear);
  res.json({
    currentMonthIndex: data.currentMonthIndex,
    currentYear: data.currentYear,
    window: months
  });
});

// Shift month for simulation
app.post("/api/system/simulate-time", (req, res) => {
  const data = loadData(req);
  // Move forward one month
  data.currentMonthIndex += 1;
  if (data.currentMonthIndex >= 12) {
    data.currentMonthIndex = 0;
    data.currentYear += 1;
  }
  
  // Apply automatic monthly accrual using the idempotent engine
  const accrualSummary = processMonthlyAccruals(data, { isSimulation: true });

  data.audit_logs.unshift({
    logId: "time-" + Date.now(),
    username: "CLOCK_SIMULATOR",
    action: "TIME_FORWARD_SHIFT",
    details: `Virtual scheduler shifted forward to ${data.currentYear}-${String(data.currentMonthIndex + 1).padStart(2, "0")}. Accrual applied: +${accrualSummary.totalDaysAdded} leave day(s) across ${accrualSummary.updatedCount} agent(s).`,
    timestamp: new Date().toISOString()
  });

  saveData(data, req);
  res.json({
    success: true,
    currentMonthIndex: data.currentMonthIndex,
    currentYear: data.currentYear,
    users: data.users,
    accrualSummary
  });
});

// Reset to clean production default state (strictly restricted to ADWORDSADMIN)
app.post("/api/system/reset", requireAdwordsAdmin, (req, res) => {
  try {
    const file = getFilePath(req);
    // Use absolute write to guarantee clean production state with only ADWORDSADMIN
    fs.writeFileSync(file, JSON.stringify(initialRealData, null, 2));

    const defaultState = loadData(req);
    res.json({ success: true, data: defaultState });
  } catch (err: any) {
    console.error("Critical error resetting database:", err);
    res.status(500).json({ error: "Failed to reset production datastore.", details: err.message });
  }
});

// Configure custom rule parameter (Admin action)
app.post("/api/system/settings", (req, res) => {
  const { username, hasConnectedFirebase } = req.body;
  if (!username) return res.status(400).json({ error: "Username header missing." });
  const data = loadData(req);
  if (data.users[username]) {
    data.users[username].hasConnectedFirebase = hasConnectedFirebase;
    data.audit_logs.unshift({
      logId: "set-" + Date.now(),
      username: username,
      action: "FIREBASE_PREFERENCE_TOGGLE",
      details: `User toggled Firebase Sync State to: ${hasConnectedFirebase}`,
      timestamp: new Date().toISOString()
    });
    saveData(data, req);
    return res.json({ success: true, profile: data.users[username] });
  }
  res.status(404).json({ error: "User not found." });
});

// Find conflict days and count booked for each day
getRollingWindowMonths
app.get("/api/leave/heatmap", (req, res) => {
  const data = loadData(req);
  const approvedLeaves = data.leave_requests.filter((r: any) => r.status === "approved");
  
  // Create a record map of: "YYYY-MM-DD" -> { teamName: count }
  const heat: Record<string, Record<string, number>> = {};
  
  approvedLeaves.forEach((r: any) => {
    const dates: string[] = Array.isArray(r.dates) && r.dates.length > 0 
      ? r.dates 
      : (r.startDate && r.endDate ? getDatesInRange(r.startDate, r.endDate) : [r.startDate]);

    dates.forEach((dateStr: string) => {
      if (!heat[dateStr]) {
        heat[dateStr] = {};
      }
      heat[dateStr][r.team] = (heat[dateStr][r.team] || 0) + 1;
    });
  });

  res.json({ heatmap: heat });
});

// Retrieve audit logs
app.get("/api/audit-logs", (req, res) => {
  const data = loadData(req);
  res.json({ logs: data.audit_logs });
});

// Retrieve unread notifications
app.get("/api/notifications", (req, res) => {
  const username = String(req.query.username || "");
  const data = loadData(req);
  const alerts = data.notifications.filter((n: any) => n.recipient === username);
  res.json({ notifications: alerts });
});

// Bulk mark alerts as read
app.post("/api/notifications/read", (req, res) => {
  const { username } = req.body;
  const data = loadData(req);
  data.notifications.forEach((n: any) => {
    if (n.recipient === username) {
      n.unread = false;
    }
  });
  saveData(data, req);
  res.json({ success: true });
});

// Get ALL active leave bookings across the workforce (for universal calendar visibility)
app.get("/api/leave/all-bookings", (req, res) => {
  const data = loadData(req);
  const activeBookings = (data.leave_requests || [])
    .filter((r: any) => r.status !== "rejected" && r.status !== "denied" && r.status !== "cancelled")
    .map((r: any) => ({
      requestId: r.requestId,
      username: r.username,
      fullName: data.users?.[r.username]?.fullName || r.fullName || r.username,
      team: r.team,
      startDate: r.startDate,
      endDate: r.endDate,
      dates: Array.isArray(r.dates) && r.dates.length > 0 ? r.dates : (r.startDate && r.endDate ? getDatesInRange(r.startDate, r.endDate) : [r.startDate]),
      status: r.status,
      totalDays: r.totalDays,
      reason: r.reason,
      createdAt: r.createdAt,
      accrualDeducted: r.accrualDeducted
    }));
  res.json({ bookings: activeBookings });
});

// Get Personal Agent Leave Requests: strictly private to the logged-in agent
app.get("/api/leave/my-requests", (req, res) => {
  const data = loadData(req);
  const username = req.query.username;

  if (!username) {
    return res.status(400).json({ error: "Username parameter is required for my-requests." });
  }

  const un = String(username).toLowerCase().trim();
  const list = (data.leave_requests || [])
    .filter((r: any) => (r.username || "").toLowerCase().trim() === un)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json({ requests: list });
});

// Get Leave Requests (Filterable for Admin or authorized views)
app.get("/api/leave/requests", (req, res) => {
  const data = loadData(req);
  let list = data.leave_requests || [];
  
  const role = req.query.role;
  const username = req.query.username;

  if (role === "agent") {
    // Agents can ONLY view their own leave requests
    if (!username) {
      return res.json({ requests: [] });
    }
    const un = String(username).toLowerCase().trim();
    list = list.filter((r: any) => (r.username || "").toLowerCase().trim() === un);
  } else if (role !== "ADMIN") {
    if (!username) {
      return res.json({ requests: [] });
    }
    const un = String(username).toLowerCase().trim();
    list = list.filter((r: any) => (r.username || "").toLowerCase().trim() === un);
  }

  // Sort newest first
  list = [...list].sort((a: any, b: any) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return res.json({ requests: list });
});

// Request Leave Endpoints (Core Booking System rules)
app.post("/api/leave/request", async (req, res) => {
  const { username, startDate, endDate, dates, reason } = req.body;

  if (!username || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing required booking details." });
  }

  const data = loadData(req);
  const profile = data.users[username];
  if (!profile) {
    return res.status(404).json({ error: "User profile not found." });
  }

  if (startDate > endDate) {
    return res.status(400).json({ error: "End date cannot be prior to start date." });
  }

  // Derive discrete list of dates in YYYY-MM-DD format: authoritative dates array
  const requestedDates: string[] = Array.isArray(dates) && dates.length > 0
    ? Array.from(new Set(dates.filter((d: any) => typeof d === "string" && d.trim()))).sort()
    : (startDate === endDate ? [startDate] : getDatesInRange(startDate, endDate));

  if (requestedDates.length === 0) {
    return res.status(400).json({ error: "No valid dates specified." });
  }

  // 1. Agent Maximum 4 Active Bookings / Days Enforcement
  const userActiveBookings = (data.leave_requests || []).filter((r: any) => {
    const isSameUser = (r.username || "").toLowerCase().trim() === username.toLowerCase().trim();
    const isActive = r.status !== "cancelled" && r.status !== "rejected" && r.status !== "denied";
    return isSameUser && isActive;
  });

  const activeBookingCount = userActiveBookings.length;
  const activeBookedDays = userActiveBookings.reduce((sum: number, r: any) => {
    const dCount = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates.length : (r.totalDays || 1);
    return sum + dCount;
  }, 0);

  // If the agent already has 4 active bookings or 4 active days, reject the new booking.
  if (activeBookingCount >= 4 || activeBookedDays >= 4) {
    return res.status(400).json({
      error: `Maximum active bookings limit reached: Agents are permitted a maximum of 4 active leave bookings. You currently have ${Math.max(activeBookingCount, activeBookedDays)} active booking(s).`
    });
  }

  // Booking the requested days must not exceed 4 active bookings or 4 active days total
  if (activeBookedDays + requestedDates.length > 4 || activeBookingCount + requestedDates.length > 4) {
    return res.status(400).json({
      error: `Maximum active booking limit exceeded: Booking ${requestedDates.length} day(s) would exceed the maximum limit of 4 active leave days (you currently have ${activeBookedDays} active booked day(s)).`
    });
  }

  // Check if agent already has an active booking or pending request for any of the requested dates
  const userExistingActiveDates = new Set<string>();
  userActiveBookings.forEach((r: any) => {
    const rDates = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates : (r.startDate ? [r.startDate] : []);
    rDates.forEach((d: string) => userExistingActiveDates.add(d));
  });

  for (const d of requestedDates) {
    if (userExistingActiveDates.has(d)) {
      return res.status(400).json({
        error: `Duplicate booking: You already have an active leave booking or pending request for ${d}.`
      });
    }
  }

  // 2. Verify Monday-Friday only (strictly block Saturday & Sunday)
  for (const d of requestedDates) {
    if (isWeekendDate(d)) {
      return res.status(400).json({ 
        error: `Weekend restriction: ${d} is a weekend day (Saturday or Sunday). Bookings are only permitted Monday through Friday.` 
      });
    }
  }

  // Check and sync any scheduled opening timers first
  const bwChanged = checkAndSyncScheduledBookingWindows(data);
  if (bwChanged) {
    saveData(data, req);
  }

  // 3. Booking window check — every requested date must fall within an open booking month
  for (const d of requestedDates) {
    if (!isDateInOpenBookingWindow(d, data.booking_windows)) {
      return res.status(400).json({ 
        error: `Lock violation: Date ${d} falls within a month that is closed or not yet open for bookings.` 
      });
    }
  }

  // 4. Same-Team Date Conflict Prevention (Strict 1-Member-Per-Team-Per-Date rule)
  // Only one member of the same team can book a particular date
  if (profile.team && profile.team.toLowerCase() !== "none" && profile.team.toLowerCase() !== "unassigned") {
    const fellowTeamRequests = (data.leave_requests || []).filter((r: any) => {
      const isSameTeam = areTeamsMatching(r.team, profile.team);
      const isDifferentUser = (r.username || "").trim().toLowerCase() !== username.trim().toLowerCase();
      const isActive = r.status !== "rejected" && r.status !== "cancelled" && r.status !== "denied";
      return isSameTeam && isDifferentUser && isActive;
    });

    for (const dateString of requestedDates) {
      const clashingRequest = fellowTeamRequests.find((r: any) => {
        const rDates = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates : (r.startDate ? [r.startDate] : []);
        return rDates.includes(dateString);
      });

      if (clashingRequest) {
        const clashingUser = data.users[clashingRequest.username] || { fullName: clashingRequest.username };
        const clashName = clashingUser.fullName || clashingRequest.username;
        return res.status(400).json({ 
          error: `Team conflict: Fellow team member ${clashName} (${profile.team}) has already booked leave on ${dateString}. Only one member of the same team can book a particular date.` 
        });
      }
    }
  }

  // 5. Accrued Leave Balance Check: An agent cannot book leave if requested days > accruedLeaveDays
  const currentAccrued = typeof profile.accruedLeaveDays === "number"
    ? profile.accruedLeaveDays
    : (typeof profile.accrued_leave === "number" ? profile.accrued_leave : 0);

  if (requestedDates.length > currentAccrued) {
    return res.status(400).json({
      error: `Insufficient accrued leave balance: You requested ${requestedDates.length} day(s), but only have ${currentAccrued} accrued leave day(s) available.`
    });
  }

  // Create individual pending Leave Request for EACH selected date (ONE DATE = ONE REQUEST)
  // Status: pending, no accrued days deducted yet
  const createdRequests: any[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < requestedDates.length; i++) {
    const singleDate = requestedDates[i];
    const newRequest = {
      requestId: "req-" + Math.random().toString(36).substr(2, 9) + "-" + (baseTime + i).toString(36),
      username: username,
      fullName: profile.fullName || profile.username,
      team: profile.team,
      startDate: singleDate,
      endDate: singleDate,
      dates: [singleDate],
      totalDays: 1,
      status: "pending" as const,
      accrualDeducted: false,
      deductedDays: 0,
      reason: reason || "Annual leave",
      createdAt: new Date(baseTime + i * 10).toISOString()
    };

    data.leave_requests.push(newRequest);
    createdRequests.push(newRequest);

    data.audit_logs.unshift({
      logId: "reqlog-" + (baseTime + i),
      username: username,
      action: "LEAVE_REQUESTED",
      details: `Submitted individual leave request for ${singleDate} (1 day). Status: pending approval. Accrued balance: ${currentAccrued} days.`,
      timestamp: new Date(baseTime + i * 10).toISOString()
    });

    // Automatically synchronize booking to Google Sheets
    await triggerGoogleSheetsSync(data, { action: "UPDATE_BOOKING", request: newRequest });
  }

  saveData(data, req);
  res.json({
    success: true,
    message: `Created ${createdRequests.length} individual leave request(s).`,
    requests: createdRequests,
    request: createdRequests[0]
  });
});

// Change / Modify existing Leave booking
app.post("/api/leave/change", async (req, res) => {
  const { requestId, username, newStartDate, newEndDate, newDates, reason } = req.body;
  if (!requestId || !username || !newStartDate || !newEndDate) {
    return res.status(400).json({ error: "Missing required change details." });
  }

  const data = loadData(req);
  const requestIndex = data.leave_requests.findIndex((r: any) => r.requestId === requestId);
  if (requestIndex === -1) {
    return res.status(404).json({ error: "Leave request not found." });
  }

  const request = data.leave_requests[requestIndex];
  // Agent can only change their own bookings
  if ((request.username || "").toLowerCase().trim() !== String(username).toLowerCase().trim()) {
    return res.status(403).json({ error: "Unauthorized. You can only modify your own bookings." });
  }

  if (newStartDate > newEndDate) {
    return res.status(400).json({ error: "End date cannot be prior to start date." });
  }

  const profile = data.users[username] || { team: request.team, fullName: request.fullName };

  // Derive discrete list of new dates in YYYY-MM-DD format (no Date objects)
  const requestedDates: string[] = Array.isArray(newDates) && newDates.length > 0
    ? Array.from(new Set(newDates.filter((d: any) => typeof d === "string" && d.trim()))).sort()
    : (newStartDate === newEndDate ? [newStartDate] : getDatesInRange(newStartDate, newEndDate));

  if (requestedDates.length === 0) {
    return res.status(400).json({ error: "No valid dates specified for change." });
  }

  // 1. Verify 4-day maximum active bookings limit when modifying booking
  const otherUserActiveBookings = (data.leave_requests || []).filter((r: any) => {
    const isSameUser = (r.username || "").toLowerCase().trim() === String(username).toLowerCase().trim();
    const isActive = r.status !== "cancelled" && r.status !== "rejected" && r.status !== "denied";
    const isOther = r.requestId !== requestId;
    return isSameUser && isActive && isOther;
  });

  const otherActiveDays = otherUserActiveBookings.reduce((sum: number, r: any) => {
    const dCount = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates.length : (r.totalDays || 1);
    return sum + dCount;
  }, 0);

  if (otherUserActiveBookings.length + requestedDates.length > 4 || otherActiveDays + requestedDates.length > 4) {
    return res.status(400).json({
      error: `Maximum active booking limit exceeded: Changing this booking to ${requestedDates.length} day(s) would exceed the maximum limit of 4 active leave days (other active bookings: ${otherActiveDays} day(s)).`
    });
  }

  // Check duplicate booking for user on new requested dates
  const userOtherActiveDates = new Set<string>();
  otherUserActiveBookings.forEach((r: any) => {
    const rDates = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates : (r.startDate ? [r.startDate] : []);
    rDates.forEach((d: string) => userOtherActiveDates.add(d));
  });

  for (const d of requestedDates) {
    if (userOtherActiveDates.has(d)) {
      return res.status(400).json({
        error: `Duplicate booking: You already have an active leave booking or pending request for ${d}.`
      });
    }
  }

  // 2. Verify Monday-Friday only (strictly block Saturday & Sunday)
  for (const d of requestedDates) {
    if (isWeekendDate(d)) {
      return res.status(400).json({ 
        error: `Weekend restriction: ${d} is a weekend day (Saturday or Sunday). Bookings are only permitted Monday through Friday.` 
      });
    }
  }

  // Check and sync any scheduled opening timers first
  checkAndSyncScheduledBookingWindows(data);

  // 2. Booking window check — every requested date must fall within an OPEN booking month
  for (const d of requestedDates) {
    if (!isDateInOpenBookingWindow(d, data.booking_windows)) {
      return res.status(400).json({ 
        error: `Lock violation: Date ${d} falls within a month that is closed or not yet open for bookings.` 
      });
    }
  }

  // 3. Same-Team Date Conflict Prevention:
  // Validate the new date before modifying/releasing the old booking
  if (profile.team && profile.team.toLowerCase() !== "none" && profile.team.toLowerCase() !== "unassigned") {
    const fellowTeamRequests = (data.leave_requests || []).filter((r: any) => {
      const isSameTeam = areTeamsMatching(r.team, profile.team);
      const isDifferentUser = (r.username || "").trim().toLowerCase() !== username.trim().toLowerCase();
      const isOtherRequest = r.requestId !== requestId;
      const isActive = r.status !== "rejected" && r.status !== "cancelled";
      return isSameTeam && isDifferentUser && isOtherRequest && isActive;
    });

    for (const dateString of requestedDates) {
      const clashingRequest = fellowTeamRequests.find((r: any) => {
        const rDates = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates : (r.startDate ? [r.startDate] : []);
        return rDates.includes(dateString);
      });

      if (clashingRequest) {
        const clashingUser = data.users[clashingRequest.username] || { fullName: clashingRequest.username };
        const clashName = clashingUser.fullName || clashingRequest.username;
        return res.status(400).json({ 
          error: `Team conflict: Fellow team member ${clashName} (${profile.team}) has already booked leave on ${dateString}. Only one member of the same team can book a particular date.` 
        });
      }
    }
  }

  // Balance Check & Adjustment for Changes
  const user = data.users[username];
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const currentBalance = typeof user.accruedLeaveDays === "number"
    ? user.accruedLeaveDays
    : (typeof user.accrued_leave === "number" ? user.accrued_leave : 0);

  const oldDatesCount = Array.isArray(request.dates) && request.dates.length > 0 
    ? request.dates.length 
    : (request.totalDays || 1);
  const newDatesCount = requestedDates.length;
  const diff = newDatesCount - oldDatesCount;

  if (request.status === "approved" && request.accrualDeducted) {
    if (diff > 0) {
      // More days requested: check if available balance covers additional days
      if (currentBalance < diff) {
        return res.status(400).json({
          error: `Insufficient accrued leave balance: Changing from ${oldDatesCount} to ${newDatesCount} days requires ${diff} additional accrued day(s), but you only have ${currentBalance} accrued day(s) available.`
        });
      }
      const newBal = parseFloat((currentBalance - diff).toFixed(2));
      user.accruedLeaveDays = newBal;
      user.accrued_leave = newBal;
      request.deductedDays = newDatesCount;
      user.used_leave = parseFloat(((user.used_leave || 0) + diff).toFixed(2));
    } else if (diff < 0) {
      // Fewer days: refund the difference to accrued balance
      const refund = Math.abs(diff);
      const newBal = parseFloat((currentBalance + refund).toFixed(2));
      user.accruedLeaveDays = newBal;
      user.accrued_leave = newBal;
      request.deductedDays = newDatesCount;
      user.used_leave = Math.max(0, parseFloat(((user.used_leave || 0) - refund).toFixed(2)));
    }
  } else {
    // Request is pending (no days deducted yet): ensure total new days do not exceed accrued balance
    if (newDatesCount > currentBalance) {
      return res.status(400).json({
        error: `Insufficient accrued leave balance: Changing to ${newDatesCount} days requires ${newDatesCount} accrued day(s), but you only have ${currentBalance} accrued day(s) available.`
      });
    }
  }

  // All validations passed! Update the existing booking
  const oldSummary = `${request.startDate} to ${request.endDate}`;
  request.startDate = requestedDates[0];
  request.endDate = requestedDates[requestedDates.length - 1];
  request.dates = requestedDates;
  request.totalDays = requestedDates.length;
  if (reason !== undefined && reason.trim() !== "") {
    request.reason = reason.trim();
  }
  request.updatedAt = new Date().toISOString();

  data.audit_logs.unshift({
    logId: "chglog-" + Date.now(),
    username: username,
    action: "LEAVE_CHANGED",
    details: `Changed leave booking from ${oldSummary} to ${newStartDate} to ${newEndDate} (${requestedDates.length} days). Balance adjustment diff: ${diff} days.`,
    timestamp: new Date().toISOString()
  });

  await triggerGoogleSheetsSync(data, { action: "UPDATE_BOOKING", request });

  saveData(data, req);
  res.json({ success: true, message: "Booking updated successfully.", request, currentBalance: user.accruedLeaveDays });
});

// Resolve Action on Leave Request (Approve / Deny / Waitlist) including Workforce Safety Balancing rules
app.post("/api/leave/action", async (req, res) => {
  const { requestId, action, reviewer, responseComment } = req.body;
  if (!requestId || !action || !reviewer) {
    return res.status(400).json({ error: "Missing action details." });
  }

  const data = loadData(req);
  const requestIndex = data.leave_requests.findIndex((r: any) => r.requestId === requestId);
  if (requestIndex === -1) {
    return res.status(404).json({ error: "Leave request not found." });
  }

  const request = data.leave_requests[requestIndex];
  const applicantProfile = data.users[request.username];
  
  if (!applicantProfile) {
    return res.status(404).json({ error: "Applicant profile not found" });
  }

  const auth = getAuthenticatedUser(req);
  const reviewerName = String(auth?.username || reviewer || "").trim();
  if (reviewerName.toUpperCase() !== "ADWORDSADMIN") {
    return res.status(403).json({ error: "Access denied. Only ADWORDSADMIN has permission to approve or reject leave requests." });
  }

  const reviewerProfile = data.users["ADWORDSADMIN"] || data.users[reviewerName];
  if (!reviewerProfile || reviewerProfile.role !== "ADMIN") {
    return res.status(403).json({ error: "Reviewer security verification failed: ADWORDSADMIN account not found or invalid." });
  }

  // TL Moderation Step
  if (reviewerProfile.role === "TL") {
    if (action === "approved") {
      request.status = "approved_tl";
      request.responseComment = responseComment || "Approved by Team Lead; pending final OPS decision.";
      request.commentByRole = "TL";

      // Dispatch notification
      const opsReviewers = Object.values(data.users).filter((u: any) => u.role === "OPS" || u.role === "ADMIN");
      opsReviewers.forEach((opsReviewer: any) => {
        data.notifications.unshift({
          notificationId: "not-" + Math.random().toString(36).substr(2, 9),
          recipient: opsReviewer.username,
          message: `TL approved request (from ${request.username}) requires final OPS action.`,
          timestamp: new Date().toISOString(),
          unread: true,
          type: "info"
        });
      });

      data.notifications.unshift({
        notificationId: "not-" + Math.random().toString(36).substr(2, 9),
        recipient: request.username,
        message: `Your leave request was accepted by Team Lead ${reviewer}, pending final OPS decision.`,
        timestamp: new Date().toISOString(),
        unread: true,
        type: "success"
      });

      data.audit_logs.unshift({
        logId: "aud-" + Date.now(),
        username: reviewer,
        action: "LEAVE_TL_APPROVED",
        details: `Team Lead approved request of ${request.username} (${request.totalDays} Days) and routed to OPS queue.`,
        timestamp: new Date().toISOString()
      });
    } else if (action === "rejected") {
      request.status = "rejected";
      request.responseComment = responseComment || "Refused by Team Lead.";
      request.commentByRole = "TL";
      applicantProfile.previous_denials = (applicantProfile.previous_denials || 0) + 1;

      data.notifications.unshift({
        notificationId: "not-" + Math.random().toString(36).substr(2, 9),
        recipient: request.username,
        message: `Your leave request for ${request.startDate} was REJECTED by Team Lead.`,
        timestamp: new Date().toISOString(),
        unread: true,
        type: "critical"
      });

      data.audit_logs.unshift({
        logId: "aud-" + Date.now(),
        username: reviewer,
        action: "LEAVE_TL_REJECTED",
        details: `Team Lead rejected request ${requestId} for ${request.username}. Penalty score incremented.`,
        timestamp: new Date().toISOString()
      });
    }

    saveData(data, req);
    return res.json({ success: true, request });
  }

  // OPS / ADMIN final approval actions
  if (action === "approved") {
    // Idempotency: deduction must happen exactly once
    if (request.status === "approved" || request.accrualDeducted === true) {
      request.status = "approved";
      saveData(data, req);
      return res.json({ 
        success: true, 
        message: "Request is already approved.", 
        request, 
        currentBalance: applicantProfile.accruedLeaveDays 
      });
    }

    // Strict rule verification: Only 1 member per team can take leave on any single day
    const activeApproved = data.leave_requests.filter((r: any) => r.status === "approved" && areTeamsMatching(r.team, request.team) && r.requestId !== request.requestId);
    
    // Check conflicts date-by-date using authoritative dates array
    const reqDates = Array.isArray(request.dates) && request.dates.length > 0
      ? request.dates
      : (request.startDate && request.endDate ? getDatesInRange(request.startDate, request.endDate) : [request.startDate]);
    const leaveDaysCount = reqDates.length;
    
    let isConflict = false;
    let conflictDate = "";
    let conflictUser = "";
    
    for (const dayStr of reqDates) {
      const clashingAp = activeApproved.find((ap: any) => {
        const apDates = Array.isArray(ap.dates) && ap.dates.length > 0
          ? ap.dates
          : getDatesInRange(ap.startDate, ap.endDate);
        return apDates.includes(dayStr);
      });

      if (clashingAp) {
        isConflict = true;
        conflictDate = dayStr;
        conflictUser = data.users?.[clashingAp.username]?.fullName || clashingAp.username;
        break;
      }
    }

    if (isConflict) {
      return res.status(400).json({
        error: `Cannot approve request: Team member ${conflictUser} already has approved leave on ${conflictDate}. Only one member per team is allowed on leave per day.`
      });
    }

    // Verify accrued leave balance before approving
    const currentAccrued = typeof applicantProfile.accruedLeaveDays === "number"
      ? applicantProfile.accruedLeaveDays
      : (typeof applicantProfile.accrued_leave === "number" ? applicantProfile.accrued_leave : 0);

    if (currentAccrued < leaveDaysCount) {
      return res.status(400).json({
        error: `Cannot approve request: Agent has insufficient accrued leave days (${currentAccrued} available, ${leaveDaysCount} required).`
      });
    }

    // Step 2 Rule: Deduct exact number of dates in request.dates from accruedLeaveDays
    const newBal = parseFloat((currentAccrued - leaveDaysCount).toFixed(2));
    applicantProfile.accruedLeaveDays = newBal;
    applicantProfile.accrued_leave = newBal;
    applicantProfile.used_leave = parseFloat(((applicantProfile.used_leave || 0) + leaveDaysCount).toFixed(2));
    applicantProfile.recent_approved_requests = (applicantProfile.recent_approved_requests || 0) + 1;

    request.status = "approved";
    request.accrualDeducted = true;
    request.deductedDays = leaveDaysCount;
    request.approvedAt = new Date().toISOString();
    request.approvedBy = reviewer;
    request.responseComment = responseComment || "Approved by Admin.";
    
    // Send success notification to recipient
    data.notifications.unshift({
      notificationId: "not-" + Math.random().toString(36).substr(2, 9),
      recipient: request.username,
      message: `Your leave request for ${reqDates.join(", ")} was APPROVED by ${reviewer}. Deducted: ${leaveDaysCount} accrued days. Remaining balance: ${newBal} days.`,
      timestamp: new Date().toISOString(),
      unread: true,
      type: "success"
    });

    data.audit_logs.unshift({
      logId: "aud-" + Date.now(),
      username: reviewer,
      action: "LEAVE_APPROVED",
      details: `Admin approved ${leaveDaysCount} days for ${request.username}. Accrued balance: ${currentAccrued} -> ${newBal} days.`,
      timestamp: new Date().toISOString()
    });

  } else if (action === "rejected" || action === "denied") {
    // If request was previously approved and had leave deducted, refund the days
    if (request.status === "approved" && request.accrualDeducted) {
      const daysToRefund = request.deductedDays || (Array.isArray(request.dates) ? request.dates.length : (request.totalDays || 1));
      const curBal = typeof applicantProfile.accruedLeaveDays === "number"
        ? applicantProfile.accruedLeaveDays
        : (typeof applicantProfile.accrued_leave === "number" ? applicantProfile.accrued_leave : 0);
      const refunded = parseFloat((curBal + daysToRefund).toFixed(2));
      applicantProfile.accruedLeaveDays = refunded;
      applicantProfile.accrued_leave = refunded;
      applicantProfile.used_leave = Math.max(0, parseFloat(((applicantProfile.used_leave || 0) - daysToRefund).toFixed(2)));
    }
    // Denial lifecycle: Request is marked denied. No accrued leave days deducted.
    request.status = "denied";
    request.accrualDeducted = false;
    request.rejectedAt = new Date().toISOString();
    request.deniedAt = new Date().toISOString();
    request.rejectedBy = reviewer;
    request.deniedBy = reviewer;
    request.responseComment = responseComment || "Denied by Admin.";
    
    applicantProfile.previous_denials = (applicantProfile.previous_denials || 0) + 1;

    data.notifications.unshift({
      notificationId: "not-" + Math.random().toString(36).substr(2, 9),
      recipient: request.username,
      message: `Your leave request for ${request.startDate} was DENIED by ${reviewer}. No leave days were deducted.`,
      timestamp: new Date().toISOString(),
      unread: true,
      type: "critical"
    });

    data.audit_logs.unshift({
      logId: "aud-" + Date.now(),
      username: reviewer,
      action: "LEAVE_DENIED",
      details: `Admin denied request ${requestId} for ${request.username}. Accrued balance remains unchanged.`,
      timestamp: new Date().toISOString()
    });
  }

  // Synchronize status change incrementally to Google Sheets
  await triggerGoogleSheetsSync(data, { action: "UPDATE_BOOKING", request, statusChange: action });

  saveData(data, req);
  res.json({ success: true, request, currentBalance: applicantProfile.accruedLeaveDays });
});

// Cancel / Release Leave request
app.post("/api/leave/cancel", async (req, res) => {
  const { requestId, username } = req.body;
  if (!requestId || !username) {
    return res.status(400).json({ error: "Missing cancel details." });
  }

  const data = loadData(req);
  const requestIndex = data.leave_requests.findIndex((r: any) => r.requestId === requestId);
  if (requestIndex === -1) {
    return res.status(404).json({ error: "Leave request not found." });
  }

  const request = data.leave_requests[requestIndex];
  // Agent can only cancel their own bookings (or admin)
  const isOwner = (request.username || "").toLowerCase().trim() === String(username).toLowerCase().trim();
  const isAdmin = (data.users[username]?.role || "").toUpperCase() === "ADMIN";
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: "Unauthorized. You can only cancel your own bookings." });
  }

  // Double cancellation protection: refund must happen exactly once
  if (request.status === "cancelled") {
    return res.json({ success: true, message: "Request is already cancelled. No additional refund." });
  }

  // Step 2 Rule: If previously approved and deducted, refund exact number of dates in dates array back to accruedLeaveDays
  let refundedDays = 0;
  if (request.status === "approved" && request.accrualDeducted !== false) {
    const user = data.users[request.username];
    if (user) {
      refundedDays = Array.isArray(request.dates) && request.dates.length > 0
        ? request.dates.length
        : (request.totalDays || 1);
      const currentBal = typeof user.accruedLeaveDays === "number"
        ? user.accruedLeaveDays
        : (typeof user.accrued_leave === "number" ? user.accrued_leave : 0);
      const newBal = parseFloat((currentBal + refundedDays).toFixed(2));
      user.accruedLeaveDays = newBal;
      user.accrued_leave = newBal;
      user.used_leave = Math.max(0, parseFloat(((user.used_leave || 0) - refundedDays).toFixed(2)));
      user.recent_approved_requests = Math.max(0, (user.recent_approved_requests || 1) - 1);
    }
    request.accrualDeducted = false;
  }
  // Cancelling a pending or denied request should NOT add days back.

  // Mark request as cancelled and release date immediately
  request.status = "cancelled";
  request.cancelledAt = new Date().toISOString();

  // Add audit log
  data.audit_logs.unshift({
    logId: "aud-" + Date.now(),
    username: username,
    action: "LEAVE_CANCELLED",
    details: `Cancelled leave request ${requestId} for ${request.startDate} to ${request.endDate}. Refunded accrued days: ${refundedDays}. Date immediately released.`,
    timestamp: new Date().toISOString()
  });

  // Automatically clear the affected cells in Google Sheets without deleting employee row
  await triggerGoogleSheetsSync(data, { action: "CANCEL_BOOKING", request });

  saveData(data, req);
  const userObj = data.users[request.username];
  res.json({ 
    success: true, 
    message: "Your booking has been cancelled and the date is now available.",
    refundedDays,
    currentBalance: userObj?.accruedLeaveDays ?? 0
  });
});

// Trigger or verify monthly leave accrual (idempotent, server-side)
const handleAccrualRun = (req: any, res: any) => {
  const data = loadData(req);
  const isSimulation = getFilePath(req).includes("data_store_simulation.json");
  const { targetMonth, targetYear, month, specificMonth, forceMonth, adminUser } = req.body || {};

  const rawTargetMonth = targetMonth !== undefined ? targetMonth : forceMonth;
  let targetMonthStr: string | undefined = undefined;
  let tYear = targetYear !== undefined ? Number(targetYear) : undefined;
  let tMonth = month !== undefined ? Number(month) : undefined;

  if (typeof rawTargetMonth === "string") {
    if (rawTargetMonth.includes("-")) {
      targetMonthStr = rawTargetMonth;
      const parts = rawTargetMonth.split("-").map(Number);
      tYear = parts[0];
      tMonth = parts[1];
    } else {
      tMonth = Number(rawTargetMonth);
    }
  } else if (typeof rawTargetMonth === "number") {
    tMonth = rawTargetMonth;
  }

  const result = processMonthlyAccruals(data, {
    isSimulation,
    targetYear: tYear,
    targetMonth: tMonth,
    targetMonthStr,
    specificMonth: specificMonth,
    actingUser: adminUser || "ADMIN_TRIGGERED"
  });

  if (result.applied) {
    saveData(data, req);
  }

  return res.json({
    success: true,
    applied: result.applied,
    totalDaysAdded: result.totalDaysAdded,
    updatedCount: result.updatedCount,
    monthsProcessed: result.monthsProcessed,
    agentSummaries: result.agentSummaries,
    users: data.users,
    message: result.applied
      ? `Successfully applied monthly accrual: +${result.totalDaysAdded} day(s) across ${result.updatedCount} agent(s) for month(s): ${result.monthsProcessed.join(", ")}.`
      : "Accrual already up to date for this period. No duplicate accrual applied."
  });
};

app.post("/api/admin/accrual/run", handleAccrualRun);
app.post("/api/leave/accrue", handleAccrualRun);
app.post("/api/system/process-accrual", handleAccrualRun);

// Check status of monthly accruals across all agents
app.get("/api/admin/accrual/status", (req, res) => {
  const data = loadData(req);
  const isSimulation = getFilePath(req).includes("data_store_simulation.json");
  const now = new Date();
  const currentSimMonth = (data.currentMonthIndex !== undefined ? data.currentMonthIndex : 4) + 1;
  const currentSimYear = data.currentYear || 2026;
  const currentPeriod = isSimulation 
    ? `${currentSimYear}-${String(currentSimMonth).padStart(2, "0")}`
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const agents = Object.values(data.users || {})
    .filter((u: any) => u.role === "agent")
    .map((u: any) => ({
      username: u.username,
      fullName: u.fullName,
      team: u.team,
      accruedLeaveDays: u.accruedLeaveDays ?? u.accrued_leave ?? 0,
      accruedMonths: u.accruedMonths || [],
      lastAccrualMonth: u.lastAccrualMonth || null,
      accrualStartMonth: u.accrualStartMonth || "2026-01",
      isCurrentPeriodAccrued: (u.accruedMonths || []).includes(currentPeriod)
    }));

  return res.json({
    currentPeriod,
    isSimulation,
    totalAgents: agents.length,
    agents
  });
});

// Fetch active booking windows
app.get("/api/booking-windows", (req, res) => {
  const data = loadData(req);
  if (!data.booking_windows) {
    data.booking_windows = defaultBookingWindows;
    saveData(data, req);
  }

  const hasSynced = checkAndSyncScheduledBookingWindows(data);
  if (hasSynced) {
    saveData(data, req);
  }

  const nowMs = Date.now();
  const evaluatedWindows = data.booking_windows.map((w: any) => {
    const evaluated = evaluateBookingWindowState(w, nowMs);
    return {
      year: Number(w.year),
      month: Number(w.month),
      monthName: w.monthName,
      status: evaluated.status,
      isOpen: evaluated.isOpen,
      scheduledOpenTime: w.scheduledOpenTime || null
    };
  });

  res.json({
    bookingWindows: evaluatedWindows,
    serverTime: new Date().toISOString()
  });
});

// Manage individual booking window month (Open immediately, Close, or Schedule opening)
app.post("/api/admin/booking-windows/toggle", async (req, res) => {
  const { year, month, action, isOpen, scheduledOpenTime, reviewer } = req.body;
  if (year === undefined || month === undefined) {
    return res.status(400).json({ error: "Missing required parameters (year, month)" });
  }

  const data = loadData(req);
  if (!data.booking_windows) {
    data.booking_windows = defaultBookingWindows;
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const mIndex = Number(month);
  const yIndex = Number(year);
  let idx = data.booking_windows.findIndex((w: any) => Number(w.year) === yIndex && Number(w.month) === mIndex);

  if (idx === -1) {
    data.booking_windows.push({
      year: yIndex,
      month: mIndex,
      monthName: monthNames[mIndex] || `Month ${mIndex + 1}`,
      isOpen: false,
      status: "CLOSED",
      scheduledOpenTime: null
    });
    idx = data.booking_windows.length - 1;
  }

  const targetWindow = data.booking_windows[idx];

  // Determine requested action
  if (action === "SCHEDULE" || (scheduledOpenTime && action !== "CLOSE" && action !== "OPEN")) {
    if (!scheduledOpenTime) {
      return res.status(400).json({ error: "Missing scheduledOpenTime for scheduling action" });
    }
    const scheduledDate = new Date(scheduledOpenTime);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: "Invalid scheduledOpenTime format" });
    }

    targetWindow.status = "SCHEDULED";
    targetWindow.isOpen = false;
    targetWindow.scheduledOpenTime = scheduledDate.toISOString();

    data.audit_logs.unshift({
      logId: "bw-sched-" + Date.now(),
      username: reviewer || "ADMIN",
      action: "BOOKING_WINDOW_SCHEDULED",
      details: `Scheduled booking window for ${monthNames[mIndex]} ${yIndex} to open on ${scheduledDate.toUTCString()}`,
      timestamp: new Date().toISOString()
    });
  } else if (action === "OPEN" || isOpen === true) {
    targetWindow.status = "OPEN";
    targetWindow.isOpen = true;
    targetWindow.scheduledOpenTime = null;

    data.audit_logs.unshift({
      logId: "bw-open-" + Date.now(),
      username: reviewer || "ADMIN",
      action: "BOOKING_WINDOW_OPENED",
      details: `Opened booking window for ${monthNames[mIndex]} ${yIndex} immediately`,
      timestamp: new Date().toISOString()
    });

    // Automatically create/ensure the matching worksheet in the Google Spreadsheet
    await triggerGoogleSheetsSync(data, { action: "CREATE_MONTH", year: yIndex, month: mIndex, performedBy: reviewer || "ADMIN" });
  } else {
    // Close month
    targetWindow.status = "CLOSED";
    targetWindow.isOpen = false;
    targetWindow.scheduledOpenTime = null;

    data.audit_logs.unshift({
      logId: "bw-close-" + Date.now(),
      username: reviewer || "ADMIN",
      action: "BOOKING_WINDOW_CLOSED",
      details: `Closed booking window for ${monthNames[mIndex]} ${yIndex}`,
      timestamp: new Date().toISOString()
    });
  }

  saveData(data, req);

  // Keep both stores synchronized for booking windows
  try {
    const currentFile = getFilePath(req);
    const otherFile = currentFile.includes("data_store_simulation.json")
      ? path.join(process.cwd(), "data_store_real.json")
      : path.join(process.cwd(), "data_store_simulation.json");
    if (fs.existsSync(otherFile)) {
      const otherData = JSON.parse(fs.readFileSync(otherFile, "utf-8"));
      if (otherData && otherData.booking_windows) {
        let otherIdx = otherData.booking_windows.findIndex((w: any) => Number(w.year) === yIndex && Number(w.month) === mIndex);
        if (otherIdx !== -1) {
          otherData.booking_windows[otherIdx].status = targetWindow.status;
          otherData.booking_windows[otherIdx].isOpen = targetWindow.isOpen;
          otherData.booking_windows[otherIdx].scheduledOpenTime = targetWindow.scheduledOpenTime;
          fs.writeFileSync(otherFile, JSON.stringify(otherData, null, 2));
        }
      }
    }
  } catch (err) {
    console.error("Error syncing booking window to secondary store:", err);
  }

  const nowMs = Date.now();
  const evaluatedWindows = data.booking_windows.map((w: any) => {
    const evaluated = evaluateBookingWindowState(w, nowMs);
    return {
      year: Number(w.year),
      month: Number(w.month),
      monthName: w.monthName,
      status: evaluated.status,
      isOpen: evaluated.isOpen,
      scheduledOpenTime: w.scheduledOpenTime || null
    };
  });

  res.json({ success: true, bookingWindows: evaluatedWindows, serverTime: new Date().toISOString() });
});

// Bulk update open booking window months
app.post("/api/admin/booking-windows/bulk", async (req, res) => {
  const { openMonths, year = 2026, reviewer } = req.body;
  if (!Array.isArray(openMonths)) {
    return res.status(400).json({ error: "openMonths must be an array of month indices (0-11)" });
  }

  const data = loadData(req);
  if (!data.booking_windows) {
    data.booking_windows = defaultBookingWindows;
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const yIndex = Number(year);

  for (let m = 0; m < 12; m++) {
    const shouldBeOpen = openMonths.includes(m);
    const idx = data.booking_windows.findIndex((w: any) => Number(w.year) === yIndex && Number(w.month) === m);
    if (idx !== -1) {
      data.booking_windows[idx].isOpen = shouldBeOpen;
      data.booking_windows[idx].status = shouldBeOpen ? "OPEN" : "CLOSED";
      data.booking_windows[idx].scheduledOpenTime = null;
    } else {
      data.booking_windows.push({
        year: yIndex,
        month: m,
        monthName: monthNames[m],
        isOpen: shouldBeOpen,
        status: shouldBeOpen ? "OPEN" : "CLOSED",
        scheduledOpenTime: null
      });
    }
  }

  const openMonthNames = openMonths.map((m: number) => monthNames[m]).filter(Boolean).join(", ");

  data.audit_logs.unshift({
    logId: "bw-bulk-" + Date.now(),
    username: reviewer || "ADMIN",
    action: "BULK_BOOKING_WINDOWS_UPDATED",
    details: `Updated open booking months for ${year}. Open months: ${openMonthNames || "None (All Closed)"}`,
    timestamp: new Date().toISOString()
  });

  // Ensure worksheets for all open months
  for (const m of openMonths) {
    await triggerGoogleSheetsSync(data, { action: "CREATE_MONTH", year: yIndex, month: Number(m), performedBy: reviewer || "ADMIN" });
  }

  saveData(data, req);

  const nowMs = Date.now();
  const evaluatedWindows = data.booking_windows.map((w: any) => {
    const evaluated = evaluateBookingWindowState(w, nowMs);
    return {
      year: Number(w.year),
      month: Number(w.month),
      monthName: w.monthName,
      status: evaluated.status,
      isOpen: evaluated.isOpen,
      scheduledOpenTime: w.scheduledOpenTime || null
    };
  });

  res.json({ success: true, bookingWindows: evaluatedWindows, serverTime: new Date().toISOString() });
});

// Admin list all users (strictly restricted to ADWORDSADMIN)
app.get("/api/admin/users", requireAdwordsAdmin, (req, res) => {
  const data = loadData(req);
  res.json({ users: data.users });
});

// Configure Vite pipeline or production static directory
async function startServer() {
  const isProd = process.env.NODE_ENV === "production";

  // Initialize production datastore on disk if it does not exist
  try {
    const realFile = path.join(process.cwd(), "data_store_real.json");
    if (!fs.existsSync(realFile)) {
      fs.writeFileSync(realFile, JSON.stringify(initialRealData, null, 2));
    }
  } catch (err) {
    console.error("Error initializing production store on disk:", err);
  }

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express custom production server running at http://localhost:${PORT}`);
  });
}

startServer();
