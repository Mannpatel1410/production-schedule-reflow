import { describe, it, expect } from "vitest";
import { topologicalSortWorkOrders } from "../src/reflow/dependency-graph";
import { WorkOrderDoc } from "../src/reflow/types";

function wo(id: string, deps: string[]): WorkOrderDoc {
    return {
        docId: id,
        docType: "workOrder",
        data: {
            workOrderNumber: id,
            manufacturingOrderId: "mo-1",
            workCenterId: "wc-1",
            startDate: "2024-08-12T08:00:00Z",
            endDate: "2024-08-12T09:00:00Z",
            durationMinutes: 60,
            isMaintenance: false,
            dependsOnWorkOrderIds: deps,
        },
    };
}

describe("Dependency graph", () => {
    it("sorts a simple chain A -> B", () => {
        const a = wo("A", []);
        const b = wo("B", ["A"]);

        const sorted = topologicalSortWorkOrders([b, a]); // intentionally shuffled
        expect(sorted.map(x => x.docId)).toEqual(["A", "B"]);
    });

    it("throws on 2-node cycle (A <-> B)", () => {
        const a = wo("A", ["B"]);
        const b = wo("B", ["A"]);

        expect(() => topologicalSortWorkOrders([a, b])).toThrow(/cycle/i);
    });

    it("throws on 3-node cycle (A -> B -> C -> A)", () => {
        const a = wo("A", ["C"]);
        const b = wo("B", ["A"]);
        const c = wo("C", ["B"]);

        expect(() => topologicalSortWorkOrders([a, b, c])).toThrow(/cycle/i);
    });

    it("throws on missing dependency id", () => {
    const a = wo("A", ["MISSING"]);
    expect(() => topologicalSortWorkOrders([a])).toThrow(/Dependency not found/i);
    });
});