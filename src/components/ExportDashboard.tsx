import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Search,
  CheckCircle2,
  FileText,
  TrendingUp,
  Clock,
  ShieldAlert,
  Users,
  Sparkles,
  Maximize2,
  Minimize2,
  Radio,
  Zap,
  ExternalLink,
  RefreshCw,
  Layers,
  Database,
  ArrowUpRight,
  Activity,
  ShieldCheck,
  Check,
  Lock,
  Unlock
} from "lucide-react";
import { UserProfile, ExportRecord, GoogleSheetsSyncConfig, GoogleSheetsSyncLog, BookingWindow, isWeekendDay, getWeekdayShortName } from "../types";
import { exportMonthlyLeaves, EmployeeExportRow, getTeamColorStyle } from "../utils/exportUtils";

interface ExportDashboardProps {
  currentUser: UserProfile;
  isDarkMode?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

declare global {
  interface Window {
    google?: any;
  }
}

export default function ExportDashboard({ currentUser, isDarkMode = false }: ExportDashboardProps) {
  // Security guard check: Administrator only (OPS Manager role removed)
  const isAuthorized = currentUser.role === "ADMIN";

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth());
  const [bookingWindows, setBookingWindows] = useState<BookingWindow[]>([]);
  const [hasUserManuallySelectedMonth, setHasUserManuallySelectedMonth] = useState<boolean>(false);
  const [daysInMonth, setDaysInMonth] = useState<number>(31);
  const [employeeRows, setEmployeeRows] = useState<EmployeeExportRow[]>([]);
  const [summary, setSummary] = useState<{
    totalEmployees: number;
    employeesWithBookings: number;
    totalSubmittedRequests: number;
    totalBookedDaysAcrossEmployees: number;
    teamBreakdown: Record<string, { employeeCount: number; requestCount: number; bookedDays: number }>;
  }>({
    totalEmployees: 0,
    employeesWithBookings: 0,
    totalSubmittedRequests: 0,
    totalBookedDaysAcrossEmployees: 0,
    teamBreakdown: {}
  });

  const [exportHistory, setExportHistory] = useState<ExportRecord[]>([]);
  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsSyncConfig | null>(null);
  const [syncLogs, setSyncLogs] = useState<GoogleSheetsSyncLog[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  // Fetch Booking Windows to automatically select the active open month
  const fetchBookingWindows = async () => {
    try {
      const res = await fetch("/api/booking-windows");
      if (res.ok) {
        const data = await res.json();
        const windows: BookingWindow[] = data.bookingWindows || [];
        setBookingWindows(windows);

        // Find active open windows (where isOpen is true or status is OPEN)
        const openWindows = windows.filter(w => w.isOpen || w.status === "OPEN");
        if (openWindows.length > 0) {
          // Sort to find the primary open month
          const sorted = [...openWindows].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
          const targetOpen = sorted[0];

          // Auto-select this month unless the admin has already explicitly switched months
          setHasUserManuallySelectedMonth((prevManuallySet) => {
            if (!prevManuallySet) {
              setSelectedYear(targetOpen.year);
              setSelectedMonth(targetOpen.month);
            }
            return prevManuallySet;
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch booking windows for auto-selection:", err);
    }
  };

  // Fetch submitted leaves for target Year & Month (supports silent polling for zero UI flicker)
  const fetchLeaves = async (year: number, month: number, isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch(`/api/exports/submitted-leaves?year=${year}&month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setEmployeeRows(data.employeeRows || []);
        setDaysInMonth(data.daysInMonth || 31);
        setSummary(data.summary || {
          totalEmployees: 0,
          employeesWithBookings: 0,
          totalSubmittedRequests: 0,
          totalBookedDaysAcrossEmployees: 0,
          teamBreakdown: {}
        });
      }
    } catch (err) {
      console.error("Failed to fetch submitted leave export data:", err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  // Fetch Export History
  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/exports/history");
      if (res.ok) {
        const data = await res.json();
        setExportHistory(data.history || []);
      }
    } catch (err) {
      console.error("Failed to fetch export history:", err);
    }
  };

  // Fetch Google Sheets Sync Config & Live Logs
  const fetchSheetsConfig = async () => {
    try {
      const res = await fetch("/api/sheets/config");
      if (res.ok) {
        const data = await res.json();
        setSheetsConfig(data.config);
        setSyncLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch sheets sync config:", err);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchBookingWindows();
      fetchLeaves(selectedYear, selectedMonth, false);
      fetchHistory();
      fetchSheetsConfig();

      // Real-time background sync loop (polls every 2.5s so roster and sync logs update instantly)
      const pollInterval = setInterval(() => {
        fetchLeaves(selectedYear, selectedMonth, true);
        fetchSheetsConfig();
      }, 2500);

      return () => clearInterval(pollInterval);
    }
  }, [selectedYear, selectedMonth, isAuthorized]);

  // Handle ESC key to exit full screen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullScreen]);

  // Google Sheets OAuth 2.0 Authorization Connect flow
  const handleConnectGoogleSheets = () => {
    if (typeof window !== "undefined" && window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: "674504098948-example.apps.googleusercontent.com",
          scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
          callback: async (response: any) => {
            if (response.access_token) {
              await fetch("/api/sheets/auth-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  accessToken: response.access_token,
                  userEmail: `${currentUser.username}@adwords.system`
                })
              });
              await fetchSheetsConfig();
              setToastMessage("✅ Google Sheets synchronization connected with OAuth 2.0 token!");
              setTimeout(() => setToastMessage(null), 4000);
            }
          }
        });
        client.requestAccessToken();
      } catch (e) {
        console.warn("GIS token client popup trigger:", e);
      }
    } else {
      // Fallback direct reconnect ping
      handleManualFullSync();
    }
  };

  // Trigger Full Master Resync to Google Sheets
  const handleManualFullSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sheets/sync-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          performedBy: currentUser.username,
          year: selectedYear,
          month: selectedMonth
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSheetsConfig(data.config);
        setSyncLogs(data.logs || []);
        setToastMessage(`✅ Successfully synchronized ${MONTH_NAMES[selectedMonth]} ${selectedYear} to Google Sheets in real-time!`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err) {
      console.error("Manual sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className={`p-8 text-center rounded-2xl border ${isDarkMode ? "bg-red-950/20 border-red-500/30 text-red-300" : "bg-red-50 border-red-200 text-red-800"}`}>
        <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-red-500" />
        <h2 className="text-xl font-bold mb-2">Access Restricted</h2>
        <p className="text-xs max-w-md mx-auto">
          The Google Sheets Export & Sync Module is restricted strictly to Administrators, Operations Managers, HR, and Team Leads. Your role ({currentUser.role}) does not have permission to access export logs.
        </p>
      </div>
    );
  }

  // Filter employee rows for live preview table (sorted by Team, then Username)
  const filteredRows = employeeRows.filter(r => {
    const matchesSearch =
      r.username.toLowerCase().includes(search.toLowerCase()) ||
      (r.fullName && r.fullName.toLowerCase().includes(search.toLowerCase())) ||
      r.team.toLowerCase().includes(search.toLowerCase());

    const matchesTeam = selectedTeamFilter === "ALL" || r.team === selectedTeamFilter;

    return matchesSearch && matchesTeam;
  });

  const handleExport = async (format: "CSV" | "XLSX") => {
    if (filteredRows.length === 0) {
      setToastMessage("⚠️ No employee records available for export in this selection.");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    const monthName = MONTH_NAMES[selectedMonth];

    // Trigger client-side download with submitted leave data
    exportMonthlyLeaves({
      rows: filteredRows,
      year: selectedYear,
      monthName,
      daysInMonth,
      format,
      currentUser: currentUser.username
    });

    // Record export log to server
    try {
      const res = await fetch("/api/exports/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          performedBy: currentUser.username,
          year: selectedYear,
          month: selectedMonth,
          monthName,
          format,
          recordCount: filteredRows.length,
          totalApprovedDays: summary.totalBookedDaysAcrossEmployees
        })
      });

      if (res.ok) {
        const data = await res.json();
        setExportHistory(data.history || []);
        setToastMessage(`✅ Successfully generated backup ${format} file for ${monthName} ${selectedYear}!`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err) {
      console.error("Failed to log export event:", err);
    }
  };

  const dayHeaderList = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-6 font-sans" id="export-dashboard-root">
      {/* Toast Notification */}
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center justify-between shadow-xl"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        </motion.div>
      )}

      {/* Header Banner */}
      <div className={`p-6 rounded-2xl border ${isDarkMode ? "bg-slate-900/60 border-white/10" : "bg-white border-slate-300 shadow-sm"}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">Google Sheets Live Synchronization Hub</h1>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                  <Radio className="w-3 h-3 text-emerald-400 animate-pulse" /> LIVE AUTO-SYNC
                </span>
              </div>
              <p className={`text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                Near real-time bidirectional synchronization between database and live Google Sheets. Database is the single source of truth; Google Sheets automatically mirrors all booking changes.
              </p>
            </div>
          </div>

          {/* Controls: Year & Month Selectors with Active Open Month default */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {(() => {
              const openWindows = bookingWindows.filter(w => w.isOpen || w.status === "OPEN");
              const sorted = [...openWindows].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
              const primaryOpen = sorted[0];

              if (primaryOpen) {
                const isViewingOpen = selectedMonth === primaryOpen.month && selectedYear === primaryOpen.year;
                if (isViewingOpen) {
                  return (
                    <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                      isDarkMode ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-300 text-emerald-800"
                    }`}>
                      <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Viewing Open Month: {MONTH_NAMES[primaryOpen.month]} {primaryOpen.year}</span>
                    </span>
                  );
                } else {
                  return (
                    <button
                      onClick={() => {
                        setHasUserManuallySelectedMonth(false);
                        setSelectedMonth(primaryOpen.month);
                        setSelectedYear(primaryOpen.year);
                      }}
                      className={`text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                        isDarkMode ? "bg-slate-900 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/40" : "bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50 shadow-sm"
                      }`}
                    >
                      <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Jump to Open Month ({MONTH_NAMES[primaryOpen.month]} {primaryOpen.year})</span>
                    </button>
                  );
                }
              } else {
                return (
                  <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1.5 rounded-xl border flex items-center gap-1 ${
                    isDarkMode ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-red-50 border-red-200 text-red-800"
                  }`}>
                    <Lock className="w-3 h-3" />
                    <span>All Windows Closed</span>
                  </span>
                );
              }
            })()}

            <div className={`flex items-center gap-1.5 p-1.5 rounded-xl border ${
              isDarkMode ? "bg-slate-950/40 border-white/10" : "bg-slate-100 border-slate-300"
            }`}>
              <Calendar className="w-4 h-4 text-emerald-500 ml-2" />
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setHasUserManuallySelectedMonth(true);
                  setSelectedMonth(parseInt(e.target.value));
                }}
                className={`p-2 rounded-lg text-xs font-mono font-bold bg-transparent border-none focus:outline-none ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {MONTH_NAMES.map((m, idx) => {
                  const isOpen = bookingWindows.some(w => w.year === selectedYear && w.month === idx && (w.isOpen || w.status === "OPEN"));
                  return (
                    <option key={idx} value={idx} className={isDarkMode ? "bg-slate-900 text-white" : "bg-white text-slate-900"}>
                      {m} {isOpen ? "• (OPEN)" : ""}
                    </option>
                  );
                })}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => {
                  setHasUserManuallySelectedMonth(true);
                  setSelectedYear(parseInt(e.target.value));
                }}
                className={`p-2 rounded-lg text-xs font-mono font-bold bg-transparent border-none focus:outline-none ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {[2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                  <option key={y} value={y} className={isDarkMode ? "bg-slate-900 text-white" : "bg-white text-slate-900"}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`p-5 rounded-2xl border ${isDarkMode ? "bg-slate-900/50 border-white/10" : "bg-white border-slate-300 shadow-sm"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-mono uppercase tracking-widest font-bold ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
              Registered Staff Roster
            </span>
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black">{summary.totalEmployees} <span className="text-sm font-normal text-slate-400">employees</span></div>
          <p className={`text-[10px] mt-1 font-mono ${isDarkMode ? "text-slate-500" : "text-slate-600"}`}>
            {summary.employeesWithBookings} with leave requested in {MONTH_NAMES[selectedMonth]} {selectedYear}
          </p>
        </div>

        <div className={`p-5 rounded-2xl border ${isDarkMode ? "bg-slate-900/50 border-white/10" : "bg-white border-slate-300 shadow-sm"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-mono uppercase tracking-widest font-bold ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
              Total Requested Days
            </span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-black text-cyan-400">{summary.totalBookedDaysAcrossEmployees} <span className="text-sm font-normal text-slate-400">days</span></div>
          <p className={`text-[10px] mt-1 font-mono ${isDarkMode ? "text-slate-500" : "text-slate-600"}`}>
            {summary.totalSubmittedRequests} submitted leave requests synced
          </p>
        </div>

        <div className={`p-5 rounded-2xl border ${isDarkMode ? "bg-slate-900/50 border-white/10" : "bg-white border-slate-300 shadow-sm"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-mono uppercase tracking-widest font-bold ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
              Team Breakdown
            </span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {Object.keys(summary.teamBreakdown).length > 0 ? (
              Object.entries(summary.teamBreakdown).map(([teamName, stats]: [string, any]) => (
                <span
                  key={teamName}
                  className="text-[10px] font-mono px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold"
                >
                  {teamName}: {stats.employeeCount} staff ({stats.bookedDays}d)
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500 font-mono">No team leave data</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Preview Table Panel */}
      <div className={
        isFullScreen
          ? `fixed inset-0 z-50 p-4 md:p-6 flex flex-col h-screen w-screen overflow-hidden ${
              isDarkMode ? "bg-slate-950 text-white" : "bg-slate-900 text-white"
            }`
          : `p-6 rounded-2xl border ${isDarkMode ? "bg-slate-900/60 border-white/10" : "bg-white border-slate-300 shadow-sm"}`
      }>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 shrink-0">
          <div>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2 flex-wrap">
              <span>Live Roster Mirror ({MONTH_NAMES[selectedMonth]} {selectedYear})</span>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {filteredRows.length} employees ({daysInMonth} days)
              </span>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 animate-pulse">
                <Radio className="w-3 h-3 text-cyan-400" />
                Live Google Sheet Mirror
              </span>
            </h2>
            <p className={`text-xs ${isDarkMode || isFullScreen ? "text-slate-400" : "text-slate-600"}`}>
              Showing one row per employee, sorted by Team then Username. Auto-refreshes in real-time when anyone submits, approves, or cancels leave.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search employee, team..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`pl-8 pr-3 py-2 border rounded-xl text-xs font-mono transition-all ${
                  isDarkMode || isFullScreen ? "bg-slate-950 border-white/10 text-white focus:border-cyan-500" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              />
            </div>

            {/* Team Filter */}
            <select
              value={selectedTeamFilter}
              onChange={(e) => setSelectedTeamFilter(e.target.value)}
              className={`p-2 border rounded-xl text-xs font-mono transition-all ${
                isDarkMode || isFullScreen ? "bg-slate-950 border-white/10 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
              }`}
            >
              <option value="ALL">All Teams</option>
              {Object.keys(summary.teamBreakdown).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {/* Manual Export Buttons (Backup Option) */}
            <div className={`flex items-center gap-1.5 pl-2 border-l ${isDarkMode || isFullScreen ? "border-white/10" : "border-slate-300"}`}>
              <button
                onClick={() => handleExport("XLSX")}
                title="Download backup Excel workbook"
                className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] border ${
                  isDarkMode || isFullScreen
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-white/10"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300"
                }`}
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>Backup XLSX</span>
              </button>

              <button
                onClick={() => handleExport("CSV")}
                title="Download backup CSV file"
                className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] border ${
                  isDarkMode || isFullScreen
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-white/10"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300"
                }`}
              >
                <Download className="w-3.5 h-3.5 text-blue-500" />
                <span>CSV</span>
              </button>
            </div>

            {/* Full Screen Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className={`px-3.5 py-2 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] ${
                isFullScreen
                  ? "bg-amber-500 hover:bg-amber-400 text-black border-amber-400 font-extrabold shadow-lg shadow-amber-500/20"
                  : isDarkMode
                  ? "bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-500/30 hover:border-cyan-400"
                  : "bg-white hover:bg-slate-100 text-cyan-800 border-cyan-300"
              }`}
            >
              {isFullScreen ? (
                <>
                  <Minimize2 className="w-4 h-4" />
                  <span>Exit Full Screen (ESC)</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4" />
                  <span>Full Screen View</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Legend Bar */}
        <div className={`mb-4 p-3 rounded-xl border flex flex-wrap items-center justify-between text-xs font-mono gap-3 shrink-0 ${
          isDarkMode || isFullScreen ? "bg-slate-950/90 border-white/10 text-slate-300" : "bg-slate-50 border-slate-300 text-slate-700"
        }`}>
          <div className="flex flex-wrap items-center gap-4">
            <span className={`font-bold uppercase tracking-wider text-[10px] ${isDarkMode || isFullScreen ? "text-slate-400" : "text-slate-600"}`}>Sheet Format Legend:</span>
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-bold text-[11px] border ${
              isDarkMode || isFullScreen ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-emerald-100 text-emerald-800 border-emerald-300"
            }`}>
              🌴 Booked Leave
            </span>
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-bold text-[11px] border ${
              isDarkMode || isFullScreen ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-amber-100 text-amber-800 border-amber-300"
            }`}>
              🏖️ Weekend (Sat/Sun)
            </span>
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border ${
              isDarkMode || isFullScreen ? "bg-slate-800/50 text-slate-400 border-slate-700/50" : "bg-slate-200 text-slate-700 border-slate-300 font-semibold"
            }`}>
              💼 Duty / Working Day
            </span>
          </div>

          <div className={`text-[10px] font-sans flex items-center gap-2 ${isDarkMode || isFullScreen ? "text-slate-400" : "text-slate-600"}`}>
            <span>Freeze Panes Active (Username & Team columns frozen in Google Sheets)</span>
            {isFullScreen && <span className="text-amber-400 font-mono font-bold">Press ESC to exit</span>}
          </div>
        </div>

        {/* Dynamic Day Grid Table */}
        <div className={`rounded-xl border black-white-scrollbar ${
          isDarkMode || isFullScreen ? "border-white/10" : "border-slate-300"
        } ${
          isFullScreen ? "flex-1 overflow-auto" : "overflow-x-auto"
        }`}>
          <table className="w-full text-left text-xs font-sans border-collapse min-w-[800px]">
            <thead className={`sticky top-0 z-30 font-mono text-[10px] uppercase tracking-wider ${
              isDarkMode || isFullScreen ? "bg-slate-950 text-slate-400" : "bg-slate-100 text-slate-700"
            }`}>
              <tr>
                <th className={`p-2.5 border-b border-r w-[130px] min-w-[130px] sticky top-0 left-0 z-40 ${
                  isDarkMode || isFullScreen ? "border-white/10 bg-slate-950 text-slate-300" : "border-slate-300 bg-slate-100 text-slate-800"
                }`}>Username</th>
                <th className={`p-2.5 border-b border-r w-[120px] min-w-[120px] sticky top-0 left-[130px] z-40 ${
                  isDarkMode || isFullScreen ? "border-white/10 bg-slate-950 text-slate-300" : "border-slate-300 bg-slate-100 text-slate-800"
                }`}>Team</th>
                {dayHeaderList.map(d => {
                  const dStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const isWeekend = isWeekendDay(dStr);
                  const shortName = getWeekdayShortName(dStr);
                  return (
                    <th key={d} className={`p-2 border-b border-r text-center min-w-[36px] font-bold sticky top-0 z-30 ${
                      isDarkMode || isFullScreen ? "border-white/10" : "border-slate-300"
                    } ${
                      isWeekend
                        ? (isDarkMode || isFullScreen ? "bg-amber-950/80 text-amber-300" : "bg-amber-100 text-amber-900")
                        : (isDarkMode || isFullScreen ? "bg-slate-950 text-slate-400" : "bg-slate-100 text-slate-700")
                    }`}>
                      <div>{d}</div>
                      <div className="text-[8px] opacity-70 font-normal">{isWeekend ? shortName : ""}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode || isFullScreen ? "divide-white/5" : "divide-slate-200"}`}>
              {loading ? (
                <tr>
                  <td colSpan={daysInMonth + 2} className="p-8 text-center text-slate-400 font-mono">
                    Loading submitted leave export data...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 2} className="p-8 text-center text-slate-500 font-mono">
                    No active employees matching filters for {MONTH_NAMES[selectedMonth]} {selectedYear}.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const teamStyle = getTeamColorStyle(r.team);
                  return (
                    <tr key={r.username} className={`hover:${isDarkMode || isFullScreen ? "bg-slate-800/40" : "bg-slate-50"} transition-colors`}>
                      <td className={`p-2.5 font-mono font-bold border-r sticky left-0 z-10 w-[130px] min-w-[130px] ${
                        isDarkMode || isFullScreen ? "border-white/10 bg-slate-900 text-slate-200" : "border-slate-300 bg-white text-slate-900"
                      }`}>
                        {r.username}
                      </td>
                      <td className={`p-2.5 border-r font-medium sticky left-[130px] z-10 w-[120px] min-w-[120px] ${
                        isDarkMode || isFullScreen ? "border-white/10 bg-slate-900 text-slate-200" : "border-slate-300 bg-white text-slate-900"
                      }`}>
                        <span className={`px-2 py-0.5 rounded font-mono font-bold border text-[11px] ${teamStyle.cssClass}`}>
                          {r.team}
                        </span>
                      </td>
                      {dayHeaderList.map(d => {
                        const isBooked = r.bookedDays[d] === "Booked";
                        const dStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                        const isWeekend = isWeekendDay(dStr);

                        return (
                          <td key={d} className={`p-1 border-r text-center ${
                            isDarkMode || isFullScreen ? "border-white/5" : "border-slate-200"
                          } ${
                            isWeekend && !isBooked ? (isDarkMode || isFullScreen ? "bg-slate-950/40" : "bg-slate-100/50") : ""
                          }`}>
                            {isBooked ? (
                              <span
                                className={`px-1 py-0.5 rounded text-[8px] font-mono font-bold block whitespace-nowrap shadow-sm border ${
                                  isDarkMode || isFullScreen
                                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                    : "bg-emerald-100 text-emerald-800 border-emerald-300"
                                }`}
                                title={r.bookedTimes && r.bookedTimes[d] ? `Booked at ${r.bookedTimes[d]}` : "Booked"}
                              >
                                {r.bookedTimes && r.bookedTimes[d] ? `Booked (${r.bookedTimes[d]})` : "Booked (2.30pm)"}
                              </span>
                            ) : isWeekend ? (
                              <span className={`text-[8px] font-mono font-semibold ${isDarkMode || isFullScreen ? "text-amber-500/40" : "text-amber-700/60"}`}>Wkd</span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export Audit History Table (Backup Option Log) */}
      <div className={`p-6 rounded-2xl border ${isDarkMode ? "bg-slate-900/60 border-white/10" : "bg-white border-slate-300 shadow-sm"}`}>
        <h2 className="text-lg font-bold tracking-tight mb-1 flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-400" />
          <span>Manual File Export History (Backup Option)</span>
        </h2>
        <p className={`text-xs mb-4 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
          Backup export records generated on-demand as XLSX or CSV workbooks.
        </p>

        <div className={`overflow-x-auto rounded-xl border ${isDarkMode ? "border-white/10" : "border-slate-300"}`}>
          <table className="w-full text-left text-xs font-sans">
            <thead className={`font-mono text-[10px] uppercase tracking-wider ${isDarkMode ? "bg-slate-950 text-slate-400" : "bg-slate-100 text-slate-700"}`}>
              <tr>
                <th className="p-3">Export ID</th>
                <th className="p-3">Generated By</th>
                <th className="p-3">Target Period</th>
                <th className="p-3">Format</th>
                <th className="p-3">Employees Included</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? "divide-white/5" : "divide-slate-200"}`}>
              {exportHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500 font-mono">
                    No manual file export logs recorded.
                  </td>
                </tr>
              ) : (
                exportHistory.map((exp) => (
                  <tr key={exp.exportId} className={`hover:${isDarkMode ? "bg-slate-800/40" : "bg-slate-50"}`}>
                    <td className={`p-3 font-mono ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>{exp.exportId}</td>
                    <td className="p-3 font-bold">{exp.performedBy}</td>
                    <td className="p-3 font-mono">{exp.monthName} {exp.year}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                        exp.format === "XLSX" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      }`}>
                        {exp.format}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold">{exp.recordCount} staff</td>
                    <td className={`p-3 font-mono ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>{new Date(exp.timestamp).toLocaleString()}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                        isDarkMode ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        SUCCESS
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
