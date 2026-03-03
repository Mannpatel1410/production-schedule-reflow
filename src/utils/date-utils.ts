import { DateTime } from "luxon";
import { Shift } from "../reflow/types";
import { Interval, findFirstOverlap } from "./intervals";

/**
 * Shifts are defined by day-of-week (0=Sun ... 6=Sat) and start/end hours (UTC).
 * We treat a shift window as [start, end).
 */
export function getShiftWindowFor(dt: DateTime, shifts: Shift[]): Interval | null {
  const dow = dt.weekday % 7; // Luxon weekday: 1(Mon)..7(Sun). Convert to 0(Sun)..6(Sat)
  // Luxon: Sunday is 7. So mapping:
  // dt.weekday: 7 => 0, 1 => 1, ... 6 => 6
  const mappedDow = dt.weekday === 7 ? 0 : dt.weekday; // 1..6 map to 1..6; 7->0
  const candidates = shifts.filter(s => s.dayOfWeek === mappedDow);

  if (candidates.length === 0) return null;

  // If multiple shift entries exist for a day, pick the one that contains dt, else earliest upcoming.
  // (Simple & deterministic)
  const dayStart = dt.startOf("day");
  const windows = candidates.map(s => {
    const start = dayStart.set({ hour: s.startHour, minute: 0, second: 0, millisecond: 0 });
    const end = dayStart.set({ hour: s.endHour, minute: 0, second: 0, millisecond: 0 });
    return { start, end };
  }).filter(w => w.end.toMillis() > w.start.toMillis());

  // containing
  for (const w of windows) {
    if (dt.toMillis() >= w.start.toMillis() && dt.toMillis() < w.end.toMillis()) return w;
  }
  // not contained: return the next shift window later today (min start after dt)
  const later = windows
    .filter(w => w.start.toMillis() > dt.toMillis())
    .sort((a,b) => a.start.toMillis() - b.start.toMillis())[0];
  return later ?? windows.sort((a,b) => a.start.toMillis() - b.start.toMillis())[0] ?? null;
}

/** Find next datetime that is inside a working shift window. If dt is inside shift, returns dt. */
export function nextWorkingInstant(dt: DateTime, shifts: Shift[]): DateTime {
  let cur = dt;
  for (let guard = 0; guard < 366; guard++) { // 1-year guard for impossible schedules
    const win = getShiftWindowFor(cur, shifts);
    if (win && cur.toMillis() >= win.start.toMillis() && cur.toMillis() < win.end.toMillis()) return cur;
    if (win && cur.toMillis() < win.start.toMillis()) return win.start;

    // no shift today, or dt past shift end => jump to next day 00:00 and continue
    cur = cur.plus({ days: 1 }).startOf("day");
  }
  throw new Error("No working instant found within guard window (check shift schedules).");
}

/**
 * Add working minutes to a start time, counting only minutes within shift windows
 * and skipping blocked intervals (maintenance windows + fixed maintenance work orders).
 */
export function addWorkingMinutes(
  start: DateTime,
  minutes: number,
  shifts: Shift[],
  blocked: Interval[]
): { end: DateTime; usedShiftBoundary: boolean; usedMaintenanceSkip: boolean } {
  if (minutes < 0) throw new Error("minutes must be >= 0");
  let remaining = minutes;
  let cur = start;

  let usedShiftBoundary = false;
  let usedMaintenanceSkip = false;

  while (remaining > 0) {
    const before = cur;

    // ensure in shift
    const shifted = nextWorkingInstant(cur, shifts);
    if (shifted.toMillis() !== cur.toMillis()) usedShiftBoundary = true;
    cur = shifted;

    const win = getShiftWindowFor(cur, shifts);
    if (!win) {
      cur = cur.plus({ days: 1 }).startOf("day");
      continue;
    }

    // segment where work could happen before shift ends
    const segStart = cur;
    const segEnd = win.end;

    // check blocked overlap in [segStart, segEnd)
    const block = findFirstOverlap(blocked, segStart, segEnd);

    if (block) {
        usedMaintenanceSkip = true;

        const blockStart = block.start.toMillis() > segStart.toMillis()
            ? block.start
            : segStart;

        const blockEnd = block.end.toMillis() < segEnd.toMillis()
            ? block.end
            : segEnd;

        const workableMinutes = Math.floor(
            (blockStart.toMillis() - segStart.toMillis()) / 60000
        );

        if (workableMinutes > 0) {
            const take = Math.min(remaining, workableMinutes);
            cur = cur.plus({ minutes: take });
            remaining -= take;

            if (remaining === 0) break;
        }

        cur = blockEnd;
        continue;
        }

    // no block in this shift segment
    const available = Math.floor((segEnd.toMillis() - segStart.toMillis()) / 60000);
    const take = Math.min(remaining, available);
    cur = cur.plus({ minutes: take });
    remaining -= take;

    // if we consumed the whole segment and still remaining, we'll move to next shift in next loop
    if (remaining > 0 && cur.toMillis() >= segEnd.toMillis()) usedShiftBoundary = true;

    // if we didn't move, avoid infinite loops
    if (cur.toMillis() === before.toMillis()) {
      throw new Error("addWorkingMinutes made no progress (check shifts/blocked intervals).");
    }
  }

  return { end: cur, usedShiftBoundary, usedMaintenanceSkip };
}