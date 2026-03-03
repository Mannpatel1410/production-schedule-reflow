import { WorkOrderDoc } from "./types";

export function topologicalSortWorkOrders(workOrders: WorkOrderDoc[]): WorkOrderDoc[] {
  const byId = new Map(workOrders.map(w => [w.docId, w]));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const w of workOrders) {
    indeg.set(w.docId, 0);
    adj.set(w.docId, []);
  }

  for (const w of workOrders) {
    for (const p of w.data.dependsOnWorkOrderIds ?? []) {
      if (!byId.has(p)) throw new Error(`Dependency not found: ${p} referenced by ${w.docId}`);
      adj.get(p)!.push(w.docId);
      indeg.set(w.docId, (indeg.get(w.docId) ?? 0) + 1);
    }
  }

  const queue: WorkOrderDoc[] = [];
  for (const w of workOrders) {
    if ((indeg.get(w.docId) ?? 0) === 0) queue.push(w);
  }

  // deterministic: stable sort by original start + id
  queue.sort((a, b) => {
    const sa = a.data.startDate.localeCompare(b.data.startDate);
    if (sa !== 0) return sa;
    return a.docId.localeCompare(b.docId);
  });

  const out: WorkOrderDoc[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    out.push(cur);

    for (const nxtId of adj.get(cur.docId) ?? []) {
      indeg.set(nxtId, (indeg.get(nxtId) ?? 0) - 1);
      if ((indeg.get(nxtId) ?? 0) === 0) queue.push(byId.get(nxtId)!);
    }

    queue.sort((a, b) => {
      const sa = a.data.startDate.localeCompare(b.data.startDate);
      if (sa !== 0) return sa;
      return a.docId.localeCompare(b.docId);
    });
  }

  if (out.length !== workOrders.length) {
    // cycle exists
    const stuck = workOrders.filter(w => !out.some(x => x.docId === w.docId)).map(w => w.docId);
    throw new Error(`Cycle detected in dependencies. Involved work orders: ${stuck.join(", ")}`);
  }
  return out;
}