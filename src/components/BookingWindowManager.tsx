import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  Lock,
  Unlock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Timer,
  X
} from "lucide-react";
import { UserProfile, BookingWindow, formatCountdown } from "../types";

interface BookingWindowManagerProps {
  profile: UserProfile;
  isDarkMode?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function BookingWindowManager({ profile, isDarkMode = false }: BookingWindowManagerProps) {
  const [windows, setWindows] = useState<BookingWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [currentClientTimeMs, setCurrentClientTimeMs] = useState<number>(Date.now());

  // Schedule Modal State
  const [schedulingMonth, setSchedulingMonth] = useState<{ year: number; month: number; monthName: string; existingTime?: string | null } | null>(null);
  const [scheduleDatetime, setScheduleDatetime] = useState<string>("");
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);

  const isAuthorized = profile.role === "ADMIN";

  const fetchWindows = async () => {
    try {
      const res = await fetch("/api/booking-windows");
      const data = await res.json();
      setWindows(data.bookingWindows || []);
    } catch (err) {
      console.error("Error fetching booking windows:", err);
      setMessage({ text: "Failed to load booking window configuration.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWindows();
  }, []);

  // 1-second interval to keep countdowns accurate and auto-refresh when a timer reaches zero
  useEffect(() => {
    const timerInterval = setInterval(() => {
      const now = Date.now();
      setCurrentClientTimeMs(now);

      // Check if any scheduled window has just expired
      const hasExpiredTimer = windows.some((w) => {
        if (w.status === "SCHEDULED" && w.scheduledOpenTime) {
          const t = new Date(w.scheduledOpenTime).getTime();
          return !isNaN(t) && t <= now;
        }
        return false;
      });

      if (hasExpiredTimer) {
        // Automatically sync with server
        fetchWindows();
      }
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [windows]);

  // Handle immediate OPEN or CLOSE
  const handleAction = async (monthIndex: number, action: "OPEN" | "CLOSE", scheduledTime?: string | null) => {
    if (!isAuthorized) {
      setMessage({ text: "Unauthorized: Only Admin or Operations can manage booking windows.", type: "error" });
      return;
    }

    const key = `${selectedYear}-${monthIndex}`;
    setTogglingKey(key);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/booking-windows/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: selectedYear,
          month: monthIndex,
          action,
          isOpen: action === "OPEN",
          scheduledOpenTime: scheduledTime || null,
          reviewer: profile.username
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update booking window");
      }

      setWindows(data.bookingWindows || []);
      const monthLabel = `${MONTH_NAMES[monthIndex]} ${selectedYear}`;
      setMessage({
        text: action === "OPEN"
          ? `${monthLabel} is now OPEN immediately. Agents can book leave dates.`
          : `${monthLabel} is now CLOSED. Leave bookings are disabled.`,
        type: "success"
      });
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to update booking window.", type: "error" });
    } finally {
      setTogglingKey(null);
    }
  };

  // Open Schedule Modal
  const openScheduleModal = (monthIndex: number, existingTime?: string | null) => {
    const mName = MONTH_NAMES[monthIndex];
    let defaultTime = "";
    if (existingTime) {
      // Format as YYYY-MM-DDTHH:mm
      const dt = new Date(existingTime);
      if (!isNaN(dt.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        defaultTime = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      }
    } else {
      // Default to 1st of that month at 08:00 AM, or tomorrow 8:00 AM
      const targetDate = new Date(selectedYear, monthIndex, 1, 8, 0, 0);
      if (targetDate.getTime() < Date.now()) {
        // If 1st of month has already passed, default to tomorrow at 08:00
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        const pad = (n: number) => String(n).padStart(2, "0");
        defaultTime = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T08:00`;
      } else {
        const pad = (n: number) => String(n).padStart(2, "0");
        defaultTime = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-01T08:00`;
      }
    }

    setScheduleDatetime(defaultTime);
    setSchedulingMonth({
      year: selectedYear,
      month: monthIndex,
      monthName: mName,
      existingTime
    });
  };

  // Submit Scheduled Opening Time
  const handleSaveSchedule = async () => {
    if (!schedulingMonth || !scheduleDatetime) return;
    if (!isAuthorized) return;

    setScheduleSubmitting(true);
    setMessage(null);

    try {
      const scheduledIso = new Date(scheduleDatetime).toISOString();

      const res = await fetch("/api/admin/booking-windows/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: schedulingMonth.year,
          month: schedulingMonth.month,
          action: "SCHEDULE",
          scheduledOpenTime: scheduledIso,
          reviewer: profile.username
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to schedule booking window");
      }

      setWindows(data.bookingWindows || []);
      const formattedDate = new Date(scheduledIso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });

      setMessage({
        text: `Scheduled ${schedulingMonth.monthName} ${schedulingMonth.year} to automatically open on ${formattedDate}. Month remains CLOSED until then.`,
        type: "success"
      });
      setTimeout(() => setMessage(null), 6000);
      setSchedulingMonth(null);
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to schedule opening.", type: "error" });
    } finally {
      setScheduleSubmitting(false);
    }
  };

  // Quick Preset Helper for Modal
  const applyPreset = (presetType: "5min" | "1hour" | "tomorrow" | "firstOfMonth") => {
    if (!schedulingMonth) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");

    let d = new Date();
    if (presetType === "5min") {
      d = new Date(now.getTime() + 5 * 60 * 1000);
    } else if (presetType === "1hour") {
      d = new Date(now.getTime() + 60 * 60 * 1000);
    } else if (presetType === "tomorrow") {
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
    } else if (presetType === "firstOfMonth") {
      d = new Date(schedulingMonth.year, schedulingMonth.month, 1, 8, 0, 0);
    }

    const str = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setScheduleDatetime(str);
  };

  // Bulk open or close
  const handleBulkSet = async (openAll: boolean) => {
    if (!isAuthorized) return;
    setLoading(true);
    setMessage(null);

    const openMonthsArray = openAll ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [];

    try {
      const res = await fetch("/api/admin/booking-windows/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: selectedYear,
          openMonths: openMonthsArray,
          reviewer: profile.username
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update windows in bulk");

      setWindows(data.bookingWindows || []);
      setMessage({
        text: openAll
          ? `All 12 months for ${selectedYear} are now OPEN for booking.`
          : `All 12 months for ${selectedYear} are now CLOSED. Leave bookings are blocked.`,
        type: "success"
      });
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to bulk update.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Prepare 12 months data for current selected year
  const yearMonths = MONTH_NAMES.map((name, index) => {
    const match = windows.find((w) => Number(w.year) === selectedYear && Number(w.month) === index);
    const isOpen = match ? Boolean(match.isOpen) : false;
    const status = match?.status || (isOpen ? "OPEN" : "CLOSED");
    const scheduledOpenTime = match?.scheduledOpenTime || null;

    // Calculate countdown if scheduled
    let countdown = formatCountdown(scheduledOpenTime, currentClientTimeMs);
    let effectiveStatus = status;

    if (status === "SCHEDULED" && scheduledOpenTime) {
      if (countdown.isExpired) {
        effectiveStatus = "OPEN";
      }
    }

    return {
      monthIndex: index,
      monthName: name,
      year: selectedYear,
      isOpen: effectiveStatus === "OPEN",
      status: effectiveStatus,
      scheduledOpenTime,
      countdown
    };
  });

  const openCount = yearMonths.filter((m) => m.isOpen).length;
  const scheduledCount = yearMonths.filter((m) => m.status === "SCHEDULED").length;

  return (
    <div className="space-y-6">
      {/* Banner Card */}
      <div
        className={`border rounded-2xl p-6 shadow-xl transition-all duration-300 ${
          isDarkMode ? "bg-slate-900/40 border-white/10" : "bg-white border-slate-300 shadow-md"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className={`w-6 h-6 ${isDarkMode ? "text-cyan-400" : "text-indigo-600"}`} />
              <h3 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                Booking Windows & Opening Timers
              </h3>
            </div>
            <p className={`text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
              Months are <span className="font-semibold text-red-400">CLOSED by default</span>. Open immediately, close, or schedule future opening dates with countdown timers.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Year Selector */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className={`text-xs font-mono font-bold px-3 py-2 rounded-xl border transition-all ${
                isDarkMode
                  ? "bg-slate-950 border-white/10 text-slate-200 focus:border-cyan-400"
                  : "bg-slate-50 border-slate-300 text-slate-800 focus:border-indigo-600"
              }`}
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>

            <button
              onClick={() => fetchWindows()}
              title="Refresh status"
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isDarkMode
                  ? "bg-slate-950 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800"
                  : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              message.type === "success"
                ? isDarkMode
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                  : "bg-emerald-50 border-emerald-300 text-emerald-900"
                : isDarkMode
                ? "bg-red-950/40 border-red-500/40 text-red-300"
                : "bg-red-50 border-red-300 text-red-900"
            }`}
          >
            {message.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </motion.div>
        )}

        {/* Quick Bulk Actions & Counters */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
              openCount > 0
                ? isDarkMode
                  ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-400"
                  : "bg-emerald-100 border-emerald-300 text-emerald-800"
                : isDarkMode
                ? "bg-red-950/60 border-red-500/30 text-red-400"
                : "bg-red-100 border-red-300 text-red-800"
            }`}>
              {openCount} / 12 Months Open
            </span>

            {scheduledCount > 0 && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                isDarkMode
                  ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
                  : "bg-amber-100 border-amber-300 text-amber-900"
              }`}>
                <Clock className="w-3.5 h-3.5" />
                <span>{scheduledCount} Scheduled</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkSet(true)}
              disabled={loading || !isAuthorized}
              className={`px-3 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isDarkMode
                  ? "bg-emerald-950/40 hover:bg-emerald-950/70 border-emerald-500/40 text-emerald-300"
                  : "bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900"
              }`}
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Open All Months</span>
            </button>
            <button
              onClick={() => handleBulkSet(false)}
              disabled={loading || !isAuthorized}
              className={`px-3 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isDarkMode
                  ? "bg-red-950/40 hover:bg-red-950/70 border-red-500/40 text-red-300"
                  : "bg-red-50 hover:bg-red-100 border-red-300 text-red-900"
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Close All Months</span>
            </button>
          </div>
        </div>

        {/* 12 Months Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
          {yearMonths.map((m) => {
            const key = `${m.year}-${m.monthIndex}`;
            const isToggling = togglingKey === key;
            const isScheduled = m.status === "SCHEDULED" && !m.countdown.isExpired;

            return (
              <div
                key={key}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  m.isOpen
                    ? isDarkMode
                      ? "bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/60"
                      : "bg-emerald-50/70 border-emerald-300 hover:border-emerald-400"
                    : isScheduled
                    ? isDarkMode
                      ? "bg-amber-950/25 border-amber-500/40 hover:border-amber-500/70"
                      : "bg-amber-50/80 border-amber-300 hover:border-amber-400"
                    : isDarkMode
                    ? "bg-slate-950/40 border-white/5 opacity-85 hover:opacity-100"
                    : "bg-slate-100/70 border-slate-300"
                }`}
              >
                <div>
                  {/* Card Header: Month + Status Badge */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className={`font-bold text-sm ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                        {m.monthName}
                      </h4>
                      <span className={`text-[11px] font-mono ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                        {m.year}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                        m.isOpen
                          ? isDarkMode
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : isScheduled
                          ? isDarkMode
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-amber-100 text-amber-900 border-amber-300"
                          : isDarkMode
                          ? "bg-red-500/20 text-red-300 border-red-500/40"
                          : "bg-red-100 text-red-800 border-red-300"
                      }`}
                    >
                      {m.isOpen ? (
                        <Unlock className="w-3 h-3" />
                      ) : isScheduled ? (
                        <Clock className="w-3 h-3" />
                      ) : (
                        <Lock className="w-3 h-3" />
                      )}
                      <span>{m.status}</span>
                    </span>
                  </div>

                  {/* Status Details / Countdown Display */}
                  <div className="mt-3">
                    {m.isOpen ? (
                      <p className={`text-[11px] ${isDarkMode ? "text-emerald-400/90" : "text-emerald-700"}`}>
                        ✓ Agents can book leave dates
                      </p>
                    ) : isScheduled ? (
                      <div className="space-y-1.5">
                        <div className={`text-[10px] font-medium ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                          Opens {m.scheduledOpenTime ? new Date(m.scheduledOpenTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Scheduled"}
                        </div>
                        <div className={`p-2 rounded-lg border flex items-center gap-2 font-mono text-xs font-bold ${
                          isDarkMode
                            ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
                            : "bg-amber-100/90 border-amber-300 text-amber-900"
                        }`}>
                          <Timer className="w-3.5 h-3.5 shrink-0 text-amber-400 animate-pulse" />
                          <span>{m.countdown.text} remaining</span>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-[11px] ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                        Closed • Booking blocked
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-1.5">
                  {m.isOpen ? (
                    <>
                      <button
                        onClick={() => openScheduleModal(m.monthIndex, null)}
                        disabled={isToggling || !isAuthorized}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 border ${
                          isDarkMode
                            ? "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-white/10"
                            : "bg-white hover:bg-slate-100 text-slate-700 border-slate-300"
                        }`}
                        title="Schedule future opening"
                      >
                        <Clock className="w-3 h-3" />
                        <span>Schedule</span>
                      </button>

                      <button
                        onClick={() => handleAction(m.monthIndex, "CLOSE")}
                        disabled={isToggling || !isAuthorized}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isDarkMode
                            ? "bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30"
                            : "bg-red-100 hover:bg-red-200 text-red-800 border border-red-300"
                        }`}
                      >
                        {isToggling ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                        <span>Close</span>
                      </button>
                    </>
                  ) : isScheduled ? (
                    <>
                      <button
                        onClick={() => handleAction(m.monthIndex, "CLOSE")}
                        disabled={isToggling || !isAuthorized}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1 border ${
                          isDarkMode
                            ? "bg-red-950/40 hover:bg-red-950/70 text-red-300 border-red-500/30"
                            : "bg-red-50 hover:bg-red-100 text-red-800 border-red-300"
                        }`}
                        title="Cancel schedule and close month"
                      >
                        <span>Cancel</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openScheduleModal(m.monthIndex, m.scheduledOpenTime)}
                          disabled={isToggling || !isAuthorized}
                          className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                            isDarkMode
                              ? "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-white/10"
                              : "bg-white hover:bg-slate-100 text-slate-700 border-slate-300"
                          }`}
                          title="Edit scheduled time"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                        </button>

                        <button
                          onClick={() => handleAction(m.monthIndex, "OPEN")}
                          disabled={isToggling || !isAuthorized}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                            isDarkMode
                              ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40"
                              : "bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300"
                          }`}
                          title="Open immediately (override timer)"
                        >
                          <Unlock className="w-3 h-3" />
                          <span>Open Now</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openScheduleModal(m.monthIndex, null)}
                        disabled={isToggling || !isAuthorized}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 border ${
                          isDarkMode
                            ? "bg-amber-950/30 hover:bg-amber-950/60 text-amber-300 border-amber-500/30"
                            : "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300"
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>Schedule</span>
                      </button>

                      <button
                        onClick={() => handleAction(m.monthIndex, "OPEN")}
                        disabled={isToggling || !isAuthorized}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                          isDarkMode
                            ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30"
                            : "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300"
                        }`}
                      >
                        {isToggling ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />}
                        <span>Open Now</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedule Opening Modal Dialog */}
      <AnimatePresence>
        {schedulingMonth && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all ${
                isDarkMode ? "bg-slate-900 border-white/10 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-base">
                    Schedule Opening — {schedulingMonth.monthName} {schedulingMonth.year}
                  </h3>
                </div>
                <button
                  onClick={() => setSchedulingMonth(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="mt-4 space-y-4">
                <p className={`text-xs ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                  The month will remain strictly <span className="text-red-400 font-bold">CLOSED</span> until the exact scheduled timestamp arrives. When reached, it automatically unlocks for all Agents.
                </p>

                {/* Quick Presets */}
                <div>
                  <label className={`text-[11px] font-mono font-bold uppercase block mb-1.5 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                    Quick Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => applyPreset("5min")}
                      className={`p-2 rounded-xl border text-left font-medium transition-all cursor-pointer ${
                        isDarkMode ? "bg-slate-800/60 border-white/10 hover:bg-slate-800 text-slate-200" : "bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800"
                      }`}
                    >
                      ⚡ +5 Minutes (Quick Test)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("1hour")}
                      className={`p-2 rounded-xl border text-left font-medium transition-all cursor-pointer ${
                        isDarkMode ? "bg-slate-800/60 border-white/10 hover:bg-slate-800 text-slate-200" : "bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800"
                      }`}
                    >
                      ⏱ +1 Hour
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("tomorrow")}
                      className={`p-2 rounded-xl border text-left font-medium transition-all cursor-pointer ${
                        isDarkMode ? "bg-slate-800/60 border-white/10 hover:bg-slate-800 text-slate-200" : "bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800"
                      }`}
                    >
                      🌅 Tomorrow at 8:00 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("firstOfMonth")}
                      className={`p-2 rounded-xl border text-left font-medium transition-all cursor-pointer ${
                        isDarkMode ? "bg-slate-800/60 border-white/10 hover:bg-slate-800 text-slate-200" : "bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800"
                      }`}
                    >
                      📅 1st of {schedulingMonth.monthName} 8:00 AM
                    </button>
                  </div>
                </div>

                {/* Custom Datetime Picker */}
                <div>
                  <label className={`text-[11px] font-mono font-bold uppercase block mb-1.5 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                    Opening Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleDatetime}
                    onChange={(e) => setScheduleDatetime(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border font-mono text-sm transition-all ${
                      isDarkMode
                        ? "bg-slate-950 border-white/20 text-white focus:border-amber-400"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600"
                    }`}
                  />
                </div>

                {/* Live Preview of Countdown */}
                {scheduleDatetime && (
                  <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                    isDarkMode ? "bg-amber-950/20 border-amber-500/30 text-amber-300" : "bg-amber-50 border-amber-300 text-amber-900"
                  }`}>
                    <Timer className="w-4 h-4 shrink-0 text-amber-400" />
                    <div className="text-xs">
                      <span className="font-bold">Countdown Preview: </span>
                      <span className="font-mono">
                        {formatCountdown(new Date(scheduleDatetime).toISOString(), currentClientTimeMs).text} remaining
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSchedulingMonth(null)}
                  disabled={scheduleSubmitting}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-300" : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={scheduleSubmitting || !scheduleDatetime}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isDarkMode
                      ? "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20"
                      : "bg-amber-600 hover:bg-amber-700 text-white shadow-md"
                  }`}
                >
                  {scheduleSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5" />
                      <span>Save & Activate Timer</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
