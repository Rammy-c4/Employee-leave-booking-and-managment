import React, { useState } from "react";
import { motion } from "motion/react";
import { X, Edit3, ShieldAlert, CheckCircle2, UserX, UserCheck } from "lucide-react";
import { UserProfile, TeamInfo } from "../types";

interface EditUserModalProps {
  user: UserProfile;
  onClose: () => void;
  onUserUpdated: (updatedUser: UserProfile) => void;
  teams: TeamInfo[];
  currentAdminUsername: string;
  isDarkMode?: boolean;
}

export default function EditUserModal({
  user,
  onClose,
  onUserUpdated,
  teams,
  currentAdminUsername,
  isDarkMode = false,
}: EditUserModalProps) {
  const [fullName, setFullName] = useState(user.fullName || "");
  const [role, setRole] = useState(user.role === "ADMIN" ? "ADMIN" : "agent");
  const [team, setTeam] = useState(user.team || "Unassigned");
  const [status, setStatus] = useState<"active" | "suspended">(user.status || "active");
  const initialBalance = typeof user.accruedLeaveDays === "number"
    ? user.accruedLeaveDays
    : (typeof user.accrued_leave === "number" ? user.accrued_leave : 0);
  const [daysToAdd, setDaysToAdd] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAdd = parseFloat(daysToAdd) || 0;
    if (parsedAdd < 0) {
      setError("Days to add must be zero or a positive number.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/users/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          fullName,
          role,
          team,
          status,
          daysToAdd: parsedAdd,
          adminUsername: currentAdminUsername,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user details.");

      onUserUpdated(data.profile);
      setSuccessMsg("User profile and accrued leave balance updated successfully.");
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    const nextStatus = status === "active" ? "suspended" : "active";
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/users/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          status: nextStatus,
          adminUsername: currentAdminUsername,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status.");

      setStatus(nextStatus);
      onUserUpdated(data.profile);
      setSuccessMsg(`Account status updated to ${nextStatus.toUpperCase()}.`);
      setTimeout(() => setSuccessMsg(null), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      id="edit-user-modal-overlay"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`w-full max-w-lg p-6 rounded-2xl border shadow-2xl relative max-h-[90vh] overflow-y-auto ${
          isDarkMode ? "bg-slate-900 border-white/10 text-slate-100" : "bg-white border-slate-300 text-slate-900"
        }`}
        id="edit-user-card"
      >
        <div
          className={`flex items-center justify-between pb-4 border-b mb-4 ${
            isDarkMode ? "border-white/10" : "border-slate-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                Manage User: {user.fullName || user.username}
              </h3>
              <p className={`text-[11px] font-mono ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                @{user.username} | Role: {user.role === "ADMIN" ? "ADMIN" : "Agent"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs flex items-center gap-2 font-medium">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 font-sans">
          <div>
            <label
              className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${
                isDarkMode ? "text-slate-400" : "text-slate-700"
              }`}
            >
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={`w-full p-2.5 border rounded-xl text-xs font-sans ${
                isDarkMode
                  ? "bg-slate-950 border-white/10 text-white focus:border-indigo-500"
                  : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600"
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${
                  isDarkMode ? "text-slate-400" : "text-slate-700"
                }`}
              >
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`w-full p-2.5 border rounded-xl text-xs font-mono ${
                  isDarkMode ? "bg-slate-950 border-white/10 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              >
                <option value="agent">Agent</option>
                <option value="ADMIN">Administrator (ADMIN)</option>
              </select>
            </div>

            <div>
              <label
                className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${
                  isDarkMode ? "text-slate-400" : "text-slate-700"
                }`}
              >
                Assigned Team
              </label>
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className={`w-full p-2.5 border rounded-xl text-xs font-mono ${
                  isDarkMode ? "bg-slate-950 border-white/10 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              >
                <option value="Unassigned">Unassigned (Pending Team Assignment)</option>
                {teams
                  .filter((t) => !t.archived)
                  .map((t) => (
                    <option key={t.teamId} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                <option value="none">None (Administrative)</option>
              </select>
            </div>
          </div>

          {/* Accrued Leave Days */}
          <div className={`p-3 rounded-xl border space-y-2 ${isDarkMode ? "bg-slate-950/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-[10px] font-mono uppercase tracking-wider block font-bold ${
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                }`}>
                  Current Accrued Balance
                </span>
                <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {initialBalance} accrued days
                </span>
              </div>
              <div className="text-right">
                <span className={`text-[10px] font-mono uppercase tracking-wider block font-bold ${
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                }`}>
                  New Balance Preview
                </span>
                <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {parseFloat((initialBalance + (parseFloat(daysToAdd) || 0)).toFixed(2))} accrued days
                </span>
              </div>
            </div>

            <div>
              <label
                className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${
                  isDarkMode ? "text-slate-400" : "text-slate-700"
                }`}
              >
                Add Accrued Days (0 or positive number)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={daysToAdd}
                onChange={(e) => setDaysToAdd(e.target.value)}
                placeholder="0"
                className={`w-full p-2 border rounded-xl text-xs font-mono font-bold ${
                  isDarkMode
                    ? "bg-slate-900 border-white/10 text-white focus:border-emerald-500"
                    : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                }`}
              />
            </div>
          </div>

          {/* Account Status */}
          <div className={`pt-3 border-t space-y-3 ${isDarkMode ? "border-white/10" : "border-slate-200"}`}>
            <div
              className={`flex items-center justify-between p-3 rounded-xl border ${
                isDarkMode ? "bg-slate-950/60 border-white/5" : "bg-slate-50 border-slate-200"
              }`}
            >
              <div>
                <span className="text-xs font-bold block">
                  Account Status:{" "}
                  <span
                    className={
                      status === "active"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }
                  >
                    {status.toUpperCase()}
                  </span>
                </span>
                <span className={`text-[10px] ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                  {status === "active"
                    ? "User can sign in and submit leave requests."
                    : "User account is suspended from signing in."}
                </span>
              </div>

              <button
                type="button"
                onClick={handleToggleStatus}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                  status === "active"
                    ? isDarkMode
                      ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                      : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    : isDarkMode
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                {status === "active" ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                <span>{status === "active" ? "Suspend Account" : "Reactivate Account"}</span>
              </button>
            </div>
          </div>

          <div
            className={`flex items-center justify-end gap-2 pt-3 border-t ${
              isDarkMode ? "border-white/10" : "border-slate-200"
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isDarkMode
                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
