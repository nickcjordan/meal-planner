import type { DayOfWeek } from "@meal-planner/types";

export const DAY_ORDER: DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/**
 * Uppercase 3-letter day labels (e.g. "MON"), keyed by lowercase day name.
 * `Record<string, string>` (not `DayOfWeek`-keyed) so it can be indexed by the
 * plain-`string` `day` fields that meal proposals carry.
 */
export const DAY_SHORT: Record<string, string> = {
  monday: "MON",
  tuesday: "TUE",
  wednesday: "WED",
  thursday: "THU",
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
};

export function getCurrentMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** The Monday that "this week" planning targets.
 *  Mon–Fri → the current week's Monday.
 *  Sat–Sun → next Monday, because the current week is effectively over. */
export function getPlanningMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) {
    const daysUntil = day === 0 ? 1 : 2;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil);
    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, "0");
    const dd = String(monday.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return getCurrentMonday();
}

/**
 * Format a `YYYY-MM-DD` weekOf string for display, parsing it as a *local* date
 * (via `T00:00:00`) so it never renders a day early in negative-offset zones the
 * way `new Date("YYYY-MM-DD")` (UTC-parsed) does. Pass Intl options to match a
 * given call site; defaults to `{ month: "long", day: "numeric" }`.
 */
export function formatWeekOf(
  weekOf: string,
  options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" },
  locale: string = "en-US",
): string {
  return new Date(weekOf + "T00:00:00").toLocaleDateString(locale, options);
}

export function getTodayDayOfWeek(): DayOfWeek {
  const days: DayOfWeek[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[new Date().getDay()];
}
