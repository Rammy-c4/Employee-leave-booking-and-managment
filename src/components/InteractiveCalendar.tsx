import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  CalendarX,
  Lock,
  Unlock,
  Users,
  AlertTriangle,
  Timer,
  Info,
  X
} from "lucide-react";
import { 
  LeaveRequest, 
  getDatesInRange, 
  normalizeTeamName, 
  BookingWindow, 
  formatCountdown,
  isWeekendDate,
  isWeekendDay,
  isWeekdayDate,
  isWeekday,
  getWeekdayShortName,
  getDayOfWeekFromComponents,
  getDaysInMonthCount
} from "../types";

interface CalendarProps {
  currentMonthIndex: number;
  currentYear: number;
  selectedDates?: string[];
  onDatesSelect: (dates: string[]) => void;
  requests?: LeaveRequest[];
  userTeam?: string;
  currentUsername?: string;
  isDarkMode?: boolean;
  onOpenMonthsCountChange?: (count: number) => void;
  changingBooking?: LeaveRequest | null;
  onCancelChange?: () => void;
}

interface TooltipProps {
  key?: React.Key;
  text: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
  isDarkMode?: boolean;
}

function Tooltip({ text, children, position = "top", isDarkMode = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative flex items-center justify-center w-full h-full"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={`absolute z-50 pointer-events-none px-2.5 py-1.5 rounded-lg text-xs font-sans shadow-xl border whitespace-pre-line text-left min-w-[170px] max-w-[260px] leading-relaxed transition-all ${
            position === "top" ? "bottom-full mb-2" : "top-full mt-2"
          } ${
            isDarkMode
              ? "bg-slate-900 border-slate-700 text-slate-100"
              : "bg-white border-slate-300 text-slate-800 shadow-md"
          }`}
        >
          {text}
        </div>
      )}
    </div>
  );
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function InteractiveCalendar({
  currentMonthIndex,
  currentYear,
  selectedDates = [],
  onDatesSelect,
  requests = [],
  userTeam,
  currentUsername,
  isDarkMode = false,
  onOpenMonthsCountChange,
  changingBooking = null,
  onCancelChange
}: CalendarProps) {
  const [bookingWindows, setBookingWindows] = useState<BookingWindow[]>([]);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [currentClientTimeMs, setCurrentClientTimeMs] = useState<number>(Date.now());
  const [notification, setNotification] = useState<{ message: string; type: "info" | "error" | "warning" } | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  // Fetch active booking windows and all workforce bookings from server
  const fetchCalendarData = async () => {
    try {
      const [winRes, bookRes] = await Promise.all([
        fetch("/api/booking-windows"),
        fetch("/api/leave/all-bookings")
      ]);
      if (winRes.ok && (winRes.headers.get("content-type") || "").includes("application/json")) {
        const winData = await winRes.json();
        setBookingWindows(winData.bookingWindows || []);
      }
      if (bookRes.ok && (bookRes.headers.get("content-type") || "").includes("application/json")) {
        const bookData = await bookRes.json();
        setAllBookings(bookData.bookings || []);
      }
    } catch (err) {
      console.error("Failed to load calendar data:", err);
    }
  };

  useEffect(() => {
    fetchCalendarData();
    const pollInterval = setInterval(() => {
      fetchCalendarData();
    }, 2500);

    const handleUpdate = () => {
      fetchCalendarData();
    };
    window.addEventListener("leave-request-updated", handleUpdate);
    window.addEventListener("booking-window-updated", handleUpdate);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener("leave-request-updated", handleUpdate);
      window.removeEventListener("booking-window-updated", handleUpdate);
    };
  }, [requests]);

  // 1-second ticker for real-time countdown updates
  useEffect(() => {
    const ticker = setInterval(() => {
      const now = Date.now();
      setCurrentClientTimeMs(now);

      // If any scheduled window reached zero, automatically refresh calendar data
      const hasExpiredTimer = bookingWindows.some((w) => {
        if (w.status === "SCHEDULED" && w.scheduledOpenTime) {
          const t = new Date(w.scheduledOpenTime).getTime();
          return !isNaN(t) && t <= now;
        }
        return false;
      });

      if (hasExpiredTimer) {
        fetchCalendarData();
      }
    }, 1000);

    return () => clearInterval(ticker);
  }, [bookingWindows]);

  // Group active bookings per date YYYY-MM-DD
  const allBookingsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (!allBookings) return map;

    allBookings.forEach((r: any) => {
      if (r.status === "rejected" || r.status === "cancelled" || r.status === "denied") return;
      // Authoritative dates list: use r.dates array directly without inferring intermediate dates
      const bookedDates = Array.isArray(r.dates) && r.dates.length > 0
        ? r.dates
        : (r.startDate ? [r.startDate] : []);

      bookedDates.forEach((dateStr: string) => {
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(r);
      });
    });
    return map;
  }, [allBookings]);

  // Map of logged-in agent's leave request status per date YYYY-MM-DD
  // Authoritative dates source: strictly uses r.dates without reconstructing ranges or using getDatesInRange
  const myStatusByDate = useMemo(() => {
    const map: Record<string, { status: "Pending" | "Approved" | "Denied"; request: LeaveRequest }> = {};
    if (!requests || !Array.isArray(requests)) return map;

    // Sort requests so newest takes precedence
    const sorted = [...requests].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    for (const r of sorted) {
      if (r.status === "cancelled") continue;

      const raw = (r.status || "").toLowerCase();
      let norm: "Pending" | "Approved" | "Denied" | null = null;
      if (raw === "approved" || raw === "booked") {
        norm = "Approved";
      } else if (raw === "pending" || raw === "waitlisted") {
        norm = "Pending";
      } else if (raw === "denied" || raw === "rejected") {
        norm = "Denied";
      }

      if (!norm) continue;

      // Authoritative dates array: DO NOT use getDatesInRange.
      const targetDates: string[] = Array.isArray(r.dates) && r.dates.length > 0
        ? r.dates
        : (r.startDate ? [r.startDate] : []);

      for (const d of targetDates) {
        if (!map[d]) {
          map[d] = { status: norm, request: r };
        } else if (map[d].status === "Denied" && (norm === "Approved" || norm === "Pending")) {
          map[d] = { status: norm, request: r };
        }
      }
    }

    return map;
  }, [requests]);

  // Evaluate month window state with strict "Default to CLOSED" logic
  const evaluateMonthState = (monthIdx: number, yearNum: number) => {
    if (!bookingWindows || !Array.isArray(bookingWindows) || bookingWindows.length === 0) {
      return {
        status: "CLOSED" as const,
        isOpen: false,
        scheduledOpenTime: null,
        countdown: formatCountdown(null, currentClientTimeMs)
      };
    }

    const match = bookingWindows.find((w) => Number(w.year) === yearNum && Number(w.month) === monthIdx);
    if (!match) {
      return {
        status: "CLOSED" as const,
        isOpen: false,
        scheduledOpenTime: null,
        countdown: formatCountdown(null, currentClientTimeMs)
      };
    }

    // Check explicit open
    if (match.status === "OPEN" || (match.isOpen === true && !match.status && !match.scheduledOpenTime)) {
      return {
        status: "OPEN" as const,
        isOpen: true,
        scheduledOpenTime: null,
        countdown: formatCountdown(null, currentClientTimeMs)
      };
    }

    // Check scheduled opening (only open once timer reaches zero)
    if (match.status === "SCHEDULED" || (match.scheduledOpenTime && match.status !== "CLOSED")) {
      if (match.scheduledOpenTime) {
        const countdown = formatCountdown(match.scheduledOpenTime, currentClientTimeMs);
        if (countdown.isExpired) {
          return {
            status: "OPEN" as const,
            isOpen: true,
            scheduledOpenTime: match.scheduledOpenTime,
            countdown
          };
        } else {
          return {
            status: "SCHEDULED" as const,
            isOpen: false,
            scheduledOpenTime: match.scheduledOpenTime,
            countdown
          };
        }
      }
    }

    // Default CLOSED
    return {
      status: "CLOSED" as const,
      isOpen: false,
      scheduledOpenTime: null,
      countdown: formatCountdown(null, currentClientTimeMs)
    };
  };

  // Filter months: ONLY months whose Booking Window status is OPEN
  const openMonths = useMemo(() => {
    if (!bookingWindows || !Array.isArray(bookingWindows)) return [];

    const seen = new Set<string>();
    const list: Array<{
      month: number;
      year: number;
      monthName: string;
      key: string;
    }> = [];

    bookingWindows.forEach((w) => {
      const monthNum = Number(w.month);
      const yearNum = Number(w.year);
      const key = `${yearNum}-${monthNum}`;
      if (seen.has(key)) return;
      seen.add(key);

      const state = evaluateMonthState(monthNum, yearNum);
      if (state.isOpen) {
        list.push({
          month: monthNum,
          year: yearNum,
          monthName: MONTH_NAMES[monthNum] || `Month ${monthNum + 1}`,
          key
        });
      }
    });

    return list.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [bookingWindows, currentClientTimeMs]);

  // Sync open months count with parent component
  useEffect(() => {
    onOpenMonthsCountChange?.(openMonths.length);
  }, [openMonths.length, onOpenMonthsCountChange]);

  // Synchronize selectedMonthKey with currently available open months
  useEffect(() => {
    if (openMonths.length === 0) {
      if (selectedMonthKey !== null) {
        setSelectedMonthKey(null);
      }
      return;
    }

    const exists = openMonths.some((m) => m.key === selectedMonthKey);
    if (!exists) {
      setSelectedMonthKey(openMonths[0].key);
    }
  }, [openMonths, selectedMonthKey]);

  // When changingBooking is active, automatically switch view to the booking's month if OPEN
  useEffect(() => {
    if (changingBooking && changingBooking.startDate && openMonths.length > 0) {
      const parts = changingBooking.startDate.split("-");
      if (parts.length >= 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const targetKey = `${y}-${m}`;
        if (openMonths.some((om) => om.key === targetKey)) {
          setSelectedMonthKey(targetKey);
        }
      }
    }
  }, [changingBooking, openMonths]);

  // Automatically prune any selected dates that belong to months that are no longer OPEN
  useEffect(() => {
    if (selectedDates && selectedDates.length > 0) {
      const valid = selectedDates.filter((dateStr) => {
        const parts = dateStr.split("-");
        if (parts.length < 2) return false;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        return openMonths.some((om) => om.year === y && om.month === m);
      });
      if (valid.length !== selectedDates.length) {
        onDatesSelect(valid);
      }
    }
  }, [openMonths, selectedDates, onDatesSelect]);

  const activeMonthObj = useMemo(() => {
    if (openMonths.length === 0) return null;
    const found = openMonths.find((m) => m.key === selectedMonthKey);
    return found || openMonths[0];
  }, [openMonths, selectedMonthKey]);

  // Calendar days calculation for active month
  const calendarDays = useMemo(() => {
    if (!activeMonthObj) return [];
    const year = activeMonthObj.year;
    const month = activeMonthObj.month;

    // Timezone-independent calendar calculation using Sakamoto's algorithm
    // month is 0-indexed (0 = Jan, 8 = Sep)
    const firstDayOfWeek = getDayOfWeekFromComponents(year, month + 1, 1);
    const totalDays = getDaysInMonthCount(year, month + 1);

    const days = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ dayNum: null, dateStr: "" });
    }
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(month + 1).padStart(2, "0");
      const dStr = String(d).padStart(2, "0");
      const dateStr = `${year}-${mStr}-${dStr}`;
      days.push({ dayNum: d, dateStr });
    }
    return days;
  }, [activeMonthObj]);

  // If no month is OPEN, show minimal clean empty state
  if (openMonths.length === 0 || !activeMonthObj) {
    return (
      <div
        className={`border rounded-2xl p-10 md:p-14 text-center shadow-xl flex flex-col items-center justify-center min-h-[360px] transition-colors duration-300 ${
          isDarkMode ? "bg-slate-900/40 border-white/10 text-slate-100" : "bg-white border-slate-300 text-slate-900 shadow-md"
        }`}
        id="interactive-calendar-wrapper"
      >
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border ${
          isDarkMode ? "bg-slate-950/80 border-white/10 text-slate-400" : "bg-slate-100 border-slate-300 text-slate-600"
        }`}>
          <CalendarX className="w-7 h-7" />
        </div>
        <h3 className={`text-base md:text-lg font-bold tracking-tight ${isDarkMode ? "text-white" : "text-slate-900"}`}>
          No booking period is currently open.
        </h3>
        <p className={`text-xs md:text-sm mt-1.5 font-medium max-w-sm ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
          Please check back when a booking period is opened.
        </p>
      </div>
    );
  }

  const currentViewMonth = {
    index: activeMonthObj.month,
    name: activeMonthObj.monthName,
    year: activeMonthObj.year
  };

  // Handle clicking a day tile
  const handleDayClick = (dateStr: string) => {
    if (!dateStr) return;

    // Weekend check: only Saturday and Sunday are non-working weekend days
    if (isWeekendDate(dateStr)) {
      return;
    }

    if (changingBooking) {
      // In Change Mode:
      // If user clicks the original booking's date
      const isOriginalDate = (
        (Array.isArray(changingBooking.dates) && changingBooking.dates.length > 0)
          ? changingBooking.dates.includes(dateStr)
          : (changingBooking.startDate <= dateStr && changingBooking.endDate >= dateStr)
      );
      if (isOriginalDate) {
        setNotification({
          message: `This is your current booking date. Please click another available weekday as your replacement date.`,
          type: "info"
        });
        return;
      }

      // Check if current user already has ANOTHER active booking on this date
      const anotherBooking = (requests || []).find((r: any) => {
        if (r.status === "rejected" || r.status === "cancelled") return false;
        if (r.requestId === changingBooking.requestId) return false;
        const bDates = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates : getDatesInRange(r.startDate, r.endDate);
        return bDates.includes(dateStr);
      });
      if (anotherBooking) {
        setNotification({
          message: `You already have another active leave booking on ${dateStr}.`,
          type: "info"
        });
        return;
      }

      // Check Core Booking Rule: ONE MEMBER PER TEAM PER DATE
      const dayBookings = allBookingsByDate[dateStr] || [];
      const myNormTeam = normalizeTeamName(userTeam);
      if (myNormTeam && myNormTeam !== "none" && myNormTeam !== "unassigned") {
        const fellowTeammate = dayBookings.find((b: any) => {
          const sameTeam = normalizeTeamName(b.team) === myNormTeam;
          const diffUser = (b.username || "").trim().toLowerCase() !== (currentUsername || "").trim().toLowerCase();
          const isActive = b.status !== "rejected" && b.status !== "cancelled";
          return sameTeam && diffUser && isActive;
        });

        if (fellowTeammate) {
          setNotification({
            message: `Date Unavailable (Team Clash): Your teammate ${fellowTeammate.fullName || fellowTeammate.username} (${userTeam}) has already booked ${dateStr}. Rule: Maximum one member per team per date.`,
            type: "error"
          });
          return;
        }
      }

      // In change mode, select this single replacement date
      if (selectedDates.includes(dateStr)) {
        onDatesSelect([]);
      } else {
        onDatesSelect([dateStr]);
      }
      return;
    }

    const isAlreadySelected = selectedDates.includes(dateStr);
    if (isAlreadySelected) {
      onDatesSelect(selectedDates.filter((d) => d !== dateStr));
    } else {
      // Check if current user already has this date booked or pending
      const agentStatus = myStatusByDate[dateStr];
      if (agentStatus && (agentStatus.status === "Approved" || agentStatus.status === "Pending")) {
        setNotification({
          message: `You already have an ${agentStatus.status.toLowerCase()} leave request on ${dateStr}.`,
          type: "info"
        });
        return;
      }

      // Check 4-day maximum active booking limit per agent
      const myActiveBookings = (requests || []).filter((r: any) => r.status !== "rejected" && r.status !== "cancelled" && r.status !== "denied");
      const currentActiveDays = myActiveBookings.reduce((sum: number, r: any) => {
        const dCount = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates.length : (r.totalDays || 1);
        return sum + dCount;
      }, 0);

      if (myActiveBookings.length >= 4 || currentActiveDays >= 4) {
        setNotification({
          message: `Maximum booking limit reached: You already have 4 active leave bookings. Cancel an existing booking in 'My Bookings' before booking new dates.`,
          type: "error"
        });
        return;
      }

      if (currentActiveDays + selectedDates.length >= 4) {
        setNotification({
          message: `Limit reached: Maximum 4 active booked leave days allowed. You currently have ${currentActiveDays} active booking(s) and ${selectedDates.length} selected.`,
          type: "error"
        });
        return;
      }

      // Check Core Booking Rule: ONE MEMBER PER TEAM PER DATE
      const dayBookings = allBookingsByDate[dateStr] || [];
      const myNormTeam = normalizeTeamName(userTeam);
      if (myNormTeam && myNormTeam !== "none" && myNormTeam !== "unassigned") {
        const fellowTeammate = dayBookings.find((b: any) => {
          const sameTeam = normalizeTeamName(b.team) === myNormTeam;
          const diffUser = (b.username || "").trim().toLowerCase() !== (currentUsername || "").trim().toLowerCase();
          const isActive = b.status !== "rejected" && b.status !== "cancelled" && b.status !== "denied";
          return sameTeam && diffUser && isActive;
        });

        if (fellowTeammate) {
          setNotification({
            message: `Date Unavailable (Team Clash): Your teammate ${fellowTeammate.fullName || fellowTeammate.username} (${userTeam}) has already booked ${dateStr}. Rule: Maximum one member per team per date.`,
            type: "error"
          });
          return;
        }
      }

      const nextSelected = [...selectedDates, dateStr];
      onDatesSelect(nextSelected);
    }
  };

  return (
    <div
      className={`border rounded-2xl p-6 shadow-xl overflow-hidden relative transition-colors duration-300 ${
        isDarkMode ? "bg-slate-900/40 border-white/10 text-slate-100" : "bg-white border-slate-300 text-slate-900 shadow-md"
      }`}
      id="interactive-calendar-wrapper"
    >
      {/* Header Month Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5 border-b pb-4 border-slate-200 dark:border-white/10">
        <div>
          <span className={`text-xs font-mono font-bold tracking-wider uppercase ${isDarkMode ? "text-cyan-400" : "text-indigo-600"}`}>
            Workforce Leave Calendar
          </span>
          <h2 className={`text-2xl font-sans font-extrabold flex items-center gap-2 mt-0.5 ${isDarkMode ? "text-white" : "text-slate-900"}`}>
            <Calendar className={`w-5 h-5 ${isDarkMode ? "text-cyan-400" : "text-indigo-600"}`} />
            <span>{currentViewMonth.name}</span>
            <span className="text-slate-500 font-mono text-lg font-light">{currentViewMonth.year}</span>
            <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ml-2 ${
              isDarkMode ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-400" : "bg-emerald-100 border-emerald-300 text-emerald-800"
            }`}>
              <Unlock className="w-3 h-3" />
              <span>OPEN</span>
            </span>
          </h2>
        </div>

        {/* Month Selector Chips: ONLY rendered if multiple open months exist */}
        {openMonths.length > 1 && (
          <div className={`flex p-1.5 rounded-xl border w-full sm:w-auto overflow-x-auto gap-1.5 black-white-scrollbar ${
            isDarkMode ? "bg-slate-950/60 border-white/5" : "bg-slate-100 border-slate-300"
          }`}>
            {openMonths.map((m) => {
              const isSelectedMonth = activeMonthObj.key === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setSelectedMonthKey(m.key)}
                  className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 whitespace-nowrap cursor-pointer font-bold flex items-center gap-2 border ${
                    isSelectedMonth
                      ? isDarkMode
                        ? "bg-cyan-500 text-black border-cyan-400 font-bold shadow-lg shadow-cyan-500/20"
                        : "bg-indigo-600 text-white border-indigo-700 font-extrabold shadow-md"
                      : isDarkMode
                      ? "text-slate-300 border-transparent bg-slate-900/40 hover:text-white hover:bg-slate-800"
                      : "text-slate-700 border-slate-200 bg-white hover:bg-slate-200"
                  }`}
                >
                  <span>{m.monthName}</span>
                  <span className="text-[10px] font-mono opacity-80">{m.year}</span>
                  <span className={`text-[8px] font-mono font-extrabold px-1 py-0.2 rounded border ${
                    isSelectedMonth
                      ? isDarkMode ? "bg-black/20 text-black border-black/20" : "bg-white/20 text-white border-white/30"
                      : isDarkMode ? "bg-emerald-950/80 text-emerald-400 border-emerald-500/30" : "bg-emerald-100 text-emerald-800 border-emerald-300"
                  }`}>
                    OPEN
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Inline Feedback Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`mb-4 p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
              notification.type === "error"
                ? isDarkMode ? "bg-red-950/40 border-red-500/40 text-red-300" : "bg-red-50 border-red-300 text-red-900"
                : notification.type === "warning"
                ? isDarkMode ? "bg-amber-950/40 border-amber-500/40 text-amber-300" : "bg-amber-50 border-amber-300 text-amber-900"
                : isDarkMode ? "bg-cyan-950/40 border-cyan-500/40 text-cyan-300" : "bg-cyan-50 border-cyan-300 text-cyan-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === "error" ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              ) : notification.type === "warning" ? (
                <Timer className="w-4 h-4 shrink-0 text-amber-400" />
              ) : (
                <Info className="w-4 h-4 shrink-0 text-cyan-400" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 hover:opacity-70 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Month State Banner */}
      <div className={`mb-3 rounded-xl p-2.5 border flex items-center justify-between text-xs ${
        isDarkMode ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
      }`}>
        <div className="flex items-center gap-2">
          <Unlock className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-bold">Booking is OPEN for {currentViewMonth.name} {currentViewMonth.year}</span>
        </div>
        <span className="text-[11px] font-mono text-emerald-400/90">Click valid weekdays to select leave dates</span>
      </div>

      {/* Calendar Status Legend */}
      <div className={`mb-4 p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono ${
        isDarkMode ? "bg-slate-900/40 border-white/5 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Leave Status:</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Pending
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Approved
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Denied
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-indigo-600 dark:bg-cyan-500"></span> Selected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-rose-500/40"></span> Team Clash
          </span>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className={`grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-bold mb-2 ${
        isDarkMode ? "text-slate-400" : "text-slate-600"
      }`}>
        <span className="text-red-400">SUN</span>
        <span>MON</span>
        <span>TUE</span>
        <span>WED</span>
        <span>THU</span>
        <span>FRI</span>
        <span className="text-red-400">SAT</span>
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1.5" id="calendar-days-grid">
        {calendarDays.map((day, cellIdx) => {
          if (!day.dayNum) {
            return (
              <div key={`empty-${cellIdx}`} className="aspect-square bg-transparent border border-transparent rounded-xl" />
            );
          }

          const { dateStr, dayNum } = day;
          const isWeekend = isWeekendDate(dateStr);
          const weekdayShort = getWeekdayShortName(dateStr);

          // Weekend Day Card (Non-selectable)
          if (isWeekend) {
            return (
              <div
                key={dateStr}
                className={`aspect-square rounded-xl border flex flex-col justify-between p-2 select-none cursor-not-allowed ${
                  isDarkMode
                    ? "bg-slate-950/70 border-slate-800/60 text-slate-600"
                    : "bg-slate-100/80 border-slate-300 text-slate-400"
                }`}
                title="Weekend (Non-working)"
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono font-bold ${isDarkMode ? "text-slate-500" : "text-slate-500"}`}>
                    {dayNum}
                  </span>
                  <span className={`text-[9px] font-mono font-bold px-1 rounded ${
                    isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-200 text-slate-600"
                  }`}>
                    {weekdayShort}
                  </span>
                </div>
                <div className="flex items-center justify-center my-auto">
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                    isDarkMode ? "bg-red-950/40 border-red-500/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"
                  }`}>
                    WEEKEND
                  </span>
                </div>
                <span className="text-[8px] font-mono text-center text-slate-400 dark:text-slate-600">
                  Unavailable
                </span>
              </div>
            );
          }

          const isSelected = selectedDates.includes(dateStr);
          const dayBookings = allBookingsByDate[dateStr] || [];
          const totalBookings = dayBookings.length;

          // Agent's own status on this date (Pending, Approved, Denied)
          // Authoritative dates list: strictly derived from r.dates
          const agentStatus = myStatusByDate[dateStr];
          const isChangingThisBooking = !!(changingBooking && agentStatus && (changingBooking.requestId === agentStatus.request.requestId));

          // Check if a fellow team member booked
          const userNormTeam = normalizeTeamName(userTeam);
          const fellowTeammateBooking = (userNormTeam && userNormTeam !== "none" && userNormTeam !== "unassigned")
            ? dayBookings.find((b: any) => {
                const sameTeam = normalizeTeamName(b.team) === userNormTeam;
                const diffUser = (b.username || "").trim().toLowerCase() !== (currentUsername || "").trim().toLowerCase();
                const isActive = b.status !== "rejected" && b.status !== "cancelled" && b.status !== "denied";
                return sameTeam && diffUser && isActive;
              })
            : null;

          // Tooltip info
          let tooltipContent = `Date: ${dateStr}`;
          if (isChangingThisBooking) {
            tooltipContent = `CURRENT BOOKING (BEING CHANGED)\nDate: ${dateStr}\nSelect an available open weekday to replace this booking.`;
          } else if (agentStatus) {
            tooltipContent = `Date: ${dateStr}\nStatus: ${agentStatus.status}${agentStatus.request.reason ? `\nReason: ${agentStatus.request.reason}` : ""}${agentStatus.request.responseComment ? `\nAdmin note: ${agentStatus.request.responseComment}` : ""}`;
          } else if (fellowTeammateBooking) {
            tooltipContent = `UNAVAILABLE (Team Clash)\nDate: ${dateStr}\nAlready booked by teammate ${fellowTeammateBooking.fullName || fellowTeammateBooking.username} (${userTeam}).\n\nRule: Maximum one member per team per date.`;
          } else if (totalBookings === 0) {
            tooltipContent = `${dateStr}: Open for leave booking.`;
          } else {
            const listStr = dayBookings.map((b: any) => `• ${b.fullName || b.username} (${b.team})`).join("\n");
            tooltipContent = `${dateStr} (${totalBookings} booked by other teams — Open for your team):\n${listStr}`;
          }

          return (
            <Tooltip key={dateStr} text={tooltipContent} isDarkMode={isDarkMode} position="top">
              <motion.div
                whileHover={{ scale: 1.03 }}
                onClick={() => handleDayClick(dateStr)}
                className={`aspect-square rounded-xl border flex flex-col justify-between p-2 transition-all relative ${
                  isSelected
                    ? isDarkMode
                      ? "bg-cyan-500 border-cyan-400 text-black shadow-lg shadow-cyan-500/20 cursor-pointer"
                      : "bg-indigo-600 border-indigo-700 text-white shadow-lg cursor-pointer"
                    : isChangingThisBooking
                    ? isDarkMode
                      ? "bg-amber-950/50 border-amber-500/70 text-amber-200 cursor-pointer ring-1 ring-amber-500/40"
                      : "bg-amber-100/90 border-amber-500 text-amber-950 cursor-pointer font-bold ring-1 ring-amber-400"
                    : agentStatus
                    ? agentStatus.status === "Approved"
                      ? isDarkMode
                        ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200 cursor-pointer"
                        : "bg-emerald-50 border-emerald-400 text-emerald-950 cursor-pointer font-bold"
                      : agentStatus.status === "Pending"
                      ? isDarkMode
                        ? "bg-amber-950/40 border-amber-500/50 text-amber-200 cursor-pointer"
                        : "bg-amber-50 border-amber-400 text-amber-950 cursor-pointer font-bold"
                      : isDarkMode
                      ? "bg-rose-950/30 border-rose-500/40 text-rose-200 hover:border-rose-400 cursor-pointer"
                      : "bg-rose-50 border-rose-300 text-rose-950 hover:border-rose-400 cursor-pointer font-bold"
                    : fellowTeammateBooking
                    ? isDarkMode
                      ? "bg-rose-950/30 border-rose-500/40 text-rose-200 hover:bg-rose-950/50 cursor-pointer"
                      : "bg-rose-50 border-rose-300 text-rose-950 hover:bg-rose-100 cursor-pointer"
                    : totalBookings > 0
                    ? isDarkMode
                      ? "bg-slate-900/60 border-amber-500/30 text-amber-200 hover:border-amber-400 cursor-pointer"
                      : "bg-amber-50/70 border-amber-300 text-amber-950 hover:border-amber-400 cursor-pointer"
                    : isDarkMode
                    ? "bg-slate-900/50 hover:border-cyan-500/40 text-slate-300 border-white/5 cursor-pointer"
                    : "bg-slate-50 hover:border-indigo-400 text-slate-800 border-slate-300 cursor-pointer"
                }`}
              >
                {/* Day Number and Badges */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono font-bold leading-none ${
                    isSelected
                      ? isDarkMode ? "text-black font-extrabold" : "text-white font-black"
                      : fellowTeammateBooking && !agentStatus
                      ? isDarkMode ? "text-rose-300 font-extrabold" : "text-rose-900 font-black"
                      : isDarkMode ? "text-slate-200" : "text-slate-900 font-bold"
                  }`}>
                    {dayNum}
                  </span>

                  {isChangingThisBooking && !isSelected ? (
                    <span className={`text-[7px] font-mono font-extrabold px-1 rounded uppercase ${
                      isDarkMode ? "bg-amber-500/30 text-amber-300 border border-amber-500/50" : "bg-amber-500 text-white"
                    }`}>
                      CHANGING
                    </span>
                  ) : agentStatus && !isSelected ? (
                    <span className={`text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded border leading-tight uppercase tracking-wider ${
                      agentStatus.status === "Approved"
                        ? isDarkMode ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/50" : "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : agentStatus.status === "Pending"
                        ? isDarkMode ? "bg-amber-950/80 text-amber-300 border-amber-500/50" : "bg-amber-100 text-amber-800 border-amber-300"
                        : isDarkMode ? "bg-rose-950/80 text-rose-300 border-rose-500/50" : "bg-rose-100 text-rose-800 border-rose-300"
                    }`}>
                      {agentStatus.status}
                    </span>
                  ) : fellowTeammateBooking && !isSelected ? (
                    <span className={`text-[8px] font-mono font-extrabold px-1 rounded ${
                      isDarkMode ? "bg-rose-500/20 text-rose-300 border border-rose-500/40" : "bg-rose-600 text-white"
                    }`}>
                      CLASH
                    </span>
                  ) : isSelected ? (
                    <span className={`text-[8px] font-mono font-extrabold px-1 rounded ${
                      isDarkMode ? "bg-black/20 text-black" : "bg-white/20 text-white"
                    }`}>
                      {changingBooking ? "NEW ✓" : "✓"}
                    </span>
                  ) : null}
                </div>

                {/* Bottom Status / Count */}
                <div className="flex flex-col gap-0.5 mt-auto">
                  {fellowTeammateBooking && !isSelected && !agentStatus ? (
                    <span className={`text-[8px] font-mono font-bold px-1 py-0.5 rounded truncate flex items-center gap-1 ${
                      isDarkMode ? "text-rose-300 bg-rose-950/80 border border-rose-500/40" : "text-rose-900 bg-rose-100 border border-rose-300"
                    }`}>
                      <span>🔒 {fellowTeammateBooking.fullName || fellowTeammateBooking.username}</span>
                    </span>
                  ) : agentStatus && !isSelected ? (
                    <div className="flex justify-between items-center w-full text-[9px] font-mono">
                      <span className={`px-1 py-0.5 rounded flex items-center gap-1 font-bold ${
                        agentStatus.status === "Approved"
                          ? isDarkMode ? "text-emerald-300 bg-emerald-950/60 border border-emerald-500/30" : "text-emerald-800 bg-emerald-100 border border-emerald-300"
                          : agentStatus.status === "Pending"
                          ? isDarkMode ? "text-amber-300 bg-amber-950/60 border border-amber-500/30" : "text-amber-800 bg-amber-100 border border-amber-300"
                          : isDarkMode ? "text-rose-300 bg-rose-950/60 border border-rose-500/30" : "text-rose-800 bg-rose-100 border border-rose-300"
                      }`}>
                        <span>{agentStatus.status}</span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center w-full text-[9px] font-mono">
                      <span className={`px-1 py-0.5 rounded flex items-center gap-1 font-bold ${
                        isSelected
                          ? isDarkMode ? "text-black/90 bg-black/10" : "text-white bg-white/10"
                          : totalBookings > 0
                          ? isDarkMode ? "text-amber-300 bg-amber-950/60 border border-amber-500/20" : "text-amber-900 bg-amber-100 border border-amber-300"
                          : isDarkMode ? "text-emerald-400" : "text-emerald-700"
                      }`}>
                        {totalBookings > 0 ? (
                          <>
                            <Users className="w-2.5 h-2.5 shrink-0" />
                            <span>{totalBookings} booked</span>
                          </>
                        ) : (
                          <span>Available</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
