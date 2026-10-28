import * as XLSX from "xlsx";
import XLSXStyle from "xlsx-js-style";
import { LeaveRequest, UserProfile, AuditLog, isWeekendDay, getWeekdayShortName } from "../types";

/**
 * Utility to escape CSV fields correctly, handling commas, quotes, and newlines.
 */
function escapeCSVField(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val).trim();
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Downloads a generated string as a CSV file in the browser.
 */
export function downloadCSVFile(content: string, filename: string) {
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Monthly Google Sheets/Excel format export helper for Submitted Leave Bookings.
 * Structure: Username | Team | 1 | 2 | 3 | ... | daysInMonth
 * Writes "Booked" inside column D if employee requested leave on day D.
 */
export interface EmployeeExportRow {
  username: string;
  fullName?: string;
  team: string;
  teamLead?: string;
  leaveType?: string;
  status?: string;
  bookedDays: Record<number, string>; // e.g. { 1: "Booked", 2: "", ... }
  bookedTimes?: Record<number, string>; // e.g. { 1: "2.30pm", 2: "", ... }
}

export interface ColumnDefinition {
  key: string;
  header: string;
  getValue: (row: EmployeeExportRow) => string;
}

// Modular columns configuration for future extensibility (e.g. Team Lead, Leave Type, Status, Notes)
export const BASE_EXPORT_COLUMNS: ColumnDefinition[] = [
  { key: "username", header: "Username", getValue: (r) => r.username },
  { key: "team", header: "Team", getValue: (r) => r.team },
];

export const OPTIONAL_EXPORT_COLUMNS: ColumnDefinition[] = [
  { key: "fullName", header: "Full Name", getValue: (r) => r.fullName || r.username },
  { key: "teamLead", header: "Team Lead", getValue: (r) => r.teamLead || "" },
  { key: "leaveType", header: "Leave Type", getValue: (r) => r.leaveType || "Annual Leave" },
  { key: "status", header: "Status", getValue: (r) => r.status || "" },
];

export function getTeamColorStyle(team: string): { bg: string; fg: string; border: string; cssClass: string } {
  const t = (team || "").toLowerCase();
  if (t.includes("ops") || t.includes("operations")) {
    return { bg: "#dcfce7", fg: "#15803d", border: "#86efac", cssClass: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" };
  }
  if (t.includes("support") || t.includes("help") || t.includes("cx") || t.includes("service")) {
    return { bg: "#fef3c7", fg: "#b45309", border: "#fde68a", cssClass: "bg-amber-500/10 text-amber-300 border-amber-500/20" };
  }
  if (t.includes("dev") || t.includes("tech") || t.includes("it") || t.includes("eng")) {
    return { bg: "#cff4fc", fg: "#055160", border: "#b6effb", cssClass: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20" };
  }
  if (t.includes("hr") || t.includes("people") || t.includes("admin")) {
    return { bg: "#fce7f3", fg: "#9d174d", border: "#fbcfe8", cssClass: "bg-pink-500/10 text-pink-300 border-pink-500/20" };
  }
  if (t.includes("sales") || t.includes("mkt") || t.includes("marketing")) {
    return { bg: "#ffedd5", fg: "#c2410c", border: "#fed7aa", cssClass: "bg-orange-500/10 text-orange-300 border-orange-500/20" };
  }
  return { bg: "#e0e7ff", fg: "#3730a3", border: "#c7d2fe", cssClass: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" };
}

export function exportMonthlyLeaves({
  rows,
  year,
  monthName,
  daysInMonth,
  format,
  currentUser
}: {
  rows: EmployeeExportRow[];
  year: number;
  monthName: string;
  daysInMonth: number;
  format: "CSV" | "XLSX";
  currentUser: string;
}) {
  const filename = `Submitted_Leaves_${monthName}_${year}_${new Date().toISOString().split("T")[0]}`;

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const mIdx = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
  const monthIndex = mIdx >= 0 ? mIdx : 0;

  // Sort rows by 1. Team, 2. Username
  const sortedRows = [...rows].sort((a, b) => {
    const teamCompare = (a.team || "").toLowerCase().localeCompare((b.team || "").toLowerCase());
    if (teamCompare !== 0) return teamCompare;
    return (a.username || "").toLowerCase().localeCompare((b.username || "").toLowerCase());
  });

  // Calculate daily totals across all employees
  const dailyTotals: Record<number, number> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    dailyTotals[d] = sortedRows.filter(r => r.bookedDays[d] === "Booked").length;
  }
  const grandTotalBookings = sortedRows.reduce((sum, r) => {
    const count = Object.values(r.bookedDays).filter(v => v === "Booked").length;
    return sum + count;
  }, 0);

  if (format === "XLSX") {
    // Helper to format cell styles using xlsx-js-style
    const cleanHex = (hex: string) => (hex || "FFFFFF").replace("#", "").toUpperCase();
    
    const createCell = (
      val: any,
      bgHex: string,
      fgHex: string,
      bold = false,
      align: "left" | "center" | "right" = "left",
      sz = 10
    ) => ({
      v: val,
      t: typeof val === "number" ? "n" : "s",
      s: {
        fill: { fgColor: { rgb: cleanHex(bgHex) } },
        font: { name: "Calibri", sz, bold, color: { rgb: cleanHex(fgHex) } },
        alignment: { horizontal: align, vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "CBD5E1" } },
          bottom: { style: "thin", color: { rgb: "CBD5E1" } },
          left: { style: "thin", color: { rgb: "CBD5E1" } },
          right: { style: "thin", color: { rgb: "CBD5E1" } }
        }
      }
    });

    const sheetData: any[][] = [];

    // Row 0: Title Banner
    const r0: any[] = [createCell(`🌴 LEAVE ROSTER & BOOKING REPORT — ${monthName.toUpperCase()} ${year}`, "#0F172A", "#38BDF8", true, "left", 14)];
    for (let i = 1; i < daysInMonth + 3; i++) r0.push(createCell("", "#0F172A", "#38BDF8"));
    sheetData.push(r0);

    // Row 1: Subtitle / Metadata
    const r1: any[] = [createCell(`👤 Generated By: ${currentUser}  |  📅 Export Date: ${new Date().toLocaleDateString()}  |  👥 Staff: ${sortedRows.length}  |  📊 Total Booked Days: ${grandTotalBookings}`, "#1E293B", "#CBD5E1", true, "left", 10)];
    for (let i = 1; i < daysInMonth + 3; i++) r1.push(createCell("", "#1E293B", "#CBD5E1"));
    sheetData.push(r1);

    // Row 2: Legend Row
    const r2: any[] = [createCell(`LEGEND: 🌴 [ Booked Leave ] (Green)   🏖️ [ Weekend ] (Amber)   💼 [ Working Duty Day ]`, "#F1F5F9", "#334155", true, "left", 10)];
    for (let i = 1; i < daysInMonth + 3; i++) r2.push(createCell("", "#F1F5F9", "#334155"));
    sheetData.push(r2);

    // Row 3: Spacer
    const r3: any[] = [createCell("", "#FFFFFF", "#FFFFFF")];
    for (let i = 1; i < daysInMonth + 3; i++) r3.push(createCell("", "#FFFFFF", "#FFFFFF"));
    sheetData.push(r3);

    // Row 4: Header Row 1 (Day numbers)
    const r4: any[] = [
      createCell("👤 Employee Account", "#1E1B4B", "#FFFFFF", true, "left", 11),
      createCell("👥 Team / Dept", "#1E1B4B", "#FFFFFF", true, "left", 11),
      createCell("📊 Total Booked", "#312E81", "#38BDF8", true, "center", 11),
    ];
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isWeekend = isWeekendDay(dStr);
      const bg = isWeekend ? "#475569" : "#1E1B4B";
      const fg = isWeekend ? "#FEF08A" : "#FFFFFF";
      r4.push(createCell(d, bg, fg, true, "center", 11));
    }
    sheetData.push(r4);

    // Row 5: Header Row 2 (Day Names)
    const r5: any[] = [
      createCell("Username", "#312E81", "#C7D2FE", true, "left", 10),
      createCell("Department Name", "#312E81", "#C7D2FE", true, "left", 10),
      createCell("Days Count", "#1E1B4B", "#A5B4FC", true, "center", 10),
    ];
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isWeekend = isWeekendDay(dStr);
      const dayName = getWeekdayShortName(dStr);
      const bg = isWeekend ? "#334155" : "#312E81";
      const fg = isWeekend ? "#FEF08A" : "#E0E7FF";
      r5.push(createCell(dayName, bg, fg, true, "center", 9));
    }
    sheetData.push(r5);

    // Data Rows
    sortedRows.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      const baseBg = isEven ? "#FFFFFF" : "#F8FAFC";
      const userBookedCount = Object.values(r.bookedDays).filter(v => v === "Booked").length;
      const teamStyle = getTeamColorStyle(r.team);

      const rowCells: any[] = [
        createCell(r.username, baseBg, "#0F172A", true, "left", 10),
        createCell(r.team, teamStyle.bg, teamStyle.fg, true, "left", 10),
        createCell(
          userBookedCount > 0 ? `${userBookedCount} days` : "-",
          userBookedCount > 0 ? "#DBEAFE" : baseBg,
          userBookedCount > 0 ? "#1E40AF" : "#94A3B8",
          true,
          "center",
          10
        )
      ];

      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const isWeekend = isWeekendDay(dStr);
        const isBooked = r.bookedDays[d] === "Booked";

        if (isBooked) {
          const timeStr = r.bookedTimes && r.bookedTimes[d] ? ` (${r.bookedTimes[d]})` : " (2.30pm)";
          rowCells.push(createCell(`🌴 Booked${timeStr}`, "#DCFCE7", "#15803D", true, "center", 8));
        } else if (isWeekend) {
          rowCells.push(createCell("Weekend", "#FEF3C7", "#B45309", false, "center", 9));
        } else {
          rowCells.push(createCell("·", baseBg, "#CBD5E1", false, "center", 9));
        }
      }

      sheetData.push(rowCells);
    });

    // Summary Total Row
    const totalRowCells: any[] = [
      createCell("TOTAL DAILY BOOKINGS", "#0F172A", "#38BDF8", true, "left", 11),
      createCell("ALL TEAMS SUMMARY", "#0F172A", "#A5B4FC", true, "left", 10),
      createCell(grandTotalBookings, "#1E1B4B", "#38BDF8", true, "center", 11)
    ];

    for (let d = 1; d <= daysInMonth; d++) {
      const tot = dailyTotals[d] || 0;
      const bg = tot > 0 ? "#15803D" : "#0F172A";
      const fg = tot > 0 ? "#FFFFFF" : "#64748B";
      totalRowCells.push(createCell(tot, bg, fg, true, "center", 10));
    }
    sheetData.push(totalRowCells);

    // Convert 2D cell array to worksheet object
    const worksheet: any = {};
    sheetData.forEach((row, rIdx) => {
      row.forEach((cellObj, cIdx) => {
        const cellRef = XLSXStyle.utils.encode_cell({ r: rIdx, c: cIdx });
        worksheet[cellRef] = cellObj;
      });
    });

    // Set sheet range !ref
    worksheet["!ref"] = XLSXStyle.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: sheetData.length - 1, c: daysInMonth + 2 }
    });

    // Merges for rows 0, 1, 2, 3
    worksheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: daysInMonth + 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: daysInMonth + 2 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: daysInMonth + 2 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: daysInMonth + 2 } }
    ];

    // Column widths
    worksheet["!cols"] = [
      { wch: 20 }, // Username
      { wch: 18 }, // Team
      { wch: 16 }, // Total Booked
      ...Array.from({ length: daysInMonth }, () => ({ wch: 18 }))
    ];

    // Freeze Panes: Freeze employee name and team (Columns A & B) and top header rows (Rows 1-6)
    worksheet["!views"] = [
      { state: "frozen", xSplit: 2, ySplit: 6, topLeftCell: "C7", activePane: "bottomRight" }
    ];
    worksheet["!freeze"] = { xSplit: "2", ySplit: "6" };

    const workbook = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(workbook, worksheet, `${monthName} ${year}`);
    XLSXStyle.writeFile(workbook, `${filename}.xlsx`);
  } else {
    // CSV Export
    const lines: string[] = [];
    lines.push(`# GOOGLE SHEETS / EXCEL MASTER REPORT — LEAVE BOOKINGS`);
    lines.push(`# Period: ${monthName} ${year}`);
    lines.push(`# Generated By: ${currentUser} | Date: ${new Date().toISOString()}`);
    lines.push(`# Total Staff: ${sortedRows.length} | Total Requested Days: ${grandTotalBookings}`);
    lines.push(`# Legend: [Booked] = Approved/Submitted Leave Day | [Weekend] = Non-working Saturday/Sunday`);
    lines.push("");

    const headers1 = ["Username", "Team", "Total Days Booked", ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1))];
    const headers2 = ["Account", "Department", "Days Summary", ...Array.from({ length: daysInMonth }, (_, i) => {
      const dStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      return getWeekdayShortName(dStr);
    })];

    lines.push(headers1.map(escapeCSVField).join(","));
    lines.push(headers2.map(escapeCSVField).join(","));

    sortedRows.forEach(r => {
      const userBookedCount = Object.values(r.bookedDays).filter(v => v === "Booked").length;
      const dayVals = Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1;
        const dStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const isWeekend = isWeekendDay(dStr);
        if (r.bookedDays[d] === "Booked") {
          const timeStr = r.bookedTimes && r.bookedTimes[d] ? ` (${r.bookedTimes[d]})` : " (2.30pm)";
          return `Booked${timeStr}`;
        }
        if (isWeekend) return "Weekend";
        return "";
      });

      const fullRow = [r.username, r.team, userBookedCount > 0 ? `${userBookedCount} days` : "0 days", ...dayVals];
      lines.push(fullRow.map(escapeCSVField).join(","));
    });

    // Summary row
    const summaryDayVals = Array.from({ length: daysInMonth }, (_, i) => String(dailyTotals[i + 1] || 0));
    const summaryRow = ["TOTAL BOOKINGS", "ALL TEAMS", `${grandTotalBookings} days`, ...summaryDayVals];
    lines.push(summaryRow.map(escapeCSVField).join(","));

    downloadCSVFile(lines.join("\n"), `${filename}.csv`);
  }
}

/**
 * Exports Leave Requests with system metadata block.
 */
export function exportRequestsToCSV(requests: LeaveRequest[], scopeTitle: string, currentUser: string) {
  const lines: string[] = [];

  lines.push("# ==========================================================================");
  lines.push(`# SYSTEM DATA EXPORT: ${scopeTitle.toUpperCase()}`);
  lines.push(`# Generated At: ${new Date().toISOString()}`);
  lines.push(`# Exported By: ${currentUser}`);
  lines.push("# Platform: Workforce Leave Scheduling Roster & Policy Coordinator");
  lines.push("# ==========================================================================");
  lines.push("");

  const headers = [
    "Request ID",
    "Employee Name",
    "Username",
    "Team",
    "Team Lead",
    "Leave Type",
    "Start Date",
    "End Date",
    "Total Days",
    "Status",
    "Priority Score",
    "Reason",
    "Created At"
  ];
  lines.push(headers.map(escapeCSVField).join(","));

  requests.forEach((r) => {
    const row = [
      r.requestId,
      r.fullName || r.username,
      r.username,
      r.team,
      r.leaveType || "Annual Leave",
      r.startDate,
      r.endDate,
      r.totalDays,
      r.status,
      r.reason || "",
      r.createdAt
    ];
    lines.push(row.map(escapeCSVField).join(","));
  });

  const content = lines.join("\n");
  const baseFilename = scopeTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  downloadCSVFile(content, `leave_export_${baseFilename}_${new Date().toISOString().split("T")[0]}.csv`);
}

/**
 * Exports Staff Registry
 */
export function exportUsersToCSV(users: UserProfile[], currentUser: string) {
  const lines: string[] = [];

  lines.push("# ==========================================================================");
  lines.push("# SYSTEM DATA EXPORT: STAFF REGISTRY");
  lines.push(`# Generated At: ${new Date().toISOString()}`);
  lines.push(`# Exported By: ${currentUser}`);
  lines.push("# ==========================================================================");
  lines.push("");

  const headers = [
    "Full Name",
    "Username",
    "Role",
    "Team",
    "Status"
  ];
  lines.push(headers.map(escapeCSVField).join(","));

  users.forEach((u) => {
    const row = [
      u.fullName || u.username,
      u.username,
      u.role,
      u.team,
      u.status || "active"
    ];
    lines.push(row.map(escapeCSVField).join(","));
  });

  const content = lines.join("\n");
  downloadCSVFile(content, `staff_registry_export_${new Date().toISOString().split("T")[0]}.csv`);
}

/**
 * Exports Security Audit Log Registry
 */
export function exportLogsToCSV(logs: AuditLog[], currentUser: string) {
  const lines: string[] = [];

  lines.push("# ==========================================================================");
  lines.push("# SYSTEM DATA EXPORT: AUDIT TRAILS & OPERATIONS JOURNAL");
  lines.push(`# Generated At: ${new Date().toISOString()}`);
  lines.push(`# Exported By: ${currentUser}`);
  lines.push("# ==========================================================================");
  lines.push("");

  const headers = [
    "Log ID",
    "Admin ID",
    "Admin Name",
    "Acting Identity",
    "Target User",
    "Action Class Trigger",
    "Previous Values",
    "New Values",
    "Detailed Event Description",
    "ISO Timestamp",
    "IP Address"
  ];
  lines.push(headers.map(escapeCSVField).join(","));

  logs.forEach((l) => {
    const row = [
      l.logId,
      l.adminId || "",
      l.adminName || "",
      l.username,
      l.targetUser || "",
      l.action,
      l.previousValues || "",
      l.newValues || "",
      l.details,
      l.timestamp,
      l.ipAddress || "127.0.0.1"
    ];
    lines.push(row.map(escapeCSVField).join(","));
  });

  const content = lines.join("\n");
  downloadCSVFile(content, `audit_trails_export_${new Date().toISOString().split("T")[0]}.csv`);
}
