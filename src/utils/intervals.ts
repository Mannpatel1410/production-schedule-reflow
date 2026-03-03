import { DateTime } from "luxon";

export interface Interval {
  start: DateTime;
  end: DateTime; // end must be > start
  label?: string;
}

export function assertValidInterval(i: Interval): void {
  if (!(i.end.toMillis() > i.start.toMillis())) {
    throw new Error(`Invalid interval: end must be after start. start=${i.start.toISO()} end=${i.end.toISO()}`);
  }
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start.toMillis() < b.end.toMillis() && b.start.toMillis() < a.end.toMillis();
}

export function clampStart(i: Interval, newStart: DateTime): Interval {
  if (newStart.toMillis() >= i.end.toMillis()) {
    throw new Error("Cannot clamp interval start beyond end");
  }
  return { ...i, start: newStart };
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((x, y) => x.start.toMillis() - y.start.toMillis());
  const out: Interval[] = [];
  let cur = sorted[0];
  assertValidInterval(cur);

  for (let k = 1; k < sorted.length; k++) {
    const nxt = sorted[k];
    assertValidInterval(nxt);
    if (cur.end.toMillis() >= nxt.start.toMillis()) {
      // merge
      cur = {
        start: cur.start,
        end: cur.end.toMillis() >= nxt.end.toMillis() ? cur.end : nxt.end,
        label: cur.label ?? nxt.label,
      };
    } else {
      out.push(cur);
      cur = nxt;
    }
  }
  out.push(cur);
  return out;
}

/** Returns the first blocked interval that overlaps [segStart, segEnd), else null. Assumes blocks are merged & sorted. */
export function findFirstOverlap(blocks: Interval[], segStart: DateTime, segEnd: DateTime): Interval | null {
  const s = segStart.toMillis();
  const e = segEnd.toMillis();
  for (const b of blocks) {
    const bs = b.start.toMillis();
    const be = b.end.toMillis();
    if (be <= s) continue;
    if (bs >= e) break;
    // overlap exists
    if (bs < e && s < be) return b;
  }
  return null;
}

/** Insert interval into a sorted non-overlapping timeline; throws if overlap. */
export function insertNoOverlap(timeline: Interval[], item: Interval): Interval[] {
  assertValidInterval(item);

  // find insert position
  const idx = lowerBound(timeline, item.start.toMillis());
  const prev = idx > 0 ? timeline[idx - 1] : null;
  const next = idx < timeline.length ? timeline[idx] : null;

  if (prev && overlaps(prev, item)) throw new Error(`Timeline overlap with prev: ${prev.start.toISO()}-${prev.end.toISO()}`);
  if (next && overlaps(next, item)) throw new Error(`Timeline overlap with next: ${next.start.toISO()}-${next.end.toISO()}`);

  const out = [...timeline];
  out.splice(idx, 0, item);
  return out;
}

function lowerBound(timeline: Interval[], tMillis: number): number {
  let lo = 0, hi = timeline.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].start.toMillis() < tMillis) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}