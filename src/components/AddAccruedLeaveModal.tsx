import React, { useState } from "react";
import { motion } from "motion/react";
import { X, CalendarPlus, ShieldAlert, CheckCircle2, ArrowRight } from "lucide-react";
import { UserProfile } from "../types";

interface AddAccruedLeaveModalProps {
  user: UserProfile;
  onClose: () => void;
  onAccrualUpdated: (updatedUser: UserProfile, newBalance: number) => void;
  currentAdminUsername: string;
  isDarkMode?: boolean;
}

export default function AddAccruedLeaveModal({
  user,
  onClose,
  onAccrualUpdated,
  currentAdminUsername,
  isDarkMode = false,
}: AddAccruedLeaveModalProps) {
  const currentBalance = typeof user.accruedLeaveDays === "number"
    ? user.accruedLeaveDays
    : (typeof user.accrued_leave === "number" ? user.accrued_leave : 0);

  const [daysToAdd, setDaysToAdd] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Parse days to add safely
  const parsedDaysToAdd = parseFloat(daysToAdd) || 0;
  const isInvalid = isNaN(parsedDaysToAdd) || parsedDaysToAdd < 0;
  const calculatedNewBalance = isInvalid ? currentBalance : parseFloat((currentBalance + parsedDaysToAdd).toFixed(2));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const val = parseFloat(daysToAdd);
    if (isNaN(val) || val < 0) {
      setError("Please enter zero or a positive number of days to add.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/users/add-accrued-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUsername: user.username,
          daysToAdd: val,
          adminUsername: currentAdminUsername,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update leave balance.");
      }

      setSuccessMsg(`Successfully added ${val} day(s). New balance: ${data.currentBalance} accrued days.`);
      onAccrualUpdated(data.profile, data.currentBalance);

      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || "An error occurred while saving leave balance.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      id="add-accrued-leave-modal-overlay"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl relative ${
          isDarkMode ? "bg-slate-900 border-white/10 text-slate-100" : "bg-white border-slate-300 text-slate-900"
        }`}
        id="add-accrued-leave-card"
      >
        <div
          className={`flex items-center justify-between pb-4 border-b mb-4 ${
            isDarkMode ? "border-white/10" : "border-slate-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-2.5 rounded-xl border ${
              isDarkMode
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-emerald-50 border-emerald-200 text-emerald-700"
            }`}>
              <CalendarPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">
                Add Accrued Leave Days
              </h3>
              <p className={`text-[11px] font-mono ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                {user.fullName || user.username} (@{user.username})
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
          {/* Current balance card */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isDarkMode ? "bg-slate-950/70 border-white/10" : "bg-slate-50 border-slate-200"
            }`}
          >
            <div>
              <span className={`text-[10px] font-mono uppercase tracking-wider block font-bold ${
                isDarkMode ? "text-slate-400" : "text-slate-600"
              }`}>
                Current Accrued Balance
              </span>
              <span className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {currentBalance} accrued days
              </span>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-lg border font-mono ${
              isDarkMode ? "bg-slate-800 border-white/10 text-slate-300" : "bg-white border-slate-200 text-slate-700"
            }`}>
              Team: {user.team || "None"}
            </span>
          </div>

          {/* Days to Add input */}
          <div>
            <label
              htmlFor="days-to-add-input"
              className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${
                isDarkMode ? "text-slate-400" : "text-slate-700"
              }`}
            >
              Days to Add (0 or positive number)
            </label>
            <input
              id="days-to-add-input"
              type="number"
              min="0"
              step="any"
              value={daysToAdd}
              onChange={(e) => setDaysToAdd(e.target.value)}
              placeholder="e.g. 2"
              className={`w-full p-2.5 border rounded-xl text-sm font-mono font-bold ${
                isDarkMode
                  ? "bg-slate-950 border-white/10 text-white focus:border-emerald-500"
                  : "bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-600"
              }`}
              required
            />
            <span className={`text-[10px] mt-1 block ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
              Only 0 or positive values allowed. Accidental negative values are blocked.
            </span>
          </div>

          {/* Calculation Preview */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
              isDarkMode ? "bg-slate-950/40 border-white/5" : "bg-slate-50/60 border-slate-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={isDarkMode ? "text-slate-400" : "text-slate-600"}>
                {currentBalance} days
              </span>
              <span className="text-emerald-500 font-bold">+</span>
              <span className="font-bold text-emerald-500">
                {isInvalid ? 0 : parsedDaysToAdd} days
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div>
              <span className={`text-[10px] uppercase font-bold mr-1.5 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                New Balance:
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                {calculatedNewBalance} accrued days
              </span>
            </div>
          </div>

          <p className={`text-[11px] font-sans ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
            Agents automatically accrue 1.25 leave days per month. Both automatic accruals and manual adjustments contribute directly to this balance.
          </p>

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
              disabled={loading || isInvalid}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Save Change"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
