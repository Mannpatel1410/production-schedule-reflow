// src/utils/date-utils.ts
import { DateTime } from "luxon";
import { Shift } from "../reflow/types";
import { Interval, findFirstOverlap } from "./intervals";

/**
 * Shifts are defined by day-of-week (0=Sun ... 6=Sat) and start/end hours (UTC).
 * Shift window is treated as [start, end).
 *
 * Assumption: Scheduling calculations run in UTC for deterministic behavior.
 */
export function getShiftWindowFor(dt: DateTime, shifts: Shift[]): Interval | null {
    const cur = dt.toUTC();

    // Luxon weekday: 1(Mon)..7(Sun). We want 0(Sun)..6(Sat)
    const mappedDow = cur.weekday % 7;

    const candidates = shifts.filter(s => s.dayOfWeek === mappedDow);
    if (candidates.length === 0) return null;

    const dayStart = cur.startOf("day");
    const windows = candidates
    .map(s => {
        const start = dayStart.set({ hour: s.startHour, minute: 0, second: 0, millisecond: 0 });
        const end = dayStart.set({ hour: s.endHour, minute: 0, second: 0, millisecond: 0 });
        return { start, end };
    })
    .filter(w => w.end.toMillis() > w.start.toMillis());

    // If dt is inside a window, return that window
    for (const w of windows) {
    if (cur.toMillis() >= w.start.toMillis() && cur.toMillis() < w.end.toMillis()) return w;
    }

    // Otherwise return the next window later today, else the earliest window today
    const later = windows
    .filter(w => w.start.toMillis() > cur.toMillis())
    .sort((a, b) => a.start.toMillis() - b.start.toMillis())[0];

    return later ?? windows.sort((a, b) => a.start.toMillis() - b.start.toMillis())[0] ?? null;
    }

    /** Returns the next datetime that is inside a shift window; if already inside, returns dt. */
    export function nextWorkingInstant(dt: DateTime, shifts: Shift[]): DateTime {
    let cur = dt.toUTC();

    for (let guard = 0; guard < 366; guard++) {
    const win = getShiftWindowFor(cur, shifts);

    if (win && cur.toMillis() >= win.start.toMillis() && cur.toMillis() < win.end.toMillis()) return cur;
    if (win && cur.toMillis() < win.start.toMillis()) return win.start;

    // No shift today, or dt past shift end: move to next day 00:00 UTC
    cur = cur.plus({ days: 1 }).startOf("day");
    }

    throw new Error("No working instant found within guard window (check shift schedules).");
    }

    /**
     * Adds working minutes from `start`, counting only minutes inside shift windows
     * and skipping blocked intervals (maintenance windows + fixed maintenance work orders).
     *
     * This supports split execution across shift boundaries and maintenance windows.
     */
    export function addWorkingMinutes(
    start: DateTime,
    minutes: number,
    shifts: Shift[],
    blocked: Interval[]
    ): { end: DateTime; usedShiftBoundary: boolean; usedMaintenanceSkip: boolean } {
    if (minutes < 0) throw new Error("minutes must be >= 0");

    let remaining = minutes;
    let cur = start.toUTC();

    let usedShiftBoundary = false;
    let usedMaintenanceSkip = false;

    while (remaining > 0) {
    const before = cur;

    // Ensure we are inside a working instant
    const aligned = nextWorkingInstant(cur, shifts);
    if (aligned.toMillis() !== cur.toMillis()) usedShiftBoundary = true;
    cur = aligned;

    const win = getShiftWindowFor(cur, shifts);
    if (!win) {
        cur = cur.plus({ days: 1 }).startOf("day");
        continue;
    }

    const segStart = cur;
    const segEnd = win.end;

    // Find the first overlap with a blocked interval inside this shift segment
    const block = findFirstOverlap(blocked, segStart, segEnd);

    if (block) {
        usedMaintenanceSkip = true;

        // Clamp block to [segStart, segEnd)
        const blockStart = block.start.toMillis() > segStart.toMillis() ? block.start : segStart;
        const blockEnd = block.end.toMillis() < segEnd.toMillis() ? block.end : segEnd;

        // Work before the block begins
        const workableMinutes = Math.floor((blockStart.toMillis() - segStart.toMillis()) / 60000);

        if (workableMinutes > 0) {
        const take = Math.min(remaining, workableMinutes);
        cur = cur.plus({ minutes: take });
        remaining -= take;

        if (remaining === 0) break;
        }

        // Skip the blocked portion and continue
        cur = blockEnd;
        if (cur.toMillis() >= segEnd.toMillis()) usedShiftBoundary = true;

        continue;
    }

    // No blocked interval in this shift segment
    const available = Math.floor((segEnd.toMillis() - segStart.toMillis()) / 60000);
    const take = Math.min(remaining, available);

    cur = cur.plus({ minutes: take });
    remaining -= take;

    if (remaining > 0 && cur.toMillis() >= segEnd.toMillis()) usedShiftBoundary = true;

    if (cur.toMillis() === before.toMillis()) {
        throw new Error("addWorkingMinutes made no progress (check shifts/blocked intervals).");
    }
    }

    return { end: cur, usedShiftBoundary, usedMaintenanceSkip };
}