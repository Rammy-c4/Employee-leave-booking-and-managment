import React, { useState } from "react";
import { motion } from "motion/react";
import { X, UserPlus, ShieldAlert, CheckCircle2 } from "lucide-react";
import { UserProfile, TeamInfo } from "../types";

interface AddUserModalProps {
  onClose: () => void;
  onUserAdded: (newUser: UserProfile) => void;
  existingUsers: Record<string, UserProfile>;
  teams: TeamInfo[];
  currentAdminUsername: string;
  isDarkMode?: boolean;
}

export default function AddUserModal({
  onClose,
  onUserAdded,
  existingUsers,
  teams,
  currentAdminUsername,
  isDarkMode = false,
}: AddUserModalProps) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [team, setTeam] = useState(teams[0]?.name || "Ernestina");
  const [status, setStatus] = useState<"active" | "suspended">("active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError("Full Name is required.");
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      setError("Username is required.");
      return;
    }

    if (cleanUsername.includes("admin")) {
      setError("This username is reserved. Please choose another username.");
      return;
    }

    // Check duplicate username
    const exists = Object.keys(existingUsers).some(
      (k) => k.toLowerCase() === cleanUsername
    );
    if (exists) {
      setError(`Username '${cleanUsername}' is already in use. Please choose another.`);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/admin/add-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: cleanUsername,
          team,
          status,
          creator: currentAdminUsername,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to add user account.");
      }

      onUserAdded(data.profile);
      onClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      id="add-user-modal-overlay"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl relative ${
          isDarkMode ? "bg-slate-900 border-white/10 text-slate-100" : "bg-white border-slate-300 text-slate-900"
        }`}
        id="add-user-card"
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between pb-4 border-b mb-5 ${
            isDarkMode ? "border-white/10" : "border-slate-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">Add New Agent Account</h3>
              <p className={`text-[11px] font-mono ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                Assign username and team for instant passwordless sign-in
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

        <form onSubmit={handleSubmit} className="space-y-4 font-sans">
          <div>
            <label
              className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${
                isDarkMode ? "text-slate-400" : "text-slate-700"
              }`}
            >
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Samuel Amponsah"
              className={`w-full p-2.5 border rounded-xl text-xs font-sans transition-all ${
                isDarkMode
                  ? "bg-slate-950 border-white/10 text-white focus:border-indigo-500"
                  : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600"
              }`}
              required
            />
          </div>

          <div>
            <label
              className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${
                isDarkMode ? "text-slate-400" : "text-slate-700"
              }`}
            >
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. samuel"
              className={`w-full p-2.5 border rounded-xl text-xs font-mono transition-all ${
                isDarkMode
                  ? "bg-slate-950 border-white/10 text-white focus:border-indigo-500"
                  : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600"
              }`}
              required
            />
            <p className={`text-[9px] mt-1 font-mono ${isDarkMode ? "text-slate-500" : "text-slate-500"}`}>
              The agent will log in directly using this username. No password needed.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${
                  isDarkMode ? "text-slate-400" : "text-slate-700"
                }`}
              >
                Assigned Team <span className="text-red-500">*</span>
              </label>
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className={`w-full p-2.5 border rounded-xl text-xs font-mono transition-all ${
                  isDarkMode
                    ? "bg-slate-950 border-white/10 text-white focus:border-indigo-500"
                    : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600"
                }`}
              >
                {teams
                  .filter((t) => !t.archived)
                  .map((t) => (
                    <option key={t.teamId} value={t.name}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label
                className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${
                  isDarkMode ? "text-slate-400" : "text-slate-700"
                }`}
              >
                Account Status <span className="text-red-500">*</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className={`w-full p-2.5 border rounded-xl text-xs font-mono transition-all ${
                  isDarkMode
                    ? "bg-slate-950 border-white/10 text-white focus:border-indigo-500"
                    : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600"
                }`}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                isDarkMode
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                  : "bg-indigo-700 hover:bg-indigo-800 text-white"
              }`}
            >
              {loading ? (
                <span>Creating User...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Create Agent Account</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
