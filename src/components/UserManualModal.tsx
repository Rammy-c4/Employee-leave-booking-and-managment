import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BookOpen, X, Users, Calendar, 
  CheckCircle2, Layers, Cpu, Info, ShieldCheck, Lock, Unlock
} from "lucide-react";

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  userRole?: string;
}

export default function UserManualModal({ isOpen, onClose, isDarkMode = false, userRole = "AGENT" }: UserManualModalProps) {
  const isAdmin = userRole === "ADMIN" || userRole === "OPS";
  const [activeTab, setActiveTab] = useState<string>("overview");

  if (!isOpen) return null;

  const tabs = [
    { id: "overview", label: "System Overview", icon: Info },
    { id: "rules", label: "Booking Rules", icon: ShieldCheck },
    { id: "agent", label: "Agent Guide", icon: Users },
    { id: "admin", label: "Admin & Ops Guide", icon: Cpu },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto backdrop-blur-md bg-black/60">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className={`w-full max-w-4xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
            isDarkMode ? "bg-slate-950 border-white/10 text-slate-100" : "bg-white border-slate-300 text-slate-900"
          }`}
        >
          {/* Modal Header */}
          <div className={`px-6 py-5 border-b flex items-center justify-between shrink-0 ${
            isDarkMode ? "border-white/10 bg-slate-900/80" : "border-slate-200 bg-slate-50"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${isDarkMode ? "bg-cyan-500/10 text-cyan-400" : "bg-indigo-50 text-indigo-600"}`}>
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold">Leave Booking System Guide</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">First-come, first-served leave scheduling manual</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all ${
                isDarkMode ? "hover:bg-white/10 text-slate-400 hover:text-white" : "hover:bg-slate-200 text-slate-600 hover:text-slate-900"
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Bar */}
          <div className={`px-6 pt-3 border-b flex gap-2 shrink-0 overflow-x-auto ${
            isDarkMode ? "border-white/10 bg-slate-900/40" : "border-slate-200 bg-slate-100"
          }`}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
                    isActive
                      ? isDarkMode
                        ? "text-cyan-400 border-cyan-400 bg-slate-950"
                        : "text-indigo-600 border-indigo-600 bg-white"
                      : isDarkMode
                        ? "text-slate-400 border-transparent hover:text-slate-200"
                        : "text-slate-600 border-transparent hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="p-6 overflow-y-auto space-y-6 text-xs leading-relaxed">
            {activeTab === "overview" && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Architecture & Purpose</h3>
                <p className="text-slate-700 dark:text-slate-300">
                  This application provides a streamlined, transparent first-come, first-served leave scheduling experience for workforce teams.
                  There are no waiting queues, approval bottlenecks, or subjective scores. When an agent chooses an available date, their leave is booked immediately.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? "bg-slate-900/40 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    <h4 className="font-bold flex items-center gap-2 text-cyan-700 dark:text-cyan-400 mb-2">
                      <Users className="w-4 h-4" /> Agent Experience
                    </h4>
                    <ul className="space-y-1.5 text-slate-700 dark:text-slate-300">
                      <li>• <strong>Book Leave:</strong> Interactive calendar showing open dates, teammate clashes, and immediate booking.</li>
                      <li>• <strong>My Bookings:</strong> Simple dashboard listing all confirmed dates with one-click cancellation.</li>
                    </ul>
                  </div>

                  <div className={`p-4 rounded-2xl border ${isDarkMode ? "bg-slate-900/40 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    <h4 className="font-bold flex items-center gap-2 text-indigo-700 dark:text-indigo-400 mb-2">
                      <Cpu className="w-4 h-4" /> Admin Experience
                    </h4>
                    <ul className="space-y-1.5 text-slate-700 dark:text-slate-300">
                      <li>• <strong>Monitor Bookings:</strong> Real-time overview of workforce schedules across all teams.</li>
                      <li>• <strong>Booking Windows:</strong> Manually toggle open/closed months for the entire organization.</li>
                      <li>• <strong>Export:</strong> Download CSV or monthly Google Sheets formats.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "rules" && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Core Booking Rules</h3>

                <div className="space-y-3">
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? "bg-slate-900/40 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>One Member Per Team Per Date</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">
                      Only one employee from the same team can book leave on any given calendar date. If your teammate has booked a date, that date is locked for your team. Other teams may book that same date independently.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl border ${isDarkMode ? "bg-slate-900/40 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-400 mb-1">
                      <Lock className="w-4 h-4" />
                      <span>Weekend Blocking</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">
                      Saturdays and Sundays are non-working days and are permanently blocked from leave booking selection.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl border ${isDarkMode ? "bg-slate-900/40 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex items-center gap-2 font-bold text-cyan-700 dark:text-cyan-400 mb-1">
                      <Unlock className="w-4 h-4" />
                      <span>Manual Booking Windows</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">
                      Admins open or close booking months manually. When a month is closed, dates in that month cannot be booked. Opening a month never occurs automatically.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "agent" && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">How to Book Leave</h3>
                <ol className="space-y-2.5 list-decimal pl-5 text-slate-700 dark:text-slate-300">
                  <li>Navigate to <strong>Book Leave</strong> on your dashboard.</li>
                  <li>Click on any open month chip at the top of the calendar.</li>
                  <li>Click on the date(s) you wish to take leave. If a date is highlighted in rose with <em>CLASH</em>, a teammate has already booked it.</li>
                  <li>Enter an optional note/reason in the sidebar.</li>
                  <li>Click <strong>Confirm Leave Booking</strong>. Your leave is booked instantly!</li>
                </ol>

                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 pt-3">Managing Your Bookings</h3>
                <p className="text-slate-700 dark:text-slate-300">
                  Click on <strong>My Bookings</strong> to view all your active leaves. If your plans change, click <strong>Cancel</strong> on any booking to immediately release that date for your team.
                </p>
              </div>
            )}

            {activeTab === "admin" && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Administrator Operations</h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>• <strong>Monitor Bookings:</strong> Inspect all booked dates across teams, filter by team, or search for individual employees. You can override or cancel any booking if operational needs require.</p>
                  <p>• <strong>Booking Windows:</strong> Open or close calendar months. Use <em>Open All Months</em> or <em>Close All Months</em> for rapid batch configuration, or toggle individual months.</p>
                  <p>• <strong>Users & Teams:</strong> Add new workforce members or edit existing personnel and team assignments.</p>
                  <p>• <strong>Export:</strong> Generate comprehensive attendance spreadsheets and CSV records for reporting.</p>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className={`px-6 py-4 border-t flex justify-end shrink-0 ${
            isDarkMode ? "border-white/10 bg-slate-900/60" : "border-slate-200 bg-slate-50"
          }`}>
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                isDarkMode ? "bg-cyan-500 text-black hover:bg-cyan-400" : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              Close Manual
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
