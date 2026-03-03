import { DateTime } from "luxon";
import { WorkCenterDoc, WorkOrderDoc } from "./types";
import { Interval, overlaps } from "../utils/intervals";

function dt(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: "utc" });
}

export function validateNoOverlapsByWorkCenter(workOrders: WorkOrderDoc[]): void {
  const byWC = new Map<string, WorkOrderDoc[]>();
  for (const w of workOrders) {
    const arr = byWC.get(w.data.workCenterId) ?? [];
    arr.push(w);
    byWC.set(w.data.workCenterId, arr);
  }

  for (const [wcId, arr] of byWC.entries()) {
    const intervals: Interval[] = arr
      .map(w => ({ start: dt(w.data.startDate), end: dt(w.data.endDate), label: w.docId }))
      .sort((a,b) => a.start.toMillis() - b.start.toMillis());

    for (let i = 1; i < intervals.length; i++) {
      if (overlaps(intervals[i - 1], intervals[i])) {
        throw new Error(`Overlap on workCenter=${wcId} between ${intervals[i-1].label} and ${intervals[i].label}`);
      }
    }
  }
}

export function validateDependencies(workOrders: WorkOrderDoc[]): void {
  const byId = new Map(workOrders.map(w => [w.docId, w]));
  for (const w of workOrders) {
    const ws = dt(w.data.startDate);
    for (const p of w.data.dependsOnWorkOrderIds ?? []) {
      const parent = byId.get(p);
      if (!parent) throw new Error(`Missing parent ${p}`);
      const pe = dt(parent.data.endDate);
      if (pe.toMillis() > ws.toMillis()) {
        throw new Error(`Dependency violated: ${parent.docId} ends ${pe.toISO()} after ${w.docId} starts ${ws.toISO()}`);
      }
    }
  }
}

/**
 * Basic shift-window sanity check:
 * Ensures start/end are in UTC and end after start.
 * (Full “only working time counted” is ensured by our time math, but this guards corruption.)
 */
export function validateDates(workOrders: WorkOrderDoc[]): void {
  for (const w of workOrders) {
    const s = dt(w.data.startDate);
    const e = dt(w.data.endDate);
    if (!(e.toMillis() > s.toMillis())) {
      throw new Error(`Invalid work order times: ${w.docId} end must be after start`);
    }
  }
}

export function validateAll(workOrders: WorkOrderDoc[], workCenters: WorkCenterDoc[]): void {
  // WorkCenter existence
  const wcIds = new Set(workCenters.map(w => w.docId));
  for (const w of workOrders) {
    if (!wcIds.has(w.data.workCenterId)) {
      throw new Error(`Work order ${w.docId} references unknown workCenterId=${w.data.workCenterId}`);
    }
  }
  validateDates(workOrders);
  validateNoOverlapsByWorkCenter(workOrders);
  validateDependencies(workOrders);
}