import { DateTime } from "luxon";
import {
  ReflowInput,
  ReflowResult,
  WorkCenterDoc,
  WorkOrderChange,
  WorkOrderDoc,
  ChangeReason
} from "./types";
import { topologicalSortWorkOrders } from "./dependency-graph";
import { Interval, insertNoOverlap, mergeIntervals } from "../utils/intervals";
import { addWorkingMinutes, nextWorkingInstant } from "../utils/date-utils";
import { validateAll } from "./constraint-checker";

function dt(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: "utc" });
}
function iso(z: DateTime): string {
  const value = z.toUTC().toISO({ suppressMilliseconds: true });
  if (!value) {
    throw new Error("Failed to convert DateTime to ISO string");
  }
  return value;
}

export class ReflowService {
  public reflow(input: ReflowInput): ReflowResult {
    const { workOrders, workCenters } = input;

    const wcById = new Map<string, WorkCenterDoc>(workCenters.map(wc => [wc.docId, wc]));
    const woById = new Map<string, WorkOrderDoc>(workOrders.map(wo => [wo.docId, deepClone(wo)]));

    // Validate base references early
    for (const wo of workOrders) {
      if (!wcById.has(wo.data.workCenterId)) {
        throw new Error(`Unknown workCenterId=${wo.data.workCenterId} for workOrder=${wo.docId}`);
      }
      for (const p of wo.data.dependsOnWorkOrderIds ?? []) {
        if (!woById.has(p)) throw new Error(`Dependency not found: parent=${p} for child=${wo.docId}`);
      }
      if (wo.data.durationMinutes <= 0) throw new Error(`durationMinutes must be > 0: ${wo.docId}`);
    }

    // Build fixed blocks per work center: maintenanceWindows + maintenance work orders
    const fixedBlocksByWC = new Map<string, Interval[]>();
    for (const wc of workCenters) {
      const blocks: Interval[] = [];

      for (const mw of wc.data.maintenanceWindows ?? []) {
        blocks.push({
          start: dt(mw.startDate),
          end: dt(mw.endDate),
          label: `MW:${mw.reason ?? "maintenance"}`,
        });
      }

      // maintenance work orders are fixed and block time
      for (const wo of workOrders) {
        if (wo.data.workCenterId !== wc.docId) continue;
        if (!wo.data.isMaintenance) continue;

        blocks.push({
          start: dt(wo.data.startDate),
          end: dt(wo.data.endDate),
          label: `WO-MAINT:${wo.data.workOrderNumber}`,
        });
      }

      const merged = mergeIntervals(blocks.sort((a,b) => a.start.toMillis() - b.start.toMillis()));
      fixedBlocksByWC.set(wc.docId, merged);
    }

    // Build a work-center timeline seeded with fixed blocks + fixed maintenance work orders
    // We'll insert scheduled non-maintenance orders into this timeline.
    const timelineByWC = new Map<string, Interval[]>();
    for (const wc of workCenters) {
      timelineByWC.set(wc.docId, [...(fixedBlocksByWC.get(wc.docId) ?? [])]);
    }

    // Topologically sort all work orders (including maintenance ones)
    // We will only reschedule non-maintenance; maintenance stays as-is.
    const topo = topologicalSortWorkOrders(workOrders);

    // For deterministic behavior, after topo sort: stable secondary sort.
    const ordered = [...topo].sort((a, b) => {
      // primary: topo order already mostly handled by stable queue; keep tie-breakers deterministic here:
      const wc = a.data.workCenterId.localeCompare(b.data.workCenterId);
      if (wc !== 0) return wc;
      const sd = a.data.startDate.localeCompare(b.data.startDate);
      if (sd !== 0) return sd;
      return a.data.workOrderNumber.localeCompare(b.data.workOrderNumber);
    });

    // We'll store computed end times for dependency readiness
    const computedEnd = new Map<string, DateTime>();
    for (const wo of ordered) {
      computedEnd.set(wo.docId, dt(wo.data.endDate));
    }

    // Changes output
    const changes: WorkOrderChange[] = [];

    // Schedule all work orders in order
    for (const woOriginal of ordered) {
      const wo = woById.get(woOriginal.docId)!;
      const wc = wcById.get(wo.data.workCenterId)!;
      const shifts = wc.data.shifts ?? [];
      if (shifts.length === 0) throw new Error(`WorkCenter ${wc.docId} has no shifts; cannot schedule.`);

      // maintenance work orders cannot move; ensure they are inserted into timeline (as fixed)
      if (wo.data.isMaintenance) {
        // just record computed end; timeline already seeded with blocks
        computedEnd.set(wo.docId, dt(wo.data.endDate));
        continue;
      }

      const oldStart = dt(wo.data.startDate);
      const oldEnd = dt(wo.data.endDate);

      // depsReadyAt = max(parent end)
      let depsReadyAt = oldStart;
      for (const p of wo.data.dependsOnWorkOrderIds ?? []) {
        const pe = computedEnd.get(p);
        if (!pe) throw new Error(`Internal: missing computed end for parent ${p}`);
        if (pe.toMillis() > depsReadyAt.toMillis()) depsReadyAt = pe;
      }

      // resourceReadyAt = end of last item in timeline for this WC that starts/ends before candidate time
      const timeline = timelineByWC.get(wc.docId)!;
      const lastEnd = timeline.length ? timeline[timeline.length - 1].end : oldStart;

      // We keep the schedule "forward-only": don't pull earlier than original start.
      const candidateStart = maxDateTime(oldStart, depsReadyAt, lastEnd);

      // Move to next working instant
      const startAligned = nextWorkingInstant(candidateStart, shifts);

      // blocked intervals include both maintenance windows and fixed maintenance WOs (already merged)
      const blocked = fixedBlocksByWC.get(wc.docId) ?? [];

      // Calculate end with shift/maintenance aware working minutes
      const { end: computed, usedShiftBoundary, usedMaintenanceSkip } = addWorkingMinutes(
        startAligned,
        wo.data.durationMinutes,
        shifts,
        blocked
      );

      // Now ensure it doesn't overlap any existing scheduled items on this WC timeline
      // If it overlaps, push start to the end of the conflicting interval and retry.
      // This handles "work center conflicts" deterministically.
      let finalStart = startAligned;
      let finalEnd = computed;

      const reasons = new Set<ChangeReason>();

      // tag reasons from constraints
      if (depsReadyAt.toMillis() > oldStart.toMillis()) reasons.add("dependency");
      if (lastEnd.toMillis() > oldStart.toMillis()) reasons.add("workCenterConflict");
      if (usedShiftBoundary) reasons.add("shiftBoundary");
      if (usedMaintenanceSkip) reasons.add("maintenanceWindow");

      for (let guard = 0; guard < 200; guard++) {
        const candidateInterval: Interval = { start: finalStart, end: finalEnd, label: wo.docId };

        const conflict = findAnyOverlap(timeline, candidateInterval);
        if (!conflict) break;

        // push start to conflict end, then recompute end
        reasons.add("workCenterConflict");
        finalStart = nextWorkingInstant(conflict.end, shifts);
        finalEnd = addWorkingMinutes(finalStart, wo.data.durationMinutes, shifts, blocked).end;
      }

      // Insert into WC timeline
      const scheduledInterval: Interval = { start: finalStart, end: finalEnd, label: `WO:${wo.data.workOrderNumber}` };
      const newTimeline = insertNoOverlap(timeline, scheduledInterval);
      timelineByWC.set(wc.docId, newTimeline);

      // Update work order dates
      wo.data.startDate = iso(finalStart);
      wo.data.endDate = iso(finalEnd);

      computedEnd.set(wo.docId, finalEnd);

      // record change if moved
      const moved = oldStart.toMillis() !== finalStart.toMillis() || oldEnd.toMillis() !== finalEnd.toMillis();
      if (moved) {
        const deltaMinutes = Math.round((finalEnd.toMillis() - oldEnd.toMillis()) / 60000);
        const explanationText = generateExplanation(reasons);
        changes.push({
          workOrderId: wo.docId,
          workOrderNumber: wo.data.workOrderNumber,
          oldStartDate: iso(oldStart),
          oldEndDate: iso(oldEnd),
          newStartDate: iso(finalStart),
          newEndDate: iso(finalEnd),
          deltaMinutes,
          reasons: [...reasons],
          why: explanationText,
        });
      }
    }

    const updated = [...woById.values()];

    // Final validation (hard constraints)
    validateAll(updated, workCenters);

    return {
      updatedWorkOrders: updated,
      changes,
      explanation:
        "Reflow scheduled non-maintenance work orders in dependency-topological order, placing each at the earliest feasible time on its work center timeline while respecting shift hours and blocked maintenance intervals. Maintenance work orders and work center maintenance windows are treated as fixed blocks.",
    };
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function maxDateTime(...dts: DateTime[]): DateTime {
  return dts.reduce((m, x) => (x.toMillis() > m.toMillis() ? x : m));
}

function findAnyOverlap(timeline: Interval[], candidate: Interval): Interval | null {
  for (const item of timeline) {
    if (item.start.toMillis() < candidate.end.toMillis() && candidate.start.toMillis() < item.end.toMillis()) {
      return item;
    }
  }
  return null;
}


function generateExplanation(reasons: Set<ChangeReason>): string {
  const parts: string[] = [];

  if (reasons.has("dependency"))
    parts.push("Delayed due to parent dependency completion time.");

  if (reasons.has("workCenterConflict"))
    parts.push("Shifted to avoid work center overlap.");

  if (reasons.has("shiftBoundary"))
    parts.push("Paused outside shift hours and resumed next shift.");

  if (reasons.has("maintenanceWindow"))
    parts.push("Skipped maintenance window.");

  return parts.join(" ");
}