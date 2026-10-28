/**
 * Comprehensive Date Validation Test Suite
 * Tests weekday vs weekend detection, timezone robustness,
 * month/year boundaries, and ensures Monday-Friday are never classified as weekends.
 */

import {
  parseCalendarDate,
  getCalendarDayOfWeek,
  isWeekendDay,
  isWeekday,
  getWeekdayName,
  getDatesInRange,
  formatDateToWords
} from "./src/utils/dateUtils";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

console.log("=== 1. TEST ALL 7 DAYS OF THE WEEK (September 14-20, 2026) ===");
const sevenDays = [
  { date: "2026-09-14", name: "Monday", isWk: false, dow: 1 },
  { date: "2026-09-15", name: "Tuesday", isWk: false, dow: 2 },
  { date: "2026-09-16", name: "Wednesday", isWk: false, dow: 3 },
  { date: "2026-09-17", name: "Thursday", isWk: false, dow: 4 },
  { date: "2026-09-18", name: "Friday", isWk: false, dow: 5 },
  { date: "2026-09-19", name: "Saturday", isWk: true, dow: 6 },
  { date: "2026-09-20", name: "Sunday", isWk: true, dow: 0 }
];

for (const day of sevenDays) {
  assert(getCalendarDayOfWeek(day.date) === day.dow, `${day.date} day of week index is ${day.dow} (${day.name})`);
  assert(isWeekendDay(day.date) === day.isWk, `${day.date} isWeekendDay is ${day.isWk}`);
  assert(isWeekday(day.date) === !day.isWk, `${day.date} isWeekday is ${!day.isWk}`);
  assert(getWeekdayName(day.date) === day.name, `${day.date} weekday name is ${day.name}`);
}

console.log("\n=== 2. TEST MONTH BOUNDARIES ===");
const monthBoundaries = [
  { date: "2026-08-31", name: "Monday", isWk: false, dow: 1 },
  { date: "2026-09-01", name: "Tuesday", isWk: false, dow: 2 },
  { date: "2026-09-30", name: "Wednesday", isWk: false, dow: 3 },
  { date: "2026-10-01", name: "Thursday", isWk: false, dow: 4 },
  { date: "2026-10-31", name: "Saturday", isWk: true, dow: 6 },
  { date: "2026-11-01", name: "Sunday", isWk: true, dow: 0 },
  { date: "2026-11-02", name: "Monday", isWk: false, dow: 1 }
];

for (const day of monthBoundaries) {
  assert(isWeekendDay(day.date) === day.isWk, `Month boundary ${day.date} (${day.name}) isWeekend=${day.isWk}`);
  assert(isWeekday(day.date) === !day.isWk, `Month boundary ${day.date} (${day.name}) isWeekday=${!day.isWk}`);
}

console.log("\n=== 3. TEST YEAR BOUNDARIES & LEAP YEARS ===");
const yearBoundaries = [
  { date: "2026-12-31", name: "Thursday", isWk: false, dow: 4 },
  { date: "2027-01-01", name: "Friday", isWk: false, dow: 5 },
  { date: "2027-01-02", name: "Saturday", isWk: true, dow: 6 },
  { date: "2027-01-03", name: "Sunday", isWk: true, dow: 0 },
  { date: "2028-02-28", name: "Monday", isWk: false, dow: 1 },
  { date: "2028-02-29", name: "Tuesday", isWk: false, dow: 2 },
  { date: "2028-03-01", name: "Wednesday", isWk: false, dow: 3 }
];

for (const day of yearBoundaries) {
  assert(isWeekendDay(day.date) === day.isWk, `Year boundary ${day.date} (${day.name}) isWeekend=${day.isWk}`);
  assert(isWeekday(day.date) === !day.isWk, `Year boundary ${day.date} (${day.name}) isWeekday=${!day.isWk}`);
}

console.log("\n=== 4. TEST DATE RANGE GENERATION ACROSS WEEKENDS ===");
const range = getDatesInRange("2026-09-14", "2026-09-21");
assert(range.length === 8, `Range length from 2026-09-14 to 2026-09-21 is 8`);
assert(range[0] === "2026-09-14", `First date is 2026-09-14`);
assert(range[7] === "2026-09-21", `Last date is 2026-09-21`);

// Filter weekdays from range
const weekdaysOnly = range.filter(d => isWeekday(d));
assert(weekdaysOnly.length === 6, `Weekdays count is 6 (excluding Sat 19 and Sun 20)`);
assert(!weekdaysOnly.includes("2026-09-19"), `Saturday is excluded from weekdays`);
assert(!weekdaysOnly.includes("2026-09-20"), `Sunday is excluded from weekdays`);

console.log("\n=== 5. TEST STRING FORMATTING ===");
const formattedMon = formatDateToWords("2026-09-14");
assert(formattedMon.includes("Monday") && formattedMon.includes("September 14, 2026"), `Formatted Monday: ${formattedMon}`);
const formattedSat = formatDateToWords("2026-09-19");
assert(formattedSat.includes("Saturday") && formattedSat.includes("September 19, 2026"), `Formatted Saturday: ${formattedSat}`);

console.log("\n=================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
}
