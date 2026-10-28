import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, CheckCircle2, AlertCircle, Trash2, CalendarDays, ListChecks, Check, ShieldCheck, X, Pencil, Clock } from "lucide-react";
import { UserProfile, LeaveRequest, formatDateToWords, getDatesInRange, isWeekendDate } from "../types";
import { formatLeaveRequestDatesDisplay } from "../utils/dateUtils";
import InteractiveCalendar from "./InteractiveCalendar";

interface AgentProps {
  profile: UserProfile;
  onLogout: () => void;
  rollingWindow: any;
  isDarkMode?: boolean;
}

export default function DashboardAgent({ profile, onLogout, rollingWindow, isDarkMode = false }: AgentProps) {
  const [activeTab, setActiveTab] = useState<"book" | "my_bookings">("book");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [reason, setReason] = useState<string>("");
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [openMonthsCount, setOpenMonthsCount] = useState<number>(1);
  const [myBookingsFilter, setMyBookingsFilter] = useState<"active" | "all">("active");

  // Cancellation and Change booking state
  const [cancelLoadingId, setCancelLoadingId] = useState<string | null>(null);
  const [editingBooking, setEditingBooking] = useState<LeaveRequest | null>(null);
  const [changeReason, setChangeReason] = useState<string>("");
  const [changeLoading, setChangeLoading] = useState<boolean>(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [agentProfile, setAgentProfile] = useState<UserProfile>(profile);

  useEffect(() => {
    setAgentProfile(profile);
  }, [profile]);

  // Refresh agent profile to get latest accrued leave balance
  const refreshProfile = async () => {
    try {
      const res = await fetch(`/api/user/profile?username=${encodeURIComponent(profile.username)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.profile) {
          setAgentProfile(data.profile);
        }
      }
    } catch (err) {
      console.error("Failed to refresh agent profile:", err);
    }
  };

  // Fetch the agent's leave requests
  const fetchMyBookings = async () => {
    try {
      const res = await fetch(`/api/leave/my-requests?username=${encodeURIComponent(profile.username)}`);
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error("Failed to load requests:", err);
    }
  };

  useEffect(() => {
    fetchMyBookings();
    refreshProfile();

    // 2-second background polling ensures immediate status sync when Admin approves/denies
    const pollInterval = setInterval(() => {
      fetchMyBookings();
      refreshProfile();
    }, 2000);

    const onFocus = () => {
      fetchMyBookings();
      refreshProfile();
    };
    window.addEventListener("focus", onFocus);

    const onLeaveRequestUpdated = () => {
      fetchMyBookings();
      refreshProfile();
    };
    window.addEventListener("leave-request-updated", onLeaveRequestUpdated);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("leave-request-updated", onLeaveRequestUpdated);
    };
  }, [profile.username]);

  // Handle booking action
  const handleBookLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (selectedDates.length === 0) {
      setErrorMsg("Please select one or more dates on the calendar to book leave.");
      return;
    }

    // Step 2 Rule: Do not allow the agent to submit a request that exceeds their accrued leave days
    const currentAccrued = typeof agentProfile.accruedLeaveDays === "number"
      ? agentProfile.accruedLeaveDays
      : (typeof agentProfile.accrued_leave === "number" ? agentProfile.accrued_leave : 0);

    if (selectedDates.length > currentAccrued) {
      setErrorMsg(`Insufficient accrued leave balance: You selected ${selectedDates.length} day(s), but only have ${currentAccrued} accrued leave day(s) available.`);
      return;
    }

    // Enforce 4-day maximum active bookings / days per agent
    if (activeBookings.length >= 4 || activeDaysCount >= 4) {
      setErrorMsg("Maximum booking limit reached: Agents are permitted a maximum of 4 active leave bookings. Cancel an existing booking in 'My Bookings' before booking new dates.");
      return;
    }

    if (activeDaysCount + selectedDates.length > 4 || activeBookings.length + selectedDates.length > 4) {
      setErrorMsg(`Limit exceeded: Booking ${selectedDates.length} day(s) would exceed the maximum limit of 4 active leave days (you currently have ${activeDaysCount} active booked day(s)).`);
      return;
    }

    const sortedDates = [...selectedDates].sort();
    // startDate and endDate are kept solely as bounding metadata for API compatibility;
    // the authoritative booked dates are strictly the discrete dates array
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];

    const outgoingPayload = {
      username: profile.username,
      startDate,
      endDate,
      dates: sortedDates, // Authoritative list of dates the agent actually selected
      reason: reason.trim() || "Annual leave"
    };

    setSubmitLoading(true);
    try {
      const res = await fetch("/api/leave/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(outgoingPayload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to book leave");
      }

      setSuccessMsg(`Leave request for ${selectedDates.length} day(s) submitted! Status is Pending Admin approval (no accrued days deducted yet).`);
      setSelectedDates([]);
      setReason("");
      fetchMyBookings();
      refreshProfile();

      // Clear success notification after 5 seconds
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to book leave.");
    } finally {
      setSubmitLoading(false);
    }
  };

  // Handle cancelling a booked leave immediately
  const handleCancelBooking = async (requestId: string) => {
    setCancelLoadingId(requestId);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/leave/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, username: profile.username })
      });

      if (res.ok) {
        setCancellingId(null);
        setSuccessMsg("Booking cancelled and date released immediately. Accrued balance updated.");
        fetchMyBookings();
        refreshProfile();
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || "Failed to cancel booking.");
      }
    } catch (err: any) {
      console.error("Error cancelling booking:", err);
      setErrorMsg(err.message || "Network error cancelling booking.");
    } finally {
      setCancelLoadingId(null);
    }
  };

  // Start change booking workflow: opens existing booking calendar with booking marked
  const handleStartChangeBooking = (booking: LeaveRequest) => {
    setEditingBooking(booking);
    setSelectedDates([]);
    setChangeReason(booking.reason || "");
    setChangeError(null);
    setErrorMsg(null);
    setActiveTab("book");
  };

  // Confirm date change atomically on server
  const handleConfirmChangeBooking = async () => {
    if (!editingBooking) return;
    setChangeError(null);

    if (selectedDates.length === 0) {
      setChangeError("Please click an available replacement date on the calendar.");
      return;
    }

    const replacementDate = selectedDates[0];
    if (isWeekendDate(replacementDate)) {
      setChangeError(`Date ${replacementDate} falls on a weekend (Saturday or Sunday). Bookings are only permitted Monday through Friday.`);
      return;
    }

    setChangeLoading(true);
    try {
      const res = await fetch("/api/leave/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: editingBooking.requestId,
          username: profile.username,
          newStartDate: replacementDate,
          newEndDate: replacementDate,
          newDates: [replacementDate],
          reason: changeReason.trim() || editingBooking.reason || "Annual leave"
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to change booking.");
      }

      const oldSummary = formatDateToWords(editingBooking.startDate);
      const newSummary = formatDateToWords(replacementDate);
      setEditingBooking(null);
      setSelectedDates([]);
      setSuccessMsg(`Booking successfully changed from ${oldSummary} to ${newSummary}!`);
      fetchMyBookings();
      refreshProfile();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setChangeError(err.message || "Failed to change booking.");
    } finally {
      setChangeLoading(false);
    }
  };

  // Filter active booked leaves vs cancelled/denied
  const activeBookings = requests.filter((r) => r.status !== "cancelled" && r.status !== "rejected" && r.status !== "denied");
  const activeDaysCount = activeBookings.reduce(
    (sum, r) => sum + (Array.isArray(r.dates) && r.dates.length > 0 ? r.dates.length : (r.totalDays || 1)),
    0
  );

  const filteredRequests = requests.filter((r) => {
    if (myBookingsFilter === "active") {
      return r.status !== "cancelled" && r.status !== "denied" && r.status !== "rejected";
    }
    return true; // "all"
  });

  return (
    <div className="space-y-6">
      {/* Top Navigation Bar: Keep only "Book Leave" and "My Bookings" */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("book")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
              activeTab === "book"
                ? isDarkMode
                  ? "bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/20"
                  : "bg-indigo-600 text-white border-indigo-700 shadow-md"
                : isDarkMode
                ? "bg-slate-900/60 text-slate-300 border-white/10 hover:bg-slate-800"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Book Leave</span>
          </button>

          <button
            onClick={() => setActiveTab("my_bookings")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
              activeTab === "my_bookings"
                ? isDarkMode
                  ? "bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/20"
                  : "bg-indigo-600 text-white border-indigo-700 shadow-md"
                : isDarkMode
                ? "bg-slate-900/60 text-slate-300 border-white/10 hover:bg-slate-800"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
          >
            <ListChecks className="w-4 h-4" />
            <span>My Bookings</span>
            {activeBookings.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeTab === "my_bookings"
                    ? isDarkMode
                      ? "bg-black text-cyan-400"
                      : "bg-white text-indigo-700"
                    : isDarkMode
                    ? "bg-slate-800 text-slate-300"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {activeBookings.length}
              </span>
            )}
          </button>
        </div>

        {/* User team & booking limit badge */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-xs font-mono font-bold px-3 py-1.5 rounded-xl border ${
              activeDaysCount >= 4
                ? isDarkMode
                  ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
                  : "bg-amber-50 border-amber-300 text-amber-900"
                : isDarkMode
                ? "bg-slate-950/80 border-white/10 text-cyan-400"
                : "bg-slate-50 border-slate-300 text-indigo-800"
            }`}
          >
            Active Days: {activeDaysCount}/4
          </span>
          <span
            className={`text-xs font-mono font-bold px-3 py-1.5 rounded-xl border ${
              isDarkMode
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                : "bg-emerald-50 border-emerald-300 text-emerald-800"
            }`}
          >
            Accrued Leave: {typeof agentProfile.accruedLeaveDays === "number"
              ? agentProfile.accruedLeaveDays
              : (typeof agentProfile.accrued_leave === "number" ? agentProfile.accrued_leave : 0)} days
          </span>
          <span
            className={`text-xs font-mono font-bold px-3 py-1.5 rounded-xl border ${
              isDarkMode
                ? "bg-slate-950/80 border-white/10 text-slate-300"
                : "bg-slate-50 border-slate-300 text-slate-700"
            }`}
          >
            Team: {profile.team || "Unassigned"}
          </span>
        </div>
      </div>

      {/* Error & Success Banners */}
      {errorMsg && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-3.5 border rounded-xl text-xs font-bold flex items-center justify-between ${
            isDarkMode ? "bg-red-950/30 border-red-500/40 text-red-300" : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {successMsg && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-3.5 border rounded-xl text-xs font-bold flex items-center justify-between ${
            isDarkMode ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Tab 1: Book Leave */}
      {activeTab === "book" && (
        <div className={`grid grid-cols-1 ${openMonthsCount > 0 ? "lg:grid-cols-3" : "max-w-3xl mx-auto"} gap-6`}>
          {/* Main Calendar View */}
          <div className={openMonthsCount > 0 ? "lg:col-span-2" : "w-full"}>
            {editingBooking && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-4 p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  isDarkMode
                    ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
                    : "bg-amber-50 border-amber-300 text-amber-900 shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${isDarkMode ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-700"}`}>
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Changing Existing Booking
                    </div>
                    <div className="text-sm font-extrabold mt-0.5">
                      {formatDateToWords(editingBooking.startDate)}
                      {editingBooking.startDate !== editingBooking.endDate ? ` to ${formatDateToWords(editingBooking.endDate)}` : ""}
                      <span className="ml-2 text-xs font-normal opacity-80">
                        ({editingBooking.totalDays || 1} day{(editingBooking.totalDays || 1) > 1 ? "s" : ""} • {editingBooking.reason || "Annual leave"})
                      </span>
                    </div>
                    <div className="text-xs opacity-90 mt-1">
                      Click an available weekday on the calendar below to select your replacement date. Your original booking is safely preserved until the change is confirmed.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingBooking(null);
                    setSelectedDates([]);
                    setChangeError(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap self-end sm:self-center ${
                    isDarkMode
                      ? "border-amber-500/30 hover:bg-amber-500/20 text-amber-200"
                      : "border-amber-300 hover:bg-amber-100 text-amber-900"
                  }`}
                >
                  Keep Original Booking
                </button>
              </motion.div>
            )}

            <InteractiveCalendar
              currentMonthIndex={new Date().getMonth()}
              currentYear={new Date().getFullYear()}
              selectedDates={selectedDates}
              onDatesSelect={setSelectedDates}
              requests={requests}
              userTeam={profile.team}
              currentUsername={profile.username}
              isDarkMode={isDarkMode}
              onOpenMonthsCountChange={setOpenMonthsCount}
              changingBooking={editingBooking}
              onCancelChange={() => {
                setEditingBooking(null);
                setSelectedDates([]);
                setChangeError(null);
              }}
            />
          </div>

          {/* Booking Action Sidebar: Only show when an open booking period exists */}
          {openMonthsCount > 0 && (
            <div className="space-y-6">
              {editingBooking ? (
                /* Change Booking Sidebar Card */
                <div
                  className={`border rounded-2xl p-5 shadow-xl transition-colors duration-300 flex flex-col justify-between ${
                    isDarkMode ? "bg-slate-900/40 border-amber-500/30 text-slate-100" : "bg-white border-amber-300 text-slate-900 shadow-md"
                  }`}
                >
                  <div>
                    <div className="pb-3 mb-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                      <h3 className={`text-sm font-bold uppercase tracking-wider ${isDarkMode ? "text-amber-300" : "text-amber-800"}`}>
                        Change Booking
                      </h3>
                      <Pencil className="w-4 h-4 text-amber-500" />
                    </div>

                    {changeError && (
                      <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{changeError}</span>
                      </div>
                    )}

                    <div className="space-y-4">
                      {/* Original Booking */}
                      <div className={`p-3 rounded-xl border ${
                        isDarkMode ? "bg-slate-950/60 border-white/10" : "bg-slate-50 border-slate-200"
                      }`}>
                        <span className={`text-[10px] font-mono font-bold uppercase block ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                          Current Booking Date
                        </span>
                        <span className="text-xs font-bold block mt-1 text-amber-600 dark:text-amber-400">
                          {formatDateToWords(editingBooking.startDate)}
                        </span>
                      </div>

                      {/* Replacement Date */}
                      <div className={`p-3 rounded-xl border ${
                        isDarkMode ? "bg-slate-950/60 border-white/10" : "bg-slate-50 border-slate-200"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-mono font-bold uppercase block ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                            Replacement Date
                          </span>
                          {selectedDates.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedDates([])}
                              className="text-[10px] font-mono text-slate-400 hover:text-red-400 cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        {selectedDates.length > 0 ? (
                          <span className={`text-xs font-bold block mt-1 ${isDarkMode ? "text-cyan-300" : "text-indigo-900"}`}>
                            {formatDateToWords(selectedDates[0])} ✓
                          </span>
                        ) : (
                          <p className={`text-xs mt-1 ${isDarkMode ? "text-slate-500" : "text-slate-500"}`}>
                            Click an available weekday on the calendar.
                          </p>
                        )}
                      </div>

                      {/* Reason field */}
                      <div>
                        <label className={`text-[11px] font-bold block mb-1 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                          Reason / Note (Optional)
                        </label>
                        <input
                          type="text"
                          value={changeReason}
                          onChange={(e) => setChangeReason(e.target.value)}
                          placeholder="e.g. Annual leave"
                          className={`w-full p-2.5 rounded-xl text-xs border transition-all ${
                            isDarkMode
                              ? "bg-slate-950/60 border-white/10 text-slate-200 focus:border-cyan-400"
                              : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600 focus:bg-white"
                          }`}
                        />
                      </div>

                      {/* Validation Guarantee Notice */}
                      <div className={`p-3 rounded-xl border text-[11px] space-y-1 ${
                        isDarkMode ? "bg-slate-950/60 border-white/5 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"
                      }`}>
                        <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Atomic Safety Guarantee</span>
                        </div>
                        <p>
                          Your original booking date remains safe until the new date passes all validation rules and is confirmed.
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-2 pt-2">
                        <button
                          type="button"
                          onClick={handleConfirmChangeBooking}
                          disabled={changeLoading || selectedDates.length === 0}
                          className={`w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                            changeLoading || selectedDates.length === 0
                              ? "bg-slate-300 text-slate-500 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed border border-transparent"
                              : isDarkMode
                              ? "bg-cyan-500 hover:bg-cyan-400 text-black shadow-lg shadow-cyan-500/20 active:scale-[0.99]"
                              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md active:scale-[0.99]"
                          }`}
                        >
                          {changeLoading ? (
                            <span>Validating & Updating...</span>
                          ) : selectedDates.length > 0 ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Confirm Date Change</span>
                            </>
                          ) : (
                            <span>Select Replacement Date</span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingBooking(null);
                            setSelectedDates([]);
                            setChangeError(null);
                          }}
                          disabled={changeLoading}
                          className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                            isDarkMode
                              ? "border-white/10 text-slate-300 hover:bg-white/5"
                              : "border-slate-300 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          Keep Original Booking
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Standard New Booking Sidebar Card */
                <div
                  className={`border rounded-2xl p-5 shadow-xl transition-colors duration-300 flex flex-col justify-between ${
                    isDarkMode ? "bg-slate-900/40 border-white/10 text-slate-100" : "bg-white border-slate-300 text-slate-900 shadow-md"
                  }`}
                >
                  <div>
                    <div className="pb-3 mb-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                      <h3 className={`text-sm font-bold uppercase tracking-wider ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                        Book Leave
                      </h3>
                      <ShieldCheck className={`w-5 h-5 ${isDarkMode ? "text-cyan-400" : "text-indigo-600"}`} />
                    </div>

                    <form onSubmit={handleBookLeave} className="space-y-4">
                      {/* Selected Dates summary */}
                      <div
                        className={`p-3.5 rounded-xl border ${
                          isDarkMode ? "bg-slate-950/60 border-white/10" : "bg-slate-50 border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-mono font-bold uppercase ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                            Selected Dates
                          </span>
                          {selectedDates.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedDates([])}
                              className="text-[10px] font-mono text-slate-400 hover:text-red-400 cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        <div className="mt-2 min-h-[48px]">
                          {selectedDates.length > 0 ? (
                            <div className="space-y-1">
                              <span className={`text-xs font-bold block ${isDarkMode ? "text-cyan-300" : "text-indigo-900"}`}>
                                {selectedDates.length} day{selectedDates.length > 1 ? "s" : ""} selected:
                              </span>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {[...selectedDates].sort().map((d) => (
                                  <span
                                    key={d}
                                    className={`text-[11px] font-mono px-2 py-0.5 rounded-md font-semibold border ${
                                      isDarkMode
                                        ? "bg-cyan-950/60 border-cyan-500/30 text-cyan-200"
                                        : "bg-indigo-50 border-indigo-200 text-indigo-900"
                                    }`}
                                  >
                                    {d}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className={`text-xs ${isDarkMode ? "text-slate-500" : "text-slate-500"}`}>
                              Click any available date on the calendar to select your leave days.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Reason field (optional) */}
                      <div>
                        <label className={`text-[11px] font-bold block mb-1 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                          Reason / Note (Optional)
                        </label>
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="e.g. Annual leave, Personal day"
                          className={`w-full p-2.5 rounded-xl text-xs border transition-all ${
                            isDarkMode
                              ? "bg-slate-950/60 border-white/10 text-slate-200 focus:border-cyan-400"
                              : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600 focus:bg-white"
                          }`}
                        />
                      </div>

                      {/* Booking limit warning if limit reached or exceeded */}
                      {activeDaysCount >= 4 ? (
                        <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                          isDarkMode ? "bg-amber-950/40 border-amber-500/30 text-amber-300" : "bg-amber-50 border-amber-300 text-amber-900"
                        }`}>
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                          <div>
                            <p className="font-bold">4-Day Limit Reached</p>
                            <p className="text-[11px] mt-0.5 opacity-90">
                              You already have 4 active leave bookings. Cancel an existing booking in "My Bookings" to book new dates.
                            </p>
                          </div>
                        </div>
                      ) : activeDaysCount + selectedDates.length > 4 ? (
                        <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                          isDarkMode ? "bg-red-950/40 border-red-500/30 text-red-300" : "bg-red-50 border-red-300 text-red-800"
                        }`}>
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                          <div>
                            <p className="font-bold">Limit Exceeded</p>
                            <p className="text-[11px] mt-0.5 opacity-90">
                              You have selected {selectedDates.length} day(s), which exceeds your remaining allowance ({4 - activeDaysCount} day{4 - activeDaysCount > 1 ? "s" : ""} left).
                            </p>
                          </div>
                        </div>
                      ) : selectedDates.length > 0 && selectedDates.length > (typeof agentProfile.accruedLeaveDays === "number" ? agentProfile.accruedLeaveDays : (agentProfile.accrued_leave || 0)) ? (
                        <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                          isDarkMode ? "bg-red-950/40 border-red-500/30 text-red-300" : "bg-red-50 border-red-300 text-red-800"
                        }`}>
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                          <div>
                            <p className="font-bold">Insufficient Accrued Balance</p>
                            <p className="text-[11px] mt-0.5 opacity-90">
                              You have selected {selectedDates.length} day(s), but you only have {typeof agentProfile.accruedLeaveDays === "number" ? agentProfile.accruedLeaveDays : (agentProfile.accrued_leave || 0)} accrued leave day(s) available. Reduce your selection to proceed.
                            </p>
                          </div>
                        </div>
                      ) : null}

                      {/* Booking Button: Immediate Book action */}
                      <button
                        type="submit"
                        disabled={
                          submitLoading ||
                          selectedDates.length === 0 ||
                          activeDaysCount >= 4 ||
                          activeDaysCount + selectedDates.length > 4 ||
                          selectedDates.length > (typeof agentProfile.accruedLeaveDays === "number" ? agentProfile.accruedLeaveDays : (agentProfile.accrued_leave || 0))
                        }
                        className={`w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          selectedDates.length > 0 &&
                          activeDaysCount + selectedDates.length <= 4 &&
                          selectedDates.length <= (typeof agentProfile.accruedLeaveDays === "number" ? agentProfile.accruedLeaveDays : (agentProfile.accrued_leave || 0))
                            ? isDarkMode
                              ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20 hover:opacity-90 active:scale-[0.99]"
                              : "bg-indigo-600 text-white shadow-md hover:bg-indigo-700 active:scale-[0.99]"
                            : "bg-slate-300 text-slate-500 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed border border-transparent"
                        }`}
                      >
                        <Check className="w-4 h-4" />
                        <span>
                          {submitLoading
                            ? "Submitting Request..."
                            : selectedDates.length > (typeof agentProfile.accruedLeaveDays === "number" ? agentProfile.accruedLeaveDays : (agentProfile.accrued_leave || 0))
                            ? "Insufficient Accrued Days"
                            : activeDaysCount >= 4
                            ? "4-Day Limit Reached"
                            : selectedDates.length > 0
                            ? `Request ${selectedDates.length} Leave Day${selectedDates.length > 1 ? "s" : ""}`
                            : "Select Dates to Book"}
                        </span>
                      </button>
                    </form>
                  </div>

                  {/* Policy note */}
                  <div className={`mt-6 pt-4 border-t border-slate-200 dark:border-white/10 text-[11px] space-y-1 ${
                    isDarkMode ? "text-slate-400" : "text-slate-600"
                  }`}>
                    <p className="font-bold text-slate-800 dark:text-slate-300">Booking Rules & Policies:</p>
                    <p>• Requests require Admin approval before deduction from accrued days.</p>
                    <p>• Maximum 4 active booked leave days per agent.</p>
                    <p>• Maximum one member per team per date.</p>
                    <p>• Weekends (Sat & Sun) are unavailable.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: My Bookings */}
      {activeTab === "my_bookings" && (
        <div
          className={`border rounded-2xl p-6 shadow-xl transition-colors duration-300 ${
            isDarkMode ? "bg-slate-900/40 border-white/10" : "bg-white border-slate-300 shadow-md"
          }`}
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-white/10">
            <div>
              <h3 className={`text-md font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                My Bookings
              </h3>
              <p className={`text-xs mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                {activeDaysCount} of 4 active leave days booked.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-slate-300 dark:border-white/10 overflow-hidden text-xs">
                <button
                  onClick={() => setMyBookingsFilter("active")}
                  className={`px-3 py-1.5 font-bold transition-colors cursor-pointer ${
                    myBookingsFilter === "active"
                      ? isDarkMode
                        ? "bg-cyan-500 text-black"
                        : "bg-indigo-600 text-white"
                      : isDarkMode
                      ? "bg-slate-950 text-slate-300 hover:bg-slate-800"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Active ({activeBookings.length})
                </button>
                <button
                  onClick={() => setMyBookingsFilter("all")}
                  className={`px-3 py-1.5 font-bold transition-colors cursor-pointer ${
                    myBookingsFilter === "all"
                      ? isDarkMode
                        ? "bg-cyan-500 text-black"
                        : "bg-indigo-600 text-white"
                      : isDarkMode
                      ? "bg-slate-950 text-slate-300 hover:bg-slate-800"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  All ({requests.length})
                </button>
              </div>

              <span
                className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                  isDarkMode
                    ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                    : "bg-emerald-50 border-emerald-300 text-emerald-800"
                }`}
              >
                Accrued: {typeof agentProfile.accruedLeaveDays === "number"
                  ? agentProfile.accruedLeaveDays
                  : (typeof agentProfile.accrued_leave === "number" ? agentProfile.accrued_leave : 0)} days
              </span>
            </div>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <Calendar className="w-8 h-8 mx-auto text-slate-400 opacity-60" />
              <p className="text-xs font-semibold">
                {myBookingsFilter === "active"
                  ? "You have no active leave bookings."
                  : "You have no leave bookings."}
              </p>
              <button
                onClick={() => setActiveTab("book")}
                className="mt-2 text-xs font-bold text-indigo-600 dark:text-cyan-400 underline cursor-pointer"
              >
                Go to calendar to book leave
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className={`border-b uppercase font-bold text-[11px] ${
                    isDarkMode ? "border-white/10 text-slate-400" : "border-slate-300 text-slate-600"
                  }`}>
                    <th className="py-3 px-3">Leave Dates</th>
                    <th className="py-3 px-3">Requested Days</th>
                    <th className="py-3 px-3">Reason / Notes</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r) => {
                    // Use authoritative r.dates array. Never expand discrete bookings into a continuous range.
                    const dates = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates : [r.startDate];
                    const isCancelling = cancellingId === r.requestId;

                    return (
                      <tr
                        key={r.requestId}
                        className={`border-b transition-all ${
                          isDarkMode ? "border-white/5 hover:bg-white/5" : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-4 px-3 font-sans">
                          <div className="space-y-0.5">
                            <div className={`font-bold text-sm tracking-tight ${
                              r.status === "approved"
                                ? "text-slate-900 dark:text-white"
                                : r.status === "denied" || r.status === "rejected"
                                ? "text-slate-700 dark:text-slate-300"
                                : r.status === "cancelled"
                                ? "text-slate-400 line-through dark:text-slate-500"
                                : "text-slate-900 dark:text-white"
                            }`}>
                              {formatLeaveRequestDatesDisplay(dates, r.startDate, r.endDate)}
                            </div>
                            {dates.length > 1 && (
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                {dates.map((d) => formatDateToWords(d)).join(" • ")}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-3 font-bold text-xs text-slate-800 dark:text-slate-200">
                          {r.totalDays} {r.totalDays === 1 ? "day" : "days"}
                        </td>

                        <td className="py-4 px-3 max-w-xs font-sans text-xs text-slate-600 dark:text-slate-300">
                          {r.responseComment ? (
                            <div className="space-y-0.5">
                              <div className="font-medium text-slate-800 dark:text-slate-200">{r.responseComment}</div>
                              {r.reason && <div className="text-[11px] text-slate-500 italic">{r.reason}</div>}
                            </div>
                          ) : (
                            r.reason || "Annual leave"
                          )}
                        </td>

                        <td className="py-4 px-3 text-right">
                          {r.status === "cancelled" || r.status === "denied" || r.status === "rejected" ? (
                            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-600">—</span>
                          ) : isCancelling ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleCancelBooking(r.requestId)}
                                disabled={cancelLoadingId === r.requestId}
                                className="bg-red-600 hover:bg-red-500 text-white font-sans font-bold px-2.5 py-1 rounded text-[10px] uppercase transition-all cursor-pointer disabled:opacity-50"
                              >
                                {cancelLoadingId === r.requestId ? "Cancelling..." : "Confirm Cancel"}
                              </button>
                              <button
                                onClick={() => setCancellingId(null)}
                                disabled={cancelLoadingId === r.requestId}
                                className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-sans font-bold px-2 py-1 rounded text-[10px] uppercase transition-all cursor-pointer disabled:opacity-50"
                              >
                                Keep
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              {r.status === "approved" && (
                                <button
                                  onClick={() => handleStartChangeBooking(r)}
                                  className={`font-bold px-2.5 py-1 rounded text-[10px] uppercase transition-all cursor-pointer inline-flex items-center gap-1 border ${
                                    isDarkMode
                                      ? "text-cyan-400 hover:text-cyan-300 border-cyan-500/20 hover:border-cyan-500/40 hover:bg-cyan-500/10"
                                      : "text-indigo-600 hover:text-indigo-700 border-indigo-500/20 hover:border-indigo-500/40 hover:bg-indigo-50"
                                  }`}
                                  title="Change date for this booking on the calendar"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Change</span>
                                </button>
                              )}
                              <button
                                onClick={() => setCancellingId(r.requestId)}
                                className="text-red-500 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10 font-bold px-2.5 py-1 rounded text-[10px] uppercase transition-all cursor-pointer inline-flex items-center gap-1"
                                title={r.status === "pending" ? "Withdraw this pending leave request" : "Cancel this booking and refund accrued days"}
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Cancel</span>
                              </button>
                            </div>
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
      )}
    </div>
  );
}
