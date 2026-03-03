import { describe, it, expect } from "vitest";
import { topologicalSortWorkOrders } from "../src/reflow/dependency-graph";

describe("Dependency graph", () => {

  it("detects simple chain", () => {
    const a = { docId: "A", docType: "workOrder", data: { dependsOnWorkOrderIds: [] } } as any;
    const b = { docId: "B", docType: "workOrder", data: { dependsOnWorkOrderIds: ["A"] } } as any;

    const sorted = topologicalSortWorkOrders([a, b]);
    expect(sorted[0].docId).toBe("A");
    expect(sorted[1].docId).toBe("B");
  });

  it("detects cycle", () => {
    const a = { docId: "A", docType: "workOrder", data: { dependsOnWorkOrderIds: ["B"] } } as any;
    const b = { docId: "B", docType: "workOrder", data: { dependsOnWorkOrderIds: ["A"] } } as any;

    expect(() => topologicalSortWorkOrders([a, b])).toThrow();
  });

});