/**
 * Centralized Calendar Date Utilities for ADWORDS Leave & Roster System
 * 
 * Safe handling of calendar days in "YYYY-MM-DD" format.
 * Guarantees that Monday-Friday are recognized as bookable weekdays
 * and only Saturday and Sunday are blocked as non-working weekends.
 * Uses timezone-independent integer calendar arithmetic.
 * NEVER converts leave dates to JavaScript Date objects for booking validation.
 */

export interface CalendarDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/**
 * Parses "YYYY-MM-DD" into numeric calendar date parts.
 */
export function parseCalendarDate(dateStr: string): CalendarDateParts | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const match = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * Returns number of days in a given year and month (1-12).
 */
export function getDaysInMonthCount(year: number, month: number): number {
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    return isLeap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

/**
 * Determines Day-of-Week index (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * directly from year, month, and day components using Sakamoto's algorithm.
 * 100% timezone-independent and does NOT construct any Date objects.
 */
export function getDayOfWeekFromComponents(year: number, month: number, day: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let y = year;
  if (month < 3) {
    y -= 1;
  }
  const dow = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7;
  return (dow + 7) % 7;
}

/**
 * Returns the Day-of-Week index (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * for a calendar date string "YYYY-MM-DD".
 */
export function getCalendarDayOfWeek(dateStr: string): number {
  const parts = parseCalendarDate(dateStr);
  if (!parts) return -1;
  return getDayOfWeekFromComponents(parts.year, parts.month, parts.day);
}

/**
 * Determines whether a given "YYYY-MM-DD" date is a Saturday or Sunday.
 * Timezone-independent:
 * 2026-09-14 -> Monday -> false
 * 2026-09-15 -> Tuesday -> false
 * 2026-09-16 -> Wednesday -> false
 * 2026-09-17 -> Thursday -> false
 * 2026-09-18 -> Friday -> false
 * 2026-09-19 -> Saturday -> true
 * 2026-09-20 -> Sunday -> true
 */
export function isWeekendDate(dateStr: string): boolean {
  const dow = getCalendarDayOfWeek(dateStr);
  return dow === 0 || dow === 6;
}

/**
 * Alias for isWeekendDate.
 */
export function isWeekendDay(dateStr: string): boolean {
  return isWeekendDate(dateStr);
}

/**
 * Returns true for Monday (1) through Friday (5).
 */
export function isWeekdayDate(dateStr: string): boolean {
  const dow = getCalendarDayOfWeek(dateStr);
  return dow >= 1 && dow <= 5;
}

/**
 * Alias for isWeekdayDate.
 */
export function isWeekday(dateStr: string): boolean {
  return isWeekdayDate(dateStr);
}

/**
 * Full English name of weekday (e.g. "Monday", "Tuesday", "Saturday")
 */
export function getWeekdayName(dateStr: string): string {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dow = getCalendarDayOfWeek(dateStr);
  return dow >= 0 && dow <= 6 ? names[dow] : "";
}

/**
 * Short 3-letter English name of weekday (e.g. "MON", "TUE", "SAT")
 */
export function getWeekdayShortName(dateStr: string): string {
  const names = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const dow = getCalendarDayOfWeek(dateStr);
  return dow >= 0 && dow <= 6 ? names[dow] : "";
}

const MONTH_NAME_LIST = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Generates an array of all discrete YYYY-MM-DD dates between startDate and endDate (inclusive).
 * Steps forward purely via calendar day arithmetic without any Date object conversions.
 */
export function getDatesInRange(startDate: string, endDate: string): string[] {
  if (!startDate) return [];
  if (!endDate) return [startDate];
  const startP = parseCalendarDate(startDate);
  const endP = parseCalendarDate(endDate);
  if (!startP || !endP) return [startDate];

  if (startDate > endDate) {
    return [startDate];
  }

  const dates: string[] = [];
  let y = startP.year;
  let m = startP.month;
  let d = startP.day;

  while (true) {
    const mStr = String(m).padStart(2, "0");
    const dStr = String(d).padStart(2, "0");
    const curStr = `${y}-${mStr}-${dStr}`;
    dates.push(curStr);

    if (y === endP.year && m === endP.month && d === endP.day) {
      break;
    }

    const maxDays = getDaysInMonthCount(y, m);
    if (d < maxDays) {
      d++;
    } else {
      d = 1;
      if (m < 12) {
        m++;
      } else {
        m = 1;
        y++;
      }
    }

    // Safety guard against infinite loops
    if (dates.length > 366) break;
  }

  return dates;
}

/**
 * Formats "YYYY-MM-DD" into a verbal readable string with the weekday attached.
 * Example: "Monday, September 14, 2026"
 */
export function formatDateToWords(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parts = parseCalendarDate(dateStr);
  if (!parts) return dateStr;
  const weekday = getWeekdayName(dateStr);
  const monthName = MONTH_NAME_LIST[parts.month - 1] || "";
  return `${weekday}, ${monthName} ${parts.day}, ${parts.year}`;
}

/**
 * Formats "YYYY-MM-DD" into "Month Day, Year" (e.g. "October 2, 2026").
 */
export function formatDateToMonthDayYear(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parts = parseCalendarDate(dateStr);
  if (!parts) return dateStr;
  const monthName = MONTH_NAME_LIST[parts.month - 1] || "";
  return `${monthName} ${parts.day}, ${parts.year}`;
}

/**
 * Formats a leave request's dates into standard display:
 * - Single date: "October 2, 2026"
 * - Date span: "October 9–October 12, 2026"
 */
export function formatLeaveRequestDatesDisplay(dates?: string[], startDate?: string, endDate?: string): string {
  const dateList = Array.isArray(dates) && dates.length > 0
    ? [...dates].sort()
    : (startDate ? (endDate && endDate !== startDate ? getDatesInRange(startDate, endDate) : [startDate]) : []);

  if (dateList.length === 0) {
    if (startDate) return formatDateToMonthDayYear(startDate);
    return "Unspecified date";
  }

  if (dateList.length === 1) {
    return formatDateToMonthDayYear(dateList[0]);
  }

  const firstDate = dateList[0];
  const lastDate = dateList[dateList.length - 1];

  const p1 = parseCalendarDate(firstDate);
  const p2 = parseCalendarDate(lastDate);

  if (!p1 || !p2) {
    return `${firstDate}–${lastDate}`;
  }

  const m1 = MONTH_NAME_LIST[p1.month - 1] || "";
  const m2 = MONTH_NAME_LIST[p2.month - 1] || "";

  if (p1.year === p2.year && p1.month === p2.month) {
    return `${m1} ${p1.day}–${m2} ${p2.day}, ${p1.year}`;
  } else if (p1.year === p2.year) {
    return `${m1} ${p1.day}–${m2} ${p2.day}, ${p1.year}`;
  } else {
    return `${m1} ${p1.day}, ${p1.year}–${m2} ${p2.day}, ${p2.year}`;
  }
}

