// src/main.ts
import { ReflowService } from "./reflow/reflow.service";
import { workCenters, scenario1_delayCascade, scenario2_shiftSpan, scenario3_maintenanceAndMultiparent, scenario4_workCenterConflict } from "../scenarios/sample-data";

function runScenario(name: string, workOrders: any[]) {
  const service = new ReflowService();
  const result = service.reflow({ workOrders, workCenters });

  console.log("\n==============================================================");
  console.log(`SCENARIO: ${name}`);
  console.log("==============================================================\n");

  console.log("CHANGES:");
  if (result.changes.length === 0) console.log("  (no changes)");
  for (const c of result.changes) {
    console.log(
    `- ${c.workOrderNumber}: ${c.oldStartDate} -> ${c.newStartDate}, ${c.oldEndDate} -> ${c.newEndDate} | deltaEnd=${c.deltaMinutes}m | reasons=${c.reasons.join(",")} | why=${c.why}`
    );
  }

  console.log("\nUPDATED SCHEDULE (sorted by workCenter, start):");
  const sorted = [...result.updatedWorkOrders].sort((a, b) => {
    const wc = a.data.workCenterId.localeCompare(b.data.workCenterId);
    if (wc !== 0) return wc;
    return a.data.startDate.localeCompare(b.data.startDate);
  });

  for (const w of sorted) {
    console.log(
      `  [${w.data.workCenterId}] ${w.data.workOrderNumber}${w.data.isMaintenance ? " (MAINT-FIXED)" : ""}: ${w.data.startDate} -> ${w.data.endDate} (${w.data.durationMinutes}m work)`
    );
  }

  console.log("\nEXPLANATION:");
  console.log(result.explanation);
}

runScenario("1) Delay Cascade", scenario1_delayCascade);
runScenario("2) Shift Spanning", scenario2_shiftSpan);
runScenario("3) Maintenance + Multi-parent + Fixed Maintenance WO", scenario3_maintenanceAndMultiparent);
runScenario("4) Work Center Conflict Resolution", scenario4_workCenterConflict);