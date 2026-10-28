import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Users, ShieldCheck, Plus, Edit2, Archive, RotateCcw, Check, X, AlertCircle, Layers, Sparkles } from "lucide-react";
import { Team, Role } from "../types";

interface TeamsAndRolesManagerProps {
  currentAdminUsername: string;
  isDarkMode?: boolean;
}

export default function TeamsAndRolesManager({ currentAdminUsername, isDarkMode = false }: TeamsAndRolesManagerProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New team state
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamLead, setNewTeamLead] = useState("");
  const [newMaxLeave, setNewMaxLeave] = useState(3);

  // Edit team state
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editName, setEditName] = useState("");
  const [editLead, setEditLead] = useState("");
  const [editMaxLeave, setEditMaxLeave] = useState(3);

  // Fetch teams and roles
  const fetchData = async () => {
    setLoading(true);
    try {
      const [teamsRes, rolesRes] = await Promise.all([
        fetch("/api/admin/teams"),
        fetch("/api/admin/roles")
      ]);
      if (teamsRes.ok) {
        const tData = await teamsRes.json();
        setTeams(tData.teams || []);
      }
      if (rolesRes.ok) {
        const rData = await rolesRes.json();
        setRoles(rData.roles || []);
      }
    } catch (err) {
      console.error("Failed to load teams & roles:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTeamName.trim(),
          teamLead: newTeamLead.trim() || "Unassigned",
          maxLeavePerDay: newMaxLeave,
          adminUser: currentAdminUsername
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create team.");

      setTeams(data.teams);
      setShowAddTeamModal(false);
      setNewTeamName("");
      setNewTeamLead("");
      setToastMessage(`✅ Created new team '${newTeamName}'!`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam) return;

    try {
      const res = await fetch("/api/admin/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: editingTeam.teamId,
          name: editName.trim(),
          teamLead: editLead.trim(),
          maxLeavePerDay: editMaxLeave,
          adminUser: currentAdminUsername
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update team.");

      setTeams(data.teams);
      setEditingTeam(null);
      setToastMessage(`✅ Updated team details & cascaded changes!`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleArchiveToggle = async (team: Team) => {
    const targetState = !team.archived;
    try {
      const res = await fetch("/api/admin/teams/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: team.teamId,
          archived: targetState,
          adminUser: currentAdminUsername
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to archive team.");

      setTeams(data.teams);
      setToastMessage(`✅ Team '${team.name}' ${targetState ? "archived" : "reactivated"}!`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`p-4 rounded-xl border text-xs font-semibold flex items-center gap-2 shadow-lg ${
          isDarkMode ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-emerald-50 border-emerald-300 text-emerald-800"
        }`}>
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Teams Management Panel */}
      <div className={`p-6 rounded-2xl border ${isDarkMode ? "bg-slate-900/60 border-white/10" : "bg-white border-slate-300 shadow-sm"}`}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <span>Configurable Organizational Teams</span>
            </h2>
            <p className={`text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
              Manage operational teams, team leads, and daily concurrency leave caps.
            </p>
          </div>

          <button
            onClick={() => setShowAddTeamModal(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-indigo-600/25"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Team</span>
          </button>
        </div>

        {/* Teams List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map((t) => (
            <div
              key={t.teamId}
              className={`p-4 rounded-xl border transition-all ${
                t.archived
                  ? isDarkMode ? "bg-slate-950/40 border-white/5 opacity-60" : "bg-slate-100 border-slate-200 opacity-60"
                  : isDarkMode ? "bg-slate-950/80 border-white/10 hover:border-indigo-500/40" : "bg-slate-50 border-slate-200 hover:border-indigo-300"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">{t.name}</h3>
                  {t.archived && (
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                      Archived
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingTeam(t);
                      setEditName(t.name);
                      setEditLead(t.teamLead);
                      setEditMaxLeave(t.maxLeavePerDay);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Edit Team"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleArchiveToggle(t)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title={t.archived ? "Reactivate Team" : "Archive Team"}
                  >
                    {t.archived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-3">
                <div>
                  <span className={`text-[10px] block uppercase ${isDarkMode ? "text-slate-500" : "text-slate-600"}`}>Team Lead</span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-400">{t.teamLead || "Unassigned"}</span>
                </div>
                <div>
                  <span className={`text-[10px] block uppercase ${isDarkMode ? "text-slate-500" : "text-slate-600"}`}>Max Leave / Day</span>
                  <span className="font-bold text-teal-700 dark:text-cyan-400">{t.maxLeavePerDay} members</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Roles & Permissions Panel */}
      <div className={`p-6 rounded-2xl border ${isDarkMode ? "bg-slate-900/60 border-white/10" : "bg-white border-slate-300 shadow-sm"}`}>
        <div className="mb-5">
          <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Configurable System Roles & Security Matrix</span>
          </h2>
          <p className={`text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
            Dynamic authorization hierarchy governing actions and access boundaries.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((r) => (
            <div
              key={r.roleId}
              className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-950/80 border-white/10" : "bg-slate-50 border-slate-200"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-emerald-700 dark:text-emerald-400">{r.name} ({r.roleId})</span>
              </div>
              <p className={`text-xs mb-3 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>{r.description}</p>

              <div className="flex flex-wrap gap-1">
                {r.permissions.map((p, idx) => (
                  <span
                    key={idx}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      isDarkMode
                        ? "bg-slate-800 text-slate-300 border-white/5"
                        : "bg-slate-200 text-slate-700 border-slate-300"
                    }`}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Add Team */}
      {showAddTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-md p-6 rounded-2xl border ${isDarkMode ? "bg-slate-900 border-white/10 text-white" : "bg-white border-slate-300 text-slate-900"}`}>
            <h3 className="text-lg font-bold mb-4">Create Operational Team</h3>
            <form onSubmit={handleAddTeam} className="space-y-4">
              <div>
                <label className={`block text-xs font-mono mb-1 font-bold ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>Team Name *</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Phoenix Operations"
                  className={`w-full p-2.5 border rounded-xl text-xs font-mono ${isDarkMode ? "bg-slate-950 border-white/10 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                  required
                />
              </div>

              <div>
                <label className={`block text-xs font-mono mb-1 font-bold ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>Team Lead Username Handle</label>
                <input
                  type="text"
                  value={newTeamLead}
                  onChange={(e) => setNewTeamLead(e.target.value)}
                  placeholder="e.g. lead@TL"
                  className={`w-full p-2.5 border rounded-xl text-xs font-mono ${isDarkMode ? "bg-slate-950 border-white/10 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-mono mb-1 font-bold ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>Max Leave / Day Threshold</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newMaxLeave}
                  onChange={(e) => setNewMaxLeave(parseInt(e.target.value) || 3)}
                  className={`w-full p-2.5 border rounded-xl text-xs font-mono ${isDarkMode ? "bg-slate-950 border-white/10 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTeamModal(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isDarkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-lg shadow-indigo-600/25"
                >
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Team */}
      {editingTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-md p-6 rounded-2xl border ${isDarkMode ? "bg-slate-900 border-white/10 text-white" : "bg-white border-slate-300 text-slate-900"}`}>
            <h3 className="text-lg font-bold mb-4">Edit Team Details</h3>
            <form onSubmit={handleUpdateTeam} className="space-y-4">
              <div>
                <label className={`block text-xs font-mono mb-1 font-bold ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>Team Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={`w-full p-2.5 border rounded-xl text-xs font-mono ${isDarkMode ? "bg-slate-950 border-white/10 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                  required
                />
                <p className={`text-[10px] mt-1 font-mono ${isDarkMode ? "text-amber-400" : "text-amber-700 font-medium"}`}>
                  Renaming team will automatically cascade across all user accounts & leave requests!
                </p>
              </div>

              <div>
                <label className={`block text-xs font-mono mb-1 font-bold ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>Team Lead</label>
                <input
                  type="text"
                  value={editLead}
                  onChange={(e) => setEditLead(e.target.value)}
                  className={`w-full p-2.5 border rounded-xl text-xs font-mono ${isDarkMode ? "bg-slate-950 border-white/10 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-mono mb-1 font-bold ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>Max Leave / Day Threshold</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editMaxLeave}
                  onChange={(e) => setEditMaxLeave(parseInt(e.target.value) || 3)}
                  className={`w-full p-2.5 border rounded-xl text-xs font-mono ${isDarkMode ? "bg-slate-950 border-white/10 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTeam(null)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isDarkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-lg shadow-indigo-600/25"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
