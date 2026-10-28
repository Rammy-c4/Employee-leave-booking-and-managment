import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { History, Search, Filter, Shield, User, Clock, FileText, ArrowRight, RefreshCw } from "lucide-react";
import { AuditLog } from "../types";

interface AuditLogsViewerProps {
  isDarkMode?: boolean;
}

export default function AuditLogsViewer({ isDarkMode = false }: AuditLogsViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedAction, setSelectedAction] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let url = "/api/admin/audit-logs?";
      if (search) url += `search=${encodeURIComponent(search)}&`;
      if (selectedAction) url += `action=${encodeURIComponent(selectedAction)}&`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [search, selectedAction]);

  return (
    <div className="space-y-6 font-sans">
      <div className={`p-6 rounded-2xl border ${isDarkMode ? "bg-slate-900/60 border-white/10" : "bg-white border-slate-300 shadow-sm"}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" />
              <span>Administrative Audit Logs & Compliance Trail</span>
            </h2>
            <p className={`text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
              Immutable record of administrative actions, account updates, security resets, and exports.
            </p>
          </div>

          <button
            onClick={fetchLogs}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer self-start md:self-auto ${
              isDarkMode
                ? "border-white/10 bg-slate-800/80 hover:bg-slate-700 text-slate-200"
                : "border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
            <span>Refresh Audit Logs</span>
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search audit details, target user, admin handle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-xs font-mono transition-all ${
                isDarkMode ? "bg-slate-950 border-white/10 text-white focus:border-indigo-500" : "bg-slate-50 border-slate-300 text-slate-900"
              }`}
            />
          </div>

          <div>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className={`w-full p-2.5 border rounded-xl text-xs font-mono transition-all ${
                isDarkMode ? "bg-slate-950 border-white/10 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
              }`}
            >
              <option value="">All Administrative Actions</option>
              <option value="USER_PROVISIONED_BY_ADMIN">User Provisioned</option>
              <option value="USER_DETAILS_UPDATED">User Details Updated</option>
              <option value="USER_PASSWORD_RESET_BY_ADMIN">Password Reset</option>
              <option value="USER_ACCOUNT_SUSPENDED">Account Suspended</option>
              <option value="USER_ACCOUNT_REACTIVATED">Account Reactivated</option>
              <option value="FORCE_PASSWORD_CHANGE_TOGGLED">Force Password Reset Toggled</option>
              <option value="TEAM_CREATED">Team Created</option>
              <option value="TEAM_UPDATED">Team Updated</option>
              <option value="EXCEL_SHEETS_EXPORT_GENERATED">Export Generated</option>
            </select>
          </div>
        </div>

        {/* Logs Table */}
        <div className={`overflow-x-auto rounded-xl border ${isDarkMode ? "border-white/10" : "border-slate-300"}`}>
          <table className="w-full text-left text-xs font-sans">
            <thead className={`font-mono text-[10px] uppercase tracking-wider ${isDarkMode ? "bg-slate-950 text-slate-400" : "bg-slate-100 text-slate-700"}`}>
              <tr>
                <th className="p-3">Log ID</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Admin User</th>
                <th className="p-3">Target User</th>
                <th className="p-3">Action</th>
                <th className="p-3">Audit Details</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? "divide-white/5" : "divide-slate-200"}`}>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-mono">
                    No matching audit log entries found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.logId} className={`hover:${isDarkMode ? "bg-slate-800/40" : "bg-slate-50"}`}>
                    <td className={`p-3 font-mono text-[11px] ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>{log.logId}</td>
                    <td className={`p-3 font-mono text-[11px] shrink-0 whitespace-nowrap ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400 font-mono">{log.adminId || log.username || "ADMIN"}</td>
                    <td className="p-3 font-mono font-semibold text-emerald-700 dark:text-emerald-400">{log.targetUser || "—"}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border whitespace-nowrap ${
                        isDarkMode
                          ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                          : "bg-indigo-50 text-indigo-800 border-indigo-200"
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="space-y-1">
                        <p className={isDarkMode ? "text-slate-300" : "text-slate-800"}>{log.details}</p>
                        {log.previousValues && log.newValues && (
                          <div className={`p-2 rounded-lg font-mono text-[10px] flex items-center gap-2 border ${
                            isDarkMode
                              ? "bg-slate-950/60 text-slate-400 border-white/5"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}>
                            <span className="line-through text-red-500 dark:text-red-400">{log.previousValues}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{log.newValues}</span>
                          </div>
                        )}
                      </div>
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
