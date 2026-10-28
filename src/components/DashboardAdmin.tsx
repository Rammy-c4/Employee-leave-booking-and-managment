import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Users, Shield, Calendar, Search, 
  FileSpreadsheet, UserPlus, Trash2, 
  Layers, History, CheckCircle2, AlertCircle, RefreshCw, Filter,
  CalendarPlus, Check, X, Clock
} from "lucide-react";
import { UserProfile, AuditLog, Team, Role, LeaveRequest, formatDateToWords, getDatesInRange } from "../types";

import AddUserModal from "./AddUserModal";
import EditUserModal from "./EditUserModal";
import AddAccruedLeaveModal from "./AddAccruedLeaveModal";
import ExportDashboard from "./ExportDashboard";
import AuditLogsViewer from "./AuditLogsViewer";
import BookingWindowManager from "./BookingWindowManager";

interface AdminProps {
  profile: UserProfile;
  onLogout: () => void;
  onReset?: () => void;
  onSimulateTime?: () => void;
  rollingWindow?: any;
  isDarkMode?: boolean;
}

export default function DashboardAdmin({ profile, onLogout, isDarkMode = false }: AdminProps) {
  const [users, setUsers] = useState<Record<string, UserProfile>>({});
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeTab, setActiveTab] = useState<"bookings" | "windows" | "export" | "users" | "logs">("bookings");
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Filter state for Monitor Bookings
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved">("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modals state
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserProfile | null>(null);
  const [selectedUserForAccrual, setSelectedUserForAccrual] = useState<UserProfile | null>(null);

  // Load all data
  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [reqRes, usersRes, teamsRes, rolesRes] = await Promise.all([
        fetch("/api/leave/requests?role=ADMIN"),
        fetch("/api/admin/users"),
        fetch("/api/admin/teams"),
        fetch("/api/admin/roles")
      ]);

      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequests(reqData.requests || reqData.bookings || []);
      }
      if (usersRes.ok) {
        const uData = await usersRes.json();
        setUsers(uData.users || {});
      }
      if (teamsRes.ok) {
        const tData = await teamsRes.json();
        setTeams(tData.teams || []);
      }
      if (rolesRes.ok) {
        const rData = await rolesRes.json();
        setRoles(rData.roles || []);
      }
    } catch (err) {
      console.error("Error loading admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [profile.username]);

  // Admin approval: Deducts exact days from accruedLeaveDays
  const handleApproveRequest = async (requestId: string) => {
    try {
      setActionLoadingId(requestId);
      const res = await fetch("/api/leave/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action: "approved",
          reviewer: profile.username
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to approve leave request.");
        return;
      }
      await fetchAdminData();
      window.dispatchEvent(new CustomEvent("leave-request-updated"));
    } catch (err) {
      console.error("Error approving request:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Admin denial: No deduction to accruedLeaveDays
  const handleDenyRequest = async (requestId: string) => {
    try {
      setActionLoadingId(requestId);
      const res = await fetch("/api/leave/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action: "denied",
          reviewer: profile.username
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to deny leave request.");
        return;
      }
      await fetchAdminData();
      window.dispatchEvent(new CustomEvent("leave-request-updated"));
    } catch (err) {
      console.error("Error denying request:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Admin override: Cancel booking (refunds accrued days if previously approved)
  const handleAdminCancelBooking = async (requestId: string) => {
    try {
      const res = await fetch("/api/leave/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, username: profile.username })
      });

      if (res.ok) {
        setCancellingId(null);
        await fetchAdminData();
        window.dispatchEvent(new CustomEvent("leave-request-updated"));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to cancel booking.");
      }
    } catch (err) {
      console.error("Error cancelling booking:", err);
    }
  };

  // Pending requests count
  const pendingRequestsCount = requests.filter((r) => r.status === "pending").length;

  // Filtered active bookings
  const activeBookings = requests.filter((r) => {
    if (r.status === "cancelled") return false;
    if (statusFilter === "pending") return r.status === "pending";
    if (statusFilter === "approved") return r.status === "approved";
    return r.status !== "rejected";
  });

  const filteredBookings = activeBookings.filter((b) => {
    const matchesSearch =
      b.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.fullName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (Array.isArray(b.dates) ? b.dates.some((d) => d.includes(searchQuery)) : (b.startDate.includes(searchQuery) || b.endDate.includes(searchQuery)));

    const matchesTeam =
      selectedTeamFilter === "all" ||
      (b.team || "").toLowerCase() === selectedTeamFilter.toLowerCase();

    return matchesSearch && matchesTeam;
  });

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab("bookings")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
              activeTab === "bookings"
                ? isDarkMode
                  ? "bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/20"
                  : "bg-indigo-600 text-white border-indigo-700 shadow-md"
                : isDarkMode
                ? "bg-slate-900/60 text-slate-300 border-white/10 hover:bg-slate-800"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Monitor Bookings</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                activeTab === "bookings"
                  ? isDarkMode ? "bg-black text-cyan-400" : "bg-white text-indigo-700"
                  : isDarkMode ? "bg-slate-800 text-slate-300" : "bg-slate-200 text-slate-700"
              }`}
            >
              {activeBookings.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("windows")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
              activeTab === "windows"
                ? isDarkMode
                  ? "bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/20"
                  : "bg-indigo-600 text-white border-indigo-700 shadow-md"
                : isDarkMode
                ? "bg-slate-900/60 text-slate-300 border-white/10 hover:bg-slate-800"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Booking Windows</span>
          </button>

          <button
            onClick={() => setActiveTab("export")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
              activeTab === "export"
                ? isDarkMode
                  ? "bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/20"
                  : "bg-indigo-600 text-white border-indigo-700 shadow-md"
                : isDarkMode
                ? "bg-slate-900/60 text-slate-300 border-white/10 hover:bg-slate-800"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export</span>
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
              activeTab === "users"
                ? isDarkMode
                  ? "bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/20"
                  : "bg-indigo-600 text-white border-indigo-700 shadow-md"
                : isDarkMode
                ? "bg-slate-900/60 text-slate-300 border-white/10 hover:bg-slate-800"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Users & Teams</span>
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
              activeTab === "logs"
                ? isDarkMode
                  ? "bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/20"
                  : "bg-indigo-600 text-white border-indigo-700 shadow-md"
                : isDarkMode
                ? "bg-slate-900/60 text-slate-300 border-white/10 hover:bg-slate-800"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit Logs</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchAdminData()}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isDarkMode
                ? "bg-slate-950/60 border-white/10 text-slate-300 hover:text-white"
                : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
            }`}
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Tab Panels */}
      {activeTab === "bookings" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Monitor Bookings Table */}
          <div className="lg:col-span-2 space-y-4">
            <div
              className={`border rounded-2xl p-6 shadow-xl transition-all duration-300 ${
                isDarkMode ? "bg-slate-900/40 border-white/10" : "bg-white border-slate-300 shadow-md"
              }`}
            >
              {/* Header & Filter Controls */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-white/10">
                <div>
                  <h3 className={`text-lg font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                    <Calendar className={`w-5 h-5 ${isDarkMode ? "text-cyan-400" : "text-indigo-600"}`} />
                    <span>Workforce Leave Requests & Bookings</span>
                  </h3>
                  <p className={`text-xs mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                    Review pending requests, approve/deny with accrued balance deduction, and monitor bookings.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                  {/* Status filter tabs */}
                  <div className={`p-1 rounded-xl flex items-center gap-1 border ${
                    isDarkMode ? "bg-slate-950/80 border-white/10" : "bg-slate-100 border-slate-200"
                  }`}>
                    <button
                      onClick={() => setStatusFilter("all")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        statusFilter === "all"
                          ? isDarkMode
                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            : "bg-white text-indigo-600 shadow-sm border border-slate-200"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setStatusFilter("pending")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        statusFilter === "pending"
                          ? isDarkMode
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-white text-amber-700 shadow-sm border border-slate-200"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <span>Pending</span>
                      {pendingRequestsCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold inline-flex items-center justify-center">
                          {pendingRequestsCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setStatusFilter("approved")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        statusFilter === "approved"
                          ? isDarkMode
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-white text-emerald-700 shadow-sm border border-slate-200"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      Approved
                    </button>
                  </div>

                  {/* Search input */}
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search employee / date..."
                      className={`pl-8 pr-3 py-1.5 rounded-xl text-xs border transition-all ${
                        isDarkMode
                          ? "bg-slate-950/80 border-white/10 text-slate-200 focus:border-cyan-400"
                          : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600"
                      }`}
                    />
                  </div>

                  {/* Team filter dropdown */}
                  <select
                    value={selectedTeamFilter}
                    onChange={(e) => setSelectedTeamFilter(e.target.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      isDarkMode
                        ? "bg-slate-950/80 border-white/10 text-slate-200 focus:border-cyan-400"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600"
                    }`}
                  >
                    <option value="all">All Teams</option>
                    {teams.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bookings Table */}
              {filteredBookings.length === 0 ? (
                <div className="text-center py-16 text-slate-500 space-y-2">
                  <Calendar className="w-8 h-8 mx-auto text-slate-400 opacity-50" />
                  <p className="text-xs font-semibold">No leave requests found matching your filter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className={`border-b uppercase font-bold text-[11px] ${
                        isDarkMode ? "border-white/10 text-slate-400" : "border-slate-300 text-slate-600"
                      }`}>
                        <th className="py-3 px-2">Agent</th>
                        <th className="py-3 px-2">Team</th>
                        <th className="py-3 px-2">Requested Dates</th>
                        <th className="py-3 px-2">Days</th>
                        <th className="py-3 px-2">Accrued Balance</th>
                        <th className="py-3 px-2">Status</th>
                        <th className="py-3 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBookings.map((r) => {
                        const dates = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates : (r.startDate && r.endDate ? getDatesInRange(r.startDate, r.endDate) : [r.startDate]);
                        const isCancelling = cancellingId === r.requestId;
                        const userObj = users[r.username];
                        const agentAccrued = typeof userObj?.accruedLeaveDays === "number"
                          ? userObj.accruedLeaveDays
                          : (typeof userObj?.accrued_leave === "number" ? userObj.accrued_leave : 0);
                        const isActionLoading = actionLoadingId === r.requestId;

                        return (
                          <tr
                            key={r.requestId}
                            className={`border-b transition-all ${
                              isDarkMode ? "border-white/5 hover:bg-white/5" : "border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <td className="py-3.5 px-2 font-sans">
                              <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                                {userObj?.fullName || r.fullName || r.username}
                              </div>
                              <div className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                                @{r.username}
                              </div>
                            </td>

                            <td className="py-3.5 px-2">
                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                isDarkMode
                                  ? "bg-slate-950 text-cyan-400 border-white/10"
                                  : "bg-indigo-50 text-indigo-800 border-indigo-200"
                              }`}>
                                {r.team}
                              </span>
                            </td>

                            <td className="py-3.5 px-2 font-sans">
                              <div className="space-y-1">
                                {dates.map((d) => (
                                  <div key={d} className="font-bold text-[11px] flex items-center gap-1.5 text-indigo-600 dark:text-cyan-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-cyan-400 shrink-0" />
                                    <span>{formatDateToWords(d)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>

                            <td className="py-3.5 px-2 font-bold text-xs text-slate-800 dark:text-slate-200">
                              {r.totalDays} day{r.totalDays > 1 ? "s" : ""}
                            </td>

                            <td className="py-3.5 px-2 font-sans">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border inline-flex items-center gap-1 ${
                                  r.status === "pending" && agentAccrued < r.totalDays
                                    ? "bg-red-950/40 text-red-400 border-red-800/40"
                                    : isDarkMode
                                    ? "bg-cyan-950/50 text-cyan-300 border-cyan-800/40"
                                    : "bg-slate-100 text-slate-800 border-slate-200"
                                }`}>
                                  {agentAccrued} days
                                </span>
                              </div>
                              {r.status === "pending" && agentAccrued < r.totalDays && (
                                <span className="text-[10px] text-red-500 font-semibold block mt-0.5">
                                  Insufficient balance
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-2">
                              {r.status === "pending" ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border tracking-wider inline-flex items-center gap-1 ${
                                  isDarkMode
                                    ? "bg-amber-950/60 text-amber-400 border-amber-800/40"
                                    : "bg-amber-100 text-amber-800 border-amber-300"
                                }`}>
                                  <Clock className="w-3 h-3" />
                                  <span>Pending</span>
                                </span>
                              ) : r.status === "approved" ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border tracking-wider inline-flex items-center gap-1 ${
                                  isDarkMode
                                    ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/40"
                                    : "bg-emerald-100 text-emerald-800 border-emerald-300"
                                }`}>
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Approved</span>
                                </span>
                              ) : r.status === "denied" || r.status === "rejected" ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border tracking-wider inline-flex items-center gap-1 ${
                                  isDarkMode
                                    ? "bg-rose-950/60 text-rose-400 border-rose-800/40"
                                    : "bg-rose-100 text-rose-800 border-rose-300"
                                }`}>
                                  <X className="w-3 h-3" />
                                  <span>Denied</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border tracking-wider inline-flex items-center gap-1 bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {r.status}
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-2 text-right">
                              {r.status === "pending" ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleApproveRequest(r.requestId)}
                                    disabled={isActionLoading || agentAccrued < r.totalDays}
                                    title={
                                      agentAccrued < r.totalDays
                                        ? "Cannot approve: Agent has insufficient accrued balance"
                                        : "Approve request (deducts accrued days)"
                                    }
                                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-sans font-bold px-2.5 py-1 rounded text-[11px] uppercase transition-all cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    onClick={() => handleDenyRequest(r.requestId)}
                                    disabled={isActionLoading}
                                    title="Deny request (no days deducted)"
                                    className="bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-sans font-bold px-2.5 py-1 rounded text-[11px] uppercase transition-all cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Deny</span>
                                  </button>
                                </div>
                              ) : isCancelling ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleAdminCancelBooking(r.requestId)}
                                    className="bg-red-600 hover:bg-red-500 text-white font-sans font-bold px-2 py-1 rounded text-[10px] uppercase transition-all cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setCancellingId(null)}
                                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-sans font-bold px-2 py-1 rounded text-[10px] uppercase transition-all cursor-pointer"
                                  >
                                    Back
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setCancellingId(r.requestId)}
                                  title="Cancel approved booking (refunds accrued days)"
                                  className="text-red-500 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 font-bold px-2 py-1 rounded text-[10px] uppercase transition-all cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Cancel</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar: Active System Policy */}
          <div className="space-y-6">
            <div
              className={`border rounded-2xl p-5 shadow-xl transition-all duration-200 ${
                isDarkMode ? "bg-slate-900/40 border-white/10 text-slate-200" : "bg-white border-slate-300 shadow-md text-slate-900"
              }`}
            >
              <div className="pb-3 border-b border-slate-200 dark:border-white/10 flex items-center gap-2">
                <Shield className={`w-5 h-5 ${isDarkMode ? "text-cyan-400" : "text-indigo-600"}`} />
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider">
                  Active Booking Policy
                </h4>
              </div>

              <div className="mt-4 space-y-3 font-sans text-xs">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-950/40 space-y-1">
                  <p className="font-bold text-slate-900 dark:text-white">1. One Member Per Team Per Date</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Strictly enforced server-side. Multiple different teams can book the same date, but only one member of any given team can hold a slot on that date.
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-950/40 space-y-1">
                  <p className="font-bold text-slate-900 dark:text-white">2. Weekend Restrictions</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Saturdays and Sundays are classified as non-working days and are blocked from selection and booking.
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-950/40 space-y-1">
                  <p className="font-bold text-slate-900 dark:text-white">3. Manual Booking Windows</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Admin manually toggles which months are open or closed. Months do NOT unlock automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Booking Windows */}
      {activeTab === "windows" && (
        <BookingWindowManager profile={profile} isDarkMode={isDarkMode} />
      )}

      {/* Tab 3: Export */}
      {activeTab === "export" && (
        <ExportDashboard currentUser={profile} isDarkMode={isDarkMode} />
      )}

      {/* Tab 4: Users & Teams */}
      {activeTab === "users" && (
        <div
          className={`border rounded-2xl p-6 shadow-xl transition-all duration-300 ${
            isDarkMode ? "bg-slate-900/40 border-white/10" : "bg-white border-slate-300 shadow-md"
          }`}
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-white/10">
            <div>
              <h3 className={`text-lg font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                <Users className={`w-5 h-5 ${isDarkMode ? "text-cyan-400" : "text-indigo-600"}`} />
                <span>Workforce Personnel & Teams</span>
              </h3>
              <p className={`text-xs mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                View employee roster and team assignments.
              </p>
            </div>

            <button
              onClick={() => setIsAddUserModalOpen(true)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isDarkMode
                  ? "bg-cyan-500 text-black hover:bg-cyan-400"
                  : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Employee</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className={`border-b uppercase font-bold text-[11px] ${
                  isDarkMode ? "border-white/10 text-slate-400" : "border-slate-300 text-slate-600"
                }`}>
                  <th className="py-3 px-2">Name / Username</th>
                  <th className="py-3 px-2">Role</th>
                  <th className="py-3 px-2">Team</th>
                  <th className="py-3 px-2">Accrued Leave</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(Object.values(users) as UserProfile[]).map((u) => {
                  const balance = typeof u.accruedLeaveDays === "number"
                    ? u.accruedLeaveDays
                    : (typeof u.accrued_leave === "number" ? u.accrued_leave : 0);

                  return (
                    <tr
                      key={u.username}
                      className={`border-b transition-all ${
                        isDarkMode ? "border-white/5 hover:bg-white/5" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-3.5 px-2 font-sans">
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                          {u.fullName || u.username}
                        </div>
                        <div className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                          @{u.username}
                        </div>
                      </td>

                      <td className="py-3.5 px-2">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                          u.role === "ADMIN"
                            ? isDarkMode
                              ? "bg-purple-950/60 border-purple-500/30 text-purple-300"
                              : "bg-purple-100 border-purple-300 text-purple-800"
                            : isDarkMode
                            ? "bg-slate-950 border-white/10 text-slate-300"
                            : "bg-slate-100 border-slate-300 text-slate-700"
                        }`}>
                          {u.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-2">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          u.team === "Unassigned"
                            ? isDarkMode
                              ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
                              : "bg-amber-50 border-amber-300 text-amber-800"
                            : isDarkMode
                            ? "bg-cyan-950/40 border-cyan-500/30 text-cyan-400"
                            : "bg-indigo-50 border-indigo-200 text-indigo-800"
                        }`}>
                          {u.team}
                        </span>
                      </td>

                      <td className="py-3.5 px-2">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span
                              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                                isDarkMode
                                  ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                                  : "bg-emerald-50 border-emerald-300 text-emerald-800"
                              }`}
                            >
                              {balance} accrued days
                            </span>
                            {u.role === "agent" && (
                              <span
                                className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5"
                                title="Includes automatic monthly accrual (1.25 days/month) and manual adjustments"
                              >
                                +1.25/mo auto
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => setSelectedUserForAccrual(u)}
                            title={`Add accrued leave days for ${u.fullName || u.username}`}
                            className={`text-[10px] font-sans font-bold px-2 py-0.5 rounded border transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                              isDarkMode
                                ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                                : "bg-emerald-100 hover:bg-emerald-200 border-emerald-300 text-emerald-900"
                            }`}
                          >
                            <CalendarPlus className="w-3 h-3" />
                            <span>Add Days</span>
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-2 text-right">
                        <button
                          onClick={() => setSelectedUserForEdit(u)}
                          className={`text-xs font-sans font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                            isDarkMode
                              ? "bg-slate-950 hover:bg-slate-800 border-white/10 text-slate-300"
                              : "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800"
                          }`}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Audit Logs */}
      {activeTab === "logs" && (
        <AuditLogsViewer isDarkMode={isDarkMode} />
      )}

      {/* Modals */}
      {isAddUserModalOpen && (
        <AddUserModal
          onClose={() => setIsAddUserModalOpen(false)}
          onUserAdded={() => fetchAdminData()}
          existingUsers={users}
          teams={teams}
          currentAdminUsername={profile.username}
          isDarkMode={isDarkMode}
        />
      )}

      {selectedUserForAccrual && (
        <AddAccruedLeaveModal
          onClose={() => setSelectedUserForAccrual(null)}
          user={selectedUserForAccrual}
          onAccrualUpdated={(updatedUser, newBal) => {
            fetchAdminData();
            setUsers((prev) => ({
              ...prev,
              [updatedUser.username]: {
                ...updatedUser,
                accrued_leave: newBal,
                accruedLeaveDays: newBal,
              },
            }));
          }}
          currentAdminUsername={profile.username}
          isDarkMode={isDarkMode}
        />
      )}

      {selectedUserForEdit && (
        <EditUserModal
          onClose={() => setSelectedUserForEdit(null)}
          user={selectedUserForEdit}
          onUserUpdated={() => fetchAdminData()}
          teams={teams}
          currentAdminUsername={profile.username}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
}
