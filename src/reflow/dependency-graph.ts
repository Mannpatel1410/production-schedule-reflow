import { WorkOrderDoc } from "./types";

/**
 * Topologically sort work orders by dependency graph (dependsOnWorkOrderIds).
 * Throws a clear error if:
 * - a dependency references a missing work order
 * - a dependency cycle exists
 *
 * Uses Kahn's algorithm (in-degree + queue).
 */
export function topologicalSortWorkOrders(workOrders: WorkOrderDoc[]): WorkOrderDoc[] {
  const byId = new Map<string, WorkOrderDoc>();
  for (const wo of workOrders) byId.set(wo.docId, wo);

  // Build graph: parent -> [children]
  const childrenByParent = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const wo of workOrders) {
    indegree.set(wo.docId, 0);
    childrenByParent.set(wo.docId, []);
  }

  // Fill edges based on dependsOnWorkOrderIds (parent -> child)
  for (const child of workOrders) {
    const parents = child.data.dependsOnWorkOrderIds ?? [];
    for (const parentId of parents) {
      if (!byId.has(parentId)) {
        throw new Error(`Dependency not found: parent=${parentId} for child=${child.docId}`);
      }
      childrenByParent.get(parentId)!.push(child.docId);
      indegree.set(child.docId, (indegree.get(child.docId) ?? 0) + 1);
    }
  }

  // Deterministic queue: sort ids to keep stable output
  const queue: string[] = [];
  for (const [id, deg] of indegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  queue.sort((a, b) => a.localeCompare(b));

  const sortedIds: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    sortedIds.push(id);

    const children = childrenByParent.get(id) ?? [];
    // deterministic: process children in stable order
    children.sort((a, b) => a.localeCompare(b));

    for (const c of children) {
      indegree.set(c, (indegree.get(c) ?? 0) - 1);
      if (indegree.get(c) === 0) {
        queue.push(c);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  // Cycle detection: if not all nodes were processed
  if (sortedIds.length !== workOrders.length) {
    const stuck = [...indegree.entries()]
      .filter(([, deg]) => deg > 0)
      .map(([id]) => id)
      .sort((a, b) => a.localeCompare(b));

    throw new Error(`Dependency cycle detected among: ${stuck.join(", ")}`);
  }

  return sortedIds.map(id => byId.get(id)!);
}